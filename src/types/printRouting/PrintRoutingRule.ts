// src/types/printRouting/PrintRoutingRule.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278 ("Print Destination Routing Engine") §2.1.1/§2.1.2.
//
// §2.1.2's own four-level printer mapping hierarchy (most to least
// specific — User/Workstation override → Location/OR-specific rule →
// Client Account preference → Facility system default) is real,
// confirmed before building this to be structurally the same shape as
// two existing, real precedents in this app:
//   - services/caseRegistry/resolveCaseMaskScopeCandidates.ts (Case
//     Mask's Department → Facility → Enterprise) — an ORDERED list of
//     scope candidates, tried strictly in sequence, first real match
//     wins. No scoring, no ties.
//   - services/reportTemplates/TemplateRoutingService.ts's own
//     Pass 0/0a/0b/1/2/3 cascade — the same ordered-pass convention,
//     with full resolution tracing for an admin "why did this
//     resolve here" view.
// §2.1.2's own hierarchy reads as a strict, named PRECEDENCE OF SCOPE
// TYPES ("most to least specific"), which is that same ordered-pass
// shape — not the OTHER real precedent this app has for optional,
// independent match criteria (services/delivery/resolveDeliveryAction.ts
// and Contribution/qualityCalculations.ts's own TAT resolution), which
// score several orthogonal, simultaneously-optional fields against
// each other rather than walking a fixed, named tier order.
//
// §2.1.1's own multi-criteria list (Specimen/Case Type, Location,
// Client/Physician preference, Event Trigger Type) doesn't fit neatly
// into ONE of those two shapes — it's genuinely two different
// questions layered together:
//   1. WHICH SCOPE TIER even has a real, admin-authored rule for this
//      job at all (the strict, ordered §2.1.2 hierarchy above).
//   2. Among more than one real, active rule AT THE SAME TIER, which
//      one most specifically matches this job's own Specimen/Case
//      Type and Event Trigger Type (the optional, scored-match shape
//      resolveDeliveryAction.ts already establishes).
// resolvePrintDestination.ts implements exactly this deliberate
// hybrid — the ordered scope-tier walk as the OUTER pass, a
// specificity-score tie-break as the INNER pass within a tier — and
// documents it there in the same detail, rather than silently picking
// one existing convention and hoping it happens to fit.
//
// "Client/Ordering Physician preference (auto-print hardcopy vs.
// electronic-only)" is real, but already fully built and wired in —
// see services/delivery/ (Component C, DeliveryRule/resolveDeliveryAction),
// which already decides ELECTRONIC_ONLY vs PRINT_ONLY vs DUAL vs
// SUPPRESS from Provider ID, Ordering Facility, Patient Location, and
// Report Type. This engine deliberately does NOT rebuild that
// decision — it only ever runs once Component C has already decided a
// real print is happening (PRINT_ONLY or DUAL), and its own job is
// narrower: WHICH printer to send that job to. "Client Account
// preference" here is the same real Ordering Facility concept
// (Case.order.facilityId) Component C's own DeliveryRule.orderingFacilityId
// already uses — reused directly, not duplicated under a new name.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrintDestination } from './PrintDestination';

/** Real, per §2.1.2's own four named tiers, most to least specific.
 *  The literal array order IS the real precedence order
 *  resolvePrintDestination.ts walks — see PRINT_DESTINATION_SCOPE_PRECEDENCE
 *  there. */
export type PrintDestinationScopeType = 'workstation' | 'location' | 'clientAccount' | 'facility';

/** Real, per §2.1.1's own three named case types. Confirmed directly
 *  before adding this: nothing in this app's existing types expresses
 *  this exact vocabulary today (services/specimenDictionary's own
 *  SpecimenCategory has no 'Frozen Section' value at all — frozen
 *  section is an order-urgency/workflow concept there, not a specimen
 *  category — and splits Cytology into GYN/NON_GYN rather than one
 *  unified value), so this is a genuinely new, PS-278-specific
 *  classification, not a forced reuse of a type that means something
 *  adjacent but different. See resolveRealPrintRoutingContext.ts's
 *  own header for exactly how much of this is reliably resolvable
 *  from real, existing case data today (Cytology, yes; Frozen Section
 *  vs. Routine Surgical, a real, disclosed, honest gap). */
export type SpecimenCaseType = 'FROZEN_SECTION' | 'ROUTINE_SURGICAL' | 'CYTOLOGY';

/** Real, per §2.1.1's own three named trigger types. Confirmed
 *  directly before adding this: services/reports/publishReportReleasedEvent.ts's
 *  own real ReportReleasedEventType ('PRELIMINARY' | 'FINAL' |
 *  'CORRECTED' | 'ADDENDUM') is the closest existing analog but uses
 *  different vocabulary — 'FINAL' where this ticket says "Initial
 *  Sign-out", and no single "Amended Sign-out" value (its own closest
 *  are 'CORRECTED'/'ADDENDUM'). Rather than force this ticket's own
 *  three values into that four-value enum (or vice versa), this is a
 *  new, small type with a direct, real, documented mapping —
 *  see mapReportTypeToEventTriggerType below — so no existing caller's
 *  own reportType vocabulary has to change. */
export type EventTriggerType = 'INITIAL_SIGNOUT' | 'PRELIMINARY' | 'AMENDED_SIGNOUT';

/** Real, direct mapping from the already-real, already-wired
 *  ReportReleasedEventType — never a second, independently-maintained
 *  classification of the same real event. 'FINAL' maps to
 *  'INITIAL_SIGNOUT' (the source spec's own vocabulary for the same
 *  real moment); 'CORRECTED' and 'ADDENDUM' both map to
 *  'AMENDED_SIGNOUT' — this engine's own §2.1.1 routing decision has
 *  no real reason to route a correction differently from an addendum
 *  (both are "the sign-out already happened once, and this is a real
 *  amendment to it"), even though publishReportReleasedEvent.ts's own
 *  dispatch logic does distinguish them for other, unrelated reasons. */
export function mapReportTypeToEventTriggerType(
  reportType: 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM',
): EventTriggerType {
  switch (reportType) {
    case 'FINAL': return 'INITIAL_SIGNOUT';
    case 'PRELIMINARY': return 'PRELIMINARY';
    case 'CORRECTED':
    case 'ADDENDUM':
      return 'AMENDED_SIGNOUT';
  }
}

export interface PrintRoutingRule {
  id: string;
  /** Real, per §2.1.2 — which of the four real tiers this rule lives
   *  at. Fixed at creation; a rule doesn't move tiers, same real
   *  posture as RoutingRule.type elsewhere in this app. */
  scopeType: PrintDestinationScopeType;
  /** Real scope identity, meaning depends on scopeType:
   *  'workstation' → a workstationId (or a userId — see
   *  resolvePrintDestination.ts's own header on why this app has no
   *  real, separate concept of "the workstation currently printing"
   *  distinct from "the user currently printing"); 'location' → a
   *  real Location.pointOfCare value (services/locations/,
   *  the same field Component C's own DeliveryRule.pointOfCare
   *  already resolves via Case.order.locationId — reused directly);
   *  'clientAccount' → a real ordering Facility id
   *  (Case.order.facilityId — again, the same real field
   *  DeliveryRule.orderingFacilityId already uses); 'facility' → the
   *  real performing-lab Facility id. */
  scopeId: string;
  /** Real, per §2.1.1 — both optional; unset is a wildcard (matches
   *  any real value at this tier), same real convention
   *  DeliveryRule's own four criteria already establish. Set, it must
   *  match this job's own real, resolved value exactly or this rule
   *  is not a candidate at all — never a partial/fuzzy match. */
  specimenCaseType?: SpecimenCaseType;
  eventTriggerType?: EventTriggerType;
  /** Real target this rule resolves to when it wins. */
  printDestination: PrintDestination;
  /** Real, human-readable reason on file — same real posture
   *  RoutingRule.note/DeliveryRule.note already establish for an
   *  admin override this specific to a real, active clinical
   *  workflow. */
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
