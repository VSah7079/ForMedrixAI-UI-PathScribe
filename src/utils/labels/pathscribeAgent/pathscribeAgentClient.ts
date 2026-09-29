// src/utils/labels/pathscribeAgent/pathscribeAgentClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-52: PathScribe's client for the PathScribe Agent (agentProtocol.ts).
//
//   discover()   tries wss://127.0.0.1:9100, then 9101, then 9102, and keeps
//                the first port whose listener answers PING with a
//                PathScribe Agent PONG. A printer or another service on
//                9100 won't, so it is skipped. A port configured on the
//                printer profile (Batch 346) is tried first.
//   printZpl()   sends PRINT_LOCAL_LABEL with a new jobId and resolves when
//                the agent reports PRINT_SUCCESS or PRINT_ERROR for that
//                jobId. The agent's own FIFO queue and printer lock keep
//                jobs from several tabs apart; this client only waits for
//                its own job. Along the way it reports the job's progress
//                (sending, queued with jobs ahead, printing, done/failed)
//                through onJobStatus (Batch 346); the shared client feeds
//                printJobStatus.ts, which the on-screen indicator reads.
//   getPrinters(), getCapabilities()
//
// Secure WebSocket only (Batch 327): a browser can't tell PathScribe why
// a wss:// connection failed, so an untrusted certificate looks the same
// as no agent and is reported as AGENT_NOT_FOUND.
//
// If the socket drops, the next call discovers the agent again (it may
// have restarted on a different port). The socket factory is injected, so
// the client is tested with a fake agent and no network.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AGENT_PORTS, PROTOCOL_VERSION, agentPortOrder, agentUrl, isAgentHandshake, parseAgentMessage,
  type AgentMessage, type AgentRequest, type AgentPrinter, type AgentCapabilities, type AgentErrorCode,
} from './agentProtocol';
import { agentPrintJobs } from './printJobStatus';

/** The part of the browser WebSocket this client uses. */
export interface AgentSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export type AgentClientError = AgentErrorCode | 'AGENT_NOT_FOUND' | 'AGENT_TIMEOUT' | 'AGENT_DISCONNECTED';
export type AgentResult<T> = { ok: true; data: T } | { ok: false; error: AgentClientError; message?: string };

/** Where a print job is (Batch 346). 'printing' needs an agent that sends
 *  the optional PRINT_STARTED; otherwise a job goes queued → done. */
export type AgentJobPhase = 'sending' | 'queued' | 'printing' | 'done' | 'failed';
export interface AgentJobStatusUpdate {
  jobId: string;
  printerName: string;
  phase: AgentJobPhase;
  /** Jobs ahead of this one, when phase is 'queued' (0 = prints next). */
  position?: number;
}

export interface PrintZplOptions {
  idempotencyKey?: string;
  /** The port the printer profile says the agent is on; tried first. */
  preferredPort?: number | null;
}

export interface AgentClientOptions {
  openSocket?: (url: string) => AgentSocket;
  ports?: readonly number[];
  /** Per-port handshake wait. */
  handshakeTimeoutMs?: number;
  /** Wait for a request's reply (printers, capabilities). */
  requestTimeoutMs?: number;
  /** Wait for a print job's outcome, queue time included. */
  printTimeoutMs?: number;
  newId?: () => string;
  /** Told about each print job's progress (Batch 346). */
  onJobStatus?: (update: AgentJobStatusUpdate) => void;
}

export interface PathScribeAgentClient {
  /** preferredPort, if valid, is tried before 9100–9102. */
  discover(preferredPort?: number | null): Promise<AgentResult<{ port: number; version: string }>>;
  getPrinters(): Promise<AgentResult<AgentPrinter[]>>;
  getCapabilities(printerName: string): Promise<AgentResult<AgentCapabilities>>;
  printZpl(printerName: string, zpl: string, copies: number, options?: PrintZplOptions): Promise<AgentResult<{ jobId: string }>>;
  /** The ports the last failed discovery tried, for the error message. */
  portsTried(preferredPort?: number | null): number[];
  /** The port found by the last discover(), if still connected. */
  connectedPort(): number | null;
  close(): void;
}

const defaultOpen = (url: string): AgentSocket => new WebSocket(url) as unknown as AgentSocket;
const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function createPathScribeAgentClient(opts: AgentClientOptions = {}): PathScribeAgentClient {
  const openSocket = opts.openSocket ?? defaultOpen;
  const ports = opts.ports ?? AGENT_PORTS;
  const handshakeMs = opts.handshakeTimeoutMs ?? 1500;
  const requestMs = opts.requestTimeoutMs ?? 5000;
  const printMs = opts.printTimeoutMs ?? 60000;
  const newId = opts.newId ?? defaultId;
  const onJobStatus = opts.onJobStatus ?? (() => {});
  const order = (preferred?: number | null) => agentPortOrder(preferred, ports);

  let socket: AgentSocket | null = null;
  let port: number | null = null;
  let version = '';
  /** Waiters keyed by requestId or jobId. */
  const waiters = new Map<string, (msg: AgentMessage | 'closed') => void>();

  const attach = (s: AgentSocket, p: number) => {
    socket = s; port = p;
    s.onmessage = ev => {
      const msg = parseAgentMessage(ev.data);
      if (!msg) return;
      const key = msg.type === 'PRINT_STARTED' || msg.type === 'PRINT_SUCCESS' || msg.type === 'PRINT_ERROR'
        ? msg.jobId : ('requestId' in msg ? msg.requestId : undefined);
      if (key && waiters.has(key)) waiters.get(key)!(msg);
    };
    s.onclose = () => {
      socket = null; port = null;
      for (const w of [...waiters.values()]) w('closed');
      waiters.clear();
    };
  };

  /** Opens one port and completes the PING/PONG handshake, or null. */
  const tryPort = (p: number): Promise<{ socket: AgentSocket; version: string } | null> => new Promise(resolve => {
    let s: AgentSocket;
    try { s = openSocket(agentUrl(p)); } catch { resolve(null); return; }
    const requestId = newId();
    let settled = false;
    const finish = (ok: boolean, v = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) resolve({ socket: s, version: v });
      else { try { s.close(); } catch { /* already closed */ } resolve(null); }
    };
    const timer = setTimeout(() => finish(false), handshakeMs);
    s.onopen = () => s.send(JSON.stringify({ type: 'PING', requestId, protocolVersion: PROTOCOL_VERSION } satisfies AgentRequest));
    s.onmessage = ev => {
      const msg = parseAgentMessage(ev.data);
      if (isAgentHandshake(msg, requestId)) finish(true, (msg as Extract<AgentMessage, { type: 'PONG' }>).version);
      else finish(false);
    };
    s.onerror = () => finish(false);
    s.onclose = () => finish(false);
  });

  const discover: PathScribeAgentClient['discover'] = async preferredPort => {
    // Already connected: that listener proved it is the agent, whichever
    // port it is on.
    if (socket && port !== null) return { ok: true, data: { port, version } };
    for (const p of order(preferredPort)) {
      const found = await tryPort(p);
      if (found) {
        version = found.version;
        attach(found.socket, p);
        return { ok: true, data: { port: p, version } };
      }
    }
    return { ok: false, error: 'AGENT_NOT_FOUND' };
  };

  /** Sends a request and waits for the first message keyed by `key` that
   *  `accept` turns into a result. */
  const exchange = async <T>(
    request: AgentRequest,
    key: string,
    timeoutMs: number,
    accept: (msg: AgentMessage) => AgentResult<T> | 'wait',
    preferredPort?: number | null,
  ): Promise<AgentResult<T>> => {
    const found = await discover(preferredPort);
    if (found.ok === false) return { ok: false, error: found.error };
    return new Promise(resolve => {
      const done = (r: AgentResult<T>) => { clearTimeout(timer); waiters.delete(key); resolve(r); };
      const timer = setTimeout(() => done({ ok: false, error: 'AGENT_TIMEOUT' }), timeoutMs);
      waiters.set(key, msg => {
        if (msg === 'closed') { done({ ok: false, error: 'AGENT_DISCONNECTED' }); return; }
        if (msg.type === 'ERROR') { done({ ok: false, error: msg.errorCode, message: msg.message }); return; }
        const r = accept(msg);
        if (r !== 'wait') done(r);
      });
      try { socket!.send(JSON.stringify(request)); } catch { done({ ok: false, error: 'AGENT_DISCONNECTED' }); }
    });
  };

  return {
    discover,
    connectedPort: () => port,
    portsTried: preferredPort => order(preferredPort),
    close: () => { try { socket?.close(); } catch { /* ignore */ } },

    getPrinters: () => {
      const requestId = newId();
      return exchange({ type: 'GET_PRINTERS', requestId }, requestId, requestMs,
        m => (m.type === 'PRINTERS' ? { ok: true, data: m.printers } : 'wait'));
    },

    getCapabilities: printerName => {
      const requestId = newId();
      return exchange({ type: 'GET_CAPABILITIES', requestId, printerName }, requestId, requestMs,
        m => (m.type === 'CAPABILITIES' ? { ok: true, data: m.capabilities } : 'wait'));
    },

    printZpl: (printerName, zpl, copies, options = {}) => {
      const jobId = newId();
      const requestId = newId();
      const status = (phase: AgentJobPhase, position?: number) =>
        onJobStatus({ jobId, printerName, phase, ...(position === undefined ? {} : { position }) });
      status('sending');
      // Keyed by jobId: PRINT_QUEUED echoes it, and PRINT_STARTED and the
      // final outcome carry only the jobId. An ERROR for the request itself
      // (bad protocol version, say) is matched through the requestId below.
      const request: AgentRequest = { type: 'PRINT_LOCAL_LABEL', requestId, jobId, idempotencyKey: options.idempotencyKey ?? jobId, printerName, zpl, copies };
      const result = exchange<{ jobId: string }>(request, jobId, printMs, m => {
        if (m.type === 'PRINT_QUEUED') { status('queued', m.position); return 'wait'; }
        if (m.type === 'PRINT_STARTED') { status('printing'); return 'wait'; }
        if (m.type === 'PRINT_SUCCESS') return { ok: true, data: { jobId } };
        if (m.type === 'PRINT_ERROR') return { ok: false, error: m.errorCode, message: m.message };
        return 'wait';
      }, options.preferredPort);
      // Route a request-level ERROR (which carries requestId, not jobId)
      // to the job's waiter.
      waiters.set(requestId, msg => waiters.get(jobId)?.(msg));
      return result.finally(() => waiters.delete(requestId)).then(r => { status(r.ok === true ? 'done' : 'failed'); return r; });
    },
  };
}

/** The app's shared client: one agent connection per browser tab. Its job
 *  progress goes to the shared status store the on-screen indicator reads. */
let shared: PathScribeAgentClient | null = null;
export function getPathScribeAgentClient(): PathScribeAgentClient {
  shared ??= createPathScribeAgentClient({ onJobStatus: u => agentPrintJobs.update(u) });
  return shared;
}
