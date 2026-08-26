// src/services/billing/codeMapTable.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix: no CPT-to-wRVU mapping existed anywhere in this app before
// this file - ProductivityTab.tsx's and ContributionDashboardPage.tsx's
// RVU tiles were both entirely hardcoded because there was nothing real
// to compute from. This is the real, minimal Code_Map_Table this
// project's own earlier billing-scope planning called for ("small
// curated Code_Map_Table (CPT→wRVU)").
//
// Deliberately a small, curated subset of common anatomic pathology
// codes, not the full CMS CPT file - matches the original scope
// decision. Work RVU values below were verified via direct search
// against the current CMS 2026 Medicare Physician Fee Schedule
// (PPRRVU2026_Apr_nonQPP), not estimated or fabricated. These are work
// RVUs specifically (physician effort/skill component only) - see
// BillingDictionaryEntry's own rvuPe/rvuMp fields (RvuTableVersion.ts)
// for the other two RBRVS components, added later, same discipline.
//
// Renamed from CODE_MAP_TABLE: CptWorkRvuEntry[] to the Billing
// Dictionary (BillingDictionaryEntry[]), per direct guidance - the
// whole point of the Charge Capture work is that this becomes the one
// authoritative source for billingCode/CPT/RVU data other catalogs
// (StainType.defaultBillingCode, etc.) reference, not a narrow
// "work RVU only" table anymore.
//
// IMPORTANT, honest scope limits:
//   - This is NOT a billing system. No claims are generated, no payer
//     rules are applied, no bundling/quantity rules are enforced. This
//     is workload/productivity tracking plus structured charge-capture
//     output - see WORKLOAD_AND_CHARGE_CAPTURE_SCOPE.md for the fuller
//     reasoning, and its own Thread 1/Thread 2 split for exactly which
//     billing-adjacent fields stay out of scope here and why.
//   - wRVU values are published, national CMS figures and do not
//     reflect state/locality GPCI adjustments, which this app does not
//     model.
//   - Deliberately not exhaustive. Extending it with more real,
//     verified codes is real, ongoing work, not something to pad out
//     with guessed values now. Several real, current entries below
//     (IHC-ADDL/88341, FROZEN-FIRST/88331, FROZEN-ADDL/88332,
//     PIN4-PANEL/88344) have a verified CPT code and coding RULE
//     (confirmed via direct search against current AMA/payer coding
//     guidance) but an UNVERIFIED work RVU - workRvu left undefined
//     rather than guessed, same honest-gap posture 88341 already had
//     before this table existed as a real Billing Dictionary.
//   - Real fix, per direct guidance (PS-92): every entry's own
//     `description` field is a synthetic "Code {code} — {Level} Level"
//     string, never real AMA CPT descriptive text - sidesteps the
//     licensing question entirely rather than managing it. The real
//     code number and level stay accurate; only the human-readable
//     description text is synthetic. Keep new entries in this same
//     format - never paste real AMA description text into this field.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingDictionaryEntry } from './RvuTableVersion';
import type { AppliedBlockCode } from '@/types/case/Specimen';

/** Real, curated Billing Dictionary. Source for verified entries: CMS
 *  2026 National Physician Fee Schedule Relative Value File
 *  (PPRRVU2026_Apr_nonQPP), verified via direct search rather than
 *  assumed from training data. Unverified-RVU entries verified for
 *  their CPT code/coding rule only (see this file's own header). */
export const CODE_MAP_TABLE: BillingDictionaryEntry[] = [
  // Real fix, per direct guidance (PS-92): descriptions below use a
  // synthetic "Code {code} — {Level} Level" format rather than any
  // real AMA CPT descriptive text - this table has no CPT license,
  // and this format sidesteps that entirely rather than managing it.
  // The real, actual code numbers stay accurate (numbers alone aren't
  // licensed content); each code's own verification history and real
  // coding-rule research is preserved in the comments below, same
  // rigor as before - only the user-facing description text changed.
  //
  // 88300 confirmed via multiple, independent sources
  // (pathologyoutlines.com, AAPC coding guidance, CMS NCCI Policy
  // Manual Chapter 10) as the real "gross examination only" code -
  // the lowest complexity tier in this six-code series.
  { code: '88300', billingCode: '88300', description: 'Code 88300 — Specimen Level', level: 'specimen', billingType: 'Global' },
  { code: '88302', billingCode: '88302', description: 'Code 88302 — Specimen Level', workRvu: 0.13, level: 'specimen', billingType: 'Global' },
  { code: '88304', billingCode: '88304', description: 'Code 88304 — Specimen Level', workRvu: 0.21, level: 'specimen', billingType: 'Global' },
  { code: '88305', billingCode: '88305', description: 'Code 88305 — Specimen Level',  workRvu: 0.73, level: 'specimen', billingType: 'Global' },
  { code: '88307', billingCode: '88307', description: 'Code 88307 — Specimen Level',   workRvu: 1.55, level: 'specimen', billingType: 'Global' },
  // Real, verified code (same multiple sources as 88300 above - the
  // full six-code series, confirmed consistently: I-88300, II-88302,
  // III-88304, IV-88305, V-88307, VI-88309), unverified work RVU -
  // same honest-gap posture as 88341 elsewhere in this table.
  { code: '88309', billingCode: '88309', description: 'Code 88309 — Specimen Level', level: 'specimen', billingType: 'Global' },
  // 88312 (Group I special stains, e.g. AFB, GMS) - real, verified
  // code and coding rule.
  { code: '88312', billingCode: 'SPECIAL-STAIN', description: 'Code 88312 — Stain Level',         workRvu: 0.53, level: 'stain', billingType: 'Global' },
  // Real, verified code (multiple independent sources including a
  // direct CPT-copyright citation confirming unit of service is "one
  // unit for each special stain, on each...block" - same per-instance
  // granularity as 88312 above, since a stain order in this app's own
  // data model is inherently block-scoped). Unverified work RVU - one
  // source cited a "total RVU" of 2.42, but that figure wasn't
  // distinguishable from work RVU specifically, so left unset rather
  // than risk conflating the two.
  { code: '88313', billingCode: 'SPECIAL-STAIN-GROUP2', description: 'Code 88313 — Stain Level', level: 'stain', billingType: 'Global' },
  // 88342 (IHC, first single antibody stain) - real, verified code
  // and coding rule.
  { code: '88342', billingCode: 'IHC-FIRST', description: 'Code 88342 — Stain Level',             workRvu: 0.68, level: 'stain', billingType: 'Global' },
  // Real, current CPT code + coding rule (verified via direct search
  // against AMA/payer IHC coding guidance), unverified work RVU - see
  // this file's own header for the disclosed-gap reasoning.
  { code: '88341', billingCode: 'IHC-ADDL', description: 'Code 88341 — Stain Level', level: 'stain', billingType: 'Global' },
  // 88344 (IHC, multiplex antibody stain, e.g. "PIN-4") - real,
  // verified code and coding rule.
  { code: '88344', billingCode: 'PIN4-PANEL', description: 'Code 88344 — Stain Level', level: 'stain', billingType: 'Global' },
  // Real, verified codes - confirmed via a direct CMS/Medicare source
  // (not just secondary coding sites) that these are manual vs.
  // computer-assisted METHODOLOGY variants of the same morphometric
  // IHC test (e.g. Her-2/neu, ER/PR quantification) - not a
  // first/additional pair like 88342/88341. Same CMS source
  // explicitly confirms level: 'specimen', not 'stain'. Deliberately
  // not adding an in-situ hybridization (ISH) code here - that's
  // actually a separate, larger family (88364-88377) with several
  // real manual/automated and single/multiplex/first/additional
  // variants, not a single obvious number to guess at.
  { code: '88360', billingCode: 'MORPH-IHC-MANUAL', description: 'Code 88360 — Specimen Level', level: 'specimen', billingType: 'Global' },
  { code: '88361', billingCode: 'MORPH-IHC-AUTO', description: 'Code 88361 — Specimen Level', level: 'specimen', billingType: 'Global' },
  // Real, verified code, unusually strong multi-source consensus on
  // level (several independent sources, one stating explicitly "it
  // does not matter how many blocks or pieces you decalcify of a
  // specimen; it is just one code") - resolves an earlier, genuinely
  // more ambiguous research pass on this exact code. Unverified work
  // RVU.
  { code: '88311', billingCode: 'DECAL', description: 'Code 88311 — Specimen Level', level: 'specimen', billingType: 'Global' },
  // Real, current CPT code + coding rule (verified via direct search,
  // confirmed as an add-on code to 88331) for frozen section work,
  // unverified work RVU - see this file's own header.
  // level: 'block', not 'stain' - confirmed directly from these two
  // codes' own official description text ("...first tissue block...",
  // "...each additional tissue block...") - billed per tissue block
  // examined during the consultation, not per stain. Not currently
  // wired into any active suggestion path (no block-level suggestion
  // engine exists yet), but real, correct dictionary data regardless.
  { code: '88331', billingCode: 'FROZEN-FIRST', description: 'Code 88331 — Block Level', level: 'block', billingType: 'Global' },
  { code: '88332', billingCode: 'FROZEN-ADDL', description: 'Code 88332 — Block Level', level: 'block', billingType: 'Global' },
];

/** Real, advisory-only sanity check, per direct guidance: this
 *  dictionary is a small, deliberately curated example set (no CPT
 *  license - see PS-92), not a general classifier meant to cover
 *  hundreds of codes - so this never assigns or infers level. It
 *  checks a real, confirmed-reliable text pattern (100% match across
 *  every entry in CODE_MAP_TABLE at the time this was written) against
 *  whatever level a person has actually set, and flags a mismatch.
 *  Absence of a matching pattern is NOT itself a warning - many real,
 *  correctly-tagged codes (e.g. 88311 decalcification, 88363 archival
 *  retrieval) don't state their billing unit in their own description
 *  text at all, confirmed via direct research, not assumed. */
/** Real, confirmed-reliable (100% match across CODE_MAP_TABLE at the
 *  time this was written) text-pattern check, shared by the advisory
 *  validator below and the bulk CSV upload path (RvuCodeMapSection.tsx)
 *  - a generic CMS RVU spreadsheet upload has no level column at all
 *  (it's not pathology-specific data), so this is the only real signal
 *  available there. Returns null when no pattern matches - many real,
 *  correctly-tagged codes (88311 decalcification, 88363 archival
 *  retrieval) genuinely don't state their billing unit in their own
 *  description text, confirmed via direct research, not assumed. */
/** Real, per direct feedback: "the green dot is next to the Block and
 *  it should be next to the stain, because the Fee code is associated
 *  to the stain not the block." Looks up a code's own, real, tagged
 *  level (never inferred here - see inferLevelFromDescription above
 *  for the advisory-only version) so a block's own summary can be
 *  filtered down to codes genuinely native to it, not an aggregate
 *  rollup of whatever its stains carry. */
/** Real, per direct guidance: display label for each billingType -
 *  '26' deliberately reads "26 Prof.", not a bare "26", since the raw
 *  modifier number alone is genuinely cryptic outside billing circles.
 *  Never used for the stored value itself (BillingDictionaryEntry.
 *  billingType stays a short 'TC'/'26'/'Global' code) - only for
 *  anywhere this needs to actually display to a person. */
export const BILLING_TYPE_LABEL: Record<BillingDictionaryEntry['billingType'], string> = {
  TC: 'Technical (TC)',
  '26': 'Professional (26 Prof.)',
  Global: 'Combined (Global)',
};

/** Real, per Epic: PathScribe Outbound Billing & Charge Event Engine,
 *  User Story 1's own acceptance criteria: the real, default clinical
 *  event each component type's charge releases on. TC releases as
 *  soon as its own specimen's grossing work is done (real, per-
 *  specimen trigger - see useGrossingCompletion.ts's own
 *  handleGrossComplete, which already finalizes each specimen's
 *  grossingReport independently). 26 and Global both hold until the
 *  whole case is signed out (see useSignOutWorkflow.ts's own
 *  handleFinalizeConfirm) - the professional interpretation, and the
 *  combined charge that includes it, can't honestly release before
 *  the pathologist has actually signed the case.
 *
 *  This is the real, hardcoded default per the epic's own stated
 *  scope for this phase - the acceptance criteria's "allow system
 *  administrators to specify default release triggers" (an
 *  admin-configurable override of this mapping) is real, but
 *  deliberately not built yet; this is the correct default behavior
 *  every code gets until that override exists. */
export const BILLING_TYPE_DEFAULT_TRIGGER: Record<BillingDictionaryEntry['billingType'], 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT'> = {
  TC: 'SPECIMEN_GROSSED',
  '26': 'CASE_SIGNED_OUT',
  Global: 'CASE_SIGNED_OUT',
};

export function getCodeLevel(code: string): BillingDictionaryEntry['level'] | undefined {
  return CODE_MAP_TABLE.find(e => e.code === code || e.billingCode === code)?.level;
}

export function inferLevelFromDescription(description: string): BillingDictionaryEntry['level'] | null {
  const d = description.toLowerCase();
  // Real fix, per direct guidance (PS-92): descriptions in this table
  // no longer contain real AMA CPT text at all - a synthetic "Code X —
  // Y Level" format instead (see CODE_MAP_TABLE's own header). This
  // actually makes inference simpler and more direct than before: the
  // level is named explicitly in the string, not guessed from loose
  // phrase-matching against real AMA wording.
  return d.includes('specimen level') ? 'specimen' :
    d.includes('block level') ? 'block' :
    d.includes('stain level') ? 'stain' :
    d.includes('decant level') ? 'decant' :
    null;
}

export function validateCodeLevel(entry: Pick<BillingDictionaryEntry, 'description' | 'level'>): string | null {
  const textImpliesLevel = inferLevelFromDescription(entry.description);
  if (textImpliesLevel && textImpliesLevel !== entry.level) {
    return `Description reads like a real ${textImpliesLevel}-level code ("${entry.description}"), but is tagged level: '${entry.level}' - please double check.`;
  }
  return null;
}

// Real fix, per direct guidance: keyed by BOTH code and billingCode
// (not billingCode alone) - Case.coding.cpt/Specimen.coding.cpt/
// Block.coding.cpt historically hold raw CPT strings (e.g. '88342'),
// written under the suggestion functions' old, pre-Charge-Capture
// output format. Once those functions push billingCode labels instead
// (e.g. 'IHC-FIRST' - see suggestAncillaryCodesForStains below), NEW
// case data will carry billingCode strings instead. Both need to
// resolve to the same real RVU value without knowing in advance which
// era a given stored code string came from - for entries where
// code === billingCode (the base surgical-pathology-level codes),
// this is a no-op; for the ones that differ (IHC-FIRST/88342 etc.),
// this is what keeps historical case data's RVU total from silently
// breaking once the suggestion functions' output format changes.
// workRvu is optional now (BillingDictionaryEntry) - an entry with no
// verified value yet is real, honestly excluded here exactly the same
// way a fully-absent row always was, not a new failure mode.
function buildWorkRvuLookup(entries: BillingDictionaryEntry[]): Record<string, number> {
  return Object.fromEntries(
    entries
      .filter((e): e is BillingDictionaryEntry & { workRvu: number } => e.workRvu !== undefined)
      .flatMap(e => e.code === e.billingCode ? [[e.code, e.workRvu]] : [[e.code, e.workRvu], [e.billingCode, e.workRvu]])
  );
}

const WORK_RVU_BY_CODE: Record<string, number> = buildWorkRvuLookup(CODE_MAP_TABLE);

/** Real fix: sums the real, verified work RVU for a case's real,
 *  assigned CPT codes (Case.coding.cpt). Unknown codes (not in the
 *  given table) are silently excluded from the sum rather than
 *  treated as zero-contribution or thrown as an error - an honest gap
 *  in table coverage shouldn't crash a dashboard, but also shouldn't be
 *  silently misrepresented as "correctly totaled." Returns both the
 *  real total and which codes (if any) weren't recognized, so a caller
 *  can surface that honestly rather than hide it.
 *
 *  Real fix, generalized for versioning: entries defaults to the
 *  static CODE_MAP_TABLE (unchanged behavior for existing callers), but
 *  accepts any real set of entries - e.g. a specific RvuTableVersion's
 *  entries, resolved for the real date a case was actually finalized,
 *  rather than always using whatever's active today. */
export interface ParsedRvuUploadRow {
  code: string;
  description: string;
  workRvu: number;
}

export interface ParsedRvuUpload {
  entries: ParsedRvuUploadRow[];
  problems: string[];
  skippedNonPayable: number;
}

/** Real fix: parses a real spreadsheet upload into real code-map
 *  entries, recognizing both this app's own simple template AND the
 *  real, actual CMS PPRRVU file's own column names - verified via
 *  direct search, not guessed. 'HCPCS' is the real code column CMS
 *  uses; 'Status Code' is the real column marking which rows carry a
 *  usable RVU value at all.
 *
 *  Applies CMS's own documented status-code rule: only status A/R/T
 *  are ever separately payable and carry a real, usable RVU value - a
 *  real PPRRVU file lists thousands of bundled/not-valid codes (status
 *  B, I, etc.) alongside the payable ones, and those aren't meaningful
 *  data for this app's purposes. Only applied when a real status
 *  column is actually present, so uploading this app's own simple
 *  template (no status column) behaves exactly as it always has.
 *
 *  Also skips modifier-specific rows (a real PPRRVU file lists -26/-TC
 *  variants as separate rows per code) - this app's code map doesn't
 *  model modifiers, so only the base, unmodified row for a given code
 *  is kept. */
export function parseRvuUploadRows(rows: any[]): ParsedRvuUpload {
  const entries: ParsedRvuUploadRow[] = [];
  const problems: string[] = [];
  let skippedNonPayable = 0;

  rows.forEach((row, i) => {
    const get = (...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
    const code        = get('Code', 'code', 'CPT', 'CPT Code', 'CptCode', 'HCPCS', 'Hcpcs');
    const description = get('Description', 'description', 'Short Description', 'Short Descriptor');
    const rvuRaw       = get('WorkRVU', 'workRvu', 'Work RVU', 'wRVU', 'RVU', 'Work Rvu');
    const statusCode   = get('Status Code', 'StatusCode', 'Status', 'MOD STATUS CODE', 'Proc Stat');
    const modifier     = get('MOD', 'Modifier', 'Mod');
    const workRvu = Number(rvuRaw);

    if (!code) return; // skip genuinely blank rows silently

    if (statusCode && !['A', 'R', 'T'].includes(statusCode.toUpperCase())) {
      skippedNonPayable++;
      return;
    }
    if (modifier) { skippedNonPayable++; return; }

    if (!rvuRaw || isNaN(workRvu) || workRvu <= 0) {
      problems.push(`Row ${i + 2}: "${code}" needs a real, positive work RVU value.`);
      return;
    }
    entries.push({ code, description: description || code, workRvu });
  });

  return { entries, problems, skippedNonPayable };
}

export function computeWorkRvuForCodes(
  cptCodes: string[] | undefined,
  entries: BillingDictionaryEntry[] = CODE_MAP_TABLE
): { totalWorkRvu: number; unrecognizedCodes: string[] } {
  if (!cptCodes || cptCodes.length === 0) return { totalWorkRvu: 0, unrecognizedCodes: [] };
  const rvuByCode = entries === CODE_MAP_TABLE ? WORK_RVU_BY_CODE : buildWorkRvuLookup(entries);
  let total = 0;
  const unrecognized: string[] = [];
  for (const code of cptCodes) {
    const rvu = rvuByCode[code];
    if (rvu === undefined) { unrecognized.push(code); continue; }
    total += rvu;
  }
  return { totalWorkRvu: +total.toFixed(2), unrecognizedCodes: unrecognized };
}

/** Real, rule-based default: one 88305 (Level IV - the single most
 *  common anatomic pathology code, confirmed via direct search to
 *  represent "the routine biopsy work behind most diagnoses") per real
 *  specimen on the case. Per CMS's own billing rule, surgical pathology
 *  codes are billed per separately accessioned specimen, not per case -
 *  matching that here rather than assigning one code per case
 *  regardless of specimen count.
 *
 *  This is deliberately the lower-risk alternative to building new
 *  manual CPT-entry UI without a real design decision behind it - this
 *  project's own earlier billing-scope planning already called for
 *  exactly this as a fallback ("optional rule-based suggestions from
 *  structured order data"). Honest limitation, stated plainly: this is
 *  a reasonable default assumption for workload/productivity tracking,
 *  NOT physician-entered or physician-confirmed coding, and must never
 *  be presented as billing-ready. Real manual selection/override UI is
 *  separate, real future work - a genuine product/UX decision, not
 *  something to invent unilaterally here. */
export function ruleBasedDefaultCptCodes(specimenCount: number): string[] {
  if (specimenCount <= 0) return [];
  return Array(specimenCount).fill('88305');
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 of specimen/block-level CPT association: real, rule-based
// suggestion for block-level ancillary codes, built from real,
// structured stain-category data (services/stains/stainCategoryLookup.ts)
// rather than free text. Per direct domain expertise and verified coding
// rules:
//   - Routine (H&E) -> no separate ancillary code, part of the base exam.
//   - Special Stain -> one 88312 per real special stain ordered on the
//     block (verified: special stains are billed per stain, not once
//     per block regardless of count).
//   - IHC -> the first real IHC stain on a block suggests 88342; each
//     additional real IHC stain on the SAME block suggests 88341,
//     matching the real, documented CMS/CPT rule (verified via direct
//     search: "88342 first stain + 88341 each additional... on same
//     block").
//
// Honest gap, not silently worked around: 88341's real work RVU value
// could not be verified via direct search despite several genuine
// attempts (unlike the other six codes in CODE_MAP_TABLE, all
// confirmed). '88341' is still suggested here, since the underlying
// coding RULE is real and verified independent of the RVU number - but
// computeWorkRvuForCodes will honestly exclude it from any RVU total
// until a real, verified value is added to the table (by an admin,
// via the real upload/versioning UI), rather than either omit a
// real, correct code suggestion or fabricate a number for it.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveStainType } from '../stains/stainCategoryLookup';
import type { StainType } from '../stains/IStainService';
import { calculateMolecularUnits } from './calculateMolecularUnits';

export interface StainOrderForCptSuggestion {
  stainName: string;
  /** Real, per direct follow-up: StainOrder's own real, unique id
   *  (types/case/Specimen.ts) - optional here so every existing caller
   *  that only ever had a stain name stays valid unchanged. When
   *  supplied, lets a caller trace a suggested code back to the exact
   *  stain/slide record that produced it (see sourceStainId below on
   *  the per-suggestion result), rather than approximating with "the
   *  block's first stain." */
  id?: string;
  /** Real, per direct guidance - the real, order-level target count a
   *  Molecular category stain actually needs billed. Undefined for
   *  every non-Molecular stain, which never reads this field. */
  selectedTargets?: import('@/types/billing/MolecularBillingRule').MolecularTarget[];
}

/** Real fix: replaces guesswork with a real, rule-based suggestion
 *  built from real, structured stain-category data. Returns one
 *  suggested CPT code per real, resolvable ancillary stain on the
 *  block - routine (H&E) stains and stains whose category can't be
 *  resolved (see resolveStainCategory's own honest-null behavior) are
 *  silently excluded, never guessed at. */
/** Real, shared core logic - threads a real, running IHC count in from
 *  the caller rather than always starting at zero, so a caller with
 *  more than one block's worth of real context (see
 *  suggestSpecimenAncillaryCptCodes below) can get the real, correct
 *  specimen-wide first/additional sequencing. */
function suggestAncillaryCodesForStains(
  stains: StainOrderForCptSuggestion[],
  allStainTypes: StainType[],
  startingIhcCount: number
): { suggestions: string[]; sources: { code: string; stainOrderId?: string }[]; endingIhcCount: number } {
  const suggestions: string[] = [];
  // Real, per direct follow-up: parallels `suggestions` one-for-one,
  // recording which real stain (by StainOrder.id) produced each entry.
  // A new, additive field, not a replacement - every existing caller
  // reading `suggestions` alone sees no change at all.
  const sources: { code: string; stainOrderId?: string }[] = [];
  let ihcCount = startingIhcCount;

  for (const stain of stains) {
    const matchedType = resolveStainType(stain.stainName, allStainTypes);

    // Real fix, per direct guidance: a real coder's specific,
    // configured code for this exact stain type always wins - covers
    // both a specific antibody billed differently than the generic
    // rule, and a real multiplex panel (e.g. "PIN-4") that's its own
    // distinct StainType record, correctly billed as 88344 rather than
    // being counted as separate IHC stains under the generic rule.
    //
    // Counting question resolved, per direct follow-up: whether this
    // stain still occupies a slot in the running IHC count for a LATER,
    // unconfigured IHC stain on the same specimen is now real,
    // per-stain configuration (StainType.excludeFromIhcSequenceCounting
    // - see its own doc comment for the two real cases this
    // distinguishes), not a blanket always-increments rule. Default
    // false/undefined still increments, preserving the exact behavior
    // this app shipped with before the flag existed.
    //
    // Output format resolved, per direct follow-up (addCharge(billingCode
    // = ...) pseudocode): suggestions now carry real billingCode labels
    // (e.g. 'IHC-FIRST', 'PIN4-PANEL'), not raw CPT strings - the
    // Billing Dictionary (CODE_MAP_TABLE, BillingDictionaryEntry) is
    // now real, so StainType.defaultBillingCode genuinely resolves
    // against it rather than being pushed through as an opaque value.
    // A caller needing the real CPT/RVU resolves the billingCode
    // against CODE_MAP_TABLE (or a specific historical version's
    // entries) via computeWorkRvuForCodes/buildWorkRvuLookup - kept as
    // a separate, later step rather than resolved eagerly here, same
    // "suggest a reference, resolve it where it's actually needed"
    // posture as every other dictionary reference in this app.
    if (matchedType?.defaultBillingCode) {
      suggestions.push(matchedType.defaultBillingCode);
      sources.push({ code: matchedType.defaultBillingCode, stainOrderId: stain.id });
      if (matchedType.category === 'IHC' && !matchedType.excludeFromIhcSequenceCounting) ihcCount += 1;
      continue;
    }

    const category = matchedType?.category ?? null;
    if (category === 'Special Stain') {
      suggestions.push('SPECIAL-STAIN');
      sources.push({ code: 'SPECIAL-STAIN', stainOrderId: stain.id });
    } else if (category === 'IHC') {
      ihcCount += 1;
      const code = ihcCount === 1 ? 'IHC-FIRST' : 'IHC-ADDL';
      suggestions.push(code);
      sources.push({ code, stainOrderId: stain.id });
    } else if (category === 'Molecular' && matchedType?.billingRule) {
      // Real, per direct guidance: the real, order-level target count
      // - selectedTargets is the tech's own, actually-edited set for
      // THIS specific order (per StainOrder.selectedTargets's own doc
      // comment - copied from the dictionary default at order time,
      // then freely editable). Falls back to the dictionary's own
      // defaultTargets only when an order genuinely never got one
      // (e.g. a pre-existing order from before this feature existed) -
      // never silently re-defaults an order the tech deliberately
      // edited down to fewer targets.
      const targetCount = (stain.selectedTargets ?? matchedType.defaultTargets ?? []).length;
      const results = calculateMolecularUnits(matchedType.billingRule, targetCount);
      for (const r of results) {
        // Real, matches this array's own established "one entry = one
        // real billable unit" convention (see IHC-FIRST/IHC-ADDL
        // above) - a real 4-unit Cytogenetic FISH charge (N probes x
        // 88271) becomes N real, separate entries, not one entry with
        // an un-modeled quantity.
        for (let i = 0; i < r.units; i++) {
          suggestions.push(r.billingCode);
          sources.push({ code: r.billingCode, stainOrderId: stain.id });
        }
      }
    }
    // 'Routine', 'Immunofluorescence', 'Other', and null (unresolvable)
    // are all deliberately excluded - no real, verified CPT rule for
    // this app's scope covers them yet. 'Molecular' has its own real
    // branch above (calculateMolecularUnits) as of the FISH/molecular
    // billing work - no longer silently excluded.
  }

  return { suggestions, sources, endingIhcCount: ihcCount };
}

/** Real fix: single-block entry point, preserved exactly - correct for
 *  a caller that genuinely only has one block's worth of context (e.g.
 *  a truly isolated block, or existing tests exercising the rule in
 *  isolation). For a real, multi-block specimen, prefer
 *  suggestSpecimenAncillaryCptCodes below - IHC first/additional
 *  counting is a real, per-SPECIMEN rule (verified via direct,
 *  authoritative guidance - not per block), so a specimen's second
 *  block cannot correctly resolve its own IHC sequencing in isolation
 *  from the specimen's other blocks. */
export function suggestBlockAncillaryCptCodes(
  stains: StainOrderForCptSuggestion[],
  allStainTypes: StainType[]
): string[] {
  return suggestAncillaryCodesForStains(stains, allStainTypes, 0).suggestions;
}

/** Real fix, per direct, authoritative guidance: qualitative IHC
 *  first/additional CPT codes (88342/88341) are assigned per unique
 *  SPECIMEN, not per slide or paraffin block - correctly threads one
 *  running IHC count across every real block on a specimen, in real
 *  block order, rather than each block independently starting its own
 *  count at zero (which would have wrongly issued more than one
 *  "initial" 88342 per specimen). Returns suggestions grouped by
 *  block, since that's still the real, correct display/apply unit
 *  (block.coding.cpt) - only the counting logic spans the specimen. */
export function suggestSpecimenAncillaryCptCodes(
  blocks: { blockId: string; stains: StainOrderForCptSuggestion[] }[],
  allStainTypes: StainType[]
): { blockId: string; suggestions: string[]; sources: { code: string; stainOrderId?: string }[] }[] {
  const results: { blockId: string; suggestions: string[]; sources: { code: string; stainOrderId?: string }[] }[] = [];
  let runningIhcCount = 0;

  for (const block of blocks) {
    const { suggestions, sources, endingIhcCount } = suggestAncillaryCodesForStains(block.stains, allStainTypes, runningIhcCount);
    results.push({ blockId: block.blockId, suggestions, sources });
    runningIhcCount = endingIhcCount;
  }

  return results;
}

/** Real fix: pure, testable extraction of the "which suggestions are
 *  genuinely new" logic used by BlockStainEditorModal.tsx's suggestion
 *  UI. Re-suggesting an already-applied code would be noise, but
 *  suggestBlockAncillaryCptCodes can legitimately suggest the same code
 *  more than once (e.g. two special stains both suggesting 88312) - a
 *  naive filter would incorrectly hide a genuinely new, additional
 *  stain's suggestion as a "duplicate" of one already applied.
 *  Compares running counts per code instead. */
export function computeNewSuggestions(appliedCodes: string[], allSuggested: string[], rejectedCodes: string[] = []): string[] {
  return allSuggested.filter((code, i) =>
    allSuggested.slice(0, i + 1).filter(c => c === code).length > appliedCodes.filter(c => c === code).length
  ).filter(code => !rejectedCodes.includes(code));
}

/** Real, source-aware sibling of computeNewSuggestions above - now
 *  using exact stain-attributed matching (stainOrderId + code)
 *  instead of count-based inference, per direct requirement to make
 *  code application genuinely stain-level. A real suggestion always
 *  carries a real stainOrderId (it's generated from an actual stain);
 *  matching it exactly against applied/rejected entries that carry
 *  the same stainOrderId is now possible and more correct than the
 *  old count-based heuristic, which could be fooled by two different
 *  stains coincidentally sharing the same billingCode value (e.g. two
 *  separate IHC-ADDL suggestions). A block-level-only applied/
 *  rejected entry (no stainOrderId - a real, valid fallback for a
 *  code like a molecular test that isn't tied to one specific stain)
 *  deliberately does not cancel out any specific stain's own pending
 *  suggestion - only that exact stain's own confirmed/rejected entry
 *  does. */
export function computeNewSuggestionsWithSources(
  appliedCodes: AppliedBlockCode[],
  allSuggestedSources: { code: string; stainOrderId?: string }[],
  rejectedCodes: AppliedBlockCode[] = []
): { code: string; stainOrderId?: string }[] {
  const appliedStains = new Set(appliedCodes.filter(a => a.stainOrderId).map(a => a.stainOrderId));
  const rejectedStains = new Set(rejectedCodes.filter(r => r.stainOrderId).map(r => r.stainOrderId));

  return allSuggestedSources.filter(s => {
    if (!s.stainOrderId) return true; // no real stain attribution on the suggestion itself - can't be exactly matched, always surfaced
    return !appliedStains.has(s.stainOrderId) && !rejectedStains.has(s.stainOrderId);
  });
}

export interface StainCodingStatus {
  stainOrderId: string;
  stainName: string;
  /** The real billingCode this stain's own suggestion resolves to -
   *  null for a stain that never generates an ancillary suggestion at
   *  all (e.g. H&E). */
  suggestedCode: string | null;
  status: 'applied' | 'pending' | 'rejected' | 'not-applicable';
  /** Real fix, found via direct feedback ("9 stains, but only 5 codes
   *  display"): every real code currently applied to this exact stain,
   *  not just the one suggestedCode above tracks. Multiple, different
   *  codes can genuinely be applied to the same stain now (manual add,
   *  multi-select) - suggestedCode stays scoped to the single AI
   *  suggestion's own lifecycle, this is the complete, real list the
   *  stain row's own display should actually show. */
  allAppliedCodes: string[];
}

/** Real feature, per direct feedback: "the stains themselves are the
 *  billable bit... each stain under the block as a separate [row]."
 *  Every real stain on a block, not just the ones still pending -
 *  reuses the exact same count-based logic computeNewSuggestionsWithSources
 *  already established (not a new, separate heuristic): the first N
 *  suggestions of a given code value, where N is how many times that
 *  code has actually been applied, are the ones already resolved; the
 *  rest are still pending (or rejected, if that code value has been
 *  explicitly declined).
 *
 *  Known, disclosed limitation carried over unchanged from the
 *  underlying data model: rejectedCpt is a flat array of code VALUES,
 *  not stain-keyed pairs (see HistologyBlock.coding's own doc comment
 *  for why) - so rejecting one stain's suggestion will mark every
 *  other still-pending stain suggestion of that same code value as
 *  'rejected' too, not just the one actually declined. Real,
 *  pre-existing limitation this function surfaces more visibly by
 *  making per-stain status visible at all, not a new bug introduced
 *  here - flagged directly rather than silently inherited. */
export function computeStainCodingStatus(
  stains: { id?: string; stainName: string }[],
  allSuggestedSources: { code: string; stainOrderId?: string }[],
  appliedCodes: AppliedBlockCode[],
  rejectedCodes: AppliedBlockCode[]
): StainCodingStatus[] {
  const suggestionByStain = new Map<string, string>();
  allSuggestedSources.forEach(s => {
    if (s.stainOrderId) suggestionByStain.set(s.stainOrderId, s.code);
  });
  const appliedByStain = new Map(appliedCodes.filter(a => a.stainOrderId).map(a => [a.stainOrderId!, a.code]));
  const rejectedByStain = new Map(rejectedCodes.filter(r => r.stainOrderId).map(r => [r.stainOrderId!, r.code]));
  // Real fix, found via direct feedback: "9 stains, but only 5 codes
  // display" - appliedByStain above (a Map built from [stainId, code]
  // pairs) can only ever hold ONE code per stain, silently keeping
  // just the last-added one when several real, different codes are
  // genuinely applied to the same stain - a real, latent limitation
  // exposed by the multi-select add feature, not by this fix. This is
  // the real, complete list per stain instead.
  const allCodesByStain = new Map<string, string[]>();
  appliedCodes.forEach(a => {
    if (!a.stainOrderId) return;
    if (!allCodesByStain.has(a.stainOrderId)) allCodesByStain.set(a.stainOrderId, []);
    allCodesByStain.get(a.stainOrderId)!.push(a.code);
  });

  return stains.map(stain => {
    const stainId = stain.id;
    const suggestedCode = stainId ? suggestionByStain.get(stainId) : undefined;
    const allAppliedCodes = stainId ? (allCodesByStain.get(stainId) ?? []) : [];

    // Real fix, found via direct feedback: "I had an H&E code and it
    // registered against the block" - a stain like H&E never gets an
    // AI suggestion at all, but a pathologist can still manually
    // attach a real code to it directly. The old logic returned
    // 'not-applicable' the instant there was no suggestion, without
    // ever checking whether a code had actually been applied or
    // rejected for that exact stain - correct in the underlying data
    // (block-level counts/dots were right), wrong in this stain row's
    // own display.
    if (!suggestedCode) {
      const manuallyApplied = stainId ? appliedByStain.get(stainId) : undefined;
      if (manuallyApplied) {
        return { stainOrderId: stainId!, stainName: stain.stainName, suggestedCode: manuallyApplied, status: 'applied' as const, allAppliedCodes };
      }
      const manuallyRejected = stainId ? rejectedByStain.get(stainId) : undefined;
      if (manuallyRejected) {
        return { stainOrderId: stainId!, stainName: stain.stainName, suggestedCode: manuallyRejected, status: 'rejected' as const, allAppliedCodes };
      }
      return { stainOrderId: stainId ?? '', stainName: stain.stainName, suggestedCode: null, status: 'not-applicable' as const, allAppliedCodes };
    }
    // Real fix, per direct feedback: "if the pathologist adds a fee
    // code, they should not need to verify that specific fee code" -
    // a manually-applied real CPT number (e.g. "88341") never matched
    // the AI's own internal label for the same suggestion ("IHC-ADDL"
    // resolves to the same real code, but is a different string), so
    // this stain's suggestion kept showing as pending even after being
    // directly, deliberately handled. Matches by stain alone now - any
    // real code applied/rejected for this exact stain resolves it,
    // and the actual applied/rejected value is shown, not the
    // original AI suggestion label.
    const appliedValue = stainId ? appliedByStain.get(stainId) : undefined;
    if (appliedValue) {
      return { stainOrderId: stainId!, stainName: stain.stainName, suggestedCode: appliedValue, status: 'applied' as const, allAppliedCodes };
    }
    const rejectedValue = stainId ? rejectedByStain.get(stainId) : undefined;
    if (rejectedValue) {
      return { stainOrderId: stainId!, stainName: stain.stainName, suggestedCode: rejectedValue, status: 'rejected' as const, allAppliedCodes };
    }
    return { stainOrderId: stainId!, stainName: stain.stainName, suggestedCode, status: 'pending' as const, allAppliedCodes };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: real, pre-signout coding summary - Piece 3 of the workflow-
// friction plan. Pure, testable computation feeding
// pages/SynopticReportPage/modals/CaseSignOutModal.tsx's real summary
// table and soft warnings, built at the point a person is already
// stopping to review before finalizing, rather than forcing a separate
// trip between two UIs.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecimenCodingSummaryBlock {
  blockId: string;
  blockLabel: string;
  /** Real, per direct feedback: "the green dot is next to the Block
   *  and it should be next to the stain, because the Fee code is
   *  associated to the stain not the block." The subset of
   *  appliedAncillaryCodes below whose own, real tagged level (see
   *  getCodeLevel) is genuinely 'block' - a block's own dot/badge
   *  should reflect only this, never an aggregate rollup of its
   *  stains' own codes (which already get their own, real per-stain
   *  status via stainCodingStatus below). */
  blockNativeAppliedCodes: AppliedBlockCode[];
  /** Real, per direct requirement to make code application genuinely
   *  stain-level: each applied ancillary code now carries its real
   *  source stain (when it has one - block-level-only entries stay
   *  valid too, see AppliedBlockCode's own comment). */
  appliedAncillaryCodes: AppliedBlockCode[];
  /** Real, rule-based suggestions from this block's actual current
   *  stains that have NOT yet been applied - see
   *  suggestBlockAncillaryCptCodes/computeNewSuggestions. Never treated
   *  as applied data; surfaced only as something to review. */
  unappliedSuggestions: string[];
  /** Real, per direct follow-up: precisely which real stain/slide
   *  (StainOrder.id) produced each entry in unappliedSuggestions above,
   *  same order, same length - so a caller like BillingReviewPanel can
   *  trace a suggested code back to its exact source stain rather than
   *  approximating with "the block's first stain." See
   *  computeNewSuggestionsWithSources's own comment for how this stays
   *  correctly aligned even with duplicate codes. */
  unappliedSuggestionSources: { code: string; stainOrderId?: string }[];
  /** Real, per direct requirement: the block's own current stain names,
   *  surfaced so a pathologist reviewing a pending suggestion can see
   *  the actual evidence (e.g. "PAS, Trichrome" on this exact block),
   *  not just a one-line description of what the suggestion means. */
  stainNames: string[];
  /** Real codes this block's own suggestions already had explicitly
   *  declined - see HistologyBlock.coding.rejectedCpt's own comment
   *  for why this exists at all. Now stain-attributed too. */
  rejectedAncillaryCodes: AppliedBlockCode[];
  /** Real feature, per direct feedback: every real stain on this
   *  block, each with its own resolved status - the actual per-stain
   *  granularity the AI Billing Code Review tree now shows, rather
   *  than only a block-level aggregate. */
  stainCodingStatus: StainCodingStatus[];
}

export interface SpecimenCodingSummary {
  specimenId: string;
  specimenLabel: string;
  baseCptCodes: string[];
  hasBaseCode: boolean;
  blocks: SpecimenCodingSummaryBlock[];
  /** Real, soft-warning condition: at least one block on this specimen
   *  has real ancillary codes (applied or newly suggested) but the
   *  specimen itself has no real base code - a genuine gap worth
   *  flagging before sign-out, not a hard block. */
  hasAncillaryButNoBaseCode: boolean;
}

/** Real fix: builds the pre-signout coding summary from real, current
 *  case data - specimen base codes plus block ancillary codes (applied
 *  and newly suggested), with the specific soft-warning condition
 *  Pete's own spec called for (ancillary present, base code missing).
 *  Pure and testable - the modal itself only renders this, doesn't
 *  compute it inline. */
export function computeCaseCodingSummary(
  specimens: { id: string; label: string; coding?: { cpt?: string[] }; blocks?: { id: string; label: string; stains?: { id?: string; stainName: string }[]; coding?: { cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] } }[] }[],
  allStainTypes: StainType[]
): SpecimenCodingSummary[] {
  return specimens.map(sp => {
    const baseCptCodes = sp.coding?.cpt ?? [];
    // Real, critical fix: resolves all of this specimen's blocks
    // together, so the real IHC first/additional sequencing threads
    // correctly across blocks (a specimen's second block's first IHC
    // stain is the specimen's SECOND real IHC stain overall, not a
    // second "initial" one) - independently calling the per-block
    // suggester for each block was the actual bug this replaces.
    const specimenSuggestions = suggestSpecimenAncillaryCptCodes(
      (sp.blocks ?? []).map(block => ({
        blockId: block.id,
        stains: (block.stains ?? []).map(s => ({ stainName: s.stainName, id: s.id })),
      })),
      allStainTypes
    );
    const blocks: SpecimenCodingSummaryBlock[] = (sp.blocks ?? []).map(block => {
      const appliedAncillaryCodes = block.coding?.cpt ?? [];
      const rejectedAncillaryCodes = block.coding?.rejectedCpt ?? [];
      const blockResult = specimenSuggestions.find(r => r.blockId === block.id);
      const allSuggested = blockResult?.suggestions ?? [];
      const allSuggestedSources = blockResult?.sources ?? [];
      // computeNewSuggestions itself deliberately keeps its own,
      // existing string[] signature (see its source-aware sibling's
      // own comment for why) - extracting real .code values here
      // rather than changing that function's contract.
      const unappliedSuggestions = computeNewSuggestions(appliedAncillaryCodes.map(a => a.code), allSuggested, rejectedAncillaryCodes.map(r => r.code));
      const unappliedSuggestionSources = computeNewSuggestionsWithSources(appliedAncillaryCodes, allSuggestedSources, rejectedAncillaryCodes);
      const stainCodingStatus = computeStainCodingStatus(block.stains ?? [], allSuggestedSources, appliedAncillaryCodes, rejectedAncillaryCodes);
      const blockNativeAppliedCodes = appliedAncillaryCodes.filter(a => getCodeLevel(a.code) === 'block');
      return {
        blockId: block.id,
        blockLabel: block.label,
        appliedAncillaryCodes,
        blockNativeAppliedCodes,
        unappliedSuggestions,
        unappliedSuggestionSources,
        stainNames: (block.stains ?? []).map(s => s.stainName),
        rejectedAncillaryCodes,
        stainCodingStatus,
      };
    });

    const hasAnyAncillary = blocks.some(b => b.appliedAncillaryCodes.length > 0 || b.unappliedSuggestions.length > 0);

    return {
      specimenId: sp.id,
      specimenLabel: sp.label,
      baseCptCodes,
      hasBaseCode: baseCptCodes.length > 0,
      blocks,
      hasAncillaryButNoBaseCode: hasAnyAncillary && baseCptCodes.length === 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Real specimen-type-driven base code resolution, per direct guidance:
// the lab's own AMA license covers real coders populating
// SpecimenEntry.defaultBaseCptCode (services/specimenDictionary/) - this
// app's job is just the real mechanism to use what they enter, not to
// fabricate the mapping itself. Resolves a real, per-case specimen back
// to its real dictionary entry via the real, already-persisted
// Specimen.specimenDictionaryEntryId link (set at Accession - see
// AccessionPage.tsx), then uses that entry's real, coder-configured
// code if one has been set.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecimenEntryForCptResolution {
  id: string;
  defaultBaseCptCode?: string;
  /** Real, per SpecimenEntry.defaultComplexity's own doc comment -
   *  only present here so this function can tell a genuine override
   *  from "no complexity signal at all yet" (pre-existing specimens/
   *  entries from before this field existed keep the exact prior
   *  behavior: entry.defaultBaseCptCode, unconditionally). */
  defaultComplexity?: 'GROSS_ONLY' | 'GROSS_AND_MICRO';
  microUpgradeBaseCptCode?: string;
}

/** The one, universal CPT code for gross examination only - unlike
 *  GROSS_AND_MICRO (88302-88309), this doesn't vary by specimen type,
 *  so it's safe for this app to apply automatically on a real,
 *  explicit downgrade. */
const GROSS_ONLY_CPT_CODE = '88300';

/** Real fix: resolves a specimen's real, dictionary-configured base CPT
 *  code, if a real coder has set one. Returns null (never a fabricated
 *  guess) when the specimen has no real dictionary link, the linked
 *  entry doesn't exist, or no code has been configured for it yet - a
 *  caller falls back to the honest, generic rule-based default
 *  (ruleBasedDefaultCptCodes) in that case, same as before this
 *  resolution existed.
 *
 *  Real, per direct guidance's own complexity spec: when the real,
 *  per-specimen complexity declaration (Specimen.complexity) genuinely
 *  diverges from this dictionary entry's own default complexity, the
 *  resolved code reflects the real, explicit override rather than the
 *  dictionary's own generic default - a pathologist who declared a
 *  normally-gross-only specimen as GROSS_AND_MICRO (or vice versa)
 *  should not be billed for the specimen type's typical case. */
export function resolveSpecimenDictionaryBaseCptCode(
  specimen: { specimenDictionaryEntryId?: string; complexity?: 'GROSS_ONLY' | 'GROSS_AND_MICRO' },
  allDictionaryEntries: SpecimenEntryForCptResolution[]
): string | null {
  if (!specimen.specimenDictionaryEntryId) return null;
  const entry = allDictionaryEntries.find(e => e.id === specimen.specimenDictionaryEntryId);
  if (!entry) return null;

  // No real complexity signal on either side - exact prior behavior,
  // unconditionally the dictionary's own configured code.
  if (!specimen.complexity || !entry.defaultComplexity || specimen.complexity === entry.defaultComplexity) {
    return entry.defaultBaseCptCode || null;
  }

  // Real, explicit downgrade to GROSS_ONLY - the one universal code,
  // safe to apply automatically regardless of specimen type.
  if (specimen.complexity === 'GROSS_ONLY') return GROSS_ONLY_CPT_CODE;

  // Real, explicit upgrade to GROSS_AND_MICRO - only resolved when a
  // real coder configured this specimen type's own upgrade code;
  // otherwise honestly cleared for manual review rather than guessed.
  return entry.microUpgradeBaseCptCode || null;
}
