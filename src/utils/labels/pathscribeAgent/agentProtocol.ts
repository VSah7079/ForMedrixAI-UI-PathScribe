// src/utils/labels/pathscribeAgent/agentProtocol.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-52: the WebSocket contract between PathScribe (in the browser) and the
// PathScribe Agent, the small background program on a lab workstation that
// prints to that workstation's USB label printer. This file is the
// PathScribe side of the contract and the reference for whoever builds the
// agent; the agent itself is a separate program (see README.md here).
//
// From Pete's design note on PS-52 (Sep 24):
//   • Ports: the agent binds 127.0.0.1 on 9100, else 9101, else 9102. 9100
//     is also the raw-printing (JetDirect) port, so PathScribe only trusts a
//     port whose listener answers PING with a PathScribe Agent PONG.
//   • Queue: the agent runs one FIFO queue across every connected tab and
//     locks the printer per job, so concurrent tabs never interleave.
//   • Callbacks: every PRINT_LOCAL_LABEL gets a jobId, and the agent reports
//     PRINT_SUCCESS or PRINT_ERROR for that jobId back to the tab that sent it.
//
// Batch 346 (dev review of PS-52, points 1 and 2):
//   • A custom port. If IT has to move the agent off 9100–9102, the printer
//     profile records the port and PathScribe tries it first
//     (agentPortOrder). The handshake rule is unchanged.
//   • PRINT_STARTED (optional). The agent may say when a queued job reaches
//     the printer, so the user sees "printing now" rather than "queued".
//     An agent that never sends it still works: the job goes from queued
//     straight to done.
// Pure: building and validating messages only, no sockets.
// ─────────────────────────────────────────────────────────────────────────────

import type { NetworkPrintErrorState } from '@/types/printing/NetworkPrintPayload';

/** Ports the agent may bind, in the order it tries them. */
export const AGENT_PORTS: readonly number[] = [9100, 9101, 9102];
/** Lowest and highest port an admin may set for the agent. Below 1024 are
 *  system ports, which the agent (running as the signed-in user) can't bind. */
export const AGENT_PORT_MIN = 1024;
export const AGENT_PORT_MAX = 65535;

/** A port the agent could be moved to. */
export function isValidAgentPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= AGENT_PORT_MIN && port <= AGENT_PORT_MAX;
}

/** The ports to try, in order: the configured one (if valid) first, then
 *  the standard ones, each once. */
export function agentPortOrder(preferred?: number | null, standard: readonly number[] = AGENT_PORTS): number[] {
  const order = isValidAgentPort(preferred) ? [preferred, ...standard] : [...standard];
  return order.filter((p, i) => order.indexOf(p) === i);
}

/** The value the agent puts in PONG.agent, so a printer or another local
 *  service listening on the same port is never mistaken for it. */
export const AGENT_IDENTITY = 'pathscribe-agent';
export const PROTOCOL_VERSION = 1;

// ── Browser → agent ──────────────────────────────────────────────────────────
export type AgentRequest =
  | { type: 'PING'; requestId: string; protocolVersion: number }
  | { type: 'GET_PRINTERS'; requestId: string }
  | { type: 'GET_CAPABILITIES'; requestId: string; printerName: string }
  | {
      type: 'PRINT_LOCAL_LABEL';
      requestId: string;
      /** Correlates PRINT_QUEUED / PRINT_SUCCESS / PRINT_ERROR. */
      jobId: string;
      /** The same logical job resent (e.g. after a dropped socket) carries
       *  the same key; the agent must not print it twice. */
      idempotencyKey: string;
      printerName: string;
      /** Raw ZPL, sent to the printer unchanged. */
      zpl: string;
      copies: number;
    };

// ── Agent → browser ──────────────────────────────────────────────────────────
export type AgentErrorCode =
  | NetworkPrintErrorState         // PRINTER_UNREACHABLE, PAPER_OUT, RIBBON_OUT, HEAD_OPEN, MALFORMED_ZPL, INVALID_GS1
  | 'PRINTER_NOT_FOUND'
  | 'UNSUPPORTED_PROTOCOL_VERSION'
  | 'AGENT_ERROR';

export interface AgentPrinter { name: string; isDefault: boolean; connection: 'usb' | 'network' | 'other' }
export interface AgentCapabilities { printerName: string; dpi: number | null; supportsRawZpl: boolean }

export type AgentMessage =
  | { type: 'PONG'; requestId: string; agent: string; version: string; protocolVersion: number; port: number }
  | { type: 'PRINTERS'; requestId: string; printers: AgentPrinter[] }
  | { type: 'CAPABILITIES'; requestId: string; capabilities: AgentCapabilities }
  /** position: how many jobs are ahead of this one (0 = it prints next). */
  | { type: 'PRINT_QUEUED'; requestId: string; jobId: string; position: number }
  /** Optional (Batch 346): the job has left the queue and is at the printer. */
  | { type: 'PRINT_STARTED'; jobId: string }
  | { type: 'PRINT_SUCCESS'; jobId: string }
  | { type: 'PRINT_ERROR'; jobId: string; errorCode: AgentErrorCode; message?: string }
  | { type: 'ERROR'; requestId?: string; errorCode: AgentErrorCode; message?: string };

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and validates one message from the agent; anything malformed
 *  or unknown is null and is ignored by the client. */
export function parseAgentMessage(raw: unknown): AgentMessage | null {
  let m: Record<string, unknown>;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object') return null;
    m = v as Record<string, unknown>;
  } catch { return null; }
  switch (m.type) {
    case 'PONG':
      return isStr(m.requestId) && isStr(m.agent) && isStr(m.version) && isNum(m.protocolVersion) && isNum(m.port)
        ? { type: 'PONG', requestId: m.requestId, agent: m.agent, version: m.version, protocolVersion: m.protocolVersion, port: m.port } : null;
    case 'PRINTERS':
      return isStr(m.requestId) && Array.isArray(m.printers)
        ? { type: 'PRINTERS', requestId: m.requestId, printers: (m.printers as AgentPrinter[]).filter(p => p && isStr(p.name)) } : null;
    case 'CAPABILITIES':
      return isStr(m.requestId) && m.capabilities && typeof m.capabilities === 'object'
        ? { type: 'CAPABILITIES', requestId: m.requestId, capabilities: m.capabilities as AgentCapabilities } : null;
    case 'PRINT_QUEUED':
      return isStr(m.requestId) && isStr(m.jobId) && isNum(m.position) && m.position >= 0
        ? { type: 'PRINT_QUEUED', requestId: m.requestId, jobId: m.jobId, position: m.position } : null;
    case 'PRINT_STARTED':
      return isStr(m.jobId) ? { type: 'PRINT_STARTED', jobId: m.jobId } : null;
    case 'PRINT_SUCCESS':
      return isStr(m.jobId) ? { type: 'PRINT_SUCCESS', jobId: m.jobId } : null;
    case 'PRINT_ERROR':
      return isStr(m.jobId) && isStr(m.errorCode)
        ? { type: 'PRINT_ERROR', jobId: m.jobId, errorCode: m.errorCode as AgentErrorCode, ...(isStr(m.message) ? { message: m.message } : {}) } : null;
    case 'ERROR':
      return isStr(m.errorCode)
        ? { type: 'ERROR', errorCode: m.errorCode as AgentErrorCode, ...(isStr(m.requestId) ? { requestId: m.requestId } : {}), ...(isStr(m.message) ? { message: m.message } : {}) } : null;
    default:
      return null;
  }
}

/** True only for a PONG from a PathScribe Agent speaking a protocol
 *  version this build understands. */
export function isAgentHandshake(msg: AgentMessage | null, requestId: string): boolean {
  return !!msg && msg.type === 'PONG' && msg.requestId === requestId
    && msg.agent === AGENT_IDENTITY && msg.protocolVersion === PROTOCOL_VERSION;
}

/** The agent's secure WebSocket address for a port. Loopback only.
 *
 *  Batch 327 (Pete: "I want to use HTTPS"): wss://, never ws://. The agent
 *  serves TLS with a certificate for 127.0.0.1 and localhost that its
 *  installer creates on that workstation and adds to the machine's trusted
 *  certificates (see README.md, "Security certificate"). There is no plain
 *  ws:// fallback, so an agent without a trusted certificate is simply not
 *  found. */
export const agentUrl = (port: number) => `wss://127.0.0.1:${port}`;
