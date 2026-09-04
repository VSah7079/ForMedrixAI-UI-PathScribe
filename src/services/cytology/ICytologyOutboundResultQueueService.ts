// src/services/cytology/ICytologyOutboundResultQueueService.ts
import type { ServiceResult } from '../types';
import type { CytologyOutboundResultQueueEntry } from '@/types/case/CytologyOutboundResultQueueEntry';

export interface ICytologyOutboundResultQueueService {
  getAll(): Promise<ServiceResult<CytologyOutboundResultQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CytologyOutboundResultQueueEntry[]>>;
  getBySignOutRecordId(signOutRecordId: string): Promise<ServiceResult<CytologyOutboundResultQueueEntry[]>>;
  enqueue(entry: Omit<CytologyOutboundResultQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<CytologyOutboundResultQueueEntry>>;
  getFailed(): Promise<ServiceResult<CytologyOutboundResultQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: CytologyOutboundResultQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<CytologyOutboundResultQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<CytologyOutboundResultQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<CytologyOutboundResultQueueEntry>>;
}
