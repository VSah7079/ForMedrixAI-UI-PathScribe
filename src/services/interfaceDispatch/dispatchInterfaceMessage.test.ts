// src/services/interfaceDispatch/dispatchInterfaceMessage.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("We are logging interface errors with human
// readable error messaging?" → "continue with the error log refinements").
// dispatchInterfaceMessage() grew real complexity with this pass (a real
// timeout via AbortController, three distinct real failure modes, each with
// its own human-readable message) — previously only exercised indirectly
// through useLisIntegration.test.ts/mockInterfaceEngineService.test.ts.
// Direct, focused coverage here for the function itself.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchInterfaceMessage } from './dispatchInterfaceMessage';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dispatchInterfaceMessage — real success path', () => {
  it('a real 200 OK response resolves ok: true, with no error/errorCode', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await dispatchInterfaceMessage('q1', 'ORU_R01', { some: 'payload' });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
  });

  it('sends the real, generic envelope shape — queueEntryId/transactionType/dispatchedAt/payload', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await dispatchInterfaceMessage('q-real-id', 'A40', { priorPatient: { patientId: 'p1' } });
    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((requestInit as RequestInit).body as string);
    expect(sentBody.queueEntryId).toBe('q-real-id');
    expect(sentBody.transactionType).toBe('A40');
    expect(typeof sentBody.dispatchedAt).toBe('string');
    expect(sentBody.payload).toEqual({ priorPatient: { patientId: 'p1' } });
  });
});

describe('dispatchInterfaceMessage — real DISPATCH_REJECTED path (the receiver responded, but rejected the message)', () => {
  it('a real 422 with a real, parseable {error} body wraps it in a real, human-readable frame', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Missing required field: transactionType' }), { status: 422 }));
    const result = await dispatchInterfaceMessage('q1', 'A08', {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISPATCH_REJECTED');
    expect(result.error).toBe('The interface engine rejected this message: Missing required field: transactionType');
  });

  it('a real non-2xx with no parseable body still gets a real, human-readable frame, not a bare status code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }));
    const result = await dispatchInterfaceMessage('q1', 'A08', {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISPATCH_REJECTED');
    expect(result.error).toBe('The interface engine returned an unexpected error (HTTP 500).');
  });
});

describe('dispatchInterfaceMessage — real DISPATCH_UNREACHABLE path (the real network call itself failed)', () => {
  it('a real fetch() rejection (connection refused, DNS failure, CORS, etc.) is wrapped with a real, plain-language frame, keeping the real technical detail alongside it', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await dispatchInterfaceMessage('q1', 'A08', {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISPATCH_UNREACHABLE');
    expect(result.error).toBe('Could not reach the interface engine — check that it\'s running and reachable at the configured endpoint. (Failed to fetch)');
  });
});

describe('dispatchInterfaceMessage — real DISPATCH_TIMEOUT path (a real, explicit 15s timeout)', () => {
  it('a real fetch() that never resolves is aborted after 15 real seconds and reports DISPATCH_TIMEOUT', async () => {
    // Real, per direct guidance: simulates the real, actual AbortController/
    // fetch() interaction — a real fetch() call respects the passed
    // `signal` and rejects with a real AbortError once it fires, rather
    // than just asserting the timer fired in isolation.
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit)?.signal;
        signal?.addEventListener('abort', () => {
          const err = new DOMException('The operation was aborted.', 'AbortError');
          reject(err);
        });
      });
    });

    const resultPromise = dispatchInterfaceMessage('q1', 'A08', {});
    await vi.advanceTimersByTimeAsync(15000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DISPATCH_TIMEOUT');
    expect(result.error).toBe('The interface engine did not respond within 15 seconds — it may be down, overloaded, or unreachable.');
  });

  it('a real response arriving just before the 15s timeout is NOT treated as a timeout', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve(new Response('{}', { status: 200 })), 10000);
      });
    });

    const resultPromise = dispatchInterfaceMessage('q1', 'A08', {});
    await vi.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.ok).toBe(true);
  });
});
