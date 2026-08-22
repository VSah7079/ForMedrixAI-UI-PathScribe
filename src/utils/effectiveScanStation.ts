// src/utils/effectiveScanStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure (non-React) implementation of the same fallback-chain
// rule hooks/useEffectiveScanStation.ts already implements reactively
// — per direct follow-up: "adding stationId to the real audit event
// system." audit/auditLogger.ts's logEvent() is a plain function, not
// a React component — it can't call a hook, or read the hook's own
// React state/context. Deliberately NOT called by the hook itself —
// that hook's own reactive state (subscriber-synced device station,
// useAuth()'s own context) is the more correct, live-updating source
// for React consumers; this file exists specifically for the one
// real non-React caller that needs the same rule but has no hook
// access at all. The rule itself (device lock wins; else the user's
// own default) is a single, trivial "??" chain, unlikely to drift
// between the two — kept as two small, independent, well-commented
// implementations rather than forcing a shared function through an
// awkward seam that would make the React hook version less reliable.
// ─────────────────────────────────────────────────────────────────────────────

const DEVICE_STATION_KEY = 'pathscribe_current_scan_station_id';
const USER_STORAGE_KEY = 'pathscribe-user';

/**
 * The real, current station id for wherever this code is running —
 * synchronous, safe to call from anywhere (a plain function, a React
 * component, an audit call site), never throws. Returns null if
 * neither the device nor the logged-in user's own profile resolves
 * one — same real "no station known" case the fallback chain's own
 * hook already handles.
 */
export function getEffectiveScanStationId(): string | null {
  let deviceStationId: string | null = null;
  try { deviceStationId = localStorage.getItem(DEVICE_STATION_KEY); } catch { /* localStorage unavailable */ }
  if (deviceStationId) return deviceStationId;

  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.defaultScanStationId) return user.defaultScanStationId as string;
    }
  } catch { /* localStorage unavailable, or a genuinely malformed stored user — fail safe to null either way */ }

  return null;
}
