// src/services/cytology/ICytologyCategoryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service interface for the GYN Cytology dictionary — Phase 1 of the
// Cytology & Cervical Screening module (per the uploaded requirements
// doc's own "Integrated Bethesda System Reporting" ask: standardized
// drop-down menus enforcing current Bethesda System nomenclature —
// specimen adequacy, general categorization, and descriptive
// diagnosis), Phase 5 (Sep 2026): renamed "Interpretation and
// Recommendations" — real, per direct guidance, this dictionary also
// covers real, standard clinical recommendations (repeat interval,
// colposcopy referral, etc.), reusing the same real dictionary rather
// than building a second, parallel one, since a recommendation is
// selected and displayed the same way an interpretation is.
//
// Real, per direct guidance: any configuration for this module lives as
// a new subtab under the existing System configuration screen — same
// established pattern as every other admin dictionary in this app
// (ParticipationTypesSection, SubspecialtiesSection, GoverningBodiesSection,
// etc.) — not a new, separate configuration surface.
//
// Modeled directly on the real, current 2014 Bethesda System structure
// (5 real components: specimen type, specimen adequacy, general
// categorization, interpretation/result, ancillary testing) — verified
// against IARC's own published Bethesda reference before building the
// seed data, not improvised. This dictionary covers the three
// configurable-vocabulary components (adequacy, general categorization,
// interpretation/result) a lab would actually maintain, plus the real,
// standard clinical recommendation vocabulary; specimen type and
// ancillary testing are per-case narrative fields, not a fixed
// vocabulary to seed here.
//
// Dev: mockCytologyCategoryService (localStorage-backed)
// Live: a real FirestoreCytologyCategoryService, same "dev mock / live
// Firestore" split every other dictionary in this app already follows.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** The real, configurable components this dictionary covers. Matches
 *  the real, standard terminology exactly (not invented category
 *  names) so this stays recognizable to a real cytotechnologist/
 *  pathologist reading it. 'recommendation' added Phase 5 — real,
 *  standard clinical recommendations, not a Bethesda report component
 *  itself, but reusing the same dictionary since it's selected and
 *  displayed the same way. */
export type CytologyCategorySection = 'adequacy' | 'general_categorization' | 'interpretation_result' | 'recommendation';

/** Real, per direct guidance's own sequenced international roadmap
 *  (US/CA, then UK/EU, then Australia/NZ, then South Korea): which
 *  real, standard reporting nomenclature a dictionary entry belongs
 *  to. Real, deliberate design: each system's own entries are fully
 *  independent — their own real diagnosticRank/requiresPathologistReview/
 *  isUnsatisfactory values, calibrated to THAT system's own real
 *  clinical/regulatory thresholds — not a shared, cross-system mapping
 *  forced onto one canonical scale. Dyskaryosis grading and Bethesda
 *  grading are broadly analogous, not clinically interchangeable (a
 *  "Borderline" BSCC call can mean either an ASC-US-equivalent or an
 *  AGC-equivalent finding depending on context); treating them as the
 *  same underlying severity value would be clinically dishonest.
 *  'bethesda' is this dictionary's original, real system (US, Canada,
 *  Australia, New Zealand, South Korea); 'bscc_rcpath' (UK, Scotland,
 *  Ireland) is the first real, additional system, added this phase. */
export type CytologyNomenclatureSystem = 'bethesda' | 'bscc_rcpath' | 'munchen_iiib' | 'sfcc';

/** Real, per direct guidance: "The user can indicate if the entry is a
 *  Primary, Secondary or both. When entering the Primary, the
 *  available entry is filtered for Primary or both entries. When in
 *  the Additional Interpretation - is filtered by secondary or both."
 *  Only meaningful for section: 'interpretation_result' — undefined
 *  (never enforced) for adequacy/general_categorization/recommendation
 *  entries, which aren't part of the Primary/Additional Interpretation
 *  selection at all. */
export type CytologyCategoryUsage = 'primary' | 'secondary' | 'both';

export interface CytologyCategoryEntry {
  id:            string;
  section:       CytologyCategorySection;
  /** Real, per this file's own CytologyNomenclatureSystem doc comment.
   *  Required on every real entry — every entry belongs to exactly one
   *  real reporting system, never shared across systems. */
  nomenclatureSystem: CytologyNomenclatureSystem;
  /** Real, per direct guidance — see this type's own doc comment.
   *  Required whenever section === 'interpretation_result'; left
   *  undefined for every other section, where it has no real meaning. */
  usage?:        CytologyCategoryUsage;
  /** Real, standard Bethesda sub-grouping within a section — e.g.
   *  "Negative for Intraepithelial Lesion or Malignancy — Organisms",
   *  "Epithelial Cell Abnormality — Squamous", "Epithelial Cell
   *  Abnormality — Glandular", "Other Malignant Neoplasms". Purely
   *  organizational (drives grouped dropdown/section display) — never
   *  itself a selectable value. Undefined for adequacy/general_categorization
   *  entries, which don't have real Bethesda sub-groups. */
  group?:        string;
  /** The real, standard Bethesda term itself — e.g. "Atypical squamous
   *  cells of undetermined significance". */
  label:         string;
  /** Real, standard short form where the Bethesda System has one —
   *  e.g. "ASC-US", "ASC-H", "LSIL", "HSIL", "AIS". Undefined where no
   *  standard abbreviation exists (most adequacy/organism/reactive-
   *  change entries). */
  abbreviation?: string;
  /** Real, per direct follow-up: "the interpretation dictionary should
   *  have a reasonable description field. The contents of that
   *  description field is what is use to populate the reviews and
   *  report." Load-bearing, not merely optional context — this is the
   *  real, standard reporting language for the category (what a real
   *  report or review display shows), distinct from `label` (the
   *  dictionary's own short, list-facing name) and `abbreviation` (a
   *  short code where Bethesda has one). All 45 real, seeded entries
   *  across every section carry one. Still typed optional so a future,
   *  real admin-added entry isn't blocked from saving before its
   *  description is written, but every real caller displaying review
   *  or report content should prefer this field over `label`. */
  description?:  string;
  /** Real, per the original module's own explicit routing requirement
   *  ("negative primary screens... directly to sign-out, while...
   *  abnormal screens... to the Pathologist review queue") — whether a
   *  case landing on this interpretation/result category requires
   *  pathologist review before sign-out, rather than a CT's own
   *  screening call being sufficient. Always false for adequacy/
   *  general_categorization/recommendation entries (they aren't a
   *  final interpretation on their own). NILM and its own real
   *  sub-findings (organisms, reactive changes, atrophy) are the only
   *  interpretation_result entries where this is false — every
   *  epithelial cell abnormality and other malignant neoplasm
   *  requires it. */
  requiresPathologistReview: boolean;
  /** Optional, forward-compatible link to this app's own existing
   *  AbnormalSeverity vocabulary ('Abnormal' | 'Critical' | 'Malignant',
   *  services/abnormalDetection/IAbnormalTriggerRuleService.ts) — for a
   *  real, later phase to wire GYN screening results into the same
   *  abnormal-detection/sign-out-guardrail framework PS-105 already
   *  built for surgical pathology, rather than a second, parallel
   *  severity vocabulary. Deliberately NOT consumed anywhere yet in
   *  this phase — recorded now so the real mapping decision (made once,
   *  here, by whoever configures this dictionary) doesn't need to be
   *  re-derived later from category names. */
  suggestedAbnormalSeverity?: 'Abnormal' | 'Critical' | 'Malignant';
  /**
   * Real, per direct guidance's own standard cytology QA agreement
   * taxonomy (Exact / Minor / Major Discrepancy, "differ by one
   * degree" vs. "crossing the threshold between low-grade/benign and
   * high-grade dysplastic/malignant entities"): a real, ordinal
   * severity rank on the single, combined negative → malignant
   * spectrum, meaningful only for section: 'interpretation_result'.
   * 0 = NILM and its own real sub-findings; 1 = ASC-US; 2 = LSIL;
   * 3 = ASC-H / atypical glandular cells NOS (the real, standard
   * "high-grade equivocal" tier); 4 = HSIL / AGC-favor-neoplastic /
   * AIS (definitively high-grade/pre-malignant); 5 = frank malignancy
   * (invasive HSIL, SCC, every adenocarcinoma variant, other
   * malignant neoplasm). The real, critical boundary
   * classifyCytologyAgreement (services/cytology/) checks for a
   * "High-Grade Skip Discrepancy" is rank ≤2 vs. rank ≥3 — real,
   * deliberate simplification of full ASCCP risk-based management
   * (which also weighs patient age and HPV genotype) down to a single
   * ordinal axis; not a substitute for that real, fuller guidance,
   * only a data-driven basis for automated QA agreement
   * classification.
   */
  diagnosticRank?: number;
  /** Real, per direct guidance's own standard cytology QA taxonomy:
   *  "Unsatisfactory / Inadequacy Discrepancy... tracked as an
   *  Adequacy Discrepancy Metric (separate from diagnostic
   *  accuracy)." Meaningful only for section: 'adequacy' — lets
   *  classifyCytologyAgreement (services/cytology/) determine
   *  satisfactory-vs-unsatisfactory data-driven, rather than by
   *  hardcoding a specific entry id, and correctly treats the two
   *  real "unsatisfactory" reasons (rejected vs. processed-but-
   *  insufficient) as the SAME side of this check, never as a
   *  discrepancy against each other. */
  isUnsatisfactory?: boolean;
  active:        boolean;
  isSystem:      boolean;
  sortOrder:     number;
}

export type NewCytologyCategoryEntry = Omit<CytologyCategoryEntry, 'id' | 'isSystem' | 'sortOrder'>;

export interface ICytologyCategoryService {
  getAll():                                                        Promise<ServiceResult<CytologyCategoryEntry[]>>;
  getActive():                                                     Promise<ServiceResult<CytologyCategoryEntry[]>>;
  getBySection(section: CytologyCategorySection):                  Promise<ServiceResult<CytologyCategoryEntry[]>>;
  /** Real, per this phase's own nomenclature-system work — the real,
   *  filtered subset a lab actually sees, given its own effective
   *  nomenclature setting. */
  getByNomenclatureSystem(system: CytologyNomenclatureSystem):      Promise<ServiceResult<CytologyCategoryEntry[]>>;
  getById(id: ID):                                                 Promise<ServiceResult<CytologyCategoryEntry>>;
  add(entry: NewCytologyCategoryEntry):                            Promise<ServiceResult<CytologyCategoryEntry>>;
  update(id: ID, changes: Partial<CytologyCategoryEntry>):         Promise<ServiceResult<CytologyCategoryEntry>>;
  deactivate(id: ID):                                              Promise<ServiceResult<CytologyCategoryEntry>>;
  reactivate(id: ID):                                              Promise<ServiceResult<CytologyCategoryEntry>>;
  remove(id: ID):                                                  Promise<ServiceResult<void>>;
}
