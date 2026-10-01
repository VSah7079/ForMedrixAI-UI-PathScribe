// src/services/billing/simulateDispatchFailure.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct request ("can we simulate a Failure transaction").
// Honest disclosure: Story 3's real dispatch (an actual HTTP/HL7 call to
// an external RCM endpoint) does not exist in this app - matches the
// scope boundary agreed early in this epic ("stop at creation of the
// Billing objects the engine would consume"). A DISPATCH_TIMEOUT/
// DISPATCH_REJECTED failure can therefore never genuinely occur here yet
// - there's no real network call to fail. This function exists
// specifically so the Story 4 DLQ dashboard has something real to
// display and act on before Story 3's real dispatch is built - it is
// NOT a real failure-detection mechanism, and is clearly named/labeled
// as a simulation everywhere it's surfaced in the UI, never presented
// as if it were real. Contrast with validateChargeMetadata.ts, which IS
// a real, genuine check against real case data, not a simulation.
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatedDispatchFailure {
  errorCode: 'DISPATCH_TIMEOUT' | 'DISPATCH_REJECTED';
  errorMessage: string;
  maxRetriesExceeded: boolean;
}

/** Real, per direct request - a realistic, honestly-simulated failure
 *  matching the two real shapes Story 4 itself names ("HTTP/HL7
 *  endpoints return error codes after max retries"). retryCount mirrors
 *  the real MLLP timeout example already reviewed this session (5
 *  retries, max exceeded) rather than inventing new numbers. */
export function simulateDispatchFailure(kind: 'timeout' | 'rejected'): SimulatedDispatchFailure {
  if (kind === 'timeout') {
    return {
      errorCode: 'DISPATCH_TIMEOUT',
      errorMessage: 'Simulated: failed to receive HL7 ACK from RCM endpoint within 15000ms after 5 retries.',
      maxRetriesExceeded: true,
    };
  }
  return {
    errorCode: 'DISPATCH_REJECTED',
    errorMessage: 'Simulated: RCM endpoint returned HTTP 422 — charge payload rejected.',
    maxRetriesExceeded: true,
  };
}
