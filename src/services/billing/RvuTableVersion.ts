// src/services/billing/RvuTableVersion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, from a direct question: "these things need to be versioned,
// correct?" - yes, and this closes a real gap the original
// codeMapTable.ts (a single, static, unversioned constant) genuinely
// had. CMS updates work RVU values annually, sometimes quarterly (this
// project's own earlier research found CPT 88305's work RVU dropped
// from 0.75 to 0.73 for 2026) - without effective-dated versioning,
// updating the table to a newer year's values would silently rewrite
// the RVU totals of every historical, already-finalized case, not just
// new ones going forward.
//
// A RvuTableVersion is an immutable, effective-dated snapshot of the
// whole code map at a point in time - same "never edit history, only
// add a new record" principle this app already uses for
// ReportVersionRecord/DelegationRecord/ReconciliationRecord. To "fix a
// typo" or apply a new CMS update, an admin creates a NEW version; old
// versions are never edited in place, matching
// ISpecimenDictionaryService.ts's own established principle that
// nothing governed is ever hard-deleted or silently rewritten once it
// may have been relied on by a real case.
// ─────────────────────────────────────────────────────────────────────────────

// Real fix, per direct guidance (Charge Capture work): renamed from
// CptWorkRvuEntry to BillingDictionaryEntry - the whole point of this
// work is that this table is the one authoritative source for CPT/
// RVU/billing-code data, not a narrow "work RVU only" concern anymore.
// Property names (code/description/workRvu) deliberately kept exactly
// as they were, NOT renamed to cpt/rvuWork - a real, live CMS-PPRRVU-
// file upload parser (parseRvuUploadRows below) and the real admin
// screen (RvuCodeMapSection.tsx) both already construct/render these
// exact property names; renaming them would touch a working parser +
// UI for zero functional benefit. Only what's genuinely new is added.
export interface BillingDictionaryEntry {
  code: string;
  description: string;
  /** Optional (was required) - per direct guidance, a real code this
   *  app knows about but hasn't yet verified a current RVU for (e.g.
   *  88341/88331/88332/88344 as of this change - see this file's own
   *  consumers for the disclosed-gap reasoning) should still be a
   *  real, visible row in the Billing Dictionary, not silently
   *  omitted entirely. computeWorkRvuForCodes (codeMapTable.ts) treats
   *  an undefined workRvu the same as "not found" for totaling
   *  purposes either way - the row existing or not existing doesn't
   *  change what gets summed, only what a person browsing the
   *  dictionary can actually see. */
  workRvu?: number;
  /** Real, new primary internal identifier, per direct guidance: never
   *  a raw CPT code embedded on a catalog entry elsewhere in this app
   *  (see StainType.defaultBillingCode's own doc comment) - this table
   *  is where that reference actually resolves. Stable even if CMS
   *  later renumbers the underlying CPT code for the same real
   *  concept. e.g. 'IHC-FIRST', 'IHC-ADDL', 'FROZEN-FIRST',
   *  'FROZEN-ADDL', 'PIN4-PANEL'. Required - every real entry needs
   *  one, including the base surgical-pathology-level codes that
   *  don't strictly need the indirection (billingCode can just equal
   *  the CPT code string for those, e.g. '88305'). */
  billingCode: string;
  /** Optional - a parallel HCPCS code for this same real service, when
   *  one exists and differs from the CPT code (not every entry has
   *  one). */
  hcpcsCode?: string;
  /** Optional - practice expense and malpractice RVU components,
   *  alongside the existing workRvu (physician effort/skill
   *  component). Real, public CMS RBRVS figures, same "verified via
   *  direct search, never fabricated" discipline as workRvu - left
   *  undefined rather than guessed when not yet verified. */
  rvuPe?: number;
  rvuMp?: number;
  /** Optional - this same real service's equivalent code under a
   *  different country's own billing/coding system (e.g. { UK:
   *  'OPCS4-XXX' }), keyed by Organisation.country
   *  (services/organisation/organisationService.ts). Real, per-country
   *  identifiers only - never a payer rule or bundling logic (see
   *  WORKLOAD_AND_CHARGE_CAPTURE_SCOPE.md's own Thread 1/Thread 2
   *  split for why those stay out of scope here). */
  countrySpecificCodes?: Record<string, string>;
  /** Optional - a modifier this code commonly needs attached (e.g.
   *  '-26'/'-TC' professional/technical split), carried through as
   *  real, known data alongside the charge - NOT a validation/
   *  business-rule engine deciding which modifiers are "allowed."
   *  Matches Category E's own ChargeCaptureEventPayload.charges[].modifier
   *  field exactly (docs/architecture/PathScribe_Interface_Specification_v1_2.docx
   *  §5.1) - PathScribe passes a known modifier through to the
   *  downstream billing system; it doesn't decide modifier rules
   *  itself. */
  modifier?: string;
}

/** @deprecated Renamed to BillingDictionaryEntry - kept as a type
 *  alias only so any external reference not yet updated still
 *  compiles; new code should use BillingDictionaryEntry directly. */
export type CptWorkRvuEntry = BillingDictionaryEntry;

export interface RvuTableVersion {
  id: string;
  /** Human label, e.g. "CMS 2026 (April update)" - free text, admin-set. */
  label: string;
  /** The real date these values take effect - what
   *  getVersionEffectiveAt() resolves against, NOT the same as
   *  uploadedAt (an admin might upload a version ahead of its real
   *  effective date, or backdate one being entered late). */
  effectiveDate: string;
  /** Real audit trail - who/when this version was actually created. */
  uploadedAt: string;
  uploadedBy: string;
  /** Set only when this version came from a real file upload, not
   *  manual entry - honest provenance, not fabricated for manually-
   *  entered versions. */
  sourceFileName?: string;
  /** Exactly one version is active at a time - the one new,
   *  going-forward calculations use. Older versions stay retrievable
   *  (never deleted) specifically so historical case RVU totals can
   *  still resolve against the real rates that were in effect when
   *  they were actually finalized. */
  isActive: boolean;
  entries: BillingDictionaryEntry[];
}

/** Real fix, the actual reason this needed to be versioned: resolves
 *  which version was genuinely in effect on a given date, not whichever
 *  is marked active today. Pure, synchronous mirror of
 *  mockRvuCodeMapService.ts's getVersionEffectiveAt, taking the already-
 *  fetched versions array directly rather than being async itself -
 *  keeps calculation functions built on top of this pure and testable,
 *  and lets a page fetch all versions once rather than once per case. */
export function resolveVersionEffectiveAt(versions: RvuTableVersion[], isoDate: string): RvuTableVersion | null {
  const target = new Date(isoDate).getTime();
  if (isNaN(target)) return null;
  const candidates = versions
    .filter(v => new Date(v.effectiveDate).getTime() <= target)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return candidates[0] ?? null;
}
