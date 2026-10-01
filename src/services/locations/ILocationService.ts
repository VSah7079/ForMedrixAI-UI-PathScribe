// src/services/locations/ILocationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct confirmation: "we will need to accept PV1 HL7
// data, but I don't believe we have Location / Rooms defined in config.
// They would naturally be associated to the Facility."
//
// Confirmed before building: real PV1 parsing already existed
// (services/hl7/adtParser.ts's parsePV1) and already fed a real Encounter
// entity (services/encounters/) — but ward/room/bed/facility were always
// plain free-text strings, with zero structured dictionary behind them.
// Any string arriving in an inbound PV1 was accepted and stored as-is.
//
// This is that dictionary — scoped to facilityId, matching the confirmed
// design ("naturally associated to the Facility"). Same
// findOrCreateByAssigningAuthority-style resolution pattern already
// established for Facility/Physician/Department: a real match
// resolves cleanly, no match auto-creates an Unverified record for admin
// review rather than silently accepting unvalidated data or dropping it.
//
// Real HL7 PV1-3 (Assigned Patient Location) component structure, per
// direct confirmation ("include the standards") — modeling the full,
// real 8-component structure this app's parser is extended to read, not
// just the 4 (pointOfCare/room/bed/facility) it read before:
//   PV1-3.1 Point of Care        PV1-3.5 Location Status
//   PV1-3.2 Room                 PV1-3.6 Person Location Type
//   PV1-3.3 Bed                  PV1-3.7 Building
//   PV1-3.4 Facility              PV1-3.8 Floor
// (PV1-3.4 Facility is the HL7 message's own facility code for this
// location, distinct from this app's Facility.id — kept as a raw string
// for crosswalk/audit, same posture as other raw-vs-resolved id pairs
// elsewhere in this app.)
//
// locationStatus (PV1-3.5, HL7 Table 0306) and personLocationType
// (PV1-3.6, HL7 Table 0305) are both real, standard HL7 tables, but
// explicitly "user-defined" in the spec itself — sites commonly extend
// them. Modeled as guided free text (a real, standard suggested list,
// not a closed enum) rather than a rigid union that could reject a
// legitimate, real site-specific value.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

/** HL7 Table 0306 (Bed Status) — the standard's own real, defined
 *  values. Site-specific extensions are real and valid too; this is
 *  the suggested list an admin UI offers, not an enforced union. */
export const HL7_LOCATION_STATUS_OPTIONS = [
  'Closed', 'Housekeeping', 'Isolated', 'Contaminated', 'Occupied', 'Unoccupied',
] as const;

/** HL7 Table 0305 (Person Location Type) — same real, standard/
 *  site-extensible posture as above. */
export const HL7_PERSON_LOCATION_TYPE_OPTIONS = [
  'Bed', 'Corridor', 'Department', 'Home', 'Nursing Unit', 'Operating Room', "Provider's Office", 'Room', 'Radiology',
] as const;

export interface Location {
  id: ID;
  /** Which Facility (services/facilities/) this location belongs to —
   *  confirmed directly: "They would naturally be associated to the
   *  Facility." */
  facilityId: string;
  /** PV1-3.1 — the ward/unit. The real, primary identifying field for
   *  a location; always present on a real, resolved record. */
  pointOfCare: string;
  /** PV1-3.2 */
  room?: string;
  /** PV1-3.3 */
  bed?: string;
  /** PV1-3.4 — the HL7 message's own facility code for this location,
   *  as a raw string. Distinct from facilityId (this app's real,
   *  resolved Facility.id) — kept for crosswalk/audit visibility,
   *  same posture as other raw-vs-resolved id pairs elsewhere in this
   *  app (e.g. IncomingOrder's own externalAssigningAuthority vs the
   *  resolved Facility). */
  hl7FacilityCode?: string;
  /** PV1-3.5 (HL7 Table 0306) — see HL7_LOCATION_STATUS_OPTIONS. */
  locationStatus?: string;
  /** PV1-3.6 (HL7 Table 0305) — see HL7_PERSON_LOCATION_TYPE_OPTIONS. */
  personLocationType?: string;
  /** PV1-3.7 */
  building?: string;
  /** PV1-3.8 */
  floor?: string;
  status: 'Active' | 'Inactive' | 'Unverified';
  /** True if this location was auto-created by inbound PV1 resolution
   *  (no crosswalk match for the parsed ward/room/bed at this
   *  facility) rather than configured by an admin. Same governance
   *  shape as Facility.autoCreated / Physician.autoCreated. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Free-text note left by auto-creation — the raw PV1-3 string that
   *  didn't match anything, kept so the admin reviewing it has
   *  context. */
  autoCreatedNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ILocationService {
  getAll(): Promise<ServiceResult<Location[]>>;
  /** Every real location configured for a given facility — the real,
   *  common access pattern (an admin managing "what rooms does this
   *  facility have," or a resolver narrowing its crosswalk search to
   *  the right facility first). */
  listForFacility(facilityId: string): Promise<ServiceResult<Location[]>>;
  getById(id: ID): Promise<ServiceResult<Location>>;
  create(draft: Omit<Location, 'id'>): Promise<ServiceResult<Location>>;
  update(id: ID, changes: Partial<Omit<Location, 'id'>>): Promise<ServiceResult<Location>>;
  deactivate(id: ID): Promise<ServiceResult<Location>>;
  reactivate(id: ID): Promise<ServiceResult<Location>>;
  /** Flips an Unverified location to Active — the admin-approval step,
   *  same convention as Facility.verify. */
  verify(id: ID): Promise<ServiceResult<Location>>;
  /**
   * Real, direct crosswalk resolution for an inbound PV1: matches on
   * (facilityId, pointOfCare, room, bed) — the real, standard identity
   * of a location within one facility. No match → creates an
   * Unverified, autoCreated location so processing can continue
   * immediately, defaulting the rest (locationStatus, personLocationType,
   * building, floor) from whatever the same inbound message carried.
   * Mirrors IFacilityService.findOrCreateByAssigningAuthority in
   * spirit; returns the real outcome explicitly (matching
   * resolveOrCreatePatient's own 'matched'/'created' vocabulary)
   * rather than leaving a caller to infer it indirectly.
   */
  findOrCreateByPV1(input: {
    facilityId: string;
    pointOfCare: string;
    room?: string;
    bed?: string;
    hl7FacilityCode?: string;
    locationStatus?: string;
    personLocationType?: string;
    building?: string;
    floor?: string;
  }): Promise<ServiceResult<{ location: Location; outcome: 'matched' | 'created' }>>;
}
