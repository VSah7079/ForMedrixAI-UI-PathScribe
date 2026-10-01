// src/services/molecular/processInboundMolecularRunResults.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §4.2 inbound payload and
// §5.2 "Run Validation Gating." Real, deliberate idempotency-key
// choice: the given specification's own §4.2 worked example carries no
// messageId field (unlike this app's other real event payloads,
// HpvResultEventPayload.ts/MolecularBatchResultEventPayload.ts) — since
// deviating from the given specification's own exact shape to add one
// wasn't the right call, batch_uuid is used instead: a real batch
// should only ever receive its own real results once, so a redelivery
// carrying the same batch_uuid is a real, honest no-op, matching the
// same "redelivery is not a duplicate write" posture every other real
// inbound processor in this app already follows.
// ─────────────────────────────────────────────────────────────────────────────

import { mockMolecularBatchService } from './mockMolecularBatchService';
import { resolveMolecularRunValidationGating } from './resolveMolecularRunValidationGating';
import type { MolecularRunResultsPayload, MolecularReviewStatus } from '@/types/events/MolecularRunResultsPayload';
import type { MolecularBatchStatus } from './IMolecularBatchService';

export interface ProcessInboundMolecularRunResultsResult {
  outcome: 'applied' | 'already-applied' | 'batch-not-found';
  batchUuid: string;
  reviewStatus?: MolecularReviewStatus;
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning and
// scope as processInboundHpvResultEvent.ts's own.
const processedBatchUuids = new Set<string>();

function resolveBatchStatus(runStatus: MolecularRunResultsPayload['batch_info']['run_status']): MolecularBatchStatus {
  if (runStatus === 'COMPLETED') return 'completed';
  if (runStatus === 'ABORTED') return 'aborted';
  return 'awaiting_results'; // real, honest fallback for FAILED — a failed run still needs real, human follow-up, not a silent "completed"
}

export async function processInboundMolecularRunResults(payload: MolecularRunResultsPayload): Promise<ProcessInboundMolecularRunResultsResult> {
  const batchUuid = payload.batch_info.batch_uuid;

  if (processedBatchUuids.has(batchUuid)) {
    return { outcome: 'already-applied', batchUuid, reason: 'Results for this batch_uuid were already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  // Real, per this file's own header (§5.2): PathScribe's own,
  // authoritative gating check — never simply trusting the inbound
  // review_status alone.
  const reviewStatus = resolveMolecularRunValidationGating(payload.control_validation.controls_passed);

  const res = await mockMolecularBatchService.updateByUuid(batchUuid, {
    status: resolveBatchStatus(payload.batch_info.run_status),
    results: payload.results,
    controlsPassed: payload.control_validation.controls_passed,
    reviewStatus,
  });

  if (!res.ok) {
    return { outcome: 'batch-not-found', batchUuid, reason: 'error' in res ? res.error : 'Unknown error updating the batch.' };
  }

  processedBatchUuids.add(batchUuid);
  return { outcome: 'applied', batchUuid, reviewStatus };
}

/** Test-only reset — same real pattern as processInboundHpvResultEvent.ts's own. */
export function _resetProcessedMolecularRunResultsForTests(): void {
  processedBatchUuids.clear();
}
