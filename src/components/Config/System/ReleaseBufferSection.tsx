// src/components/Config/System/ReleaseBufferSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: extracted from Config/Integrations/LISSection.tsx
// (now deleted) rather than deleted along with it. This component was always
// a genuinely separate concern from LIS integration itself — the real,
// org-wide default for the Post-Sign-Out Release Buffer feature — that
// happened to be nested under "LIS Integration" navigationally per an
// earlier, explicit product decision ("Under Integration sublevel LIS
// Integrations," per that decision's own original comment). Once LIS
// Integration itself retired as a nav item (its own real fields
// consolidated onto Facility, per a real architectural correction — see
// services/facilities/README.md), this needed its own real, dedicated
// home rather than being lost. Org-wide default only — the real,
// per-facility override still lives on the Facility Configuration edit
// modal (Facility.releaseBufferOverride), same established split as
// idle-session-timeout (see SessionSecuritySection.tsx's own header
// comment).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockReportReleaseService } from '../../../services/reportRelease/mockReportReleaseService';
import type { ReportReleaseOrgConfig } from '../../../services/reportRelease/IReportReleaseService';

// ─── Small reusable toggle ────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

const Toggle: React.FC<ToggleProps> = ({ enabled, onChange, disabled = false, ariaLabel }) => (
  <button
    role="switch"
    aria-checked={enabled}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => !disabled && onChange(!enabled)}
    style={{
      width: '44px', height: '24px', borderRadius: '12px', border: 'none',
      background: disabled ? '#334155' : enabled ? '#0891B2' : '#475569',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <span style={{
      position: 'absolute', top: '3px',
      left: enabled ? '23px' : '3px',
      width: '18px', height: '18px', borderRadius: '50%',
      background: 'white', transition: 'left 0.2s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    }} />
  </button>
);

// ─── Setting row ──────────────────────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
  /** Visually indent to show this setting is a child of another */
  indented?: boolean;
  /** Grey out the entire row when a parent setting is disabled */
  dimmed?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label, description, children, indented = false, dimmed = false,
}) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '14px 16px',
    marginLeft: indented ? '20px' : '0',
    borderLeft: indented ? '2px solid rgba(8,145,178,0.3)' : 'none',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px', marginBottom: '8px',
    opacity: dimmed ? 0.65 : 1,
    transition: 'opacity 0.2s',
  }}>
    <div style={{ flex: 1, marginRight: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
        {description}
      </div>
    </div>
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: '2px' }}>
      {children}
    </div>
  </div>
);

const DURATION_MIN = 1;
const DURATION_MAX = 30;

const ReleaseBufferSection: React.FC = () => {
  const [config, setConfig] = useState<ReportReleaseOrgConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    mockReportReleaseService.getOrgDefault().then(res => {
      if (res.ok) setConfig(res.data);
      setLoading(false);
    });
  }, []);

  const persist = async (next: ReportReleaseOrgConfig) => {
    setConfig(next);
    const res = await mockReportReleaseService.setOrgDefault(next);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (loading || !config) return null;
  const durationDimmed = !config.enabled;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>
          ⏳ Post-Sign-Out Release Buffer
        </h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
          A temporary hold window between sign-out and genuine external release,
          during which the signing pathologist can recall and correct a report
          without triggering a formal amendment. This is the org-wide default —
          individual performing labs can inherit it or define their own values
          on the Facility Configuration edit modal.
        </p>
      </div>

      <SettingRow
        label="Enable Post-Sign-Out Release Buffer"
        description="When on, a signed report is held at Pending Release for the configured duration before genuinely finalizing, unless a bypass rule below applies."
      >
        <Toggle enabled={config.enabled} onChange={val => persist({ ...config, enabled: val })} ariaLabel="Enable Post-Sign-Out Release Buffer" />
      </SettingRow>

      <SettingRow
        label="Buffer Duration"
        description={`How long a report stays recallable after sign-out, in minutes (${DURATION_MIN}–${DURATION_MAX}).`}
        indented
        dimmed={durationDimmed}
      >
        <input
          type="number"
          min={DURATION_MIN}
          max={DURATION_MAX}
          value={config.durationMinutes}
          disabled={!config.enabled}
          onChange={e => {
            const raw = Number(e.target.value);
            const clamped = Number.isFinite(raw) ? Math.min(DURATION_MAX, Math.max(DURATION_MIN, raw)) : config.durationMinutes;
            persist({ ...config, durationMinutes: clamped });
          }}
          style={{
            width: '80px', padding: '8px 12px', borderRadius: '7px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: config.enabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            color: '#f1f5f9', fontSize: '13px', outline: 'none',
            cursor: config.enabled ? 'text' : 'not-allowed',
          }}
        />
      </SettingRow>

      <SettingRow
        label="Bypass Buffer for STAT Cases"
        description="STAT-priority cases release immediately upon sign-out, regardless of the buffer duration above."
        indented
        dimmed={durationDimmed}
      >
        <Toggle
          enabled={config.bypassForStat}
          onChange={val => persist({ ...config, bypassForStat: val })}
          disabled={!config.enabled}
          ariaLabel="Bypass Buffer for STAT Cases"
        />
      </SettingRow>

      <SettingRow
        label="Watermark Banner Text"
        description="Rendered diagonally across any on-screen view of a Pending Release report, and sent through to hardcopy PDF generation."
        indented
        dimmed={durationDimmed}
      >
        <input
          type="text"
          value={config.watermarkText}
          disabled={!config.enabled}
          onChange={e => persist({ ...config, watermarkText: e.target.value })}
          style={{
            width: '360px', padding: '8px 12px', borderRadius: '7px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: config.enabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            color: '#f1f5f9', fontSize: '13px', outline: 'none',
            cursor: config.enabled ? 'text' : 'not-allowed',
          }}
        />
      </SettingRow>

      <SettingRow
        label="Restrict In-House Hardcopy Printing"
        description="Blocks hardcopy printing while a report is Pending Release, by default. An operator can override per print action — the printed PDF still carries the watermark above when they do."
        indented
        dimmed={durationDimmed}
      >
        <Toggle
          enabled={config.restrictHardcopyPrinting}
          onChange={val => persist({ ...config, restrictHardcopyPrinting: val })}
          disabled={!config.enabled}
          ariaLabel="Restrict In-House Hardcopy Printing"
        />
      </SettingRow>

      {saved && (
        <div style={{ marginTop: '4px', marginLeft: '16px', fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
          ✓ Saved
        </div>
      )}
    </div>
  );
};

export default ReleaseBufferSection;
