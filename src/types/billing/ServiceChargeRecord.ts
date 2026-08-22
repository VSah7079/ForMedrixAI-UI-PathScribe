// src/types/billing/ServiceChargeRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, new work for the Charge Capture build, per direct, explicit
// guidance: resolution happens ONCE, at finalization, and the resolved
// CPT/HCPCS/RVU/modifier values are persisted here permanently -
// NEVER re-resolved against the Billing Dictionary later. This is the
// one real reason this type exists at all rather than just resolving
// billingCode -> CPT on the fly wherever it's needed: CMS/AMA update
// these values annually, and a charge that silently drifted to match
// whatever's active TODAY instead of what was actually true when the
// case was finalized would retroactively misrepresent history.
//
// Real fix, per direct, explicit, fully-specified guidance: resolves
// against the real, per-billingCode versioned model
// (types/billing/BillingRuleVersion.ts, resolveBillingRuleAt.ts) - each
// billingCode has its own independent, append-only version history
// ((billingCode, version) is the real unique key), not a whole-table
// snapshot. ruleVersion below is the exact version of THIS billingCode
// that was in effect, not a whole-table version id.
//
// Same "never edit history, only add a new record" principle already
// used for ReportVersionRecord/AmendmentRecord/ReconciliationRecord
// (see types/reports/, types/quality/) - this is that same pattern
// applied to billing.
//
// billingCode is kept alongside the resolved values, not replaced by
// them - real, deliberate redundancy, not leftover cruft: it's the
// permanent audit trail answering "what internal rule produced this
// charge," independent of whatever the resolved CPT happens to be.
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceChargeRecord {
  /** Stable, unique per real charge line - deterministically derived
   *  from caseId/sourceLabel/billingCode/sequencePosition (see
   *  resolveServiceCharge in services/billing/), not random, so
   *  reprocessing the same real event reliably produces the same id
   *  rather than a duplicate. Maps directly to
   *  ChargeCaptureEventPayload.charges[].transactionId (Category C,
   *  docs/architecture/PathScribe_Interface_Specification_v1_2.docx §5.1). */
  id: string;
  caseId: string;

  /** 'specimen-level' (the base accession code) or 'block-level' (an
   *  ancillary code, e.g. special stains) - mirrors
   *  services/hl7/dftBuilder.ts's real specimen-vs-block charge
   *  distinction, and Category C's own sourceLevel field exactly. */
  sourceLevel: 'specimen' | 'block';
  /** e.g. the specimen or block label this charge came from - matches
   *  Category C's own sourceLabel field exactly. */
  sourceLabel: string;
  specimenId?: string;
  blockId?: string;

  /** The internal Billing Dictionary reference that produced this
   *  charge (e.g. 'IHC-FIRST', 'FROZEN-ADDL', 'PIN4-PANEL') - the
   *  permanent record of WHAT RULE fired, kept even though the real
   *  CPT is now resolved and stored below. Never re-resolved against
   *  the dictionary after creation - see this file's own header. */
  billingCode: string;
  /** Real, per-specimen sequence position this charge represents (e.g.
   *  2 = the second counted IHC/frozen-block occurrence, which is why
   *  billingCode above is '...-ADDL' rather than '...-FIRST') -
   *  "how it was counted," per direct guidance. Undefined for a
   *  billingCode that was never part of a counted sequence (e.g.
   *  'SPECIAL-STAIN', or a stain's own configured defaultBillingCode). */
  sequencePosition?: number;

  // ─── Resolved, immutable at the moment of creation - see header ───
  cptCode: string;
  cptDescription?: string;
  hcpcsCode?: string;
  modifier?: string;
  /** Matches Category C's own quantity field. Undefined means 1 -
   *  every code this app currently resolves represents a single real
   *  unit of work, never fabricated as a multi-unit charge. */
  quantity?: number;
  rvuWork?: number;
  rvuPe?: number;
  rvuMp?: number;

  /** Advisory metadata only, per direct, explicit confirmation -
   *  carried through unchanged from the BillingRuleVersion that
   *  produced this charge, when that rule had one set
   *  (BillingRuleVersion.suppressionAdvisory - see its own header).
   *  PathScribe never reads this to skip or alter charge generation -
   *  every real, applicable billingCode still produces a real
   *  ServiceChargeRecord regardless of this field's presence. It
   *  exists purely so a human reviewer or a downstream RCM system has
   *  the real, local reason a charge might not actually be separately
   *  billable at this site, attached directly to the specific charge
   *  it concerns - "let downstream billing decide whether to
   *  suppress," per direct guidance. */
  suppressionAdvisory?: string;

  /** Real, per direct, explicit guidance ("stamp ruleVersion +
   *  [the site]"): the real Site.id
   *  (services/organisation/organisationService.ts) this charge was
   *  resolved against, when the case genuinely belongs to one -
   *  undefined when resolution used the enterprise-wide rule directly
   *  (no site override existed, or no real site context was given at
   *  all). Permanent, alongside ruleVersion below - together they
   *  answer "which exact rule, at which exact scope, produced this
   *  charge," matching this file's own header on permanence. */
  siteId?: string;
  /** "What ruleSetId produced the charge," per direct guidance - the
   *  real, per-billingCode version number (BillingRuleVersion.version,
   *  types/billing/BillingRuleVersion.ts) that this charge's
   *  CPT/HCPCS/RVU values were resolved against. NOT a whole-table
   *  version id — this app's Billing Dictionary versions each
   *  billingCode independently, so this is the exact version of THIS
   *  SPECIFIC rule, permanently answering "what rule was in effect at
   *  the time" without needing to know anything about any other
   *  billingCode's own version history. Real, per direct guidance:
   *  this version number is scoped to whichever tier (enterprise-wide
   *  or the real site above) actually produced the match - a site's
   *  own override version 1 and the enterprise row's own version 3 are
   *  genuinely different, independent sequences (see
   *  BillingRuleVersion.ts's own header). */
  ruleVersion: number;
  /** Optional, real composite debug key, per direct guidance's own
   *  example shape (e.g. 'BILLRULE-IHC-FIRST-3') - purely a
   *  human-readable convenience for tracing a charge back to its exact
   *  rule row without cross-referencing billingCode+ruleVersion
   *  separately. Derived, never the real source of truth (billingCode
   *  + ruleVersion together already are). */
  ruleSetId?: string;
  /** "What documentation existed," per direct guidance - real,
   *  working link to the actual signed report version
   *  (types/reports/ReportVersionRecord.ts) current at the moment
   *  this charge was resolved, if one exists yet. Deliberately NOT
   *  tied to the synoptic requiredFields completeness counter - that
   *  pipeline has a real, already-disclosed gap
   *  (report.requiredFields never actually gets populated, per
   *  pages/SynopticReportPage/hooks/useSignOutWorkflow.ts's own
   *  comment) and this record shouldn't snapshot known-broken data. */
  reportVersionRecordId?: string;

  /** When resolution actually happened - real finalization time, not
   *  when the underlying work was performed (which may be earlier -
   *  see billingCode/sequencePosition above for that). */
  resolvedAt: string;
  /** 'system' for an unreviewed suggestion applied automatically
   *  alongside sign-out, or a real user id for one a human reviewed/
   *  overrode first - same distinction this app already makes
   *  everywhere else a charge/mapping could be system- or
   *  human-sourced (e.g. SpecimenCodeCrosswalkEntry.createdBy). */
  resolvedBy: string;
}
