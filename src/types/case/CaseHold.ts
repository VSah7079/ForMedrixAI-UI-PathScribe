// src/types/case/CaseHold.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "defering synoptic reports just
// doesn't make sense to me clinically. If the Path is waiting on
// something, the case is just pending. I think putting a case on Hold
// at the case level makes sense if there is something truly wrong."
// This is that case-level Hold — see the Worklist "Cases on Hold"
// tile (WorklistPage.tsx) for where a pathologist actually sees it.
//
// Deliberately its own, separate type from RetentionHold.ts, not a
// reuse — a genuinely different concept despite the shared "Hold"
// name. RetentionHold only ever matters AFTER finalization (it gates
// disposal, nothing else — a finalized case sitting on a retention
// hold is otherwise ordinary). CaseHold is about an ACTIVE, not-yet-
// finalized case that can't move forward for a real reason — it gates
// finalize itself (useSignOutWorkflow.ts's own finalize gate), and its
// own reason taxonomy reflects that ("quality issue," "awaiting
// outside materials") rather than RetentionHold's post-finalization
// reasons ("litigation hold," "patient requested retention").
//
// Orthogonal to CaseStatus (types/case/CaseStatus.ts), not folded
// into it — a held case can be at any real point in its own workflow
// (accessioned, in-progress, gross-complete...); "on hold" is a
// second, independent dimension layered on top, same real reasoning
// RetentionHold.ts's own header already gives for the identical
// design choice on that type.
// ─────────────────────────────────────────────────────────────────────────────

export type CaseHoldReason =
  | 'quality_issue'
  | 'awaiting_outside_materials'
  | 'clinical_discrepancy'
  | 'pending_consultation'
  | 'other';

export const CASE_HOLD_REASON_LABEL: Record<CaseHoldReason, string> = {
  quality_issue: 'Quality / Technical Issue',
  awaiting_outside_materials: 'Awaiting Outside Records / Slides',
  clinical_discrepancy: 'Clinical / Radiologic-Pathologic Discrepancy',
  pending_consultation: 'Pending Formal Consultation',
  other: 'Other',
};

export interface CaseHold {
  id: string;
  reason: CaseHoldReason;
  /** Required — a real, specific explanation (e.g. "Block 2 tissue
   *  fragmented on sectioning, re-cut requested from histology"), same
   *  mandatory-narrative posture as every other exception path in this
   *  app, including RetentionHold's own identical field. */
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
}
