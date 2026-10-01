// src/services/cytology/buildWsiScanBatchManifestPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on Cytology Assisted Instrumentation —
// see IWsiScanBatchService.ts's own header. Same real "PathScribe
// builds the real, structured JSON; the real interface engine handles
// actual delivery to the real instrument" philosophy as
// buildCytologyOruR01Payload.ts / buildCytologyProficiencyTestSubmissionPayload.ts
// — never a real fetch/dispatch call itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { WsiScanBatch } from '../digitalPathology/IWsiScanBatchService';

export interface WsiScanBatchManifestPayload {
  messageId: string;
  eventType: 'WSI_SCAN_BATCH_MANIFEST';
  eventTimestamp: string;
  batchId: string;
  batchBarcode: string;
  scannerInstrumentId: string;
  slides: { slidePosition: string; caseId: string; specimenId: string }[];
}

export function buildWsiScanBatchManifestPayload(batch: WsiScanBatch): WsiScanBatchManifestPayload {
  return {
    messageId: crypto.randomUUID(),
    eventType: 'WSI_SCAN_BATCH_MANIFEST',
    eventTimestamp: batch.dispatchedAt ?? new Date().toISOString(),
    batchId: batch.id,
    batchBarcode: batch.batchBarcode,
    scannerInstrumentId: batch.scannerInstrumentId,
    slides: batch.slides.map(s => ({ slidePosition: s.slidePosition, caseId: s.caseId, specimenId: s.specimenId })),
  };
}
