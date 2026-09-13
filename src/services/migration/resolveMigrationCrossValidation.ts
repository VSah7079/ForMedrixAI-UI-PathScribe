// src/services/migration/resolveMigrationCrossValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "cross-validation reporting" ask — a real, pure
// reconciliation check: does what a migration job actually processed
// match what the source system itself claimed it was sending? A
// classic, real ETL integrity check (a source system claiming 5,000
// records but only 4,998 actually arriving is a real, historically
// common failure mode — a silent network drop, a truncated export
// file — not a hypothetical).
// ─────────────────────────────────────────────────────────────────────────────

import type { MigrationJob } from './IMigrationJobService';

export type MigrationCrossValidationStatus = 'reconciled' | 'discrepancy' | 'no_claimed_count';

export interface MigrationCrossValidationResult {
  status: MigrationCrossValidationStatus;
  claimedCount?: number;
  processedCount: number;
  missingCount?: number;
}

export function resolveMigrationCrossValidation(job: MigrationJob): MigrationCrossValidationResult {
  // Real, honest outcome: a job with no real, trustworthy claimed
  // count from the source system has nothing to reconcile against —
  // this is a genuinely different condition from a real discrepancy,
  // never conflated with one.
  if (job.claimedSourceRecordCount === undefined) {
    return { status: 'no_claimed_count', processedCount: job.totalRecordsProcessed };
  }

  const missingCount = job.claimedSourceRecordCount - job.totalRecordsProcessed;
  if (missingCount !== 0) {
    return {
      status: 'discrepancy',
      claimedCount: job.claimedSourceRecordCount,
      processedCount: job.totalRecordsProcessed,
      missingCount,
    };
  }

  return { status: 'reconciled', claimedCount: job.claimedSourceRecordCount, processedCount: job.totalRecordsProcessed, missingCount: 0 };
}
