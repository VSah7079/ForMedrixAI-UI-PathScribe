// src/hooks/useEffectiveScanStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "use a fallback chain during session
// initialization: 1. Check Client Device Storage... Force the session
// to use this station_id (Traditional/Fixed mode). 2. Fallback to
// User Profile: If no device-level ID exists, pull the logged-in
// user's default_station_id."
//
// Deliberately a SEPARATE, higher-level hook rather than folding this
// into useCurrentScanStation.ts itself — that hook's own stationId
// must stay exactly what it already is: the real, explicit, device-
// persisted value, set only by a genuine user action (the login
// prompt, or the NavBar dropdown). A user's own defaultScanStationId
// must NEVER get written into that same persisted slot — doing so
// would silently "lock" a shared device to whichever user happened
// to log in first, breaking it for the next, different person on
// that same terminal. This hook only ever COMPUTES the resolved,
// in-memory fallback for display/attribution — it never persists it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCurrentScanStation } from './useCurrentScanStation';
import { useAuth } from '@/contexts/AuthContext';

export function useEffectiveScanStation() {
  const { stationId: deviceStationId, setStationId, hasBeenPrompted, markPrompted } = useCurrentScanStation();
  const { user } = useAuth();

  // Real fallback chain: the device's own, explicitly-set station
  // always wins (Traditional/Fixed mode) — falls back to the logged-
  // in user's own profile default only when the device has never
  // been explicitly configured at all.
  const effectiveStationId = deviceStationId ?? user?.defaultScanStationId ?? null;
  const isDeviceLocked = !!deviceStationId;
  const isUserDefault = !deviceStationId && !!user?.defaultScanStationId;

  return { effectiveStationId, deviceStationId, isDeviceLocked, isUserDefault, setStationId, hasBeenPrompted, markPrompted };
}
