// src/utils/labels/buildDecantContainerLabelData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "proceed with the decant
// container label." A decant poured off into its own, separate
// physical container had a real, resolvable barcode scheme
// (decantIdentifier — already used by resolveMaterialFromScan.ts and,
// as of this session, disposeItemByScan.ts too) but nothing that ever
// built the actual, printable label — the real, missing piece this
// file closes. Same real, pure-function discipline as
// buildContainerLabelData.ts — reuses buildRequisitionLabelData
// directly for the shared fields, never a second, independently
// maintained copy of what "patient name" means.
//
// Real, deliberate difference from buildContainerLabelData.ts: no
// sharedCassetteSiblings equivalent here — that's a real, physical
// concept specific to a solid-tissue CASSETTE holding multiple
// specimens' own pieces; a fluid decant, poured into its own separate
// container, has no real analog (confirmed directly against
// DecantContainerLabelData's own doc comment before building this,
// not assumed).
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { Decant } from '@/types/case/Material';
import { DECANT_TYPE_LABEL } from '@/types/case/Material';
import type { DecantContainerLabelData } from '@/types/labels/LabelData';
import { buildRequisitionLabelData } from './buildRequisitionLabelData';

export function buildDecantContainerLabelData(
  caseData: Case,
  specimenLabel: string,
  specimenDesc: string,
  decant: Pick<Decant, 'label' | 'decantType'>,
  now: () => string = () => new Date().toISOString(),
): DecantContainerLabelData {
  return {
    ...buildRequisitionLabelData(caseData, now),
    specimenLabel,
    specimenDesc,
    decantLabel: decant.label,
    decantTypeLabel: DECANT_TYPE_LABEL[decant.decantType],
  };
}
