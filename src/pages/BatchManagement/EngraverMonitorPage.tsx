// src/pages/BatchManagement/EngraverMonitorPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct guidance's own confirmed architectural
// verdict on the Engraver Monitor requirement (Option 3: thin,
// read-only status surface in PathScribe; the Cassette Engine retains
// all real hardware ownership — physical diagnostics, hopper topology,
// direct hardware controls, failover execution).
//
// Deliberately does NOT show: per-hopper fill percentages, laser head
// hours, printhead temperature, firmware version, or any other real,
// granular hardware telemetry — none of that is modeled anywhere in
// PathScribe (EngraverStatusEventPayload.ts's own header explains
// why). Each device card shows only a coarse status, a real,
// human-readable warning summary, and a "Launch Engine Diagnostics"
// link out to the Engine's own native UI for anything deeper.
//
// Same real "own dedicated page under Batch Management, poll-based
// refresh" pattern as PendingBatchQueuePage.tsx — poll rather than a
// live onSnapshot listener, matching this app's own, already-
// established convention (see usePendingEngineNotifications.ts's own
// header for the fuller reasoning).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { fetchEngraverDevices } from '@/services/engravers/fetchEngraverDevices';
import type { EngraverDevice } from '@/services/engravers/fetchEngraverDevices';
import type { EngraverStatus, SupplyWarning, SupplyWarningCode } from '@/types/events/EngraverStatusEventPayload';
import { cassetteColorService } from '@/services';

const POLL_INTERVAL_MS = 30_000;

const STATUS_COLOR: Record<EngraverStatus, string> = {
  online: '#34d399', engraving: '#38bdf8', warning: '#f59e0b', fault: '#f87171', offline: '#8899aa',
};

// Real, label-key-map — the real EngraverStatus value stays untouched
// (used to index STATUS_COLOR above); only the on-screen label is
// translated.
const STATUS_LABEL_KEY: Record<EngraverStatus, string> = {
  online: 'engraverMonitor.status.online', engraving: 'engraverMonitor.status.engraving', warning: 'engraverMonitor.status.warning',
  fault: 'engraverMonitor.status.fault', offline: 'engraverMonitor.status.offline',
};

// Real, per direct guidance's own explicit example ("Warning: Yellow
// Biopsy Low") — a short, human phrase per real, closed supply state,
// combined with the color's own real displayName below, never the raw
// SupplyWarningCode/colorKey shown to a technician.
const SUPPLY_WARNING_LABEL_KEY: Record<SupplyWarningCode, string> = {
  CASSETTE_SUPPLY_LOW: 'engraverMonitor.supplyWarning.CASSETTE_SUPPLY_LOW',
  CASSETTE_SUPPLY_DEPLETED: 'engraverMonitor.supplyWarning.CASSETTE_SUPPLY_DEPLETED',
  COLOR_UNAVAILABLE: 'engraverMonitor.supplyWarning.COLOR_UNAVAILABLE',
};

// Real, module-level (non-hook) helper — takes `t` as a param, same
// pattern established for buildSummary()/resolveSynopticFieldLabel.ts
// elsewhere in this sweep, since it's called from a .map() outside any
// component's own render scope.
function formatSupplyWarning(t: (key: string) => string, warning: SupplyWarning, colorNames: Record<string, string>): string {
  const stateLabel = t(SUPPLY_WARNING_LABEL_KEY[warning.code]);
  if (!warning.colorKey) return stateLabel;
  const colorName = colorNames[warning.colorKey] ?? warning.colorKey;
  return `${colorName} ${stateLabel}`;
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

const EngraverMonitorPage: React.FC = () => {
  const { t } = useTranslation();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('engraverMonitor.pageTitle'), '/batch-management/engraver-monitor'); }, [pushCrumb, t]);

  const [devices, setDevices] = useState<EngraverDevice[]>([]);
  const [loading, setLoading] = useState(true);
  // Real key -> real displayName lookup (cassetteColorService.ts's
  // own real dictionary) — resolved once on mount, same "rarely
  // changes, not worth refetching on every poll tick" reasoning as any
  // other real, admin-editable dictionary in this app.
  const [colorNames, setColorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    cassetteColorService.getAll().then(res => {
      if (res.ok) setColorNames(Object.fromEntries(res.data.map(c => [c.key, c.displayName])));
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchEngraverDevices();
    setDevices(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const counts = devices.reduce(
    (acc, d) => ({ ...acc, [d.status]: acc[d.status] + 1 }),
    { online: 0, engraving: 0, warning: 0, fault: 0, offline: 0 } as Record<EngraverStatus, number>,
  );

  return (
    <div className="ps-batch-page">
      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <div className="ps-batch-page-header">
            <h1 className="ps-batch-page-title">🖨️ {t('engraverMonitor.pageTitle')}</h1>
            <p className="ps-batch-page-subtitle">
              {t('engraverMonitor.pageSubtitle')}
            </p>
          </div>

          <div className="ps-engraver-status-summary">
            {(['online', 'engraving', 'warning', 'fault', 'offline'] as EngraverStatus[]).map(status => (
              <div key={status} className="ps-engraver-status-tile" style={{ '--ps-hue': STATUS_COLOR[status] } as React.CSSProperties}>
                <div className="ps-engraver-status-tile-label">{t(STATUS_LABEL_KEY[status])}</div>
                <div className="ps-engraver-status-tile-count">{counts[status]}</div>
              </div>
            ))}
          </div>

          <div className="ps-batch-toolbar">
            <button className="ps-btn-secondary" onClick={refresh} disabled={loading}>
              {loading ? t('engraverMonitor.refreshing') : `↻ ${t('engraverMonitor.refresh')}`}
            </button>
          </div>

          <div className="ps-batch-section-label">{t('engraverMonitor.devicesSection', { count: devices.length })}</div>
          {loading && devices.length === 0 ? (
            <div className="ps-batch-empty">{t('engraverMonitor.loadingDevices')}</div>
          ) : devices.length === 0 ? (
            <div className="ps-batch-empty">{t('engraverMonitor.noDevices')}</div>
          ) : (
            <div className="ps-engraver-device-grid">
              {devices.map(device => (
                <div key={device.deviceId} className="ps-engraver-device-card" style={{ '--ps-hue': STATUS_COLOR[device.status] } as React.CSSProperties}>
                  <div className="ps-engraver-device-card-header">
                    <div>
                      <div className="ps-engraver-device-name">{device.deviceName ?? device.deviceId}</div>
                      <div className="ps-engraver-device-id">{device.deviceId}</div>
                      {device.locationLabel && <div className="ps-engraver-device-id">{device.locationLabel}</div>}
                    </div>
                    <span className="ps-batch-row-status ps-batch-row-status--hued">
                      {t(STATUS_LABEL_KEY[device.status])}
                    </span>
                  </div>

                  {(device.supplyWarnings.length > 0 || device.warnings.length > 0) && (
                    <ul className="ps-engraver-device-warnings">
                      {device.supplyWarnings.map((w, i) => <li key={`supply-${i}`}>{formatSupplyWarning(t, w, colorNames)}</li>)}
                      {device.warnings.map((w, i) => <li key={`warn-${i}`}>{w}</li>)}
                    </ul>
                  )}

                  <div className="ps-engraver-device-footer">
                    <span className="ps-engraver-device-reported">{t('engraverMonitor.reportedAt', { time: formatTimestamp(device.lastReportedAt) })}</span>
                    {device.diagnosticsUrl && (
                      <a href={device.diagnosticsUrl} target="_blank" rel="noopener noreferrer" className="ps-btn-secondary ps-engraver-diagnostics-link">
                        {t('engraverMonitor.launchDiagnostics')} ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EngraverMonitorPage;
