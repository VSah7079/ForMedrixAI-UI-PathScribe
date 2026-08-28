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
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { fetchEngraverDevices } from '@/services/engravers/fetchEngraverDevices';
import type { EngraverDevice } from '@/services/engravers/fetchEngraverDevices';
import type { EngraverStatus, SupplyWarning, SupplyWarningCode } from '@/types/events/EngraverStatusEventPayload';
import { mockCassetteColorService } from '@/services/cassetteColors/mockCassetteColorService';

const POLL_INTERVAL_MS = 30_000;

const STATUS_COLOR: Record<EngraverStatus, string> = {
  online: '#34d399', engraving: '#38bdf8', warning: '#f59e0b', fault: '#f87171', offline: '#8899aa',
};

const STATUS_LABEL: Record<EngraverStatus, string> = {
  online: 'Online', engraving: 'Engraving', warning: 'Warning', fault: 'Fault', offline: 'Offline',
};

// Real, per direct guidance's own explicit example ("Warning: Yellow
// Biopsy Low") — a short, human phrase per real, closed supply state,
// combined with the color's own real displayName below, never the raw
// SupplyWarningCode/colorKey shown to a technician.
const SUPPLY_WARNING_LABEL: Record<SupplyWarningCode, string> = {
  CASSETTE_SUPPLY_LOW: 'Low', CASSETTE_SUPPLY_DEPLETED: 'Depleted', COLOR_UNAVAILABLE: 'Unavailable',
};

function formatSupplyWarning(warning: SupplyWarning, colorNames: Record<string, string>): string {
  const stateLabel = SUPPLY_WARNING_LABEL[warning.code];
  if (!warning.colorKey) return stateLabel;
  const colorName = colorNames[warning.colorKey] ?? warning.colorKey;
  return `${colorName} ${stateLabel}`;
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

const EngraverMonitorPage: React.FC = () => {
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb('Engraver Monitor', '/batch-management/engraver-monitor'); }, [pushCrumb]);

  const [devices, setDevices] = useState<EngraverDevice[]>([]);
  const [loading, setLoading] = useState(true);
  // Real key -> real displayName lookup (mockCassetteColorService.ts's
  // own real dictionary) — resolved once on mount, same "rarely
  // changes, not worth refetching on every poll tick" reasoning as any
  // other real, admin-editable dictionary in this app.
  const [colorNames, setColorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    mockCassetteColorService.getAll().then(res => {
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
            <h1 className="ps-batch-page-title">🖨️ Engraver Monitor</h1>
            <p className="ps-batch-page-subtitle">
              A real, high-level status summary for every engraver the Cassette Engine reports on — status, real
              warning summaries, and a direct link to the Engine's own diagnostics for anything deeper. PathScribe
              doesn't model hopper-level detail or hardware telemetry here; that stays the Engine's own job.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {(['online', 'engraving', 'warning', 'fault', 'offline'] as EngraverStatus[]).map(status => (
              <div key={status} style={{
                flex: '1 1 120px', padding: '12px 16px', borderRadius: 8,
                background: `${STATUS_COLOR[status]}14`, border: `1px solid ${STATUS_COLOR[status]}2e`,
              }}>
                <div style={{ fontSize: 12, color: '#8899aa' }}>{STATUS_LABEL[status]}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLOR[status] }}>{counts[status]}</div>
              </div>
            ))}
          </div>

          <div className="ps-batch-toolbar">
            <button className="ps-btn-secondary" onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <div className="ps-batch-section-label">Devices ({devices.length})</div>
          {loading && devices.length === 0 ? (
            <div className="ps-batch-empty">Loading real device status…</div>
          ) : devices.length === 0 ? (
            <div className="ps-batch-empty">No engraver has reported status yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {devices.map(device => (
                <div key={device.deviceId} style={{
                  border: '1px solid #2a3542', borderRadius: 8, padding: 14,
                  borderLeft: `3px solid ${STATUS_COLOR[device.status]}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{device.deviceName ?? device.deviceId}</div>
                      <div style={{ fontSize: 12, color: '#8899aa' }}>{device.deviceId}</div>
                      {device.locationLabel && <div style={{ fontSize: 12, color: '#8899aa' }}>{device.locationLabel}</div>}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: `${STATUS_COLOR[device.status]}22`, color: STATUS_COLOR[device.status],
                    }}>
                      {STATUS_LABEL[device.status]}
                    </span>
                  </div>

                  {(device.supplyWarnings.length > 0 || device.warnings.length > 0) && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#f59e0b' }}>
                      {device.supplyWarnings.map((w, i) => <li key={`supply-${i}`}>{formatSupplyWarning(w, colorNames)}</li>)}
                      {device.warnings.map((w, i) => <li key={`warn-${i}`}>{w}</li>)}
                    </ul>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: '#8899aa' }}>Reported {formatTimestamp(device.lastReportedAt)}</span>
                    {device.diagnosticsUrl && (
                      <a href={device.diagnosticsUrl} target="_blank" rel="noopener noreferrer" className="ps-btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                        Launch Engine Diagnostics ↗
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
