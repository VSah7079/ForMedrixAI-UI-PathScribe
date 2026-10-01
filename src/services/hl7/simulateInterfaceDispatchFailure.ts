// src/services/hl7/simulateInterfaceDispatchFailure.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("Any existing gaps to deal with?" — no
// DLQ/retry UI for the two real outbound patient-ADT/result queues).
// Mirrors services/billing/simulateDispatchFailure.ts's own real,
// honest posture exactly. Deliberately a separate function, not a
// reuse of simulateDispatchFailure — that one's own messages name
// "RCM endpoint" specifically, which would be factually wrong for a
// patient-identity or pathology-result dispatch to the interface
// engine, a different real destination.
//
// Real, per direct follow-up ("We are logging interface errors with
// human readable error messaging?"): real dispatch transport now
// exists (services/interfaceDispatch/dispatchInterfaceMessage.ts) —
// this file's own real purpose narrowed accordingly. It exists purely
// to let a user deliberately exercise the DLQ's own FAILED-state UI
// (Retry Dispatch, Capture as CAPA) without needing a real, reachable
// interface engine to actually be down or misconfigured — never
// confused with a real dispatch attempt, and its own messages are
// clearly labeled "Simulated" for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatedInterfaceDispatchFailure {
  errorCode: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage: string;
  maxRetriesExceeded: boolean;
}

export function simulateInterfaceDispatchFailure(kind: 'timeout' | 'unreachable' | 'rejected'): SimulatedInterfaceDispatchFailure {
  if (kind === 'timeout') {
    return {
      errorCode: 'DISPATCH_TIMEOUT',
      errorMessage: 'Simulated: the interface engine did not respond within 15 seconds — it may be down, overloaded, or unreachable.',
      maxRetriesExceeded: true,
    };
  }
  if (kind === 'unreachable') {
    return {
      errorCode: 'DISPATCH_UNREACHABLE',
      errorMessage: 'Simulated: could not reach the interface engine — check that it\'s running and reachable at the configured endpoint. (Failed to fetch)',
      maxRetriesExceeded: true,
    };
  }
  return {
    errorCode: 'DISPATCH_REJECTED',
    errorMessage: 'Simulated: the interface engine rejected this message: HTTP 422 — message payload rejected.',
    maxRetriesExceeded: true,
  };
}
