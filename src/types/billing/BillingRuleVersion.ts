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

export type BillingRuleStatus = 'ACTIVE' | 'RETIRED';

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
  /** Real approver, distinct from createdBy - per direct guidance's
   *  own governance rule. Optional at the type level since the
   *  initial migration seed (version 1 for existing behavior) has no
   *  real separate approval step behind it. */
  approvedBy?: string;
}
