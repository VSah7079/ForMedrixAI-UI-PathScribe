// src/services/digitalPathology/IAiScreeningResultService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own earlier DP/AI vendor research — the
// real, operational record store for AiScreeningResult, distinct from
// IDpVendorService (the admin-configured vendor dictionary). Same
// real CRUD/query shape this app's own other operational-record
// services already use (e.g. CytologyReviewRecordService).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { AiScreeningResult, AiScreeningFinding } from '@/types/digitalPathology/AiScreeningResult';

export type NewAiScreeningResult = Omit<AiScreeningResult, 'id' | 'status' | 'completedAt' | 'findings' | 'humanConcordant'>;

export interface IAiScreeningResultService {
  getAll(): Promise<ServiceResult<AiScreeningResult[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<AiScreeningResult[]>>;
  getById(id: ID): Promise<ServiceResult<AiScreeningResult>>;
  /** Real, per this module's own CAPA-design decision — orders a real
   *  AI screening, status 'ordered', no findings yet. */
  order(entry: NewAiScreeningResult): Promise<ServiceResult<AiScreeningResult>>;
  /** Real, per the real inbound processor's own job — records a real,
   *  completed vendor result. */
  markCompleted(id: ID, findings: AiScreeningFinding[], slideTriage?: import('@/types/digitalPathology/AiScreeningResult').AiSlideTriageSummary): Promise<ServiceResult<AiScreeningResult>>;
  markFailed(id: ID): Promise<ServiceResult<AiScreeningResult>>;
  markTimedOut(id: ID): Promise<ServiceResult<AiScreeningResult>>;
  /** Real, per this module's own established CAPA-design decision —
   *  records a real, human-made concordance judgment; never set by
   *  this app itself. */
  recordHumanConcordance(id: ID, concordant: boolean): Promise<ServiceResult<AiScreeningResult>>;
}
