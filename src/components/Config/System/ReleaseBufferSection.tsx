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
import { useTranslation } from 'react-i18next';
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
    className={`ps-rbuf-toggle ${disabled ? 'ps-rbuf-toggle--disabled' : enabled ? 'ps-rbuf-toggle--on' : 'ps-rbuf-toggle--off'}`}
  >
    <span className={`ps-rbuf-toggle-thumb ${enabled ? 'ps-rbuf-toggle-thumb--on' : 'ps-rbuf-toggle-thumb--off'}`} />
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
  <div className={`ps-rbuf-setting-row ${indented ? 'ps-rbuf-setting-row--indented' : ''} ${dimmed ? 'ps-rbuf-setting-row--dimmed' : ''}`}>
    <div className="ps-rbuf-setting-row-text">
      <div className="ps-rbuf-setting-row-label">
        {label}
      </div>
      <div className="ps-rbuf-setting-row-desc">
        {description}
      </div>
    </div>
    <div className="ps-rbuf-setting-row-control">
      {children}
    </div>
  </div>
);

const DURATION_MIN = 1;
const DURATION_MAX = 30;

const ReleaseBufferSection: React.FC = () => {
  const { t } = useTranslation();
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
      <div className="ps-rbuf-header">
        <h2 className="ps-rbuf-title">
          {t('releaseBufferSection.title')}
        </h2>
        <p className="ps-rbuf-subtitle">
          {t('releaseBufferSection.subtitle')}
        </p>
      </div>

      <SettingRow
        label={t('releaseBufferSection.settings.enableBuffer.label')}
        description={t('releaseBufferSection.settings.enableBuffer.description')}
      >
        <Toggle enabled={config.enabled} onChange={val => persist({ ...config, enabled: val })} ariaLabel={t('releaseBufferSection.settings.enableBuffer.label')} />
      </SettingRow>

      <SettingRow
        label={t('releaseBufferSection.settings.bufferDuration.label')}
        description={t('releaseBufferSection.settings.bufferDuration.description', { min: DURATION_MIN, max: DURATION_MAX })}
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
          className={`ps-rbuf-input ps-rbuf-input--number ${config.enabled ? 'ps-rbuf-input--enabled' : 'ps-rbuf-input--disabled'}`}
        />
      </SettingRow>

      <SettingRow
        label={t('releaseBufferSection.settings.bypassForStat.label')}
        description={t('releaseBufferSection.settings.bypassForStat.description')}
        indented
        dimmed={durationDimmed}
      >
        <Toggle
          enabled={config.bypassForStat}
          onChange={val => persist({ ...config, bypassForStat: val })}
          disabled={!config.enabled}
          ariaLabel={t('releaseBufferSection.settings.bypassForStat.label')}
        />
      </SettingRow>

      <SettingRow
        label={t('releaseBufferSection.settings.watermarkText.label')}
        description={t('releaseBufferSection.settings.watermarkText.description')}
        indented
        dimmed={durationDimmed}
      >
        <input
          type="text"
          value={config.watermarkText}
          disabled={!config.enabled}
          onChange={e => persist({ ...config, watermarkText: e.target.value })}
          className={`ps-rbuf-input ps-rbuf-input--text ${config.enabled ? 'ps-rbuf-input--enabled' : 'ps-rbuf-input--disabled'}`}
        />
      </SettingRow>

      <SettingRow
        label={t('releaseBufferSection.settings.restrictHardcopy.label')}
        description={t('releaseBufferSection.settings.restrictHardcopy.description')}
        indented
        dimmed={durationDimmed}
      >
        <Toggle
          enabled={config.restrictHardcopyPrinting}
          onChange={val => persist({ ...config, restrictHardcopyPrinting: val })}
          disabled={!config.enabled}
          ariaLabel={t('releaseBufferSection.settings.restrictHardcopy.label')}
        />
      </SettingRow>

      {saved && (
        <div className="ps-rbuf-saved">
          {t('releaseBufferSection.saved')}
        </div>
      )}
    </div>
  );
};

export default ReleaseBufferSection;
