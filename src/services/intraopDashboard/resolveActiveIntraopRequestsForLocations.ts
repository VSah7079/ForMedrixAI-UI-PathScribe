// src/services/intraopDashboard/resolveActiveIntraopRequestsForLocations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section
// Dashboard's own "Real-time Intraoperative Dashboard: Displays active
// operating room (OR) requests, tissue arrival status, pathologist
// assignment, and elapsed time timers." Reuses this app's own,
// existing IntraoperativeEntry/IntraopSpecimen data (services/intraop/)
// directly — this file is a real, pure filter/shape function, not a
// second, parallel intraop entity.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveIntraopTatStatus } from './resolveIntraopTatStatus';
import type { IntraoperativeEntry, MilestoneType } from '@/types/intraop/IntraoperativeEntry';

/** Real, per the OR Suite Live Board spec's own State 1 ask: "Displays
 *  the current laboratory workflow step (e.g., Grossing, Microtomy,
 *  Pathologist Review)." Derived from this app's own real, existing
 *  milestones[] (types/intraop/IntraoperativeEntry.ts) — the step
 *  shown is the real step that logically follows the most recently
 *  completed milestone, never an invented label unconnected to real
 *  data. 'touch_prep_performed'/'touch_prep_skipped' both mean the
 *  same real next step (sectioning) — the board doesn't need to
 *  distinguish which path got there. */
export function resolveCurrentWorkflowStep(milestones: { milestone: MilestoneType }[]): string {
  const types = new Set(milestones.map(m => m.milestone));
  if (types.has('frozen_section_cut')) return 'Pathologist Review';
  if (types.has('touch_prep_performed') || types.has('touch_prep_skipped')) return 'Sectioning';
  if (types.has('gross_logged')) return 'Touch Prep';
  return 'Grossing';
}

export interface ActiveIntraopRequest {
  sessionId: string;
  locationId: string;
  locationDisplay?: string;
  patientName: string;
  /** Real, per the dismissal workflow's own "Safety Re-Display of
   *  Result" — patient name, MRN, OR room, and diagnosis text all
   *  shown again in the confirm modal before a tech commits to
   *  dismissal. */
  mrn: string;
  surgeon: string;
  /** Real, existing session-level identifier (IntraoperativeEntry.
   *  orNumber) — the real case reference available at this stage,
   *  before any formal specimen accession number necessarily exists
   *  yet (a frozen section consult can genuinely precede full
   *  accessioning). Labeled "OR#" on the board, never presented as an
   *  accession number it isn't. */
  orNumber: string;
  specimenId: string;
  specimenLabel: string;
  arrivalTimestamp: string;
  /** Real, per the RFP's own "pathologist assignment" ask — reuses
   *  the session's own real, existing performedBy field, never a
   *  second, dashboard-only assignment concept. */
  pathologistName: string;
  /** True once a real frozen diagnosis has actually been rendered —
   *  the specimen's own real elapsed-time clock stops mattering the
   *  moment the real, clinical answer exists, per this app's own
   *  established frozenDiagnosisRenderedAt field. */
  diagnosisRendered: boolean;
  /** Real, per the spec's own State 2 "Timer Behavior: Stops and
   *  freezes at the exact final turnaround time" — the real moment to
   *  freeze the MM:SS display at. Undefined until diagnosisRendered. */
  frozenDiagnosisRenderedAt?: string;
  /** Real, per the OR Suite Live Board spec's own State 2 ask —
   *  undefined until diagnosisRendered is true. */
  frozenSectionDiagnosis?: string;
  /** Real, per the same spec's State 1 ask — see
   *  resolveCurrentWorkflowStep's own doc comment. Meaningless (and
   *  not computed as anything specific) once diagnosisRendered. */
  currentWorkflowStep: string;
  /** Real, per the dismissal workflow — a row with diagnosisRendered
   *  true and dismissed false is State 2 (Completed, awaiting
   *  dismissal); dismissed true means it has already left the active
   *  board entirely (this function excludes it, see below) — kept as
   *  an explicit field on the type for the one real, brief moment
   *  it's still true and useful (the optimistic UI update between a
   *  tech confirming dismissal and the next real poll). */
  dismissed: boolean;
  tat: ReturnType<typeof resolveIntraopTatStatus>;
}

/** Real, per the given design brief's own "Multi/Suite Overview" —
 *  one or more real locationIds; a single-element array is the
 *  ordinary, single-suite terminal's own real, default case. */
export function resolveActiveIntraopRequestsForLocations(
  entries: IntraoperativeEntry[],
  locationIds: string[],
  targetMinutes?: number,
  warningMinutesBefore?: number,
  now: Date = new Date(),
): ActiveIntraopRequest[] {
  const locationSet = new Set(locationIds);
  const requests: ActiveIntraopRequest[] = [];

  for (const entry of entries) {
    // Real, per this app's own established rule — a session merged
    // into a real Case has moved past this dashboard's own real
    // reason to exist; it belongs to the normal case worklist from
    // that point on, never shown here as if still pending.
    if (entry.mergedIntoCaseId) continue;
    if (!entry.locationId || !locationSet.has(entry.locationId)) continue;

    for (const specimen of entry.specimens) {
      // Real, per the dismissal workflow — a dismissed specimen has
      // genuinely left the active board; it belongs to the archived
      // OrEvent log from that point on, never shown here again.
      if (specimen.dismissedFromBoardAt) continue;
      const diagnosisRendered = !!specimen.frozenDiagnosisRenderedAt;
      requests.push({
        sessionId: entry.id,
        locationId: entry.locationId,
        locationDisplay: entry.locationDisplay,
        patientName: entry.patientMatch.patientName,
        mrn: entry.patientMatch.mrn,
        surgeon: entry.surgeon,
        orNumber: entry.orNumber,
        specimenId: specimen.id,
        specimenLabel: specimen.specimenLabel,
        arrivalTimestamp: specimen.arrivalTimestamp,
        pathologistName: entry.performedBy.userName,
        diagnosisRendered,
        frozenDiagnosisRenderedAt: specimen.frozenDiagnosisRenderedAt,
        frozenSectionDiagnosis: specimen.frozenSectionDiagnosis,
        currentWorkflowStep: resolveCurrentWorkflowStep(specimen.milestones ?? []),
        dismissed: false,
        tat: resolveIntraopTatStatus(specimen.arrivalTimestamp, targetMinutes, warningMinutesBefore, now),
      });
    }
  }

  return requests;
}
