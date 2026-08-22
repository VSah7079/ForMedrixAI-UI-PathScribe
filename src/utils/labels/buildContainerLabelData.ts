// src/utils/labels/buildContainerLabelData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label-printing architecture
// scope. Pure function, same discipline as buildRequisitionLabelData.ts
// — reuses it directly for the shared fields rather than duplicating
// the same field mapping twice, so the two label types can never
// silently drift apart on what "patient name" or "submitting facility"
// means.
//
// Real feature, per direct follow-up: "when we print we need to have
// some indication of these shared cassettes." Checks the given
// specimen's own blocks for a real sharedCassetteId and, if found,
// looks up the real siblings via the one, shared traversal
// (findSharedCassetteSiblings) — never a second, independently
// re-implemented lookup that could drift from what the confirmation
// prompts / MaterialTreePanel.tsx's own grouped view already use.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import type { ContainerLabelData } from '@/types/labels/LabelData';
import { buildRequisitionLabelData } from './buildRequisitionLabelData';
import { findSharedCassetteSiblings } from '@/utils/sharedCassetteSiblings';

export function buildContainerLabelData(
  caseData: Case,
  specimen: Pick<Specimen, 'label' | 'description' | 'blocks'>,
  now: () => string = () => new Date().toISOString(),
): ContainerLabelData {
  // Real, honest scope note — see ContainerLabelData.sharedCassetteSiblings's
  // own doc comment: this label is specimen-level, not block-level, so
  // this checks ANY of the specimen's own blocks for a real, active
  // sharedCassetteId, not one, specific block. Filters by specimenLabel
  // (not just excludeBlockId) so this specimen's own block never shows
  // up as its own "sibling," even in the rare case it has more than
  // one block on the same shared cassette.
  const sharedCassetteId = (specimen.blocks ?? []).find(b => b.sharedCassetteId)?.sharedCassetteId;
  const siblings = sharedCassetteId
    ? findSharedCassetteSiblings(caseData.specimens ?? [], sharedCassetteId).filter(s => s.specimenLabel !== specimen.label)
    : [];

  return {
    ...buildRequisitionLabelData(caseData, now),
    specimenLabel: specimen.label,
    specimenDesc: specimen.description,
    sharedCassetteSiblings: siblings.length > 0
      ? siblings.map(s => ({ specimenLabel: s.specimenLabel, specimenDesc: s.specimenDescription, positionInBlock: s.positionInBlock }))
      : undefined,
  };
}

