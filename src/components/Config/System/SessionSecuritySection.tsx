// src/components/Config/System/SessionSecuritySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Org-wide default for idle session timeout (Phase 1 of the Inactivity
// Timeout & Draft Recovery spec, complete). Per-performing-lab
// overrides are set on the Facility Configuration edit modal instead — this
// screen only controls the org-wide fallback used when a lab has no
// override, or when no case is currently open (Worklist, Home, etc.).
//
// Deliberately its own small section rather than folded into
// RetentionSection.tsx (a related-sounding but conceptually different
// concept — how long DATA is retained, not how long an ACTIVE SESSION
// stays live) — also a natural home for Phase 2/3's related settings
// (draft retention days, encryption toggle) once those are built, rather
// than needing a second new section added later.
//
// i18n sweep (batch 38): inline layout styles moved to a new
// `.ps-session-security*` class family — the header/title/card values
// (22px title, #fff, #1f2937 border, 12px radius) sit close to but not
// exactly on the established `.ps-conf-section-title`/`.ps-conf-card`
// classes (20px, var(--ps-conf-text) #e2e8f0, var(--ps-conf-border)
// #1e293b, 10px radius, 0 24px padding) — different enough on several
// values at once that reusing them would visibly change this page, so
// this keeps its own small family instead. The select's fixed 240px
// width is a real, separate modifier combined with the existing
// `.ps-conf-select` base class, whose own min-width is 160px.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockSessionTimeoutService } from '../../../services/session/mockSessionTimeoutService';

const PRESET_MINUTES = [5, 10, 15, 20, 30, 60];

const SessionSecuritySection: React.FC = () => {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    mockSessionTimeoutService.getOrgDefault().then(res => {
      if (res.ok) setMinutes(res.data);
      setLoading(false);
    });
  }, []);

  const handleChange = async (value: number) => {
    setMinutes(value);
    const res = await mockSessionTimeoutService.setOrgDefault(value);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="ps-session-security">
      <div className="ps-session-security__header">
        <h1 className="ps-session-security__title">{t('sessionSecurity.title')}</h1>
        <p className="ps-session-security__subtitle">
          {t('sessionSecurity.description')}
        </p>
      </div>

      <div className="ps-session-security__card">
        <div className="ps-session-security__card-label">
          {t('sessionSecurity.idleTimeoutLabel')}
        </div>
        <select
          value={minutes}
          onChange={e => handleChange(Number(e.target.value))}
          disabled={loading}
          className="ps-conf-select ps-session-security__select"
        >
          {PRESET_MINUTES.map(m => (
            <option key={m} value={m}>{t('sessionSecurity.minutesOption', { count: m })}</option>
          ))}
        </select>
        <p className="ps-session-security__hint">
          {t('sessionSecurity.warningNote')}
        </p>
        {saved && (
          <div className="ps-session-security__saved">
            ✓ {t('sessionSecurity.saved')}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionSecuritySection;
