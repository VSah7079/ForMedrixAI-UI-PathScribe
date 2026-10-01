// src/pages/SynopticReportPage/hooks/useCassetteScanVerification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct research: "Barcode Scan Verification: Require
// (or offer a soft guardrail) scanning the newly printed label barcode
// before moving to the next specimen block to close the loop." Step 4 of
// the label-printing build plan.
//
// Reuses the real, already-built scanning infrastructure directly — no new
// scanning capability needed. contexts/ScannerProvider.tsx already
// dispatches a real, generic `PATHSCRIBE_SCAN` window event (consumed by
// AccessionPage.tsx's own listener for a completely different purpose,
// order/patient matching) — this is a new, independent consumer of that
// same, already-working event, not new infrastructure.
//
// Real, deliberate scope: a SOFT guardrail only. Pete's own research
// explicitly frames this as "Require (or offer a soft guardrail)" — a
// real, legitimate choice, not just a lesser fallback. Hard-blocking real
// grossing bench workflow because a scanner is briefly unavailable or
// miscalibrated is a genuinely disruptive failure mode this doesn't take
// on without more explicit direction. When
// printSettingsService's requireScanVerificationBeforeNextBlock is on,
// adding a new block while an earlier one's cassette scan is still
// unverified shows a real, visible warning — it never blocks the action.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScanEvent } from '@/contexts/ScannerProvider';

export interface PendingCassetteVerification {
  cassetteId: string;
  blockLabel: string;
  specimenLabel: string;
}

export interface UseCassetteScanVerificationResult {
  /** The most recent cassette still awaiting a matching scan, or null
   *  once it's been verified (or none is pending). Real, inspectable
   *  state — not just an internal flag. */
  pendingVerification: PendingCassetteVerification | null;
  /** Call right after a new cassette label is dispatched — registers
   *  the real, expected cassetteId to watch for. */
  registerPendingVerification: (pending: PendingCassetteVerification) => void;
  /** Real, honest check for the soft-guardrail warning: true only when
   *  there's a genuinely unverified prior cassette AND the setting is
   *  on. Callers (handleAddBlock) use this to decide whether to show
   *  the warning toast — this hook itself never blocks anything. */
  hasUnverifiedPendingCassette: (requireScanVerification: boolean) => boolean;
}

/**
 * Listens to the real, already-dispatched PATHSCRIBE_SCAN window event.
 * A scan whose raw text exactly matches the pending cassette's real,
 * human-facing identifier (types/labels/LabelData.ts's own
 * cassetteIdentifier()) clears the pending state — verified. Anything
 * else (a different scan, no scan at all) leaves it pending.
 */
export function useCassetteScanVerification(): UseCassetteScanVerificationResult {
  const [pendingVerification, setPendingVerification] = useState<PendingCassetteVerification | null>(null);
  // Ref mirror of state — the event listener closure needs the real,
  // current pending value without re-subscribing on every change.
  const pendingRef = useRef<PendingCassetteVerification | null>(null);
  pendingRef.current = pendingVerification;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ScanEvent>).detail;
      if (!detail?.raw || !pendingRef.current) return;
      if (detail.raw.trim() === pendingRef.current.cassetteId) {
        setPendingVerification(null);
      }
    };
    window.addEventListener('PATHSCRIBE_SCAN', handler);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', handler);
  }, []);

  const registerPendingVerification = useCallback((pending: PendingCassetteVerification) => {
    setPendingVerification(pending);
  }, []);

  const hasUnverifiedPendingCassette = useCallback((requireScanVerification: boolean) => {
    return requireScanVerification && pendingRef.current !== null;
  }, []);

  return { pendingVerification, registerPendingVerification, hasUnverifiedPendingCassette };
}
