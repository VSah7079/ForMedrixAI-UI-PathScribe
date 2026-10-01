// src/types/case/RetentionHold.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "How will pathscribe know it needs
// to retain the patient's specimen?" — confirmed directly: it didn't.
// The disposal workflow only asked
// a tech to check at the point of disposal itself; nothing upstream
// could stop a specimen from even being scanned into a Disposal batch
// in the first place. This is that upstream signal.
//
// Deliberately a dedicated, purpose-built type — not folded into the
// existing, generic SpecimenFlag/Flag systems (types/case/SpecimenFlag.ts,
// services/flags/IFlagService.ts). Those are real, but built for
// clinical/workflow/quality annotations a pathologist reviews visually;
// a retention hold gates an irreversible physical action
// (mockBatchService.ts's own addItemByScan, for Disposal-node batches)
// and needs a real, structured, always-checkable reason — not an
// annotation that could get lost among unrelated flags. Same real
// posture as this app's own existing ErasureCertificate.ts, which made
// the identical choice for the same real reason (a retention-hold gate
// on an irreversible action deserves its own, explicit type).
//
// Set at the Case level (per direct follow-up: "The hold Retention flag
// should be also on the accession screen") — accessioning is a case-
// level action, before individual specimens are even fully detailed,
// and a patient request or litigation hold typically covers everything
// from that case, not one specimen in isolation. Never deleted once
// created — released (cleared), not removed, so the full history of
// who set and released it stays real and auditable.
// ─────────────────────────────────────────────────────────────────────────────

export type RetentionHoldReason =
  | 'patient_requested_retention'
  | 'litigation_hold'
  | 'research_hold'
  | 'other';

export const RETENTION_HOLD_REASON_LABEL: Record<RetentionHoldReason, string> = {
  patient_requested_retention: 'Patient Requested Retention / Return',
  litigation_hold: 'Litigation Hold',
  research_hold: 'Research Hold',
  other: 'Other',
};

export interface RetentionHold {
  id: string;
  reason: RetentionHoldReason;
  /** Required — a real, specific explanation (e.g. "Patient called
   *  2026-08-15 requesting blocks returned for a second opinion at
   *  City Hospital"), same real mandatory-narrative posture as every
   *  other exception path in this app. */
  note: string;
  setAt: string;
  setByUserId: string;
  setByUserName: string;
  /** A hold is active until explicitly released — never silently
   *  expires, never auto-clears with time. */
  active: boolean;
  releasedAt?: string;
  releasedByUserId?: string;
  releasedByUserName?: string;
  /** Required when releasing — same real reasoning as setting one. */
  releaseNote?: string;
  // Real feature, per direct follow-up: "I think we will need
  // Management review of Cases On Hold." A real, separate concern
  // from releasing — a manager confirming a hold is still valid
  // doesn't necessarily mean it should be released, and releasing
  // doesn't require a prior review. Same real "reviewed marker,
  // distinct from resolving the underlying thing" pattern this app
  // already uses for SpecimenDeficiency (deficiencies/
  // IDeficiencyService.ts's own ManagementReview) — deliberately NOT
  // reusing that exact type, since ManagementReview.deficiencyIds is
  // specific to deficiencies and a hold review has no equivalent
  // batch-of-multiple-items shape; this is a simple, direct stamp on
  // the hold itself instead. Never required, never blocks release —
  // an old, still-active hold can be released without ever having
  // been marked reviewed first.
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
}
