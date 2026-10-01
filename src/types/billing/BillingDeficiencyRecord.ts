// src/types/billing/BillingDeficiencyRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: a billing deficiency represents a
// compliance/financial risk flag attached to a case and (optionally) a
// specific ServiceChargeRecord - deliberately NOT a hard gate on
// sign-out. Per direct, explicit confirmation: "alert the Pathologist
// with a warning message, but not block. Those cases would be routed
// to QA" - this is a real, visible flag, not something that stops a
// pathologist's actual signature. Field names use this codebase's own
// camelCase convention throughout, adapted from the original schema
// discussion's DB-style snake_case naming for consistency with every
// other real type in this app.
// ─────────────────────────────────────────────────────────────────────────────

export type BillingDeficiencyType =
  | 'UNSUPPORTED_CPT_LEVEL'       // Specimen gross description does not support the level billed
  | 'MISSING_DIAGNOSTIC_ICD10'    // CPT generated without required cross-mapped ICD-10
  | 'NCCI_BUNDLING_VIOLATION'     // e.g. mutually exclusive stain combinations
  | 'UNATTACHED_ANCILLARY_ORDER'  // Special stain executed without an accompanying order/sign-off
  | 'MODIFIER_MISMATCH'           // Professional -26 or Technical -TC component omitted or inverted
  | 'ZERO_FEE_MAPPING_ERROR';     // Active code mapped to $0.00 fee schedule line without explicit override

export type BillingDeficiencySeverity = 'CRITICAL_REJECTION_RISK' | 'COMPLIANCE_WARNING' | 'REVENUE_LEAKAGE';

export type BillingDeficiencyStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'OVERRIDDEN_WITH_JUSTIFICATION';

export type BillingDeficiencyTrigger = 'AUTO_NCCI_CHECK' | 'AUTO_CROSSWALK_CHECK' | 'MANUAL_BILLING_AUDIT';

export type BillingDeficiencyResolutionReason =
  | 'CODE_CORRECTED' | 'CHARGE_REVERSED' | 'APPROVED_BY_BILLING_ADMIN' | 'PHYSICIAN_ADDENDUM_ADDED';

export interface BillingDeficiencyRecord {
  id: string;
  caseId: string;
  /** Nullable, per direct guidance - undefined when the deficiency is
   *  systemic to the whole case rather than tied to one specific
   *  ServiceChargeRecord (e.g. a case-wide missing-ICD10 flag). */
  chargeRecordId?: string;
  deficiencyType: BillingDeficiencyType;
  severity: BillingDeficiencySeverity;
  status: BillingDeficiencyStatus;
  raisedByTrigger: BillingDeficiencyTrigger;
  resolutionReasonCode?: BillingDeficiencyResolutionReason;
  /** Real, human-readable detail on what was actually detected - e.g.
   *  "88307 billed; specimen dictionary default for this type is
   *  88305" - not a placeholder, the actual real basis for the flag. */
  auditorNotes: string;
  createdAt: string;
  resolvedAt?: string;
  createdBy: string;
  resolvedBy?: string;
}
