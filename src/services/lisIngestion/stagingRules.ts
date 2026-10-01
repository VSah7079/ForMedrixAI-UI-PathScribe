// src/services/lisIngestion/stagingRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure rules for the universal staging queue: staging with de-duplication,
// which events a worker should take next, recording an attempt, retrying,
// and trimming old history.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalizedLisUpdate, StagedLisEvent, LisIngestionSource } from './types';

/** Attempts before an event stays failed until an admin retries it. */
export const MAX_ATTEMPTS = 5;
/** Handled events kept for the activity view; pending and failed ones are
 *  never trimmed. */
export const PROCESSED_EVENTS_KEPT = 200;

/** A small, stable fingerprint (FNV-1a). Not a security hash. */
export function textFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Same accession, status, LIS time and text = the same update. */
export function updateFingerprint(u: NormalizedLisUpdate): string {
  return textFingerprint([
    u.accession.trim(), u.lisStatus.trim().toUpperCase(), u.updatedAt,
    u.grossText ?? '', u.microscopicText ?? '', u.diagnosisText ?? '',
  ].join('␞'));
}

/** Adds updates to the queue, skipping any already staged. */
export function stageUpdates(
  queue: readonly StagedLisEvent[],
  updates: readonly NormalizedLisUpdate[],
  source: LisIngestionSource,
  opts: { now: string; newId: () => string },
): { queue: StagedLisEvent[]; added: StagedLisEvent[]; duplicates: number } {
  const seen = new Set(queue.map(e => e.fingerprint));
  const added: StagedLisEvent[] = [];
  let duplicates = 0;
  for (const u of updates) {
    const fingerprint = updateFingerprint(u);
    if (seen.has(fingerprint)) { duplicates++; continue; }
    seen.add(fingerprint);
    added.push({ ...u, accession: u.accession.trim(), lisStatus: u.lisStatus.trim(), id: opts.newId(), source, receivedAt: opts.now, fingerprint, state: 'pending', attempts: 0 });
  }
  return { queue: [...queue, ...added], added, duplicates };
}

/** Events a worker should handle now, oldest LIS change first (so a case's
 *  Gross is handled before its Micro): pending ones, and failed ones that
 *  haven't used up their attempts. */
export function workableEvents(queue: readonly StagedLisEvent[]): StagedLisEvent[] {
  return queue
    .filter(e => e.state === 'pending' || (e.state === 'failed' && e.attempts < MAX_ATTEMPTS))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.receivedAt.localeCompare(b.receivedAt));
}

/** Records one attempt's result on an event. */
export function recordAttempt(
  queue: readonly StagedLisEvent[],
  id: string,
  result: { ok: true; outcome: string } | { ok: false; error: string },
  now: string,
): StagedLisEvent[] {
  return queue.map(e => {
    if (e.id !== id) return e;
    const attempts = e.attempts + 1;
    // Explicit === comparisons: this tsconfig has strictNullChecks off, where
    // a plain truthy check doesn't narrow the union (see services/types.ts).
    if (result.ok === false) return { ...e, attempts, state: 'failed', outcome: 'failed', error: result.error, processedAt: now };
    return { ...e, attempts, state: 'processed', outcome: result.outcome, error: undefined, processedAt: now };
  });
}

/** Puts every failed event back in line with a fresh set of attempts. */
export function retryFailed(queue: readonly StagedLisEvent[]): { queue: StagedLisEvent[]; retried: number } {
  let retried = 0;
  const next = queue.map(e => {
    if (e.state !== 'failed') return e;
    retried++;
    return { ...e, state: 'pending' as const, attempts: 0, error: undefined, outcome: undefined };
  });
  return { queue: next, retried };
}

/** Keeps every pending and failed event and the newest handled ones. */
export function trimQueue(queue: readonly StagedLisEvent[], keep = PROCESSED_EVENTS_KEPT): StagedLisEvent[] {
  const processed = queue.filter(e => e.state === 'processed')
    .sort((a, b) => (b.processedAt ?? '').localeCompare(a.processedAt ?? ''));
  const keepIds = new Set(processed.slice(0, keep).map(e => e.id));
  return queue.filter(e => e.state !== 'processed' || keepIds.has(e.id));
}

/** Newest first, for the admin view. */
export function recentEvents(queue: readonly StagedLisEvent[], limit: number): StagedLisEvent[] {
  return [...queue].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** Counts by state, for the admin view. */
export function countByState(queue: readonly StagedLisEvent[]): Record<StagedLisEvent['state'], number> {
  const out = { pending: 0, processed: 0, failed: 0 };
  for (const e of queue) out[e.state]++;
  return out;
}
