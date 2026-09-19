// src/utils/embeddingOperations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285 (Embedding Station) — the ticket's own "sibling,
// bench-focused workstation" to PS-284's Microtomy Workstation. Pure,
// testable functions, same real shape as microtomyOperations.ts's own
// extraction — the caller (useEmbeddingStation.ts) is responsible for
// persisting the returned Specimen via caseRouter.updateCase and for
// raising the real def-tissue-discrepancy deficiency (specimenDeficiencyService)
// on a genuine piece-count mismatch; these functions never touch case
// data or other services themselves.
//
// Real, deliberate scope note, matching PS-284's own precedent: this
// covers ordinary HistologyBlock embedding only. MatrixBlock-level
// embedding (a cassette shared by multiple specimens) is a genuinely
// separate real data shape (types/case/MatrixBlock.ts) and is NOT
// covered here — same documented scope cut PS-284 made for
// MatrixBlock-level scanning, kept consistent across the workstation
// series rather than solved once, ad hoc, in whichever ticket happens
// to touch it first.
//
// Real, deliberate reuse note: the piece-count-mismatch-on-embedding
// concept and its deficiency-raising side effect already exist today,
// wired into BlockStainEditorModal.tsx via
// useSpecimenBlockManagement.ts's own handleUpdateBlock (raises
// def-tissue-discrepancy through specimenDeficiencyService the moment
// pieceCountAtEmbedding is set and disagrees with pieceCount). This
// file's own confirmPieceCount does the identical real state
// transition (sets status: 'Embedded' + pieceCountAtEmbedding) so the
// caller can raise the exact same real deficiency the exact same real
// way — deliberately not a second, parallel QA mechanism.
// ─────────────────────────────────────────────────────────────────────────────

import type { HistologyBlock, Specimen, EmbeddingMoldSize, EmbeddingDiscrepancyReason, CassetteReprintReason } from '@/types/case/Specimen';
import type { MaterialComment } from '@/types/case/MaterialComment';

export type EmbeddingOperationResult =
  | { ok: true; specimen: Specimen }
  | { ok: false; error: string };

/** Real, per the spec's own "Discrepancy Reporting: one-touch buttons
 *  for Missing Tissue/Empty Cassette, Extra Tissue Found, Unopened
 *  Cassette/Unprocessed Tissue, Damaged Cassette/Broken Hinge." */
export const EMBEDDING_DISCREPANCY_REASONS: readonly EmbeddingDiscrepancyReason[] = [
  'Missing Tissue/Empty Cassette', 'Extra Tissue Found', 'Unopened Cassette/Unprocessed Tissue', 'Damaged Cassette/Broken Hinge',
];

/** Real, per the spec's own "Reason Log: mandatory reason prompt for
 *  any reprint (Wax Buildup, Faded Barcode, Mechanical Jam)." */
export const CASSETTE_REPRINT_REASONS: readonly CassetteReprintReason[] = ['Wax Buildup', 'Faded Barcode', 'Mechanical Jam', 'Other'];

/** Real, per the spec's own "Base Mold Size Picker: quick-select for
 *  standard sizes." */
export const EMBEDDING_MOLD_SIZES: readonly EmbeddingMoldSize[] = ['7x7mm', '15x15mm', '24x24mm', '24x30mm', 'Mega Mold'];

/** Real, per the spec's own "Orientation Instructions" examples —
 *  quick-fill suggestions for the free-text orientationInstructions
 *  field, never a closed set the field is restricted to (see that
 *  field's own doc comment on HistologyBlock). */
export const EMBEDDING_ORIENTATION_QUICK_FILLS: readonly string[] = ['Embed on edge', 'Epithelial surface down', 'Cross-section up'];

function findBlock(specimen: Specimen, blockId: string): HistologyBlock | undefined {
  return (specimen.blocks ?? []).find(b => b.id === blockId);
}

function replaceBlock(specimen: Specimen, blockId: string, changes: Partial<HistologyBlock>): Specimen {
  return {
    ...specimen,
    blocks: (specimen.blocks ?? []).map(b => b.id !== blockId ? b : { ...b, ...changes }),
  };
}

/** Real, per "Piece Count Verification: displays the expected count
 *  from grossing... requires single-touch confirmation or discrepancy
 *  flag before sealing the block." Sets the block to 'Embedded' with
 *  the real, observed count — mirrors handleUpdateBlock's own exact
 *  state transition (types/case/Specimen.ts's pieceCountAtEmbedding).
 *  The caller compares the returned block's pieceCount vs.
 *  pieceCountAtEmbedding to decide whether to raise the real
 *  def-tissue-discrepancy deficiency — this function only performs the
 *  real state change, never the cross-service side effect itself. */
export function confirmPieceCount(specimen: Specimen, blockId: string, observedCount: number): EmbeddingOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  if (observedCount < 0) return { ok: false, error: 'Observed count cannot be negative.' };
  return { ok: true, specimen: replaceBlock(specimen, blockId, { status: 'Embedded', pieceCountAtEmbedding: observedCount }) };
}

/** Real, per "Discrepancy Reporting: one-touch buttons... Audit
 *  Triggers: a flagged discrepancy halts the block workflow and routes
 *  an alert." Records the real sub-reason on the block itself (for the
 *  UI's own display) and leaves status untouched — deliberately does
 *  NOT set status: 'Embedded', since a flagged discrepancy is the
 *  opposite of "sealed and moving on": the block stays in its current
 *  status until a supervisor resolves it, halting the workflow exactly
 *  as the spec requires. The caller is responsible for raising the
 *  real def-tissue-discrepancy deficiency through
 *  specimenDeficiencyService — same reasoning as confirmPieceCount. */
export function flagEmbeddingDiscrepancy(
  specimen: Specimen, blockId: string, reason: EmbeddingDiscrepancyReason, actor: string,
): EmbeddingOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  return {
    ok: true,
    specimen: replaceBlock(specimen, blockId, {
      lastDiscrepancyReason: reason, lastDiscrepancyReportedBy: actor, lastDiscrepancyReportedAt: new Date().toISOString(),
    }),
  };
}

/** Real, per "Base Mold Size Picker" + "Orientation Instructions" —
 *  a single, combined setter since the Center Panel's own quick-select
 *  UI sets both together on the same block, same shape as
 *  updateDecantCytologyFields in microtomyOperations.ts. */
export function setMoldAndOrientation(
  specimen: Specimen, blockId: string, changes: { moldSize?: EmbeddingMoldSize; orientationInstructions?: string },
): EmbeddingOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  return { ok: true, specimen: replaceBlock(specimen, blockId, changes) };
}

/** Real, per "Multi-Cassette / Split-Block Tracking: visual indicators
 *  when a specimen was split across multiple cassettes (A1, A2, A3) to
 *  ensure all related cassettes are embedded together." Groups an
 *  existing set of blocks (already created individually — this
 *  function does not create new blocks) under one real
 *  splitBlockGroupId so the UI can render them together and warn if
 *  any sibling isn't embedded yet. Requires at least 2 real blocks —
 *  a "split" of one is not a split. */
export function groupSplitBlocks(specimen: Specimen, blockIds: string[]): EmbeddingOperationResult {
  if (blockIds.length < 2) return { ok: false, error: 'A split-block group needs at least 2 blocks.' };
  const blocks = specimen.blocks ?? [];
  const missing = blockIds.filter(id => !blocks.some(b => b.id === id));
  if (missing.length > 0) return { ok: false, error: `Block(s) not found: ${missing.join(', ')}.` };
  const groupId = `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    ok: true,
    specimen: {
      ...specimen,
      blocks: blocks.map(b => blockIds.includes(b.id) ? { ...b, splitBlockGroupId: groupId } : b),
    },
  };
}

/** Real, per "Multi-Cassette / Split-Block Tracking" — the Center
 *  Panel's own "all related cassettes embedded together" check. Pure
 *  read: returns every real sibling in the same splitBlockGroupId
 *  (including the block itself) and whether every one of them has
 *  reached 'Embedded'. Returns null when the block isn't part of a
 *  split group at all — the common case, not an error. */
export function resolveSplitBlockGroupStatus(
  specimen: Specimen, blockId: string,
): { siblings: HistologyBlock[]; allEmbedded: boolean } | null {
  const block = findBlock(specimen, blockId);
  if (!block?.splitBlockGroupId) return null;
  const siblings = (specimen.blocks ?? []).filter(b => b.splitBlockGroupId === block.splitBlockGroupId);
  return { siblings, allEmbedded: siblings.every(b => b.status === 'Embedded') };
}

/** Real, per "Reason Log: mandatory reason prompt for any reprint...
 *  for compliance auditing." Same real "required reason, cumulative
 *  count, never cleared" shape as microtomyOperations.ts's own
 *  reprintMicrotomyStain — the caller is responsible for the actual
 *  print dispatch (printCassetteLabel, utils/labels/); this function
 *  only records the real, audited reason and increments the count. */
export function recordCassetteReprint(
  specimen: Specimen, blockId: string, reason: CassetteReprintReason, actor: string,
): EmbeddingOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  return {
    ok: true,
    specimen: replaceBlock(specimen, blockId, {
      lastCassetteReprintReason: reason,
      lastCassetteReprintOrderedBy: actor,
      lastCassetteReprintOrderedAt: new Date().toISOString(),
      cassetteReprintCount: (block.cassetteReprintCount ?? 0) + 1,
    }),
  };
}

/** Real, per "Unified Comment Drawer: grossing notes + embedding-
 *  specific observations." Same real MaterialComment shape/append
 *  pattern as microtomyOperations.ts's own updateBlockComment. */
export function addEmbeddingBlockComment(
  specimen: Specimen, blockId: string, text: string, authorId: string, authorName: string, stationId?: string | null,
): EmbeddingOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  if (!text.trim()) return { ok: false, error: 'Comment text cannot be empty.' };
  const comment: MaterialComment = {
    id: `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    authorId, authorName, text: text.trim(), createdAt: new Date().toISOString(), stationId: stationId ?? null,
  };
  return { ok: true, specimen: replaceBlock(specimen, blockId, { comments: [...(block.comments ?? []), comment] }) };
}

/** Real, per "High-Contrast Visual Alerts: Tiny/Fragile, Decalcified,
 *  Biopsy, Needle Core." Tiny Tissue/Fragile/Decal Required already
 *  exist as real, stored, toggleable booleans (tinyTissue/fragile/
 *  requiresDecal — the first two added by PS-284, requiresDecal
 *  pre-existing) — reused here rather than duplicated. Biopsy/Needle
 *  Core are deliberately NOT new stored booleans: SpecimenEntry.type
 *  (services/specimenDictionary/) already carries this exact real
 *  classification for the specimen this block belongs to ("Biopsy" is
 *  a real, existing type value; needle-core procedures are named
 *  explicitly in `procedure`, e.g. "Prostate Needle Biopsy", "Core
 *  Needle Biopsy") — storing a second, independent flag here would be
 *  a real, driftable copy of a fact the dictionary entry already
 *  states, violating this app's own "derive fresh every time" rule.
 *  The caller resolves the specimen's own dictionaryEntryId once (it
 *  already has it, for other reasons) and passes the resolved type/
 *  procedure in — this function stays pure and synchronous. */
export function resolveEmbeddingAlertBadges(
  block: HistologyBlock, specimenType?: string, specimenProcedure?: string,
): Array<'Tiny Tissue' | 'Fragile' | 'Decal Required' | 'Biopsy' | 'Needle Core'> {
  const badges: Array<'Tiny Tissue' | 'Fragile' | 'Decal Required' | 'Biopsy' | 'Needle Core'> = [];
  if (block.tinyTissue) badges.push('Tiny Tissue');
  if (block.fragile) badges.push('Fragile');
  if (block.requiresDecal) badges.push('Decal Required');
  if (specimenType === 'Biopsy') badges.push('Biopsy');
  const proc = specimenProcedure?.toLowerCase() ?? '';
  if (proc.includes('needle core') || proc.includes('core needle') || proc.includes('needle biopsy')) badges.push('Needle Core');
  return badges;
}
