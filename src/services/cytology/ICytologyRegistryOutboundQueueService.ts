// src/services/cytology/ICytologyRegistryOutboundQueueService.ts
import type { ServiceResult } from '../types';
import type { CytologyRegistryOutboundQueueEntry } from '@/types/case/CytologyRegistryOutboundQueueEntry';

export interface ICytologyRegistryOutboundQueueService {
  getAll(): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry[]>>;
  enqueue(entry: Omit<CytologyRegistryOutboundQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry>>;
  getFailed(): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: CytologyRegistryOutboundQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<CytologyRegistryOutboundQueueEntry>>;
}
