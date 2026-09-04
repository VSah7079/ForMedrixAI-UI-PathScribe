// src/services/hl7/processInboundHpvResultEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for HpvResultEventPayload
// (types/events/HpvResultEventPayload.ts) — per direct correction:
// "for the molecular platform they would be sending results through
// your engine which would transform that into a json payload. I don't
// think that is really fake, no one is resulting an HPV in the
// application." Same real "ingest our own specification" posture as
// processBlockExceptionEvent.ts: takes an already-translated,
// PathScribe-shaped event and applies it to the real specimen, through
// the exact same caseRouter.updateCase() every other real write in
// this app already goes through. The real vendor's raw HL7 ORU -> this
// shape is a real interface-engine (Mirth Connect) concern, deliberately
// kept out of this file, same real split already established.
//
// Same real, honest posture as processBlockExceptionEvent.ts:
// idempotent on messageId, and every real outcome — applied,
// already-applied, case-not-found, specimen-not-found, invalid-payload
// — is a distinct, honest result, never a silent swallow.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import type { HpvResultEventPayload } from '@/types/events/HpvResultEventPayload';

export interface ProcessInboundHpvResultEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'case-not-found' | 'specimen-not-found' | 'invalid-payload';
  caseId?: string;
  specimenId?: string;
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning and
// scope as processBlockExceptionEvent.ts's own.
const processedMessageIds = new Set<string>();

/** Real, per direct correction: "they would be sending ref ranges and
 *  abnormal flags" — the real, sending molecular platform's own
 *  abnormalFlag is the authoritative source, but validated here
 *  against hrHpvResult rather than trusted blindly; a real, malformed
 *  or contradictory delivery (e.g. Positive with flag 'N') is a real,
 *  honest invalid-payload outcome, not silently accepted. */
function isFlagConsistentWithResult(result: HpvResultEventPayload['hrHpvResult'], flag: HpvResultEventPayload['abnormalFlag']): boolean {
  if (!flag) return true; // real, optional field — a sending system that omits it is not itself invalid
  if (result === 'Positive') return flag === 'A';
  if (result === 'Negative') return flag === 'N';
  return true; // 'Invalid' result — no real, standard flag expectation either way
}

export async function processInboundHpvResultEvent(payload: HpvResultEventPayload): Promise<ProcessInboundHpvResultEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.accessionNumber || !payload.specimenLetter || !payload.hrHpvResult) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: accessionNumber, specimenLetter, hrHpvResult.' };
  }

  if (!isFlagConsistentWithResult(payload.hrHpvResult, payload.abnormalFlag)) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: `abnormalFlag '${payload.abnormalFlag}' is inconsistent with hrHpvResult '${payload.hrHpvResult}'.` };
  }

  // Real note, same as processBlockExceptionEvent.ts's own: internalCaseId
  // and accessionNumber resolve to the same real lookup today.
  const lookupId = payload.internalCaseId ?? payload.accessionNumber;
  const caseData = await caseRouter.getCase(lookupId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${lookupId}'.` };
  }

  const specimens = (caseData.specimens as any[]) ?? [];
  const targetSpecimen = specimens.find(sp => sp.label === payload.specimenLetter);
  if (!targetSpecimen) {
    return { messageId: payload.messageId, outcome: 'specimen-not-found', reason: `Case ${caseData.id} has no specimen '${payload.specimenLetter}'.` };
  }

  const updatedSpecimens = specimens.map(sp =>
    sp.label === payload.specimenLetter
      ? {
          ...sp,
          cytologyScreening: {
            ...sp.cytologyScreening,
            hpvResult: payload.hrHpvResult,
            hpvAbnormalFlag: payload.abnormalFlag,
            hpvReferenceRange: payload.referenceRange,
            hpvGenotypeDetail: payload.genotypeDetail,
            hpvOrderReason: payload.orderReason,
          },
        }
      : sp
  );

  try {
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
  } catch (e) {
    // Real, deliberate "force through" posture — same reasoning as
    // processBlockExceptionEvent.ts's own: the real molecular result
    // already exists at the sending system regardless of a local
    // version conflict.
    if (e instanceof ConcurrencyConflictError) {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
    } else {
      throw e;
    }
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, specimenId: targetSpecimen.id };
}

/** Test-only reset — same real pattern as
 *  processBlockExceptionEvent.ts's own _resetProcessedMessageIdsForTests. */
export function _resetProcessedHpvMessageIdsForTests(): void {
  processedMessageIds.clear();
}
