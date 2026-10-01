import { describe, it, expect } from 'vitest';
import { calculateMolecularUnits } from './calculateMolecularUnits';
import type { CptMappingRule } from '@/types/billing/MolecularBillingRule';

// Real, per direct guidance's own worked table - Anatomic FISH, Manual
// Direct Count scoring method.
const manualFishRule: CptMappingRule = {
  billingModel: 'BASE_ADDON',
  baseCptCode: 'FISH-MANUAL-BASE', // 88368
  addOnCptCode: 'FISH-MANUAL-ADDL', // 88369
  multiplexCptCode: 'FISH-MANUAL-MULTIPLEX', // 88377
};

const cytoFishRule: CptMappingRule = {
  billingModel: 'PER_UNIT_MULTIPLIER',
  perUnitCptCode: 'FISH-CYTO-PROBE', // 88271
};

const ngsPanelRule: CptMappingRule = {
  billingModel: 'FLAT_FEE',
  flatFeeCptCode: 'NGS-PANEL-5-50', // 81445
};

describe('calculateMolecularUnits - real, direct verification against the worked spec', () => {
  it('1 probe (single-color break-apart): 1 unit of base code only', () => {
    const result = calculateMolecularUnits(manualFishRule, 1);
    expect(result).toEqual([{ billingCode: 'FISH-MANUAL-BASE', units: 1 }]);
  });

  it('2 probes (HER2/CEP17 dual probe): 1 unit base + 1 unit add-on', () => {
    const result = calculateMolecularUnits(manualFishRule, 2);
    expect(result).toEqual([
      { billingCode: 'FISH-MANUAL-BASE', units: 1 },
      { billingCode: 'FISH-MANUAL-ADDL', units: 1 },
    ]);
  });

  it('3+ probes: 1 unit of the multiplex code only, not base+addon stacked', () => {
    const result = calculateMolecularUnits(manualFishRule, 3);
    expect(result).toEqual([{ billingCode: 'FISH-MANUAL-MULTIPLEX', units: 1 }]);
  });

  it('4 probes (a real lymphoma panel size): still just 1 unit of the multiplex code', () => {
    const result = calculateMolecularUnits(manualFishRule, 4);
    expect(result).toEqual([{ billingCode: 'FISH-MANUAL-MULTIPLEX', units: 1 }]);
  });

  it('cytogenetic FISH: N probes = N units of the one real per-unit code', () => {
    expect(calculateMolecularUnits(cytoFishRule, 4)).toEqual([{ billingCode: 'FISH-CYTO-PROBE', units: 4 }]);
    expect(calculateMolecularUnits(cytoFishRule, 1)).toEqual([{ billingCode: 'FISH-CYTO-PROBE', units: 1 }]);
  });

  it('flat fee (NGS panel): always exactly 1 unit, regardless of real gene count within the tier', () => {
    expect(calculateMolecularUnits(ngsPanelRule, 12)).toEqual([{ billingCode: 'NGS-PANEL-5-50', units: 1 }]);
    expect(calculateMolecularUnits(ngsPanelRule, 50)).toEqual([{ billingCode: 'NGS-PANEL-5-50', units: 1 }]);
  });

  it('a configurable multiplex threshold overrides the default of 3', () => {
    const customRule: CptMappingRule = { ...manualFishRule, multiplexThreshold: 5 };
    // 3 and 4 stay base+addon under a threshold of 5
    expect(calculateMolecularUnits(customRule, 4)).toEqual([
      { billingCode: 'FISH-MANUAL-BASE', units: 1 },
      { billingCode: 'FISH-MANUAL-ADDL', units: 3 },
    ]);
    expect(calculateMolecularUnits(customRule, 5)).toEqual([{ billingCode: 'FISH-MANUAL-MULTIPLEX', units: 1 }]);
  });

  it('zero or negative target count produces no real charges at all', () => {
    expect(calculateMolecularUnits(manualFishRule, 0)).toEqual([]);
    expect(calculateMolecularUnits(manualFishRule, -1)).toEqual([]);
  });

  it('a rule missing its own required billingCode for the resolved path produces no charges, never a fabricated one', () => {
    const incomplete: CptMappingRule = { billingModel: 'PER_UNIT_MULTIPLIER' };
    expect(calculateMolecularUnits(incomplete, 3)).toEqual([]);
  });
});

describe('calculateMolecularUnits - end-to-end against the real, seeded StainType dictionary entries', () => {
  it('the real HER2 FISH dictionary entry (2 default targets) resolves to base+addon, matching its own defaultTargets.length', async () => {
    const { mockStainTypeService } = await import('../stains/mockStainTypeService');
    const res = await mockStainTypeService.getAll();
    expect(res.ok).toBe(true);
    const her2 = res.ok ? res.data.find(s => s.id === 'st-her2-fish') : undefined;
    expect(her2).toBeDefined();
    expect(her2!.billingRule).toBeDefined();
    expect(her2!.defaultTargets).toHaveLength(2);
    const result = calculateMolecularUnits(her2!.billingRule!, her2!.defaultTargets!.length);
    expect(result).toEqual([
      { billingCode: 'FISH-MANUAL-BASE', units: 1 },
      { billingCode: 'FISH-MANUAL-ADDL', units: 1 },
    ]);
  });

  it('the real Lymphoma FISH Panel dictionary entry (4 default targets) resolves to the multiplex code, matching its own defaultTargets.length', async () => {
    const { mockStainTypeService } = await import('../stains/mockStainTypeService');
    const res = await mockStainTypeService.getAll();
    const panel = res.ok ? res.data.find(s => s.id === 'st-lymphoma-fish-panel') : undefined;
    expect(panel).toBeDefined();
    expect(panel!.defaultTargets).toHaveLength(4);
    const result = calculateMolecularUnits(panel!.billingRule!, panel!.defaultTargets!.length);
    expect(result).toEqual([{ billingCode: 'FISH-MANUAL-MULTIPLEX', units: 1 }]);
  });

  it('if a real order removes one target from the Lymphoma panel default (4 -> 3), it still resolves to the multiplex code, not base+addon', () => {
    const rule = { billingModel: 'BASE_ADDON' as const, baseCptCode: 'FISH-MANUAL-BASE', addOnCptCode: 'FISH-MANUAL-ADDL', multiplexCptCode: 'FISH-MANUAL-MULTIPLEX' };
    expect(calculateMolecularUnits(rule, 3)).toEqual([{ billingCode: 'FISH-MANUAL-MULTIPLEX', units: 1 }]);
  });

  it('if a real order reduces the Lymphoma panel to just 2 targets (a partial panel), it correctly drops to base+addon', () => {
    const rule = { billingModel: 'BASE_ADDON' as const, baseCptCode: 'FISH-MANUAL-BASE', addOnCptCode: 'FISH-MANUAL-ADDL', multiplexCptCode: 'FISH-MANUAL-MULTIPLEX' };
    expect(calculateMolecularUnits(rule, 2)).toEqual([
      { billingCode: 'FISH-MANUAL-BASE', units: 1 },
      { billingCode: 'FISH-MANUAL-ADDL', units: 1 },
    ]);
  });
});
