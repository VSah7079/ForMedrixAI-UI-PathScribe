// src/types/billing/BillingRuleVersion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per-direct, explicit, fully-specified guidance: replaces the
// earlier whole-table RvuTableVersion model. That model versioned the
// ENTIRE Billing Dictionary as one snapshot per effective date - real,
// but wrong-grained: correcting one code's RVU meant re-snapshotting
// every other code too, and there was no way to answer "which rule
// produced THIS charge" more precisely than "whichever whole-table
// version was active."
//
// This model versions each billingCode independently -
// (billingCode, version) is the real unique key, never a whole table.
// Append-only: an existing (billingCode, version) row is NEVER edited
// in place - a real rule change is always a new row with
// version = oldVersion + 1, and the prior row gets status: 'RETIRED'
// and/or a real effectiveTo set. Same "never edit history, only add a
// new record" principle already used throughout this app
// (ReportVersionRecord/AmendmentRecord/ReconciliationRecord/the old
// RvuTableVersion itself) - just now scoped per-rule instead of
// per-table.
//
// Real, two-tier scoping, per direct, explicit guidance: the same
// billingCode can have BOTH an enterprise-wide canonical rule
// (siteId: undefined) AND independent, real, site-specific override
// rules (siteId: a real Site.id) — each with its OWN version history,
// (billingCode, siteId, version) together the real unique key.
// resolveBillingRuleAt (resolveBillingRuleAt.ts) prefers a matching
// site-scoped row for a given date; falls back to the enterprise-wide
// row when the site has no real override of its own. Deliberately one
// unified, versioned, governed model rather than two separate types —
// a site override is still fundamentally the same kind of real,
// audited billing rule the enterprise dictionary is, just narrower in
// scope, and reusing the same append-only/governance machinery avoids
// duplicating it.
//
// Real, deliberate nomenclature fix, per direct guidance: this scoping
// is by Site (services/organisation/organisationService.ts's real
// Organisation/Site hierarchy), NEVER called "Facility" anywhere in
// this file, its consumers, or any UI built on it. "Facility" already
// names a real, different, heavily-used concept in this codebase (the
// client/referring/ordering dictionary - services/facilities/), and
// reusing that word here for "the site actually performing the work"
// would create exactly the kind of internal-vs-external naming
// confusion that risks real client- or regulator-facing ambiguity.
// siteId below is the one and only scoping field for this concept.
//
// modifiersAllowed/quantityRules/bundlingRules/documentationRequirements
// are real, stored fields - per direct guidance's own JSON shape, all
// plain strings/arrays, not structured rule definitions. Deliberately
// informational/reference only: nothing in this app validates a real
// charge against these or rejects/adjusts one because of them. That
// stays true to the Thread 1/Thread 2 split already established
// (WORKLOAD_AND_CHARGE_CAPTURE_SCOPE.md) - real business-rule
// enforcement (bundling edits, payer-specific modifier validation) is
// still explicitly out of scope, gated on real legal/compliance input
// that hasn't been confirmed as cleared. suppressionAdvisory below is
// the exact same posture, confirmed directly: PathScribe never
// auto-suppresses a real charge based on this field - it's advisory
// metadata for a human or a downstream RCM system to act on.
// ─────────────────────────────────────────────────────────────────────────────

// Real, per direct guidance's own Four-Eyes Principle (dual control)
// requirement: a real billing rule change - which directly determines
// what gets charged - previously went live immediately on save, with
// no second-person review at all. approvedBy existed as a form field,
// but was purely decorative free text; nothing enforced it, and the
// person creating a version could type their own name into it.
//
// DRAFT: created, still editable by its own author, not yet visible
// to anyone else, never resolvable by resolveBillingRuleAt.
// PENDING_APPROVAL: submitted for review - locked from further edits
// by its own author, awaiting a real, different user's decision.
// ACTIVE: approved by a real, different user - now genuinely live.
// REJECTED: reviewed and declined by a real, different user - a
// terminal state; the original drafter creates a fresh draft to try
// again rather than editing a rejected one back to life.
// RETIRED: unchanged from before - a real, formerly-ACTIVE rule
// superseded by a newer, since-approved version.
export type BillingRuleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'RETIRED';

export interface BillingRuleVersion {
  /** Real, two-tier scoping - see this file's own header. Undefined
   *  means this row is the enterprise-wide canonical rule, visible to
   *  every real Site unless that Site has defined its own override.
   *  When set, this is a real Site.id
   *  (services/organisation/organisationService.ts) and this row ONLY
   *  applies to that one specific site - a genuinely independent
   *  version history from the enterprise row for the same billingCode,
   *  never merged field-by-field with it. NEVER "Facility" - see this
   *  file's own header for why. */
  siteId?: string;
  /** Logical identifier - the same billingCode a ServiceChargeRecord
   *  and a Service Dictionary entry (StainType.defaultBillingCode,
   *  etc.) reference. Multiple real rows share this value, one per
   *  real version - and, per siteId above, potentially one real,
   *  independent version history per site on top of the enterprise
   *  one. */
  billingCode: string;
  /** 1-indexed, per (billingCode, siteId) pair - NOT a global/table-wide
   *  counter, and NOT shared between a site's own override history and
   *  the enterprise row for the same billingCode (those are
   *  independent real sequences). (billingCode, siteId, version)
   *  together are the real unique key - enforced at the service layer
   *  (mockBillingRuleService.ts), same findDuplicate-based convention
   *  as every other required+unique field elsewhere in this app. */
  version: number;
  /** ISO date - when this specific version starts applying to a real
   *  date of service. */
  effectiveFrom: string;
  /** ISO date, or null while still the current/open-ended version.
   *  Real fix set when a newer version supersedes this one - see
   *  retireBillingRuleVersion (mockBillingRuleService.ts). */
  effectiveTo: string | null;
  /** ACTIVE = a real, usable rule (whether current or historically
   *  still resolvable for an old date of service). RETIRED = real,
   *  historical, kept for audit but should never be selected as the
   *  match for ANY date of service, even a date within its own
   *  effectiveFrom/effectiveTo window - see resolveBillingRuleAt's own
   *  header for why status is checked independently of the date
   *  window, not inferred from it. */
  status: BillingRuleStatus;

  /** Real, per direct guidance: at what hierarchy level this charge
   *  attaches - a specimen's own primary diagnostic work, a block's
   *  own processing/preparation, a specific stain's own
   *  staining/analytical procedure, or a decanted fluid/slide's own
   *  work. Deliberately distinct from billingType below - explicit,
   *  direct confirmation that merging the two would cause real
   *  execution bugs in the Charge Event Engine, since granularity and
   *  billing component type govern completely different operational
   *  lifecycle rules. Drives UI badge grouping, tree rendering, and
   *  specimen-container vs. slide-level charge binding - matches
   *  BillingDictionaryEntry.level's own real values exactly
   *  (codeMapTable.ts), this dictionary's own equivalent concept. */
  level: 'specimen' | 'block' | 'stain' | 'decant';
  /** Real, required per Epic: PathScribe Outbound Billing & Charge
   *  Event Engine, User Story 1 - which real-world biller performs
   *  the billable work this code represents, and therefore when its
   *  charge actually releases. 'TC' (technical component) releases
   *  immediately upon specimen grossing/lab completion; '26'
   *  (professional component) and 'Global' (combined TC+26) hold
   *  until final pathologist signout. Drives Story 1's real trigger
   *  logic directly - see BILLING_TYPE_DEFAULT_TRIGGER
   *  (codeMapTable.ts) for the real event mapping this uses. Matches
   *  BillingDictionaryEntry.billingType's own values exactly. */
  billingType: 'TC' | '26' | 'Global';

  cpt: string;
  /** Real, human-readable CPT description (e.g. "Immunohistochemistry,
   *  first single antibody stain") - deliberately separate from
   *  `notes` below, which is free-text audit-trail commentary, not a
   *  description of the code itself. Genuinely missing from direct
   *  guidance's own example JSON - added here since
   *  ServiceChargeRecord.cptDescription needs a real source to resolve
   *  from, matching the old BillingDictionaryEntry model's own
   *  `description` field this replaces. */
  description?: string;
  hcpcsCode?: string;
  rvuWork?: number;
  rvuPe?: number;
  rvuMp?: number;

  /** Informational/reference only - see this file's own header. Real,
   *  commonly-associated modifier codes for this CPT (e.g. the real
   *  professional/technical split), not a validation allowlist this
   *  app enforces. */
  modifiersAllowed?: string[];
  /** Informational/reference only - a real, human-readable description
   *  of how this code is counted (e.g. "per block"), not a structured
   *  rule this app evaluates. The REAL counting logic already lives in
   *  suggestAncillaryCodesForStains/suggestFrozenSectionCptCodes
   *  (codeMapTable.ts / frozenSectionBilling.ts) - this field
   *  documents what that logic represents, for an auditor's benefit. */
  quantityRules?: string;
  /** Informational/reference only - same posture as quantityRules
   *  above. */
  bundlingRules?: string;
  /** Informational/reference only - real, human-readable documentation
   *  expectations (e.g. "pathologist interpretation"), not an enforced
   *  gate. Deliberately NOT tied to the synoptic requiredFields
   *  completeness counter - see ServiceChargeRecord.ts's own header
   *  for why (that pipeline has a real, already-disclosed gap). */
  documentationRequirements?: string[];
  /** Real, per direct guidance's own follow-up - whether a real coder
   *  has confirmed this billingCode appears on CMS's own, official,
   *  quarterly-updated list of laboratory tests subject to the 42 CFR
   *  414.510(b)(5) DOS exception (molecular pathology tests performed
   *  by a lab that is not a blood bank/center, ADLTs, certain
   *  cancer-related protein-based MAAAs, and CPT 81490 - see
   *  resolveBillingDateOfService.ts's own header for the full rule).
   *  This app has no real, live way to fetch or parse that official
   *  list itself - same "the lab's own AMA/CMS-list access covers
   *  this, this app never fabricates the mapping" posture as
   *  defaultBaseCptCode elsewhere in this codebase. Undefined/false
   *  means not confirmed eligible - the (b)(5) exception advisory
   *  never fires for this code until a real coder sets this true. */
  dosExceptionEligible?: boolean;
  /** Informational/advisory only, per direct, explicit confirmation:
   *  PathScribe never auto-suppresses a real charge - this field
   *  exists so a real, local reason a charge might not actually be
   *  separately billable at this specific site (e.g. "bundled into
   *  base fee per local payer contract") is captured and carried
   *  forward onto the real ServiceChargeRecord this rule produces
   *  (resolveServiceCharge.ts), for a human or a downstream RCM system
   *  to act on. Never read by any conditional logic that skips or
   *  alters ServiceChargeRecord generation - confirmed directly,
   *  matching modifiersAllowed/quantityRules/bundlingRules/
   *  documentationRequirements above. A future QA-alert pipeline
   *  (real, separate, sequenced work - not built here) is the intended
   *  real consumer of this field, not this app's own charge-generation
   *  logic. */
  suppressionAdvisory?: string;

  /** Real ISO 3166-1 alpha-2 country this specific version applies to
   *  (e.g. 'US'). Per direct guidance: version PER (billingCode,
   *  country) when rules genuinely diverge by country, rather than one
   *  row holding a map of every country's own code - a real US rule
   *  change shouldn't force touching a UK row that never changed. */
  country?: string;
  /** Free-text audit note - e.g. "Updated for 2026 CMS RVU schedule". */
  notes?: string;

  // ─── Governance - per direct guidance's own "Changes require:
  // Reason. Effective date. Approver." ───
  createdAt: string;
  createdBy: string;
  /** Required in practice (see mockBillingRuleService.createVersion's
   *  own validation) for any version beyond the real, initial
   *  migration seed - a real rule change always needs a real reason on
   *  record, per direct guidance. */
  changeReason?: string;
  /** Real, per direct guidance's own Four-Eyes Principle (dual
   *  control) requirement - when a DRAFT was genuinely submitted for
   *  review (mockBillingRuleService.submitForApproval), moving it to
   *  PENDING_APPROVAL. Undefined for a version still in DRAFT, or for
   *  the real, initial migration seed (version 1 for existing
   *  behavior, which predates this workflow entirely). */
  submittedForApprovalBy?: string;
  submittedForApprovalAt?: string;
  /** Real, per direct guidance's own Four-Eyes Principle - who
   *  actually approved or rejected this version (approveVersion /
   *  rejectVersion), and when. Service-enforced to never equal
   *  createdBy or submittedForApprovalBy - see those methods' own doc
   *  comments for the full reasoning. Undefined until a real decision
   *  has actually been made. */
  reviewedBy?: string;
  reviewedAt?: string;
  /** Required when status is REJECTED - a real decline always needs a
   *  real reason on record, same posture as changeReason above. */
  rejectionReason?: string;
}
