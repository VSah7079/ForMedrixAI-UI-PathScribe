// src/services/cytology/resolveCytologySignOutGate.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologySignOutGate } from './resolveCytologySignOutGate';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { ProviderCredential } from '@/types/staff/ProviderCredential';

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

// Real, per direct guidance's own confirmed matrix — the US is a real
// jurisdiction that does NOT permit the advanced-CT abnormal sign-out
// exception, so every pre-existing test below (none of which are
// about that exception) keeps its exact original real behavior.
const US_JURISDICTION = 'US' as const;

const advancedCredential = (over: Partial<ProviderCredential> = {}): ProviderCredential => ({
  type: 'IBMS_ASD', issuingBody: 'IBMS', jurisdiction: 'GB_EW', effectiveDate: '2024-01-01', ...over,
});

describe('resolveCytologySignOutGate — real, standard CLIA \'88 / CAP sign-out rules matrix', () => {
  it('Negative GYN (NILM): CT independent sign-out is ALLOWED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('Negative GYN with Reactive Changes: CT independent sign-out is ALLOWED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(true);
  });

  it('Abnormal GYN (e.g. ASC-US/LSIL/HSIL/AGC/Malignancy): CT sign-out BLOCKED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['requires_pathologist_review']);
  });

  it('Unsatisfactory GYN: CT sign-out BLOCKED', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-unsatisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['unsatisfactory_adequacy']);
  });

  it('High-Risk/High-History Patient (NILM): CT sign-out BLOCKED — mandatory QC flagging, even though the interpretation itself is negative', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, true, CATEGORIES, US_JURISDICTION, undefined, // isFlaggedForQc: true — this is what "high-risk" maps to
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['flagged_for_qc']);
  });

  it('Selected for 10% Pre-Sign-Out Random QC: CT sign-out BLOCKED until QC cleared', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, true, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain('flagged_for_qc');
  });

  it('All Non-GYN Cytology (FNA, sputum, urine, body fluids): CT sign-out BLOCKED regardless of interpretation, even a negative one', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false }, // negative/NILM-equivalent interpretation
      false, false, CATEGORIES, US_JURISDICTION, undefined, // isGynCytology: false
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['non_gyn_specimen']);
  });

  it('multiple real, independent failures are all reported — not just the first one found', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-unsatisfactory'], requiresPathologistReview: true },
      false, true, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['non_gyn_specimen', 'requires_pathologist_review', 'unsatisfactory_adequacy', 'flagged_for_qc']);
  });

  it('a real, unresolvable adequacyCategoryId is not itself treated as unsatisfactory — a separate, real data gap this specific check does not own', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['does-not-exist'], requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.blockedReasons).not.toContain('unsatisfactory_adequacy');
  });

  it('a real, multi-select adequacy call blocks if ANY one selection is unsatisfactory, not only when every selection is', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory', 'adeq-unsatisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.blockedReasons).toContain('unsatisfactory_adequacy');
  });

  it('no adequacyCategoryIds at all is not treated as unsatisfactory', () => {
    const result = resolveCytologySignOutGate(
      { requiresPathologistReview: false },
      true, false, CATEGORIES, US_JURISDICTION, undefined,
    );
    expect(result.blockedReasons).not.toContain('unsatisfactory_adequacy');
  });
});

describe('resolveCytologySignOutGate — real, confirmed advanced-CT abnormal sign-out exception (EACC/EFCS-confirmed, Sep 2026)', () => {
  it('an abnormal GYN case in the US is still BLOCKED even with a real, valid credential — the US does not permit this exception at all', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, 'US', [advancedCredential({ jurisdiction: 'US', type: 'CYTO_ADVANCED_SPECIALIST' })],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['requires_pathologist_review']);
  });

  it('a real, valid, jurisdiction-matching advanced-CT credential ALLOWS an abnormal GYN sign-out in the UK', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, 'GB_EW', [advancedCredential()], '2026-01-01',
    );
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('the UK jurisdiction alone, with no real credential at all, still BLOCKS an abnormal GYN sign-out', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, 'GB_EW', undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['requires_pathologist_review']);
  });

  it('a real, lapsed (expired) credential no longer grants the exception, even in a genuinely permitted jurisdiction', () => {
    const lapsed = advancedCredential({ expirationDate: '2025-06-01' });
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, 'GB_EW', [lapsed], '2026-01-01',
    );
    expect(result.allowed).toBe(false);
  });

  it('the credential exception never overrides the real, separate non-GYN, unsatisfactory-adequacy, or QC-flagged checks', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-unsatisfactory'], requiresPathologistReview: true },
      false, true, CATEGORIES, 'GB_EW', [advancedCredential()], '2026-01-01',
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['non_gyn_specimen', 'requires_pathologist_review', 'unsatisfactory_adequacy', 'flagged_for_qc']);
  });

  it('a real credential issued for a different jurisdiction than the case\'s own does not grant the exception', () => {
    const dutchCredential = advancedCredential({ jurisdiction: 'NL', type: 'NL_KCA_ADVANCED' });
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: true },
      true, false, CATEGORIES, 'GB_EW', [dutchCredential], '2026-01-01',
    );
    expect(result.allowed).toBe(false);
  });
});

describe('resolveCytologySignOutGate — real, confirmed synoptic translation validation enforcement (Sep 2026)', () => {
  it('a real case with no synoptic translation check supplied at all is never blocked by it', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, 'US', undefined,
    );
    expect(result.allowed).toBe(true);
  });

  it('real, unvalidated terms with no real, current acknowledgment genuinely block sign-out', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, 'US', undefined, undefined,
      { hasUnvalidatedTerms: true, hasCurrentAcknowledgment: false },
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toEqual(['unvalidated_synoptic_translation']);
  });

  it('real, unvalidated terms WITH a real, current acknowledgment never block sign-out', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, 'US', undefined, undefined,
      { hasUnvalidatedTerms: true, hasCurrentAcknowledgment: true },
    );
    expect(result.allowed).toBe(true);
  });

  it('no real unvalidated terms at all never blocks sign-out, regardless of acknowledgment state', () => {
    const result = resolveCytologySignOutGate(
      { adequacyCategoryIds: ['adeq-satisfactory'], requiresPathologistReview: false },
      true, false, CATEGORIES, 'US', undefined, undefined,
      { hasUnvalidatedTerms: false, hasCurrentAcknowledgment: false },
    );
    expect(result.allowed).toBe(true);
  });
});
