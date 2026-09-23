/**
 * TerminologyServicesSection.tsx
 * src/components/Config/Terminology/TerminologyServicesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * System config section for monitoring terminology service endpoints.
 *
 * Shows live health status for: SNOMED CT, ICD-10-CM, ICD-11, LOINC, ICD-O, CPT
 * Auto-runs health checks on mount and on demand via "Test All" button.
 *
 * Consumed by:
 *   components/Config/System/index.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import {
  testTerminologyEndpoints,
  TERMINOLOGY_CONFIG,
  type ServiceStatus,
  type TerminologyServiceStatus,
} from './terminologyConfig';

// ─── Toggle (matches GoverningBodiesSection design) ───────────────────────────

const Toggle: React.FC<{
  checked:   boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
  color?:    string;
}> = ({ checked, onChange, disabled = false, color = '#0891B2' }) => (
  <div
    onClick={() => !disabled && onChange(!checked)}
    className={`ps-termsvc-toggle-track${disabled ? ' ps-termsvc-toggle-track--disabled' : ''}`}
    style={{ '--toggle-bg': checked ? color : '#334155' } as React.CSSProperties}
  >
    <div className={`ps-termsvc-toggle-knob${checked ? ' ps-termsvc-toggle-knob--on' : ''}`} />
  </div>
);

// ─── Status badge ─────────────────────────────────────────────────────────────

// Real, per-status styling only — the bg/color/dot values are real,
// fixed design tokens (not translatable text), applied via CSS custom
// properties at the call site, same established pattern as this app's
// own .ps-status-badge. The displayed label lives separately in
// STATUS_LABEL_KEY below, since ServiceStatus is a real, code-driven
// enum (never persisted, but still not translatable text itself).
const STATUS_STYLES: Record<ServiceStatus, { bg: string; color: string; dot: string }> = {
  live:             { bg: 'rgba(16,185,129,0.1)',  color: '#10b981', dot: '#10b981' },
  degraded:         { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', dot: '#f59e0b' },
  down:             { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', dot: '#ef4444' },
  not_configured:   { bg: 'rgba(100,116,139,0.1)', color: '#64748b', dot: '#475569' },
  license_required: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', dot: '#fbbf24' },
  checking:         { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8', dot: '#334155' },
};

const STATUS_LABEL_KEY: Record<ServiceStatus, string> = {
  live:             'terminologyServicesSection.statusLabels.live',
  degraded:         'terminologyServicesSection.statusLabels.degraded',
  down:             'terminologyServicesSection.statusLabels.down',
  not_configured:   'terminologyServicesSection.statusLabels.notConfigured',
  license_required: 'terminologyServicesSection.statusLabels.licenseRequired',
  checking:         'terminologyServicesSection.statusLabels.checking',
};

const StatusBadge: React.FC<{ status: ServiceStatus; latencyMs?: number }> = ({
  status,
  latencyMs,
}) => {
  const { t } = useTranslation();
  const s = STATUS_STYLES[status];
  return (
    <div className="ps-termsvc-status-wrap">
      <div
        className="ps-termsvc-status-badge"
        style={{ '--termsvc-status-bg': s.bg, '--termsvc-status-color': s.color } as React.CSSProperties}
      >
        <div className="ps-termsvc-status-dot" style={{ '--termsvc-status-dot': s.dot } as React.CSSProperties} />
        {t(STATUS_LABEL_KEY[status])}
      </div>
      {latencyMs !== undefined && status === 'live' && (
        <span className="ps-termsvc-status-latency">
          {latencyMs}ms
        </span>
      )}
    </div>
  );
};

// ─── Service definitions ──────────────────────────────────────────────────────

interface ServiceDef {
  key:         string;
  name:        string;
  descriptionKey: string;
  sourceKey:   string;
  envVar?:     string;
  envValue?:   string;
  docsUrl?:    string;
}

// Real, fixed clinical-nomenclature/standards-body names (SNOMED CT,
// ICD-10-CM, ICD-11, LOINC, ICD-O, CPT, NLM, WHO, AMA) stay literal in
// every locale, per this app's established convention for
// standardized international clinical vocabulary and governing-body
// abbreviations. Only the surrounding descriptive prose translates —
// via descriptionKey/sourceKey below, since the real English text mixes
// full sentences with these fixed tokens in a way a single
// interpolated template would make fragile to translate correctly.
const SERVICE_DEFS: ServiceDef[] = [
  {
    key:            'snomed',
    name:           'SNOMED CT',
    descriptionKey: 'terminologyServicesSection.services.snomed.description',
    sourceKey:      'terminologyServicesSection.services.snomed.source',
    envVar:         'VITE_NLM_BASE_URL',
    envValue:       TERMINOLOGY_CONFIG.nlm.baseUrl,
    docsUrl:        'https://clinicaltables.nlm.nih.gov/apidoc/snomed/v3/doc.html',
  },
  {
    key:            'icd10',
    name:           'ICD-10-CM',
    descriptionKey: 'terminologyServicesSection.services.icd10.description',
    sourceKey:      'terminologyServicesSection.services.icd10.source',
    envVar:         'VITE_NLM_BASE_URL',
    envValue:       TERMINOLOGY_CONFIG.nlm.baseUrl,
    docsUrl:        'https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html',
  },
  {
    key:            'icd11',
    name:           'ICD-11',
    descriptionKey: 'terminologyServicesSection.services.icd11.description',
    sourceKey:      'terminologyServicesSection.services.icd11.source',
    envVar:         'VITE_NLM_BASE_URL',
    envValue:       TERMINOLOGY_CONFIG.nlm.baseUrl,
    docsUrl:        'https://clinicaltables.nlm.nih.gov/apidoc/icd11_codes/v3/doc.html',
  },
  {
    key:            'loinc',
    name:           'LOINC',
    descriptionKey: 'terminologyServicesSection.services.loinc.description',
    sourceKey:      'terminologyServicesSection.services.loinc.source',
    envVar:         'VITE_NLM_BASE_URL',
    envValue:       TERMINOLOGY_CONFIG.nlm.baseUrl,
    docsUrl:        'https://clinicaltables.nlm.nih.gov/apidoc/loinc_items/v3/doc.html',
  },
  {
    key:            'icdo',
    name:           'ICD-O',
    descriptionKey: 'terminologyServicesSection.services.icdo.description',
    sourceKey:      'terminologyServicesSection.services.icdo.source',
    envVar:         'VITE_NLM_BASE_URL',
    envValue:       TERMINOLOGY_CONFIG.nlm.baseUrl,
    docsUrl:        'https://www.who.int/standards/classifications/other-classifications/international-classification-of-diseases-for-oncology',
  },
  {
    key:            'cpt',
    name:           'CPT',
    descriptionKey: 'terminologyServicesSection.services.cpt.description',
    sourceKey:      'terminologyServicesSection.services.cpt.source',
    envVar:         'VITE_CPT_PROXY_URL',
    envValue:       TERMINOLOGY_CONFIG.cpt.proxyUrl,
    docsUrl:        'https://www.ama-assn.org/practice-management/cpt',
  },
];

// ─── Service row ──────────────────────────────────────────────────────────────

const ServiceRow: React.FC<{
  def:         ServiceDef;
  status:      TerminologyServiceStatus | undefined;
  showEnvVars: boolean;
}> = ({ def, status, showEnvVars }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-termsvc-row">

    {/* Name + source */}
    <div>
      <div className="ps-termsvc-name">
        {def.name}
      </div>
      <div className="ps-termsvc-source">
        {t(def.sourceKey)}
        {def.docsUrl && (
          <a
            href={def.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="ps-termsvc-docs-link"
          >↗</a>
        )}
      </div>
    </div>

    {/* Description + env var + note */}
    <div>
      <div className="ps-termsvc-description">
        {t(def.descriptionKey)}
      </div>
      {showEnvVars && def.envVar && (
        <div className="ps-termsvc-envvar-row">
          <span className="ps-termsvc-envvar-name">
            {def.envVar}
          </span>
          <span className="ps-termsvc-envvar-arrow">→</span>
          <span className="ps-termsvc-envvar-value">
            {def.envValue}
          </span>
        </div>
      )}
      {/* Real, per-check diagnostic text (raw HTTP status / connectivity
          detail from testTerminologyEndpoints() in terminologyConfig.ts)
          — kept English as diagnostic output, same convention as this
          sweep's persisted/diagnostic-text carve-out; also pinned
          verbatim in terminologyConfig.test.ts. */}
      {status?.note && (
        <div className="ps-termsvc-note">
          {status.note}
        </div>
      )}
    </div>

    {/* Status badge */}
    <div>
      <StatusBadge
        status={status?.status ?? 'checking'}
        latencyMs={status?.latencyMs}
      />
    </div>
  </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const TerminologyServicesSection: React.FC<{ isSuperAdmin?: boolean }> = ({
  isSuperAdmin = false,
}) => {
  const { t } = useTranslation();
  const [statuses,    setStatuses]    = useState<Record<string, TerminologyServiceStatus>>({});
  const [checking,    setChecking]    = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showEnvVars, setShowEnvVars] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);
    // Mark live services as checking while running
    setStatuses(prev => {
      const next = { ...prev };
      ['snomed', 'icd10', 'icd11', 'loinc', 'icdo'].forEach(k => {
        next[k] = { ...(next[k] ?? { name: k, status: 'checking' as ServiceStatus }), status: 'checking' as ServiceStatus };
      });
      return next;
    });
    const results = await testTerminologyEndpoints();
    setStatuses(results);
    setLastChecked(new Date());
    setChecking(false);
  }, []);

  // Auto-run on mount
  useEffect(() => { runChecks(); }, [runChecks]);

  const allOperational = Object.values(statuses).every(
    s => s.status === 'live' || s.status === 'license_required'
  );

  return (
    <div>

      {/* Section header */}
      <div className="ps-termsvc-header-row">
        <div>
          <h3 className="ps-termsvc-title">
            {t('terminologyServicesSection.header.title')}
          </h3>
          <p className="ps-termsvc-intro">
            {t('terminologyServicesSection.header.intro')}
            {lastChecked && (
              <span className="ps-termsvc-last-checked">
                {' '}{t('terminologyServicesSection.header.lastChecked', { time: lastChecked.toLocaleTimeString() })}
              </span>
            )}
          </p>
        </div>

        <div className="ps-termsvc-header-actions">

          {/* Overall status */}
          {Object.keys(statuses).length > 0 && (
            <div className={`ps-termsvc-overall-status${allOperational ? ' ps-termsvc-overall-status--ok' : ' ps-termsvc-overall-status--warn'}`}>
              <div className="ps-termsvc-overall-dot" />
              {allOperational ? t('terminologyServicesSection.status.allOperational') : t('terminologyServicesSection.status.needsAttention')}
            </div>
          )}

          {/* Env vars toggle — super admin only */}
          {isSuperAdmin && (
            <div className="ps-termsvc-envtoggle-row">
              <span className="ps-termsvc-envtoggle-label">{t('terminologyServicesSection.showEnvVars')}</span>
              <Toggle checked={showEnvVars} onChange={setShowEnvVars} color="#7c3aed" />
            </div>
          )}

          {/* Test button */}
          <button
            onClick={runChecks}
            disabled={checking}
            className={`ps-conf-btn-teal-accent${checking ? ' ps-termsvc-test-btn--busy' : ''}`}
          >
            {checking ? t('terminologyServicesSection.testButton.testing') : `↻ ${t('terminologyServicesSection.testButton.testAll')}`}
          </button>
        </div>
      </div>

      {/* ICD-10 variant callout */}
      <div className="ps-termsvc-callout ps-termsvc-callout--info">
        <span className="ps-termsvc-callout-icon">🌐</span>
        <div>
          <div className="ps-termsvc-callout-title ps-termsvc-callout-title--info">
            {t('terminologyServicesSection.icd10Callout.title')}
          </div>
          <div className="ps-termsvc-callout-body">
            <Trans
              i18nKey="terminologyServicesSection.icd10Callout.description"
              components={{ envVar: <span className="ps-termsvc-mono" /> }}
            />
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="ps-termsvc-col-headers">
        <div className="ps-termsvc-col-header">{t('terminologyServicesSection.columns.service')}</div>
        <div className="ps-termsvc-col-header">{t('terminologyServicesSection.columns.details')}</div>
        <div className="ps-termsvc-col-header">{t('terminologyServicesSection.columns.status')}</div>
      </div>

      {/* Service rows */}
      {SERVICE_DEFS.map(def => (
        <ServiceRow
          key={def.key}
          def={def}
          status={statuses[def.key]}
          showEnvVars={showEnvVars && isSuperAdmin}
        />
      ))}

      {/* CPT licensing callout */}
      <div className="ps-termsvc-callout ps-termsvc-callout--warning">
        <span className="ps-termsvc-callout-icon">⚠️</span>
        <div>
          <div className="ps-termsvc-callout-title ps-termsvc-callout-title--warning">
            {t('terminologyServicesSection.cptCallout.title')}
          </div>
          <div className="ps-termsvc-callout-body">
            <Trans
              i18nKey="terminologyServicesSection.cptCallout.description"
              values={{ proxyUrl: TERMINOLOGY_CONFIG.cpt.proxyUrl }}
              components={{
                link: <a href="https://www.ama-assn.org/practice-management/cpt" target="_blank" rel="noreferrer" className="ps-termsvc-callout-link" />,
                envVar: <span className="ps-termsvc-mono" />,
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="ps-termsvc-spacer" />

    </div>
  );
};

export default TerminologyServicesSection;
