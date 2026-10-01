// src/services/physicians/PhysicianMasterFileRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// The JSON contract PathScribe expects for a physician roster sync,
// regardless of what the upstream source actually is (HL7 MFN, FHIR
// Practitioner, a vendor API, a flat file). Same architecture boundary
// as everywhere else in this app: PathScribe never parses HL7 or FHIR
// itself — the Interface Engine's job is entirely "translate whatever
// the source sends into this shape." PathScribe only ever reasons about
// this contract.
//
// action is the one thing existing reactive resolution
// (findOrCreateByNpi/findOrCreateByStructuredName) genuinely can't
// express — those only ever add-or-update, inferred from whether a
// match is found. A real roster sync needs an explicit signal for a
// physician leaving practice, not just an inferred one.
// ─────────────────────────────────────────────────────────────────────────────

import type { InboundProviderIdentifier } from './resolveProviderName';

export type PhysicianMasterFileAction = 'ADD' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE';

export interface PhysicianMasterFileRecord {
  action: PhysicianMasterFileAction;

  /**
   * Real, per direct guidance: not every physician has an NPI —
   * international customers especially. Reuses resolveProviderName.ts's
   * own InboundProviderIdentifier exactly (already verified against the
   * real HL7 Table 0203 registry, GMC included as a real UK extension)
   * rather than redefining an equivalent shape — an NPI is just one
   * possible `type` value among others. Only used to resolve the very
   * FIRST sync of a physician PathScribe has never seen before; every
   * sync after that matches on sourceSystem/sourceRecordId instead (see
   * applyPhysicianMasterFileUpdate.ts).
   */
  identifiers?: InboundProviderIdentifier[];

  namePrefix?: string;
  givenNames: string;
  familyNames: string;
  nameSuffix?: string;

  specialty?: string;
  phone?: string;
  fax?: string;
  email?: string;
  preferredContact?: 'Email' | 'Fax' | 'Phone';

  /**
   * The SENDING system's own external facility codes (Facility.
   * assigningAuthority) — never PathScribe's internal Facility.id,
   * which the engine has no way to know. Resolved read-only against
   * existing facilities; an assigning authority with no match is
   * reported back rather than used to auto-create a new Facility —
   * a physician feed doesn't carry enough real facility data
   * (address, roles, jurisdiction) to responsibly create one.
   */
  facilityAssigningAuthorities?: string[];

  /**
   * Which upstream system this record came from, and that system's
   * own id for this physician — the durable, primary re-match key for
   * every sync after the first. See Physician.sourceSystem/
   * sourceRecordId's own doc comment for the full reasoning. Required,
   * not optional: without these, every sync of a no-NPI physician
   * would fall back to name-only matching indefinitely, which is
   * exactly the weak, collision-prone key this whole design avoids.
   */
  sourceSystem: string;
  sourceRecordId: string;

  /** Real-world effective date of this change, if the source system
   *  provides one — administrative/audit only, not consulted for any
   *  matching or resolution logic. */
  effectiveDate?: string;
}
