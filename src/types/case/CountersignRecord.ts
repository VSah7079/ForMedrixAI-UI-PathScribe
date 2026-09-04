// src/types/case/CountersignRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// The general resident-drafts/attending-countersigns workflow — previously
// only a data model existed for this (Case.participants[] resident/attending
// types, SynopticReportInstance.requiresCountersign/countersignedBy/
// countersignedAt), with zero real code path that ever set any of it. This
// is that real workflow: a resident's "sign out" is intercepted before any
// finalize logic runs and diverted into a real CountersignRecord instead;
// the attending's later sign-out is the one that actually finalizes,
// closing the loop with real delta/feedback capture.
//
// Deliberately separate from ReconciliationRecord — that one is narrowly
// scoped to Frozen-to-Permanent discordance and only ever fires for cases
// with a merged intraop specimen. This fires for every resident-drafted
// case, frozen section or not, which is the actual majority of real
// teaching moments.
// ─────────────────────────────────────────────────────────────────────────────

export interface CountersignRecord {
  id: string;
  caseId: string;
  /** Real Subspecialty.id, derived from Case.subspecialtyId at release
   *  time — same pattern as ReconciliationRecord, for the same reason
   *  (a per-subspecialty competency breakdown needs this, not
   *  Department). */
  subspecialtyId?: string;

  residentId: string;
  residentName: string;
  /** Populated once the countersign actually happens — undefined while
   *  status is 'pending'. Resolved from the case's attending-type
   *  participant, not assumed to be a fixed single person in advance. */
  attendingId?: string;
  attendingName?: string;

  releasedAt: string;
  countersignedAt?: string;
  /** Real, per direct guidance ("Return to Trainee"/"Reject with
   *  Notes"): populated once, when the attending rejects rather than
   *  countersigns — same real "moment the decision was actually made"
   *  semantics as countersignedAt above. */
  returnedAt?: string;

  /** Snapshot of every synoptic instance's answers at the moment the
   *  resident released the case — keyed by instanceId. This is what a
   *  real delta gets computed against at countersign time; without it,
   *  "what did the attending actually change" would be unanswerable
   *  once the resident's original values are overwritten in place. */
  releasedAnswersSnapshot: Record<string, Record<string, string | string[]>>;

  /** Computed at countersign time — how many fields differ between the
   *  snapshot and what was actually signed out. A real, simple delta
   *  metric; not a full field-by-field diff UI, which is a bigger,
   *  separate feature if it's ever needed. */
  changedFieldCount?: number;

  /** Same pattern as ReconciliationRecord.attendingFeedback — captured
   *  in the same action as the countersign itself, not a separate note
   *  written later. Optional; an attending isn't required to write one. */
  attendingFeedback?: string;

  /** Real, per direct guidance ("Yes we should scope 'Return to
   *  Trainee'/'Reject with Notes'"): the real, third terminal-or-not
   *  state — an attending declined to countersign as-is and sent the
   *  case back. Distinct from 'countersigned' (the attending accepted
   *  it, possibly with edits) — this is a genuine rejection, always
   *  carrying real attendingFeedback (required for this transition,
   *  unlike the optional feedback a real countersign can carry) so
   *  the resident knows what to fix. */
  status: 'pending' | 'countersigned' | 'returned';
}
