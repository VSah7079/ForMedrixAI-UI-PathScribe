// src/components/Config/System/ContributionSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 of the Orchestration Intelligent Charge Capture & Workload
// Analytics spec (System_Configuration toggle infrastructure) — this
// section is deliberately scoped to just the peer-visibility flag for now.
// Real per-case wRVU/workload tracking (the rest of that spec's Phase 2/3)
// is not built here — it's pending legal/compliance review before any
// AI-driven charge-capture logic gets built, per the decision to query
// the attorney first.
//
// Resolves the privacy question raised during the ProductivityTab.tsx real-
// data review: pathologists' own case counts are now genuinely real (see
// components/Contribution/productivityCalculations.ts), but showing peer
// averages/rankings alongside those real numbers needs to be an
// institutional choice, not a default. This is that choice, stored on the
// real, shared SystemConfig (not a bespoke new service) since it's a
// simple, single, org-wide boolean, same shape as voiceEnabled elsewhere
// on that same config object.
//
// Real fix, Pete's own clinical-informatics guidance: added the real
// facilityTimezone setting - a real, admin-visible way to actually change
// the config value computeMonthlyCaseCounts/computeRvuSummary/
// computeMonthlyRvu genuinely depend on (see utils/facilityTime.ts). A
// real select of common IANA timezones, not free text - an admin typo
// would silently fall back to raw UTC bucketing (see
// getFacilityDateParts' own honest fallback) rather than fail loudly, so
// a validated dropdown is the safer real choice here.
//
// Real fix (batch 35, i18n sweep): converted from one-off inline
// `style={{...}}` objects to this app's already-established `.ps-conf-*`
// Config-page class family (see pathscribe.css) — reusing it exactly
// where it matched (`.ps-conf-select`, `.ps-conf-section-title`,
// `.ps-conf-label`, `.ps-conf-desc`, `.ps-conf-hint--success`) and adding
// a few small `.ps-contrib-settings__*` classes only where this file's own
// spacing genuinely differed from the shared classes.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useSystemConfig } from '../../../contexts/SystemConfigContext';

// Real, common IANA timezone identifiers covering every real US time zone
// plus a few common international ones - not exhaustive, but every real
// entry here is a genuine, valid Intl.DateTimeFormat timeZone value.
const TIMEZONE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'America/New_York',    labelKey: 'contributionSettings.timezone.options.easternUs' },
  { value: 'America/Chicago',     labelKey: 'contributionSettings.timezone.options.centralUs' },
  { value: 'America/Denver',      labelKey: 'contributionSettings.timezone.options.mountainUs' },
  { value: 'America/Phoenix',     labelKey: 'contributionSettings.timezone.options.arizonaUs' },
  { value: 'America/Los_Angeles', labelKey: 'contributionSettings.timezone.options.pacificUs' },
  { value: 'America/Anchorage',   labelKey: 'contributionSettings.timezone.options.alaskaUs' },
  { value: 'Pacific/Honolulu',    labelKey: 'contributionSettings.timezone.options.hawaiiUs' },
  { value: 'Europe/London',       labelKey: 'contributionSettings.timezone.options.ukTime' },
  { value: 'UTC',                 labelKey: 'contributionSettings.timezone.options.utc' },
];

const ContributionSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { config, updateConfig } = useSystemConfig();
  const [saved, setSaved] = React.useState(false);

  const handleToggle = (value: boolean) => {
    updateConfig({ showPeerAveragesToPathologists: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTimezoneChange = (value: string) => {
    updateConfig({ facilityTimezone: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="ps-contrib-settings">
      <div className="ps-contrib-settings__header">
        <h1 className="ps-conf-section-title">{t('contributionSettings.title')}</h1>
        <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
          {t('contributionSettings.description')}
        </p>
      </div>

      <div className="ps-contrib-settings__card">
        <div className="ps-conf-label ps-contrib-settings__label">
          {t('contributionSettings.timezone.label')}
        </div>
        <select
          value={config.facilityTimezone}
          onChange={e => handleTimezoneChange(e.target.value)}
          className="ps-conf-select ps-contrib-settings__select"
        >
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz.value} value={tz.value}>{t(tz.labelKey)}</option>
          ))}
        </select>
        <p className="ps-conf-desc ps-contrib-settings__hint">
          {t('contributionSettings.timezone.hint')}
        </p>
      </div>

      <div className="ps-contrib-settings__card">
        <div className="ps-conf-label ps-contrib-settings__label">
          {t('contributionSettings.peerComparison.label')}
        </div>
        <label className="ps-contrib-settings__toggle-label">
          <input
            type="checkbox"
            checked={config.showPeerAveragesToPathologists}
            onChange={e => handleToggle(e.target.checked)}
          />
          <span className="ps-contrib-settings__toggle-text">
            {t('contributionSettings.peerComparison.toggle')}
          </span>
        </label>
        <p className="ps-conf-desc ps-contrib-settings__hint">
          {t('contributionSettings.peerComparison.hint')}
        </p>
        {saved && (
          <div className="ps-conf-hint ps-conf-hint--success ps-contrib-settings__saved">
            {t('contributionSettings.saved')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContributionSettingsSection;
