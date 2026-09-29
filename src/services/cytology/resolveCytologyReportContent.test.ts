// src/services/cytology/resolveCytologyReportContent.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyReportContent } from './resolveCytologyReportContent';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const cat = (id: string, description: string, over: Partial<CytologyCategoryEntry> = {}): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, description, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, ...over,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  cat('nilm', 'Negative for Intraepithelial Lesion or Malignancy (NILM).', { section: 'general_categorization' }),
  cat('adeq-satisfactory', 'Satisfactory for evaluation.', { section: 'adequacy' }),
  cat('ascus', 'Atypical squamous cells of undetermined significance (ASC-US).'),
  cat('trichomonas', 'Trichomonas vaginalis organisms identified.'),
  cat('rec-repeat-12mo', 'Repeat cytology in 12 months.', { section: 'recommendation' }),
];

const PATIENT = { name: 'Angela Torres', dateOfBirth: '1988-04-02', mrn: '100502', lastMenstrualPeriod: '2026-08-15' };
const ORDER = { accessionNumber: 'S26-5002-CYT-001', orderingProvider: 'Dr. Amanda Chen' };
const SPECIMEN = {
  typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', collectedAt: '2026-09-01T00:00:00.000Z', receivedAt: '2026-09-02T00:00:00.000Z',
  preparationMethod: 'Liquid-Based' as const, computerAssistedScreening: { used: true, system: 'ThinPrep Imaging System' },
  hpvResult: 'Negative', educationalNotes: 'Consider HPV vaccination per current guidelines.',
};

describe('resolveCytologyReportContent — the real, complete, 7-section standard template', () => {
  it('assembles every real section from the given, real inputs', () => {
    const content = resolveCytologyReportContent(
      {
        adequacySelections: [{ categoryId: 'adeq-satisfactory' }],
        generalCategorizationId: 'nilm',
        primaryInterpretationId: 'ascus',
        requiresPathologistReview: true,
        primaryInterpretationComment: 'correlate with prior history',
        additionalInterpretations: [{ categoryId: 'trichomonas' }],
        recommendations: [{ categoryId: 'rec-repeat-12mo' }],
      },
      CATEGORIES, PATIENT, ORDER, SPECIMEN,
      { name: 'Jane CT' }, { name: 'Dr. Second', isPathologist: true }, '2026-09-03T10:00:00.000Z',
    );
    // §1 Administrative & Patient Identifiers
    expect(content.patientName).toBe('Angela Torres');
    expect(content.patientMrn).toBe('100502');
    expect(content.accessionNumber).toBe('S26-5002-CYT-001');
    expect(content.orderingProvider).toBe('Dr. Amanda Chen');
    expect(content.lastMenstrualPeriod).toBe('2026-08-15');
    // §2 Specimen Type
    expect(content.specimenTypeDescription).toBe('Cervical/Vaginal Pap Smear, liquid-based');
    expect(content.preparationMethod).toBe('Liquid-Based');
    // §3 Adequacy
    expect(content.specimenAdequacy).toEqual(['Satisfactory for evaluation.']);
    // §4 General Categorization
    expect(content.generalCategorization).toBe('Negative for Intraepithelial Lesion or Malignancy (NILM).');
    // §5 Interpretation
    expect(content.primaryInterpretation).toBe('Atypical squamous cells of undetermined significance (ASC-US). (correlate with prior history)');
    expect(content.additionalInterpretations).toEqual(['Trichomonas vaginalis organisms identified.']);
    // §6 Adjunctive Testing
    expect(content.hpvResult).toBe('Negative');
    expect(content.computerAssistedScreening).toEqual({ used: true, system: 'ThinPrep Imaging System' });
    // §7 Educational Notes, Comments, Sign-Off
    expect(content.recommendations).toEqual(['Repeat cytology in 12 months.']);
    expect(content.educationalNotes).toBe('Consider HPV vaccination per current guidelines.');
    expect(content.screenedBy).toEqual({ name: 'Jane CT' });
    expect(content.signedBy).toEqual({ name: 'Dr. Second', isPathologist: true });
    expect(content.signedAt).toBe('2026-09-03T10:00:00.000Z');
  });

  it('real, per PS-277 §1.2.2 — an omitted printContext leaves printBranding/componentSplitBillingType genuinely undefined, never a default object', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.printBranding).toBeUndefined();
    expect(content.componentSplitBillingType).toBeUndefined();
  });

  it('real, per PS-277 §1.2.2 — a real printContext is passed straight through unchanged, never re-resolved by this pure assembly function', () => {
    const printBranding = { facilityName: 'Real Lab', address: '1 Test St', directorName: 'Dr. Signer' };
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
      { printBranding, componentSplitBillingType: 'TC' },
    );
    expect(content.printBranding).toBe(printBranding);
    expect(content.componentSplitBillingType).toBe('TC');
  });

  it('a real, minimal case (primary interpretation only, no screener on record) still assembles without throwing', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.primaryInterpretation).toBe('Negative for Intraepithelial Lesion or Malignancy (NILM).');
    expect(content.screenedBy).toBeUndefined();
    expect(content.hpvResult).toBeUndefined();
    expect(content.computerAssistedScreening).toBeUndefined();
  });

  it('real, per-selection comments are correctly attached only to their own line, not bled across sections', () => {
    const content = resolveCytologyReportContent(
      {
        adequacySelections: [{ categoryId: 'adeq-satisfactory', comment: 'endocervical component present' }],
        primaryInterpretationId: 'nilm',
        requiresPathologistReview: false,
      },
      CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.specimenAdequacy).toEqual(['Satisfactory for evaluation. (endocervical component present)']);
    expect(content.primaryInterpretation).toBe('Negative for Intraepithelial Lesion or Malignancy (NILM).');
  });

  it('a real Positive HPV result with genotype detail is formatted with the specific genotype(s), matching real co-testing dual-result reporting', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', hpvResult: 'Positive', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false } },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.hpvResult).toBe('Positive (HPV 16)');
  });

  it('a real Negative HPV result is reported plainly, with no genotype text even if stale genotype detail exists', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', hpvResult: 'Negative', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false } },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.hpvResult).toBe('Negative');
  });

  it('a real, per direct guidance\'s own South Korea information: ASC-US reflex triage is represented as real clinical context on the report', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', hpvResult: 'Positive', hpvOrderReason: 'ascus_reflex' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.hpvResult).toBe('Positive (ASC-US reflex triage)');
  });

  it('genotype detail and order reason combine cleanly when both are present', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', hpvResult: 'Positive', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false }, hpvOrderReason: 'post_treatment_surveillance' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.hpvResult).toBe('Positive (HPV 16, post-treatment surveillance)');
  });

  it('a real, routine co_test order reason adds no real information and is never appended', () => {
    const content = resolveCytologyReportContent(
      { primaryInterpretationId: 'nilm', requiresPathologistReview: false }, CATEGORIES, { name: 'Linda Chen' }, { accessionNumber: 'S26-5003-CYT-001' },
      { typeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', hpvResult: 'Negative', hpvOrderReason: 'co_test' },
      undefined, { name: 'Jane CT', isPathologist: false }, '2026-09-03T00:00:00.000Z',
    );
    expect(content.hpvResult).toBe('Negative');
  });
});
