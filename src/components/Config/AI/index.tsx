import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { aiBehaviorService } from '../../../services/aiBehavior/IAIBehaviorService';
import type { AIBehaviorConfig } from '../../../services/aiBehavior/IAIBehaviorService';
import { resolveAiConfig } from './aiProviderConfig';
import AiProviderSettings from './AiProviderSettings';
import OrchestratorConfigSection from './OrchestratorConfigSection';
import { useIsAdmin } from '../../../contexts/AuthContext';

// File-by-file cleanup sweep: this file used to carry its own local
// useIsAdmin(), reading localStorage directly — real, per its own prior
// fix history, this had already broken once for real (wrong storage key,
// isAdmin always false for every user) before being caught and fixed
// locally. Now shares the one real implementation in AuthContext.tsx
// (also used by ConfigurationPage.tsx, which had an independent copy of
// the same pattern) — one source of truth instead of two that can drift.
//
// i18n note: `providerLabel`'s 'Mock — Demo Mode' fallback deliberately
// mirrors AiProviderSettings.tsx's own PROVIDER_LABELS.mock literal
// verbatim — that file's header explains why real vendor/product labels
// stay untranslated, and this is the exact same literal, so it stays
// untouched here too. The chevron icon reuses OrchestratorConfigSection's
// (batch 158) `.ps-orchcfg-chevron`/`--open` classes verbatim (identical
// rotate behavior), and the "Model Versions" panel spacing reuses the
// sweep's existing `.ps-mt-20` utility class.

const TOGGLE_LABEL_KEY: Record<
  'autoInsertSuggestions' | 'showConfidenceScores' | 'macroSuggestions' | 'subspecialtyRouting',
  string
> = {
  autoInsertSuggestions: 'aiTab.advanced.autoInsertSuggestions',
  showConfidenceScores:  'aiTab.advanced.showConfidenceScores',
  macroSuggestions:      'aiTab.advanced.macroSuggestions',
  subspecialtyRouting:   'aiTab.advanced.subspecialtyRouting',
};

const AITab: React.FC<{ ModelsPanel?: React.ComponentType }> = ({ ModelsPanel }) => {
  const { t } = useTranslation();
  const [config,     setConfig]     = useState<AIBehaviorConfig | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const isAdmin = useIsAdmin();

  // Resolve active provider for the engine badge
  const activeConfig  = resolveAiConfig();
  const providerLabel = activeConfig.providerId === 'mock'
    ? 'Mock — Demo Mode'
    : `${activeConfig.modelId}`;
  const isMock = activeConfig.providerId === 'mock';

  useEffect(() => {
    aiBehaviorService.get().then(res => {
      if (res.ok) setConfig(res.data);
      setLoading(false);
    });
  }, []);

  const update = async (changes: Partial<AIBehaviorConfig>) => {
    if (!config) return;
    setSaving(true);
    const res = await aiBehaviorService.update(changes);
    if (res.ok) setConfig(res.data);
    setSaving(false);
  };

  if (loading || !config) return (
    <div className="ps-conf-loading">
      {t('aiTab.loading')}
    </div>
  );

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('aiTab.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('aiTab.subtitle')}
      </p>

      {/* ── AI Engine (read-only badge for all users) ── */}
      <div className="ps-conf-card ps-conf-card--mb24">
        <div className="ps-aitab-engine-row">
          <div>
            <div className="ps-aitab-engine-title">
              {t('aiTab.engine.heading')}
            </div>
            <div className="ps-aitab-engine-desc">
              {isMock ? t('aiTab.engine.demoActive') : t('aiTab.engine.managedByAdmin')}
            </div>
          </div>
          <div className="ps-aitab-engine-badges">
            {isMock && (
              <span className="ps-aitab-demo-pill">
                {t('aiTab.engine.demoPill')}
              </span>
            )}
            <span
              className="ps-aitab-provider-badge"
              style={{
                '--ps-aitab-badge-color':  isMock ? '#fbbf24' : '#38bdf8',
                '--ps-aitab-badge-bg':     isMock ? 'rgba(251,191,36,0.08)' : 'rgba(56,189,248,0.08)',
                '--ps-aitab-badge-border': isMock ? 'rgba(251,191,36,0.2)' : 'rgba(56,189,248,0.2)',
              } as React.CSSProperties}
            >
              {providerLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Gross-Driven AI ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div>
            <div className="ps-conf-card-title">
              {t('aiTab.grossDriven.title')}
            </div>
            <div className="ps-conf-card-description--tight">
              {t('aiTab.grossDriven.description')}
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={config.grossEnabled}
              onChange={e => update({ grossEnabled: e.target.checked })}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('aiTab.enabledLabel')}</span>
          </label>
        </div>
      </div>

      {/* ── Microscopic-Driven AI ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div>
            <div className="ps-conf-card-title">
              {t('aiTab.microscopicDriven.title')}
            </div>
            <div className="ps-conf-card-description--tight">
              {t('aiTab.microscopicDriven.description')}
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={config.microscopicEnabled}
              onChange={e => update({ microscopicEnabled: e.target.checked })}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('aiTab.enabledLabel')}</span>
          </label>
        </div>
      </div>

      {/* ── Confidence Threshold ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('aiTab.confidenceThreshold.title')}
        </div>
        <div className="ps-aitab-threshold-desc">
          {t('aiTab.confidenceThreshold.description')}
        </div>
        <div className="ps-aitab-threshold-row">
          <input type="range" min={0} max={100} value={config.confidenceThreshold}
            onChange={e => update({ confidenceThreshold: Number(e.target.value) })}
            aria-label={t('aiTab.confidenceThreshold.ariaLabel', { value: config.confidenceThreshold })}
            className="ps-aitab-threshold-range" />
          <span className="ps-aitab-threshold-value">
            {config.confidenceThreshold}%
          </span>
        </div>
      </div>

      {/* ── Additional Toggles ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('aiTab.advanced.title')}
        </div>
        <div className="ps-aitab-advanced-desc">
          {t('aiTab.advanced.description')}
        </div>
        {([
          'autoInsertSuggestions',
          'showConfidenceScores',
          'macroSuggestions',
          'subspecialtyRouting',
        ] as const).map(key => (
          <label key={key} className="ps-conf-row ps-conf-row--clickable">
            <span className="ps-conf-option-text">{t(TOGGLE_LABEL_KEY[key])}</span>
            <input type="checkbox" checked={config[key] as boolean}
              onChange={e => update({ [key]: e.target.checked })}
              className="ps-aitab-advanced-checkbox" />
          </label>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="ps-aitab-actions-row">
        <button
          onClick={async () => {
            setSaving(true);
            const res = await aiBehaviorService.reset();
            if (res.ok) setConfig(res.data);
            setSaving(false);
          }}
          className="ps-conf-btn-row"
        >
          {t('aiTab.resetToDefaults')}
        </button>
        {saving && <span className="ps-aitab-saving-text">{t('common.saving')}</span>}
      </div>

      {/* ── AI Provider Configuration — admin only ── */}
      {isAdmin ? (
        <div className="ps-aitab-provider-wrap">
          <AiProviderSettings isAdmin={true} />
        </div>
      ) : (
        <div className="ps-aitab-provider-note">
          {t('aiTab.providerManagedByAdminNote')}
        </div>
      )}

      {/* ── Orchestrator Config (replaces Narrative Templates tab) ── */}
      <OrchestratorConfigSection isAdmin={isAdmin} />

      {/* Bottom spacer — ensures content clears the viewport edge */}
      <div className="ps-config-bottom-spacer" />

      {/* ── Model Versions — admin only ── */}
      {ModelsPanel && (
        <div className="ps-aitab-models-wrap">
          <button
            onClick={() => setModelsOpen(o => !o)}
            className="ps-conf-label ps-aitab-models-toggle-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`ps-orchcfg-chevron${modelsOpen ? ' ps-orchcfg-chevron--open' : ''}`}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {t('aiTab.modelVersions')}
            <span className="ps-aitab-admin-pill">
              {t('aiTab.adminOnlyPill')}
            </span>
          </button>
          {modelsOpen && <div className="ps-mt-20"><ModelsPanel /></div>}
        </div>
      )}
    </div>
  );
};

export default AITab;
