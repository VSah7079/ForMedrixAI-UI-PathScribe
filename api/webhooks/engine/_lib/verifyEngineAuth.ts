// api/webhooks/engine/_lib/verifyEngineAuth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own decision: a shared-secret header,
// with optional HMAC signature verification layered on top when the
// real, external system can support it. Two independent checks, not
// alternatives to each other — a real deployment should enable both
// where the sending system allows it; a shared secret alone is
// vulnerable to replay/logging exposure, HMAC alone doesn't identify
// which engine/tenant is calling.
//
// Real, honest scope: this file has no idea what your actual Cassette
// Engine (or block-exception/material-location middleware) can
// support. Both checks are independently toggleable via env vars so a
// real deployment can start with just the shared secret and add HMAC
// once the vendor's real signing capability is confirmed — never
// silently skipped without the operator knowing which check is live.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EngineAuthResult {
  ok: boolean;
  reason?: string;
}

/** Real, constant-time comparison — a plain `===` on secrets leaks
 *  timing information about how many leading characters matched,
 *  a real, well-known side channel for guessing a secret byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies an inbound Engine request against whichever real checks are
 * configured for this deployment. Call this first, before parsing or
 * processing the body — an unauthenticated request should never reach
 * real payload validation or Firestore.
 *
 * @param headers   The request's real headers (case-insensitive lookup
 *                  handled here — Vercel/Node both normalize to
 *                  lowercase, but this stays defensive either way).
 * @param rawBody   The exact, unparsed request body string — HMAC
 *                  verification MUST run against the literal bytes the
 *                  Engine signed, never a re-serialized JSON.stringify
 *                  of the parsed object, which can byte-for-byte differ
 *                  (key order, whitespace) and silently break real
 *                  signature verification.
 */
export function verifyEngineAuth(headers: Headers, rawBody: string): EngineAuthResult {
  const sharedSecret = process.env.ENGINE_WEBHOOK_SECRET;
  const hmacSecret = process.env.ENGINE_WEBHOOK_HMAC_SECRET;

  if (!sharedSecret && !hmacSecret) {
    // Real, deliberate fail-closed default: an operator who hasn't
    // configured either check yet almost certainly hasn't deployed
    // this for real traffic — refusing every request is safer than
    // silently accepting unauthenticated ones because setup was
    // incomplete.
    return { ok: false, reason: 'No ENGINE_WEBHOOK_SECRET or ENGINE_WEBHOOK_HMAC_SECRET configured on this deployment — refusing all inbound requests until at least one is set.' };
  }

  if (sharedSecret) {
    const provided = headers.get('x-api-key') ?? headers.get('x-engine-signature');
    if (!provided || !safeEqual(provided, sharedSecret)) {
      return { ok: false, reason: 'Missing or invalid X-API-Key / X-Engine-Signature header.' };
    }
  }

  if (hmacSecret) {
    const providedSignature = headers.get('x-engine-hmac-signature');
    if (!providedSignature) {
      return { ok: false, reason: 'ENGINE_WEBHOOK_HMAC_SECRET is configured but no X-Engine-Hmac-Signature header was sent.' };
    }
    const expected = createHmac('sha256', hmacSecret).update(rawBody, 'utf8').digest('hex');
    if (!safeEqual(providedSignature, expected)) {
      return { ok: false, reason: 'HMAC signature did not match the request body.' };
    }
  }

  return { ok: true };
}
