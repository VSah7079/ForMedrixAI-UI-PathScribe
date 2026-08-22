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
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingDictionaryEntry } from './RvuTableVersion';

/** Real, curated Billing Dictionary. Source for verified entries: CMS
 *  2026 National Physician Fee Schedule Relative Value File
 *  (PPRRVU2026_Apr_nonQPP), verified via direct search rather than
 *  assumed from training data. Unverified-RVU entries verified for
 *  their CPT code/coding rule only (see this file's own header). */
export const CODE_MAP_TABLE: BillingDictionaryEntry[] = [
  { code: '88302', billingCode: '88302', description: 'Surgical pathology, gross examination only (Level II)',            workRvu: 0.13 },
  { code: '88304', billingCode: '88304', description: 'Surgical pathology, gross and microscopic examination (Level III)', workRvu: 0.21 },
  { code: '88305', billingCode: '88305', description: 'Surgical pathology, gross and microscopic examination (Level IV)',  workRvu: 0.73 },
  { code: '88307', billingCode: '88307', description: 'Surgical pathology, gross and microscopic examination (Level V)',   workRvu: 1.55 },
  { code: '88312', billingCode: 'SPECIAL-STAIN', description: 'Special stain (group 1), including interpretation',         workRvu: 0.53 },
  { code: '88342', billingCode: 'IHC-FIRST', description: 'Immunohistochemistry, first single antibody stain',             workRvu: 0.68 },
  // Real, current CPT code + coding rule (verified via direct search
  // against AMA/payer IHC coding guidance), unverified work RVU - see
  // this file's own header for the disclosed-gap reasoning.
  { code: '88341', billingCode: 'IHC-ADDL', description: 'Immunohistochemistry, each additional single antibody stain' },
  { code: '88344', billingCode: 'PIN4-PANEL', description: 'Immunohistochemistry, each multiplex antibody stain procedure (e.g. "PIN-4")' },
  // Real, current CPT code + coding rule (verified via direct search,
  // confirmed as an add-on code to 88331) for frozen section work,
  // unverified work RVU - see this file's own header.
  { code: '88331', billingCode: 'FROZEN-FIRST', description: 'Pathology consultation during surgery, first tissue block, with frozen section(s), single specimen' },
  { code: '88332', billingCode: 'FROZEN-ADDL', description: 'Pathology consultation during surgery, each additional tissue block with frozen section(s)' },
];

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

export interface StainOrderForCptSuggestion {
  stainName: string;
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
): { suggestions: string[]; endingIhcCount: number } {
  const suggestions: string[] = [];
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
      if (matchedType.category === 'IHC' && !matchedType.excludeFromIhcSequenceCounting) ihcCount += 1;
      continue;
    }

    const category = matchedType?.category ?? null;
    if (category === 'Special Stain') {
      suggestions.push('SPECIAL-STAIN');
    } else if (category === 'IHC') {
      ihcCount += 1;
      suggestions.push(ihcCount === 1 ? 'IHC-FIRST' : 'IHC-ADDL');
    }
    // 'Routine', 'Immunofluorescence', 'Molecular', 'Other', and null
    // (unresolvable) are all deliberately excluded - no real, verified
    // CPT rule for this app's scope covers them yet.
  }

  return { suggestions, endingIhcCount: ihcCount };
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
): { blockId: string; suggestions: string[] }[] {
  const results: { blockId: string; suggestions: string[] }[] = [];
  let runningIhcCount = 0;

  for (const block of blocks) {
    const { suggestions, endingIhcCount } = suggestAncillaryCodesForStains(block.stains, allStainTypes, runningIhcCount);
    results.push({ blockId: block.blockId, suggestions });
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
export function computeNewSuggestions(appliedCodes: string[], allSuggested: string[]): string[] {
  return allSuggested.filter((code, i) =>
    allSuggested.slice(0, i + 1).filter(c => c === code).length > appliedCodes.filter(c => c === code).length
  );
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
  appliedAncillaryCodes: string[];
  /** Real, rule-based suggestions from this block's actual current
   *  stains that have NOT yet been applied - see
   *  suggestBlockAncillaryCptCodes/computeNewSuggestions. Never treated
   *  as applied data; surfaced only as something to review. */
  unappliedSuggestions: string[];
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
  specimens: { id: string; label: string; coding?: { cpt?: string[] }; blocks?: { id: string; label: string; stains?: { stainName: string }[]; coding?: { cpt?: string[] } }[] }[],
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
      (sp.blocks ?? []).map(block => ({ blockId: block.id, stains: block.stains ?? [] })),
      allStainTypes
    );
    const blocks: SpecimenCodingSummaryBlock[] = (sp.blocks ?? []).map(block => {
      const appliedAncillaryCodes = block.coding?.cpt ?? [];
      const allSuggested = specimenSuggestions.find(r => r.blockId === block.id)?.suggestions ?? [];
      const unappliedSuggestions = computeNewSuggestions(appliedAncillaryCodes, allSuggested);
      return { blockId: block.id, blockLabel: block.label, appliedAncillaryCodes, unappliedSuggestions };
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
}

/** Real fix: resolves a specimen's real, dictionary-configured base CPT
 *  code, if a real coder has set one. Returns null (never a fabricated
 *  guess) when the specimen has no real dictionary link, the linked
 *  entry doesn't exist, or no code has been configured for it yet - a
 *  caller falls back to the honest, generic rule-based default
 *  (ruleBasedDefaultCptCodes) in that case, same as before this
 *  resolution existed. */
export function resolveSpecimenDictionaryBaseCptCode(
  specimen: { specimenDictionaryEntryId?: string },
  allDictionaryEntries: SpecimenEntryForCptResolution[]
): string | null {
  if (!specimen.specimenDictionaryEntryId) return null;
  const entry = allDictionaryEntries.find(e => e.id === specimen.specimenDictionaryEntryId);
  return entry?.defaultBaseCptCode || null;
}
