// src/types/case/FppeAssignment.ts
// ─────────────────────────────────────────────────────────────────────────────
// Focused Professional Practice Evaluation tracking — the real gap
// identified when generalizing the resident/attending countersign
// mechanism to new-hire credentialing verification. ACGME residency has
// no natural end condition PathScribe needs to track (a resident stays
// a resident for their whole training program); FPPE is explicitly
// bounded — a defined case count or time window, after which a fully-
// credentialed new hire graduates to unsupervised practice. Without this,
// the countersign gate would just apply to a new hire forever, which is
// not what FPPE actually requires.
// ─────────────────────────────────────────────────────────────────────────────

export type FppeEndCondition =
  | { type: 'case_count'; threshold: number }
  | { type: 'duration_days'; threshold: number }
  /** Whichever comes first — the most common real FPPE policy shape
   *  (e.g. "first 20 cases OR 90 days, whichever is sooner"). */
  | { type: 'either'; caseCountThreshold: number; durationDaysThreshold: number };

export interface FppeAssignment {
  id: string;
  provisionalUserId: string;
  provisionalUserName: string;
  proctorUserId: string;
  proctorUserName: string;
  /**
   * Real, per direct guidance: which real performing lab this
   * provisional hire's own practice — and this specific FPPE
   * assignment — belongs to. Required, not optional: unlike a shared
   * network-pool printer, a provisional hire practices at one real,
   * specific place, and the whole point of adding this is letting an
   * admin see and filter which supervisees belong to their own
   * facility, not treat every assignment as belonging everywhere.
   */
  facilityId: string;
  /** Real Subspecialty.id, if this FPPE assignment is scoped to a
   *  specific subspecialty rather than the new hire's whole practice —
   *  a real, common pattern (e.g. proctoring only GI cases for a hire
   *  brought on specifically for that subspecialty). Undefined means
   *  every case counts toward the assignment. */
  subspecialtyId?: string;
  startedAt: string;
  endCondition: FppeEndCondition;
  casesReviewedCount: number;
  status: 'active' | 'completed';
  completedAt?: string;
  completedReason?: 'case_count_met' | 'duration_met' | 'manually_graduated';
}
