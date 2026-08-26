// src/services/billing/ICodeReviewPoolService.ts
import type { ServiceResult, ID } from '../types';
import type { CodeReviewPoolEntry } from '@/types/billing/CodeReviewPoolEntry';

export interface ICodeReviewPoolService {
  getAll(): Promise<ServiceResult<CodeReviewPoolEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CodeReviewPoolEntry[]>>;
  create(entry: Omit<CodeReviewPoolEntry, 'id' | 'status' | 'flaggedAt'>): Promise<ServiceResult<CodeReviewPoolEntry>>;
  /** Real, per direct guidance: the billing specialist's actual review
   *  outcome. NO_ISSUE_FOUND closes the entry with nothing further.
   *  DEFICIENCY_RAISED requires raisedDeficiencyId - the caller is
   *  responsible for actually raising the real BillingDeficiencyRecord
   *  first (via mockBillingDeficiencyService.raise()), then passing
   *  its real id here, so this entry stays a genuine link rather than
   *  a second, independent record of the same event. */
  review(id: ID, outcome: {
    reviewOutcome: 'NO_ISSUE_FOUND' | 'DEFICIENCY_RAISED';
    reviewedBy: string;
    reviewedByName?: string;
    raisedDeficiencyId?: string;
  }): Promise<ServiceResult<CodeReviewPoolEntry>>;
}
