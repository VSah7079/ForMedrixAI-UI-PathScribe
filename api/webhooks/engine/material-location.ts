// api/webhooks/engine/material-location.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for MaterialLocationEventPayload
// (src/types/events/MaterialLocationEventPayload.ts). Same real
// pattern as block-exception.ts — shares its actual mutation rule
// (src/services/hl7/materialLocationMutation.ts) with the frontend's
// own processMaterialLocationEvent.ts, applies it via
// applyEngineCaseUpdate (Admin SDK, real transaction, real version
// increment) rather than caseRouter.updateCase().
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './_lib/firebaseAdmin';
import { verifyEngineAuth } from './_lib/verifyEngineAuth';
import { claimMessageId } from './_lib/idempotency';
import { applyEngineCaseUpdate } from './_lib/applyEngineCaseUpdate';
import { logIntegrationError } from './_lib/logIntegrationError';
import { applyMaterialLocation } from '../../../src/services/hl7/materialLocationMutation';
import type { MaterialLocationEventPayload } from '../../../src/types/events/MaterialLocationEventPayload';

const EVENT_TYPE = 'material-location';
const NOTIFICATIONS_COLLECTION = 'pending_engine_notifications';

function isValidPayload(body: any): body is MaterialLocationEventPayload {
  if (typeof body?.messageId !== 'string' || typeof body?.accessionNumber !== 'string' || typeof body?.location !== 'string' || !body?.target?.level) {
    return false;
  }
  // Real, same exemption processMaterialLocationEvent.ts's own
  // validation already established: matrix_block/matrix_slide are the
  // only two real target levels with no specimenLetter at all.
  if (body.target.level !== 'matrix_block' && body.target.level !== 'matrix_slide' && typeof body?.specimenLetter !== 'string') {
    return false;
  }
  return true;
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
      details: 'Missing or invalid required fields: messageId, accessionNumber, location, target (and specimenLetter, unless target.level is matrix_block/matrix_slide).', eventType: EVENT_TYPE,
      accessionNumber: typeof (body as any)?.accessionNumber === 'string' ? (body as any).accessionNumber : undefined,
      caseId: typeof (body as any)?.internalCaseId === 'string' ? (body as any).internalCaseId : undefined,
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: messageId, accessionNumber, location, target (and specimenLetter, unless target.level is matrix_block/matrix_slide).' }), { status: 400 });
  }

  const payload = body;

  try {
    const { alreadyProcessed } = await claimMessageId(payload.messageId, EVENT_TYPE);
    if (alreadyProcessed) {
      return new Response(JSON.stringify({ status: 'already-processed', messageId: payload.messageId }), { status: 200 });
    }

    const caseId = payload.internalCaseId ?? payload.accessionNumber;

    let targetDescription: string | undefined;
    const result = await applyEngineCaseUpdate(caseId, (specimens, matrixBlocks) => {
      const mutation = applyMaterialLocation(specimens, matrixBlocks, {
        specimenLetter: payload.specimenLetter,
        target: payload.target,
        location: payload.location,
        workflowStage: payload.workflowStage,
        action: payload.action,
        observedAt: payload.observedAt,
        timestamp: payload.timestamp,
        sourceSystem: payload.sourceSystem,
        performedByName: payload.performedByName,
      });
      if (mutation.outcome === 'target-not-found') return null;
      targetDescription = mutation.result.targetDescription;
      return mutation.result.level === 'matrix'
        ? { field: 'matrixBlocks', matrixBlocks: mutation.result.matrixBlocks }
        : { field: 'specimens', specimens: mutation.result.specimens };
    });

    if (result.outcome === 'case-not-found') {
      return new Response(JSON.stringify({ error: `No case found for '${caseId}'.` }), { status: 404 });
    }
    if (result.outcome === 'target-not-found') {
      return new Response(JSON.stringify({ error: `Case ${caseId}: real target not found for this event's own target.` }), { status: 404 });
    }

    // Real, same reasoning as block-exception.ts's own identical
    // block — the mutation already happened server-side; this is
    // purely so a tech's already-open case view gets a real-time
    // toast without waiting for a manual refresh.
    const db = getAdminFirestore();
    await db.collection(NOTIFICATIONS_COLLECTION).doc(payload.messageId).create({
      eventType: EVENT_TYPE,
      caseId,
      createdAt: new Date().toISOString(),
      payload: {
        messageId: payload.messageId,
        caseId,
        targetDescription,
        location: payload.location,
        action: payload.action,
        workflowStage: payload.workflowStage,
      },
    });

    return new Response(JSON.stringify({ status: 'applied', messageId: payload.messageId, caseId, targetDescription }), { status: 200 });
  } catch (err) {
    console.error(`[${EVENT_TYPE}] unexpected error`, err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
