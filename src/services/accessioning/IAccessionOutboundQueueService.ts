// src/services/accessioning/IAccessionOutboundQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own User Story 5. Mirrors
// ICytologyOutboundResultQueueService.ts's own real, established shape
// exactly — same real queue/retry/audit discipline, applied to the two
// real event types this story calls for (order.accessioned,
// order.deficiency.created) instead of a cytology sign-out result.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { AccessionOutboundQueueEntry } from '@/types/case/AccessionOutboundQueueEntry';

export interface IAccessionOutboundQueueService {
  getAll(): Promise<ServiceResult<AccessionOutboundQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<AccessionOutboundQueueEntry[]>>;
  enqueue(entry: Omit<AccessionOutboundQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<AccessionOutboundQueueEntry>>;
  getFailed(): Promise<ServiceResult<AccessionOutboundQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: AccessionOutboundQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<AccessionOutboundQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<AccessionOutboundQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<AccessionOutboundQueueEntry>>;
}
