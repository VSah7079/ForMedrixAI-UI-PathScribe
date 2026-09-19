// src/components/Config/System/ConcordanceReviewSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("keep track of these settings so the
// customer can control this concordance review behavior") — the real,
// org-wide default UI for the session's own "do both" decision:
// automatic frozen-vs-final discordance flagging, and the optional,
// mandatory review screen at sign-out. Two independent settings, per
// that same decision.
//
// Org-wide default only, same real split as ReleaseBufferSection.tsx's
// own header comment describes — the real, per-facility override
// lives on Facility.concordanceReviewSettingsOverride (see
// services/facilities/IFacilityService.ts's own doc comment), set on
// the Facility Configuration edit modal, not duplicated here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockConcordanceReviewSettingsService } from '../../../services/qualitySettings/mockConcordanceReviewSettingsService';
import type { ConcordanceReviewOrgConfig } from '../../../services/qualitySettings/IConcordanceReviewSettingsService';

// ─── Small reusable toggle (same, local pattern ReleaseBufferSection.tsx/
//     FontsSection.tsx each already keep their own copy of) ───────────────────

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

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
  indented?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children, indented = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '14px 16px',
    marginLeft: indented ? '20px' : '0',
    borderLeft: indented ? '2px solid rgba(8,145,178,0.3)' : 'none',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px', marginBottom: '8px',
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

const ConcordanceReviewSettingsSection: React.FC = () => {
  const [config, setConfig] = useState<ConcordanceReviewOrgConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    mockConcordanceReviewSettingsService.getOrgDefault().then(res => {
      if (res.ok) setConfig(res.data);
      setLoading(false);
    });
  }, []);

  const persist = async (next: ConcordanceReviewOrgConfig) => {
    setConfig(next);
    const res = await mockConcordanceReviewSettingsService.setOrgDefault(next);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (loading || !config) return null;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>
          ⚖ Preliminary-vs-Final Concordance Review
        </h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
          Controls the automatic comparison of a preliminary finding (e.g. a frozen section
          diagnosis) against the corresponding final diagnosis, and the optional review screen
          shown at sign-out. The pathologist always makes the actual concordance determination —
          these settings control whether the system helps surface it, never whether the
          pathologist's own judgment is required. This is the org-wide default — individual
          performing labs can inherit it or define their own values on the Facility
          Configuration edit modal, and individual staff members can further override either
          setting for themselves, per the same real Enterprise → Facility → Staff cascade this
          app already uses for Cytology QC sampling rates.
        </p>
      </div>

      <SettingRow
        label="Enable Automatic Comparison"
        description="When on, the system compares a preliminary finding against the corresponding final diagnosis and flags a real discordance for pathologist review — the pathologist always confirms or adjusts the determination; this never auto-grades a result on its own."
      >
        <Toggle enabled={config.aiComparisonEnabled} onChange={val => persist({ ...config, aiComparisonEnabled: val })} ariaLabel="Enable Automatic Comparison" />
      </SettingRow>

      <SettingRow
        label="Require Review Screen at Sign-Out"
        description="When on, an extra screen appears at sign-out showing the preliminary-vs-final comparison before the pathologist can complete sign-out — real, deliberate friction so the comparison is actively reviewed rather than left to whether a flag happened to fire."
        indented
      >
        <Toggle enabled={config.reviewScreenEnabled} onChange={val => persist({ ...config, reviewScreenEnabled: val })} ariaLabel="Require Review Screen at Sign-Out" />
      </SettingRow>

      {saved && (
        <div style={{ marginTop: '4px', marginLeft: '16px', fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
          ✓ Saved
        </div>
      )}
    </div>
  );
};

export default ConcordanceReviewSettingsSection;
