// src/services/hl7/processInboundStainingInstrumentStatusEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for StainingInstrumentStatusEventPayload
// (types/events/StainingInstrumentStatusEventPayload.ts) — mirrors
// processInboundCytologyInstrumentStatusEvent.ts exactly. Same real
// "ingest our own specification" posture: takes an already-translated,
// PathScribe-shaped event and applies it through
// mockBatchService.setStainingInstrumentStatus, the exact same service
// every UI action on a Batch already goes through. The real
// instrument's own raw wire format -> this shape is a real interface-
// engine concern, deliberately kept out of this file, same real split
// already established.
//
// Same real, honest posture as its Cytology equivalent: idempotent on
// messageId, and every real outcome — applied, already-applied,
// batch-not-found, wrong-node, invalid-payload — is a distinct, honest
// result, never a silent swallow.
//
// Real, per direct decision — built alone, first, as the smallest,
// lowest-risk piece of the Gating Strategy work: this file only
// records what the instrument reported. No gating/auto-resolve logic
// reads stainingInstrumentStatus yet; that's real, separate,
// deliberately not-yet-built follow-up work.
// ─────────────────────────────────────────────────────────────────────────────

import { mockBatchService } from '../batches/mockBatchService';
import type { StainingInstrumentStatusEventPayload } from '@/types/events/StainingInstrumentStatusEventPayload';

export interface ProcessInboundStainingInstrumentStatusEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'batch-not-found' | 'wrong-node' | 'invalid-payload';
  batchId?: string;
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning and
// scope as processInboundCytologyInstrumentStatusEvent.ts's own.
const processedMessageIds = new Set<string>();

export async function processInboundStainingInstrumentStatusEvent(
  payload: StainingInstrumentStatusEventPayload
): Promise<ProcessInboundStainingInstrumentStatusEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.masterBarcode || !payload.status) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: masterBarcode, status.' };
  }

  const batchRes = await mockBatchService.getByMasterBarcode(payload.masterBarcode);
  if (!batchRes.ok) {
    return { messageId: payload.messageId, outcome: 'batch-not-found', reason: 'error' in batchRes ? batchRes.error : 'Unknown error.' };
  }
  const batch = batchRes.data;

  if (batch.processingNode !== 'Staining') {
    return { messageId: payload.messageId, outcome: 'wrong-node', batchId: batch.id, reason: `Batch ${batch.masterBarcode} is a '${batch.processingNode}' batch, not 'Staining' — instrument status events only apply to a Staining batch.` };
  }

  const updateRes = await mockBatchService.setStainingInstrumentStatus(batch.id, payload.status);
  if (!updateRes.ok) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', batchId: batch.id, reason: 'error' in updateRes ? updateRes.error : 'Unknown error.' };
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', batchId: batch.id };
}

/** Test-only reset — same real pattern as
 *  processInboundCytologyInstrumentStatusEvent.ts's own
 *  _resetProcessedCytologyInstrumentStatusMessageIdsForTests. */
export function _resetProcessedStainingInstrumentStatusMessageIdsForTests(): void {
  processedMessageIds.clear();
}
