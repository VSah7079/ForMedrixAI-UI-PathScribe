// src/services/cytology/resolveCaseCytologyScansCompletedMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on Cytology Assisted Instrumentation: "a
// new Tile that would exclusively show cases were the scans have
// been completed." Same real, established shape as
// resolveCaseCytologyTriagePendingMembership.ts — a real, pure,
// testable function returning whether one real case belongs in this
// specific real tile, not a new, one-off pattern.
//
// Real, deliberate scope: only ever true when the real, current
// instrumentation modality is 'wsi' — a real traditional_guided lab
// never has this tile show anything, matching direct guidance's own
// "stays completely out of the image-rendering business" posture.
// ─────────────────────────────────────────────────────────────────────────────

import type { WsiScanBatch } from '../digitalPathology/IWsiScanBatchService';
import type { CytologyInstrumentationModality } from './ICytologyInstrumentationService';

export function resolveCaseCytologyScansCompletedMembership(
  caseId: string,
  specimens: { id: string; cytologyScreening?: { finalDiagnosis?: unknown } }[] | undefined,
  allBatches: WsiScanBatch[],
  instrumentationModality: CytologyInstrumentationModality,
): boolean {
  if (instrumentationModality !== 'wsi') return false;
  if (!specimens || specimens.length === 0) return false;

  // Real, per this file's own header — a case already screened
  // (a real, recorded finalDiagnosis exists) has moved past the
  // "ready to screen" state this tile exists to surface; it belongs
  // in the normal worklist's own post-screening handling instead.
  const alreadyScreened = specimens.some(sp => sp.cytologyScreening?.finalDiagnosis != null);
  if (alreadyScreened) return false;

  const specimenIds = new Set(specimens.map(sp => sp.id));
  return allBatches.some(batch =>
    batch.slides.some(slide =>
      slide.caseId === caseId && specimenIds.has(slide.specimenId) && slide.scanStatus === 'completed',
    ),
  );
}
