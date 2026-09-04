// src/services/cytology/resolveCytologyReviewerRole.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyReviewerRole } from './resolveCytologyReviewerRole';

const FLAG_RANDOM = { reason: 'random_selection' as const, flaggedBy: 'PATH-001', flaggedByName: 'Pete Nimmo', flaggedAt: '2026-09-01T00:00:00.000Z' };
const FLAG_TARGETED = { reason: 'targeted_high_risk' as const, flaggedBy: 'PATH-001', flaggedByName: 'Pete Nimmo', flaggedAt: '2026-09-01T00:00:00.000Z' };

describe('resolveCytologyReviewerRole — real, per direct guidance\'s own default-role rule', () => {
  it('no reviews on record, not a Pathologist: Primary Screener', () => {
    expect(resolveCytologyReviewerRole([], false)).toBe('primary_screen');
  });

  it('a review already exists, not a Pathologist: Secondary Reviewer', () => {
    expect(resolveCytologyReviewerRole([{ role: 'primary_screen' }], false)).toBe('secondary_reviewer');
  });

  it('the current user is a Pathologist: Pathologist Review, regardless of existing reviews', () => {
    expect(resolveCytologyReviewerRole([], true)).toBe('pathologist_review');
    expect(resolveCytologyReviewerRole([{ role: 'primary_screen' }], true)).toBe('pathologist_review');
  });

  it('a Pathologist reviewing first is still Pathologist Review, never Primary Screener — that role is specifically a Cytotechnologist\'s own', () => {
    expect(resolveCytologyReviewerRole([], true)).toBe('pathologist_review');
  });

  it('a real, pending QC flag on the case defaults a non-Pathologist\'s follow-up review to the matching QC role, not plain Secondary Reviewer', () => {
    const reviews = [{ role: 'primary_screen' as const }];
    expect(resolveCytologyReviewerRole(reviews, false, FLAG_RANDOM)).toBe('qc_random_selection');
    expect(resolveCytologyReviewerRole(reviews, false, FLAG_TARGETED)).toBe('qc_targeted_high_risk');
  });

  it('a QC flag that has already been cleared by a matching review no longer overrides the default — falls back to Secondary Reviewer', () => {
    const reviews = [{ role: 'primary_screen' as const }, { role: 'qc_random_selection' as const }];
    expect(resolveCytologyReviewerRole(reviews, false, FLAG_RANDOM)).toBe('secondary_reviewer');
  });

  it('a Pathologist still defaults to Pathologist Review even when a QC flag is pending — the QC-role override only applies to non-Pathologists', () => {
    const reviews = [{ role: 'primary_screen' as const }];
    expect(resolveCytologyReviewerRole(reviews, true, FLAG_TARGETED)).toBe('pathologist_review');
  });

  it('no qcFlag at all behaves exactly like the plain, three-outcome rule', () => {
    expect(resolveCytologyReviewerRole([], false, undefined)).toBe('primary_screen');
    expect(resolveCytologyReviewerRole([{ role: 'primary_screen' }], false, undefined)).toBe('secondary_reviewer');
  });
});
