// src/hooks/useGlobalStationSwitch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "MVP Station-Switching via
// Barcode Label... A PA or tech can scan a station barcode at any
// time, even while actively dictating or grossing a specimen. The
// application detects the STATION: prefix from the scanner input
// stream, interrupts standard barcode processing, and triggers a
// station switch event."
//
// A real, separate listener from useGlobalMaterialScanTracking.ts —
// deliberately two independent listeners on the same real,
// global PATHSCRIBE_SCAN event (contexts/ScannerProvider.tsx) rather
// than one handler trying to do both jobs, since the two scan kinds
// (a material barcode, a station barcode) are unrelated actions with
// unrelated real consequences. Checks the STATION: prefix FIRST and
// returns early on a match — a real station barcode is never also
// treated as an (inevitably non-matching) material scan.
//
// Real, critical safety rule, per direct follow-up's own table: no
// unsaved data switches instantly with a toast; real unsaved data
// blocks the switch and hands off to a real 3-choice guard
// (StationSwitchGuardModal.tsx) rather than silently discarding or
// silently ignoring the scan.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import { useEffectiveScanStation } from './useEffectiveScanStation';
import { useDirtyState } from '@/contexts/DirtyStateContext';
import type { ScanEvent } from '@/contexts/ScannerProvider';

const STATION_PREFIX = 'STATION:';

export interface PendingStationSwitch {
  station: ScanStation;
}

export function useGlobalStationSwitch() {
  const { setStationId } = useEffectiveScanStation();
  const { isDirty, getSaveHandler, getDiscardHandler } = useDirtyState();
  const [pending, setPending] = useState<PendingStationSwitch | null>(null);

  const handleScan = useCallback(async (scanEvent: ScanEvent) => {
    const raw = scanEvent.raw?.trim() ?? '';
    if (!raw.toUpperCase().startsWith(STATION_PREFIX)) return; // Not a station barcode — leave it entirely to material-scan tracking.

    const code = raw.slice(STATION_PREFIX.length).trim();
    const result = await mockScanStationService.getByBarcodeCode(code);
    if (!result.ok) {
      toast.warn(`Scanned an unrecognized station barcode ("${code}").`);
      return;
    }
    const station = result.data;

    if (!isDirty) {
      setStationId(station.id);
      toast.info(`📍 Switched to ${station.name}.`);
      return;
    }

    // Real, critical safety rule: real unsaved data blocks the
    // immediate switch — hands off to the real guard modal instead.
    setPending({ station });
  }, [isDirty, setStationId]);

  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent) handleScan(scanEvent);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [handleScan]);

  const saveAndSwitch = useCallback(async () => {
    if (!pending) return;
    const save = getSaveHandler();
    if (save) {
      const saved = await save();
      if (!saved) {
        toast.error('Could not save — a newer version exists. Station not switched.');
        setPending(null);
        return;
      }
    }
    setStationId(pending.station.id);
    toast.success(`📍 Saved and switched to ${pending.station.name}.`);
    setPending(null);
  }, [pending, getSaveHandler, setStationId]);

  const discardAndSwitch = useCallback(() => {
    if (!pending) return;
    const discard = getDiscardHandler();
    if (discard) discard();
    setStationId(pending.station.id);
    toast.info(`📍 Discarded changes and switched to ${pending.station.name}.`);
    setPending(null);
  }, [pending, getDiscardHandler, setStationId]);

  const cancelSwitch = useCallback(() => {
    setPending(null);
  }, []);

  return { pending, saveAndSwitch, discardAndSwitch, cancelSwitch };
}
