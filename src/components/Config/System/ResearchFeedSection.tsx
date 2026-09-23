// src/components/Config/System/ResearchFeedSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin management for the PubMed literature feed shown on the Home
// dashboard.
//
// Built for the same reason ExternalResourcesSection.tsx was: the CAP
// protocol URL was once hardcoded, 404'd, and nobody could fix it
// without a code change. Every URL this feed depends on is editable
// here, so an NCBI restructure is an admin edit rather than a release.
//
// Deliberately NOT stored as an ExternalResource. Those are curated
// links pathologists click, surfaced in the Resources panel by
// resolveForViewer() — an eUtils API endpoint would appear there as a
// broken-looking entry. Same pattern, different shape, so the config
// lives with the feed it configures in services/research/.
//
// The URL fields are validated against an allow-list (see
// mockResearchFeedConfigService.ALLOWED_HOSTS). This is not paranoia:
// articleUrlTemplate decides where a clinician's browser goes on click,
// so without a constraint an admin — or anyone who compromises an admin
// account — could point the dashboard at a phishing host.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import {
  mockResearchFeedConfigService,
  ALLOWED_HOSTS,
  isAllowedUrl,
} from '@/services/research/mockResearchFeedConfigService';
import type {
  ResearchFeedConfig,
  ResearchFeedHealth,
} from '@/services/research/IResearchFeedConfigService';

const OUTCOME_LABEL_KEY: Record<string, string> = {
  success: 'researchFeedSection.outcomeLabels.success',
  empty: 'researchFeedSection.outcomeLabels.empty',
  'rate-limited': 'researchFeedSection.outcomeLabels.rateLimited',
  error: 'researchFeedSection.outcomeLabels.error',
};

function formatWhen(ts: number | null, neverLabel: string): string {
  if (!ts) return neverLabel;
  return new Date(ts).toLocaleString();
}

/** Surfaces a silently-dead feed. Everything here fails quietly by design,
 *  so without an explicit staleness read nobody would ever notice. Returns
 *  a translation key (plus interpolation values) rather than a rendered
 *  string, since this plain helper has no hook access to `t()`. */
function stalenessStatus(health: ResearchFeedHealth): { key: string; values?: { days: number } } | null {
  if (!health.lastSuccessAt) {
    return health.lastAttemptAt
      ? { key: 'researchFeedSection.health.neverRetrieved' }
      : null;
  }
  const days = Math.floor((Date.now() - health.lastSuccessAt) / 86_400_000);
  return days >= 3
    ? { key: 'researchFeedSection.health.staleWarning', values: { days } }
    : null;
}

const ResearchFeedSection: React.FC = () => {
  const { t } = useTranslation();
  const defaults = mockResearchFeedConfigService.getDefaults();
  const [config, setConfig] = useState<ResearchFeedConfig>(defaults);
  const [health, setHealth] = useState<ResearchFeedHealth>(
    mockResearchFeedConfigService.getHealth(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    mockResearchFeedConfigService.getConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  const update = <K extends keyof ResearchFeedConfig>(key: K, value: ResearchFeedConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!isAllowedUrl(config.apiBaseUrl)) {
      setError(t('researchFeedSection.errors.apiEndpointInvalid', { hosts: ALLOWED_HOSTS.join(', ') }));
      return;
    }
    if (!config.articleUrlTemplate.includes('{PMID}')) {
      setError(t('researchFeedSection.errors.articleUrlMissingPmid'));
      return;
    }
    if (!isAllowedUrl(config.articleUrlTemplate)) {
      setError(t('researchFeedSection.errors.articleUrlInvalid', { hosts: ALLOWED_HOSTS.join(', ') }));
      return;
    }
    if (!config.query.trim()) {
      setError(t('researchFeedSection.errors.queryEmpty'));
      return;
    }
    const stored = await mockResearchFeedConfigService.saveConfig(config);
    setConfig(stored);
    setHealth(mockResearchFeedConfigService.getHealth());
    setError(null);
    setSaved(true);
  };

  const handleReset = () => {
    setConfig(defaults);
    setSaved(false);
    setError(null);
  };

  if (loading) return <div className="ps-rf-loading">{t('researchFeedSection.loading')}</div>;

  const staleness = stalenessStatus(health);
  const outcomeKey = health.lastOutcome ? OUTCOME_LABEL_KEY[health.lastOutcome] : undefined;
  const outcomeText = health.lastOutcome ? (outcomeKey ? t(outcomeKey) : health.lastOutcome) : null;

  return (
    <div className="ps-rf">
      <header className="ps-rf-header">
        <h1 className="ps-rf-title">{t('researchFeedSection.title')}</h1>
        <p className="ps-rf-subtitle">{t('researchFeedSection.subtitle')}</p>
      </header>

      {/* Health — the whole reason this panel is worth opening */}
      <section className="ps-rf-health">
        <div className="ps-rf-health-row">
          <span className="ps-rf-health-label">{t('researchFeedSection.health.lastSuccess')}</span>
          <span className="ps-rf-health-value">{formatWhen(health.lastSuccessAt, t('researchFeedSection.health.never'))}</span>
        </div>
        <div className="ps-rf-health-row">
          <span className="ps-rf-health-label">{t('researchFeedSection.health.lastAttempt')}</span>
          <span className="ps-rf-health-value">
            {formatWhen(health.lastAttemptAt, t('researchFeedSection.health.never'))}
            {outcomeText && ` — ${outcomeText}`}
          </span>
        </div>
        {staleness && <div className="ps-rf-health-warning">{t(staleness.key, staleness.values)}</div>}
      </section>

      <div className="ps-rf-field ps-rf-field--inline">
        <label className="ps-conf-label" htmlFor="rf-enabled">{t('researchFeedSection.fields.enabledLabel')}</label>
        <input
          id="rf-enabled"
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
        />
      </div>

      <div className="ps-rf-field">
        <label className="ps-conf-label" htmlFor="rf-query">{t('researchFeedSection.fields.queryLabel')}</label>
        <textarea
          id="rf-query"
          className="ps-conf-input ps-rf-textarea"
          rows={4}
          value={config.query}
          onChange={(e) => update('query', e.target.value)}
        />
        <p className="ps-rf-hint">{t('researchFeedSection.fields.queryHint')}</p>
      </div>

      <div className="ps-rf-field">
        <label className="ps-conf-label" htmlFor="rf-article">{t('researchFeedSection.fields.articleUrlLabel')}</label>
        <input
          id="rf-article"
          className="ps-conf-input ps-rf-input"
          value={config.articleUrlTemplate}
          onChange={(e) => update('articleUrlTemplate', e.target.value)}
        />
        <p className="ps-rf-hint">
          <Trans i18nKey="researchFeedSection.fields.articleUrlHint" values={{ hosts: ALLOWED_HOSTS.join(', ') }} components={{ code: <code /> }} />
        </p>
      </div>

      <div className="ps-rf-field">
        <label className="ps-conf-label" htmlFor="rf-api">{t('researchFeedSection.fields.apiEndpointLabel')}</label>
        <input
          id="rf-api"
          className="ps-conf-input ps-rf-input"
          value={config.apiBaseUrl}
          onChange={(e) => update('apiBaseUrl', e.target.value)}
        />
        <p className="ps-rf-hint">{t('researchFeedSection.fields.apiEndpointHint')}</p>
      </div>

      {error && <div className="ps-rf-error" role="alert">{error}</div>}
      {saved && <div className="ps-rf-saved" role="status">{t('researchFeedSection.saved')}</div>}

      <div className="ps-rf-actions">
        <button type="button" className="ps-conf-btn-secondary" onClick={handleReset}>
          {t('researchFeedSection.actions.restoreDefaults')}
        </button>
        <button type="button" className="ps-conf-btn-primary" onClick={handleSave}>
          {t('researchFeedSection.actions.save')}
        </button>
      </div>
    </div>
  );
};

export default ResearchFeedSection;
