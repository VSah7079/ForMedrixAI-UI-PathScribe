// src/services/cytology/resolveCytologyQaAggregateReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyQaAggregateReport } from './resolveCytologyQaAggregateReport';
import type { CytologyQaComparisonPair } from './resolveCytologyQaComparisonPairs';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const rank = (id: string, diagnosticRank: number): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, diagnosticRank,
});

// Real, same fixture as classifyCytologyAgreement.test.ts's own
// established CATEGORIES — reused directly rather than diverging.
const CATEGORIES: CytologyCategoryEntry[] = [
  rank('nilm', 0), rank('ascus', 1), rank('lsil', 2), rank('asch', 3),
  rank('hsil', 4), rank('scc', 5),
  { id: 'adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Satisfactory', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1, isUnsatisfactory: false },
  { id: 'adeq-rejected', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Rejected', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2, isUnsatisfactory: true },
];

const review = (id: string, primaryInterpretationId: string): CytologyReviewRecord => ({
  id, specimenId: 'S-' + id, caseId: 'C-' + id, role: 'primary_screen',
  primaryInterpretationId, recordedAt: '2026-01-01T00:00:00.000Z',
  recordedBy: { userId: 'u1', userName: 'Test User' },
} as CytologyReviewRecord);

const pair = (initialInterp: string, followUpInterp: string): CytologyQaComparisonPair => ({
  specimenId: 'S1', caseId: 'C1',
  initial: review('i', initialInterp),
  followUp: review('f', followUpInterp),
});

describe('resolveCytologyQaAggregateReport — real, standard QA metrics', () => {
  it('a genuinely empty comparison set produces zero counts and zero percentages, never NaN or a fabricated 100%', () => {
    const report = resolveCytologyQaAggregateReport([], CATEGORIES);
    expect(report.totalCompared).toBe(0);
    expect(report.overallAgreementPercent).toBe(0);
    expect(report.majorConcordancePercent).toBe(0);
  });

  it('all-exact comparisons produce 100% on both real metrics', () => {
    const pairs = [pair('nilm', 'nilm'), pair('hsil', 'hsil')];
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.exactCount).toBe(2);
    expect(report.overallAgreementPercent).toBe(100);
    expect(report.majorConcordancePercent).toBe(100);
  });

  it('the real, standard distinction between Overall Agreement and Major Concordance: a Minor discrepancy lowers Agreement but NOT Concordance', () => {
    const pairs = [pair('nilm', 'nilm'), pair('ascus', 'lsil')]; // 1 exact, 1 minor
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.overallAgreementPercent).toBe(50); // only 1 of 2 is exact
    expect(report.majorConcordancePercent).toBe(100); // neither is a major discrepancy
  });

  it('a real Major Discrepancy lowers both real metrics, and is correctly sub-classified', () => {
    const pairs = [pair('nilm', 'nilm'), pair('nilm', 'hsil')]; // 1 exact, 1 major (false negative: follow-up found more)
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.majorDiscrepancyCount).toBe(1);
    expect(report.majorFalseNegativeCount).toBe(1);
    expect(report.majorFalsePositiveCount).toBe(0);
    expect(report.overallAgreementPercent).toBe(50);
    expect(report.majorConcordancePercent).toBe(50);
  });

  it('a real, genuine false-positive major discrepancy (initial high-grade, follow-up finds low-grade) is correctly sub-classified separately from false-negative', () => {
    const pairs = [pair('hsil', 'nilm')];
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.majorFalsePositiveCount).toBe(1);
    expect(report.majorFalseNegativeCount).toBe(0);
  });

  it('a real, per direct guidance\'s own CYT-QA-02 specification: False_Negative_Rate is a real, named percentage, not just left implicit in the raw count', () => {
    const pairs = [pair('nilm', 'nilm'), pair('nilm', 'hsil'), pair('lsil', 'lsil')]; // 1 of 3 is a real false negative
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.falseNegativeRatePercent).toBeCloseTo(33.33, 1);
  });

  it('a real, per direct guidance\'s own US-QA-01 specification: diagnostic upgrade/downgrade shifts are tracked across every real comparison, not only major discrepancies — an ASC-US to LSIL shift is a real, genuine upgrade despite being only a Minor discrepancy', () => {
    const pairs = [pair('ascus', 'lsil'), pair('hsil', 'nilm'), pair('nilm', 'nilm')]; // 1 upgrade, 1 downgrade, 1 no shift
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.diagnosticUpgradeCount).toBe(1);
    expect(report.diagnosticDowngradeCount).toBe(1);
    expect(report.comparisons.find(c => c.initialInterpretationId === 'ascus')?.shiftDirection).toBe('upgrade');
    expect(report.comparisons.find(c => c.initialInterpretationId === 'hsil')?.shiftDirection).toBe('downgrade');
    expect(report.comparisons.find(c => c.initialInterpretationId === 'nilm' && c.followUpInterpretationId === 'nilm')?.shiftDirection).toBe('none');
  });

  it('adequacy discrepancy is tracked as a real, genuinely separate metric from the diagnostic level counts', () => {
    const withAdequacyDiscrepancy: CytologyQaComparisonPair = {
      specimenId: 'S1', caseId: 'C1',
      initial: { ...review('i', 'nilm'), adequacySelections: [{ categoryId: 'adeq-satisfactory' }] } as CytologyReviewRecord,
      followUp: { ...review('f', 'nilm'), adequacySelections: [{ categoryId: 'adeq-rejected' }] } as CytologyReviewRecord,
    };
    const report = resolveCytologyQaAggregateReport([withAdequacyDiscrepancy], CATEGORIES);
    expect(report.exactCount).toBe(1); // same diagnostic interpretation
    expect(report.adequacyDiscrepancyCount).toBe(1); // but adequacy disagreed
    expect(report.overallAgreementPercent).toBe(100);
  });

  it('a real, genuine follow-up: the aggregate counts are never the only thing returned — the individual comparisons behind them are always present, with real, human-readable interpretation labels resolved from the given categories', () => {
    const pairs = [pair('nilm', 'hsil')]; // 1 major discrepancy, false negative
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.comparisons).toHaveLength(1);
    expect(report.comparisons[0]).toMatchObject({
      caseId: 'C1', specimenId: 'S1',
      initialInterpretationId: 'nilm', initialInterpretationLabel: 'nilm',
      followUpInterpretationId: 'hsil', followUpInterpretationLabel: 'hsil',
      level: 'major_discrepancy', majorSubtype: 'false_negative',
      adequacyDiscrepancy: false,
    });
    expect(report.comparisons[0].initialReviewerName).toBe('Test User');
  });

  it('a real comparison against a category no longer in the given dictionary falls back to the raw id as its own label, never a crash or a blank display', () => {
    const pairs = [pair('nilm', 'a-deleted-category-id')];
    const report = resolveCytologyQaAggregateReport(pairs, CATEGORIES);
    expect(report.comparisons[0].followUpInterpretationLabel).toBe('a-deleted-category-id');
  });
});
