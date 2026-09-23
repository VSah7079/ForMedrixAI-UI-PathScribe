// src/components/Config/AI/OrchestratorConfigSection.tsx
// ─────────────────────────────────────────────────────────────
// Replaces the old "Narrative Templates" top-level config tab.
//
// Reframed as "Orchestrator Config" — makes it clear this is
// AI generation configuration, not report layout.
// "Sections" renamed to "Generation Steps" to distinguish from
// the Part Library's report parts.
//
// Lives inside the AI Behavior tab as a collapsible section.
// Admin-only: clinical users see a read-only summary.
//
// i18n note: `step.title`/`step.aiInstruction`/`f.name`/
// `f.cardinality` come from narrativeTemplateConfig.ts's own
// admin-authored step schema — `aiInstruction` in particular is
// literal AI-prompt text — and stay untouched, same posture this
// sweep already takes for schema-driven/AI-prompt content elsewhere.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { narrativeTemplateConfig } from '../../Config/NarrativeTemplates/narrativeTemplateConfig';
import { getOrgOrchestratorDefault, setOrgOrchestratorDefault } from './orchestratorModeConfig';

// ── Step card ─────────────────────────────────────────────────

interface StepCardProps {
  step:    typeof narrativeTemplateConfig.sections[0];
  index:   number;
  isAdmin: boolean;
}

const StepCard: React.FC<StepCardProps> = ({ step, index, isAdmin }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ps-orchcfg-step-card">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="ps-orchcfg-step-header"
      >
        {/* Step number */}
        <span className={`ps-orchcfg-step-number${step.enabled ? ' ps-orchcfg-step-number--enabled' : ''}`}>
          {index + 1}
        </span>

        {/* Title */}
        <span className={`ps-orchcfg-step-title${step.enabled ? ' ps-orchcfg-step-title--enabled' : ''}`}>
          {step.title}
        </span>

        {/* Status badge */}
        <span className={`ps-orchcfg-step-badge${step.enabled ? ' ps-orchcfg-step-badge--enabled' : ''}`}>
          {step.enabled ? t('orchestratorConfigSection.stepCard.activeLabel') : t('orchestratorConfigSection.stepCard.disabledLabel')}
        </span>

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2.5"
          className={`ps-orchcfg-chevron${expanded ? ' ps-orchcfg-chevron--open' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="ps-orchcfg-detail">
          <div className="ps-orchcfg-detail-section">
            <div className="ps-orchcfg-detail-heading">
              {t('orchestratorConfigSection.stepCard.aiInstructionHeading')}
            </div>
            <div className="ps-orchcfg-ai-instruction">
              {step.aiInstruction}
            </div>
          </div>

          {step.fields && step.fields.length > 0 && (
            <div className="ps-orchcfg-fields-section">
              <div className="ps-orchcfg-detail-heading">
                {t('orchestratorConfigSection.stepCard.contextFieldsHeading', { count: step.fields.length })}
              </div>
              <div className="ps-orchcfg-fields-row">
                {step.fields.map((f: any) => (
                  <span key={f.name} className="ps-orchcfg-field-chip">
                    {f.name}
                    <span className="ps-orchcfg-field-cardinality">
                      {f.cardinality}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="ps-orchcfg-future-note">
              {t('orchestratorConfigSection.stepCard.futureReleaseNote')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────

interface OrchestratorConfigSectionProps {
  isAdmin: boolean;
}

const OrchestratorConfigSection: React.FC<OrchestratorConfigSectionProps> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cfg = narrativeTemplateConfig;

  // Real, persisted org-level default — this used to read the static
  // `narrativeTemplateConfig.orchestratorEnabled` literal directly (always
  // true, no toggle existed anywhere). See orchestratorModeConfig.ts for
  // why, and for the per-lab override this org value now falls back from.
  const [orchestratorOn, setOrchestratorOn] = useState<boolean>(getOrgOrchestratorDefault);

  const handleToggle = () => {
    const next = !orchestratorOn;
    setOrchestratorOn(next);
    setOrgOrchestratorDefault(next);
  };

  const enabledCount = cfg.sections.filter(s => s.enabled).length;

  return (
    <div className="ps-orchcfg-section">

      {/* Section header — collapsible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="ps-orchcfg-header-btn"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2.5"
          className={`ps-orchcfg-chevron${open ? ' ps-orchcfg-chevron--open' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <span className="ps-orchcfg-header-title">
          {t('orchestratorConfigSection.title')}
        </span>

        {isAdmin ? (
          <span
            role="switch"
            aria-checked={orchestratorOn}
            aria-label={orchestratorOn ? t('orchestratorConfigSection.toggle.ariaLabelOn') : t('orchestratorConfigSection.toggle.ariaLabelOff')}
            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
            title={t('orchestratorConfigSection.toggle.tooltip')}
            className={`ps-orchcfg-toggle-badge${orchestratorOn ? ' ps-orchcfg-toggle-badge--on' : ''}`}
          >
            {orchestratorOn ? t('orchestratorConfigSection.toggle.badgeOn') : t('orchestratorConfigSection.toggle.badgeOff')}
          </span>
        ) : (
          <span className={`ps-orchcfg-status-badge${orchestratorOn ? ' ps-orchcfg-status-badge--on' : ''}`}>
            {orchestratorOn ? t('orchestratorConfigSection.toggle.statusOn') : t('orchestratorConfigSection.toggle.statusOff')}
          </span>
        )}

        <span className="ps-orchcfg-steps-summary">
          {t('orchestratorConfigSection.stepsActiveSummary', { enabled: enabledCount, total: cfg.sections.length })}
        </span>
      </button>

      {open && (
        <div className="ps-orchcfg-body">
          <p className="ps-orchcfg-intro-text">
            <Trans i18nKey="orchestratorConfigSection.intro1" components={{ strong: <strong className="ps-orchcfg-emphasis" /> }} />
          </p>
          <p className="ps-orchcfg-intro-text">
            <Trans i18nKey="orchestratorConfigSection.intro2" components={{ strong: <strong className="ps-orchcfg-emphasis" /> }} />
          </p>

          {!isAdmin && (
            <div className="ps-orchcfg-readonly-note">
              {t('orchestratorConfigSection.readOnlyNote')}
            </div>
          )}

          {cfg.sections
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((step, i) => (
              <StepCard key={step.id} step={step} index={i} isAdmin={isAdmin} />
            ))
          }
        </div>
      )}
    </div>
  );
};

export default OrchestratorConfigSection;
