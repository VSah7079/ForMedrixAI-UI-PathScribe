// src/types/quality/QaSupervisionAssignment.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-114. The real, generic instance record for the supervision/
// assignment archetype - the direct generalization of FppeAssignment,
// checked field-by-field against that real, working type before this
// was written.
//
// Real, structural difference from QaActivityRecord.ts (PS-113's own
// review-with-outcome instance): this is NOT an append-only, "always
// written, never edited" record. A real assignment gets mutated in
// place over its own real lifetime - casesReviewedCount incremented,
// status transitioned to 'completed' - matching FppeAssignment's own
// real service methods (recordCaseReviewed/graduate), not a new
// design invented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaSupervisionEndCondition } from './QaSupervisionAssignmentType';

export interface QaSupervisionAssignment {
  id: string;
  /** Real FK to QaSupervisionAssignmentType.id. */
  activityTypeId: string;

  /** Real, deliberate generalization of FppeAssignment's own
   *  provisionalUserId/provisionalUserName - see
   *  QaSupervisionAssignmentType.ts's own header for the full naming
   *  reasoning. */
  superviseeUserId: string;
  superviseeUserName: string;
  supervisorUserId: string;
  supervisorUserName: string;

  /** Real Subspecialty.id, if this assignment is scoped to a specific
   *  subspecialty rather than the supervisee's whole practice -
   *  carried forward unchanged from FppeAssignment.subspecialtyId.
   *  Undefined means every case counts toward the assignment. */
  subspecialtyId?: string;

  /**
   * Real, per direct guidance: which real performing lab this
   * assignment belongs to — carried forward from FppeAssignment's own
   * (required) facilityId. Optional here, deliberately, unlike the
   * FPPE-specific type: this archetype is meant to serve future,
   * genuinely different supervision-style activities too (e.g. "Locum
   * Coverage Oversight"), and a hypothetical one might not be
   * facility-scoped the way FPPE always is. Every real FPPE record
   * synced through the shadow-write always sets this, though — see
   * FppeAssignmentsSection.tsx's own create() call.
   */
  facilityId?: string;

  startedAt: string;
  endCondition: QaSupervisionEndCondition;
  casesReviewedCount: number;
  status: 'active' | 'completed';
  completedAt?: string;
  completedReason?: 'case_count_met' | 'duration_met' | 'manually_graduated';
}
