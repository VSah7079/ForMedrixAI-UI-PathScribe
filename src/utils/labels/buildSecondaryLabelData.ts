// src/utils/labels/buildSecondaryLabelData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Fallback Physical Relabeling
// (Secondary Labeling)... place an adhesive slide/cassette secondary
// label over the non-tissue side... rather than attempting laser
// re-engraving." Pure functions, same discipline as
// buildContainerLabelData.ts — real record in, a real SecondaryLabelData
// view model out, built fresh at print time, never a separate stored
// record. Two small, dedicated builders (not one, overly generic
// function) since an ordinary HistologyBlock and a case-level
// MatrixBlock compute their own real displayId two different ways —
// same real split buildLabelHtml.ts's own render functions already
// use per record kind.
// ─────────────────────────────────────────────────────────────────────────────

import type { HistologyBlock } from '@/types/case/Specimen';
import type { MatrixBlock } from '@/types/case/MatrixBlock';
import type { Decant } from '@/types/case/Material';
import type { SecondaryLabelData } from '@/types/labels/LabelData';
import { cassetteIdentifier, matrixBlockIdentifier, decantIdentifier } from '@/types/labels/LabelData';

export function buildSecondaryLabelDataForBlock(
  fullAccession: string,
  specimenLabel: string,
  block: Pick<HistologyBlock, 'label' | 'externalId' | 'externalIdSource'>,
  now: () => string = () => new Date().toISOString(),
): SecondaryLabelData | null {
  // Real, honest guard — this label only makes sense once a real
  // foreign id is actually on file to explain why it exists; never
  // rendered for an ordinary block that was always PathScribe-
  // engraved in the first place.
  if (!block.externalId || !block.externalIdSource) return null;
  return {
    displayId: cassetteIdentifier(fullAccession, specimenLabel, block.label),
    recordLabel: `${specimenLabel}${block.label}`,
    foreignId: block.externalId,
    foreignIdSource: block.externalIdSource,
    printedAt: now(),
  };
}

export function buildSecondaryLabelDataForMatrixBlock(
  fullAccession: string,
  matrixBlock: Pick<MatrixBlock, 'label' | 'externalId' | 'externalIdSource'>,
  now: () => string = () => new Date().toISOString(),
): SecondaryLabelData | null {
  if (!matrixBlock.externalId || !matrixBlock.externalIdSource) return null;
  return {
    displayId: matrixBlockIdentifier(fullAccession, matrixBlock.label),
    recordLabel: matrixBlock.label,
    foreignId: matrixBlock.externalId,
    foreignIdSource: matrixBlock.externalIdSource,
    printedAt: now(),
  };
}

// Real feature, per direct follow-up: "no secondary-label printing
// for decants... if a decant container's barcode gets damaged,
// there's currently no recovery path the way there is for blocks."
// Same real, parallel shape as buildSecondaryLabelDataForBlock above
// — a real decant already carries its own real externalId/
// externalIdSource (BlockStainEditorModal.tsx's own ForeignIdFields
// wiring), so the identical "only makes sense once a real foreign id
// explains why a fallback label is needed" guard applies unchanged.
export function buildSecondaryLabelDataForDecant(
  fullAccession: string,
  specimenLabel: string,
  decant: Pick<Decant, 'label' | 'externalId' | 'externalIdSource'>,
  now: () => string = () => new Date().toISOString(),
): SecondaryLabelData | null {
  if (!decant.externalId || !decant.externalIdSource) return null;
  return {
    displayId: decantIdentifier(fullAccession, specimenLabel, decant.label),
    recordLabel: `${specimenLabel}${decant.label}`,
    foreignId: decant.externalId,
    foreignIdSource: decant.externalIdSource,
    printedAt: now(),
  };
}
