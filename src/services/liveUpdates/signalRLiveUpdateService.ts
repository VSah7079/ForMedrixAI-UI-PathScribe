// src/services/liveUpdates/signalRLiveUpdateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: live updates from the PathScribe API server's SignalR hub
// (ASP.NET Core; see docs/architecture/LIVE_UPDATES_SIGNALR.md).
//
//   • One connection per browser window, opened on the first subscription
//     and closed a moment after the last one goes (CLOSE_GRACE_MS), so
//     moving between the board and the queue, or React re-mounting a
//     screen, reuses the connection instead of renegotiating.
//   • The window's subscriptions are combined into one scope and sent with
//     SetIntraopScope, again after every reconnection (SignalR forgets
//     group membership when a connection drops).
//   • It never gives up: SignalR's automatic reconnect uses
//     nextRetryDelayMs, which always returns a delay, and a failed first
//     start or a closed connection is retried on the same schedule. A wall
//     display left running for days recovers on its own.
//   • After each (re)connection subscribers are asked to re-read (onResync),
//     since changes made while disconnected were never delivered.
//   • Batch 347 (PS-54): network print results (PrintJobStatus) use the same
//     connection. They are sent to the user, not a scope, so a print-result
//     subscriber keeps the connection open without changing SetIntraopScope.
// The connection is built through `buildConnection` so tests use a fake.
// ─────────────────────────────────────────────────────────────────────────────

import { HubConnectionBuilder, LogLevel, type IRetryPolicy } from '@microsoft/signalr';
import {
  HUB_INTRAOP_CHANGED, HUB_PRINT_JOB_STATUS, HUB_SET_INTRAOP_SCOPE, parseIntraopChangedEvent, parsePrintJobStatusEvent,
  type IntraopChangedEvent, type IntraopScope, type PrintJobStatusEvent, type SetIntraopScopeResult,
} from './liveUpdateContract';
import {
  combineScopes, createDuplicateFilter, eventMatchesScope, nextRetryDelayMs, sameScope,
  type LiveConnectionState,
} from './liveUpdatePolicy';
import type { ILiveUpdateService, LiveUpdateSubscription } from './ILiveUpdateService';

/** The parts of @microsoft/signalr's HubConnection this uses. */
export interface HubConnectionLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(method: string, handler: (...args: unknown[]) => void): void;
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  onreconnecting(callback: (error?: Error) => void): void;
  onreconnected(callback: (connectionId?: string) => void): void;
  onclose(callback: (error?: Error) => void): void;
}

export interface SignalRLiveUpdateDeps {
  hubUrl: string;
  /** Bearer token for the hub (a user's session, or an OR terminal's device token). */
  accessTokenFactory?: () => string | Promise<string>;
  buildConnection?: (hubUrl: string, retryPolicy: IRetryPolicy, accessTokenFactory?: () => string | Promise<string>, logLevel?: LogLevel) => HubConnectionLike;
  /** SignalR's own console logging (default: warnings). */
  logLevel?: LogLevel;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  random?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export const defaultBuildConnection: NonNullable<SignalRLiveUpdateDeps['buildConnection']> = (hubUrl, retryPolicy, accessTokenFactory, logLevel = LogLevel.Warning) =>
  new HubConnectionBuilder()
    .withUrl(hubUrl, accessTokenFactory ? { accessTokenFactory } : {})
    .withAutomaticReconnect(retryPolicy)
    .configureLogging(logLevel)
    .build() as unknown as HubConnectionLike;

export const CLOSE_GRACE_MS = 1_000;

export function createSignalRLiveUpdateService(deps: SignalRLiveUpdateDeps): ILiveUpdateService {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
  const random = deps.random ?? Math.random;
  const log = deps.log ?? ((m, d) => console.warn(`[liveUpdates] ${m}`, d ?? ''));
  const retryPolicy: IRetryPolicy = { nextRetryDelayInMilliseconds: ctx => nextRetryDelayMs(ctx.previousRetryCount, random) };

  const subscribers = new Map<number, { scope: IntraopScope; onEvent: (e: IntraopChangedEvent) => void }>();
  const printSubscribers = new Map<number, (e: PrintJobStatusEvent) => void>();
  const subscriberCount = () => subscribers.size + printSubscribers.size;
  const stateListeners = new Set<(s: LiveConnectionState) => void>();
  const resyncListeners = new Set<() => void>();
  const isNew = createDuplicateFilter();
  let nextId = 1;
  let state: LiveConnectionState = 'idle';
  let connection: HubConnectionLike | null = null;
  let sentScope: IntraopScope | null = null;
  let restartTimer: unknown = null;
  let restartAttempts = 0;
  let stopping = false;
  let closeTimer: unknown = null;

  const setState = (next: LiveConnectionState) => {
    if (next === state) return;
    state = next;
    for (const l of [...stateListeners]) l(next);
  };
  const resync = () => { for (const l of [...resyncListeners]) l(); };

  const currentScope = () => combineScopes([...subscribers.values()].map(s => s.scope));

  const pushScope = async (force = false) => {
    if (!connection || state !== 'live') return;
    // A connection open only for print results has no intraop scope to send.
    if (!sentScope && subscribers.size === 0) return;
    const scope = currentScope();
    if (!force && sentScope && sameScope(scope, sentScope)) return;
    sentScope = scope;
    try {
      const result = await connection.invoke<SetIntraopScopeResult>(HUB_SET_INTRAOP_SCOPE, scope);
      if (result?.rejectedLocationIds?.length) log('the hub refused some locations for this connection', result.rejectedLocationIds);
    } catch (e) {
      sentScope = null; // try again with the next change or reconnection
      log('SetIntraopScope failed', e);
    }
  };

  const onConnected = async () => {
    restartAttempts = 0;
    setState('live');
    await pushScope(true);
    resync();
  };

  const scheduleRestart = () => {
    if (stopping || subscriberCount() === 0 || restartTimer) return;
    setState('offline');
    const delay = nextRetryDelayMs(restartAttempts++, random);
    restartTimer = setTimer(() => { restartTimer = null; void start(); }, delay);
  };

  const start = async () => {
    if (!connection || stopping) return;
    try {
      await connection.start();
      await onConnected();
    } catch (e) {
      log('could not connect to the live-update hub; retrying', e);
      scheduleRestart();
    }
  };

  const open = () => {
    stopping = false;
    connection = (deps.buildConnection ?? defaultBuildConnection)(deps.hubUrl, retryPolicy, deps.accessTokenFactory, deps.logLevel);
    connection.on(HUB_INTRAOP_CHANGED, (raw: unknown) => {
      const event = parseIntraopChangedEvent(raw);
      if (!event || !isNew(event.eventId)) return;
      for (const s of [...subscribers.values()]) {
        if (!eventMatchesScope(event, s.scope)) continue;
        try { s.onEvent(event); } catch (e) { log('subscriber failed', e); }
      }
    });
    connection.on(HUB_PRINT_JOB_STATUS, (raw: unknown) => {
      const event = parsePrintJobStatusEvent(raw);
      if (!event || !isNew(event.eventId)) return;
      for (const onEvent of [...printSubscribers.values()]) {
        try { onEvent(event); } catch (e) { log('print-result subscriber failed', e); }
      }
    });
    connection.onreconnecting(() => { sentScope = null; setState('reconnecting'); });
    connection.onreconnected(() => { void onConnected(); });
    connection.onclose(() => { sentScope = null; if (!stopping) scheduleRestart(); });
    setState('connecting');
    void start();
  };

  const close = () => {
    stopping = true;
    if (restartTimer) { clearTimer(restartTimer); restartTimer = null; }
    const c = connection;
    connection = null;
    sentScope = null;
    restartAttempts = 0;
    setState('idle');
    if (c) c.stop().catch(() => {});
  };

  /** Closes the connection a moment after the last subscriber of either kind goes. */
  const closeSoonIfUnused = () => {
    if (subscriberCount() > 0 || closeTimer) return;
    closeTimer = setTimer(() => { closeTimer = null; if (subscriberCount() === 0) close(); }, CLOSE_GRACE_MS);
  };
  const ensureOpen = () => {
    if (closeTimer) { clearTimer(closeTimer); closeTimer = null; }
    if (!connection) { open(); return false; }
    return true;
  };

  return {
    transport: 'signalr',
    subscribeIntraop(scope, onEvent): LiveUpdateSubscription {
      const id = nextId++;
      subscribers.set(id, { scope, onEvent });
      if (ensureOpen()) void pushScope();
      return {
        unsubscribe: () => {
          if (!subscribers.delete(id)) return;
          if (subscriberCount() > 0) { void pushScope(); return; }
          closeSoonIfUnused();
        },
      };
    },
    subscribePrintJobs(onEvent): LiveUpdateSubscription {
      const id = nextId++;
      printSubscribers.set(id, onEvent);
      ensureOpen();
      return {
        unsubscribe: () => {
          if (!printSubscribers.delete(id)) return;
          closeSoonIfUnused();
        },
      };
    },
    getState: () => state,
    onStateChange(listener) { stateListeners.add(listener); return () => { stateListeners.delete(listener); }; },
    onResync(listener) { resyncListeners.add(listener); return () => { resyncListeners.delete(listener); }; },
  };
}
