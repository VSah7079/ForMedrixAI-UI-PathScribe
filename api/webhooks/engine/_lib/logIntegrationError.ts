// api/webhooks/engine/_lib/logIntegrationError.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own recommended pattern: an inbound
// Engine webhook's 400 goes straight back to the caller (never
// disguised as a 200, never surfaced as a UI dialog to whichever
// pathologist happens to have PathScribe open), while a real,
// structured record lands here for IT/lab admins to actually
// diagnose — a schema mismatch, a missing field, an unsupported
// status code some vendor's Engine build sent.
//
// Real, deliberate new collection: AuditLogger.ts (src/services/cases/)
// only writes to console.debug today — confirmed directly, no real
// Firestore audit store exists yet to extend. This is a genuinely new,
// but real and durable, home for exactly the structured fields direct
// guidance specified, not a stopgap.
//
// Real, deliberate failure posture: a failure to write THIS log entry
// must never mask or replace the real 400 already being returned to
// the Engine — caught and console.error'd here, never thrown, never
// allowed to turn an otherwise-correct 400 into a 500.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './firebaseAdmin';

const COLLECTION_NAME = 'integration_errors';

export interface LogIntegrationErrorInput {
  /** e.g. 'PAYLOAD_VALIDATION_FAILED' — per direct guidance's own
   *  example category. */
  category: string;
  /** e.g. 'CassetteEngine' — the real, external caller, not this
   *  endpoint's own name (that's eventType below). */
  source: string;
  httpStatus: number;
  /** Real, specific detail — the rejected field or code value, never
   *  a generic "invalid payload" string a real admin can't act on. */
  details: string;
  /** Real, per-endpoint tag (e.g. 'block-exception') — same real
   *  eventType convention idempotency.ts's own claimMessageId already
   *  uses, so a log entry is traceable to which real endpoint rejected
   *  it without guessing from source/category alone. */
  eventType: string;
  caseId?: string;
  accessionNumber?: string;
}

export async function logIntegrationError(input: LogIntegrationErrorInput): Promise<void> {
  try {
    const db = getAdminFirestore();
    await db.collection(COLLECTION_NAME).add({
      ...input,
      loggedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[logIntegrationError] failed to write audit log entry', err, input);
  }
}
