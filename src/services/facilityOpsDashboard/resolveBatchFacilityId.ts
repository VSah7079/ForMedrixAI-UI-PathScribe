// src/services/facilityOpsDashboard/resolveBatchFacilityId.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, confirmed directly before building (see this Epic's own
// investigation): Batch (services/batches/IBatchService.ts) has no
// direct facilityId field. The real, honest join available today is
// two-step, same real "performing lab, not referring facility"
// reasoning computePendingBatchQueue.ts's own header already
// established for this exact app:
//   1. Every real item scanned into a batch carries its own real
//      caseAccession (BatchItem.caseAccession) — resolve that back to
//      the real Case it belongs to, and read Case.originHospitalId
//      (the performing enterprise, never Case.facilityId, which is
//      the REFERRING facility).
//   2. A batch with no items yet (just created, nothing scanned in)
//      has no case to join through — fall back to
//      Batch.stationId -> ScanStation.facilityId, the real bench the
//      batch was opened at, when that's known. Real, honest
//      undefined when neither signal is available (e.g. an old batch
//      created before stationId existed, with no items scanned yet)
//      — never a guessed facility.
// ─────────────────────────────────────────────────────────────────────────────

import type { Batch } from '../batches/IBatchService';

export function resolveBatchFacilityId(
  batch: Batch,
  accessionToFacilityId: ReadonlyMap<string, string>,
  stationToFacilityId: ReadonlyMap<string, string>
): string | undefined {
  for (const item of batch.items) {
    const viaCase = accessionToFacilityId.get(item.caseAccession);
    if (viaCase) return viaCase;
  }
  if (batch.stationId) {
    const viaStation = stationToFacilityId.get(batch.stationId);
    if (viaStation) return viaStation;
  }
  return undefined;
}
