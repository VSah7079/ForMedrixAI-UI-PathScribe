// src/services/billing/IBillingDeficiencyService.ts
import type { ServiceResult, ID } from '../types';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

export interface IBillingDeficiencyService {
  getAll(): Promise<ServiceResult<BillingDeficiencyRecord[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<BillingDeficiencyRecord[]>>;
  /** Creates a new OPEN billing deficiency. Real, per direct guidance:
   *  never blocks the caller - raising this record is a side effect
   *  of sign-out, not a gate on it. */
  raise(deficiency: Omit<BillingDeficiencyRecord, 'id' | 'status' | 'createdAt' | 'resolvedAt' | 'resolvedBy' | 'resolutionReasonCode'>): Promise<ServiceResult<BillingDeficiencyRecord>>;
  resolve(id: ID, resolution: { resolutionReasonCode: BillingDeficiencyRecord['resolutionReasonCode']; resolvedBy: string }): Promise<ServiceResult<BillingDeficiencyRecord>>;
}
