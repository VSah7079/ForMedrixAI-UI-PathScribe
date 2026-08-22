// src/utils/foreignIdCollision.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "the lab will receive outside
// blocks or cytology fluids with existing ids that we need to map to
// the pathscribe unique id... It's safer not to have to relabel
// specimen containers if possible."
//
// Real, researched design: HL7 v2's CX data type and HL7 FHIR's own
// Identifier type both require every identifier to travel as a real
// PAIR — the raw value plus an "assigning authority" (HL7 v2's own
// Hierarchic Designator; FHIR's own `system`) naming which real
// institution issued it. FHIR's own spec states it directly:
// "coded values are always treated as a pair composed of system and
// value." Two different referring labs legitimately reusing the same
// simple numbering scheme (both calling a block "A1") is NOT a real
// collision — the real collision key is the (source, id) PAIR, never
// the bare id string alone. This app's own, already-existing
// externalId/externalIdSource fields (Specimen, HistologyBlock,
// Decant — types/case/Specimen.ts, types/case/Material.ts) already
// model exactly this pair; nothing new was needed there.
//
// Same real, established cross-case query pattern as AccessionPage.tsx's
// own accession-uniqueness check — bypassAccessControl: true because
// this is a system-level lookup, not data being displayed to the
// user (see CaseRouter.getAll()'s own doc comment on that flag).
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';

export interface ForeignIdCollision {
  caseId: string;
  caseAccession: string;
  recordType: 'specimen' | 'block' | 'decant' | 'matrix_block';
  /** e.g. "Specimen A" or "Block A1" or "Decant AD1" or "Matrix Block
   *  C7" — human-readable, ready to show directly in a real warning
   *  message. */
  recordLabel: string;
}

/**
 * Real, single search — a genuine (externalIdSource, externalId)
 * PAIR already linked to a DIFFERENT real record, across every real
 * case, not just the one currently open. `excludeRecordId` — pass the
 * record being linked right now, so re-confirming its own, existing
 * link is never reported as a collision against itself.
 *
 * Returns null when either input is empty — an unset foreign id has
 * nothing real to collide with, and searching every case for an
 * empty-string match would be both meaningless and needlessly
 * expensive.
 */
export async function findForeignIdCollision(
  externalIdSource: string,
  externalId: string,
  excludeRecordId?: string,
): Promise<ForeignIdCollision | null> {
  if (!externalIdSource.trim() || !externalId.trim()) return null;

  const res = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true });
  if (!res.ok) return null;

  const matches = (recordExternalId?: string, recordExternalIdSource?: string) =>
    recordExternalId === externalId && recordExternalIdSource === externalIdSource;

  for (const c of res.data) {
    const caseAccession = c.accession?.fullAccession ?? c.id;
    for (const sp of c.specimens ?? []) {
      if (sp.id !== excludeRecordId && matches(sp.externalId, sp.externalIdSource)) {
        return { caseId: c.id, caseAccession, recordType: 'specimen', recordLabel: `Specimen ${sp.label}` };
      }
      for (const block of sp.blocks ?? []) {
        if (block.id !== excludeRecordId && matches(block.externalId, block.externalIdSource)) {
          return { caseId: c.id, caseAccession, recordType: 'block', recordLabel: `Block ${sp.label}${block.label}` };
        }
      }
      for (const decant of sp.decants ?? []) {
        if (decant.id !== excludeRecordId && matches(decant.externalId, decant.externalIdSource)) {
          return { caseId: c.id, caseAccession, recordType: 'decant', recordLabel: `Decant ${sp.label}${decant.label}` };
        }
      }
    }
    // Real feature, per direct follow-up: "If the lab receives a
    // block and it has an engraved id, we treat that as a foreign
    // id." A real matrix block (types/case/MatrixBlock.ts) is a
    // real, case-level record, not nested under a specimen — checked
    // here alongside the case's own specimens, same real collision
    // key.
    for (const matrixBlock of c.matrixBlocks ?? []) {
      if (matrixBlock.id !== excludeRecordId && matches(matrixBlock.externalId, matrixBlock.externalIdSource)) {
        return { caseId: c.id, caseAccession, recordType: 'matrix_block', recordLabel: `Matrix Block ${matrixBlock.label}` };
      }
    }
  }
  return null;
}

/** Real, minimal shape — deliberately not AccessionPage.tsx's own
 *  SpecimenDraft type, so this general utility never depends on one
 *  specific page's own draft shape. Any real list of not-yet-
 *  submitted records with a label + foreign-id pair can use this. */
export interface WithinDraftForeignIdCandidate {
  label: string;
  externalId: string;
  externalIdSource: string;
}

export interface WithinDraftForeignIdCollision {
  withinDraft: true;
  otherLabel: string;
}

/**
 * Real fix, per direct reminder: "no business logic in the UI code."
 * Extracted out of AccessionPage.tsx, where this collision check was
 * previously implemented inline. Real, additional check
 * findForeignIdCollision (above) can't cover on its own: a new case
 * doesn't exist yet at accessioning time, so a genuine duplicate
 * ENTERED TWICE within the very same, not-yet-submitted draft (two
 * specimens on one new accession both accidentally given the same
 * foreign id) would never be caught by a cross-case search alone.
 * Pure and synchronous — no network call needed, unlike
 * findForeignIdCollision above.
 */
export function findWithinDraftForeignIdCollision(
  candidates: WithinDraftForeignIdCandidate[],
  idx: number,
): WithinDraftForeignIdCollision | null {
  const s = candidates[idx];
  if (!s) return null;
  const match = candidates.find((other, i) =>
    i !== idx && other.externalId.trim() === s.externalId.trim() && other.externalIdSource.trim() === s.externalIdSource.trim()
  );
  return match ? { withinDraft: true, otherLabel: match.label } : null;
}
