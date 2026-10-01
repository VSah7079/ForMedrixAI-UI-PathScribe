// src/services/referral/IReferralOutboundQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap. Mirrors this app's own
// established outbound-queue shape (CytologyOutboundResultQueueEntry,
// AccessionOutboundQueueEntry) exactly — same real QUEUED/SENT/FAILED
// lifecycle, retry, audit logging on every state change.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { ReferralManifestEventPayload } from '@/types/events/ReferralManifestEventPayload';

export interface ReferralOutboundQueueEntry {
  id: string;
  batchId: string;
  payload: ReferralManifestEventPayload;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

export interface IReferralOutboundQueueService {
  getAll(): Promise<ServiceResult<ReferralOutboundQueueEntry[]>>;
  getByBatchId(batchId: string): Promise<ServiceResult<ReferralOutboundQueueEntry[]>>;
  enqueue(entry: Omit<ReferralOutboundQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<ReferralOutboundQueueEntry>>;
  getFailed(): Promise<ServiceResult<ReferralOutboundQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: ReferralOutboundQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<ReferralOutboundQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<ReferralOutboundQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<ReferralOutboundQueueEntry>>;
}
