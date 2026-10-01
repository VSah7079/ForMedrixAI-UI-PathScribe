// src/services/cytology/resolveCytologyQaReports.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveCytology10PercentRandomRescreeningReport,
  resolveCytologyDirectedHighRiskRescreeningReport,
  resolveCytologyCtVsPathologistCorrelationReport,
} from './resolveCytologyQaReports';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const rank = (id: string, diagnosticRank: number): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, diagnosticRank,
});

const CATEGORIES: CytologyCategoryEntry[] = [rank('nilm', 0), rank('ascus', 1), rank('lsil', 2), rank('hsil', 4)];

const review = (overrides: Partial<CytologyReviewRecord>): CytologyReviewRecord => ({
  id: 'r' + Math.random(), specimenId: 'S1', caseId: 'C1', role: 'primary_screen',
  primaryInterpretationId: 'nilm', recordedAt: '2026-01-01T00:00:00.000Z',
  recordedBy: { userId: 'u1', userName: 'Test User' },
  ...overrides,
} as CytologyReviewRecord);

describe('resolveCytology10PercentRandomRescreeningReport — real, end-to-end', () => {
  it('correctly isolates the real 10% random rescreening population from other real review roles', () => {
    const reviews = [
      review({ specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'nilm' }),
      review({ specimenId: 'S1', role: 'qc_random_selection', primaryInterpretationId: 'nilm' }),
      // A real, unrelated high-risk rescreening pair — must not leak into this report.
      review({ specimenId: 'S2', role: 'primary_screen', primaryInterpretationId: 'hsil' }),
      review({ specimenId: 'S2', role: 'qc_targeted_high_risk', primaryInterpretationId: 'nilm' }),
    ];
    const report = resolveCytology10PercentRandomRescreeningReport(reviews, CATEGORIES);
    expect(report.totalCompared).toBe(1);
    expect(report.exactCount).toBe(1);
  });
});

describe('resolveCytologyDirectedHighRiskRescreeningReport — real, end-to-end', () => {
  it('correctly isolates the real high-risk rescreening population and correctly flags a real major discrepancy within it', () => {
    const reviews = [
      review({ specimenId: 'S2', role: 'primary_screen', primaryInterpretationId: 'hsil' }),
      review({ specimenId: 'S2', role: 'qc_targeted_high_risk', primaryInterpretationId: 'nilm' }),
    ];
    const report = resolveCytologyDirectedHighRiskRescreeningReport(reviews, CATEGORIES);
    expect(report.totalCompared).toBe(1);
    expect(report.majorDiscrepancyCount).toBe(1);
    expect(report.majorFalsePositiveCount).toBe(1);
  });
});

describe('resolveCytologyCtVsPathologistCorrelationReport — real, end-to-end', () => {
  it('correctly isolates the real CT-vs-Pathologist population, separate from the two real QC rescreening populations', () => {
    const reviews = [
      review({ specimenId: 'S3', role: 'primary_screen', primaryInterpretationId: 'ascus' }),
      review({ specimenId: 'S3', role: 'pathologist_review', primaryInterpretationId: 'lsil' }),
      // Real QC reviews on other specimens — must not leak into this report.
      review({ specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'nilm' }),
      review({ specimenId: 'S1', role: 'qc_random_selection', primaryInterpretationId: 'nilm' }),
    ];
    const report = resolveCytologyCtVsPathologistCorrelationReport(reviews, CATEGORIES);
    expect(report.totalCompared).toBe(1);
    expect(report.minorDiscrepancyCount).toBe(1); // ASC-US vs LSIL is Minor
  });
});
