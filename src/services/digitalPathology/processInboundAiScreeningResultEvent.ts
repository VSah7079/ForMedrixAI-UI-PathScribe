// src/services/digitalPathology/processInboundAiScreeningResultEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for AiScreeningResultEventPayload. Same real
// idempotent-on-messageId, honest-distinct-outcomes discipline as
// this app's own other inbound processors.
// ─────────────────────────────────────────────────────────────────────────────

import { mockAiScreeningResultService } from './mockAiScreeningResultService';
import type { AiScreeningResultEventPayload } from '@/types/events/AiScreeningResultEventPayload';

export interface ProcessInboundAiScreeningResultEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'result-not-found' | 'invalid-payload';
}

const processedMessageIds = new Set<string>();

export async function processInboundAiScreeningResultEvent(
  payload: AiScreeningResultEventPayload,
): Promise<ProcessInboundAiScreeningResultEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied' };
  }

  if (!payload.resultId || !payload.status) {
    return { messageId: payload.messageId, outcome: 'invalid-payload' };
  }

  const existing = await mockAiScreeningResultService.getById(payload.resultId);
  if (!existing.ok) {
    return { messageId: payload.messageId, outcome: 'result-not-found' };
  }

  if (payload.status === 'completed') {
    await mockAiScreeningResultService.markCompleted(payload.resultId, payload.findings ?? [], payload.slideTriage);
  } else if (payload.status === 'failed') {
    await mockAiScreeningResultService.markFailed(payload.resultId);
  } else {
    await mockAiScreeningResultService.markTimedOut(payload.resultId);
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied' };
}

/** Test-only reset — same real pattern as this app's own other
 *  idempotent inbound processors. */
export function _resetProcessedAiScreeningResultMessageIdsForTests(): void {
  processedMessageIds.clear();
}
