// src/types/case/MatrixBlock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, architectural fix, per direct follow-up: "the matrix block
// itself is the tracked asset... pulling shared blocks out of
// individual Specimen.blocks arrays into a top-level Case.matrixBlocks[]
// converts the matrix block into a first-class, single-identity asset
// across the entire LIS pipeline rather than maintaining fragmented,
// competing state records on each child specimen."
//
// Confirmed directly, not assumed: the prior design (each participating
// specimen owning its own, separate HistologyBlock record, linked only
// by a shared sharedCassetteId string tag) required real, active
// propagation logic (built earlier this session specifically to
// confirm-and-copy a status/location change across every tagged
// sibling) just to keep N copies of the same real, physical fact from
// drifting apart. This is the real fix underneath that patch: a real
// cassette shared by multiple specimens is genuinely ONE physical
// object with ONE real status, ONE real location history, ONE real
// disposal lifecycle — modeling it as one record makes drift
// structurally impossible instead of something to detect and confirm
// around after the fact.
//
// Real, case-level home (Case.matrixBlocks[]) — NOT nested under any
// one specimen, since a matrix block, by definition, doesn't belong to
// just one. Each participating Specimen holds a lightweight reference
// (Specimen.matrixBlockIds) for relational lookup, never its own,
// competing copy of the block's own real state.
// ─────────────────────────────────────────────────────────────────────────────

import type { BlockStatus, StainOrder } from './Specimen';
import type { MaterialLocation } from './Material';

export interface MatrixBlockParticipant {
  specimenId: string;
  /** This specimen's real, physical position within the shared
   *  cassette (1, 2, 3…) — what lets a pathologist look at a specific
   *  location on the shared slide and know whose tissue is there.
   *  Same real meaning as the prior HistologyBlock.positionInBlock. */
  positionInBlock: number;
  /** Real, optional context per direct spec — e.g. "control tissue",
   *  "core biopsy fragment" — free text, since real tissue-type
   *  vocabulary genuinely varies too much for a closed enum, same
   *  honest reasoning as every other free-text clinical field in this
   *  app (MaterialLocation.location, ScanStation.workflowStage). */
  tissueType?: string;
}

/**
 * Real, single tracked asset for a real, physical cassette shared by
 * more than one specimen. A specimen with NO shared tissue never gets
 * one of these — it keeps using its own, ordinary HistologyBlock
 * (types/case/Specimen.ts), exactly as it always has. This type exists
 * only for the genuine multi-specimen case.
 */
export interface MatrixBlock {
  id: string;
  /** e.g. "M1" — sequential, case-scoped, deliberately NOT tied to any
   *  one specimen's own letter, since this block doesn't belong to
   *  just one. See utils/matrixBlockIdentifier.ts for the real, human-
   *  facing identifier built from this. */
  label: string;
  status: BlockStatus;
  /** Real, explicit mapping — per direct spec: "clearly maps internal
   *  spatial configuration without splitting chain-of-custody
   *  tracking." Minimum 2 real participants — a matrix block with
   *  fewer isn't a real matrix block at all (see
   *  utils/matrixBlocks.ts's own creation/dissolve logic). */
  participants: MatrixBlockParticipant[];
  /** Real, architectural resolution, per direct follow-up: "Put the
   *  physical Slide entity (and its staining/processing lifecycle) on
   *  Case.matrixBlocks[], but keep the Pathologist's Diagnostic
   *  Findings/Interpretations on Specimen... The physical slide is
   *  sliced directly from the shared paraffin block. Therefore,
   *  staining... is an operation performed on the physical glass
   *  asset, not on an individual specimen in isolation."
   *
   *  Reuses StainOrder (types/case/Specimen.ts) directly rather than
   *  a new, parallel "Slide" type — it already carries exactly what a
   *  real slide record needs (stainName, status — which already
   *  covers "Coverslipped" — locationHistory, displayId,
   *  currentBatchId) and this app's own existing HistologyBlock.stains
   *  already establishes the identical "slides live nested under
   *  their one, real, owning block" shape; this is that same real
   *  pattern, just owned by a MatrixBlock instead of an ordinary one.
   *
   *  Real, deliberate split confirmed directly: the DIAGNOSTIC
   *  interpretation of what's on a shared slide is NOT stored here —
   *  it stays real, per-specimen, exactly where it already lives
   *  (Case.synopticReports[], keyed by specimenId — this app's own,
   *  already-existing, already-built mechanism for "a case can have
   *  many of these, multiple specimens × multiple templates"). A
   *  pathologist reading Specimen A's (tumor) and Specimen B's
   *  (margin) own, separate synoptic entries for their own shared
   *  slide is already fully supported by that existing structure —
   *  nothing new needed there. This field is physical/operational
   *  only: what stain, what status, where it physically is, which
   *  real batch it's in. */
  slides: StainOrder[];
  /** Real feature, per direct follow-up: "Location & Material
   *  Tracking: Moving a block updates a single locationHistory entry,
   *  updating all mapped participant specimens implicitly." Same real
   *  MaterialLocation shape every other trackable object in this app
   *  already uses (types/case/Material.ts) — one, real, append-only
   *  history, not a single overwritten cache. */
  locationHistory?: MaterialLocation[];
  /** Real feature, per direct follow-up: "Batch Management: Scanning a
   *  cassette adds the matrixBlockId to the batch manifest once,
   *  correctly computing real physical unit counts for processor
   *  runs." Which real Batch (services/batches/) this matrix block is
   *  currently checked into, if any — undefined otherwise. */
  currentBatchId?: string;
  /** Real, single disposal lifecycle — same real, permanent,
   *  never-cleared shape as HistologyBlock.disposedAt/disposedBy (see
   *  that field's own doc comment for the full reasoning); a matrix
   *  block is disposed once, as the one real physical object it is,
   *  not once per participant. */
  disposedAt?: string;
  disposedBy?: string;
  /** Real feature, per direct follow-up: "pieces... individual
   *  physical fragments... placed into a cassette... This count is
   *  recorded explicitly in the gross description and mapped to the
   *  cassette/matrix block record." Same real fields as
   *  HistologyBlock's own piece-tracking (types/case/Specimen.ts) —
   *  intentionally identical shape so QA/embedding/microtomy tooling
   *  can treat an ordinary block and a matrix block the same way
   *  wherever the distinction genuinely doesn't matter. Real, total
   *  count across every real participant's own tissue in this one
   *  physical cassette — not a per-participant breakdown; pieceDescription
   *  is where a real, human-readable breakdown belongs when needed. */
  pieceCount?: number;
  pieceDescription?: string;
  /** Real, identical meaning to HistologyBlock.pieceCountAtEmbedding
   *  (types/case/Specimen.ts) — see that field's own doc comment for
   *  the full reasoning. */
  pieceCountAtEmbedding?: number;
  /** Real, honest tracking of whether every real, grossed piece
   *  actually made it into this physical cassette, or whether some
   *  remain in wet storage — see pieceCount's own doc comment for the
   *  full reasoning; same real field on HistologyBlock. */
  isEntirelySubmitted?: boolean;
  /** Real feature, per direct follow-up: "If the lab receives a block
   *  and it has an engraved id, we treat that as a foreign id." Same
   *  real "both, linked" shape and reasoning as
   *  HistologyBlock.externalId/externalIdSource (types/case/Specimen.ts)
   *  — a real, physical cassette that arrives already engraved (a
   *  referring institution's own shared/multi-specimen block, or a
   *  consult case) never gets re-engraved with a PathScribe-native id;
   *  its own real, existing engraved identifier is captured here and
   *  linked, exactly the same way an ordinary received block already
   *  works. See utils/foreignIdCollision.ts for the real, shared
   *  cross-case collision check every foreign id link goes through
   *  before being accepted. */
  externalId?: string;
  /** Free text naming whatever real system engraved externalId — same
   *  vendor-agnostic shape as every other externalIdSource field in
   *  this app. */
  externalIdSource?: string;
  createdAt: string;
  createdBy: string;
}
