// src/services/interfaceDispatch/dispatchInterfaceMessage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("do we implement ORU^R01 dispatch trigger
// then actual outbound HTTP dispatch transport" → "we can setup just
// the receiving end for now and look to see that the json packages
// coming out of PS are correct" → "Dispatch needs to be generic so all
// transactions can be checked"). This is the real, single, generic
// dispatch function every real outbound queue calls — the actual
// outbound HTTP transport this whole app has never had, closing the
// architectural boundary documented throughout services/patients/README.md
// and services/reports/README.md ("nothing dispatches this yet, no
// real HTTP transport exists").
//
// Deliberately one, single, real HTTP call site, not one per
// transaction type — every real queue (A08/A40/A47 via
// mockOutboundPatientAdtQueueService, ORU^R01 via
// mockOutboundResultQueueService, LIS sync via
// mockOutboundLisSyncQueueService) sends the same real, generic
// envelope shape to the same real receiving endpoint
// (receive_interface_message, functions/main.py in the separate
// Firebase Functions repository — see that file's own header comment
// for the exact real, matching contract this envelope must satisfy).
//
// Real, honest scope: this is a real stand-in for an interface engine's
// receiving side (Mirth Connect or similar), built specifically to
// verify PathScribe's own outbound JSON is correct — never a Mirth
// Connect replacement, and never generates HL7 itself, same "PathScribe
// sends JSON, the interface engine builds HL7" posture as every real
// payload builder in this app already has.
// ─────────────────────────────────────────────────────────────────────────────

export type InterfaceTransactionType = 'A08' | 'A40' | 'A47' | 'ORU_R01' | 'LIS_SYNC' | 'ORDER_CREATED' | 'REGISTRY_REPORT' | 'PRINT_JOB';

export interface InterfaceDispatchEnvelope {
  queueEntryId: string;
  transactionType: InterfaceTransactionType;
  dispatchedAt: string;
  payload: object;
}

// Real, per direct guidance: deliberately NOT a discriminated union
// ({ok: true} | {ok: false, error: string}) — this project's own
// tsconfig.json has strictNullChecks: false, under which TypeScript's
// control-flow narrowing on a boolean-literal discriminant (if
// (result.ok) {...} else {...}) doesn't reliably narrow the way it
// does under strict mode. error is simply optional on both branches
// instead — avoids the narrowing question entirely, works correctly
// under this project's real, existing compiler settings.
//
// Real, per direct follow-up ("We are logging interface errors with
// human readable error messaging?"): errorCode is new — the same
// real, three-way distinction now on every real queue entry type
// (see OutboundPatientAdtQueueEntry.ts's own, fuller doc comment for
// the full real reasoning). Resolved here, once, at the one real
// place a real dispatch actually happens — every real caller reads
// it off the result rather than each independently guessing/
// hardcoding a code, which is exactly the bug this real follow-up
// found: every real caller previously hardcoded 'DISPATCH_REJECTED'
// regardless of what had actually happened.
export interface InterfaceDispatchResult {
  ok: boolean;
  error?: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
}

// Real, per direct guidance: same real env-var-driven pattern
// REPORT_PDF_ENDPOINT already uses (SynopticReportPage.tsx) — local
// default matches functions-framework's own real local-dev port
// convention (--port=8080), documented on that same real endpoint's
// own header comment. Deliberately a SEPARATE constant/env var from
// REPORT_PDF_ENDPOINT, not reused — these are two real, separate
// Cloud Functions (render_report vs. receive_interface_message),
// each with its own real, independent deployed URL once live.
export const INTERFACE_RECEIVER_ENDPOINT =
  (import.meta as any).env?.VITE_INTERFACE_RECEIVER_ENDPOINT ?? 'http://localhost:8080/';

// Real, per direct follow-up ("We are logging interface errors with
// human readable error messaging?"): a real, explicit timeout — a
// bare fetch() with no timeout mechanism hangs indefinitely on a
// genuinely unresponsive endpoint (until whatever OS/browser-level TCP
// timeout eventually kicks in, which could be a very long time), which
// would previously have meant a real 'DISPATCH_TIMEOUT' could never
// actually happen for a real dispatch — only the Simulate Failure
// testing button could ever produce that code. 15000ms matches the
// same real value simulateInterfaceDispatchFailure.ts's own simulated
// timeout message already references, for consistency.
const DISPATCH_TIMEOUT_MS = 15000;

/**
 * Real, generic dispatch — builds the real envelope
 * (InterfaceDispatchEnvelope) and POSTs it to the real receiving
 * endpoint. Every real caller supplies its own already-built, real
 * payload (via the existing real builder functions —
 * buildAdt08Payload/buildAdt40Payload/buildAdt47Payload/
 * buildOruR01Payload, or the real LIS-sync detail object) — this
 * function never builds a payload itself, only wraps and sends
 * whatever real payload it's given.
 */
export async function dispatchInterfaceMessage(
  queueEntryId: string,
  transactionType: InterfaceTransactionType,
  payload: object,
): Promise<InterfaceDispatchResult> {
  const envelope: InterfaceDispatchEnvelope = {
    queueEntryId,
    transactionType,
    dispatchedAt: new Date().toISOString(),
    payload,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const resp = await fetch(INTERFACE_RECEIVER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // Real, per direct guidance: surfaces the real receiver's own
      // {"ok": false, "error": "..."} body when present (a real
      // validation failure, per receive_interface_message's own
      // real 422 contract) — genuinely useful for "look to see the
      // json packages... are correct." A real, human-readable frame
      // either way, not just a bare status code or a raw technical
      // string with no context.
      let detail = `The interface engine returned an unexpected error (HTTP ${resp.status}).`;
      try {
        const body = await resp.json();
        if (body?.error) detail = `The interface engine rejected this message: ${body.error}`;
      } catch {
        // Real, deliberate: a non-JSON error body (e.g. a raw 405/500
        // from a genuinely unreachable or misconfigured endpoint)
        // still reports the real status code above, never masked by
        // a failed .json() parse.
      }
      // Real, deliberate: the receiving endpoint DID respond here —
      // it's genuinely reachable, it just rejected/failed to process
      // this specific message. Always DISPATCH_REJECTED, never
      // DISPATCH_UNREACHABLE, regardless of status code.
      return { ok: false, error: detail, errorCode: 'DISPATCH_REJECTED' };
    }
    return { ok: true };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return {
        ok: false,
        errorCode: 'DISPATCH_TIMEOUT',
        error: `The interface engine did not respond within ${DISPATCH_TIMEOUT_MS / 1000} seconds — it may be down, overloaded, or unreachable.`,
      };
    }
    // Real network-level failure — endpoint unreachable, CORS
    // rejection, DNS failure, etc.: the request never got a real
    // response at all. Same honest "genuine failure, not simulated"
    // posture the DLQ's real Simulate Failure buttons were always
    // careful to distinguish from. Keeps the real, technical detail
    // (e.message) alongside a real, plain-language frame, rather than
    // surfacing only the raw browser/JS exception string on its own.
    const technical = e?.message ?? 'unknown error';
    return {
      ok: false,
      errorCode: 'DISPATCH_UNREACHABLE',
      error: `Could not reach the interface engine — check that it's running and reachable at the configured endpoint. (${technical})`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
