import { ServiceResult, ID } from '../types';

export interface Physician {
  id: ID;

  // ── Name — medical-grade schema (June 2026), same model as Patient.
  // See utils/personName.ts. Required here (unlike Patient's optional
  // givenNames/familyNames) since there are only 7 seed records to
  // migrate, not 50+.
  namePrefix?: string;
  givenNames: string;
  familyNames: string;
  preferredName?: string;
  nameSuffix?: string;

  /** @deprecated Use givenNames. Always mirrors it — kept for any
   *  consumer not yet migrated to the new fields. */
  firstName: string;
  /** @deprecated Use familyNames. Always mirrors it. */
  lastName: string;

  /** Internal PathScribe identifier for this physician — required,
   *  globally unique, and independent of NPI (PS-73). Not every
   *  physician has an NPI (e.g. UK physicians), but every physician
   *  needs a stable code staff/system can reference regardless of NPI
   *  status. Validated in PhysiciansSection.tsx's own modal, same
   *  single-key `findDuplicate` convention as every other dictionary's
   *  required+unique field (see e.g. DelegationType.id) — not checked
   *  here at the service layer, matching how every sibling dictionary
   *  in this codebase does it. */
  physicianCode: string;
  /** Optional — confirmed not every physician has one (e.g. UK
   *  physicians under RCPath rather than NPI). Uniqueness is only
   *  enforced when a value is present; blank/blank never collides with
   *  another blank. */
  npi: string;
  specialty: string;
  phone: string;
  fax: string;
  email: string;
  preferredContact: 'Email' | 'Fax' | 'Phone';
  clientIds: string[];
  status: 'Active' | 'Inactive' | 'Unverified';
  /** Snapshot fields auto-populated from transaction data */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /**
   * Real, per direct guidance (Physician Master File / Interface
   * Engine sync): which upstream system this physician record was
   * last synced from, and that system's OWN record id for them —
   * together the durable, primary re-match key for every subsequent
   * sync of this same physician, deliberately NOT NPI or name. Not
   * every physician carries an NPI (confirmed directly — international
   * customers especially), and name alone is too weak a key for a
   * periodic authoritative roster feed (two physicians can share a
   * name; a spelling variance can silently fork one physician into
   * two records). NPI/structured-name matching (findOrCreateByNpi/
   * findOrCreateByStructuredName) still resolves the very FIRST sync
   * of a physician never seen before — this pair is what makes every
   * sync after that unambiguous regardless of NPI status. Both
   * optional and additive: a physician entered manually, or synced
   * before this field existed, simply has neither set.
   */
  sourceSystem?: string;
  sourceRecordId?: string;
}

export interface IPhysicianService {
  getAll(): Promise<ServiceResult<Physician[]>>;
  getById(id: ID): Promise<ServiceResult<Physician>>;
  getByNpi(npi: string): Promise<ServiceResult<Physician | null>>;
  /** Server-side (mock: in-memory) filtered search — avoids pulling the
   *  entire physician table into every consumer that just needs a
   *  handful of matches, e.g. a type-ahead picker. Matches name,
   *  specialty, or NPI, case-insensitive. `limit` defaults to 8. */
  search(query: string, limit?: number): Promise<ServiceResult<Physician[]>>;
  /** Order/case intake never carries an NPI in practice (confirmed:
   *  IncomingOrder.requestingProvider and Case.order.requestingProvider
   *  are both bare strings, no NPI field at all) — findOrCreateByNpi is
   *  the wrong shape for that data. This is the real intake-resolution
   *  method: exact-match by parsed name, case-insensitive: if found,
   *  merges clientId into its clientIds if not already present; if not
   *  found, auto-creates an 'Unverified' record, same posture as
   *  Client.findOrCreateByAssigningAuthority / Department.findOrCreateByName —
   *  never blocks case creation on an unrecognized provider. */
  findOrCreateByName(name: string, clientId?: string): Promise<ServiceResult<Physician>>;
  add(physician: Omit<Physician, 'id'>): Promise<ServiceResult<Physician>>;
  update(id: ID, changes: Partial<Omit<Physician, 'id'>>): Promise<ServiceResult<Physician>>;
  verify(id: ID): Promise<ServiceResult<Physician>>;
  deactivate(id: ID): Promise<ServiceResult<Physician>>;
  /** Called by transaction ingestion — creates unverified record if NPI not found */
  /** Real, structured matching — real, per PS-81 (Jira): resolves the
   *  same real gap findOrCreateByName's own free-text parsing can't
   *  fully close. Two real inbound pipelines (ADT's attendingProvider,
   *  Order Intake's requestingProvider) each independently flatten
   *  structured HL7-equivalent name data into a DIFFERENT free-text
   *  string format ("LastName, FirstName" vs "Dr. FirstName
   *  LastName") before ever reaching a resolution step — the same
   *  real physician named in both would resolve to two different
   *  Physician records, confirmed directly via a real test before this
   *  method existed. Matching directly on already-split
   *  familyNames/givenNames sidesteps the format-mismatch entirely -
   *  both pipelines feed the SAME structured shape in here, so the
   *  free-text formatting choice each one happened to make upstream
   *  never matters. Never blocks on ambiguity — matches purely on
   *  name when no real identifier is given, same real, fail-open
   *  posture as every other resolution in this app.
   *
   *  identifiers is a real array, per direct guidance, mirroring
   *  FHIR's own real Practitioner.identifier[] / repeating-XCN
   *  pattern — a physician can genuinely carry more than one real
   *  identifier in the same inbound mention (e.g. a real NPI AND a
   *  real local LIS id at once). Only the first entry with
   *  type: 'NPI' (if any) is used to populate Physician.npi
   *  specifically — every other real identifier type/value is
   *  captured for reference but doesn't write into a dedicated
   *  Physician field (this app's own Physician type only has a
   *  dedicated npi field, not a generic identifiers array). */
  findOrCreateByStructuredName(
    name: {
      namePrefix?: string;
      givenNames: string;
      familyNames: string;
      nameSuffix?: string;
      identifiers?: { value: string; type: string; assigningAuthority?: string }[];
    },
    clientId?: string
  ): Promise<ServiceResult<Physician>>;
  findOrCreateByNpi(npi: string, name: { first: string; last: string }): Promise<ServiceResult<Physician>>;
}
