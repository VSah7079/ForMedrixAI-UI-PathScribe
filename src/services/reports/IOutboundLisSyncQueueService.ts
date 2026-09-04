// src/services/reports/IOutboundLisSyncQueueService.ts
import type { ServiceResult } from '../types';
import type { OutboundLisSyncQueueEntry } from '@/types/case/OutboundLisSyncQueueEntry';

export interface IOutboundLisSyncQueueService {
  getAll(): Promise<ServiceResult<OutboundLisSyncQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<OutboundLisSyncQueueEntry[]>>;
  /** Real UUID assigned here, not by the caller. */
  enqueue(entry: Omit<OutboundLisSyncQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<OutboundLisSyncQueueEntry>>;

  getFailed(): Promise<ServiceResult<OutboundLisSyncQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: OutboundLisSyncQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<OutboundLisSyncQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<OutboundLisSyncQueueEntry>>;
  /** Real, per direct guidance (the real receiving end for PathScribe's
   *  real outbound interface dispatch): the genuine "a real dispatch
   *  attempt actually succeeded" transition — previously, nothing in
   *  this app ever called this; a queue entry could only ever reach
   *  'QUEUED' or 'FAILED', never a genuinely earned 'SENT'. */
  markSent(id: string): Promise<ServiceResult<OutboundLisSyncQueueEntry>>;
}
