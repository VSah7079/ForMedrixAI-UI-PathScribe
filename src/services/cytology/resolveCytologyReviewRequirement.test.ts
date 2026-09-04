// src/services/cytology/resolveCytologyReviewRequirement.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyReviewRequirement } from './resolveCytologyReviewRequirement';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const cat = (id: string, requiresPathologistReview: boolean): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview, active: true, isSystem: true, sortOrder: 1,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  cat('nilm-organism', false),
  cat('ascus', true),
  cat('hsil', true),
];

describe('resolveCytologyReviewRequirement', () => {
  it('an empty or undefined selection never requires review', () => {
    expect(resolveCytologyReviewRequirement(undefined, CATEGORIES)).toBe(false);
    expect(resolveCytologyReviewRequirement([], CATEGORIES)).toBe(false);
  });

  it('a single, real category that never requires review returns false', () => {
    expect(resolveCytologyReviewRequirement(['nilm-organism'], CATEGORIES)).toBe(false);
  });

  it('a single, real category that requires review returns true', () => {
    expect(resolveCytologyReviewRequirement(['ascus'], CATEGORIES)).toBe(true);
  });

  it('one genuinely co-occurring category requiring review is enough — even alongside one that does not', () => {
    expect(resolveCytologyReviewRequirement(['nilm-organism', 'ascus'], CATEGORIES)).toBe(true);
  });

  it('multiple co-occurring categories that all require review still returns true, not double-counted or anything unexpected', () => {
    expect(resolveCytologyReviewRequirement(['ascus', 'hsil'], CATEGORIES)).toBe(true);
  });

  it('an id that does not resolve to any real, known category is treated as requiring review — the safe default, never silently negative', () => {
    expect(resolveCytologyReviewRequirement(['does-not-exist'], CATEGORIES)).toBe(true);
  });
});
