// src/hooks/useDefaultActionOnScan.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289's own comment thread's "default action fires on the
// next scan" piece — the single highest-leverage turnaround-time
// mechanism in that whole design: the most probable action at a
// given bench (e.g. "Log Slide/Block" at a Microtomy desk) fires the
// moment a technician scans, with no click in between.
//
// Mirrors useGlobalMaterialScanTracking.ts's own real, proven
// structure exactly — same global PATHSCRIBE_SCAN listener, same
// STATION: prefix guard (a station-switch barcode is never also
// treated as a trigger for some other bench's default action), same
// minimal, already-established route exclusion (the Disposal Queue's
// own scan meaning — "dispose this" — must never be overridden by an
// unrelated default action firing on the same scan). Deliberately
// does NOT require the scan to resolve to a specific case/material
// first (unlike useGlobalMaterialScanTracking.ts's own
// resolveMaterialFromScan() gate) — per the original spec's own
// broad framing ("triggers automatically on barcode scans... when
// operating on that bench"), a default action is a general catch-all
// for whatever gets scanned at that bench, not conditioned on a
// specific resolution succeeding first.
//
// Real, deliberate choice to re-resolve station -> group -> action
// fresh inside the scan handler itself, same as
// useGlobalMaterialScanTracking.ts's own station re-fetch — avoids a
// stale, cached action surviving a station switch that happens
// between renders.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router';
import { useEffectiveScanStation } from './useEffectiveScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { mockWorkstationGroupService } from '@/services/workstationGroups/mockWorkstationGroupService';
import { mockActionRegistryService } from '@/services/actionRegistry/mockActionRegistryService';
import type { ScanEvent } from '@/contexts/ScannerProvider';

export function useDefaultActionOnScan() {
  const { effectiveStationId } = useEffectiveScanStation();
  const location = useLocation();

  const handleScan = useCallback(async (scanEvent: ScanEvent) => {
    // Not a station barcode — leave it entirely to the station-switch
    // listener; a real station barcode never also fires some other
    // bench's own default action.
    if (scanEvent.raw?.trim().toUpperCase().startsWith('STATION:')) return;

    // Same real, minimal exclusion as useGlobalMaterialScanTracking.ts
    // — the Disposal Queue's own scan meaning ("dispose this") must
    // never be overridden by an unrelated default action.
    if (location.pathname.startsWith('/batch-management/disposal')) return;

    if (!effectiveStationId) return;
    const stationRes = await mockScanStationService.getById(effectiveStationId);
    if (!stationRes.ok || !stationRes.data.workstationGroupId) return;

    const groupRes = await mockWorkstationGroupService.getById(stationRes.data.workstationGroupId);
    if (!groupRes.ok || !groupRes.data.defaultActionId) return;

    const action = mockActionRegistryService.getActionById(groupRes.data.defaultActionId);
    if (!action || !action.isActive) return;

    mockActionRegistryService.executeAction(action, scanEvent.raw);
  }, [effectiveStationId, location.pathname]);

  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent) handleScan(scanEvent);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [handleScan]);
}
