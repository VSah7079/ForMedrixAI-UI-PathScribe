// src/hooks/useCurrentOrTerminal.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given RFP-APLIS-2026-GLOBAL Intraoperative/Frozen
// Section Dashboard design brief: "Store the location_id in
// localStorage or device configuration so if the browser reloads or
// the terminal restarts, it immediately reconnects to OR-03's live
// feed without requiring user re-authentication." Mirrors
// useCurrentScanStation.ts's own real, proven pattern exactly —
// same real same-tab-sync fix (a module-level subscriber set, since
// the native 'storage' event only ever fires for OTHER tabs) — for a
// genuinely different real binding: a scan station is a bench a TECH
// works at; an OR terminal is a wall-mounted display bound to one
// specific Location, persisting regardless of who's in the room.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pathscribe_current_or_terminal_id';

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

const subscribers = new Set<(id: string | null) => void>();

export function useCurrentOrTerminal() {
  const [terminalId, setTerminalIdState] = useState<string | null>(readStored);

  useEffect(() => {
    const handler = (id: string | null) => setTerminalIdState(id);
    subscribers.add(handler);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setTerminalIdState(e.newValue); };
    window.addEventListener('storage', onStorage);
    return () => { subscribers.delete(handler); window.removeEventListener('storage', onStorage); };
  }, []);

  const setTerminalId = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* real, honest no-op — a private-browsing session with no real localStorage simply doesn't persist across reloads, never a crash */ }
    subscribers.forEach(fn => fn(id));
  }, []);

  return { terminalId, setTerminalId };
}
