// src/services/hl7/processBlockExceptionEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for BlockExceptionEventPayload
// (types/events/BlockExceptionEventPayload.ts) — per direct follow-up:
// "can we just ingest our own specification (best practice) then let
// the engine handle the translation?" This is the "ingest our own
// specification" half, fully real and buildable today: takes an
// already-translated, PathScribe-shaped event and applies it to a
// real block, through the exact same caseRouter.updateCase() every
// other real write in this app already goes through — never a
// second, parallel write path for inbound-vs-manual updates. The
// still-genuinely-missing half (a real vendor's raw HL7 ORU ->
// this shape) is deliberately NOT here — that's an interface-engine
// (Mirth Connect, per cerebroAdapter.ts's own documented path) or
// thin-adapter concern once a real, field-verified vendor guide
// exists, kept entirely out of this file on purpose, same real split
// services/hl7/adapters/ already established for the outbound side.
//
// Same real, honest posture as processAdtMessage.ts: idempotent on
// messageId (a redelivered event is a no-op, not a duplicate write),
// and every real outcome — success, case not found, block not found,
// already-applied — is a distinct, honest result, never a silent
// swallow.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock } from '@/types/case/Specimen';
import type { BlockExceptionEventPayload } from '@/types/events/BlockExceptionEventPayload';

export interface ProcessBlockExceptionEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'case-not-found' | 'block-not-found' | 'invalid-payload';
  /** Only set when outcome === 'applied' or 'already-applied'. */
  caseId?: string;
  blockId?: string;
  /** Human-readable reason, set for every non-'applied' outcome —
   *  same real, honest-error posture as the rest of this app (e.g.
   *  cerebroAdapter.ts's own thrown message), not a bare status code
   *  with no context for whoever's debugging a failed delivery. */
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real problem
// space as HL7 redelivery in general (a real interface engine will
// retry a message it didn't get a clean ack for), scoped to this
// module rather than a full, persisted event-log service, which is
// real follow-up work if this ever needs to survive a page reload.
const processedMessageIds = new Set<string>();

function findBlock(caseData: Case, specimenLetter: string, blockNumber: string): { specimen: Specimen; block: HistologyBlock } | undefined {
  for (const specimen of caseData.specimens ?? []) {
    if (specimen.label !== specimenLetter) continue;
    const block = (specimen.blocks ?? []).find(b => b.label === blockNumber);
    if (block) return { specimen, block };
  }
  return undefined;
}

/**
 * Applies an already-translated block exception event to the real
 * case data. Looks up the case by internalCaseId first (the stable
 * system PK, when the sending system has it), falling back to
 * accessionNumber directly — the two resolve to the same real lookup
 * in this app's current data model (see this function's own inline
 * note), kept as two separate payload fields for the same
 * forward-compatibility reason ModeAOrderPayload.ts already does.
 */
export async function processBlockExceptionEvent(payload: BlockExceptionEventPayload): Promise<ProcessBlockExceptionEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.accessionNumber || !payload.specimenLetter || !payload.blockNumber || !payload.status) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: accessionNumber, specimenLetter, blockNumber, status.' };
  }

  // Real note: internalCaseId and accessionNumber resolve to the same
  // real lookup today — this app's own Case.id IS the human-facing
  // accession string (e.g. 'S26-4403'), not a separate internal UUID.
  // Tried in this order anyway, matching ModeAOrderPayload's own
  // established two-field shape, so a real, future system that DOES
  // distinguish them needs no change here.
  const lookupId = payload.internalCaseId ?? payload.accessionNumber;
  const caseData = await caseRouter.getCase(lookupId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${lookupId}'.` };
  }

  const found = findBlock(caseData, payload.specimenLetter, payload.blockNumber);
  if (!found) {
    return { messageId: payload.messageId, outcome: 'block-not-found', reason: `Case ${caseData.id} has no block ${payload.specimenLetter}${payload.blockNumber}.` };
  }

  const { specimen, block } = found;
  const updatedSpecimens = (caseData.specimens ?? []).map(sp =>
    sp.id !== specimen.id ? sp : {
      ...sp,
      blocks: (sp.blocks ?? []).map(b => b.id !== block.id ? b : {
        ...b,
        status: payload.status,
        exceptionNote: payload.note ?? b.exceptionNote,
        exceptionReportedAt: payload.reportedAt ?? payload.timestamp,
      }),
    }
  );

  try {
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
  } catch (e) {
    // Real, deliberate "force through" posture — same reasoning
    // already established for every other real, external-system-
    // initiated write in this app (e.g. useSpecimenBlockManagement.ts's
    // own LIS-confirmation writes): the real, physical exception this
    // event describes already happened at the bench/in the sending
    // system regardless of a local version conflict, so there's no
    // safe "discard and reload" option — retrying without the
    // expected-version guard is the only response that doesn't lose
    // this real update.
    if (e instanceof ConcurrencyConflictError) {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
    } else {
      throw e;
    }
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, blockId: block.id };
}

/** Test-only reset — processedMessageIds is a real, deliberate
 *  module-level Set (not a class), so tests need a way to clear it
 *  between cases, same pattern already established for
 *  dispatchSlideLabel.ts's own in-memory log. */
export function _resetProcessedMessageIdsForTests(): void {
  processedMessageIds.clear();
}
