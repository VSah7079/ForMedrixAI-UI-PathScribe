// src/services/hl7/processInboundWsiScanStatusUpdateEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for WsiScanStatusUpdateEventPayload — per
// direct follow-up on Cytology Assisted Instrumentation. Same real
// "ingest our own specification" posture as
// processInboundHpvResultEvent.ts: idempotent on messageId, every real
// outcome — applied, already-applied, batch-not-found,
// slide-not-found, invalid-payload — is a distinct, honest result,
// never a silent swallow.
// ─────────────────────────────────────────────────────────────────────────────

import { mockWsiScanBatchService } from '../digitalPathology/mockWsiScanBatchService';
import type { WsiScanStatusUpdateEventPayload } from '@/types/events/WsiScanStatusUpdateEventPayload';

export interface ProcessInboundWsiScanStatusUpdateEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'batch-not-found' | 'slide-not-found' | 'invalid-payload';
  reason?: string;
}

const processedMessageIds = new Set<string>();

export async function processInboundWsiScanStatusUpdateEvent(
  payload: WsiScanStatusUpdateEventPayload,
): Promise<ProcessInboundWsiScanStatusUpdateEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.batchId || !payload.slidePosition || !payload.scanStatus) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: batchId, slidePosition, scanStatus.' };
  }

  const batchRes = await mockWsiScanBatchService.getById(payload.batchId);
  if (!batchRes.ok) {
    return { messageId: payload.messageId, outcome: 'batch-not-found', reason: 'error' in batchRes ? batchRes.error : 'Unknown error.' };
  }

  const slideExists = batchRes.data.slides.some(s => s.slidePosition === payload.slidePosition);
  if (!slideExists) {
    return { messageId: payload.messageId, outcome: 'slide-not-found', reason: `Batch ${batchRes.data.batchBarcode} has no real slide at position "${payload.slidePosition}".` };
  }

  const updateRes = await mockWsiScanBatchService.updateSlideStatus(payload.batchId, payload.slidePosition, {
    scanStatus: payload.scanStatus,
    scanCompletedAt: payload.scanStatus === 'completed' ? payload.timestamp : undefined,
    failureReason: payload.failureReason,
  });
  if (!updateRes.ok) {
    return { messageId: payload.messageId, outcome: 'slide-not-found', reason: 'error' in updateRes ? updateRes.error : 'Unknown error.' };
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied' };
}

/** Test-only reset — same real pattern as
 *  processInboundHpvResultEvent.ts's own. */
export function _resetProcessedWsiScanStatusMessageIdsForTests(): void {
  processedMessageIds.clear();
}
