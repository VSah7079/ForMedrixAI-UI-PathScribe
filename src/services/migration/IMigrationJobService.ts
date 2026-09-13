// src/services/migration/IMigrationJobService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "migration status/validation UI" ask — the piece
// this gap's own Backend Needs Log entry explicitly names as the
// real, comparatively small frontend surface for what is otherwise
// "fundamentally a backend-heavy story." One real job per batch
// import run.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type MigrationJobStatus = 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed';

export interface MigrationJob {
  id: ID;
  sourceSystemName: string;
  status: MigrationJobStatus;
  /** Real, per "cross-validation reporting" — the source system's
   *  own claimed record count, checked against what was actually
   *  processed by resolveMigrationCrossValidation.ts. Optional: not
   *  every real legacy export arrives with a trustworthy header
   *  count. */
  claimedSourceRecordCount?: number;
  totalRecordsProcessed: number;
  succeededCount: number;
  failedCount: number;
  needsReviewCount: number;
  createdByUserId: string;
  createdByUserName: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export type NewMigrationJob = Omit<MigrationJob, 'id' | 'createdAt' | 'totalRecordsProcessed' | 'succeededCount' | 'failedCount' | 'needsReviewCount' | 'status'>;

export interface IMigrationJobService {
  getAll(): Promise<ServiceResult<MigrationJob[]>>;
  getById(id: ID): Promise<ServiceResult<MigrationJob>>;
  create(entry: NewMigrationJob): Promise<ServiceResult<MigrationJob>>;
  start(id: ID): Promise<ServiceResult<MigrationJob>>;
  recordOutcome(id: ID, outcome: 'succeeded' | 'failed' | 'needs_review'): Promise<ServiceResult<MigrationJob>>;
  complete(id: ID): Promise<ServiceResult<MigrationJob>>;
}
