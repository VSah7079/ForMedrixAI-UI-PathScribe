// src/hooks/useCurrentDisplayProfile.ts
// PS-288 — same real, proven "bind once, persist across reloads,
// same-tab sync" pattern as useCurrentOrTerminal.ts (itself modeled
// on useCurrentScanStation.ts) — reused directly for a genuinely
// analogous real binding: a wall-mounted Facility Ops Dashboard
// display, bound once to a real DisplayProfile, that must keep
// showing the right facility/view after a browser reload or restart
// without any per-user login.
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pathscribe_current_display_profile_id';

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

const subscribers = new Set<(id: string | null) => void>();

export function useCurrentDisplayProfile() {
  const [profileId, setProfileIdState] = useState<string | null>(readStored);

  useEffect(() => {
    const handler = (id: string | null) => setProfileIdState(id);
    subscribers.add(handler);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setProfileIdState(e.newValue); };
    window.addEventListener('storage', onStorage);
    return () => { subscribers.delete(handler); window.removeEventListener('storage', onStorage); };
  }, []);

  const setProfileId = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* real, honest no-op — private browsing simply doesn't persist across reloads */ }
    subscribers.forEach(fn => fn(id));
  }, []);

  return { profileId, setProfileId };
}
