// src/types/quality/QaSupervisionAssignmentType.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-114. The real, admin-configurable definition of a "supervision/
// assignment" QA activity - the second real archetype, deliberately
// separate from PS-113's review-with-outcome archetype (QaActivityType.ts).
// Checked directly against FppeAssignment.ts's own real, complete shape
// before this was written: provider-scoped rather than case-scoped, an
// ongoing period rather than a discrete event, a running case count
// rather than a single outcome, real mutations to an existing record
// (recordCaseReviewed/graduate) rather than "always written, never
// edited." Forcing this into PS-113's own archetype would have
// distorted both - confirmed, not assumed, by reading FppeAssignment.ts
// and IFppeAssignmentService.ts in full first.
//
// Real, deliberate naming generalization, same discipline PS-113
// applied to "Teaching-Onboarding": FppeAssignment's own
// provisionalUserId/proctorUserId are genuinely FPPE-specific terms.
// A future site defining a different supervision-style activity (e.g.
// "New Grosser Training Period," "Locum Coverage Oversight") wouldn't
// have a "provisional" hire or a "proctor" - generalized to
// superviseeUserId/supervisorUserId in QaSupervisionAssignment.ts.
//
// Real, deliberate scope note: unlike QaActivityType.ts, this
// definition type carries no fields[] schema - there's no equivalent
// "review-with-outcome" answer-capture concern here; a supervision
// assignment's own real configuration is its end condition and scope,
// not a set of reviewer-filled fields.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

/** Identical real shape to FppeAssignment's own FppeEndCondition -
 *  carried forward unchanged, already generic (nothing FPPE-specific
 *  about "case count or duration, whichever comes first"). */
export type QaSupervisionEndCondition =
  | { type: 'case_count'; threshold: number }
  | { type: 'duration_days'; threshold: number }
  | { type: 'either'; caseCountThreshold: number; durationDaysThreshold: number };

export interface QaSupervisionAssignmentType {
  id: string;
  name: string;
  description?: string;
  /** Same real Standard/Custom design as QaActivityType.ts - a
   *  'standard' activity has no disable control anywhere in the UI. */
  tabScope: 'standard' | 'custom';
  /** Only meaningful when tabScope is 'standard' - FPPE/Credentialing
   *  Review is Joint Commission-mandated new-hire verification in
   *  most of PS-108's named jurisdictions.
   *  Real fix (PS-115): was `string[]`, same real gap and same fix as
   *  QaActivityType.jurisdictions — see that field's own doc comment
   *  for the full account. */
  jurisdictions?: Jurisdiction[];
  /** Real, per direct guidance (PS-115) — was missing here even though
   *  QaActivityType.ts already had the equivalent field from PS-113;
   *  a genuine gap, not a deliberate omission, since PS-115's own
   *  Duplicate action needs to work symmetrically across both
   *  archetypes in one unified Configuration Center. Same real
   *  provenance meaning as QaActivityType.duplicatedFromId — see that
   *  field's own doc comment. */
  duplicatedFromId?: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}
