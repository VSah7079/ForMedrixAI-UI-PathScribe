// src/utils/labels/pathscribeAgent/pathscribeAgentClient.test.ts — PS-52 client, against a fake agent.
import { describe, it, expect } from 'vitest';
import { createPathScribeAgentClient, type AgentSocket, type AgentJobStatusUpdate } from './pathscribeAgentClient';
import { parseAgentMessage, isAgentHandshake, agentUrl, agentPortOrder, isValidAgentPort, AGENT_IDENTITY, AGENT_PORTS, PROTOCOL_VERSION } from './agentProtocol';
import { dispatchZplLabel } from '../dispatchZplLabel';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

type Listener = { port: number; kind: 'agent' | 'printer' | 'closed'; agentVersion?: number };

/** A fake loopback: each port is empty, a raw printer (accepts the socket
 *  but never answers), or a PathScribe Agent with one FIFO print queue. */
function fakeLoopback(listeners: Listener[], agentBehaviour: { printOutcome?: (zpl: string) => { errorCode?: string }; sendsStarted?: boolean } = {}) {
  const opened: string[] = [];
  const sockets: FakeSocket[] = [];
  const printed: string[] = [];
  class FakeSocket implements AgentSocket {
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    constructor(readonly listener: Listener | undefined) {
      setTimeout(() => {
        if (!listener || listener.kind === 'closed') { this.onerror?.(); this.onclose?.(); return; }
        this.onopen?.();
      }, 0);
    }
    reply(msg: object) { setTimeout(() => !this.closed && this.onmessage?.({ data: JSON.stringify(msg) }), 0); }
    send(data: string) {
      if (this.listener?.kind !== 'agent') return; // a printer just swallows bytes
      const m = JSON.parse(data);
      if (m.type === 'PING') this.reply({ type: 'PONG', requestId: m.requestId, agent: AGENT_IDENTITY, version: '1.0.0', protocolVersion: this.listener.agentVersion ?? PROTOCOL_VERSION, port: this.listener.port });
      if (m.type === 'GET_PRINTERS') this.reply({ type: 'PRINTERS', requestId: m.requestId, printers: [{ name: 'ZD421', isDefault: true, connection: 'usb' }] });
      if (m.type === 'PRINT_LOCAL_LABEL') {
        this.reply({ type: 'PRINT_QUEUED', requestId: m.requestId, jobId: m.jobId, position: 1 });
        // an unrelated job's outcome arriving first must be ignored
        this.reply({ type: 'PRINT_SUCCESS', jobId: 'someone-elses-job' });
        if (agentBehaviour.sendsStarted) this.reply({ type: 'PRINT_STARTED', jobId: m.jobId });
        const outcome = agentBehaviour.printOutcome?.(m.zpl) ?? {};
        if (outcome.errorCode) this.reply({ type: 'PRINT_ERROR', jobId: m.jobId, errorCode: outcome.errorCode });
        else { printed.push(m.zpl); this.reply({ type: 'PRINT_SUCCESS', jobId: m.jobId }); }
      }
    }
    close() { if (this.closed) return; this.closed = true; setTimeout(() => this.onclose?.(), 0); }
  }
  let n = 0;
  const statuses: AgentJobStatusUpdate[] = [];
  const client = createPathScribeAgentClient({
    onJobStatus: u => statuses.push(u),
    openSocket: url => {
      opened.push(url);
      const port = Number(url.split(':').pop());
      const s = new FakeSocket(listeners.find(l => l.port === port));
      sockets.push(s);
      return s;
    },
    handshakeTimeoutMs: 30,
    requestTimeoutMs: 100,
    printTimeoutMs: 100,
    newId: () => `id${n++}`,
  });
  return { client, opened, sockets, printed, statuses };
}

describe('agentProtocol', () => {
  it('connects over secure WebSocket to loopback only (Batch 327)', () => {
    expect(agentUrl(9100)).toBe('wss://127.0.0.1:9100');
    for (const port of AGENT_PORTS) expect(agentUrl(port).startsWith('wss://127.0.0.1:')).toBe(true);
  });

  it('custom port (Batch 346): tried first when valid, never twice', () => {
    expect(agentPortOrder()).toEqual([9100, 9101, 9102]);
    expect(agentPortOrder(9200)).toEqual([9200, 9100, 9101, 9102]);
    expect(agentPortOrder(9101)).toEqual([9101, 9100, 9102]);
    expect(agentPortOrder(80)).toEqual([9100, 9101, 9102]);
    expect([1024, 9200, 65535].every(isValidAgentPort)).toBe(true);
    expect([1023, 65536, 9200.5, '9200', null].some(isValidAgentPort)).toBe(false);
  });

  it('parses the optional PRINT_STARTED, and refuses a negative queue position', () => {
    expect(parseAgentMessage({ type: 'PRINT_STARTED', jobId: 'j' })).toEqual({ type: 'PRINT_STARTED', jobId: 'j' });
    expect(parseAgentMessage({ type: 'PRINT_STARTED' })).toBeNull();
    expect(parseAgentMessage({ type: 'PRINT_QUEUED', requestId: 'r', jobId: 'j', position: 0 })).toMatchObject({ position: 0 });
    expect(parseAgentMessage({ type: 'PRINT_QUEUED', requestId: 'r', jobId: 'j', position: -1 })).toBeNull();
  });

  it('ignores malformed or unknown messages', () => {
    expect(parseAgentMessage('not json')).toBeNull();
    expect(parseAgentMessage({ type: 'PONG' })).toBeNull();
    expect(parseAgentMessage({ type: 'SOMETHING' })).toBeNull();
    expect(parseAgentMessage({ type: 'PRINT_SUCCESS', jobId: 'j' })).toEqual({ type: 'PRINT_SUCCESS', jobId: 'j' });
  });
  it('accepts only a PathScribe Agent PONG for the same request and protocol version', () => {
    const pong = (over = {}) => parseAgentMessage({ type: 'PONG', requestId: 'r', agent: AGENT_IDENTITY, version: '1', protocolVersion: PROTOCOL_VERSION, port: 9101, ...over });
    expect(isAgentHandshake(pong(), 'r')).toBe(true);
    expect(isAgentHandshake(pong({ agent: 'zebra-browser-print' }), 'r')).toBe(false);
    expect(isAgentHandshake(pong({ protocolVersion: 99 }), 'r')).toBe(false);
    expect(isAgentHandshake(pong(), 'other')).toBe(false);
  });
});

describe('discover', () => {
  it('skips a raw printer on 9100 and finds the agent on 9101', async () => {
    const { client, opened } = fakeLoopback([{ port: 9100, kind: 'printer' }, { port: 9101, kind: 'agent' }]);
    expect(await client.discover()).toEqual({ ok: true, data: { port: 9101, version: '1.0.0' } });
    expect(opened).toEqual(['wss://127.0.0.1:9100', 'wss://127.0.0.1:9101']);
    expect(client.connectedPort()).toBe(9101);
  });

  it('falls back to 9102 when nothing listens on 9100 and 9101', async () => {
    const { client } = fakeLoopback([{ port: 9102, kind: 'agent' }]);
    expect((await client.discover()).ok).toBe(true);
    expect(client.connectedPort()).toBe(9102);
  });

  it('reports AGENT_NOT_FOUND when no port has the agent', async () => {
    const { client } = fakeLoopback([{ port: 9100, kind: 'printer' }]);
    expect(await client.discover()).toEqual({ ok: false, error: 'AGENT_NOT_FOUND' });
  });

  it('refuses an agent speaking another protocol version', async () => {
    const { client } = fakeLoopback([{ port: 9100, kind: 'agent', agentVersion: 2 }]);
    expect(await client.discover()).toEqual({ ok: false, error: 'AGENT_NOT_FOUND' });
  });

  it('tries a configured port first (Batch 346)', async () => {
    const { client, opened } = fakeLoopback([{ port: 9100, kind: 'printer' }, { port: 9200, kind: 'agent' }]);
    expect(await client.discover(9200)).toEqual({ ok: true, data: { port: 9200, version: '1.0.0' } });
    expect(opened).toEqual(['wss://127.0.0.1:9200']);
  });

  it('falls back to the standard ports when the configured one has no agent', async () => {
    const { client, opened } = fakeLoopback([{ port: 9101, kind: 'agent' }]);
    expect((await client.discover(9200)).ok).toBe(true);
    expect(opened).toEqual(['wss://127.0.0.1:9200', 'wss://127.0.0.1:9100', 'wss://127.0.0.1:9101']);
    expect(client.portsTried(9200)).toEqual([9200, 9100, 9101, 9102]);
  });

  it('reuses the connection, and rediscovers after it drops', async () => {
    const { client, opened, sockets } = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    await client.discover();
    await client.discover();
    expect(opened).toHaveLength(1);
    sockets[0].close();
    await new Promise(r => setTimeout(r, 5));
    expect(client.connectedPort()).toBeNull();
    await client.discover();
    expect(opened).toHaveLength(2);
  });
});

describe('printZpl', () => {
  it('resolves on PRINT_SUCCESS for its own jobId only', async () => {
    const { client, printed } = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    const res = await client.printZpl('ZD421', '^XA^XZ', 1);
    expect(res.ok).toBe(true);
    expect(printed).toEqual(['^XA^XZ']);
  });

  it('returns the agent\'s PRINT_ERROR code', async () => {
    const { client } = fakeLoopback([{ port: 9100, kind: 'agent' }], { printOutcome: () => ({ errorCode: 'PAPER_OUT' }) });
    expect(await client.printZpl('ZD421', '^XA^XZ', 1)).toMatchObject({ ok: false, error: 'PAPER_OUT' });
  });

  it('keeps concurrent jobs apart', async () => {
    const { client, printed } = fakeLoopback([{ port: 9100, kind: 'agent' }], { printOutcome: zpl => (zpl === 'B' ? { errorCode: 'HEAD_OPEN' } : {}) });
    const [a, b, c] = await Promise.all([client.printZpl('P', 'A', 1), client.printZpl('P', 'B', 1), client.printZpl('P', 'C', 1)]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, false, true]);
    expect(printed).toEqual(['A', 'C']);
  });

  it('times out when the agent never answers, and reports a dropped connection', async () => {
    const quiet = fakeLoopback([{ port: 9100, kind: 'agent' }], { printOutcome: () => ({ errorCode: '' }) });
    await quiet.client.discover();
    quiet.sockets[0].send = () => {}; // agent goes silent
    expect(await quiet.client.printZpl('P', 'A', 1)).toEqual({ ok: false, error: 'AGENT_TIMEOUT' });

    const dropping = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    await dropping.client.discover();
    dropping.sockets[0].send = () => { dropping.sockets[0].close(); };
    expect(await dropping.client.printZpl('P', 'A', 1)).toEqual({ ok: false, error: 'AGENT_DISCONNECTED' });
  });

  it('reports each job\'s progress: sending, queued, printing, done (Batch 346)', async () => {
    const { client, statuses } = fakeLoopback([{ port: 9100, kind: 'agent' }], { sendsStarted: true });
    const res = await client.printZpl('ZD421', '^XA^XZ', 1);
    const jobId = res.ok === true ? res.data.jobId : '';
    expect(statuses).toEqual([
      { jobId, printerName: 'ZD421', phase: 'sending' },
      { jobId, printerName: 'ZD421', phase: 'queued', position: 1 },
      { jobId, printerName: 'ZD421', phase: 'printing' },
      { jobId, printerName: 'ZD421', phase: 'done' },
    ]);
  });

  it('without PRINT_STARTED a job goes from queued to done; a failure is reported as failed', async () => {
    const plain = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    await plain.client.printZpl('P', 'A', 1);
    expect(plain.statuses.map(s => s.phase)).toEqual(['sending', 'queued', 'done']);
    const none = fakeLoopback([]);
    await none.client.printZpl('P', 'A', 1);
    expect(none.statuses.map(s => s.phase)).toEqual(['sending', 'failed']);
  });

  it('passes the preferred port through to discovery', async () => {
    const { client, opened } = fakeLoopback([{ port: 9300, kind: 'agent' }]);
    expect((await client.printZpl('P', 'A', 1, { preferredPort: 9300 })).ok).toBe(true);
    expect(opened).toEqual(['wss://127.0.0.1:9300']);
  });

  it('lists printers', async () => {
    const { client } = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    expect(await client.getPrinters()).toEqual({ ok: true, data: [{ name: 'ZD421', isDefault: true, connection: 'usb' }] });
  });
});

describe('dispatchZplLabel with a pathscribe_agent printer', () => {
  const printer = { printerId: 'ZD421', bridgeType: 'pathscribe_agent' } as PrinterProfile;

  it('prints through the agent', async () => {
    const { client, printed } = fakeLoopback([{ port: 9100, kind: 'agent' }]);
    expect(await dispatchZplLabel(printer, '^XA^XZ', 2, client)).toEqual({ ok: true });
    expect(printed).toEqual(['^XA^XZ']);
  });

  it('explains a missing agent and a printer fault in plain English', async () => {
    const none = fakeLoopback([]);
    expect(await dispatchZplLabel(printer, '^XA^XZ', 1, none.client)).toEqual({ ok: false, message: expect.stringContaining('not running on this workstation') });
    // Batch 346: the message names the ports actually tried, the configured one first.
    const custom = fakeLoopback([]);
    const r = await dispatchZplLabel({ ...printer, agentPort: 9200 }, '^XA^XZ', 1, custom.client);
    expect(r).toEqual({ ok: false, message: expect.stringContaining('9200, 9100, 9101, and 9102') });
    expect(custom.opened[0]).toBe('wss://127.0.0.1:9200');
    const paper = fakeLoopback([{ port: 9100, kind: 'agent' }], { printOutcome: () => ({ errorCode: 'PAPER_OUT' }) });
    expect(await dispatchZplLabel(printer, '^XA^XZ', 1, paper.client)).toEqual({ ok: false, message: 'The label printer is out of labels.' });
  });
});
