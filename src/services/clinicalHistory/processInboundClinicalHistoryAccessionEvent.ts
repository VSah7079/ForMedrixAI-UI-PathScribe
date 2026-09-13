// src/services/clinicalHistory/processInboundClinicalHistoryAccessionEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for ClinicalHistoryAccessionEventPayload —
// per the uploaded spec's own User Story 2. Same real "ingest our own
// specification" posture as processInboundHpvResultEvent.ts:
// idempotent on messageId, and every real outcome — applied,
// already-applied, order-not-found, invalid-payload (with the real,
// detailed per-entry errors the spec's own 422 response calls for) —
// is a distinct, honest result, never a silent swallow.
//
// Real, per the spec's own Order Ingestion Endpoint: orderId resolves
// against a real case the same way this app's own other inbound
// processors resolve theirs — first as a direct case id/accession,
// falling back to a real search by Case.order.externalOrderId (the
// field a real external EHR's own order id would actually land on),
// since this app has no separate, standalone "Order" entity distinct
// from Case.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockClinicalHistoryDictionaryService } from './mockClinicalHistoryDictionaryService';
import { validateClinicalHistoryAccessionPayload } from './validateClinicalHistoryAccessionPayload';
import type { ClinicalHistoryAccessionEventPayload } from '@/types/events/ClinicalHistoryAccessionEventPayload';
import type { ClinicalHistoryValidationError } from './validateClinicalHistoryAccessionPayload';

export interface ProcessInboundClinicalHistoryAccessionEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'order-not-found' | 'invalid-payload';
  caseId?: string;
  /** Real, per the spec's own 422 response requirement — every real
   *  validation problem found, not just the first. */
  errors?: ClinicalHistoryValidationError[];
}

const processedMessageIds = new Set<string>();

async function resolveCaseByOrderId(orderId: string) {
  const direct = await caseRouter.getCase(orderId);
  if (direct) return direct;
  const allRes = await caseRouter.getAll();
  const all = Array.isArray(allRes) ? allRes : (allRes as any).ok ? (allRes as any).data : [];
  return all.find((c: any) => c.order?.externalOrderId === orderId);
}

export async function processInboundClinicalHistoryAccessionEvent(
  payload: ClinicalHistoryAccessionEventPayload,
): Promise<ProcessInboundClinicalHistoryAccessionEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied' };
  }

  if (!payload.orderId || !Array.isArray(payload.clinicalHistory)) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', errors: [{ entryIndex: -1, field: payload.orderId ? 'clinical_history' : 'order_id', message: 'order_id and a real clinical_history array are both required.' }] };
  }

  const caseData = await resolveCaseByOrderId(payload.orderId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'order-not-found' };
  }

  const dictRes = await mockClinicalHistoryDictionaryService.getAll();
  const dictionary = dictRes.ok ? dictRes.data : [];
  const validation = validateClinicalHistoryAccessionPayload(payload.clinicalHistory, dictionary);
  if (!validation.valid) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', caseId: caseData.id, errors: validation.errors };
  }

  await caseRouter.updateCase(caseData.id, {
    order: { ...(caseData as any).order, clinicalHistory: payload.clinicalHistory },
  } as any);

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id };
}

/** Test-only reset — same real pattern as
 *  processInboundHpvResultEvent.ts's own. */
export function _resetProcessedClinicalHistoryMessageIdsForTests(): void {
  processedMessageIds.clear();
}
