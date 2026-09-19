// src/services/hl7/processInboundCytologyInstrumentStatusEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for CytologyInstrumentStatusEventPayload
// (types/events/CytologyInstrumentStatusEventPayload.ts) — per the
// Protocol-Driven Workflow Infrastructure story's Part 2a. Same real
// "ingest our own specification" posture as processInboundHpvResultEvent.ts:
// takes an already-translated, PathScribe-shaped event and applies it
// through mockBatchService.setCytologyInstrumentStatus, the exact same
// service every UI action on a Batch already goes through. The real
// instrument's own raw wire format -> this shape is a real interface-
// engine concern, deliberately kept out of this file, same real split
// already established.
//
// Same real, honest posture as processInboundHpvResultEvent.ts:
// idempotent on messageId, and every real outcome — applied,
// already-applied, batch-not-found, wrong-node, invalid-payload — is a
// distinct, honest result, never a silent swallow.
//
// Real, deliberate simplification: does not enforce that statuses
// arrive in the exact 'In Process' -> 'Cell Transfer' -> 'Slide Prep
// Complete' order — a real redelivered or out-of-order message still
// honestly reflects the instrument's own most recently reported state,
// and rejecting a later, valid status because an earlier one was never
// received would leave the batch stuck on stale information. If strict
// sequence enforcement is wanted later, it belongs here as an explicit,
// separate check, not silently assumed.
// ─────────────────────────────────────────────────────────────────────────────

import { mockBatchService } from '../batches/mockBatchService';
import type { CytologyInstrumentStatusEventPayload } from '@/types/events/CytologyInstrumentStatusEventPayload';

export interface ProcessInboundCytologyInstrumentStatusEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'batch-not-found' | 'wrong-node' | 'invalid-payload';
  batchId?: string;
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning and
// scope as processInboundHpvResultEvent.ts's own.
const processedMessageIds = new Set<string>();

export async function processInboundCytologyInstrumentStatusEvent(
  payload: CytologyInstrumentStatusEventPayload
): Promise<ProcessInboundCytologyInstrumentStatusEventResult> {
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

  if (batch.processingNode !== 'Cytology Processing') {
    return { messageId: payload.messageId, outcome: 'wrong-node', batchId: batch.id, reason: `Batch ${batch.masterBarcode} is a '${batch.processingNode}' batch, not 'Cytology Processing' — instrument status events only apply to a ThinPrep processor batch.` };
  }

  const updateRes = await mockBatchService.setCytologyInstrumentStatus(batch.id, payload.status);
  if (!updateRes.ok) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', batchId: batch.id, reason: 'error' in updateRes ? updateRes.error : 'Unknown error.' };
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', batchId: batch.id };
}

/** Test-only reset — same real pattern as
 *  processInboundHpvResultEvent.ts's own _resetProcessedHpvMessageIdsForTests. */
export function _resetProcessedCytologyInstrumentStatusMessageIdsForTests(): void {
  processedMessageIds.clear();
}
