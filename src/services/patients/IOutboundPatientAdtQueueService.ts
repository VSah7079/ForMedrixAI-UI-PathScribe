// src/services/patients/IOutboundPatientAdtQueueService.ts
import type { ServiceResult } from '../types';
import type { OutboundPatientAdtQueueEntry } from '@/types/patients/OutboundPatientAdtQueueEntry';

export interface IOutboundPatientAdtQueueService {
  getAll(): Promise<ServiceResult<OutboundPatientAdtQueueEntry[]>>;
  getByPatientId(patientId: string): Promise<ServiceResult<OutboundPatientAdtQueueEntry[]>>;
  /** Real UUID assigned here, not by the caller — same reasoning as
   *  IOutboundChargeQueueService.enqueue(). */
  enqueue(entry: Omit<OutboundPatientAdtQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<OutboundPatientAdtQueueEntry>>;

  getFailed(): Promise<ServiceResult<OutboundPatientAdtQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: OutboundPatientAdtQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<OutboundPatientAdtQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<OutboundPatientAdtQueueEntry>>;
  /** Real, per direct guidance (the real receiving end for PathScribe's
   *  real outbound interface dispatch): the genuine "a real dispatch
   *  attempt actually succeeded" transition — previously, nothing in
   *  this app ever called this; a queue entry could only ever reach
   *  'QUEUED' or 'FAILED', never a genuinely earned 'SENT'. */
  markSent(id: string): Promise<ServiceResult<OutboundPatientAdtQueueEntry>>;
}
