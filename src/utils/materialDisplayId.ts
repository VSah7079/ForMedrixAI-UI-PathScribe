// src/utils/materialDisplayId.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on unique material identification:
// "every asset of the material (specimen, block slide, decant, fluid
// etc. should be uniquely identified... the ID should at least be
// understandable to a human." Confirmed directly before building this:
// Specimen.displayId was already real and stored, but Block/Slide's
// own identifiers (cassetteIdentifier()/slideIdentifier() from
// types/labels/LabelData.ts) were only ever computed on demand for
// printing, never actually stored on the record — a real,
// confirmed inconsistency, now fixed (see HistologyBlock.displayId/
// StainOrder.displayId's own doc comments).
//
// This file is the read side: a real, honest fallback for the
// records that predate the field existing at all — same real
// "optional, falls back to id/label" posture Specimen.displayId's
// own doc comment already established, applied consistently to
// every material type now, not just Specimen.
// ─────────────────────────────────────────────────────────────────────────────

import { cassetteIdentifier, slideIdentifier, decantIdentifier, decantSlideIdentifier, aliquotIdentifier, decantAliquotIdentifier } from '@/types/labels/LabelData';
import type { HistologyBlock, StainOrder, Specimen } from '@/types/case/Specimen';
import type { Decant, Aliquot } from '@/types/case/Material';

/** Real, stored displayId if present; otherwise the same real,
 *  deterministic string computed on the fly — per direct follow-up:
 *  "Specimen's own read-side fallback doesn't appear to have gotten
 *  the same treatment as Block/Slide/Decant." Confirmed directly:
 *  Specimen.displayId (set in AccessionPage.tsx's own handleSubmit)
 *  was the FIRST real displayId field this app ever had, and every
 *  later material type modeled its own field on it — but the read
 *  side never got a matching resolve function the way the three
 *  later types did, an inconsistency now fixed to match. Specimen's
 *  own displayId is derived from Case.accession.fullAccession
 *  directly (see its own doc comment, types/case/Specimen.ts) — no
 *  separate cassette/slide-style identifier() helper exists for it,
 *  since a specimen's own id has always just been the accession plus
 *  its label, not a distinct naming scheme worth its own function. */
export function resolveSpecimenDisplayId(fullAccession: string, specimen: Pick<Specimen, 'label' | 'displayId'>): string {
  return specimen.displayId ?? `${fullAccession}-${specimen.label}`;
}

/** Real, stored displayId if present; otherwise the same real,
 *  deterministic string computed on the fly — a genuinely older block
 *  created before this field existed reads identically to a newer one
 *  that has it stored, rather than falling back to the internal id. */
export function resolveBlockDisplayId(fullAccession: string, specimenLabel: string, block: Pick<HistologyBlock, 'label' | 'displayId'>): string {
  return block.displayId ?? cassetteIdentifier(fullAccession, specimenLabel, block.label);
}

/** Same real fallback for a slide — `level` is the real "L1"/"L2"...
 *  positional label already used throughout this app (see
 *  ManageReprintsModal.tsx's own slideKey()), not stored on
 *  StainOrder itself. */
export function resolveSlideDisplayId(fullAccession: string, specimenLabel: string, blockLabel: string, level: string, stain: Pick<StainOrder, 'displayId'>): string {
  return stain.displayId ?? slideIdentifier(fullAccession, specimenLabel, blockLabel, level);
}

/** Same real fallback for a decant. Honest note: since nothing in
 *  this app creates a Decant yet (confirmed directly), every real
 *  call to this today falls through to the computed branch — kept
 *  correct and consistent for the moment a real creation flow exists,
 *  not dead code written for its own sake. */
export function resolveDecantDisplayId(fullAccession: string, specimenLabel: string, decant: Pick<Decant, 'label' | 'displayId'>): string {
  return decant.displayId ?? decantIdentifier(fullAccession, specimenLabel, decant.label);
}

/** Same real fallback for a decant's own slide — found genuinely
 *  missing (no identifier function existed for this at all) while
 *  wiring the real UI, per direct follow-up: "resolveBlockDisplayId()
 *  etc. are defined but never called anywhere in the real UI." Same
 *  real shape as resolveSlideDisplayId immediately above. */
export function resolveDecantSlideDisplayId(fullAccession: string, specimenLabel: string, decantLabel: string, level: string, stain: Pick<StainOrder, 'displayId'>): string {
  return stain.displayId ?? decantSlideIdentifier(fullAccession, specimenLabel, decantLabel, level);
}

/** Same real fallback for an aliquot — built on its parent slide's own
 *  real identifier (aliquotIdentifier() in types/labels/LabelData.ts),
 *  never reconstructed independently. See that function's own doc
 *  comment for why. */
export function resolveAliquotDisplayId(fullAccession: string, specimenLabel: string, blockLabel: string, level: string, aliquot: Pick<Aliquot, 'label' | 'displayId'>): string {
  return aliquot.displayId ?? aliquotIdentifier(fullAccession, specimenLabel, blockLabel, level, aliquot.label);
}

/** Same real fallback for an aliquot taken from a decant's own slide. */
export function resolveDecantAliquotDisplayId(fullAccession: string, specimenLabel: string, decantLabel: string, level: string, aliquot: Pick<Aliquot, 'label' | 'displayId'>): string {
  return aliquot.displayId ?? decantAliquotIdentifier(fullAccession, specimenLabel, decantLabel, level, aliquot.label);
}
