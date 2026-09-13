// src/services/cytology/resolveCytologyRetrospectiveReviewPoolMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyRetrospectiveReviewPoolMembership } from './resolveCytologyRetrospectiveReviewPoolMembership';

describe('resolveCytologyRetrospectiveReviewPoolMembership — real, matching the established QC pool pattern', () => {
  it('a real specimen with no retrospective review flag at all is never a member', () => {
    expect(resolveCytologyRetrospectiveReviewPoolMembership(undefined)).toBe(false);
  });

  it('a real, freshly-flagged specimen with no recorded outcome yet IS a member — still awaiting review', () => {
    const flag = {
      reason: 'five_year_lookback_on_new_high_grade_diagnosis' as const,
      triggeredByCaseId: 'c1', triggeredBySpecimenId: 'sp1', triggeredAt: '2026-09-06T00:00:00.000Z',
    };
    expect(resolveCytologyRetrospectiveReviewPoolMembership(flag)).toBe(true);
  });

  it('a real specimen whose retrospective review has already been completed (a real, recorded outcome) is correctly cleared, no longer a member', () => {
    const flag = {
      reason: 'five_year_lookback_on_new_high_grade_diagnosis' as const,
      triggeredByCaseId: 'c1', triggeredBySpecimenId: 'sp1', triggeredAt: '2026-09-06T00:00:00.000Z',
      outcome: 'confirmed_negative' as const,
    };
    expect(resolveCytologyRetrospectiveReviewPoolMembership(flag)).toBe(false);
  });
});
