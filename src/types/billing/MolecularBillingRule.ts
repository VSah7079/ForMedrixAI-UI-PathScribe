// src/types/billing/MolecularBillingRule.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own detailed CPT research (Anatomic FISH
// 88364-88377, Cytogenetic FISH 88271-88275) - built generalized from
// the start ("build for general molecular pathology out of the box"),
// not FISH-only. targets/methodology naming per that same guidance, so
// PCR/NGS fit this same shape later without a schema break.
//
// Deliberately references billingCode strings (never a raw CPT code
// directly) - same, established "PathScribe does not store raw CPT
// codes on a catalog entry; the Billing Dictionary is the one
// authoritative source" principle StainType.defaultBillingCode already
// follows (see that field's own doc comment). Every real CPT/RVU value
// this rule can produce is a real BillingRuleVersion row, resolved the
// normal way - this type only describes HOW MANY units of WHICH
// billingCode(s) a given target count produces, never the codes'
// own resolved values.
// ─────────────────────────────────────────────────────────────────────────────

export type MolecularMethodology = 'FISH_ANATOMIC' | 'FISH_CYTOGENETICS' | 'PCR_SINGLE' | 'NGS_PANEL';

/** Real, per direct guidance: a named, reusable target from a master
 *  dictionary (e.g. "ERBB2", "CEP17", "BRAF V600E") - never a bare
 *  probe count. targetType stays generic on purpose, so a FISH probe,
 *  a PCR mutation region, and an NGS gene are all the same real shape. */
export interface MolecularTarget {
  id: string;
  /** Real gene/probe symbol, e.g. "ERBB2", "CEP17", "BRAF". */
  symbol: string;
  /** Real, human-readable detail, e.g. "17q12" for a FISH probe's
   *  cytogenetic locus, or "V600E" for a PCR mutation region. Optional
   *  - not every real target has one (a whole-gene NGS panel entry
   *  usually doesn't). */
  detail?: string;
  targetType: 'PROBE' | 'GENE' | 'MUTATION_REGION';
  active: boolean;
}

export type BillingModel = 'BASE_ADDON' | 'PER_UNIT_MULTIPLIER' | 'FLAT_FEE';

/** Real, per direct guidance's own worked CPT tables. Every *CptCode
 *  field below is a real billingCode (Billing Dictionary key), not a
 *  raw CPT string - resolved via the normal Billing Dictionary/
 *  BillingRuleVersion machinery like every other charge in this app. */
export interface CptMappingRule {
  billingModel: BillingModel;

  // Used when billingModel is BASE_ADDON (Anatomic FISH's own real
  // three scoring-method variants: Manual/Computer-Assisted/
  // Qualitative - each its own real base/add-on/multiplex trio, per
  // direct guidance's own table).
  baseCptCode?: string;
  addOnCptCode?: string;
  /** Triggered once real target count >= multiplexThreshold (default
   *  3, per direct guidance's own "3+ probes / multiplex" rule) -
   *  configurable, not hardcoded, since a future methodology's own
   *  real multiplex threshold may genuinely differ. */
  multiplexCptCode?: string;
  multiplexThreshold?: number;

  // Used when billingModel is PER_UNIT_MULTIPLIER (Cytogenetic FISH's
  // own real "N units of one code" pattern, e.g. 88271 x N).
  perUnitCptCode?: string;

  // Used when billingModel is FLAT_FEE (Single-Gene/Targeted PCR and
  // NGS Panel's own real "one code regardless of target count within
  // a tier" pattern, e.g. 81445 for a 5-50 gene panel).
  flatFeeCptCode?: string;
}

/** Real, per direct guidance's own real worked example - each
 *  resulting billingCode this target count actually produces, and how
 *  many real units of it. Deliberately an array (BASE_ADDON commonly
 *  produces two real, distinct billingCodes from one target count -
 *  a base charge and a real, separate add-on charge), never a single
 *  {code, units} pair. */
export interface MolecularBillingResult {
  billingCode: string;
  units: number;
}
