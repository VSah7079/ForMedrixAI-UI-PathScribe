// src/utils/labels/getAllCassetteLabelRequests.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct research: "Batch Print Queue Interface: Provide
// a dedicated bulk action (e.g., 'Print All Cassettes for Case
// [Accession #]')." Step 6 of the label-printing build plan.
//
// Pure function — a real Case in, the full, real list of dispatch
// requests out (one per HistologyBlock across every specimen, plus one
// per real MatrixBlock — see the real, separate matrix section added
// per direct follow-up: "primary label printing for matrix blocks."
// Before this fix, a real matrix block was silently invisible to
// "Print All Cassettes" — the batch flow only ever walked
// specimen.blocks[], never caseData.matrixBlocks[]). No I/O — the
// actual dispatch (dispatchCassetteLabel.ts) stays a separate, honest
// stub; this function's only job is gathering what would be printed.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import { cassetteIdentifier, matrixBlockIdentifier } from '@/types/labels/LabelData';
import type { CassetteLabelDispatchRequest, MatrixCassetteLabelDispatchRequest } from './dispatchCassetteLabel';

export interface AllCassetteLabelRequests {
  ordinary: CassetteLabelDispatchRequest[];
  matrix: MatrixCassetteLabelDispatchRequest[];
}

export function getAllCassetteLabelRequests(caseData: Case): AllCassetteLabelRequests {
  const fullAccession = caseData.accession.fullAccession;
  const ordinary: CassetteLabelDispatchRequest[] = [];
  for (const specimen of caseData.specimens ?? []) {
    for (const block of specimen.blocks ?? []) {
      ordinary.push({
        fullAccession,
        specimenLabel: specimen.label,
        blockLabel: block.label,
        cassetteId: cassetteIdentifier(fullAccession, specimen.label, block.label),
      });
    }
  }

  const matrix: MatrixCassetteLabelDispatchRequest[] = [];
  for (const matrixBlock of caseData.matrixBlocks ?? []) {
    const specimenLabels = matrixBlock.participants
      .map(p => (caseData.specimens ?? []).find(s => s.id === p.specimenId)?.label ?? '?');
    matrix.push({
      fullAccession,
      specimenLabels,
      matrixBlockLabel: matrixBlock.label,
      cassetteId: matrixBlockIdentifier(fullAccession, matrixBlock.label),
    });
  }

  return { ordinary, matrix };
}
