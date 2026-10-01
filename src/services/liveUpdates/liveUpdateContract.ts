// src/services/liveUpdates/liveUpdateContract.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: the wire contract between PathScribe's browser clients and the
// live-update hub on the PathScribe API server (ASP.NET Core SignalR;
// Pete, Sep 26, 2026). This file is the source of truth for the .NET
// side; docs/architecture/LIVE_UPDATES_SIGNALR.md describes the hub.
//
// Batch 346→347 (PS-54): a second event, PrintJobStatus, tells the user
// who sent a network print job what the interface engine reported (printed,
// or why not). It goes only to that user's connections, so it needs no scope.
//
// Events carry identifiers only — never patient names, MRNs or diagnoses.
// OR wall displays are shared screens, and a client that receives an
// event re-reads the data through the normal (authorised) service call,
// so an event never grants access to anything.
// ─────────────────────────────────────────────────────────────────────────────

/** Hub path on the API server, relative to its base URL. */
export const LIVE_UPDATES_HUB_PATH = '/hubs/live';

/** Contract version carried on every event; a client ignores other versions. */
export const LIVE_UPDATES_CONTRACT_VERSION = 1;

/** Client → server: replace this connection's intraoperative scope. */
export const HUB_SET_INTRAOP_SCOPE = 'SetIntraopScope';
/** Server → client: an intraoperative session or specimen changed. */
export const HUB_INTRAOP_CHANGED = 'IntraopChanged';

/** What changed. The server sends one event per committed write. */
export type IntraopChangeKind =
  | 'session.created'      // a new frozen-section session (Intraop Queue)
  | 'specimen.added'       // a specimen added to a session
  | 'specimen.progressed'  // milestone, preparation output or image recorded
  | 'diagnosis.rendered'   // the frozen-section diagnosis was entered
  | 'verbal.reported'      // the verbal report to the surgeon was logged
  | 'specimen.dismissed'   // dismissed from the OR board
  | 'session.merged';      // merged into a case (leaves the boards)

export const INTRAOP_CHANGE_KINDS: readonly IntraopChangeKind[] = [
  'session.created', 'specimen.added', 'specimen.progressed', 'diagnosis.rendered',
  'verbal.reported', 'specimen.dismissed', 'session.merged',
];

export interface IntraopChangedEvent {
  v: typeof LIVE_UPDATES_CONTRACT_VERSION;
  /** Unique per event (the server's outbox row id); lets clients drop duplicates. */
  eventId: string;
  kind: IntraopChangeKind;
  sessionId: string;
  specimenId?: string;
  /** The session's OR location, when it has one. Boards subscribe by location. */
  locationId?: string;
  facilityId?: string;
  /** Server commit time (ISO 8601, UTC). */
  occurredAt: string;
}

/**
 * A connection's subscription. `locationIds` are the OR locations whose
 * boards it shows; `all` asks for every intraoperative change in the
 * tenant (the Intraop Queue). The server narrows both to what the
 * connection is authorised to see and replies with what it accepted.
 */
export interface IntraopScope {
  locationIds: string[];
  all: boolean;
}

export interface SetIntraopScopeResult {
  acceptedLocationIds: string[];
  rejectedLocationIds: string[];
  all: boolean;
}

/** Validates an event received from the wire; anything else is ignored. */
export function parseIntraopChangedEvent(raw: unknown): IntraopChangedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== LIVE_UPDATES_CONTRACT_VERSION) return null;
  if (typeof e.eventId !== 'string' || !e.eventId) return null;
  if (typeof e.sessionId !== 'string' || !e.sessionId) return null;
  if (typeof e.kind !== 'string' || !(INTRAOP_CHANGE_KINDS as readonly string[]).includes(e.kind)) return null;
  if (typeof e.occurredAt !== 'string') return null;
  for (const k of ['specimenId', 'locationId', 'facilityId'] as const) {
    if (e[k] !== undefined && typeof e[k] !== 'string') return null;
  }
  return {
    v: LIVE_UPDATES_CONTRACT_VERSION,
    eventId: e.eventId,
    kind: e.kind as IntraopChangeKind,
    sessionId: e.sessionId,
    ...(e.specimenId ? { specimenId: e.specimenId as string } : {}),
    ...(e.locationId ? { locationId: e.locationId as string } : {}),
    ...(e.facilityId ? { facilityId: e.facilityId as string } : {}),
    occurredAt: e.occurredAt,
  };
}


// ── Network print results (Batch 347, PS-54) ────────────────────────────────

/** Server → client: the interface engine reported on a network print job. */
export const HUB_PRINT_JOB_STATUS = 'PrintJobStatus';

/** What the engine can report (the NetworkPrintCallback statuses). */
export const PRINT_JOB_STATUSES = [
  'PRINT_SUCCESS', 'PRINTER_UNREACHABLE', 'PAPER_OUT', 'RIBBON_OUT', 'HEAD_OPEN', 'MALFORMED_ZPL', 'INVALID_GS1',
] as const;
export type PrintJobStatusCode = typeof PRINT_JOB_STATUSES[number];

export interface PrintJobStatusEvent {
  v: typeof LIVE_UPDATES_CONTRACT_VERSION;
  /** Unique per event (the server's outbox row id); lets clients drop duplicates. */
  eventId: string;
  /** The job's eventId from the NetworkPrintPayload the browser sent. */
  jobId: string;
  /** The payload's idempotencyKey (the same for every attempt at one label). */
  idempotencyKey: string;
  status: PrintJobStatusCode;
  /** The engine's own wording, for the audit trail. Printer text only, never PHI. */
  printerResponse?: string;
  durationMs?: number;
  /** When the engine reported (ISO 8601, UTC). */
  occurredAt: string;
}

/** Validates a print result received from the wire; anything else is ignored. */
export function parsePrintJobStatusEvent(raw: unknown): PrintJobStatusEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== LIVE_UPDATES_CONTRACT_VERSION) return null;
  for (const k of ['eventId', 'jobId', 'idempotencyKey', 'occurredAt'] as const) {
    if (typeof e[k] !== 'string' || !e[k]) return null;
  }
  if (typeof e.status !== 'string' || !(PRINT_JOB_STATUSES as readonly string[]).includes(e.status)) return null;
  if (e.printerResponse !== undefined && typeof e.printerResponse !== 'string') return null;
  if (e.durationMs !== undefined && (typeof e.durationMs !== 'number' || !Number.isFinite(e.durationMs))) return null;
  return {
    v: LIVE_UPDATES_CONTRACT_VERSION,
    eventId: e.eventId as string,
    jobId: e.jobId as string,
    idempotencyKey: e.idempotencyKey as string,
    status: e.status as PrintJobStatusCode,
    ...(typeof e.printerResponse === 'string' ? { printerResponse: e.printerResponse } : {}),
    ...(typeof e.durationMs === 'number' ? { durationMs: e.durationMs } : {}),
    occurredAt: e.occurredAt as string,
  };
}
