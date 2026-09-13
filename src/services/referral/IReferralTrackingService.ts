// src/services/referral/IReferralTrackingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap. Covers the two real, remaining
// asks from that gap's own Acceptance Criteria beyond the outbound
// manifest itself: "Real-time transit status updates" and "Inbound
// result parsing... from external reference laboratories" — kept
// together in one real entity since both are the same real, ongoing
// story of what happened to a referral batch after it left the door,
// not two, separately-tracked concerns.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type ReferralTransitStatus = 'dispatched' | 'in_transit' | 'delivered' | 'result_received';

export interface ReferralTracking {
  id: string;
  /** The real, existing Batch.id this tracking record is FOR — one
   *  real tracking record per referral batch, never a second,
   *  parallel id. */
  batchId: string;
  transitStatus: ReferralTransitStatus;
  lastUpdatedAt: string;
  resultType?: 'discrete' | 'pdf_attachment';
  discreteResult?: string;
  pdfAttachmentUrl?: string;
  receivedAt?: string;
}

export interface IReferralTrackingService {
  getAll(): Promise<ServiceResult<ReferralTracking[]>>;
  getByBatchId(batchId: string): Promise<ServiceResult<ReferralTracking | null>>;
  /** Creates the real, initial tracking record the moment a referral
   *  manifest is dispatched — transitStatus starts at 'dispatched'. */
  createOnDispatch(batchId: string): Promise<ServiceResult<ReferralTracking>>;
  updateTransitStatus(batchId: string, status: ReferralTransitStatus): Promise<ServiceResult<ReferralTracking>>;
  recordResult(batchId: string, result: { resultType: 'discrete' | 'pdf_attachment'; discreteResult?: string; pdfAttachmentUrl?: string }): Promise<ServiceResult<ReferralTracking>>;
}
