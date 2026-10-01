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
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import { mockActionRegistryService } from '@/services/actionRegistry/mockActionRegistryService';
import { mockWorkstationGroupService } from '@/services/workstationGroups/mockWorkstationGroupService';
import { resolveBenchRouteForGroup } from '@/services/workstationGroups/resolveStationBenchRoute';
import { mockActionGroupService } from '@/services/actionGroups/mockActionGroupService';

export function NavBarScanStation() {
  const { t } = useTranslation();
  const { effectiveStationId, isDeviceLocked, isUserDefault, setStationId } = useEffectiveScanStation();
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  // Real fix, per PS-289's own comment thread — the one piece its own
  // addendum named and never actually delivered: "dedicatedPageRoute"
  // was captured by the admin CRUD screen but nothing ever consumed
  // it to deep-link a tech anywhere. Now that PS-284/285/286's real
  // bench pages exist (/workstations/microtomy, /workstations/
  // embedding, /workstations/slide-distribution), this has real
  // destinations to point to. Resolved in the same effect that
  // already resolves the station's WorkstationGroup below — no
  // second fetch.
  const [benchRoute, setBenchRoute] = useState<string | undefined>(undefined);

  const loadStations = () => {
    mockScanStationService.getAll().then(res => {
      if (res.ok) setStations(res.data.filter(s => s.status === 'Active'));
    });
  };

  useEffect(() => { loadStations(); }, []);

  // Real, per PS-289's own comment thread — the actual runtime
  // payoff of the whole WorkstationGroup design: the moment the
  // real, effective station changes (selected here, or resolved from
  // a device lock / user default at login), resolve its own
  // WorkstationGroup and push that group's real functionalArea into
  // the Action Registry, so getEligibleActions() picks up real,
  // station-scoped actions automatically — no separate step, no
  // action from the technician beyond picking their station.
  //
  // Real, per PS-289's own comment thread's "loading a specific
  // action group" piece — also resolves the group's own real
  // defaultActionGroupId + allowedActionGroupIds into their actual
  // ActionGroup records, flattens their actionIds, and pushes that
  // into setCurrentActionGroupActionIds. A real, curated bundle
  // (e.g. "Log Slide/Block") becomes eligible the same automatic,
  // zero-step way functionalArea tagging already does.
  useEffect(() => {
    if (!effectiveStationId) {
      mockActionRegistryService.setCurrentStationProfile(undefined);
      mockActionRegistryService.setCurrentActionGroupActionIds(undefined);
      setBenchRoute(undefined);
      return;
    }
    mockScanStationService.getById(effectiveStationId).then(stationRes => {
      if (!stationRes.ok || !stationRes.data.workstationGroupId) {
        mockActionRegistryService.setCurrentStationProfile(undefined);
        mockActionRegistryService.setCurrentActionGroupActionIds(undefined);
        setBenchRoute(undefined);
        return;
      }
      mockWorkstationGroupService.getById(stationRes.data.workstationGroupId).then(groupRes => {
        mockActionRegistryService.setCurrentStationProfile(groupRes.ok ? groupRes.data.functionalArea : undefined);
        // Real fix, found by this app's own inline-CSS/business-logic
        // sweep: delegates to resolveStationBenchRoute.ts's shared
        // Active-gated route rule — the same real "only a real route
        // on an Active group" guard ScanStationPrompt.tsx's own
        // one-time login confirmation uses — instead of a second,
        // independently-maintained copy of the same gate. Passes the
        // group already fetched above rather than re-fetching it.
        setBenchRoute(resolveBenchRouteForGroup(groupRes));
        if (!groupRes.ok) { mockActionRegistryService.setCurrentActionGroupActionIds(undefined); return; }

        const actionGroupIds = [groupRes.data.defaultActionGroupId, ...(groupRes.data.allowedActionGroupIds ?? [])].filter((id): id is string => !!id);
        if (actionGroupIds.length === 0) { mockActionRegistryService.setCurrentActionGroupActionIds(undefined); return; }

        Promise.all(actionGroupIds.map(id => mockActionGroupService.getById(id))).then(results => {
          const flattened = results.filter(r => r.ok).flatMap(r => r.ok ? r.data.actionIds : []);
          mockActionRegistryService.setCurrentActionGroupActionIds(flattened);
        });
      });
    });
  }, [effectiveStationId]);

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
  const provenance = isDeviceLocked ? t('navBarScanStation.terminalFixed') : isUserDefault ? t('navBarScanStation.yourDefault') : t('navBarScanStation.noStationSet');

  return (
    <div className="ps-navbar-station-wrap">
      {benchRoute && (
        <button
          type="button"
          className="ps-navbar-bench-btn"
          onClick={() => navigate(benchRoute)}
          title={t('navBarScanStation.goToBenchFor', { station: current?.name ?? t('navBarScanStation.thisStation') })}
        >
          {t('navBarScanStation.goToBench')}
        </button>
      )}
      <button
        type="button"
        className="ps-navbar-station-btn"
        onClick={handleToggleOpen}
        title={current ? t('navBarScanStation.provenanceStationClickToChange', { provenance, station: current.name }) : t('navBarScanStation.noStationClickToSet')}
      >
        📍 {current ? current.name : t('navBarScanStation.noStation')}
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
              {t('navBarScanStation.clearFixedStation')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NavBarScanStation;
