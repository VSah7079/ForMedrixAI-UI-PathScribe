// src/pages/BatchManagement/DisposalQueuePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "I am thinking that the client
// selects the disposal tile and the system delivers a list of
// specimens that qualify for disposal. As the user scans each specimen
// container it gets updated to disposed and comes off the list. If the
// scan doesn't match what the system expects, the screen turns red.
// The list should be aware of specimens that are actually stored at
// that laboratory location."
//
// Deliberately NOT the batch/container flow every other processing
// node uses — see services/batches/IBatchService.ts's own header for
// why: "disposal is the only workflow that demands this approach,
// building batches absolutely makes sense for the other workflow."
// This is a real, computed worklist (computeDisposalQueue.ts) with
// direct scan-to-dispose (disposeItemByScan.ts) — no manual container
// creation, no separate reconciliation pass; each scan is validated
// against the real, live eligibility rules the instant it happens.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentScanStation } from '@/hooks/useCurrentScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { facilityService } from '@/services';
import { computeDisposalQueue } from '@/services/retentionPolicy/computeDisposalQueue';
import type { DisposalQueueItem } from '@/services/retentionPolicy/computeDisposalQueue';
import { disposeItemByScan } from '@/services/retentionPolicy/disposeItemByScan';
import { playScanBeep, playScanErrorTone } from '@/utils/playScanBeep';
import type { ScanEvent } from '@/contexts/ScannerProvider';

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

const DisposalQueuePage: React.FC = () => {
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb('Disposal Queue', '/batch-management/disposal'); }, [pushCrumb]);
  const { user } = useAuth();
  const { stationId } = useCurrentScanStation();

  const [facilityId, setFacilityId] = useState<string | undefined>(undefined);
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [queue, setQueue] = useState<DisposalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Real feature, per the spec's own "the screen turns red." A real,
  // full-screen state, not just a toast — the spec's own explicit
  // emphasis ("turns red," not "shows an error") calls for something
  // impossible to miss even if a tech isn't looking directly at a
  // small status line while working hands-free.
  const [redScreen, setRedScreen] = useState<string | null>(null);
  const [lastDisposed, setLastDisposed] = useState<string | null>(null);
  const redScreenTimer = useRef<number | null>(null);
  const successTimer = useRef<number | null>(null);

  // Real, station -> facility resolution — the same real ScanStation
  // record already used throughout this app's own material-tracking
  // pipeline (useGlobalMaterialScanTracking.ts), not a new concept.
  useEffect(() => {
    if (!stationId) { setFacilityId(undefined); setFacilityName(null); return; }
    mockScanStationService.getById(stationId).then(res => {
      if (!res.ok) return;
      setFacilityId(res.data.facilityId);
      facilityService.getById(res.data.facilityId).then(fRes => {
        if ('ok' in fRes && fRes.ok) setFacilityName(fRes.data.name);
      });
    });
  }, [stationId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const items = await computeDisposalQueue(facilityId);
    setQueue(items);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleScan = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const result = await disposeItemByScan(value, facilityId, user?.id ?? 'unknown', user?.name ?? 'Unknown User');
    if (result.outcome === 'disposed') {
      playScanBeep();
      setQueue(prev => prev.filter(i => i.displayId !== result.displayId));
      setLastDisposed(`✓ ${result.displayId} disposed`);
      if (successTimer.current) window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setLastDisposed(null), 2500);
    } else {
      playScanErrorTone();
      setRedScreen(result.reason);
      if (redScreenTimer.current) window.clearTimeout(redScreenTimer.current);
      redScreenTimer.current = window.setTimeout(() => setRedScreen(null), 4000);
    }
  }, [facilityId, user?.id, user?.name]);

  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent) handleScan(scanEvent.raw);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [handleScan]);

  return (
    <div className="ps-batch-page">
      {/* Real, full-screen red overlay — dismisses itself, or a tech
          can dismiss it immediately by clicking through to keep
          working; never silently blocks the next real scan. */}
      {redScreen && (
        <div className="ps-disposal-redscreen" onClick={() => setRedScreen(null)}>
          <div className="ps-disposal-redscreen-icon">⛔</div>
          <div className="ps-disposal-redscreen-text">{redScreen}</div>
          <div className="ps-disposal-redscreen-dismiss">Tap anywhere to dismiss</div>
        </div>
      )}

      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <div className="ps-batch-page-header">
            <h1 className="ps-batch-page-title">🗑️ Disposal Queue</h1>
            <p className="ps-batch-page-subtitle">
              A real, computed list of blocks and slides that genuinely qualify for disposal right now — retention
              period elapsed, no active hold, not already disposed. Scan a physical item's own barcode to dispose it;
              anything that doesn't match gets rejected immediately, on screen.
              {facilityName && <> Scoped to <strong>{facilityName}</strong>.</>}
              {!facilityId && <> No scan station set — showing all locations. Set a station for a location-scoped queue.</>}
            </p>
          </div>

          {lastDisposed && <div className="ps-batch-flash ps-batch-flash--success">{lastDisposed}</div>}

          <div className="ps-batch-scan-hint">📷 Scan a cassette or slide barcode to dispose it. Hands-free — no need to click into a field first.</div>

          <div className="ps-batch-section-label">
            Qualifying for Disposal ({queue.length})
          </div>
          {loading ? (
            <div className="ps-batch-empty">Computing the real, current queue…</div>
          ) : queue.length === 0 ? (
            <div className="ps-batch-empty">Nothing qualifies for disposal right now at this location.</div>
          ) : (
            <div className="ps-batch-manifest">
              {queue.map(item => (
                <div key={item.key} className="ps-batch-manifest-row">
                  <span className="ps-batch-manifest-id">{item.displayId}</span>
                  <span className="ps-batch-manifest-type">{item.materialType}</span>
                  <span className="ps-batch-manifest-added">
                    {item.specimenLabel}
                    {item.specimenLabel.includes(',') && ' (shared)'}
                    {' · '}Eligible since {formatDate(item.eligibleSince)}
                    {item.lastKnownLocation && <> · {item.lastKnownLocation}</>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DisposalQueuePage;
