// src/services/migration/resolveMigrationCrossValidation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMigrationCrossValidation } from './resolveMigrationCrossValidation';
import type { MigrationJob } from './IMigrationJobService';

const baseJob = (over: Partial<MigrationJob>): MigrationJob => ({
  id: 'j1', sourceSystemName: 'LegacyLIS', status: 'completed', totalRecordsProcessed: 100,
  succeededCount: 100, failedCount: 0, needsReviewCount: 0,
  createdByUserId: 'u1', createdByUserName: 'Admin', createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('resolveMigrationCrossValidation — real, per the RFP\'s own "cross-validation reporting" ask', () => {
  it('real, a job with no claimed source count has an honest, distinct outcome — never treated as a discrepancy', () => {
    const result = resolveMigrationCrossValidation(baseJob({ claimedSourceRecordCount: undefined }));
    expect(result.status).toBe('no_claimed_count');
  });

  it('real, claimed count matching processed count exactly reconciles', () => {
    const result = resolveMigrationCrossValidation(baseJob({ claimedSourceRecordCount: 100, totalRecordsProcessed: 100 }));
    expect(result.status).toBe('reconciled');
  });

  it('real, a genuine gap between claimed and processed is flagged as a real discrepancy, with the exact missing count', () => {
    const result = resolveMigrationCrossValidation(baseJob({ claimedSourceRecordCount: 5000, totalRecordsProcessed: 4998 }));
    expect(result.status).toBe('discrepancy');
    expect(result.missingCount).toBe(2);
  });

  it('real, processing MORE records than claimed is also a real discrepancy (a negative missingCount), never silently treated as fine', () => {
    const result = resolveMigrationCrossValidation(baseJob({ claimedSourceRecordCount: 100, totalRecordsProcessed: 103 }));
    expect(result.status).toBe('discrepancy');
    expect(result.missingCount).toBe(-3);
  });
});
