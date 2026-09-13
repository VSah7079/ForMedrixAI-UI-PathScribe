// src/services/migration/IMigrationRecordResultService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per-record outcome tracking for a MigrationJob — the real,
// auditable detail behind a job's own aggregate counts (totalRecordsProcessed/
// succeededCount/failedCount/needsReviewCount), so a real admin reviewing
// a job can see exactly WHICH source records failed or need review,
// not just how many.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type MigrationRecordOutcome = 'succeeded' | 'failed' | 'needs_review';

export interface MigrationRecordResult {
  id: string;
  migrationJobId: string;
  sourceRecordId: string;
  targetCaseId?: string;
  outcome: MigrationRecordOutcome;
  /** Set only when outcome === 'needs_review' — the real MPI
   *  ambiguous-match outcome from resolveOrCreatePatient()
   *  (services/patients/), reused directly rather than a second,
   *  parallel dedup mechanism. */
  mpiCandidatePatientIds?: string[];
  /** Real, per this pipeline's own field-mapping step — source
   *  fields present in the raw record that no active mapping
   *  covered, surfaced here rather than silently dropped. */
  unmappedSourceFields: string[];
  errorMessage?: string;
  processedAt: string;
}

export interface IMigrationRecordResultService {
  getByJobId(migrationJobId: string): Promise<ServiceResult<MigrationRecordResult[]>>;
  record(result: Omit<MigrationRecordResult, 'id' | 'processedAt'>): Promise<ServiceResult<MigrationRecordResult>>;
}
