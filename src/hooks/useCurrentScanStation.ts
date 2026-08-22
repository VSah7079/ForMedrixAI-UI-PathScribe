// src/hooks/useCurrentScanStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: outbound material scan tracking
// needs to know WHERE the scan physically happened. Deliberately a
// per-device/per-browser setting (localStorage), not part of any
// Case or user record — the real, physical terminal/scanner sitting
// at "Grossing Station 3" stays configured as that station regardless
// of which tech logs in and works there during a given shift. A tech
// switching benches switches this setting, not their own profile.
//
// Real bug found and fixed while live-verifying the scan pipeline
// end to end: this hook is called from two separate places — two
// genuinely independent useState instances. The native 'storage'
// event this hook originally relied on ONLY fires for OTHER tabs/
// windows, never for a same-tab, different-component state change —
// so setting the station in one place never actually reached the
// scan handler's own copy, and every real scan saw a stale "no
// station set" even with one visibly selected. Fixed with a real,
// minimal module-level subscriber set so every instance in the same
// tab stays in sync the moment any one of them calls setStationId.
//
// Real fix, per direct follow-up: "I think the premise of setting a
// current station in an actual case is not correct. The Current
// station, or Station should be identified at login. Should be
// sticky too." A station is a property of the terminal, never of
// whatever case happens to be open — the selector moved out of
// MaterialTreePanel.tsx entirely (ScanStationPrompt.tsx, mounted
// once at the app root right after a real, successful login; a
// compact NavBar indicator for changing it later). "Sticky" tracked
// here as a real, separate flag from stationId itself — a tech who
// explicitly skips the prompt (this device genuinely doesn't need
// one, e.g. a pathologist's own desk) shouldn't be re-asked every
// single login just because stationId is still null.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pathscribe_current_scan_station_id';
const PROMPTED_KEY = 'pathscribe_scan_station_prompted';

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function readPrompted(): boolean {
  try { return localStorage.getItem(PROMPTED_KEY) === '1'; } catch { return false; }
}

const subscribers = new Set<(id: string | null) => void>();
const promptedSubscribers = new Set<(v: boolean) => void>();

export function useCurrentScanStation() {
  const [stationId, setStationIdState] = useState<string | null>(readStored);
  const [hasBeenPrompted, setHasBeenPromptedState] = useState<boolean>(readPrompted);

  useEffect(() => {
    subscribers.add(setStationIdState);
    promptedSubscribers.add(setHasBeenPromptedState);
    return () => {
      subscribers.delete(setStationIdState);
      promptedSubscribers.delete(setHasBeenPromptedState);
    };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setStationIdState(e.newValue);
      if (e.key === PROMPTED_KEY) setHasBeenPromptedState(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setStationId = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* localStorage unavailable — fail silently, same posture as mockStorage.ts */ }
    subscribers.forEach(fn => fn(id));
  }, []);

  /** Marks this device as having seen the post-login prompt — real,
   *  sticky, and deliberately separate from whether a station was
   *  actually picked (a genuine "skip" is still sticky). */
  const markPrompted = useCallback(() => {
    try { localStorage.setItem(PROMPTED_KEY, '1'); } catch {}
    promptedSubscribers.forEach(fn => fn(true));
  }, []);

  return { stationId, setStationId, hasBeenPrompted, markPrompted };
}

