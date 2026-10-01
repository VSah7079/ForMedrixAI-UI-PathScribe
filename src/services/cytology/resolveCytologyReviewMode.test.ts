// src/services/cytology/resolveCytologyReviewMode.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyReviewMode } from './resolveCytologyReviewMode';

describe('resolveCytologyReviewMode — real, per direct guidance\'s own migration default, with a deliberate role-aware refinement', () => {
  it('an explicit reviewMode on record is always honored, regardless of role', () => {
    expect(resolveCytologyReviewMode({ reviewMode: 'fov_assisted', role: 'primary_screen' })).toBe('fov_assisted');
  });

  it('a real legacy CT review (no reviewMode on file) defaults to primary_manual, per direct guidance\'s own instruction', () => {
    expect(resolveCytologyReviewMode({ reviewMode: undefined, role: 'primary_screen' })).toBe('primary_manual');
    expect(resolveCytologyReviewMode({ reviewMode: undefined, role: 'secondary_reviewer' })).toBe('primary_manual');
    expect(resolveCytologyReviewMode({ reviewMode: undefined, role: 'qc_random_selection' })).toBe('primary_manual');
  });

  it('a real legacy PATHOLOGIST review (no reviewMode on file) defaults to pathologist_review, never primary_manual — the deliberate refinement preventing a real CLIA miscount', () => {
    expect(resolveCytologyReviewMode({ reviewMode: undefined, role: 'pathologist_review' })).toBe('pathologist_review');
  });
});
