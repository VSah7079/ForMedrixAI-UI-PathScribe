// api/webhooks/engine/engraver-status.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for EngraverStatusEventPayload
// (src/types/events/EngraverStatusEventPayload.ts) — feeds the
// Engraver Monitor's real, read-only device cards (Batch Management),
// per direct guidance's own confirmed architectural verdict (Option 3:
// thin read-only surface, Engine retains all real hardware ownership).
//
// Same real auth/idempotency shape as the other three endpoints, but
// writes via upsertEngraverStatus (current-state upsert with
// staleness protection) rather than applyEngineCaseUpdate (case
// mutation) or a pending_engine_notifications log entry — see that
// file's own header for why this event's real semantics differ.
// ─────────────────────────────────────────────────────────────────────────────

import { verifyEngineAuth } from './_lib/verifyEngineAuth';
import { claimMessageId } from './_lib/idempotency';
import { upsertEngraverStatus } from './_lib/upsertEngraverStatus';
import { logIntegrationError } from './_lib/logIntegrationError';
import type { EngraverStatusEventPayload } from '../../../src/types/events/EngraverStatusEventPayload';

const EVENT_TYPE = 'engraver-status';
const VALID_STATUSES = ['online', 'engraving', 'warning', 'fault', 'offline'];
const VALID_SUPPLY_WARNING_CODES = ['CASSETTE_SUPPLY_LOW', 'CASSETTE_SUPPLY_DEPLETED', 'COLOR_UNAVAILABLE'];

function isValidPayload(body: any): body is EngraverStatusEventPayload {
  if (
    typeof body?.messageId !== 'string' ||
    typeof body?.timestamp !== 'string' ||
    typeof body?.organisationId !== 'string' ||
    typeof body?.deviceId !== 'string' ||
    typeof body?.sourceSystem !== 'string' ||
    !VALID_STATUSES.includes(body?.status)
  ) {
    return false;
  }
  if (body.supplyWarnings !== undefined) {
    if (!Array.isArray(body.supplyWarnings)) return false;
    for (const w of body.supplyWarnings) {
      if (!VALID_SUPPLY_WARNING_CODES.includes(w?.code)) return false;
    }
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
      details: 'Missing or invalid required fields: messageId, timestamp, organisationId, deviceId, sourceSystem, status.', eventType: EVENT_TYPE,
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: messageId, timestamp, organisationId, deviceId, sourceSystem, status.' }), { status: 400 });
  }

  const payload = body;

  try {
    const { alreadyProcessed } = await claimMessageId(payload.messageId, EVENT_TYPE);
    if (alreadyProcessed) {
      return new Response(JSON.stringify({ status: 'already-processed', messageId: payload.messageId }), { status: 200 });
    }

    const outcome = await upsertEngraverStatus({
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      locationLabel: payload.locationLabel,
      organisationId: payload.organisationId,
      siteId: payload.siteId,
      status: payload.status,
      supplyWarnings: payload.supplyWarnings,
      warnings: payload.warnings,
      diagnosticsUrl: payload.diagnosticsUrl,
      sourceSystem: payload.sourceSystem,
      timestamp: payload.timestamp,
    });

    return new Response(JSON.stringify({ status: outcome, messageId: payload.messageId, deviceId: payload.deviceId }), { status: 200 });
  } catch (err) {
    console.error(`[${EVENT_TYPE}] unexpected error`, err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
