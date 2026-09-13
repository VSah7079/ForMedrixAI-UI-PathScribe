// src/services/facilities/IFacilityService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Canonical Facility type + service interface. Replaces IClientService.ts's
// Client entirely (renamed, not a new type sitting alongside the old one).
//
// Real feature, per direct confirmation: "One record per facility. Multiple
// roles attached to that record... Example: Facility: Fenwick General
// Hospital — Role: Performing Lab, Role: Internal Submitting Location,
// Role: Internal Ordering Client (if applicable), Role: HL7/FHIR Routing
// Endpoint (if applicable). This keeps the identity unified while allowing
// the system to treat the facility differently depending on context."
//
// Replaces the old clientType: 'internal' | 'external' toggle (which forced
// a facility to be exactly one of two things, and drove the domain leakage
// this whole redesign started from — AI/timeout settings living on every
// Client regardless of type) with `roles: FacilityRole[]`. Config sections
// are now gated by role membership, not by a fixed internal/external
// branch: LIS routing metadata is real per-facility overridable data
// (see FacilityLisRouting), AI
// Orchestrator/Model/idle-timeout only apply when performing_lab is
// present (confirmed directly: "AI inference is strictly part of the
// performing lab's diagnostic workflow... AI configuration should be gated
// exclusively by the performing_lab role"), report delivery/TAT/escalation
// only apply when an ordering-client role is present.
//
// The AI/timeout settings that briefly lived in their own
// services/performingLabs/IPerformingLabService.ts (a real, separate
// service + its own admin screen) are folded directly back onto Facility
// here — that split solved the domain-leakage problem but created a real
// workflow problem instead ("I would need to go to the client dictionary
// to create the internal client, update those settings, then go to the
// performing lab section to apply those responses, not very good
// workflow"). One record, one screen, sections gated by role checkboxes,
// is the actual fix for both problems at once.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import type { Jurisdiction } from '../../types/systemConfig';

export type FacilityRole =
  | 'performing_lab'
  | 'internal_submitting_location'
  | 'internal_ordering_client'
  | 'external_ordering_client'
  | 'specimen_acquisition'
  | 'reference_lab';

export const FACILITY_ROLE_LABELS: Record<FacilityRole, string> = {
  performing_lab: 'Performing Lab',
  internal_submitting_location: 'Internal Submitting Location',
  internal_ordering_client: 'Internal Ordering Facility',
  external_ordering_client: 'External Ordering Facility',
  /** Real, per direct guidance: distinct from every other role above,
   *  which describe how a facility participates in the order/routing/
   *  billing workflow. Specimen Acquisition is about whether this
   *  facility is where a real specimen is actually collected from a
   *  patient - gates placeOfServiceCodeId below, since POS reflects
   *  the setting where the specimen was acquired, confirmed directly
   *  against current CMS guidance (POS follows the patient's own
   *  setting, never the performing lab's location) - a more direct,
   *  pathology-specific name than a general "Patient Care" label,
   *  per direct feedback. */
  specimen_acquisition: 'Specimen Acquisition',
  /** Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
   *  Laboratory Specimen Referral gap — genuinely the inverse
   *  direction from every ordering-client role above: this facility
   *  is somewhere OUR lab sends specimens TO for outsourced,
   *  specialized testing (molecular, NGS, reference IHC), never
   *  somewhere that sends orders to us. Reuses the same one-record,
   *  multiple-roles Facility architecture rather than a new,
   *  parallel "external lab" entity. */
  reference_lab: 'Reference Lab (Outbound Referral Destination)',
};

// Real, new: per direct request, further defines what each real role
// means beyond its short label — shown as a hover tooltip on each
// checkbox in FacilityEditorModal.tsx. Grounded in each role's own real,
// verified behavior, not just a restatement of the label — where a
// role genuinely gates a real field or tab, that's named directly;
// where it doesn't (internal_submitting_location and the two
// ordering-client roles currently gate no specific UI section of
// their own, confirmed via a real, direct search before writing
// this), the tooltip explains the real, conceptual distinction
// instead, without implying hidden behavior that doesn't exist.
export const FACILITY_ROLE_TOOLTIPS: Record<FacilityRole, string> = {
  performing_lab: "This facility's own lab performs the diagnostic work. Reveals the CLIA/ISO Accreditation Number field and the AI & Performance tab (orchestrator, model eligibility, code-review sampling, Four-Eyes billing approval).",
  internal_submitting_location: 'A location within your own network that specimens are physically sent from — distinct from who ordered the test or is billed for it.',
  internal_ordering_client: 'A location within your own network that originates real orders and is billed internally. Governs pediatric access and TAT/escalation settings.',
  external_ordering_client: 'An outside hospital, clinic, or practice that orders services from you and is billed externally. The default for a newly added facility. Governs pediatric access and TAT/escalation settings.',
  specimen_acquisition: "Where a real specimen is actually collected from a patient. Reveals the Place of Service Code field — POS reflects the specimen's own setting, never the performing lab's location, per CMS guidance.",
  reference_lab: 'Somewhere your lab sends specimens TO for outsourced, specialized testing (e.g. molecular, NGS, reference IHC) — the reverse direction from an ordering-client role. Makes this facility selectable as a destination when creating an outbound referral batch.',
};

export interface FacilityReportingPreferences {
  reportFormat: 'PDF' | 'HL7' | 'Both';
  deliveryMethod: 'Email' | 'Fax' | 'Portal' | 'HL7';
  autoRelease: boolean;
  copyToReferring: boolean;
}

/** Real, per direct guidance — the real, consolidated Interface
 *  Engine connection. Deliberately Enterprise-only, never overridden
 *  per facility: per direct architectural correction, PathScribe
 *  maintains one physical connection (a single primary pipeline, or a
 *  redundant pair for HA) to the Interface Engine itself, which then
 *  routes/transforms to whichever real downstream LIS a given message
 *  actually belongs to. There is deliberately no per-facility version
 *  of this type - a facility that needed its own genuinely separate
 *  physical connection would be a different Enterprise, not an
 *  override of this one. See FacilityLisRouting below for what a
 *  facility genuinely can override (routing metadata, never a new
 *  socket). Migrated here from Site (services/organisation/), which
 *  briefly held equivalent fields per-Site earlier this session -
 *  reconsidered directly, twice: first from Site to a per-facility
 *  override model, now correctly consolidated to Enterprise-only
 *  given this real architectural picture. Also absorbs
 *  hl7Version, migrated from the retired FacilityHL7Settings
 *  (hl7_routing_endpoint role, also retired) - the real overlap
 *  confirmed directly before merging: FacilityHL7Settings'
 *  sendingFacility/receivingFacility were the exact same MSH-4/MSH-6
 *  concept FacilityLisRouting represents, just without any real
 *  Enterprise-default-with-override model, since it predates that
 *  architecture being clarified. hl7Version itself is a property of
 *  how PathScribe formats messages for the shared Interface Engine
 *  connection - one value per Enterprise, not per-facility routing
 *  metadata, so it belongs here rather than in FacilityLisRouting.
 *  There's deliberately no separate "enabled" flag either - the
 *  presence of a real, configured connection on the Enterprise IS
 *  the enabled signal, same "absence means off" convention used
 *  elsewhere in this app (e.g. idleTimeoutMinutesOverride). */
export interface FacilityInterfaceEngineConnection {
  endpoint: string;
  hl7Version?: string;         // e.g. "2.5.1"
  /** Deliberately NOT a place to store the real secret value itself -
   *  see credentialConfigured below for why. */
  authType?: 'none' | 'basic' | 'oauth2' | 'api_key';
  /** A plain boolean, not the credential itself - whether a real
   *  credential has been provisioned for this connection (presumably
   *  via a real secrets manager this app doesn't model), never the
   *  actual secret value. Never persisted alongside a real password/
   *  key/token field - deliberately, this type has none. */
  credentialConfigured?: boolean;
  /** Whether the connected LIS (reached via the Interface Engine, not
   *  a direct PathScribe connection) is the real system of record for
   *  major case statuses, vs. PathScribe owning that state itself. */
  lisOwnsStatuses: boolean;
  /** Whether a pathologist can initiate a real Addendum/Amendment
   *  directly in PathScribe, vs. being directed to the LIS for that
   *  action. */
  allowPathScribePostFinalActions: boolean;
}

/** Real, per direct guidance — the real, per-facility-overridable
 *  routing metadata sent alongside every real message to the shared
 *  Interface Engine connection (FacilityInterfaceEngineConnection
 *  above) - never a new physical connection. Real HL7 MSH-4/MSH-6
 *  equivalents (or a FHIR meta.source-style identifier for JSON/REST),
 *  which the Interface Engine's own conditional routing rules key
 *  off of to decide where a message actually needs to go (e.g. "if
 *  MSH-4 == 'SURGI_CENTER_NORTH', routeTo(Local_Surgi_Channel); else
 *  routeTo(Enterprise_Core)"). An Enterprise-tagged facility sets
 *  this as the real, shared default every non-overriding affiliate
 *  sends unchanged; an affiliate only sets its own copy when it
 *  genuinely needs different routing (e.g. hasn't yet migrated onto
 *  the Trust's shared system) - per direct guidance, keep both the
 *  Enterprise id and the resolved facility id in every real payload,
 *  even when the facility is just using the Enterprise default
 *  unchanged, so the Interface Engine always has both to route on. */
export interface FacilityLisRouting {
  sendingFacilityId: string;
  receivingFacilityId?: string;
  /** A real, distinct outbound channel target (e.g. a specific SFTP
   *  folder, a local VPN listener) for a facility that genuinely
   *  needs one - still real routing metadata told to the Interface
   *  Engine, never a new socket PathScribe itself opens. */
  outboundChannelOverride?: string;
}

/** Real, per direct guidance — which real identifier formats
 *  (types/systemConfig.ts's own IDENTIFIER_FORMAT_LIBRARY) this real
 *  Enterprise has explicitly enabled, real, per-facility-overridable,
 *  same real Enterprise-default-with-override shape as
 *  FacilityLisRouting above - confirmed directly, same real
 *  underlying reason: a format's own real relevance is driven partly
 *  by LisPreset (copath/epic_beaker/sunquest/etc.), and "a Trust or
 *  Multihospital would generally have one LIS" applies here exactly
 *  as it did for FacilityInterfaceEngineConnection/FacilityLisRouting
 *  - the same shared system that determines routing also determines
 *  which identifier/barcode formats it actually produces. Real,
 *  deliberate scope: only the *enabled-format-id* decision moves
 *  here - jurisdiction-based candidate filtering (which formats are
 *  even relevant) stays exactly where it already correctly was,
 *  Facility.jurisdiction, untouched by this change. Undefined/null
 *  means this facility falls back to the real library's own
 *  jurisdiction-matched defaults (IDENTIFIER_FORMAT_LIBRARY, same
 *  fallback behavior this app already had) - not to the Enterprise's
 *  own set unconditionally, since a genuinely non-enterprise-scoped
 *  facility (no real parentId) still needs a sensible real default.
 *  Real, per direct guidance's own explicit resolution split: this
 *  Enterprise/override model is for real, facility-specific contexts
 *  (creating or viewing a case tied to a known facility) - the
 *  globally-scoped consumers (ScannerProvider, CaseSearchBar,
 *  SearchPage, none of which have a real, reliable facility context
 *  to resolve against) instead use a real union of every real
 *  Enterprise's own enabled set, confirmed directly as the right
 *  real approach for that specific, narrower problem - see
 *  resolveUnionOfEnabledIdentifierFormatIds() below. */
export interface FacilityIdentifierFormatSelection {
  enabledFormatIds: string[];
}

export interface Facility {
  id: ID;
  name: string;
  /** HL7v2/FHIR Assigning Authority — the organizational namespace/
   *  facility/system that assigns identifiers (case numbers, accession
   *  numbers, local specimen IDs) for this facility. Same field, same
   *  crosswalk role (matched against
   *  IncomingOrder.externalAssigningAuthority) as before the rename. */
  assigningAuthority: string;
  address: string;
  /** Optional — not populated by existing seed data or most consumers. */
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax: string;
  email: string;
  /**
   * Real, per direct guidance (Outside Client Support & International
   * Financial Class Architecture Specification, Section 4.2 dynamic-
   * behavior rule 1): "Selecting an Outside Client automatically sets
   * default billing preferences... based on the client's master
   * contract profile." This is that real default — free text (e.g.
   * "Client Bill (Direct Contract)", "Direct Patient/Insurance Bill"),
   * not a fixed enum, since a real contract's own billing arrangement
   * language varies by client and isn't standardized anywhere in this
   * app yet. Read by AccessionPage.tsx's Outside Patient Data tab to
   * auto-populate OutsidePatientFinancialData.accountBillingType when
   * a Client Account is selected — always editable there, never
   * locked to this default.
   */
  defaultAccountBillingType?: string;

  // ── Contact person name — medical-grade schema, same model as
  // Patient/Physician. All optional since a facility's contact person is
  // itself optional data. See utils/personName.ts.
  contactNamePrefix?: string;
  contactGivenNames?: string;
  contactFamilyNames?: string;
  contactPreferredName?: string;
  contactNameSuffix?: string;
  /** @deprecated Use contactGivenNames/contactFamilyNames. Derived
   *  display string, kept for FacilityTable.tsx and any other consumer
   *  reading a single contact name string. */
  contactName?: string;
  contactTitle?: string;
  notes?: string;

  /** Real feature, per direct confirmation: "One record per facility.
   *  Multiple roles attached to that record." Replaces the old
   *  clientType: 'internal' | 'external' toggle — a facility can hold
   *  any combination of roles simultaneously (e.g. performing_lab +
   *  internal_submitting_location on the same record). Every config
   *  section below that used to be gated by clientType === 'internal'
   *  or 'external' is now gated by roles.includes(...) instead — see
   *  each section's own doc comment for which role(s) it depends on.
   *  Defaults to ['external_ordering_client'] for a brand-new facility
   *  — the common case (most facilities added by an admin are
   *  external ordering clients); revisit per real facility. */
  roles: FacilityRole[];
  /** General "parent facility" relationship — an affiliate points to
   *  its parent institution's Facility.id. Not specific to any one
   *  role: a facility's parent might itself hold different roles than
   *  the affiliate does. */
  parentId?: string;
  /** Real, per direct guidance: marks this facility as a top-level
   *  Enterprise institution — the only kind of facility a real
   *  affiliate's own parentId (above) can point to. Deliberately its
   *  own boolean, not a FacilityRole value: every real role above
   *  describes workflow participation (performs work, submits orders,
   *  routes messages) and a facility can hold several simultaneously;
   *  Enterprise is a different kind of classification entirely -
   *  hierarchy position, not workflow role - so mixing it into the
   *  same roles array would conflate two genuinely different axes.
   *  Same real term this app already uses elsewhere for exactly this
   *  concept (BillingRuleVersion's own "enterprise-wide canonical
   *  rule," the Billing Dictionary's "Viewing: Enterprise-Wide"),
   *  reused deliberately rather than introducing a competing term. */
  isEnterprise?: boolean;
  /** Real, per direct guidance — the real, physical connection to
   *  this Enterprise's own Interface Engine instance. Only meaningful
   *  when isEnterprise is true; a real, deliberate architectural
   *  correction confirmed directly: per real interface-engine
   *  architecture ("your application maintains a single primary
   *  connection pipeline to the Interface Engine... the Interface
   *  Engine then routes/transforms to the actual LIS endpoints"),
   *  PathScribe never opens a direct connection to any individual
   *  facility's own LIS - only to the Interface Engine, once, per
   *  Enterprise. There is deliberately no facility-level override of
   *  this field; see lisRouting below for what a facility genuinely
   *  can override (routing metadata, never a new physical
   *  connection) - see FacilityInterfaceEngineConnection's own doc
   *  comment for the fuller account, including two real, earlier
   *  reconsiderations of where these fields should live before this
   *  one. */
  interfaceEngineConnection?: FacilityInterfaceEngineConnection | null;
  /** Real, per direct guidance — the real, per-facility-overridable
   *  routing metadata (sendingFacilityId/receivingFacilityId/
   *  outboundChannelOverride) sent alongside every real message to
   *  the shared Enterprise interfaceEngineConnection above -
   *  deliberately separate from it, per direct architectural
   *  guidance to "decouple physical connectivity from logical
   *  routing." Undefined/null means this facility sends the
   *  Enterprise parent's own default routing metadata unchanged (via
   *  parentId, which can only point to an isEnterprise facility) -
   *  only a real, explicit override when set here directly. On an
   *  Enterprise-tagged facility itself, this IS the real, shared
   *  default every non-overriding affiliate uses. Per direct
   *  confirmation, override capability is genuinely important - not
   *  every facility affiliated with a Trust has necessarily migrated
   *  onto its shared routing yet, a real, common state during a real
   *  hospital acquisition/integration. Resolve via
   *  resolveLisRoutingForFacility() below, never a direct field
   *  read. */
  lisRouting?: FacilityLisRouting | null;
  /** Real, per direct guidance — real, explicit override of which
   *  identifier formats are enabled for this facility specifically,
   *  or (on an Enterprise-tagged facility) the real, shared default
   *  every non-overriding affiliate falls back to. See
   *  FacilityIdentifierFormatSelection's own doc comment for the
   *  full account, including the real, separate approach used for
   *  globally-scoped consumers with no facility context to resolve
   *  against. Resolve via resolveIdentifierFormatsForFacility()
   *  below, never a direct field read. */
  identifierFormats?: FacilityIdentifierFormatSelection | null;
  /**
   * Which facility's lab actually performs work ordered by this
   * facility. Real, admin-configured data — set once, deliberately —
   * never inferred from who happens to be logged in or accessioning at
   * the time. Resolution: this field if set, else the facility's own id
   * if it holds the performing_lab role, else undefined (a facility
   * with no performing_lab role and no override has no lab of its own
   * by definition, and must have this set explicitly).
   *
   * This is administrative/default attribution only — which facility is
   * nominally responsible for another's work. Deliberately separate
   * from real-time physical specimen tracking (where a given block
   * actually sits right now), which is a real, larger, separate
   * concept, flagged as future work, not built here.
   */
  performingLabFacilityId?: string;
  /** Real, per direct guidance — migrated here from Site
   *  (services/organisation/organisationService.ts), where it was
   *  originally placed earlier this session. Reconsidered directly:
   *  a CLIA/ISO accreditation number is a real, regulatory
   *  characteristic of *the entity performing the work*, which this
   *  app already models correctly via the performing_lab role on
   *  Facility - not via Site, which represents PathScribe's own
   *  internal deployment/organisational structure (accessioning,
   *  billing-rule-version scoping, deployment defaults) - a genuinely
   *  different concern. Only meaningful when roles
   *  includes 'performing_lab'. Free text, not a validated format -
   *  a real CLIA number (US) and a real ISO/UKAS accreditation number
   *  (UK/other) have genuinely different real formats, and this app
   *  doesn't have a verified format spec for either to validate
   *  against, so this deliberately doesn't pretend to. */
  cliaOrIsoNumber?: string;
  /** Real, per direct guidance — Phase 3 of the Organisation/Site ->
   *  Facility migration (originSiteId step). Migrated here from
   *  Site.billingDosRule (organisation/organisationService.ts) for
   *  the same real reason as cliaOrIsoNumber just above: a billing
   *  date-of-service override is a real, jurisdictional/contractual
   *  characteristic of the entity actually performing the work, not
   *  of PathScribe's own internal deployment structure. Confirmed
   *  directly before migrating: no real seed Site had this ever
   *  actually set (every site relied on the country-based default in
   *  resolveBillingDateOfService.ts's own defaultRuleForCountry), so
   *  there was no real data to carry forward — this starts
   *  undefined here exactly as it did there. Only ever a real,
   *  explicit override; undefined means the country-based default
   *  applies. See resolveBillingDateOfService.ts's own doc comment
   *  for the full reasoning on when a real override is warranted. */
  billingDosRule?: 'COLLECTION_DATE' | 'SIGNOUT_DATE' | 'ACCESSION_DATE';
  /** Real field. Only meaningful when roles includes
   *  'specimen_acquisition' - a real Place of Service code describes
   *  the setting where the patient encounter/specimen collection
   *  happened, confirmed directly against current CMS guidance, never
   *  the performing lab's own location. Stores the real, two-digit
   *  CMS code (e.g. "11") as a logical reference into the real,
   *  versioned PlaceOfServiceCode dictionary
   *  (services/billing/mockPlaceOfServiceCodeService.ts,
   *  types/billing/PlaceOfServiceCode.ts) - resolve via that
   *  service's getActiveCode(code), not a direct id lookup, since
   *  (code, version) is the dictionary's own real unique key. Wired
   *  to a real picker in FacilityEditorModal.tsx. */
  placeOfServiceCodeId?: string;
  /** Only meaningful when roles includes 'internal_ordering_client' or
   *  'external_ordering_client' — otherwise present but unused/not
   *  surfaced in the editor. */
  reporting: FacilityReportingPreferences;

  /**
   * Per-facility jurisdiction — drives patient ID validation (NHS Number
   * vs CHI Number vs US MRN, etc.), date/time locale, and terminology
   * (SNOMED/ICD-10 variant). SystemConfig.jurisdiction remains the
   * fallback default for contexts with no facility resolved yet.
   */
  jurisdiction: Jurisdiction;

  /**
   * Which of the two CAP/NSH-recognized specimen/block labeling patterns
   * this facility's accessioning uses. See the original doc comment
   * (preserved from Client) for the full CAP/RCPath reasoning — a single
   * enum, not two independent alpha/numeric toggles, since that
   * guideline exists specifically to prevent a block ID ever being
   * mistakable for a specimen ID at a glance:
   *   'alpha-specimen'   — Specimen A, B, C... / Block A1, A2, A3...
   *   'numeric-specimen' — Specimen 1, 2, 3... / Block 1A, 1B, 1C...
   * Defaults to 'alpha-specimen'.
   */
  specimenLabelStyle?: 'alpha-specimen' | 'numeric-specimen';

  /**
   * Real feature, per direct confirmation: "AI configuration should be
   * gated exclusively by the performing_lab role." Only meaningful when
   * roles includes 'performing_lab' — resolution still goes through
   * resolvePerformingLabFacilityId() below to whichever facility
   * actually performs the work, same as every other performing-lab-
   * scoped setting. null/undefined = inherit the org-level default (see
   * components/Config/AI/orchestratorModeConfig.ts).
   */
  internalAiOrchestratorEnabled?: boolean | null;
  /** Only meaningful when roles includes 'performing_lab'. Deliberately
   *  gated, not freely settable: per direct product decision, this can
   *  only be set to a model this exact facility has a `reported`
   *  ValidationStudy for, graded PASS. See
   *  resolveClientAiModel.ts's hasPassingValidationForModel(). */
  internalAiModelId?: string | null;
  /** Only meaningful when roles includes 'performing_lab'. Resolved via
   *  resolvePerformingLabFacilityId() against whichever facility is
   *  actually performing the work on the currently-open case. */
  idleTimeoutMinutesOverride?: number | null;
  /** Real, per direct guidance's own Code Review Pool design - only
   *  meaningful when roles includes 'performing_lab'. Resolved via
   *  resolvePerformingLabFacilityId(), same as idleTimeoutMinutesOverride
   *  above. A real percentage (0-100) rolled once per case at real
   *  sign-out (finalizeCase()) - null/undefined means no random
   *  sampling for this lab, same "absence means off" convention as
   *  idleTimeoutMinutesOverride. Deliberately separate from the
   *  manual flagging path (CodeReviewPoolEntry.source) - a case can
   *  land in the pool via either path independently, never both
   *  conflated into one signal. */
  codeReviewSamplingRatePercent?: number | null;
  /** Real, per direct guidance's own Feature Specification refinement
   *  (Pathology Billing Rules Engine & Audit Logging, "Opt-in Core"):
   *  when true, a real charge created for this facility's own
   *  performing lab starts as DRAFT (ServiceChargeRecord.approvalStatus)
   *  and genuinely requires a real, different approver before it can
   *  ever export - the Four-Eyes Principle, enforced at charge
   *  creation. False/undefined (the real, default state) preserves
   *  today's existing behavior exactly: a charge is created with no
   *  approvalStatus at all, treated by getEffectiveChargeStatus
   *  (mockServiceChargeService.ts) as already-cleared - same "absence
   *  means off" convention as codeReviewSamplingRatePercent above.
   *  Resolved via resolvePerformingLabFacilityId(), same real
   *  resolution as that field too - a lab-wide policy, not a
   *  per-order or per-pathologist one. */
  requireBillingApproval?: boolean;
  /**
   * Real feature, per direct specification: Post-Sign-Out Release
   * Buffer, Phase 2. Facility-level override for the org-wide default —
   * resolved via resolvePerformingLabFacilityId(), same as every other
   * performing-lab-scoped setting above. Deliberately an explicit
   * inheritSystemDefault flag, NOT the simpler "null/undefined means
   * inherit" shape idleTimeoutMinutesOverride above uses — per direct
   * specification's own, explicit "Inherit System Default: Toggle
   * (ON/OFF) — Facility Level Only" UI requirement: one clear switch an
   * admin can see and flip, not an implicit "leave it blank" convention.
   * enabled/durationMinutes/bypassForStat are only meaningful when
   * inheritSystemDefault is false.
   */
  releaseBufferOverride?: {
    inheritSystemDefault: boolean;
    enabled: boolean;
    durationMinutes: number;
    bypassForStat: boolean;
  } | null;

  status: 'Active' | 'Inactive' | 'Unverified';
  /** TRANSITIONAL BRIDGE FIELD — real, per direct guidance, Phase 1 of
   *  the Organisation/Site -> Facility migration ("fix auth/tenant-
   *  isolation first... then the Case.originHospitalId/originSiteId
   *  migration last"). Case.originHospitalId (e.g. 'HOSP-MFT') and
   *  StaffUser.organisationId (e.g. 'ORG-MFT') are DIFFERENT legacy
   *  string values for the SAME real tenant, and both fields are
   *  deliberately left untouched until Phase 3 — this lets
   *  resolveTenantFacility() (services/auth/resolveTenantFacility.ts)
   *  resolve either legacy string to the one real, admin-editable
   *  Facility (isEnterprise: true) that's actually authoritative now,
   *  in place of organisationService.ts's own hardcoded, incomplete
   *  4-entry legacyMap (confirmed directly: real, live seeded cases
   *  with originHospitalId 'HOSP-002'/'HOSP-003' were NOT in that map
   *  at all, making them invisible to any non-superadmin session).
   *  Only meaningful on an isEnterprise: true Facility. DELETE THIS
   *  FIELD once Phase 3 lands — at that point Case.originHospitalId
   *  and StaffUser.organisationId both carry a real Facility.id
   *  directly, and this bridge has no job left to do. */
  legacyTenantIds?: string[];
  /** True if this facility was auto-created by order-intake resolution
   *  (crosswalk had no match for the facility code on an incoming
   *  order) rather than configured by an admin. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Free-text note left by whatever created a pending facility — e.g.
   *  the raw facility code/name string from the source order that
   *  didn't match anything. */
  autoCreatedNote?: string;

  /** Only meaningful for ordering-client roles. Age threshold (in
   *  years) below which a patient is considered pediatric. Null = not
   *  configured — admin must verify with this facility before enabling. */
  pediatricAgeThreshold: number | null;
  /** User IDs explicitly approved to report pediatric cases from this
   *  facility. Both this AND canViewPediatric on the user record must
   *  be true (Option C). */
  authorizedPediatricPathologistIds: string[];
  /** Real, per direct guidance (PS-105): only ever meaningful for a
   *  facility with the performing_lab role — a submitting/ordering-only
   *  facility never runs abnormal detection itself. undefined = follow
   *  the enterprise default; explicit true/false is this facility's
   *  own choice, subject to resolveAbnormalDetectionEnabled()'s real
   *  governance rule (services/abnormalDetection/): if the enterprise
   *  level is disabled, this facility-level setting is disabled and
   *  cannot override that — this field can only ever further restrict
   *  a permissive enterprise default, never re-enable a disabled one. */
  abnormalDetectionEnabled?: boolean;
  // ── TAT configuration — only meaningful for ordering-client roles ──────────
  /** Hours from receivedDate before a first-touch escalation fires.
   *  Null = use system default (SystemConfig.defaults.tatFirstTouchHours). */
  tatFirstTouchHours: number | null;
  /** Total case TAT target in hours (receivedDate → finalizedAt).
   *  Null = use system default (SystemConfig.defaults.tatTotalHours). */
  tatTotalHours: number | null;
  /** Roles to notify when a TAT threshold is breached. Empty = no
   *  notifications. (Notification roles — unrelated to FacilityRole
   *  above, kept as its own separate union same as before the rename.) */
  escalationTargets: ('pathGroup' | 'admin' | 'referrer')[];
  /** Urgency level applied to escalation alerts for this facility. */
  escalationPriority: 'high' | 'critical';

  createdAt?: string;
  updatedAt?: string;
}

export type FacilityInput = Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Resolves which facility's lab performs work ordered by the given
 * facility. Pure and data-only — reads exactly two stored facts
 * (performingLabFacilityId, roles), nothing derived from session/login
 * context. See Facility.performingLabFacilityId's own doc comment for
 * the full reasoning.
 *
 * Returns undefined for a facility with no performing_lab role and no
 * override set — that's a real configuration gap, worth surfacing
 * rather than silently guessing.
 */
export function resolvePerformingLabFacilityId(facility: Facility): string | undefined {
  if (facility.performingLabFacilityId) return facility.performingLabFacilityId;
  if (facility.roles.includes('performing_lab')) return facility.id;
  return undefined;
}

/**
 * Real, per direct guidance: resolves the real, effective
 * FacilityInterfaceEngineConnection governing a given facility -
 * deliberately Enterprise-only, never a facility-level override (see
 * that type's own doc comment for why). Walks up via parentId to the
 * real Enterprise ancestor when the facility itself isn't the
 * Enterprise (a single, direct hop - parentId can only ever point to
 * an isEnterprise facility, enforced in FacilityEditorModal.tsx's own
 * Parent Enterprise picker). Returns undefined when the facility has
 * no real Enterprise parent, or that parent hasn't configured this
 * yet - a real configuration gap, worth surfacing rather than
 * silently guessing.
 *
 * Pure, data-only - takes the full real facility list rather than
 * fetching internally, so callers already holding a real, current
 * list (most real call sites) don't pay for a second real fetch.
 */
export function resolveInterfaceEngineConnectionForFacility(
  facility: Facility,
  allFacilities: Facility[]
): FacilityInterfaceEngineConnection | undefined {
  if (facility.isEnterprise) return facility.interfaceEngineConnection ?? undefined;
  if (!facility.parentId) return undefined;
  const parent = allFacilities.find(f => f.id === facility.parentId);
  return parent?.interfaceEngineConnection ?? undefined;
}

/**
 * Real, per direct guidance: resolves the real, effective
 * FacilityLisRouting for a given facility - its own real, explicit
 * override if set, else its real Enterprise parent's own default
 * routing metadata (a single, direct parentId lookup, same real
 * one-hop reasoning as resolveInterfaceEngineConnectionForFacility
 * above). Returns undefined when neither this facility nor its real
 * Enterprise parent (if any) has ever configured this.
 */
export function resolveLisRoutingForFacility(
  facility: Facility,
  allFacilities: Facility[]
): FacilityLisRouting | undefined {
  if (facility.lisRouting) return facility.lisRouting;
  if (!facility.parentId) return undefined;
  const parent = allFacilities.find(f => f.id === facility.parentId);
  return parent?.lisRouting ?? undefined;
}

/**
 * Real, per direct guidance: resolves the real, effective
 * FacilityIdentifierFormatSelection for a given facility - its own
 * real, explicit override if set, else its real Enterprise parent's
 * own default (same real one-hop parentId reasoning as
 * resolveLisRoutingForFacility above). Returns undefined when neither
 * this facility nor its real Enterprise parent (if any) has ever
 * configured this - callers fall back to IDENTIFIER_FORMAT_LIBRARY's
 * own jurisdiction-matched defaults in that case (unchanged from this
 * app's real, existing behavior before this feature).
 *
 * Real, deliberate scope: only resolves *which format ids are
 * enabled* - combining that with a specific facility's own
 * Facility.jurisdiction to produce a real, filtered IdentifierFormat[]
 * list is business logic that belongs with IDENTIFIER_FORMAT_LIBRARY
 * itself (types/systemConfig.ts), not duplicated here.
 */
export function resolveIdentifierFormatsForFacility(
  facility: Facility,
  allFacilities: Facility[]
): FacilityIdentifierFormatSelection | undefined {
  if (facility.identifierFormats) return facility.identifierFormats;
  if (!facility.parentId) return undefined;
  const parent = allFacilities.find(f => f.id === facility.parentId);
  return parent?.identifierFormats ?? undefined;
}

/**
 * Real, per direct guidance ("1 is fine" - union across all
 * Enterprises): for the real, globally-scoped consumers with no
 * reliable facility context to resolve against (ScannerProvider,
 * CaseSearchBar, SearchPage), returns the real union of every real
 * Enterprise's own enabled format ids - a format is included if ANY
 * real Enterprise has enabled it, not just one. Deliberately simpler
 * than a facility-scoped resolution: no parentId walk, no single
 * "correct" Enterprise to pick in a context-independent scan/search.
 * Returns an empty array (never undefined) when no real Enterprise
 * has configured this yet, so callers can safely fall back to
 * IDENTIFIER_FORMAT_LIBRARY's own defaults with a simple `.length`
 * check, same real pattern already used in ScannerProvider.tsx.
 */
export function resolveUnionOfEnabledIdentifierFormatIds(
  allFacilities: Facility[]
): string[] {
  const ids = new Set<string>();
  for (const f of allFacilities) {
    if (f.isEnterprise && f.identifierFormats) {
      for (const id of f.identifierFormats.enabledFormatIds) ids.add(id);
    }
  }
  return Array.from(ids);
}

export interface IFacilityService {
  getAll(): Promise<ServiceResult<Facility[]>>;
  getById(id: ID): Promise<ServiceResult<Facility>>;
  add(facility: Omit<Facility, 'id'>): Promise<ServiceResult<Facility>>;
  update(id: ID, changes: Partial<Omit<Facility, 'id'>>): Promise<ServiceResult<Facility>>;
  deactivate(id: ID): Promise<ServiceResult<Facility>>;
  reactivate(id: ID): Promise<ServiceResult<Facility>>;
  /** Flips an Unverified facility to Active — the admin-approval step. */
  verify(id: ID): Promise<ServiceResult<Facility>>;
  /**
   * Called by order-intake / crosswalk resolution. No exact crosswalk
   * match on the order's facility code → creates an Unverified,
   * autoCreated facility so processing can continue immediately,
   * defaulting to no pediatric/TAT configuration (safest default —
   * forces explicit admin setup rather than silently inheriting another
   * facility's settings) until an admin reconciles it. Mirrors
   * IPhysicianService.findOrCreateByNpi and
   * IDepartmentService.findOrCreateByName exactly.
   */
  findOrCreateByAssigningAuthority(assigningAuthority: string, name: string, note?: string): Promise<ServiceResult<Facility>>;
}
