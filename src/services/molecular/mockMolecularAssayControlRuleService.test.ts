// src/services/molecular/mockMolecularAssayControlRuleService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockMolecularAssayControlRuleService — real, per §3.2 Dynamic Control Rules/Position Enforcements', () => {
  it('getAll returns the real, seeded rule matching the given specification\'s own §4.1 worked example', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].assayCode).toBe('st-hpv-highrisk-screen');
      expect(res.data[0].requiredControls).toHaveLength(2);
    }
  });

  it('getByAssayCode correctly finds the real, matching rule', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.getByAssayCode('st-hpv-highrisk-screen');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.assayCode).toBe('st-hpv-highrisk-screen');
  });

  it('getByAssayCode correctly returns an honest null for a real assay with no defined rule', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.getByAssayCode('CT_NG_PCR');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });

  it('create correctly builds a new real rule', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.create({
      assayCode: 'CT_NG_PCR',
      requiredControls: [{ sampleType: 'CONTROL_NTC', positionMode: 'random' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.assayCode).toBe('CT_NG_PCR');
  });

  it('create correctly refuses a real, duplicate rule for an assay that already has one', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.create({ assayCode: 'st-hpv-highrisk-screen', requiredControls: [] });
    expect(res.ok).toBe(false);
  });

  it('update correctly modifies a real, existing rule', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    const res = await mockMolecularAssayControlRuleService.update('rule-001', { requiredControls: [{ sampleType: 'CONTROL_NTC', positionMode: 'random' }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.requiredControls).toHaveLength(1);
  });

  it('delete correctly removes a real rule', async () => {
    const { mockMolecularAssayControlRuleService } = await import('./mockMolecularAssayControlRuleService');
    await mockMolecularAssayControlRuleService.delete('rule-001');
    const res = await mockMolecularAssayControlRuleService.getByAssayCode('st-hpv-highrisk-screen');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });
});
