// src/utils/resolveMaterialFromScan.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared extraction — this exact resolution logic previously lived
// only inside useGlobalMaterialScanTracking.ts (resolveCaseFromScan +
// matchRemainderToTarget). Pulled out here, unchanged, so the new Batch
// Management module (services/batches/mockBatchService.ts) can resolve a
// scanned cassette/slide barcode the exact same real way — reusing it,
// not re-deriving an independently-maintained second copy that could
// silently drift apart from the original the moment either changes.
// useGlobalMaterialScanTracking.ts itself now calls this too.
//
// Real, architectural fix, per direct follow-up: "Phase 4... scan
// resolution... still don't know about matrix blocks." A real matrix
// block (types/case/MatrixBlock.ts) doesn't belong to one specimen —
// its own barcode (matrixBlockIdentifier) has no specimen letter
// component at all, so specimenLetter is now genuinely optional here,
// not just permissive.
//
// Real feature, per direct follow-up: "Would this approach work?
// {BlockBarcode}-S{Index}." Confirmed, with the level marker aligned
// to slideIdentifier's own established "L1"/"L2" convention — an
// individual slide cut from a shared cassette now resolves too
// (matrix_slide), not just the cassette itself.
//
// Real, architectural fix, per direct follow-up: "Specimen/Decant-level
// foreign ID... the actual cytology fluid case." Adds 'specimen',
// 'decant', and 'decant_slide' — the real, remaining levels this file's
// own foreign-id fallback (resolveForeignId) previously couldn't reach.
// Real, honest scope boundary, confirmed directly against
// types/case/Material.ts's own Decant doc comment: nothing in this app
// actually creates a Decant anywhere yet (no real UI flow exists) — the
// decant/decant_slide resolution logic below is real and correct, kept
// ready for the moment a real decant-creation flow exists, the same
// posture decantIdentifier()/decantSlideIdentifier() themselves already
// took in types/labels/LabelData.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { cassetteIdentifier, slideIdentifier, matrixBlockIdentifier, matrixSlideIdentifier, specimenIdentifier, decantIdentifier, decantSlideIdentifier } from '@/types/labels/LabelData';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { Case } from '@/types/case/Case';

export type ResolvedScanTarget =
  | { level: 'block'; blockNumber: string }
  | { level: 'slide'; blockNumber: string; slideLevel: string }
  | { level: 'matrix_block'; matrixBlockId: string }
  /** Real feature, per direct follow-up: "Would this approach work?
   *  {BlockBarcode}-S{Index}" — confirmed, with one real correction:
   *  the level marker matches slideIdentifier's own established "L1"/
   *  "L2" convention (see matrixSlideIdentifier's own doc comment),
   *  not a second, differently-lettered scheme. An individual, real,
   *  physical slide cut from a shared cassette — genuinely separate
   *  from the matrix block itself, since several of a matrix block's
   *  own slides can be at different real, physical locations at once
   *  (one already coverslipped, another still in the stainer). */
  | { level: 'matrix_slide'; matrixBlockId: string; slideLevel: string }
  /** Real feature, per direct follow-up: "Specimen/Decant-level
   *  foreign ID... the actual cytology fluid case." A scan of the
   *  specimen container's own barcode directly — no blockNumber
   *  component at all, since this targets the specimen itself, not
   *  anything grossed from it. specimenLetter (on
   *  ResolvedMaterialScan below) already carries which specimen. */
  | { level: 'specimen' }
  /** A real decant belongs to one specimen — decantLabel (e.g. "D1")
   *  is scoped to, and thus unique within, that specimen, the exact
   *  same real reason an ordinary block uses blockNumber (a label,
   *  not an id) rather than its own internal id. Matches the already-
   *  established shape MaterialLocationEventPayload/MaterialScanEventPayload
   *  both already use for this same level — resolved here, not
   *  invented separately, so every downstream consumer (already
   *  built) works unchanged. */
  | { level: 'decant'; decantLabel: string }
  | { level: 'decant_slide'; decantLabel: string; slideLevel: string };

export interface ResolvedMaterialScan {
  caseData: Case;
  fullAccession: string;
  /** Undefined when target.level === 'matrix_block' — a real matrix
   *  block doesn't belong to one specimen, so there's no one, real
   *  specimen letter to report. Every 'block'/'slide'/'specimen'/
   *  'decant'/'decant_slide' target still always has one. */
  specimenLetter?: string;
  target: ResolvedScanTarget;
  /** The real cassette/slide displayId this scan resolved to — e.g.
   *  "S26-4403-A1" or "S26-4403-A1-L1" — computed once here so callers
   *  never have to re-derive it from `target` themselves. */
  displayId: string;
}

/** Splits the scanned value on '-' and tries progressively longer
 *  prefixes as a candidate accession (shortest first) — real, direct
 *  case lookups, not a guessed regex against this app's own accession
 *  format, which genuinely varies (S26-, O26-, etc.). Stops at the
 *  first prefix that resolves to a real case; a raw value with no
 *  resolving prefix at all (an unrelated barcode) correctly finds
 *  nothing. */
async function resolveCaseFromScan(raw: string): Promise<{ caseData: Case; remainder: string } | null> {
  const parts = raw.split('-');
  for (let prefixLen = 1; prefixLen < parts.length; prefixLen++) {
    const candidateAccession = parts.slice(0, prefixLen).join('-');
    const remainder = parts.slice(prefixLen).join('-');
    if (!remainder) continue;
    const caseData = await caseRouter.getCase(candidateAccession);
    if (caseData) return { caseData, remainder };
  }
  return null;
}

function matchRemainderToTarget(caseData: Case, fullAccession: string, remainder: string): { specimenLetter?: string; target: ResolvedScanTarget } | null {
  // Real, architectural fix, per direct follow-up — checked first,
  // since a real matrix block's own barcode has no specimen prefix to
  // narrow the search by; it's a real, case-level identifier.
  for (const matrixBlock of caseData.matrixBlocks ?? []) {
    const matrixRemainder = matrixBlockIdentifier(fullAccession, matrixBlock.label).slice(fullAccession.length + 1);
    if (matrixRemainder === remainder) {
      return { target: { level: 'matrix_block', matrixBlockId: matrixBlock.id } };
    }
    // Real feature, per direct follow-up — see ResolvedScanTarget's
    // own 'matrix_slide' doc comment. Same real, array-index-derived
    // level convention as an ordinary block's own inner loop below —
    // one, shared scheme, not a second one invented for the matrix
    // case.
    for (let i = 0; i < (matrixBlock.slides ?? []).length; i++) {
      const level = `L${i + 1}`;
      const matrixSlideRemainder = matrixSlideIdentifier(fullAccession, matrixBlock.label, level).slice(fullAccession.length + 1);
      if (matrixSlideRemainder === remainder) {
        return { target: { level: 'matrix_slide', matrixBlockId: matrixBlock.id, slideLevel: level } };
      }
    }
  }
  for (const specimen of caseData.specimens ?? []) {
    // Real feature, per direct follow-up: "Specimen/Decant-level
    // foreign ID." Checked before blocks/decants — a bare specimen
    // scan (no block/decant suffix at all) is the shortest possible
    // real remainder for this specimen, so nothing else could
    // accidentally shadow it.
    const specimenRemainder = specimenIdentifier(fullAccession, specimen.label).slice(fullAccession.length + 1);
    if (specimenRemainder === remainder) {
      return { specimenLetter: specimen.label, target: { level: 'specimen' } };
    }
    for (const block of specimen.blocks ?? []) {
      const cassetteRemainder = cassetteIdentifier(fullAccession, specimen.label, block.label).slice(fullAccession.length + 1);
      if (cassetteRemainder === remainder) {
        return { specimenLetter: specimen.label, target: { level: 'block', blockNumber: block.label } };
      }
      for (let i = 0; i < (block.stains ?? []).length; i++) {
        const level = `L${i + 1}`;
        const slideRemainder = slideIdentifier(fullAccession, specimen.label, block.label, level).slice(fullAccession.length + 1);
        if (slideRemainder === remainder) {
          return { specimenLetter: specimen.label, target: { level: 'slide', blockNumber: block.label, slideLevel: level } };
        }
      }
    }
    // Real, honest scope note — see this file's own header on why
    // decant resolution is real and correct even though no real UI
    // creates a Decant yet: (types/case/Material.ts).
    for (const decant of (specimen as any).decants ?? []) {
      const decantRemainder = decantIdentifier(fullAccession, specimen.label, decant.label).slice(fullAccession.length + 1);
      if (decantRemainder === remainder) {
        return { specimenLetter: specimen.label, target: { level: 'decant', decantLabel: decant.label } };
      }
      for (let i = 0; i < (decant.stains ?? []).length; i++) {
        const level = `L${i + 1}`;
        const decantSlideRemainder = decantSlideIdentifier(fullAccession, specimen.label, decant.label, level).slice(fullAccession.length + 1);
        if (decantSlideRemainder === remainder) {
          return { specimenLetter: specimen.label, target: { level: 'decant_slide', decantLabel: decant.label, slideLevel: level } };
        }
      }
    }
  }
  return null;
}

/** Real, single resolution point — a resolved target's own real
 *  displayId, computed once here so every caller (native match AND
 *  foreign-id fallback below) agrees on the exact same string. */
function computeDisplayId(caseData: Case, fullAccession: string, specimenLetter: string | undefined, target: ResolvedScanTarget): string {
  if (target.level === 'matrix_block') {
    const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === target.matrixBlockId);
    return matrixBlockIdentifier(fullAccession, matrixBlock?.label ?? target.matrixBlockId);
  }
  if (target.level === 'matrix_slide') {
    const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === target.matrixBlockId);
    return matrixSlideIdentifier(fullAccession, matrixBlock?.label ?? target.matrixBlockId, target.slideLevel);
  }
  if (target.level === 'specimen') {
    return specimenIdentifier(fullAccession, specimenLetter!);
  }
  if (target.level === 'block') {
    return cassetteIdentifier(fullAccession, specimenLetter!, target.blockNumber);
  }
  if (target.level === 'slide') {
    return slideIdentifier(fullAccession, specimenLetter!, target.blockNumber, target.slideLevel);
  }
  if (target.level === 'decant') {
    return decantIdentifier(fullAccession, specimenLetter!, target.decantLabel);
  }
  return decantSlideIdentifier(fullAccession, specimenLetter!, target.decantLabel, target.slideLevel);
}

/** Real, shared resolution — a scanned cassette/slide barcode value in,
 *  a fully-resolved case/specimen/block-or-slide target out, or null if
 *  the scan doesn't genuinely resolve to real material anywhere (an
 *  unrelated barcode, a typo, a different app's label entirely). */
export async function resolveMaterialFromScan(rawScanValue: string): Promise<ResolvedMaterialScan | null> {
  const resolved = await resolveCaseFromScan(rawScanValue);
  if (resolved) {
    const { caseData, remainder } = resolved;
    const fullAccession = caseData.accession?.fullAccession ?? caseData.id;
    const matched = matchRemainderToTarget(caseData, fullAccession, remainder);
    if (matched) {
      const displayId = computeDisplayId(caseData, fullAccession, matched.specimenLetter, matched.target);
      return { caseData, fullAccession, specimenLetter: matched.specimenLetter, target: matched.target, displayId };
    }
  }

  // Real feature, per direct follow-up: "the lab will receive outside
  // blocks or cytology fluids with existing ids that we need to map
  // to the pathscribe unique id... safer not to have to relabel
  // specimen containers." A scan that doesn't match PathScribe's own,
  // native identifier scheme might still be a real, foreign id
  // already linked to a received specimen, block, matrix block, or
  // decant (see utils/foreignIdCollision.ts's own header for the
  // full, researched reasoning on why this is a real, deliberate
  // fallback, not a first resort).
  return resolveForeignId(rawScanValue.trim());
}

/** Real feature, per direct follow-up: "If the lab receives a block
 *  and it has an engraved id, we treat that as a foreign id." Checks
 *  every real record kind that carries externalId — an ordinary
 *  block, a matrix block, and now (per the "Specimen/Decant-level"
 *  follow-up) a specimen and a decant too — the real "cytology fluid"
 *  case this whole feature was originally asked about receives the
 *  identical treatment as a received block. */
async function resolveForeignId(rawScanValue: string): Promise<ResolvedMaterialScan | null> {
  if (!rawScanValue) return null;
  const res = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true });
  if (!res.ok) return null;

  const matches: ResolvedMaterialScan[] = [];
  for (const caseData of res.data) {
    const fullAccession = caseData.accession?.fullAccession ?? caseData.id;
    for (const specimen of caseData.specimens ?? []) {
      if (specimen.externalId === rawScanValue) {
        matches.push({
          caseData, fullAccession, specimenLetter: specimen.label,
          target: { level: 'specimen' },
          displayId: specimenIdentifier(fullAccession, specimen.label),
        });
      }
      for (const block of specimen.blocks ?? []) {
        if (block.externalId === rawScanValue) {
          matches.push({
            caseData, fullAccession, specimenLetter: specimen.label,
            target: { level: 'block', blockNumber: block.label },
            displayId: cassetteIdentifier(fullAccession, specimen.label, block.label),
          });
        }
      }
      for (const decant of (specimen as any).decants ?? []) {
        if (decant.externalId === rawScanValue) {
          matches.push({
            caseData, fullAccession, specimenLetter: specimen.label,
            target: { level: 'decant', decantLabel: decant.label },
            displayId: decantIdentifier(fullAccession, specimen.label, decant.label),
          });
        }
      }
    }
    for (const matrixBlock of caseData.matrixBlocks ?? []) {
      if (matrixBlock.externalId === rawScanValue) {
        matches.push({
          caseData, fullAccession,
          target: { level: 'matrix_block', matrixBlockId: matrixBlock.id },
          displayId: matrixBlockIdentifier(fullAccession, matrixBlock.label),
        });
      }
    }
  }
  // Real, deliberate safety posture: 0 matches genuinely doesn't
  // resolve; 2+ matches means this raw string was independently
  // issued by more than one real source and can't be safely
  // disambiguated from a bare scan alone — refusing beats guessing
  // wrong on which real, physical specimen this scan actually means.
  return matches.length === 1 ? matches[0] : null;
}
