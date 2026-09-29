// src/services/liveUpdates/liveUpdatePolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: the decisions behind live updates, kept pure so they're tested
// directly: how long to wait before reconnecting, how often to fall back to
// polling, which events a subscriber cares about, how subscriptions combine,
// and which transport to use.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntraopChangedEvent, IntraopScope } from './liveUpdateContract';

/**
 * Connection state as the UI shows it.
 *   live         connected to the hub; changes arrive within the 500 ms target
 *   connecting   first connection attempt in progress
 *   reconnecting connection dropped; retrying (SignalR's automatic reconnect)
 *   offline      not connected; retrying on a back-off schedule
 *   local        no hub configured (development, demo, mock services):
 *                changes made in this browser reach its other windows
 *                instantly, other devices only by polling
 *   idle         nothing subscribed
 */
export type LiveConnectionState = 'live' | 'connecting' | 'reconnecting' | 'offline' | 'local' | 'idle';

/** Reconnect delays before the jitter. After the last, every retry waits 30 s: a
 *  wall display left running for days must keep trying, never give up. */
export const RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 20_000] as const;
export const MAX_RETRY_DELAY_MS = 30_000;
/** ±20 %, so many displays that lost the same server don't all retry at once. */
export const RETRY_JITTER = 0.2;

/** Delay before reconnect attempt number `previousRetryCount + 1`. Never null. */
export function nextRetryDelayMs(previousRetryCount: number, random: () => number = Math.random): number {
  const base = previousRetryCount < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[previousRetryCount] : MAX_RETRY_DELAY_MS;
  if (base === 0) return 0;
  const jitter = 1 + (random() * 2 - 1) * RETRY_JITTER;
  return Math.round(base * jitter);
}

/** Polling while live is only a safety net for a missed event. */
export const LIVE_SAFETY_POLL_MS = 60_000;
/** Without a live connection, the board refreshes as often as it did before PS-262. */
export const FALLBACK_POLL_MS = 15_000;

export function fallbackPollIntervalMs(state: LiveConnectionState): number {
  return state === 'live' ? LIVE_SAFETY_POLL_MS : FALLBACK_POLL_MS;
}

/** Bursts of events (a demo seeding four sessions, a batch merge) become one refresh. */
export const COALESCE_MS = 100;

export function eventMatchesScope(event: IntraopChangedEvent, scope: IntraopScope): boolean {
  if (scope.all) return true;
  return !!event.locationId && scope.locationIds.includes(event.locationId);
}

/** The single scope a connection asks the hub for: the union of its subscribers'. */
export function combineScopes(scopes: readonly IntraopScope[]): IntraopScope {
  const all = scopes.some(s => s.all);
  const locationIds = [...new Set(scopes.flatMap(s => s.locationIds))].sort();
  return { locationIds: all ? [] : locationIds, all };
}

export const sameScope = (a: IntraopScope, b: IntraopScope) =>
  a.all === b.all && a.locationIds.length === b.locationIds.length && a.locationIds.every((id, i) => id === b.locationIds[i]);

/** Remembers recent event ids so a redelivered event isn't handled twice. */
export function createDuplicateFilter(capacity = 500) {
  const seen = new Set<string>();
  const order: string[] = [];
  return (eventId: string): boolean => {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    order.push(eventId);
    if (order.length > capacity) seen.delete(order.shift()!);
    return true;
  };
}

export type LiveTransportChoice =
  | { transport: 'signalr'; hubUrl: string }
  | { transport: 'local'; reason: 'not-configured' | 'invalid'; message?: string };

/**
 * SignalR when the hub address is configured and valid (https in
 * production; loopback http allowed in development), otherwise the local
 * transport. A bad address in production is reported, not silently used.
 */
export function selectLiveUpdateTransport(input: {
  configured: string | undefined;
  isProduction: boolean;
  resolve: (configured: string) => { ok: true; url: string } | { ok: false; message: string };
}): LiveTransportChoice {
  const configured = input.configured?.trim();
  if (!configured) return { transport: 'local', reason: 'not-configured' };
  const r = input.resolve(configured);
  if (r.ok === false) return { transport: 'local', reason: 'invalid', message: r.message };
  return { transport: 'signalr', hubUrl: r.url };
}

/** A stable key for a scope, so a screen re-subscribes only when it really changes. */
export function scopeKey(scope: IntraopScope | null): string {
  if (!scope) return '';
  return scope.all ? '*' : [...scope.locationIds].sort().join(',');
}
