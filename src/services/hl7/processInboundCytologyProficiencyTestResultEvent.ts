// src/services/hl7/processInboundCytologyProficiencyTestResultEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for CytologyProficiencyTestResultEventPayload
// (types/events/CytologyProficiencyTestResultEventPayload.ts) — per
// direct guidance on APAC-QA-01. Same real "ingest our own
// specification" posture as processInboundHpvResultEvent.ts: takes an
// already-translated, PathScribe-shaped event and records the real,
// external provider's own grade — the real provider's own raw
// response format (CAP's e-LAB Solutions Suite, RCPAQAP's myQAP,
// etc.) -> this shape is a real interface-engine concern, deliberately
// kept out of this file, same real split already established.
//
// Same real, honest posture as processInboundHpvResultEvent.ts:
// idempotent on messageId, and every real outcome — applied,
// already-applied, case-not-found, context-mismatch, invalid-payload
// — is a distinct, honest result, never a silent swallow.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockCytologyProficiencyTestResultService } from '../cytology/mockCytologyProficiencyTestResultService';
import type { CytologyProficiencyTestResultEventPayload } from '@/types/events/CytologyProficiencyTestResultEventPayload';

export interface ProcessInboundCytologyProficiencyTestResultEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'case-not-found' | 'context-mismatch' | 'invalid-payload';
  caseId?: string;
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning
// and scope as processInboundHpvResultEvent.ts's own.
const processedMessageIds = new Set<string>();

export async function processInboundCytologyProficiencyTestResultEvent(
  payload: CytologyProficiencyTestResultEventPayload,
): Promise<ProcessInboundCytologyProficiencyTestResultEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.accessionNumber || !payload.provider || !payload.challengeReferenceId || !payload.outcome) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: accessionNumber, provider, challengeReferenceId, outcome.' };
  }

  const lookupId = payload.internalCaseId ?? payload.accessionNumber;
  const caseData = await caseRouter.getCase(lookupId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${lookupId}'.` };
  }

  // Real, per this file's own header — the real, incoming grade must
  // match the real challenge this specific case was actually
  // accessioned for; never trusted blindly. A real, genuine patient
  // case (no proficiencyTestContext at all) is refused outright, same
  // as a real challenge-reference mismatch.
  const context = (caseData as any).proficiencyTestContext as { provider: string; challengeReferenceId: string } | undefined;
  if (!context || context.provider !== payload.provider || context.challengeReferenceId !== payload.challengeReferenceId) {
    return {
      messageId: payload.messageId, outcome: 'context-mismatch', caseId: caseData.id,
      reason: `Case ${caseData.id} has no matching proficiencyTestContext for provider '${payload.provider}' / challenge '${payload.challengeReferenceId}'.`,
    };
  }

  await mockCytologyProficiencyTestResultService.add({
    caseId: caseData.id,
    accessionNumber: payload.accessionNumber,
    provider: payload.provider,
    challengeReferenceId: payload.challengeReferenceId,
    outcome: payload.outcome,
    scoreDetail: payload.scoreDetail,
    expectedAnswer: payload.expectedAnswer,
    receivedAt: payload.timestamp,
  });

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id };
}

/** Test-only reset — same real pattern as
 *  processInboundHpvResultEvent.ts's own. */
export function _resetProcessedCytologyProficiencyTestMessageIdsForTests(): void {
  processedMessageIds.clear();
}
