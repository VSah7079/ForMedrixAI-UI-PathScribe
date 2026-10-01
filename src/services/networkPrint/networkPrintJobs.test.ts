// src/services/networkPrint/networkPrintJobs.test.ts — Batch 347 (PS-54)
import { describe, it, expect } from 'vitest';
import type { NewAuditLog } from '../auditlog/IAuditService';
import type { PrintJobStatusEvent } from '../liveUpdates/liveUpdateContract';
import type { NetworkPrintPayload } from '@/types/printing/NetworkPrintPayload';
import { createNetworkPrintJobTracker, describeNetworkPrintJob, isRetryable, PRINTED_DISPLAY_MS, REPLY_TIMEOUT_MS } from './networkPrintJobs';
import { canSimulatePrintResults } from './networkPrintJobsInstance';

const payload = (id = 'EVT-S26-1-a'): NetworkPrintPayload => ({
  eventId: id, idempotencyKey: id, action: 'PRINT_NETWORK_LABEL', timestamp: '2026-09-26T12:00:00Z', templateVersion: 'ZPL-CASSETTE-V3',
  callbackUrl: '/api/print/callbacks', targetPrinter: { printerId: 'ZT411-GROSS', ipAddress: '10.0.0.5', port: 9100, vendor: 'ZEBRA_ZPL' },
  labelData: { labelType: 'CASSETTE', accessionNumber: 'S26-1', specimenDesignator: 'A', blockId: 'A1', patientName: 'DOE, J', gs1DataMatrix: 'x' },
  copies: 1, attempt: 1,
});
const result = (jobId: string, status: PrintJobStatusEvent['status'], over: Partial<PrintJobStatusEvent> = {}): PrintJobStatusEvent => ({
  v: 1, eventId: `hub-${Math.random()}`, jobId, idempotencyKey: jobId.replace(/-R\d+$/, ''), status, printerResponse: 'r', durationMs: 12, occurredAt: '2026-09-26T12:00:01Z', ...over,
});

function setup(opts: { simulate?: boolean } = {}) {
  const sent: NetworkPrintPayload[] = [];
  const audit: NewAuditLog[] = [];
  const subs: ((e: PrintJobStatusEvent) => void)[] = [];
  let unsubscribed = 0;
  let timers: { fn: () => void; ms: number }[] = [];
  const simulated: unknown[] = [];
  const tracker = createNetworkPrintJobTracker({
    dispatch: async p => { sent.push(p); },
    audit: { logEvent: async e => { audit.push(e); } },
    subscribeResults: onEvent => { subs.push(onEvent); return { unsubscribe: () => { unsubscribed++; subs.splice(subs.indexOf(onEvent), 1); } }; },
    simulate: opts.simulate ? r => { simulated.push(r); } : undefined,
    currentUserName: () => 'Sarah Chen',
    now: () => new Date('2026-09-26T12:00:00Z'),
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer: t => { timers = timers.filter(x => x !== t); },
  });
  const fire = (ms: number) => { const due = timers.filter(t => t.ms === ms); timers = timers.filter(t => t.ms !== ms); due.forEach(t => t.fn()); };
  return { tracker, sent, audit, subs, simulated, fire, unsubscribedCount: () => unsubscribed, timers: () => timers };
}

describe('network print jobs', () => {
  it('sends, listens only while waiting, and shows a printed label briefly', async () => {
    const t = setup();
    await t.tracker.send(payload());
    expect(t.sent).toHaveLength(1);
    expect(t.subs).toHaveLength(1);
    expect(t.tracker.getSnapshot()[0]).toMatchObject({ state: 'waiting', printerId: 'ZT411-GROSS', labelId: 'A1', attempt: 1 });
    t.subs[0](result('EVT-S26-1-a', 'PRINT_SUCCESS'));
    expect(t.tracker.getSnapshot()[0].state).toBe('printed');
    expect(t.unsubscribedCount()).toBe(1); // nothing waiting any more
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Network Print Succeeded', caseId: 'S26-1' });
    t.fire(PRINTED_DISPLAY_MS);
    expect(t.tracker.getSnapshot()).toEqual([]);
  });

  it('a failure stays with its reason until retried or dismissed; a duplicate answer changes nothing', async () => {
    const t = setup();
    await t.tracker.send(payload());
    t.subs[0](result('EVT-S26-1-a', 'PAPER_OUT'));
    expect(t.tracker.getSnapshot()[0]).toMatchObject({ state: 'failed', errorCode: 'PAPER_OUT' });
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Network Print Failed' });
    expect(t.tracker.handleResult(result('EVT-S26-1-a', 'PRINT_SUCCESS'))).toBe('stale');
    expect(t.tracker.getSnapshot()[0].state).toBe('failed');
    t.tracker.dismiss('EVT-S26-1-a');
    expect(t.tracker.getSnapshot()).toEqual([]);
  });

  it('retry: same idempotency key, new event id and attempt, audited with who retried; the old attempt\'s late answer is ignored', async () => {
    const t = setup();
    await t.tracker.send(payload());
    t.subs[0](result('EVT-S26-1-a', 'PRINTER_UNREACHABLE'));
    const r = await t.tracker.retry('EVT-S26-1-a');
    expect(r).toEqual({ ok: true, jobId: 'EVT-S26-1-a-R2' });
    expect(t.sent[1]).toMatchObject({ eventId: 'EVT-S26-1-a-R2', idempotencyKey: 'EVT-S26-1-a', attempt: 2 });
    expect(t.tracker.getSnapshot()).toHaveLength(1);
    expect(t.tracker.getSnapshot()[0]).toMatchObject({ jobId: 'EVT-S26-1-a-R2', state: 'waiting', attempt: 2 });
    expect(t.audit.find(a => a.event === 'Network Print Retried')).toMatchObject({ user: 'Sarah Chen', type: 'user', caseId: 'S26-1' });
    expect(t.tracker.handleResult(result('EVT-S26-1-a', 'PRINT_SUCCESS'))).toBe('stale');
    t.subs[0](result('EVT-S26-1-a-R2', 'PRINT_SUCCESS'));
    expect(t.tracker.getSnapshot()[0].state).toBe('printed');
  });

  it('no answer in time → can be retried; a waiting or printed job cannot; unknown jobs are ignored', async () => {
    const t = setup();
    await t.tracker.send(payload());
    expect(await t.tracker.retry('EVT-S26-1-a')).toEqual({ ok: false, reason: 'not_retryable' });
    t.fire(REPLY_TIMEOUT_MS);
    expect(t.tracker.getSnapshot()[0].state).toBe('noReply');
    expect(isRetryable(t.tracker.getSnapshot()[0])).toBe(true);
    expect(await t.tracker.retry('nope')).toEqual({ ok: false, reason: 'not_found' });
    expect(t.tracker.handleResult(result('someone-else', 'PRINT_SUCCESS', { idempotencyKey: 'someone-else' }))).toBe('unknown');
  });

  it('labels sent together are tracked separately', async () => {
    const t = setup();
    await t.tracker.send(payload('EVT-1'));
    await t.tracker.send(payload('EVT-2'));
    t.subs[0](result('EVT-2', 'HEAD_OPEN'));
    expect(t.tracker.getSnapshot().map(j => j.state)).toEqual(['waiting', 'failed']);
    expect(t.subs).toHaveLength(1); // still one subscription while EVT-1 waits
  });

  it('demo simulation only when allowed', async () => {
    const off = setup();
    await off.tracker.send(payload());
    expect(off.tracker.canSimulate).toBe(false);
    const on = setup({ simulate: true });
    await on.tracker.send(payload());
    on.tracker.simulateResult('EVT-S26-1-a', 'PAPER_OUT');
    expect(on.simulated).toEqual([expect.objectContaining({ jobId: 'EVT-S26-1-a', idempotencyKey: 'EVT-S26-1-a', status: 'PAPER_OUT' })]);
    expect(canSimulatePrintResults({ transport: 'local', authMode: 'demo' })).toBe(true);
    expect(canSimulatePrintResults({ transport: 'local', authMode: 'sso' })).toBe(false);
    expect(canSimulatePrintResults({ transport: 'signalr', authMode: 'demo' })).toBe(false);
  });

  it('describes each state with a translation key', () => {
    const j = { printerId: 'P', labelId: 'A1' };
    expect(describeNetworkPrintJob({ ...j, state: 'waiting', errorCode: null }).key).toBe('networkPrint.job.waiting');
    expect(describeNetworkPrintJob({ ...j, state: 'failed', errorCode: 'RIBBON_OUT' })).toEqual({ key: 'networkPrint.job.failed.RIBBON_OUT', values: { printer: 'P', label: 'A1' } });
  });
});
