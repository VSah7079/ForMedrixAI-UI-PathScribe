// src/components/ScanStationPrompt.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "I think the premise of setting a
// current station in an actual case is not correct. The Current
// station, or Station should be identified at login. Should be
// sticky too." Replaces the old, case-scoped MaterialTreePanel.tsx
// selector entirely — a station is a property of the terminal, never
// of whatever case happens to be open.
//
// Mounted once, at the app root (AppShell.tsx, so it runs for every
// authenticated page — never gated to a specific case). Real fallback
// chain, per direct follow-up: "1. Check Client Device Storage...
// Force the session to use this station_id. 2. Fallback to User
// Profile: If no device-level ID exists, pull the logged-in user's
// default_station_id." This prompt only ever shows when NEITHER
// resolves (useEffectiveScanStation.ts's own effectiveStationId is
// still null) — a user with a real, admin-assigned default is never
// interrupted by this at all; it's genuinely reserved for the case
// where nothing at all is known yet. Also respects the device's own,
// separate sticky "hasBeenPrompted" flag, so a genuine "Skip" stays
// skipped rather than re-asking every login. A tech can still change
// their station any time afterward via the compact NavBar indicator
// (NavBarScanStation.tsx) — this prompt is only the real, one-time
// "identified at login" moment, not the only way to ever set it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';

export function ScanStationPrompt() {
  const { user } = useAuth();
  const { effectiveStationId, setStationId, hasBeenPrompted, markPrompted } = useEffectiveScanStation();
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    mockScanStationService.getAll().then(res => {
      if (res.ok) setStations(res.data.filter(s => s.status === 'Active'));
    });
  }, []);

  // Real, deliberate show condition: a real, logged-in user, with
  // NEITHER a device-level station NOR a resolved user default
  // (effectiveStationId covers both halves of the real fallback
  // chain), on a device that has genuinely never been through this
  // prompt before — never re-shown just because the device's own
  // stationId happens to be null (a resolved user default, or an
  // intentional skip, are both real reasons that's true too).
  const shouldShow = !!user && !effectiveStationId && !hasBeenPrompted;
  if (!shouldShow) return null;

  const handleConfirm = () => {
    if (selected) setStationId(selected);
    markPrompted();
  };

  const handleSkip = () => {
    markPrompted();
  };

  return (
    <div className="ps-overlay ps-scan-prompt-overlay">
      <div className="ps-modal-dark ps-scan-prompt-modal">
        <div>
          <div className="ps-scan-prompt-title">📍 Which bench is this?</div>
          <div className="ps-scan-prompt-subtitle">
            Set the real, physical station this terminal represents — a real cassette/slide scan here will be tracked as happening at whatever you pick. This is remembered for this device going forward; you can change it any time from the icon next to your name.
          </div>
        </div>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="ps-scan-prompt-select"
        >
          <option value="">— Select a station —</option>
          {stations.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="ps-scan-prompt-actions">
          <button className="ps-scan-prompt-skip" onClick={handleSkip}>Skip — I don't scan here</button>
          <button className="ps-scan-prompt-confirm" onClick={handleConfirm} disabled={!selected}>Set station</button>
        </div>
      </div>
    </div>
  );
}

export default ScanStationPrompt;
