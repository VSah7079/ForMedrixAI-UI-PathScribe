// src/services/orderIntake/IOrderIntakeService.ts
// ─────────────────────────────────────────────────────────────
// Order intake — the "pending orders queue" an accessioner pulls from on
// the Accession page, and the resolution chain that turns a raw external
// order into real Client/SpecimenCategory references.
//
// Design (from the multi-turn discussion this implements):
//   1. An order arrives from wherever (HL7 listener, partner API, manual
//      entry) as a raw IncomingOrder — never written directly into Case.
//   2. Client resolution reuses Client.assigningAuthority as the crosswalk key directly
//      — no separate client crosswalk table needed. clientService.
//      findOrCreateByAssigningAuthority() already does exact-match-or-auto-create.
//   3. Specimen resolution needs its own crosswalk (SpecimenCodeCrosswalkEntry)
//      because the same external code means different things for
//      different clients — "TISSUE-01" at one hospital's LIS is not
//      necessarily the same thing as "TISSUE-01" at another's. No
//      crosswalk match → SpecimenCategory.findOrCreateByName(), same
//      auto-create-pending + notify-admin posture as everywhere else in
//      this app (IPhysicianService.findOrCreateByNpi, etc.) — order
//      processing is never blocked by an unrecognized code.
//   4. Resolution never mutates the raw order's externalAssigningAuthority/
//      externalSpecimenCode fields — those stay as received, for audit,
//      even after clientId/specimenCategoryId are filled in alongside them.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { Icd10Code } from '../diagnosisCodes/IDiagnosisCodesService';
import type { InboundProviderIdentifierType } from '../physicians/resolveProviderName';

// ─── Crosswalk ──────────────────────────────────────────────────────────────

/**
 * Maps one client's local specimen code to a specific Specimen Dictionary
 * entry (SpecimenEntry) — not directly to a SpecimenCategory. Resolving to
 * the specific dictionary entry first (e.g. "Left breast core biopsy")
 * preserves the actual specimen type; the coarse category then follows
 * transitively via that entry's own specimenCategoryId, rather than
 * collapsing the crosswalk straight down to the category and losing the
 * specific type. Scoped per client (not global) because the same code
 * string means different things at different sending systems.
 */
/** Which real coding system an inbound order code was expressed in.
 *  'HL7_LOCAL' covers a sending system's own site-specific code table
 *  (the historical default — every crosswalk entry before this field
 *  existed is implicitly this). Optional: absent means the same thing
 *  'HL7_LOCAL' would, for entries created before multi-code-system
 *  matching existed. */
export type OrderCodeCodingSystem = 'HL7_LOCAL' | 'LOINC' | 'SNOMED';

export interface SpecimenCodeCrosswalkEntry {
  id: ID;
  clientId: string;
  externalCode: string;
  /** Optional, additive — see OrderCodeCodingSystem's own doc comment.
   *  Lets the same raw code string be crosswalked differently per
   *  coding system when a sending message carries more than one (e.g.
   *  a local code AND a LOINC code for the same order) — resolution
   *  tries them in a real priority order (local → LOINC → SNOMED)
   *  rather than only ever matching on one. */
  codingSystem?: OrderCodeCodingSystem;
  /** Optional — only meaningful for a multi-site organisation that
   *  wants the SAME client's code to route differently depending on
   *  which of the organisation's own Sites processes it (matches
   *  Site.id from services/organisation/organisationService.ts).
   *  Absent means "applies org-wide," same undefined-means-global
   *  convention as Facility.performingLabFacilityId elsewhere in this
   *  codebase — most crosswalk entries will never need this set. */
  siteId?: string;
  /** References SpecimenEntry.id (Specimen Dictionary). */
  dictionaryEntryId: string;
  createdAt: string;
  /** 'system' for an entry auto-learned from a confirmed AI suggestion
   *  (per the "unblock now, admin approves after" design) — vs an admin's
   *  user id for one entered directly in config. */
  createdBy: string;
}

// ─── Incoming order ─────────────────────────────────────────────────────────

export interface IncomingOrderSpecimen {
  description: string;
  /** The client's local code for this specimen type, if the source
   *  message carried one (not all sources will — manual/API orders may
   *  arrive as description-only). */
  externalSpecimenCode?: string;
  /** Which coding system externalSpecimenCode is expressed in — see
   *  OrderCodeCodingSystem's own doc comment. Absent is treated as
   *  'HL7_LOCAL', matching every order received before this field
   *  existed. The interface engine (not PathScribe — see
   *  services/hl7/README.md's own architecture note) is responsible
   *  for populating this correctly from whichever HL7v2/FHIR field the
   *  source system actually carried it in. */
  externalCodingSystem?: OrderCodeCodingSystem;
  /** Filled in once resolved via crosswalk or findOrCreateByName —
   *  undefined until resolveIncomingOrder() has run. */
  /** Filled in once resolved via the crosswalk (SpecimenCodeCrosswalkEntry
   *  → SpecimenEntry) or SpecimenDictionaryService.findOrCreateByName —
   *  the specific dictionary entry, e.g. "Left breast core biopsy". */
  dictionaryEntryId?: string;
  /** True if dictionaryEntryId came from findOrCreateByName's fallback
   *  (i.e. a brand-new pending dictionary entry) rather than an existing
   *  crosswalk match — lets the Accession page flag it for extra
   *  attention, same role categoryWasAutoCreated used to play. */
  dictionaryEntryWasAutoCreated?: boolean;
  /** Derived transitively from dictionaryEntryId's own specimenCategoryId
   *  (Specimen Dictionary entries carry their category — see
   *  SpecimenEntry.specimenCategoryId) rather than resolved directly
   *  against SpecimenCategory itself. Still populated here, unchanged
   *  in shape, so existing consumers (grossing-template routing,
   *  accession-number series selection) don't need to change. */
  specimenCategoryId?: string;
  /** True if specimenCategoryId came from findOrCreateByName's fallback
   *  (i.e. a brand-new pending category) rather than an existing crosswalk
   *  match — lets the Accession page flag it for extra attention. */
  categoryWasAutoCreated?: boolean;
  specimenType?: string;
  bodySite?: string;
  laterality?: string;
  collectedAt?: string;
}

/** Real, structured provider shape, per PS-81 (Jira) — matches the
 *  real, verified template already established for this exact real-
 *  world concept in this app's own interface spec (Part E's own
 *  orderingProvider: {npi?, lastName?, firstName?, contactPhone?,
 *  rawName?}), confirmed directly before designing this: no real
 *  inbound-order-receiving section exists anywhere in that spec (only
 *  outbound Order Creation, Part E) — this app's own IncomingOrder
 *  pipeline has no real, external, governed contract of its own yet.
 *  Reusing the closest real precedent keeps this internally
 *  consistent rather than inventing an unrelated shape.
 *
 *  rawName is required — same "always present" guarantee the old,
 *  plain string field had; a real order always carries SOME text for
 *  who requested it, even when a confident given/family split isn't
 *  possible. familyNames/givenNames are optional, best-effort
 *  components — resolveProviderName (services/physicians/) falls back
 *  to matching on rawName alone as free text when familyNames isn't
 *  populated, rather than guessing at a split. */
export interface IncomingOrderProvider {
  rawName: string;
  namePrefix?: string;
  givenNames?: string;
  familyNames?: string;
  nameSuffix?: string;
  identifiers?: { value: string; type: InboundProviderIdentifierType; assigningAuthority?: string }[];
}

export interface IncomingOrder {
  id: ID;
  externalOrderNumber: string;
  source: 'hl7' | 'api' | 'manual';
  receivedAt: string;
  status: 'pending' | 'linked' | 'cancelled';
  /** Set once an accessioner has turned this into a real Case via the
   *  Accession page's "Import from Order" flow. */
  linkedCaseId?: string;

  /** Raw assigning authority exactly as received — always kept, even after
   *  clientId is resolved, for audit/debugging. */
  externalAssigningAuthority: string;
  /** Filled in by resolveIncomingOrder() — the real Client.id, existing
   *  or freshly auto-created via findOrCreateByAssigningAuthority. */
  clientId?: string;
  /** True if clientId came from findOrCreateByAssigningAuthority's fallback (a
   *  brand-new pending client) rather than an existing match. */
  clientWasAutoCreated?: boolean;
  /** Real, new field, per PS-81 (Jira) — filled in by resolveOrder(),
   *  the real, stable Physician.id (services/physicians/) that
   *  requestingProvider resolved against, via resolveProviderName.
   *  Matches Encounter.attendingProviderPhysicianId's exact pattern on
   *  the ADT side. Undefined when resolution didn't produce a real
   *  match yet (order not resolved), or genuinely couldn't (no real
   *  family name available even in requestingProvider.rawName). */
  requestingProviderPhysicianId?: string;

  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    sex?: 'M' | 'F' | 'U';
    mrn?: string;
  };
  encounterNumber?: string;
  requestingProvider: IncomingOrderProvider;
  priority?: 'Routine' | 'STAT';
  clinicalIndication?: string;
  /** Diagnosis codes as received on the referral, if any — real orders
   *  frequently carry these already. Auto-populates the Accession
   *  form's ICD-10 field the same way clinicalIndication already does,
   *  rather than always starting that field empty. */
  icd10Codes?: Icd10Code[];
  specimens: IncomingOrderSpecimen[];

  /** Original payload, kept for audit/debugging parse failures — not the
   *  source of truth once resolved, just a paper trail. Undefined for
   *  manually-entered orders (there's no wire payload to keep). */
  rawMessage?: string;
}

// ─── Resolution result ────────────────────────────────────────────────────

export interface OrderResolutionResult {
  order: IncomingOrder;
  /** Non-fatal notes about what got auto-created along the way — same
   *  never-hard-fail pattern as evaluateGrossingTemplateAssignment's
   *  warnings array. Empty when everything matched an existing
   *  client/category cleanly. */
  warnings: string[];
}

// ─── Service interface ────────────────────────────────────────────────────

export interface IOrderIntakeService {
  listPendingOrders(params?: { clientId?: string }): Promise<ServiceResult<IncomingOrder[]>>;
  getOrder(orderId: ID): Promise<ServiceResult<IncomingOrder>>;
  markOrderLinked(orderId: ID, caseId: string): Promise<ServiceResult<IncomingOrder>>;
  /** Lets a mock — or eventually a real HL7 listener / API webhook — inject
   *  a new order into the pending queue. */
  receiveOrder(order: Omit<IncomingOrder, 'id' | 'status' | 'receivedAt'>): Promise<ServiceResult<IncomingOrder>>;

  /**
   * Runs client + per-specimen category resolution on a pending order:
   * Client.assigningAuthority exact match (or findOrCreateByAssigningAuthority fallback), then
   * per-specimen crosswalk match (or SpecimenCategory.findOrCreateByName
   * fallback). Idempotent — safe to call again on an already-resolved
   * order (re-resolves from current crosswalk state, e.g. after an admin
   * verifies a pending category).
   */
  resolveOrder(orderId: ID): Promise<ServiceResult<OrderResolutionResult>>;

  // ── Crosswalk management ──────────────────────────────────────────────
  listCrosswalkEntries(clientId?: string): Promise<ServiceResult<SpecimenCodeCrosswalkEntry[]>>;
  addCrosswalkEntry(entry: Omit<SpecimenCodeCrosswalkEntry, 'id' | 'createdAt'>): Promise<ServiceResult<SpecimenCodeCrosswalkEntry>>;
}
