// src/hooks/usePendingEngineNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own decision: polling for a first pass,
// not a live onSnapshot listener — this app has no real-time listener
// anywhere else today (confirmed by direct search), so this matches
// existing convention rather than introducing new connection-lifecycle
// concerns. Revisit as a dedicated real-time phase later if polling
// latency turns out to matter in practice.
//
// Real, deliberate design: this hook does NOT reimplement any
// notification logic. For cassette-dispatch-outcome, it hands the
// event to the SAME, already-tested processCassetteDispatchOutcomeEvent
// function the "Dev Tools → Sim" button already calls — that event
// never mutates a case, so the same function safely serves both real
// and simulated flows. For block-exception and material-location,
// which DO mutate real case data, the real backend webhook has
// already applied that mutation server-side before a notification
// record exists to poll for — this hook calls the separate,
// notification-ONLY notifyBlockExceptionApplied /
// notifyMaterialLocationApplied instead, never the mutating
// process*Event functions, which stay reserved for the Dev Tools Sim
// buttons' own no-backend-involved flow.
//
// Real, deliberate correction, per direct guidance's own security
// review: this hook is now READ-ONLY against Firestore. It used to
// mark a notification `consumed: true` via a direct client-side
// updateDoc() call — but this app has no real, server-verifiable
// session (AuthContext.tsx is a custom, localStorage-backed mock, with
// zero real Firebase Auth calls anywhere in the codebase, confirmed
// directly). A Firestore rule can't distinguish a legitimate
// technician's write from anyone else's without SOME real,
// server-verifiable identity — which doesn't exist yet, for either
// Firebase Auth or a custom session token. Rather than ship a client
// write firestore.rules can't actually secure, this hook no longer
// writes at all; pending_engine_notifications can be locked to
// `allow write: if false` for every real client, safely, today.
//
// Real, disclosed consequence of no longer writing `consumed`: this
// hook now filters by `createdAt` (only notifications created after
// this hook last polled) instead, so it naturally never re-processes
// old ones — but nothing ever marks a document as "done," so
// pending_engine_notifications will grow unbounded over time. Real,
// deliberate, NOT built here: a scheduled, Admin-SDK-only cleanup job
// (e.g. a Vercel Cron Job hitting a new /api endpoint, or a genuine
// Cloud Function) to prune old documents — that's real, separate,
// admin-only infrastructure work, not a client-side concern.
//
// Real, disclosed operational step: the `where('caseId', '==', ...)` +
// `where('createdAt', '>', ...)` query below combines an equality
// filter with a range filter on a different field — Firestore will
// require a real composite index for this the first time it actually
// runs against a real project (a normal, expected one-time setup step
// for any new Firestore query shape, not a bug — the error Firestore
// itself throws includes a direct console link to create the exact
// index needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { processCassetteDispatchOutcomeEvent } from '@/services/hl7/processCassetteDispatchOutcomeEvent';
import { notifyBlockExceptionApplied } from '@/services/hl7/notifyBlockExceptionApplied';
import { notifyMaterialLocationApplied } from '@/services/hl7/notifyMaterialLocationApplied';

const NOTIFICATIONS_COLLECTION = 'pending_engine_notifications';
const POLL_INTERVAL_MS = 20_000;

// Real, per direct guidance: now wired for all three real event types.
// block-exception/material-location deliberately call their own
// notification-ONLY functions (notifyBlockExceptionApplied /
// notifyMaterialLocationApplied) here, never the mutation-performing
// processBlockExceptionEvent/processMaterialLocationEvent — the
// backend webhook has already applied that real mutation server-side
// (api/webhooks/engine/block-exception.ts, material-location.ts, via
// applyEngineCaseUpdate) before a notification record ever lands in
// Firestore for this hook to find. Calling the mutating functions here
// too would silently apply the same real change a second time.
const CONSUMED_EVENT_TYPES = ['cassette-dispatch-outcome', 'block-exception', 'material-location'] as const;

/**
 * Polls for real, new Engine-reported notifications for the given
 * case and delivers each one through the existing, unchanged
 * notification handler. Call once per open case (e.g. from
 * SynopticReportPage) — a no-op if caseId is undefined (no case open
 * yet, or viewing a case with no real id).
 */
export function usePendingEngineNotifications(caseId: string | undefined): void {
  // Real, deliberate ref rather than state — this hook's own poll
  // tick never needs to re-render anything itself; it only ever
  // triggers side effects (a toast) that other, already-real code
  // owns the rendering for.
  const inFlight = useRef(false);
  // Real, client-side-only cursor replacing the old `consumed` field
  // write — see this file's own header for the full reasoning.
  // Starts at mount time, deliberately: a technician opening a case
  // should see NEW events from that point forward, not a replay of
  // every historical notification ever recorded for it.
  const lastPolledAt = useRef(new Date().toISOString());

  useEffect(() => {
    if (!caseId) return;

    let cancelled = false;

    async function pollOnce() {
      if (inFlight.current) return; // real, deliberate skip — never overlap a slow poll with the next interval tick
      inFlight.current = true;
      const pollStartedAt = new Date().toISOString();
      try {
        const q = query(
          collection(db, NOTIFICATIONS_COLLECTION),
          where('caseId', '==', caseId),
          where('createdAt', '>', lastPolledAt.current),
        );
        const snap = await getDocs(q);

        for (const docSnap of snap.docs) {
          if (cancelled) return;
          const data = docSnap.data();
          if (!CONSUMED_EVENT_TYPES.includes(data.eventType)) continue; // real, deliberate skip — see this file's own header

          if (data.eventType === 'cassette-dispatch-outcome') {
            await processCassetteDispatchOutcomeEvent(data.payload);
          } else if (data.eventType === 'block-exception') {
            await notifyBlockExceptionApplied(data.payload);
          } else if (data.eventType === 'material-location') {
            await notifyMaterialLocationApplied(data.payload);
          }
        }

        // Real, deliberate: advance the cursor to when THIS poll
        // started, not "now" after processing finishes — a
        // notification created mid-poll (after the query ran, before
        // this line) stays eligible for the NEXT poll instead of
        // being silently skipped by a cursor that moved past it.
        lastPolledAt.current = pollStartedAt;
      } catch (err) {
        console.error('[usePendingEngineNotifications] poll failed', err);
      } finally {
        inFlight.current = false;
      }
    }

    pollOnce();
    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [caseId]);
}
