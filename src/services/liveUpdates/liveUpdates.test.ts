// @vitest-environment happy-dom
// src/services/liveUpdates/liveUpdates.test.ts — PS-262 (Batch 342).
// The live-update contract, policy, both transports, and the mock intraop
// service's publishing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIntraopChangedEvent, parsePrintJobStatusEvent, HUB_INTRAOP_CHANGED, HUB_PRINT_JOB_STATUS, HUB_SET_INTRAOP_SCOPE, type IntraopChangedEvent, type PrintJobStatusEvent } from './liveUpdateContract';
import {
  combineScopes, createDuplicateFilter, eventMatchesScope, fallbackPollIntervalMs, nextRetryDelayMs, scopeKey,
  selectLiveUpdateTransport, FALLBACK_POLL_MS, LIVE_SAFETY_POLL_MS, MAX_RETRY_DELAY_MS,
} from './liveUpdatePolicy';
import { createLocalLiveUpdateService } from './localLiveUpdateService';
import { createSignalRLiveUpdateService, CLOSE_GRACE_MS, type HubConnectionLike } from './signalRLiveUpdateService';

const event = (over: Partial<IntraopChangedEvent> = {}): IntraopChangedEvent => ({
  v: 1, eventId: 'e1', kind: 'specimen.dismissed', sessionId: 's1', specimenId: 'sp1', locationId: 'loc-A', occurredAt: '2026-09-26T20:00:00Z', ...over,
});

const printEvent = (over: Partial<PrintJobStatusEvent> = {}): PrintJobStatusEvent => ({
  v: 1, eventId: 'p1', jobId: 'EVT-1', idempotencyKey: 'EVT-1', status: 'PAPER_OUT', printerResponse: 'ERR', durationMs: 40, occurredAt: '2026-09-26T20:00:00Z', ...over,
});

describe('print results contract (Batch 347)', () => {
  it('accepts a well-formed print result and rejects anything else', () => {
    expect(parsePrintJobStatusEvent(printEvent())).toEqual(printEvent());
    expect(parsePrintJobStatusEvent({ ...printEvent(), status: 'EXPLODED' })).toBeNull();
    expect(parsePrintJobStatusEvent({ ...printEvent(), jobId: '' })).toBeNull();
    expect(parsePrintJobStatusEvent({ ...printEvent(), v: 2 })).toBeNull();
    expect(parsePrintJobStatusEvent({ ...printEvent(), durationMs: 'slow' })).toBeNull();
    expect(parsePrintJobStatusEvent(event())).toBeNull();
    expect(parseIntraopChangedEvent(printEvent())).toBeNull();
  });
});

describe('contract', () => {
  it('accepts a well-formed event and rejects anything else', () => {
    expect(parseIntraopChangedEvent(event())).toEqual(event());
    expect(parseIntraopChangedEvent({ ...event(), v: 2 })).toBeNull();
    expect(parseIntraopChangedEvent({ ...event(), kind: 'patient.renamed' })).toBeNull();
    expect(parseIntraopChangedEvent({ ...event(), sessionId: '' })).toBeNull();
    expect(parseIntraopChangedEvent({ ...event(), locationId: 7 })).toBeNull();
    expect(parseIntraopChangedEvent(null)).toBeNull();
  });

  it('drops unknown fields, so nothing unexpected (e.g. PHI) passes through', () => {
    expect(parseIntraopChangedEvent({ ...event(), patientName: 'Jane Roe' })).not.toHaveProperty('patientName');
  });
});

describe('policy', () => {
  it('reconnect delays back off to 30 s and never give up', () => {
    const mid = () => 0.5; // no jitter
    expect([0, 1, 2, 3, 4, 5, 50, 5000].map(n => nextRetryDelayMs(n, mid))).toEqual([0, 2000, 5000, 10000, 20000, 30000, 30000, 30000]);
    for (let n = 0; n < 100; n++) expect(nextRetryDelayMs(n)).toBeTypeOf('number');
  });

  it('jitter stays within ±20 %', () => {
    expect(nextRetryDelayMs(5, () => 0)).toBe(MAX_RETRY_DELAY_MS * 0.8);
    expect(nextRetryDelayMs(5, () => 1)).toBe(MAX_RETRY_DELAY_MS * 1.2);
  });

  it('polls every 15 s without a live connection, every 60 s as a safety net while live', () => {
    expect(fallbackPollIntervalMs('live')).toBe(LIVE_SAFETY_POLL_MS);
    for (const s of ['local', 'offline', 'reconnecting', 'connecting'] as const) expect(fallbackPollIntervalMs(s)).toBe(FALLBACK_POLL_MS);
  });

  it('matches events to scopes and combines scopes', () => {
    expect(eventMatchesScope(event(), { locationIds: ['loc-A'], all: false })).toBe(true);
    expect(eventMatchesScope(event(), { locationIds: ['loc-B'], all: false })).toBe(false);
    expect(eventMatchesScope(event({ locationId: undefined }), { locationIds: ['loc-A'], all: false })).toBe(false);
    expect(eventMatchesScope(event({ locationId: undefined }), { locationIds: [], all: true })).toBe(true);
    expect(combineScopes([{ locationIds: ['b', 'a'], all: false }, { locationIds: ['a', 'c'], all: false }])).toEqual({ locationIds: ['a', 'b', 'c'], all: false });
    expect(combineScopes([{ locationIds: ['a'], all: false }, { locationIds: [], all: true }])).toEqual({ locationIds: [], all: true });
    expect(scopeKey({ locationIds: ['b', 'a'], all: false })).toBe('a,b');
    expect(scopeKey(null)).toBe('');
  });

  it('drops a redelivered event', () => {
    const isNew = createDuplicateFilter(2);
    expect([isNew('a'), isNew('a'), isNew('b'), isNew('c'), isNew('a')]).toEqual([true, false, true, true, true]);
  });

  it('uses SignalR only with a valid hub address', () => {
    const resolve = (c: string) => (c.startsWith('https://') ? { ok: true as const, url: c } : { ok: false as const, message: 'must use https://' });
    expect(selectLiveUpdateTransport({ configured: undefined, isProduction: true, resolve })).toEqual({ transport: 'local', reason: 'not-configured' });
    expect(selectLiveUpdateTransport({ configured: 'https://api.example/hubs/live', isProduction: true, resolve })).toEqual({ transport: 'signalr', hubUrl: 'https://api.example/hubs/live' });
    expect(selectLiveUpdateTransport({ configured: 'http://api.example', isProduction: true, resolve })).toMatchObject({ transport: 'local', reason: 'invalid' });
  });
});

/** Two "windows" joined by a fake BroadcastChannel. */
function channelPair() {
  const channels: { onmessage: ((ev: { data: unknown }) => void) | null; postMessage(m: unknown): void; close(): void }[] = [];
  const factory = () => {
    const ch = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage(m: unknown) { for (const other of channels) if (other !== ch) other.onmessage?.({ data: structuredClone(m) }); },
      close() {},
    };
    channels.push(ch);
    return ch;
  };
  return factory;
}

describe('local transport (no hub)', () => {
  it('delivers a change to subscribers in this window and in another window, by scope', () => {
    const factory = channelPair();
    const windowA = createLocalLiveUpdateService({ channelFactory: factory });
    const windowB = createLocalLiveUpdateService({ channelFactory: factory });
    const inA = vi.fn(); const inB = vi.fn(); const otherRoom = vi.fn(); const queue = vi.fn();
    windowA.subscribeIntraop({ locationIds: ['loc-A'], all: false }, inA);
    windowB.subscribeIntraop({ locationIds: ['loc-A'], all: false }, inB);
    windowB.subscribeIntraop({ locationIds: ['loc-B'], all: false }, otherRoom);
    windowB.subscribeIntraop({ locationIds: [], all: true }, queue);

    const sent = windowA.publish({ kind: 'specimen.dismissed', sessionId: 's1', specimenId: 'sp1', locationId: 'loc-A' });
    expect(inA).toHaveBeenCalledWith(sent);
    expect(inB).toHaveBeenCalledWith(sent);
    expect(queue).toHaveBeenCalledTimes(1);
    expect(otherRoom).not.toHaveBeenCalled();
    expect(windowA.getState()).toBe('local');
  });

  it('works without BroadcastChannel (this window only), and stops after unsubscribe', () => {
    const svc = createLocalLiveUpdateService({ channelFactory: () => null });
    const fn = vi.fn();
    const sub = svc.subscribeIntraop({ locationIds: [], all: true }, fn);
    svc.publish({ kind: 'session.created', sessionId: 's1' });
    sub.unsubscribe();
    svc.publish({ kind: 'session.created', sessionId: 's2' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/** A fake @microsoft/signalr HubConnection. */
function fakeHub() {
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const cb = { reconnecting: [] as ((e?: Error) => void)[], reconnected: [] as ((id?: string) => void)[], close: [] as ((e?: Error) => void)[] };
  const conn = {
    startResults: [] as ('ok' | 'fail')[],
    start: vi.fn(async function () { if (conn.startResults.shift() === 'fail') throw new Error('refused'); }),
    stop: vi.fn(async () => {}),
    on: vi.fn((m: string, h: (...a: unknown[]) => void) => { handlers[m] = h; }),
    invoke: vi.fn(async (_m: string, scope: { locationIds: string[]; all: boolean }) => ({ acceptedLocationIds: scope.locationIds, rejectedLocationIds: [], all: scope.all })),
    onreconnecting: (f: (e?: Error) => void) => { cb.reconnecting.push(f); },
    onreconnected: (f: (id?: string) => void) => { cb.reconnected.push(f); },
    onclose: (f: (e?: Error) => void) => { cb.close.push(f); },
    emit: (m: string, ...a: unknown[]) => handlers[m]?.(...a),
    dropAndReconnect: async () => { cb.reconnecting.forEach(f => f()); cb.reconnected.forEach(f => f('c2')); await flush(); },
    close: async () => { cb.close.forEach(f => f(new Error('gone'))); await flush(); },
  };
  return conn;
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('SignalR transport', () => {
  let hub: ReturnType<typeof fakeHub>;
  let timers: { fn: () => void; ms: number }[];
  const make = () => createSignalRLiveUpdateService({
    hubUrl: 'https://api.example/hubs/live',
    buildConnection: () => hub as unknown as HubConnectionLike,
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer: t => { timers = timers.filter(x => x !== t); },
    random: () => 0.5,
    log: () => {},
  });
  beforeEach(() => { hub = fakeHub(); timers = []; });

  it('connects on first subscription, sends the combined scope, and resyncs', async () => {
    const svc = make();
    const states: string[] = []; svc.onStateChange(s => states.push(s));
    const resync = vi.fn(); svc.onResync(resync);
    svc.subscribeIntraop({ locationIds: ['loc-B'], all: false }, vi.fn());
    await flush();
    expect(hub.start).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['connecting', 'live']);
    expect(hub.invoke).toHaveBeenLastCalledWith(HUB_SET_INTRAOP_SCOPE, { locationIds: ['loc-B'], all: false });
    expect(resync).toHaveBeenCalledTimes(1);

    svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn());
    await flush();
    expect(hub.invoke).toHaveBeenLastCalledWith(HUB_SET_INTRAOP_SCOPE, { locationIds: ['loc-A', 'loc-B'], all: false });
  });

  it('delivers hub events to matching subscribers only, once each, ignoring malformed ones', async () => {
    const svc = make();
    const a = vi.fn(); const b = vi.fn();
    svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, a);
    svc.subscribeIntraop({ locationIds: ['loc-B'], all: false }, b);
    await flush();
    hub.emit(HUB_INTRAOP_CHANGED, event());
    hub.emit(HUB_INTRAOP_CHANGED, event());                  // redelivered
    hub.emit(HUB_INTRAOP_CHANGED, { ...event(), v: 99, eventId: 'x' }); // unknown version
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('after a dropped connection: reconnecting, then live again, scope re-sent and a resync', async () => {
    const svc = make();
    const states: string[] = []; svc.onStateChange(s => states.push(s));
    const resync = vi.fn(); svc.onResync(resync);
    svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn());
    await flush();
    hub.invoke.mockClear();
    await hub.dropAndReconnect();
    expect(states).toEqual(['connecting', 'live', 'reconnecting', 'live']);
    expect(hub.invoke).toHaveBeenCalledWith(HUB_SET_INTRAOP_SCOPE, { locationIds: ['loc-A'], all: false });
    expect(resync).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying a server that is down (wall displays recover on their own)', async () => {
    hub.startResults = ['fail', 'fail', 'fail', 'ok'];
    const svc = make();
    svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn());
    await flush();
    expect(svc.getState()).toBe('offline');
    for (const expected of [0, 2000, 5000]) {
      expect(timers).toHaveLength(1);
      expect(timers[0].ms).toBe(expected);
      const t = timers.shift()!; t.fn(); await flush();
    }
    expect(svc.getState()).toBe('live');
    expect(hub.start).toHaveBeenCalledTimes(4);
  });

  it('restarts after the connection closes for good, and closes when nothing is subscribed', async () => {
    const svc = make();
    const sub = svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn());
    await flush();
    await hub.close();
    expect(svc.getState()).toBe('offline');
    expect(timers).toHaveLength(1);
    sub.unsubscribe();
    // Closed after a short grace period (a quick re-subscribe would reuse it).
    const grace = timers.find(t => t.ms === CLOSE_GRACE_MS)!;
    expect(hub.stop).not.toHaveBeenCalled();
    grace.fn();
    expect(hub.stop).toHaveBeenCalled();
    expect(timers.filter(t => t !== grace)).toHaveLength(0);
    expect(svc.getState()).toBe('idle');
  });

  it('a quick unsubscribe and re-subscribe (screen change, React re-mount) keeps the same connection', async () => {
    const svc = make();
    svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn()).unsubscribe();
    svc.subscribeIntraop({ locationIds: [], all: true }, vi.fn());
    await flush();
    expect(hub.start).toHaveBeenCalledTimes(1);
    expect(hub.stop).not.toHaveBeenCalled();
    expect(timers.some(t => t.ms === CLOSE_GRACE_MS)).toBe(false);
    expect(hub.invoke).toHaveBeenLastCalledWith(HUB_SET_INTRAOP_SCOPE, { locationIds: [], all: true });
  });
});

describe('print results over the live connection (Batch 347)', () => {
  it('local: a simulated result reaches this window and another, once', () => {
    const factory = channelPair();
    const windowA = createLocalLiveUpdateService({ channelFactory: factory });
    const windowB = createLocalLiveUpdateService({ channelFactory: factory });
    const inA = vi.fn(); const inB = vi.fn(); const intraop = vi.fn();
    windowA.subscribePrintJobs(inA);
    windowB.subscribePrintJobs(inB);
    windowB.subscribeIntraop({ locationIds: [], all: true }, intraop);
    const sent = windowA.publishPrintJobStatus({ jobId: 'EVT-1', idempotencyKey: 'EVT-1', status: 'PRINT_SUCCESS' });
    expect(inA).toHaveBeenCalledWith(sent);
    expect(inB).toHaveBeenCalledWith(sent);
    expect(intraop).not.toHaveBeenCalled();
  });

  it('SignalR: a print-only subscriber opens the connection without sending a scope, gets each result once, and closes after', async () => {
    const hub = fakeHub();
    let timers: { fn: () => void; ms: number }[] = [];
    const svc = createSignalRLiveUpdateService({
      hubUrl: 'https://api.example/hubs/live', buildConnection: () => hub as unknown as HubConnectionLike,
      setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: t => { timers = timers.filter(x => x !== t); },
      random: () => 0.5, log: () => {},
    });
    const got = vi.fn();
    const sub = svc.subscribePrintJobs(got);
    await flush();
    expect(hub.start).toHaveBeenCalledTimes(1);
    expect(hub.invoke).not.toHaveBeenCalled();
    hub.emit(HUB_PRINT_JOB_STATUS, printEvent());
    hub.emit(HUB_PRINT_JOB_STATUS, printEvent());          // redelivered
    hub.emit(HUB_PRINT_JOB_STATUS, { ...printEvent(), eventId: 'p2', status: 'NOPE' });
    expect(got).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
    timers.find(t => t.ms === CLOSE_GRACE_MS)!.fn();
    expect(hub.stop).toHaveBeenCalled();
  });

  it('SignalR: an intraop screen leaving keeps the connection for a waiting print job', async () => {
    const hub = fakeHub();
    let timers: { fn: () => void; ms: number }[] = [];
    const svc = createSignalRLiveUpdateService({
      hubUrl: 'https://api.example/hubs/live', buildConnection: () => hub as unknown as HubConnectionLike,
      setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: t => { timers = timers.filter(x => x !== t); },
      random: () => 0.5, log: () => {},
    });
    svc.subscribePrintJobs(vi.fn());
    const board = svc.subscribeIntraop({ locationIds: ['loc-A'], all: false }, vi.fn());
    await flush();
    board.unsubscribe();
    await flush();
    expect(timers.some(t => t.ms === CLOSE_GRACE_MS)).toBe(false);
    expect(hub.invoke).toHaveBeenLastCalledWith(HUB_SET_INTRAOP_SCOPE, { locationIds: [], all: false });
  });
});

describe('the mock intraop service publishes each write (as the API server will)', () => {
  it('announces a new session with ids only (no patient name or MRN)', async () => {
    const { localLiveUpdateService } = await import('./localLiveUpdateService');
    const { mockIntraoperativeService } = await import('../intraop/mockIntraoperativeService');
    const received: IntraopChangedEvent[] = [];
    const sub = localLiveUpdateService.subscribeIntraop({ locationIds: [], all: true }, e => received.push(e));
    const res = await mockIntraoperativeService.createSession({
      patientMatch: { source: 'barcode', patientName: 'Test, Patient', mrn: 'MRN-LIVE-1' },
      performedBy: { userId: 'u1', userName: 'Dr One' }, orNumber: 'OR-9', surgeon: 'Dr Two', locationId: 'loc-live-test',
    });
    expect(res.ok).toBe(true);
    const created = received.find(e => e.kind === 'session.created');
    expect(created).toMatchObject({ v: 1, sessionId: res.ok ? res.data.id : '', locationId: 'loc-live-test' });
    expect(JSON.stringify(created)).not.toContain('Test, Patient');
    expect(JSON.stringify(created)).not.toContain('MRN-LIVE-1');
    sub.unsubscribe();
  });
});
