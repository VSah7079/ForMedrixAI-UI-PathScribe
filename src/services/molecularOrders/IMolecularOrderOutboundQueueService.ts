// src/services/molecularOrders/IMolecularOrderOutboundQueueService.ts
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 2b — mirrors ICytologyRegistryOutboundQueueService.ts's own
// established shape exactly (same real queue/retry/audit discipline).
import type { ServiceResult } from '../types';
import type { MolecularOrderOutboundQueueEntry } from '@/types/case/MolecularOrderOutboundQueueEntry';

export interface IMolecularOrderOutboundQueueService {
  getAll(): Promise<ServiceResult<MolecularOrderOutboundQueueEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<MolecularOrderOutboundQueueEntry[]>>;
  enqueue(entry: Omit<MolecularOrderOutboundQueueEntry, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<MolecularOrderOutboundQueueEntry>>;
  getFailed(): Promise<ServiceResult<MolecularOrderOutboundQueueEntry[]>>;
  markFailed(id: string, failure: { errorCode: MolecularOrderOutboundQueueEntry['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<MolecularOrderOutboundQueueEntry>>;
  retryDispatch(id: string): Promise<ServiceResult<MolecularOrderOutboundQueueEntry>>;
  markSent(id: string): Promise<ServiceResult<MolecularOrderOutboundQueueEntry>>;
}
