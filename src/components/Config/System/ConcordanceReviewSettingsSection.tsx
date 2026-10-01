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
//
// i18n sweep (batch 45): this file had zero existing CSS classes —
// entirely hand-rolled inline `style={{...}}`, including its own local
// Toggle (its header comment already flags this as a repeated local
// pattern also kept by ReleaseBufferSection.tsx/FontsSection.tsx). The
// toggle shares FontsSection.tsx's `.config-toggle-btn*` (batch 37)
// 3-state colors (#0891B2/#475569/#334155) and 18px thumb, but its
// track is a genuinely different size (44×24px + 12px radius, vs
// FontsSection's 40×22px + 11px radius, and a 3px/23px thumb inset/
// travel vs FontsSection's 2px/20px) — too many small differences at
// once to force a reuse, so it gets its own `.ps-concordance-toggle*`
// family. Its title, though, is an exact match for the existing
// `.config-fonts-title` class (18px/700/#f1f5f9/margin 0 0 4px) and is
// reused directly. Everything else is a new `.ps-concordance__*`
// family, following the file's own header's naming intent.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
    className={`ps-concordance-toggle ps-concordance-toggle--${disabled ? 'disabled' : enabled ? 'on' : 'off'}`}
  >
    <span className={`ps-concordance-toggle__thumb${enabled ? ' ps-concordance-toggle__thumb--on' : ''}`} />
  </button>
);

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
  indented?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children, indented = false }) => (
  <div className={`ps-concordance__row${indented ? ' ps-concordance__row--indented' : ''}`}>
    <div className="ps-concordance__row-text">
      <div className="ps-concordance__row-label">
        {label}
      </div>
      <div className="ps-concordance__row-desc">
        {description}
      </div>
    </div>
    <div className="ps-concordance__row-control">
      {children}
    </div>
  </div>
);

const ConcordanceReviewSettingsSection: React.FC = () => {
  const { t } = useTranslation();
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

  const autoComparisonLabel = t('concordanceReviewSettingsSection.autoComparison.label');
  const reviewScreenLabel = t('concordanceReviewSettingsSection.reviewScreen.label');

  return (
    <div>
      <div className="ps-concordance__header">
        <h2 className="config-fonts-title">
          ⚖ {t('concordanceReviewSettingsSection.title')}
        </h2>
        <p className="ps-concordance__subtitle">
          {t('concordanceReviewSettingsSection.subtitle')}
        </p>
      </div>

      <SettingRow
        label={autoComparisonLabel}
        description={t('concordanceReviewSettingsSection.autoComparison.description')}
      >
        <Toggle enabled={config.aiComparisonEnabled} onChange={val => persist({ ...config, aiComparisonEnabled: val })} ariaLabel={autoComparisonLabel} />
      </SettingRow>

      <SettingRow
        label={reviewScreenLabel}
        description={t('concordanceReviewSettingsSection.reviewScreen.description')}
        indented
      >
        <Toggle enabled={config.reviewScreenEnabled} onChange={val => persist({ ...config, reviewScreenEnabled: val })} ariaLabel={reviewScreenLabel} />
      </SettingRow>

      {saved && (
        <div className="ps-concordance__saved">
          ✓ {t('concordanceReviewSettingsSection.saved')}
        </div>
      )}
    </div>
  );
};

export default ConcordanceReviewSettingsSection;
