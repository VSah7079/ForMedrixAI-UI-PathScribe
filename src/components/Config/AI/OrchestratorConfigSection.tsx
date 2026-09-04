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
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { narrativeTemplateConfig } from '../../Config/NarrativeTemplates/narrativeTemplateConfig';
import { getOrgOrchestratorDefault, setOrgOrchestratorDefault } from './orchestratorModeConfig';

// ── Step card ─────────────────────────────────────────────────

interface StepCardProps {
  step:    typeof narrativeTemplateConfig.sections[0];
  index:   number;
  isAdmin: boolean;
}

const StepCard: React.FC<StepCardProps> = ({ step, index, isAdmin }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border:        '1px solid rgba(255,255,255,0.08)',
      borderRadius:  10,
      background:    'rgba(255,255,255,0.03)',
      overflow:      'hidden',
      marginBottom:  8,
    }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: 12, padding: '12px 16px', background: 'none',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Step number */}
        <span style={{
          width: 24, height: 24, borderRadius: '50%',
          background: step.enabled ? 'rgba(8,145,178,0.2)' : 'rgba(255,255,255,0.05)',
          color:      step.enabled ? '#38bdf8' : '#475569',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {index + 1}
        </span>

        {/* Title */}
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: step.enabled ? '#f1f5f9' : '#475569' }}>
          {step.title}
        </span>

        {/* Status badge */}
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
          background: step.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
          color:      step.enabled ? '#34d399' : '#475569',
        }}>
          {step.enabled ? 'ACTIVE' : 'DISABLED'}
        </span>

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2.5"
          style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              AI Instruction
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 12px' }}>
              {step.aiInstruction}
            </div>
          </div>

          {step.fields && step.fields.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Context Fields ({step.fields.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {step.fields.map((f: any) => (
                  <span key={f.name} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)', color: '#64748b',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {f.name}
                    <span style={{ marginLeft: 4, color: '#334155', fontSize: 10 }}>
                      {f.cardinality}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {isAdmin && (
            <div style={{ marginTop: 12, fontSize: 11, color: '#334155', fontStyle: 'italic' }}>
              Step ordering and field mapping configurable in a future release.
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
    <div style={{ marginTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 28 }}>

      {/* Section header — collapsible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, background: 'none',
          border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left',
        }}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2.5"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
          Orchestrator Config
        </span>

        {isAdmin ? (
          <span
            role="switch"
            aria-checked={orchestratorOn}
            aria-label={`Orchestrator Config ${orchestratorOn ? 'On' : 'Off'}`}
            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
            title="Org-level default — internal facilities (labs) can override this individually in Facility Configuration"
            style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              cursor: 'pointer',
              background: orchestratorOn ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
              color:      orchestratorOn ? '#34d399' : '#475569',
              border: `1px solid ${orchestratorOn ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {orchestratorOn ? 'ON' : 'OFF'} — click to toggle
          </span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: orchestratorOn ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
            color:      orchestratorOn ? '#34d399' : '#475569',
          }}>
            {orchestratorOn ? 'ON' : 'OFF'}
          </span>
        )}

        <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>
          {enabledCount} of {cfg.sections.length} generation steps active
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
            Controls which AI generation steps run when Orchestrator mode is active, and what
            instructions each step receives. Steps run in order — earlier steps provide context
            to later ones. This is <strong style={{ color: '#94a3b8' }}>AI configuration</strong>,
            not report layout (that lives in Report Templates → Part Library).
          </p>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
            The ON/OFF badge above is the <strong style={{ color: '#94a3b8' }}>org-wide default</strong>.
            Individual internal facilities (performing labs) can override it in the Facility
            Dictionary — see that facility's General tab — for trusts where not every site
            wants AI narrative auto-draft enabled.
          </p>

          {!isAdmin && (
            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
              Read-only — contact your lab administrator to modify generation steps.
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
