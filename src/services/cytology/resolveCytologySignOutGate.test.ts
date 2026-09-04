// src/services/cytology/resolveCytologySignOutGate.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologySignOutGate } from './resolveCytologySignOutGate';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const cat = (id: string, over: Partial<CytologyCategoryEntry> = {}): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, ...over,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  cat('nilm', { requiresPathologistReview: false }),
  cat('reactive-changes', { requiresPathologistReview: false }),
  cat('ascus', { requiresPathologistReview: true }),
  cat('hsil', { requiresPathologistReview: true }),
  { id: 'adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Satisfactory', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1, isUnsatisfactory: false },
  { id: 'adeq-unsatisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Unsatisfactory', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2, isUnsatisfactory: true },
];

describe('resolveCytologySignOutGate — real, standard CLIA \'88 / CAP sign-out rules matrix', () => {
  it('Negative GYN (NILM): CT independent sign-out is ALLOWED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('Negative GYN with Reactive Changes: CT independent sign-out is ALLOWED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.allowed).toBe(true);
  });

  it('Abnormal GYN (e.g. ASC-US/LSIL/HSIL/AGC/Malignancy): CT sign-out BLOCKED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['requires_pathologist_review']);
  });

  it('Unsatisfactory GYN: CT sign-out BLOCKED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-unsatisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['unsatisfactory_adequacy']);
  });

  it('High-Risk/High-History Patient (NILM): CT sign-out BLOCKED — mandatory QC flagging, even though the interpretation itself is negative', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, true, CATEGORIES, // isFlaggedForQc: true — this is what "high-risk" maps to
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['flagged_for_qc']);
  });

  it('Selected for 10% Pre-Sign-Out Random QC: CT sign-out BLOCKED until QC cleared', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, true, CATEGORIES,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain('flagged_for_qc');
  });

  it('All Non-GYN Cytology (FNA, sputum, urine, body fluids): CT sign-out BLOCKED regardless of interpretation, even a negative one', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false }, // negative/NILM-equivalent interpretation
      false, false, CATEGORIES, // isGynCytology: false
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['non_gyn_specimen']);
  });

  it('multiple real, independent failures are all reported — not just the first one found', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-unsatisfactory'], requiresPathologistReview: true },
      false, true, CATEGORIES,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['non_gyn_specimen', 'requires_pathologist_review', 'unsatisfactory_adequacy', 'flagged_for_qc']);
  });

  it('a real, unresolvable adequacyCategoryId is not itself treated as unsatisfactory — a separate, real data gap this specific check does not own', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['does-not-exist'], requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.blockedReasons).not.toContain('unsatisfactory_adequacy');
  });

  it('a real, multi-select adequacy call blocks if ANY one selection is unsatisfactory, not only when every selection is', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory', 'adeq-unsatisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.blockedReasons).toContain('unsatisfactory_adequacy');
  });

  it('no adequacyCategoryIds at all is not treated as unsatisfactory', () => {
    const result = resolveCytologySignOutGate(
      { requiresPathologistReview: false },
      true, false, CATEGORIES,
    );
    expect(result.blockedReasons).not.toContain('unsatisfactory_adequacy');
  });
});
