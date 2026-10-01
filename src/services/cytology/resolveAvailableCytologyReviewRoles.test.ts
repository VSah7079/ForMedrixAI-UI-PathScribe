// src/services/cytology/resolveAvailableCytologyReviewRoles.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAvailableCytologyReviewRoles, resolveDefaultCytologyReviewRole } from './resolveAvailableCytologyReviewRoles';
import type { CytologyReviewRole } from '@/types/cytology/CytologyReviewRecord';

const review = (role: CytologyReviewRole) => ({ role });

describe('resolveAvailableCytologyReviewRoles', () => {
  it('with no existing reviews, every role including primary_screen is available', () => {
    const roles = resolveAvailableCytologyReviewRoles([]);
    expect(roles).toContain('primary_screen');
    expect(roles).toContain('qc_random_selection');
    expect(roles).toContain('qc_targeted_high_risk');
    expect(roles).toContain('secondary_reviewer');
    expect(roles).toContain('pathologist_review');
    expect(roles.length).toBe(5);
  });

  it('once a real primary_screen exists, it is genuinely no longer available — "there always a single screening event"', () => {
    const roles = resolveAvailableCytologyReviewRoles([review('primary_screen')]);
    expect(roles).not.toContain('primary_screen');
    expect(roles.length).toBe(4);
  });

  it('every secondary/pathologist role stays available even after multiple of the same kind already exist — real, repeatable roles', () => {
    const roles = resolveAvailableCytologyReviewRoles([
      review('primary_screen'), review('qc_random_selection'), review('qc_random_selection'), review('pathologist_review'),
    ]);
    expect(roles).toContain('qc_random_selection');
    expect(roles).toContain('pathologist_review');
    expect(roles).not.toContain('primary_screen');
  });
});

describe('resolveDefaultCytologyReviewRole', () => {
  it('defaults to primary_screen when none exists yet — the common, first-review case', () => {
    expect(resolveDefaultCytologyReviewRole([])).toBe('primary_screen');
  });

  it('returns undefined once a primary_screen exists — never silently guesses a secondary role', () => {
    expect(resolveDefaultCytologyReviewRole([review('primary_screen')])).toBeUndefined();
  });
});
