// src/services/printing/IPrintQueueService.ts
import type { ServiceResult } from '../types';
import type { PrintJob } from '@/types/printing/PrintJob';

export interface IPrintQueueService {
  getAll(): Promise<ServiceResult<PrintJob[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<PrintJob[]>>;
  enqueue(entry: Omit<PrintJob, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<PrintJob>>;
  getFailed(): Promise<ServiceResult<PrintJob[]>>;
  markFailed(id: string, failure: { errorCode: PrintJob['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<PrintJob>>;
  retryDispatch(id: string): Promise<ServiceResult<PrintJob>>;
  markPrinted(id: string): Promise<ServiceResult<PrintJob>>;
}
