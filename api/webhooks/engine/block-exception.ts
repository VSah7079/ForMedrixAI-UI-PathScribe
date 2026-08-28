// api/webhooks/engine/block-exception.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for BlockExceptionEventPayload
// (src/types/events/BlockExceptionEventPayload.ts). Uses the exact
// same pure mutation rule as the frontend's own
// processBlockExceptionEvent.ts — src/services/hl7/blockExceptionMutation.ts
// — so a real Engine-reported "Lost"/"Damaged" status and a Dev Tools
// simulated one apply the identical business rule, just through two
// different, real write paths (this file's own applyEngineCaseUpdate,
// vs the frontend's caseRouter.updateCase()).
//
// Real, deliberate choice: writes directly via applyEngineCaseUpdate
// (Admin SDK, bypasses the client-only LIS_OWNED_FIELDS guardrail) —
// this event genuinely can't wait for a browser to be open and polling
// the way a pure notification can. A block reported "Lost" is a real,
// physical fact that needs to land in the case record immediately,
// regardless of whether anyone's looking at it right now.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './_lib/firebaseAdmin';
import { verifyEngineAuth } from './_lib/verifyEngineAuth';
import { claimMessageId } from './_lib/idempotency';
import { applyEngineCaseUpdate } from './_lib/applyEngineCaseUpdate';
import { logIntegrationError } from './_lib/logIntegrationError';
import { raiseSpecimenDeficiency } from './_lib/raiseSpecimenDeficiency';
import { applyBlockException } from '../../../src/services/hl7/blockExceptionMutation';
import type { BlockExceptionEventPayload } from '../../../src/types/events/BlockExceptionEventPayload';

const EVENT_TYPE = 'block-exception';
const NOTIFICATIONS_COLLECTION = 'pending_engine_notifications';

// Real, per direct guidance's own decision: a real, physical block
// loss/damage is a genuine non-conformity, not just a status flag —
// see mockDeficiencyTypeService.ts's own def-block-lost/
// def-block-damaged doc comments for the full reasoning.
const DEFICIENCY_TYPE_BY_STATUS: Record<BlockExceptionEventPayload['status'], string> = {
  Lost: 'def-block-lost',
  Damaged: 'def-block-damaged',
};

function isValidPayload(body: any): body is BlockExceptionEventPayload {
  return (
    typeof body?.messageId === 'string' &&
    typeof body?.accessionNumber === 'string' &&
    typeof body?.specimenLetter === 'string' &&
    typeof body?.blockNumber === 'string' &&
    (body?.status === 'Lost' || body?.status === 'Damaged')
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const rawBody = await request.text();

  const auth = verifyEngineAuth(request.headers, rawBody);
  if (!auth.ok) {
    console.warn(`[${EVENT_TYPE}] auth failed: ${auth.reason}`);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    await logIntegrationError({
      category: 'PAYLOAD_VALIDATION_FAILED', source: 'CassetteEngine', httpStatus: 400,
      details: 'Body was not valid JSON.', eventType: EVENT_TYPE,
    });
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!isValidPayload(body)) {
    await logIntegrationError({
      category: 'PAYLOAD_VALIDATION_FAILED', source: 'CassetteEngine', httpStatus: 400,
      details: 'Missing or invalid required fields: messageId, accessionNumber, specimenLetter, blockNumber, status.', eventType: EVENT_TYPE,
      accessionNumber: typeof (body as any)?.accessionNumber === 'string' ? (body as any).accessionNumber : undefined,
      caseId: typeof (body as any)?.internalCaseId === 'string' ? (body as any).internalCaseId : undefined,
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: messageId, accessionNumber, specimenLetter, blockNumber, status.' }), { status: 400 });
  }

  const payload = body;

  try {
    const { alreadyProcessed } = await claimMessageId(payload.messageId, EVENT_TYPE);
    if (alreadyProcessed) {
      return new Response(JSON.stringify({ status: 'already-processed', messageId: payload.messageId }), { status: 200 });
    }

    // Real, same lookupId convention every existing process*Event
    // function already uses.
    const caseId = payload.internalCaseId ?? payload.accessionNumber;

    const result = await applyEngineCaseUpdate(caseId, (specimens) => {
      const mutation = applyBlockException(specimens, {
        specimenLetter: payload.specimenLetter,
        blockNumber: payload.blockNumber,
        status: payload.status,
        note: payload.note,
        reportedAt: payload.reportedAt,
        timestamp: payload.timestamp,
      });
      return mutation ? { field: 'specimens', specimens: mutation.specimens } : null;
    });

    if (result.outcome === 'case-not-found') {
      return new Response(JSON.stringify({ error: `No case found for '${caseId}'.` }), { status: 404 });
    }
    if (result.outcome === 'target-not-found') {
      return new Response(JSON.stringify({ error: `Case ${caseId} has no block ${payload.specimenLetter}${payload.blockNumber}.` }), { status: 404 });
    }

    // Real, per direct guidance: a real-time toast matters here even
    // though the mutation already happened server-side — a tech at
    // the bench needs to know something changed without waiting to
    // manually refresh the case view. Same pending_engine_notifications
    // collection cassette-dispatch-outcome.ts already writes to;
    // usePendingEngineNotifications.ts's own polling picks this up and
    // calls the real, separate notifyBlockExceptionApplied — never the
    // mutation-performing processBlockExceptionEvent, which would
    // apply this same exception a second time.
    const db = getAdminFirestore();
    await db.collection(NOTIFICATIONS_COLLECTION).doc(payload.messageId).create({
      eventType: EVENT_TYPE,
      caseId,
      createdAt: new Date().toISOString(),
      payload: {
        messageId: payload.messageId,
        caseId,
        specimenLetter: payload.specimenLetter,
        blockNumber: payload.blockNumber,
        status: payload.status,
        note: payload.note,
      },
    });

    // Real, same reasoning as pending_engine_notifications above, but
    // for a genuinely different purpose: a real, tracked CAPA record,
    // not a transient toast. Deliberately fire-and-forget-adjacent
    // (awaited so a failure is at least logged) but never allowed to
    // fail the real, already-successful case mutation and notification
    // above — a CAPA-record write failing shouldn't turn an otherwise
    // successful webhook call into an error response.
    try {
      await raiseSpecimenDeficiency({
        caseId,
        organisationId: payload.organisationId,
        siteId: payload.siteId,
        specimenLabel: `${payload.specimenLetter}${payload.blockNumber}`,
        deficiencyTypeId: DEFICIENCY_TYPE_BY_STATUS[payload.status],
        comment: payload.note ?? `Reported ${payload.status} by the Cassette Engine.`,
        raisedBy: 'system',
      });
    } catch (deficiencyErr) {
      console.error(`[${EVENT_TYPE}] failed to raise CAPA deficiency`, deficiencyErr);
    }

    return new Response(JSON.stringify({ status: 'applied', messageId: payload.messageId, caseId }), { status: 200 });
  } catch (err) {
    console.error(`[${EVENT_TYPE}] unexpected error`, err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
