// src/hooks/useIdleTimeout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 of the Inactivity Timeout & Draft Recovery spec.
// Tracks real user activity (mouse, keyboard, scroll, touch) and exposes when
// a warning should show and when the session should actually expire.
//
// Deliberately does NOT itself call logout() or navigate anywhere -- this
// hook only reports state; the caller (ProtectedRoute) decides what to do
// with it. Keeps this hook reusable/testable independent of auth wiring.
//
// Timeout DURATION is resolved via services/session/mockSessionTimeoutService.ts
// -- org default, overridden per the currently-open case's performing lab
// if one has a stricter/looser value set. Starts with a hardcoded fallback
// (15 min) immediately (no flash of an undefined duration while the async
// resolution runs), then refines once that resolves. Re-resolves whenever
// the case in the URL changes, not on every path change (e.g. switching
// tabs within the same case shouldn't re-trigger a lookup).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { caseRouter } from '@/services/cases/CaseRouter';
import { extractCaseIdFromPath } from '@/services/session/ISessionTimeoutService';
import { mockSessionTimeoutService } from '@/services/session/mockSessionTimeoutService';

const WARNING_WINDOW_SECONDS = 60;
const FALLBACK_MINUTES = 15; // used only until the real org default resolves async

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click',
];

interface UseIdleTimeoutResult {
  /** True once the warning window has begun -- show the warning modal. */
  showWarning: boolean;
  /** Counts down from WARNING_WINDOW_SECONDS while showWarning is true. */
  secondsRemaining: number;
  /** True the instant the full idle timeout elapses -- caller should log out. */
  expired: boolean;
  /** Call when the user clicks "Stay Logged In" -- resets everything. */
  stayLoggedIn: () => void;
}

export function useIdleTimeout(enabled: boolean): UseIdleTimeoutResult {
  const location = useLocation();
  const caseId = extractCaseIdFromPath(location.pathname);

  const [effectiveMinutes, setEffectiveMinutes] = useState<number>(FALLBACK_MINUTES);
  const [showWarning, setShowWarning]           = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(WARNING_WINDOW_SECONDS);
  const [expired, setExpired]                   = useState(false);

  const warningTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the CURRENT showWarning value for handleActivity to read below.
  // handleActivity is registered inside an effect that intentionally only
  // depends on [enabled, effectiveMinutes] (not showWarning) to avoid
  // re-subscribing DOM listeners on every warning-state toggle — but that
  // means the closure would otherwise capture whatever showWarning was
  // AT REGISTRATION TIME and never see it change again. Since
  // registration only happens once per enabled/effectiveMinutes change
  // (essentially once per session), handleActivity's own showWarning
  // check would be permanently stuck reading false — meaning any
  // incidental activity (scroll momentum, a stray keypress) would keep
  // resetting the timer even while the warning modal is actively
  // showing, and the session would functionally never expire. A ref
  // sidesteps this: it's mutated by the effect below on every render
  // where showWarning changes, and handleActivity reads .current, which
  // is always live regardless of when the listener closure was created.
  const showWarningRef = useRef(showWarning);
  useEffect(() => { showWarningRef.current = showWarning; }, [showWarning]);

  // Real, absolute anchor for when the current countdown period started —
  // in ms since epoch, immune to setTimeout/setInterval throttling. Two
  // separate anchors: one for "when did the full idle period start" (used
  // to detect a stale warning-timer), one for "when did the warning
  // countdown start" (used to detect a stale countdown interval). Both are
  // refs, not state — they're read inside recheckAgainstRealClock, never
  // need to trigger a render themselves.
  const idlePeriodStartedAtRef = useRef<number>(Date.now());
  const warningStartedAtRef    = useRef<number | null>(null);

  // ── Resolve the effective timeout for the currently-open case ──────────────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (!caseId) {
      mockSessionTimeoutService.getOrgDefault().then(res => {
        if (!cancelled && res.ok) setEffectiveMinutes(res.data);
      });
      return () => { cancelled = true; };
    }

    caseRouter.getCase(caseId).then(async (caseData) => {
      if (cancelled) return;
      const orderingFacilityId = caseData?.order?.facilityId;
      const res = await mockSessionTimeoutService.resolveEffectiveMinutes(orderingFacilityId);
      if (!cancelled && res.ok) setEffectiveMinutes(res.data);
    }).catch(async () => {
      if (cancelled) return;
      const res = await mockSessionTimeoutService.getOrgDefault();
      if (!cancelled && res.ok) setEffectiveMinutes(res.data);
    });

    return () => { cancelled = true; };
  }, [enabled, caseId]);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current)    clearInterval(countdownRef.current);
    warningTimerRef.current = null;
    countdownRef.current    = null;
  }, []);

  const startWarningCountdown = useCallback(() => {
    warningStartedAtRef.current = Date.now();
    setShowWarning(true);
    setSecondsRemaining(WARNING_WINDOW_SECONDS);
    countdownRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearTimers();
    idlePeriodStartedAtRef.current = Date.now();
    warningStartedAtRef.current = null;
    setShowWarning(false);
    setSecondsRemaining(WARNING_WINDOW_SECONDS);
    const msUntilWarning = Math.max(0, effectiveMinutes * 60 - WARNING_WINDOW_SECONDS) * 1000;
    warningTimerRef.current = setTimeout(startWarningCountdown, msUntilWarning);
  }, [clearTimers, startWarningCountdown, effectiveMinutes]);

  // The actual fix — setTimeout/setInterval are throttled (sometimes
  // effectively paused) in backgrounded tabs, so a warning countdown can
  // silently stall instead of reaching zero while the user is away. This
  // recomputes against Date.now(), which keeps advancing regardless of
  // timer throttling, and corrects whatever state the throttled timers
  // left behind. Real elapsed time wins over however many ticks a
  // throttled timer happened to fire.
  const recheckAgainstRealClock = useCallback(() => {
    const now = Date.now();
    if (warningStartedAtRef.current !== null) {
      const elapsedWarningMs = now - warningStartedAtRef.current;
      if (elapsedWarningMs >= WARNING_WINDOW_SECONDS * 1000) {
        clearTimers();
        setExpired(true);
        setSecondsRemaining(0);
        return;
      }
      setSecondsRemaining(Math.max(0, WARNING_WINDOW_SECONDS - Math.floor(elapsedWarningMs / 1000)));
      return;
    }
    const fullTimeoutMs = effectiveMinutes * 60 * 1000;
    const msUntilWarning = Math.max(0, fullTimeoutMs - WARNING_WINDOW_SECONDS * 1000);
    const elapsedIdleMs = now - idlePeriodStartedAtRef.current;
    if (elapsedIdleMs >= fullTimeoutMs) {
      clearTimers();
      setExpired(true);
      setSecondsRemaining(0);
      return;
    }
    if (elapsedIdleMs >= msUntilWarning) {
      // The warning should already have started, backdated to when it
      // actually should have begun (not "now") so the countdown reflects
      // real remaining time rather than resetting to a full 60s.
      clearTimers();
      warningStartedAtRef.current = idlePeriodStartedAtRef.current + msUntilWarning;
      const elapsedWarningMs = now - warningStartedAtRef.current;
      setShowWarning(true);
      setSecondsRemaining(Math.max(0, WARNING_WINDOW_SECONDS - Math.floor(elapsedWarningMs / 1000)));
      countdownRef.current = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [clearTimers, effectiveMinutes]);

  const stayLoggedIn = useCallback(() => {
    setExpired(false);
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!enabled) { clearTimers(); return; }

    // Activity only resets the timer BEFORE the warning has shown -- once
    // the warning is up, only an explicit "Stay Logged In" click should
    // reset it. Otherwise moving the mouse while genuinely away from the
    // desk (a monitor saver nudging the mouse, a cat walking across the
    // keyboard) would silently defeat the whole point of the warning.
    const handleActivity = () => {
      if (!showWarningRef.current) resetIdleTimer();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') recheckAgainstRealClock();
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, effectiveMinutes]);

  return { showWarning, secondsRemaining, expired, stayLoggedIn };
}
