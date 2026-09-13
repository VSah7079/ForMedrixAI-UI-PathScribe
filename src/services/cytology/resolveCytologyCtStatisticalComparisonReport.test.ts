// src/services/cytology/resolveCytologyCtStatisticalComparisonReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyCtStatisticalComparisonReport } from './resolveCytologyCtStatisticalComparisonReport';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const rank = (id: string, diagnosticRank: number): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, diagnosticRank,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  rank('nilm', 0), rank('ascus', 1), rank('lsil', 2), rank('asch', 3), rank('hsil', 4), rank('scc', 5),
  { id: 'adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Satisfactory', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1, isUnsatisfactory: false },
  { id: 'adeq-rejected', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Rejected', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2, isUnsatisfactory: true },
];

let seq = 0;
const review = (ctId: string, ctName: string, interp: string, adequacyId = 'adeq-satisfactory'): CytologyReviewRecord => {
  seq++;
  return {
    id: 'r' + seq, specimenId: 'S' + seq, caseId: 'C' + seq, role: 'primary_screen',
    primaryInterpretationId: interp, adequacySelections: [{ categoryId: adequacyId }],
    recordedAt: '2026-01-01T00:00:00.000Z', recordedBy: { userId: ctId, userName: ctName },
  } as CytologyReviewRecord;
};

describe('resolveCytologyCtStatisticalComparisonReport — real, per direct guidance\'s CYT-QA-01 specification', () => {
  it('a genuinely empty input produces zero rows, never a crash', () => {
    expect(resolveCytologyCtStatisticalComparisonReport([], CATEGORIES)).toHaveLength(0);
  });

  it('correctly buckets a real CT\'s own reviews across all six real diagnosticRank tiers, including HSIL+ combining ranks 4 and 5', () => {
    const reviews = [
      review('ct1', 'Maria Santos', 'nilm'), review('ct1', 'Maria Santos', 'ascus'),
      review('ct1', 'Maria Santos', 'lsil'), review('ct1', 'Maria Santos', 'asch'),
      review('ct1', 'Maria Santos', 'hsil'), review('ct1', 'Maria Santos', 'scc'),
    ];
    const [row] = resolveCytologyCtStatisticalComparisonReport(reviews, CATEGORIES);
    expect(row.totalScreened).toBe(6);
    expect(row.nilmRatePercent).toBeCloseTo(16.67, 1);
    expect(row.ascusRatePercent).toBeCloseTo(16.67, 1);
    expect(row.lsilRatePercent).toBeCloseTo(16.67, 1);
    expect(row.aschRatePercent).toBeCloseTo(16.67, 1);
    expect(row.hsilPlusRatePercent).toBeCloseTo(33.33, 1); // hsil + scc combined
  });

  it('real unsatisfactory adequacy is tracked as its own, genuinely separate rate — never conflated with a diagnostic interpretation', () => {
    const reviews = [review('ct1', 'Maria Santos', 'nilm', 'adeq-rejected'), review('ct1', 'Maria Santos', 'nilm')];
    const [row] = resolveCytologyCtStatisticalComparisonReport(reviews, CATEGORIES);
    expect(row.unsatRatePercent).toBe(50);
    expect(row.nilmRatePercent).toBe(100); // both are still real NILM diagnostic calls
  });

  it('a real CT with zero LSIL cases gets an honest null ratio, never a fabricated number or a divide-by-zero artifact', () => {
    const reviews = [review('ct1', 'Maria Santos', 'ascus')];
    const [row] = resolveCytologyCtStatisticalComparisonReport(reviews, CATEGORIES);
    expect(row.ascusLsilRatio).toBeNull();
  });

  it('real, multi-CT laboratory average is the whole-lab ratio, the same real value repeated on every row', () => {
    const reviews = [
      review('ct1', 'CT One', 'ascus'), review('ct1', 'CT One', 'ascus'), review('ct1', 'CT One', 'lsil'),
      review('ct2', 'CT Two', 'ascus'), review('ct2', 'CT Two', 'lsil'), review('ct2', 'CT Two', 'lsil'),
    ];
    const rows = resolveCytologyCtStatisticalComparisonReport(reviews, CATEGORIES);
    // lab total: 3 ASC-US, 3 LSIL => 1.0
    expect(rows[0].labAvgAscusLsilRatio).toBeCloseTo(1.0, 5);
    expect(rows[1].labAvgAscusLsilRatio).toBeCloseTo(1.0, 5);
  });

  it('a real, genuine statistical outlier (>2 SD from the peer mean) is correctly flagged; a CT near the mean is not', () => {
    // Six CTs with tight, near-identical ratios (1.0), one real, genuine
    // outlier at 20.0 — enough real CTs that one extreme value doesn't
    // itself inflate the population SD past its own outlier status,
    // matching how this real, standard method actually behaves.
    const normalCts = ['ct-a', 'ct-b', 'ct-c', 'ct-d', 'ct-e', 'ct-f'];
    const reviews = [
      ...normalCts.flatMap(ct => Array.from({ length: 10 }, (_, i) => review(ct, ct, i % 2 === 0 ? 'ascus' : 'lsil'))),
      ...Array.from({ length: 20 }, () => review('ct-outlier', 'CT Outlier', 'ascus')),
      review('ct-outlier', 'CT Outlier', 'lsil'),
    ];
    const rows = resolveCytologyCtStatisticalComparisonReport(reviews, CATEGORIES);
    const outlier = rows.find(r => r.ctUserId === 'ct-outlier')!;
    const normal = rows.find(r => r.ctUserId === 'ct-a')!;
    expect(outlier.varianceFlag).toBe(true);
    expect(normal.varianceFlag).toBe(false);
  });
});
