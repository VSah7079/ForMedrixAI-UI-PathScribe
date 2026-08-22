// src/components/NavBar/NavBarScanStation.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: station identification moved out of
// a specific case entirely (ScanStationPrompt.tsx handles the real,
// one-time "identified at login" moment) — this is the always-
// visible, global place a tech can check or change it afterward,
// e.g. after genuinely moving benches mid-shift. Also the real
// "Quick-Switch" dropdown for roaming staff, per direct follow-up:
// "expose a quick dropdown in the top navigation bar so roaming staff
// can switch stations on the fly." Deliberately compact — a pin +
// station name, not a full control — to sit cleanly among the
// NavBar's existing real icons without repeating the same tabbar-
// overflow class of bug found and fixed earlier this session.
//
// Displays the real, resolved effectiveStationId (device lock, or
// the logged-in user's own profile default when no device lock
// exists — useEffectiveScanStation.ts's own fallback chain), with a
// small provenance label so a tech can tell at a glance whether
// they're seeing their own personal default or this terminal's fixed
// identity. Explicitly choosing a station here is a real, deliberate
// override — same as the login prompt's own "Set station" action —
// so it writes to the device-level, persisted slot going forward,
// matching Pete's own "Traditional/Fixed mode" semantics once a human
// has explicitly set it.
//
// Real fix, per direct follow-up: "Visual Workstation Anchor: Keep
// the active station name clearly visible and high-contrast." Real,
// distinct cyan fill (not the same muted style as the other NavBar
// buttons) — this is meant to be glanced at from across the bench,
// not blend in.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';

export function NavBarScanStation() {
  const { effectiveStationId, isDeviceLocked, isUserDefault, setStationId } = useEffectiveScanStation();
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [open, setOpen] = useState(false);

  const loadStations = () => {
    mockScanStationService.getAll().then(res => {
      if (res.ok) setStations(res.data.filter(s => s.status === 'Active'));
    });
  };

  useEffect(() => { loadStations(); }, []);

  // Real bug found and fixed while live-verifying the new admin CRUD
  // screen: this NavBar control is long-lived — mounted once for the
  // whole session (AppShell.tsx), never remounted on route changes —
  // so a station added or renamed by an admin mid-session never
  // showed up here until a full page reload, even though the admin
  // screen's own change had already genuinely persisted. Re-fetching
  // fresh right as the menu opens (not just once, on mount) means the
  // list is always correct at the one moment it actually matters —
  // when a tech is about to pick from it.
  const handleToggleOpen = () => {
    setOpen(v => {
      const next = !v;
      if (next) loadStations();
      return next;
    });
  };

  const current = stations.find(s => s.id === effectiveStationId);
  const provenance = isDeviceLocked ? 'This terminal is fixed to this station' : isUserDefault ? 'Your own default station' : 'No scan station set';

  return (
    <div className="ps-navbar-station-wrap">
      <button
        type="button"
        className="ps-navbar-station-btn"
        onClick={handleToggleOpen}
        title={current ? `${provenance}: ${current.name} — click to change` : 'No scan station set — click to set one'}
      >
        📍 {current ? current.name : 'No station'}
      </button>
      {open && (
        <div className="ps-navbar-station-menu">
          <div className="ps-navbar-station-menu-title">{provenance}</div>
          {stations.map(s => (
            <button
              key={s.id}
              className={`ps-navbar-station-menu-item${s.id === effectiveStationId ? ' ps-navbar-station-menu-item--active' : ''}`}
              onClick={() => { setStationId(s.id); setOpen(false); }}
            >
              {s.id === effectiveStationId ? '✓ ' : ''}{s.name}
            </button>
          ))}
          {isDeviceLocked && (
            <button className="ps-navbar-station-menu-item ps-navbar-station-menu-item--clear" onClick={() => { setStationId(null); setOpen(false); }}>
              Clear this terminal's fixed station
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NavBarScanStation;
