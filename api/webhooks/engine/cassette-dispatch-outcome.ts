// api/webhooks/engine/cassette-dispatch-outcome.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own decisions: a dedicated endpoint file
// (not a shared dynamic [type] route), Firestore-backed idempotency,
// shared-secret + optional HMAC auth, polling-based delivery to the
// frontend for a first pass.
//
// Real, deliberate scope: this endpoint persists every dispatch
// outcome — including routine successes — as a real, complete
// clinical audit trail (per direct guidance's own decision: "a clean
// 'dispatched successfully' record proves the Engine received and
// executed the order"). It never touches the real case document — same
// real posture the existing frontend handler already established
// (processCassetteDispatchOutcomeEvent.ts's own comment: "this event
// never mutates the case at all"). Persisting every outcome does NOT
// mean notifying on every outcome — that filter still lives entirely
// in processCassetteDispatchOutcomeEvent.ts's own logic (only
// fallback_used/prompted/error ever produce a toast), unaffected by
// what gets written here.
//
// Written against the Web-standard Request/Response signature rather
// than Vercel's own VercelRequest/VercelResponse types, since
// @vercel/node isn't a declared dependency in this project yet — this
// keeps the function portable and adds no new dependency. If this
// project's real api/ai/anthropic proxy uses the Node-style
// (req, res) signature instead, adjust this file's export shape to
// match rather than introducing a second convention.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './_lib/firebaseAdmin';
import { verifyEngineAuth } from './_lib/verifyEngineAuth';
import { claimMessageId } from './_lib/idempotency';
import { logIntegrationError } from './_lib/logIntegrationError';
import { raiseSpecimenDeficiency } from './_lib/raiseSpecimenDeficiency';
import type { CassetteDispatchOutcomeEventPayload } from '../../../src/types/events/CassetteDispatchOutcomeEventPayload';

const EVENT_TYPE = 'cassette-dispatch-outcome';
const NOTIFICATIONS_COLLECTION = 'pending_engine_notifications';

function isValidPayload(body: any): body is CassetteDispatchOutcomeEventPayload {
  return (
    typeof body?.messageId === 'string' &&
    typeof body?.caseId === 'string' &&
    typeof body?.requestedColorKey === 'string' &&
    typeof body?.outcome === 'string' &&
    ['dispatched', 'fallback_used', 'prompted', 'error'].includes(body.outcome)
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const rawBody = await request.text();

  const auth = verifyEngineAuth(request.headers, rawBody);
  if (!auth.ok) {
    // Real, deliberate 401 (not 403) — this is an authentication
    // failure (who are you), not an authorization one (you're known
    // but not allowed). Reason is logged server-side only, never
    // echoed back — a wrong-but-close secret shouldn't get free
    // feedback on how close it was.
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
      details: 'Missing or invalid required fields: messageId, caseId, requestedColorKey, outcome.', eventType: EVENT_TYPE,
      caseId: typeof (body as any)?.caseId === 'string' ? (body as any).caseId : undefined,
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: messageId, caseId, requestedColorKey, outcome.' }), { status: 400 });
  }

  const payload = body;

  try {
    const { alreadyProcessed } = await claimMessageId(payload.messageId, EVENT_TYPE);
    if (alreadyProcessed) {
      // Real, conventional webhook redelivery response — 200, so the
      // Engine sees success and stops retrying, exactly as if this
      // were the first delivery.
      return new Response(JSON.stringify({ status: 'already-processed', messageId: payload.messageId }), { status: 200 });
    }

    // Real, per direct guidance's own decision: every outcome is now
    // persisted, not just non-routine ones — a complete, clinical
    // audit trail ("cassette A1 dispatched successfully") is now a
    // real requirement, not just a notification feed. The real, still-
    // separate concern of NOT toast-spamming a tech for every routine
    // success is unaffected by this change — that filter lives in
    // processCassetteDispatchOutcomeEvent.ts's own logic (only
    // fallback_used/prompted/error ever show a toast), which
    // usePendingEngineNotifications.ts still calls unchanged; this
    // endpoint persisting more data doesn't make that function notify
    // any more often than it already did.
    const db = getAdminFirestore();
    await db.collection(NOTIFICATIONS_COLLECTION).doc(payload.messageId).create({
      eventType: EVENT_TYPE,
      caseId: payload.caseId,
      createdAt: new Date().toISOString(),
      payload,
    });

    // Real, per direct guidance's own explicit symmetry decision: a
    // complete dispatch failure (outcome === 'error') gets the same
    // real, open CAPA treatment as a lost/damaged block — it blocks
    // real bench flow entirely, not just a routine fallback color
    // substitution (fallback_used/prompted stay history/notification
    // only, deliberately no CAPA record). Real, disclosed gap: unlike
    // BlockExceptionEventPayload, this payload carries no
    // organisationId at all — omitted here rather than guessed;
    // SpecimenDeficiency.organisationId is optional for exactly this
    // real reason.
    if (payload.outcome === 'error') {
      try {
        await raiseSpecimenDeficiency({
          caseId: payload.caseId,
          specimenLabel: payload.specimenLabel,
          deficiencyTypeId: 'def-cassette-dispatch-failure',
          comment: payload.message ?? 'Cassette dispatch failed completely — no cassette was produced.',
          raisedBy: 'system',
        });
      } catch (deficiencyErr) {
        console.error(`[${EVENT_TYPE}] failed to raise CAPA deficiency`, deficiencyErr);
      }
    }

    return new Response(JSON.stringify({ status: 'accepted', messageId: payload.messageId }), { status: 200 });
  } catch (err) {
    console.error(`[${EVENT_TYPE}] unexpected error`, err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
