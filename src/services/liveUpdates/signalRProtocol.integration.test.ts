// @vitest-environment node
// src/services/liveUpdates/signalRProtocol.integration.test.ts — PS-262 (Batch 342).
// The real @microsoft/signalr client, through signalRLiveUpdateService,
// against a server speaking the SignalR JSON hub protocol
// (testing/fakeSignalRHub.ts). Proves the client side works with the
// wire protocol the .NET hub will speak: connect, scope, event delivery
// by location, latency, and recovery after the server drops the connection.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeSignalRHub, type FakeSignalRHub } from './testing/fakeSignalRHub';
import { LogLevel } from '@microsoft/signalr';
import { createSignalRLiveUpdateService } from './signalRLiveUpdateService';
import type { IntraopChangedEvent, PrintJobStatusEvent } from './liveUpdateContract';
import type { LiveConnectionState } from './liveUpdatePolicy';

const until = async (cond: () => boolean, timeoutMs = 10_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
};

let n = 0;
const event = (locationId: string): IntraopChangedEvent => ({
  v: 1, eventId: `evt-${++n}`, kind: 'specimen.dismissed', sessionId: 's1', specimenId: 'sp1', locationId, occurredAt: new Date().toISOString(),
});

describe('SignalR protocol, end to end (real client, local hub)', { timeout: 30_000 }, () => {
  let hub: FakeSignalRHub;
  beforeAll(async () => { hub = await startFakeSignalRHub(); });
  afterAll(async () => { await hub.close(); });

  it('two boards and a queue: each gets its own locations, within the 500 ms target, and recover after a drop', async () => {
    const quiet = () => {};
    const boardA = createSignalRLiveUpdateService({ hubUrl: hub.url, log: quiet, logLevel: LogLevel.None });
    const boardB = createSignalRLiveUpdateService({ hubUrl: hub.url, log: quiet, logLevel: LogLevel.None });
    const queue = createSignalRLiveUpdateService({ hubUrl: hub.url, log: quiet, logLevel: LogLevel.None });
    const got = { a: [] as IntraopChangedEvent[], b: [] as IntraopChangedEvent[], q: [] as IntraopChangedEvent[] };
    const statesA: LiveConnectionState[] = [];
    boardA.onStateChange(s => statesA.push(s));
    let resyncsA = 0;
    boardA.onResync(() => { resyncsA++; });

    const subA = boardA.subscribeIntraop({ locationIds: ['or-4'], all: false }, e => got.a.push(e));
    const subB = boardB.subscribeIntraop({ locationIds: ['or-7'], all: false }, e => got.b.push(e));
    const subQ = queue.subscribeIntraop({ locationIds: [], all: true }, e => got.q.push(e));
    await until(() => [boardA, boardB, queue].every(s => s.getState() === 'live') && hub.scopes().filter(Boolean).length === 3);
    expect(hub.scopes()).toEqual(expect.arrayContaining([
      { locationIds: ['or-4'], all: false }, { locationIds: ['or-7'], all: false }, { locationIds: [], all: true },
    ]));

    // A dismissal in OR 4: board A and the queue hear it, board B doesn't.
    const sentAt = performance.now();
    expect(hub.publish(event('or-4'))).toBe(2);
    await until(() => got.a.length === 1 && got.q.length === 1);
    const latencyMs = performance.now() - sentAt;
    expect(latencyMs).toBeLessThan(500);
    expect(got.b).toHaveLength(0);

    // The server drops every connection: each reconnects by itself,
    // re-sends its scope, and asks its screen to re-read.
    const negotiationsBefore = hub.negotiations();
    hub.dropAll();
    await until(() => statesA.includes('reconnecting'));
    await until(() => [boardA, boardB, queue].every(s => s.getState() === 'live') && hub.connectionCount() === 3 && hub.scopes().filter(Boolean).length === 3);
    expect(hub.negotiations()).toBeGreaterThanOrEqual(negotiationsBefore + 3);
    await until(() => resyncsA >= 2);

    hub.publish(event('or-7'));
    await until(() => got.b.length === 1 && got.q.length === 2);
    expect(got.a).toHaveLength(1);

    subA.unsubscribe(); subB.unsubscribe(); subQ.unsubscribe();
    await until(() => hub.connectionCount() === 0);
    expect(boardA.getState()).toBe('idle');
    console.info(`[PS-262] hub → client latency over loopback: ${latencyMs.toFixed(1)} ms`);
  });

  it('a network print result reaches a print-only connection, which sends no scope (Batch 347)', async () => {
    const quiet = () => {};
    const tab = createSignalRLiveUpdateService({ hubUrl: hub.url, log: quiet, logLevel: LogLevel.None });
    const got: PrintJobStatusEvent[] = [];
    const sub = tab.subscribePrintJobs(e => got.push(e));
    await until(() => tab.getState() === 'live' && hub.connectionCount() === 1);
    expect(hub.scopes()).toEqual([null]);
    hub.publishPrintJobStatus({ v: 1, eventId: 'print-1', jobId: 'EVT-S26-1-x', idempotencyKey: 'EVT-S26-1-x', status: 'PAPER_OUT', printerResponse: 'ERR', durationMs: 40, occurredAt: new Date().toISOString() });
    await until(() => got.length === 1);
    expect(got[0]).toMatchObject({ jobId: 'EVT-S26-1-x', status: 'PAPER_OUT' });
    sub.unsubscribe();
    await until(() => hub.connectionCount() === 0);
  });
});
