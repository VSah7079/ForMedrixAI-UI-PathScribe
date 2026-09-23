/**
 * RetentionSection.tsx
 * Data retention policy — editable by administrators.
 * Persists to localStorage via 'pathscribe_retention_policy' key.
 * When SystemConfigContext adds retention fields, replace localStorage with context.
 *
 * i18n sweep (batch 51): every on-screen string converted to the new
 * `retentionSection` namespace. No real/persisted data in this file —
 * every string is UI chrome (labels, hints, units, buttons).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RetentionPolicy {
  aiSuggestionDays:     number;
  auditLogDays:         number;
  caseSnapshotYears:    number;
  reportArchiveYears:   number;
}

const DEFAULTS: RetentionPolicy = {
  aiSuggestionDays:   90,
  auditLogDays:       365,
  caseSnapshotYears:  7,
  reportArchiveYears: 10,
};

const STORAGE_KEY = 'pathscribe_retention_policy';

function load(): RetentionPolicy {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

// ─── Editable row ─────────────────────────────────────────────────────────────
const Row: React.FC<{
  label: string; note: string; value: number; unit: string;
  min: number; max: number; onChange: (v: number) => void; dirty: boolean;
}> = ({ label, note, value, unit, min, max, onChange, dirty }) => {
  const { t } = useTranslation();
  return (
    <div className={`ps-retention__row${dirty ? ' ps-retention__row--dirty' : ''}`}>
      <div className="ps-retention__row-info">
        <div className="ps-retention__row-label">{label}</div>
        <div className="ps-retention__row-note">{note}</div>
      </div>
      <div className="ps-retention__row-input-wrap">
        <input
          type="number" min={min} max={max} value={value}
          aria-label={t('retentionSection.fieldAriaLabel', { label, unit })}
          className="ps-retention__input"
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
        />
        <span className="ps-retention__unit">{unit}</span>
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const RetentionSection: React.FC = () => {
  const { t } = useTranslation();
  const [policy,  setPolicy]  = useState<RetentionPolicy>(load);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  const saved_policy = load(); // reference point for dirty detection

  const set = <K extends keyof RetentionPolicy>(key: K, value: number) => {
    setPolicy(p => ({ ...p, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setPolicy({ ...DEFAULTS });
    setDirty(true);
    setSaved(false);
  };

  return (
    <div className="ps-retention__wrap">
      {/* Header */}
      <div className="ps-retention__header">
        <h2 className="ps-retention__title">
          🗄️ {t('retentionSection.title')}
        </h2>
        <p className="ps-retention__subtitle">
          {t('retentionSection.subtitle')}
        </p>
      </div>

      {/* Editable fields */}
      <Row
        label={t('retentionSection.fields.aiSuggestions.label')} unit={t('retentionSection.fields.aiSuggestions.unit')} min={30} max={730}
        note={t('retentionSection.fields.aiSuggestions.note')}
        value={policy.aiSuggestionDays}
        onChange={v => set('aiSuggestionDays', v)}
        dirty={dirty && policy.aiSuggestionDays !== saved_policy.aiSuggestionDays}
      />
      <Row
        label={t('retentionSection.fields.auditLogs.label')} unit={t('retentionSection.fields.auditLogs.unit')} min={90} max={3650}
        note={t('retentionSection.fields.auditLogs.note')}
        value={policy.auditLogDays}
        onChange={v => set('auditLogDays', v)}
        dirty={dirty && policy.auditLogDays !== saved_policy.auditLogDays}
      />
      <Row
        label={t('retentionSection.fields.caseSnapshots.label')} unit={t('retentionSection.fields.caseSnapshots.unit')} min={1} max={30}
        note={t('retentionSection.fields.caseSnapshots.note')}
        value={policy.caseSnapshotYears}
        onChange={v => set('caseSnapshotYears', v)}
        dirty={dirty && policy.caseSnapshotYears !== saved_policy.caseSnapshotYears}
      />
      <Row
        label={t('retentionSection.fields.reportArchive.label')} unit={t('retentionSection.fields.reportArchive.unit')} min={1} max={30}
        note={t('retentionSection.fields.reportArchive.note')}
        value={policy.reportArchiveYears}
        onChange={v => set('reportArchiveYears', v)}
        dirty={dirty && policy.reportArchiveYears !== saved_policy.reportArchiveYears}
      />

      {/* Governance note */}
      <div className="ps-retention__governance-note">
        🔒 {t('retentionSection.governanceNote')}
      </div>

      {/* Actions */}
      <div className="ps-retention__actions">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="ps-conf-btn-primary"
        >
          {saved ? t('retentionSection.savedBtn') : t('retentionSection.saveBtn')}
        </button>
        <button
          onClick={handleReset}
          className="ps-conf-btn-secondary"
        >
          {t('retentionSection.resetBtn')}
        </button>
        {saved && (
          <span className="ps-retention__saved-message">
            {t('retentionSection.savedMessage')}
          </span>
        )}
      </div>
    </div>
  );
};

export default RetentionSection;
