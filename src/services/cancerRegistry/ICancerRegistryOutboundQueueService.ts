// src/services/cancerRegistry/ICancerRegistryOutboundQueueService.ts
import type { ServiceResult } from '../types';
import type { CancerRegistryOutboundQueueEntry } from '@/types/case/CancerRegistryOutboundQueueEntry';

export interface ICancerRegistryOutboundQueueService {
  getAll(): Promise<ServiceResult<CancerRegistryOutboundQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CancerRegistryOutboundQueueEntry[]>>;
  enqueue(entry: Omit<CancerRegistryOutboundQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<CancerRegistryOutboundQueueEntry>>;
  getFailed(): Promise<ServiceResult<CancerRegistryOutboundQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: CancerRegistryOutboundQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<CancerRegistryOutboundQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<CancerRegistryOutboundQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<CancerRegistryOutboundQueueEntry>>;
}
