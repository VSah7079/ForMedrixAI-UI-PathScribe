// src/types/delivery/DeliveryRule.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec ("Decoupled Dispatch & Print Management
// System", Section 3 — "Delivery Configuration Rules Engine"). All
// four of the source spec's own real criteria (Provider ID, Ordering
// Facility, Patient Location, Report Type) already have real,
// resolvable data in this app today — confirmed directly before
// building anything new:
//   - Provider ID      → Case.order.orderingPhysicianId
//   - Ordering Facility → Case.order.facilityId
//   - Patient Location  → Location.pointOfCare (HL7 PV1-3.1 — "OR",
//     "ICU", etc.), reached via Case.order.locationId
//   - Report Type       → ReportReleasedEvent.reportType
// No new Case/order field was needed for this engine at all.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per the source spec's own "Action Matrix Options" — exactly
 *  these four, no more. */
export type DeliveryAction = 'ELECTRONIC_ONLY' | 'PRINT_ONLY' | 'DUAL' | 'SUPPRESS';

export interface DeliveryRule {
  id: string;
  /** Real, per the source spec's own Rule Criteria — every field here
   *  is optional; the resolver's own real "most-specific-wins" logic
   *  (resolveDeliveryAction.ts) scores a rule by how many of these it
   *  actually specifies, same real precedence convention as
   *  RoutingRule.performingLabFacilityId's own Global-vs-scoped
   *  pattern elsewhere in this app. A rule with zero criteria set
   *  would match every case — deliberately still valid (a real,
   *  site-wide default a facility might want), but the lowest-priority
   *  match whenever anything more specific also matches. */
  providerId?: string;
  orderingFacilityId?: string;
  pointOfCare?: string;
  reportType?: 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM';
  action: DeliveryAction;
  /** Real, deliberate: a rule this specific to a real, active clinical
   *  workflow (a named provider, a named ward) needs a real, human-
   *  readable reason on file — same real posture RoutingRule.note
   *  already establishes for its own admin overrides. */
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
