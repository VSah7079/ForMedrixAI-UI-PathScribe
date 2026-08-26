// src/services/billing/IOutboundChargeQueueService.ts
import type { ServiceResult } from '../types';
import type { OutboundChargeQueueEntry } from '@/types/billing/OutboundChargeQueueEntry';

export interface IOutboundChargeQueueService {
  getAll(): Promise<ServiceResult<OutboundChargeQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<OutboundChargeQueueEntry[]>>;
  /** Real, per direct guidance - the natural dedup check: has this exact
   *  ServiceChargeRecord already been queued, regardless of trigger. */
  getByServiceChargeRecordIds(ids: string[]): Promise<ServiceResult<OutboundChargeQueueEntry[]>>;
  /** Real UUID assigned here, not by the caller - see
   *  OutboundChargeQueueEntry.id's own doc comment for why. */
  enqueue(entry: Omit<OutboundChargeQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<OutboundChargeQueueEntry>>;

  // ─── Story 4: Billing Exception Management & Retry DLQ ──────────────────
  getFailed(): Promise<ServiceResult<OutboundChargeQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: OutboundChargeQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<OutboundChargeQueueEntry>>;
  /** Real, per direct guidance's own "click Re-queue / Retry Dispatch" -
   *  moves a FAILED entry back to QUEUED, clearing its error fields and
   *  incrementing retryCount. Never validates on its own - the caller
   *  (the DLQ UI) is responsible for re-running validateChargeMetadata
   *  first when the failure was a real, detectable metadata gap, so a
   *  still-broken entry isn't silently re-queued. */
  retryDispatch(id: string): Promise<ServiceResult<OutboundChargeQueueEntry>>;
}
