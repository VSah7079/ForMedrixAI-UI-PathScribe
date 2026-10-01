// src/services/molecular/resolveMolecularControlRequirementValidation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularControlRequirementValidation } from './resolveMolecularControlRequirementValidation';
import type { MolecularWell } from './IMolecularBatchService';
import type { MolecularAssayControlRule } from './IMolecularAssayControlRuleService';

const RULE: MolecularAssayControlRule = {
  id: 'rule-1', assayCode: 'HPV_HR_PCR', createdAt: '2026-09-06T00:00:00.000Z',
  requiredControls: [
    { sampleType: 'CONTROL_NTC', positionMode: 'fixed', fixedWellPosition: 'A01' },
    { sampleType: 'CONTROL_PTC_HIGH', positionMode: 'fixed', fixedWellPosition: 'A02' },
  ],
};

function well(wellPosition: string, sampleType: MolecularWell['sampleType']): MolecularWell {
  return { wellPosition, sampleType };
}

describe('resolveMolecularControlRequirementValidation — real, per §3.2 Dynamic Control Rules/Position Enforcements', () => {
  it('real, an assay with no defined rule has nothing to satisfy — honest "absence means no constraint," not an automatic failure', () => {
    const result = resolveMolecularControlRequirementValidation('CT_NG_PCR', [], []);
    expect(result.satisfied).toBe(true);
  });

  it('real, a batch with both required controls at their exact real, fixed positions correctly satisfies the rule', () => {
    const wells = [well('A01', 'CONTROL_NTC'), well('A02', 'CONTROL_PTC_HIGH'), well('A03', 'PATIENT_SPECIMEN')];
    const result = resolveMolecularControlRequirementValidation('HPV_HR_PCR', wells, [RULE]);
    expect(result.satisfied).toBe(true);
  });

  it('real, a genuinely missing required control is correctly flagged, never silently allowed', () => {
    const wells = [well('A02', 'CONTROL_PTC_HIGH')];
    const result = resolveMolecularControlRequirementValidation('HPV_HR_PCR', wells, [RULE]);
    expect(result.satisfied).toBe(false);
    expect(result.violations.some(v => v.sampleType === 'CONTROL_NTC' && v.reason === 'missing')).toBe(true);
  });

  it('real, a required control present but at the WRONG fixed position is correctly flagged — presence alone is not enough for a fixed-position rule', () => {
    const wells = [well('B01', 'CONTROL_NTC'), well('A02', 'CONTROL_PTC_HIGH')];
    const result = resolveMolecularControlRequirementValidation('HPV_HR_PCR', wells, [RULE]);
    expect(result.satisfied).toBe(false);
    const violation = result.violations.find(v => v.sampleType === 'CONTROL_NTC');
    expect(violation?.reason).toBe('wrong_fixed_position');
    expect(violation?.expectedPosition).toBe('A01');
    expect(violation?.actualPosition).toBe('B01');
  });

  it('real, a "random" positionMode control only requires presence — never checked against any specific well', () => {
    const randomRule: MolecularAssayControlRule = {
      id: 'rule-2', assayCode: 'CT_NG_PCR', createdAt: '2026-09-06T00:00:00.000Z',
      requiredControls: [{ sampleType: 'CONTROL_NTC', positionMode: 'random' }],
    };
    // Real, deliberately NOT at any particular position — this must
    // still satisfy a real 'random' rule.
    const wells = [well('D07', 'CONTROL_NTC')];
    const result = resolveMolecularControlRequirementValidation('CT_NG_PCR', wells, [randomRule]);
    expect(result.satisfied).toBe(true);
  });

  it('real, multiple violations are all reported together, never truncated to just the first', () => {
    const result = resolveMolecularControlRequirementValidation('HPV_HR_PCR', [], [RULE]);
    expect(result.violations).toHaveLength(2);
  });
});
