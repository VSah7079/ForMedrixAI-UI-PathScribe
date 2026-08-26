// src/types/billing/OutboundChargeQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per Epic: PathScribe Outbound Billing & Charge Event Engine, User
// Story 2. Deliberately a SEPARATE, real concept from ServiceChargeRecord:
// ServiceChargeRecord is the permanent ledger of what's actually billed,
// recorded the moment a pathologist applies a code (real, existing
// behavior - unchanged). OutboundChargeQueueEntry is the separate question
// of "is this specific, already-billed charge cleared to actually leave
// PathScribe for the external RCM system yet" - gated by billingType and
// the real clinical milestone that billingType requires
// (BILLING_TYPE_DEFAULT_TRIGGER, codeMapTable.ts): TC clears at
// SPECIMEN_GROSSED, 26/Global hold until CASE_SIGNED_OUT. A charge can
// exist in the ledger for a while before it's actually queued here.
//
// Honest, disclosed limitation, per direct guidance's own "within the same
// database transaction" requirement: PathScribe has no real backend
// database, so no real atomic transaction can be provided (same
// architectural gap already disclosed for BillingRuleVersion's own
// "creation of the Billing objects" scope boundary). What's real here: the
// enqueue happens synchronously, in the same function call, immediately
// after the real clinical status update persists (caseRouter.updateCase) -
// as close to "together" as this app's real, mock-service architecture
// allows.
// ─────────────────────────────────────────────────────────────────────────────

export interface OutboundChargeQueueEntry {
  /** Real UUID (crypto.randomUUID()), per direct guidance - "TransactionID"
   *  for downstream deduplication by the external RCM system. Deliberately
   *  distinct from serviceChargeRecordId below - this ID is what the
   *  external system sees and dedupes against, not PathScribe's own
   *  internal charge identifier. */
  id: string;
  /** The real ServiceChargeRecord this queue entry represents - the actual
   *  charge data (cptCode, rvuWork, etc.) is never duplicated here, only
   *  referenced. Also the real, natural dedup key preventing this same
   *  charge from ever being enqueued twice (see sweepChargesForOutbox.ts). */
  serviceChargeRecordId: string;
  caseId: string;
  specimenId?: string;
  billingType: 'TC' | '26' | 'Global';
  /** Real, per direct guidance - which real clinical milestone actually
   *  cleared this charge for dispatch. */
  triggerEvent: 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT';
  /** Real Story 3 concern (payload generation/dispatch) - 'QUEUED' is the
   *  only real status Story 2 itself produces. 'SENT'/'FAILED' are left
   *  here, not fabricated as working, for Story 3/4 to actually implement
   *  against - matches this app's own "honest stub" posture elsewhere
   *  (dispatchCassetteLabel.ts). */
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;

  // ─── Story 4: Billing Exception Management & Retry DLQ ──────────────────
  /** Real, per direct guidance's own two failure categories:
   *   'MISSING_ICD10' / 'MISSING_PROVIDER_NPI' - a real, genuinely
   *     detectable condition (see validateChargeMetadata.ts), not
   *     simulated - this app really does have the case's real
   *     icd10Codes/participant NPI data to check against.
   *   'DISPATCH_TIMEOUT' / 'DISPATCH_REJECTED' - real Story 3 concerns
   *     (an actual HTTP/HL7 endpoint failing after max retries) that
   *     this app has no real dispatch mechanism to ever genuinely
   *     produce - see simulateDispatchFailure.ts's own header for the
   *     honest disclosure on why this category can only ever be
   *     simulated here, never real, until Story 3's real dispatch
   *     exists. */
  errorCode?: 'MISSING_ICD10' | 'MISSING_PROVIDER_NPI' | 'DISPATCH_TIMEOUT' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}
