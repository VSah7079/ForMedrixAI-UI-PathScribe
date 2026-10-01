// src/services/cytology/resolveCytologyPendingMandatoryQc.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyPendingMandatoryQc } from './resolveCytologyPendingMandatoryQc';

import type { CytologyHighRiskResult } from './resolveCytologyHighRiskStatus';

const NOT_HIGH_RISK: CytologyHighRiskResult = { isHighRisk: false, triggers: [] };
const HIGH_RISK: CytologyHighRiskResult = { isHighRisk: true, triggers: ['immunocompromised'] };

describe('resolveCytologyPendingMandatoryQc — real "Impact on Sign-Out Workflow"', () => {
  it('a case that is not high-risk is never pending mandatory QC, regardless of review history', () => {
    expect(resolveCytologyPendingMandatoryQc(NOT_HIGH_RISK, [])).toBe(false);
    expect(resolveCytologyPendingMandatoryQc(NOT_HIGH_RISK, [{ role: 'primary_screen' }])).toBe(false);
  });

  it('a real high-risk case with no reviews yet at all is pending', () => {
    expect(resolveCytologyPendingMandatoryQc(HIGH_RISK, [])).toBe(true);
  });

  it('a real high-risk case with only a primary_screen recorded is still pending — the primary screen alone never clears the mandatory queue', () => {
    expect(resolveCytologyPendingMandatoryQc(HIGH_RISK, [{ role: 'primary_screen' }])).toBe(true);
  });

  it('a real high-risk case with only a routine random-selection QC review is still pending — that is a genuinely different real trigger, not the targeted-high-risk one this case actually needs', () => {
    expect(resolveCytologyPendingMandatoryQc(HIGH_RISK, [{ role: 'primary_screen' }, { role: 'qc_random_selection' }])).toBe(true);
  });

  it('a real qc_targeted_high_risk review genuinely clears the mandatory queue', () => {
    expect(resolveCytologyPendingMandatoryQc(HIGH_RISK, [{ role: 'primary_screen' }, { role: 'qc_targeted_high_risk' }])).toBe(false);
  });
});
