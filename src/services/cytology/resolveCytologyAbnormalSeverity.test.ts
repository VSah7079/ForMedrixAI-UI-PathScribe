// src/services/cytology/resolveCytologyAbnormalSeverity.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyAbnormalSeverity } from './resolveCytologyAbnormalSeverity';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';

const cat = (id: string, suggestedAbnormalSeverity?: AbnormalSeverity): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id,
  requiresPathologistReview: suggestedAbnormalSeverity !== undefined, active: true, isSystem: true, sortOrder: 1,
  suggestedAbnormalSeverity,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  cat('nilm-organism', undefined),
  cat('ascus', undefined),      // real, deliberate: ASC-US carries no configured severity
  cat('lsil', 'Abnormal'),
  cat('hsil', 'Critical'),
  cat('carcinoma', 'Malignant'),
];

describe('resolveCytologyAbnormalSeverity', () => {
  it('an empty or undefined selection resolves no severity at all', () => {
    expect(resolveCytologyAbnormalSeverity(undefined, CATEGORIES)).toBeUndefined();
    expect(resolveCytologyAbnormalSeverity([], CATEGORIES)).toBeUndefined();
  });

  it('a category with no configured severity (NILM) resolves undefined, not a fabricated tier', () => {
    expect(resolveCytologyAbnormalSeverity(['nilm-organism'], CATEGORIES)).toBeUndefined();
  });

  it('ASC-US, deliberately left unset in the dictionary, resolves undefined — never guessed at', () => {
    expect(resolveCytologyAbnormalSeverity(['ascus'], CATEGORIES)).toBeUndefined();
  });

  it('a single flagged category resolves its own real severity', () => {
    expect(resolveCytologyAbnormalSeverity(['lsil'], CATEGORIES)).toBe('Abnormal');
    expect(resolveCytologyAbnormalSeverity(['hsil'], CATEGORIES)).toBe('Critical');
    expect(resolveCytologyAbnormalSeverity(['carcinoma'], CATEGORIES)).toBe('Malignant');
  });

  it('multiple co-occurring categories reduce to the single highest real severity', () => {
    expect(resolveCytologyAbnormalSeverity(['lsil', 'hsil'], CATEGORIES)).toBe('Critical');
    expect(resolveCytologyAbnormalSeverity(['hsil', 'carcinoma'], CATEGORIES)).toBe('Malignant');
  });

  it('an unflagged category alongside a flagged one never drags the result down', () => {
    expect(resolveCytologyAbnormalSeverity(['nilm-organism', 'lsil'], CATEGORIES)).toBe('Abnormal');
    expect(resolveCytologyAbnormalSeverity(['ascus', 'hsil'], CATEGORIES)).toBe('Critical');
  });

  it('an id that does not resolve to any real, known category contributes no severity — never a fabricated worst case', () => {
    expect(resolveCytologyAbnormalSeverity(['does-not-exist'], CATEGORIES)).toBeUndefined();
    expect(resolveCytologyAbnormalSeverity(['does-not-exist', 'lsil'], CATEGORIES)).toBe('Abnormal');
  });
});
