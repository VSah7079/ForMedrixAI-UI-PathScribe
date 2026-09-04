/**
 * TemplateRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-page renderer for reviewing and actioning a protocol in the review queue.
 *
 * Architecture role:
 *   Reached via /template-review/:templateId. Displays the protocol's sections
 *   and fields for review, provides lifecycle transition controls, and
 *   navigates back to /configuration?tab=protocols.
 *
 * Content source (REWRITTEN July 2026 — see git history / COMPONENTS_REVIEW.md
 * for the prior state):
 *   Fetches real content via services/templates/templateService.ts's
 *   getTemplate(templateId), which returns a TemplateDetail whose `template`
 *   field is a real EditorTemplate — the same rich content model
 *   SynopticEditor.tsx (the actual template builder, in ../Protocols/)
 *   authors: sections of fields, 6 field types (dropdown/radio/checkboxes/
 *   numeric/text/longtext), per-field AND per-option SNOMED/ICD coding.
 *   Previously this component ignored templateId entirely and always
 *   rendered a hardcoded placeholder (mockDcisTemplate, in the older,
 *   incompatible types/templateTypes.ts schema) — both that file and
 *   types/templateTypes.ts have been deleted as part of this fix; nothing
 *   else in the app used either one. See services/templates/templateService.ts
 *   for the 19 real generic (post-CAP/RCPath-licensing-cleanup) templates
 *   already seeded and available today.
 *
 * Lifecycle model (linear — matches CAP validation practice):
 *   draft → in_review → approved → published
 *   needs_changes can be applied from in_review or approved (rejection)
 *   needs_changes → in_review (re-submission)
 *   Reset always available as admin escape hatch
 *
 *   Allowed transitions map:
 *     draft          → in_review
 *     in_review      → needs_changes, approved
 *     needs_changes  → in_review
 *     approved       → needs_changes, published
 *     published      → (terminal — no further transitions)
 *
 * Confirmation modals:
 *   All lifecycle transitions require confirmation. High-stakes transitions
 *   (Approve, Publish) include an optional reason/comment field.
 *   Reset requires confirmation with a destructive warning.
 *
 * Unsaved warning:
 *   If the reviewer has touched any annotation fields (answers) but has not
 *   completed a lifecycle transition, navigating away via breadcrumb or Back
 *   shows a warning modal: "You have unsaved annotations — leave anyway?"
 *
 * Known limitations / TODO:
 *   - InlineCommentThread "Add a comment" input retains its own styling —
 *     style that component separately when ready.
 *   - No content authored yet (empty sections[]) shows an explicit empty
 *     state rather than fabricating placeholder content — see EmptyState
 *     below. This is deliberate: showing fake content for an unauthored
 *     protocol is exactly the bug this rewrite fixes.
 *
 * Consumed by:
 *   App.tsx  route: /template-review/:templateId
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import '../../../pathscribe.css';
import { useNavigate, useParams } from 'react-router-dom';
import { InlineCommentThread } from '../../Common/InlineCommentThread';
import { TemplateLifecycleState } from '../../../types/AuditEvent';
import type { EditorSection, EditorField } from '../Protocols/SynopticEditor';
import { getTemplate, transitionTemplate, TemplateDetail } from '../../../services/templates/templateService';
import { useAuth } from '../../../contexts/AuthContext';
import { useSynopticAudit } from '../../../hooks/useSynopticAudit';

type AnswerMap = Record<string, string | string[]>;

// ─── Lifecycle definitions ────────────────────────────────────────────────────

const LIFECYCLE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  draft:         { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
  in_review:     { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)'  },
  needs_changes: { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', border: 'rgba(239,68,68,0.3)'   },
  approved:      { bg: 'rgba(16,185,129,0.15)',  color: '#10B981', border: 'rgba(16,185,129,0.3)'  },
  published:     { bg: 'rgba(8,145,178,0.15)',   color: '#38bdf8', border: 'rgba(8,145,178,0.3)'   },
};

// Which transitions are allowed from each state
const ALLOWED_TRANSITIONS: Record<TemplateLifecycleState, TemplateLifecycleState[]> = {
  draft:         ['in_review'],
  in_review:     ['needs_changes', 'approved'],
  needs_changes: ['in_review'],
  approved:      ['needs_changes', 'published'],
  published:     [],
};

interface TransitionAction {
  target:      TemplateLifecycleState;
  label:       string;
  color:       string;
  icon:        string;
  requireNote: boolean;   // whether the confirm modal shows a reason field
  confirmMsg:  string;    // body text shown in the confirm modal
  destructive: boolean;   // red confirm button
}

// ─── Source-aware terminology ─────────────────────────────────────────────────
// Terminology for the sign-off and go-live steps varies by governing body.
// Based on the template's source, we use the terms that staff will recognise.

interface SourceTerms {
  signOff:       string;   // label for the 'approved' transition
  signOffVerb:   string;   // past tense, used in confirmMsg
  goLive:        string;   // label for the 'published' transition
  goLiveVerb:    string;   // past tense, used in live banner
}

const SOURCE_TERMS: Record<string, SourceTerms> = {
  CAP:    { signOff: 'Accept',  signOffVerb: 'accepted',  goLive: 'Release',  goLiveVerb: 'released'  },
  RCPath: { signOff: 'Ratify',  signOffVerb: 'ratified',  goLive: 'Publish',  goLiveVerb: 'published' },
  ICCR:   { signOff: 'Approve', signOffVerb: 'approved',  goLive: 'Publish',  goLiveVerb: 'published' },
  Custom: { signOff: 'Approve', signOffVerb: 'approved',  goLive: 'Publish',  goLiveVerb: 'published' },
};

// State labels shown in the lifecycle tracker — also vary by source
const SOURCE_STATE_LABELS: Record<string, Partial<Record<TemplateLifecycleState, string>>> = {
  CAP:    { approved: 'Accepted',  published: 'Released'  },
  RCPath: { approved: 'Ratified',  published: 'Published' },
};

function getTerms(source?: string): SourceTerms {
  // If source contains multiple values, use the first recognised one
  if (!source) return SOURCE_TERMS.Custom;
  const key = Object.keys(SOURCE_TERMS).find(k => source.includes(k));
  return SOURCE_TERMS[key ?? 'Custom'];
}

function getStateLabel(state: TemplateLifecycleState, source?: string): string {
  const overrides = SOURCE_STATE_LABELS[source ?? ''] ?? {};
  return (overrides[state] ?? state).replace('_', ' ');
}

function getTransitionActions(source?: string): TransitionAction[] {
  const t = getTerms(source);
  return [
    {
      target:      'in_review',
      label:       'Mark In Review',
      color:       '#f59e0b',
      icon:        '🔍',
      requireNote: false,
      confirmMsg:  'Mark this protocol as In Review? It will appear in the active review queue.',
      destructive: false,
    },
    {
      target:      'needs_changes',
      label:       'Needs Changes',
      color:       '#ef4444',
      icon:        '↩️',
      requireNote: true,
      confirmMsg:  'Return this protocol for changes. Please provide a reason so the author knows what to address.',
      destructive: true,
    },
    {
      target:      'approved',
      label:       t.signOff,
      color:       '#10B981',
      icon:        '✓',
      requireNote: true,
      confirmMsg:  `${t.signOff} this protocol? Once ${t.signOffVerb} it can be ${t.goLiveVerb} to the reporting workflow. Add any final notes below.`,
      destructive: false,
    },
    {
      target:      'published',
      label:       t.goLive,
      color:       '#0891B2',
      icon:        '🚀',
      requireNote: true,
      confirmMsg:  `${t.goLive} this protocol? It will become immediately available in the synoptic reporting workflow for all pathologists.`,
      destructive: false,
    },
  ];
}

// ─── LifecycleBadge ───────────────────────────────────────────────────────────

const LifecycleBadge: React.FC<{ state: TemplateLifecycleState; source?: string }> = ({ state, source }) => {
  const s = LIFECYCLE_STYLES[state] ?? LIFECYCLE_STYLES.draft;
  return (
    <span style={{
      fontSize: '12px', fontWeight: 700,
      padding: '4px 14px', borderRadius: '99px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {getStateLabel(state, source)}
    </span>
  );
};

// ─── Coding badge (SNOMED / ICD) ───────────────────────────────────────────────
// New in this rewrite — the old renderer had no way to show coding at all,
// since its schema didn't carry any. Matches SynopticEditor.tsx's own
// SCT/ICD pill styling for visual consistency between builder and reviewer.

const CodingBadges: React.FC<{ snomed?: string; icd?: string }> = ({ snomed, icd }) => {
  if (!snomed && !icd) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
      {snomed && (
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(8,145,178,0.15)', color: '#38bdf8', fontFamily: 'monospace' }}>
          SCT {snomed}
        </span>
      )}
      {icd && (
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontFamily: 'monospace' }}>
          ICD {icd}
        </span>
      )}
    </span>
  );
};

// ─── Overlay modal shell ──────────────────────────────────────────────────────

const ModalOverlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div className="ps-overlay" onClick={onClose}>
    <div className="ps-modal-dark" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// ─── Full-page status screens (loading / not found) ────────────────────────────

const StatusScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0f172a', backgroundImage: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
    color: '#94a3b8', fontFamily: "'Inter', sans-serif", fontSize: '14px', textAlign: 'center',
    padding: '40px',
  }}>
    {children}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const TemplateRenderer: React.FC = () => {
  const navigate       = useNavigate();
  const { templateId } = useParams();
  const { user }       = useAuth();
  const currentUser    = user?.name ?? 'Unknown User';
  const { auditAndNotify, auditOnly } = useSynopticAudit();

  // Always return to Review Queue
  const backTarget = '/configuration?tab=protocols&section=review';

  const [template,  setTemplate]  = useState<TemplateDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [state,   setState]   = useState<TemplateLifecycleState>('draft');
  const [isDirty, setIsDirty] = useState(false);

  // Tracks whether a locally-persisted lifecycle state was found, so the
  // real fetched status (below) doesn't clobber it once it resolves — the
  // async fetch and the sync localStorage read can complete in either
  // order, and localStorage (an in-progress local review) should win.
  const hasStoredState = useRef(false);

  // ── Confirmation modal state ───────────────────────────────────────────────
  const [confirmAction,  setConfirmAction]  = useState<TransitionAction | null>(null);
  const [confirmNote,    setConfirmNote]    = useState('');
  const [confirmReset,   setConfirmReset]   = useState(false);

  // ── Unsaved warning state ──────────────────────────────────────────────────
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<string | null>(null);

  const ANSWERS_KEY = `ps_answers_${templateId}`;
  const STATE_KEY   = `ps_state_${templateId}`;

  // ── Load persisted reviewer annotations + lifecycle override ──────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANSWERS_KEY);
      if (raw) setAnswers(JSON.parse(raw));
    } catch {}
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) { setState(raw as TemplateLifecycleState); hasStoredState.current = true; }
    } catch {}
  }, [templateId, ANSWERS_KEY, STATE_KEY]);

  // ── Load real template content ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!templateId) { setLoadError('No template ID provided.'); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    getTemplate(templateId)
      .then(detail => {
        if (cancelled) return;
        setTemplate(detail);
        if (!hasStoredState.current) setState(detail.status as TemplateLifecycleState);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setLoadError(err?.message ?? `Template "${templateId}" not found.`);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [templateId]);

  const persistAnswers = (next: AnswerMap) => {
    setAnswers(next);
    setIsDirty(true);
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(next));
  };

  const persistState = (next: TemplateLifecycleState) => {
    setState(next);
    hasStoredState.current = true;
    setIsDirty(false);  // completed a transition — annotations no longer "unsaved"
    localStorage.setItem(STATE_KEY, next);
  };

  // ── Navigation guard ───────────────────────────────────────────────────────
  const navigateAway = useCallback((target: string) => {
    if (isDirty) {
      setPendingNavTarget(target);
      setShowLeaveWarning(true);
    } else {
      navigate(target);
    }
  }, [isDirty, navigate]);

  const handleLeaveConfirm = () => {
    setShowLeaveWarning(false);
    if (pendingNavTarget) navigate(pendingNavTarget);
  };

  // ── Answer handlers ────────────────────────────────────────────────────────
  const handleSingleChange = (fieldId: string, optionId: string) => {
    const prev = answers[fieldId];
    persistAnswers({ ...answers, [fieldId]: optionId });
    auditOnly({ user: currentUser, category: 'user', action: 'set_single_answer', templateId, questionId: fieldId, oldValue: prev, newValue: optionId });
  };

  const handleMultiChange = (fieldId: string, optionId: string) => {
    const current   = (answers[fieldId] as string[]) || [];
    const exists    = current.includes(optionId);
    const nextArray = exists ? current.filter(id => id !== optionId) : [...current, optionId];
    const prev      = answers[fieldId];
    persistAnswers({ ...answers, [fieldId]: nextArray });
    auditOnly({ user: currentUser, category: 'user', action: exists ? 'remove_multi_answer' : 'add_multi_answer', templateId, questionId: fieldId, oldValue: prev, newValue: nextArray });
  };

  const handleTextChange = (fieldId: string, value: string) => {
    const prev = answers[fieldId];
    persistAnswers({ ...answers, [fieldId]: value });
    auditOnly({ user: currentUser, category: 'user', action: 'set_text_answer', templateId, questionId: fieldId, oldValue: prev, newValue: value });
  };

  // ── Lifecycle transition ───────────────────────────────────────────────────
  const openConfirm = (action: TransitionAction) => {
    setConfirmNote('');
    setConfirmAction(action);
  };

  const handleTransitionConfirm = () => {
    if (!confirmAction || !templateId) return;
    const prev   = state;
    const target = confirmAction.target;
    const note   = confirmNote || undefined;

    persistState(target);
    setConfirmAction(null);
    setConfirmNote('');

    // Sync to PROTOCOL_REGISTRY so queue cards update immediately
    transitionTemplate(templateId, target, note, currentUser).catch(err =>
      console.error('[TemplateRenderer] transition failed:', err)
    );

    auditAndNotify({
      user:         currentUser,
      category:     'user',
      action:       (
        target === 'needs_changes' ? 'template.needs_changes' :
        target === 'approved'      ? 'template.approved' :
        target === 'published'     ? 'template.published' :
        target === 'in_review'     ? 'template.submitted_for_review' :
        'state_transition' // fallback for any target not in NOTIFY_ON_ACTIONS -- won't trigger a notification, matches prior (silent) behavior for anything unrecognized
      ),
      templateId,
      templateName: template?.name ?? templateId,
      stateFrom:    prev,
      stateTo:      target,
      note,
    });
  };

  const handleReset = () => {
    if (!templateId) return;
    persistAnswers({});
    persistState('draft');
    setConfirmReset(false);
    transitionTemplate(templateId, 'draft').catch(() => {});
    auditOnly({ user: 'System', category: 'system', action: 'reset_template', templateId });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const allowed = ALLOWED_TRANSITIONS[state] ?? [];
  const isPublished = state === 'published';

  const inputBase: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '7px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#f1f5f9', fontSize: '13px', outline: 'none',
  };

  // ── Loading / not-found states (after all hooks — safe early return) ──────
  if (loading) {
    return <StatusScreen>Loading protocol…</StatusScreen>;
  }
  if (loadError || !template) {
    return (
      <StatusScreen>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
          Couldn't load this protocol
        </div>
        <div style={{ marginBottom: '20px' }}>{loadError ?? 'Unknown error.'}</div>
        <button
          onClick={() => navigate(backTarget)}
          style={{
            padding: '9px 18px', borderRadius: '8px', border: '1px solid #334155',
            background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
            cursor: 'pointer', fontSize: '13px', fontWeight: 600,
          }}
        >
          ← Back to Protocols
        </button>
      </StatusScreen>
    );
  }

  const terms        = getTerms(template.source);
  const transActions = getTransitionActions(template.source);
  const sections      = template.template.sections;
  const hasContent    = sections.length > 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      backgroundImage: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
      color: '#f1f5f9', fontFamily: "'Inter', sans-serif",
    }}>

      {/* ── Nav bar ── */}
      <nav style={{
        padding: '12px 40px',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigateAway(backTarget)}
            style={{
              padding: '7px 14px', borderRadius: '7px',
              border: '1px solid #334155', background: 'rgba(255,255,255,0.04)',
              color: '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            ← Protocols
          </button>

          {/* Breadcrumb */}
          <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              onClick={() => navigateAway(backTarget)}
              style={{ cursor: 'pointer', color: '#64748b' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0891B2'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
            >
              Protocols
            </span>
            <span style={{ color: '#334155' }}>›</span>
            <span
              onClick={() => navigateAway(backTarget)}
              style={{ cursor: 'pointer', color: '#64748b' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0891B2'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
            >
              Review Queue
            </span>
            <span style={{ color: '#334155' }}>›</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
              {template.name}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isDirty && (
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>
              ● Unsaved annotations
            </span>
          )}
          <LifecycleBadge state={state} source={template.source} />
        </div>
      </nav>

      {/* ── Main content ── */}
      <div style={{ padding: '32px 40px 100px', maxWidth: '860px', margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px' }}>
            {template.name}
          </h1>
          <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '10px' }}>
            <span>Version {template.version}</span>
            <span>•</span><span>{template.source}</span>
            <span>•</span><span>{template.category ?? ''}</span>
          </div>
        </div>

        {/* ── Lifecycle action bar ── */}
        <div style={{
          padding: '16px 18px', marginBottom: '28px',
          borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          {isPublished ? (
            <div style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 600, textAlign: 'center' }}>
              🚀 This protocol has been {terms.goLiveVerb} and is live in the reporting workflow.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', fontWeight: 500 }}>
                LIFECYCLE TRANSITION
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {transActions.map(action => {
                  const isAllowed = allowed.includes(action.target);
                  const s = LIFECYCLE_STYLES[action.target];
                  return (
                    <button
                      key={action.target}
                      onClick={() => isAllowed && openConfirm(action)}
                      disabled={!isAllowed}
                      title={!isAllowed ? `Not available from "${state.replace('_', ' ')}" state` : undefined}
                      style={{
                        padding: '7px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                        border: `1px solid ${isAllowed ? s.border : 'rgba(255,255,255,0.06)'}`,
                        background: isAllowed ? s.bg : 'rgba(255,255,255,0.02)',
                        color: isAllowed ? s.color : '#cbd5e1',
                        cursor: isAllowed ? 'pointer' : 'not-allowed',
                        opacity: isAllowed ? 1 : 0.65,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (isAllowed) e.currentTarget.style.opacity = '0.85'; }}
                      onMouseLeave={e => { if (isAllowed) e.currentTarget.style.opacity = '1'; }}
                    >
                      {action.icon} {action.label}
                    </button>
                  );
                })}

                {/* Divider */}
                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                {/* Reset */}
                <button
                  onClick={() => setConfirmReset(true)}
                  style={{
                    padding: '7px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                    border: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.06)', color: '#f87171',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                >
                  ↺ Reset
                </button>
              </div>

              {/* Linear flow hint */}
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {(['draft', 'in_review', 'approved', 'published'] as TemplateLifecycleState[]).map((s, i, arr) => {
                  const sStyle = LIFECYCLE_STYLES[s];
                  const isCurrent = state === s;
                  const isPast = arr.indexOf(state) > i;
                  return (
                    <React.Fragment key={s}>
                      <span style={{
                        fontSize: '11px', fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? sStyle.color : isPast ? '#334155' : '#1e293b',
                        padding: '2px 8px', borderRadius: '99px',
                        background: isCurrent ? sStyle.bg : 'transparent',
                        border: `1px solid ${isCurrent ? sStyle.border : isPast ? '#1e293b' : '#1e293b'}`,
                        textTransform: 'capitalize',
                      }}>
                        {isPast ? '✓ ' : ''}{getStateLabel(s, template.source)}
                      </span>
                      {i < arr.length - 1 && (
                        <span style={{ color: '#64748b', fontSize: '12px' }}>→</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Template sections ── */}
        {!hasContent && (
          <div style={{
            padding: '32px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.02)', textAlign: 'center', color: '#64748b',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>📝</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              No content has been authored for this protocol yet
            </div>
            <div style={{ fontSize: '13px', marginBottom: '16px' }}>
              Metadata exists in the registry, but no sections/fields have been
              built in the editor.
            </div>
            <button
              onClick={() => navigate(`/template-editor/${templateId}`)}
              style={{
                padding: '9px 18px', borderRadius: '8px', border: '1px solid rgba(8,145,178,0.3)',
                background: 'rgba(8,145,178,0.1)', color: '#38bdf8',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              }}
            >
              Open Editor →
            </button>
          </div>
        )}

        {sections.map((section: EditorSection) => (
          <div key={section.id} style={{ marginBottom: '32px' }}>
            <div style={{
              fontSize: '16px', fontWeight: 700, color: '#f1f5f9',
              marginBottom: '16px', paddingBottom: '10px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              {section.title}
            </div>

            {section.fields.map((field: EditorField) => (
              <div key={field.id} data-field-key={field.id} style={{
                marginBottom: '16px', padding: '16px',
                borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#cbd5e1', marginBottom: '10px' }}>
                  {field.label}
                  <CodingBadges snomed={field.snomed} icd={field.icd} />
                  {field.required && <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span>}
                </div>

                <InlineCommentThread questionId={field.id} templateId={templateId!} currentUser={currentUser} />

                {/* Dropdown — real <select>, single-select */}
                {field.type === 'dropdown' && (
                  <select
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleSingleChange(field.id, e.target.value)}
                    data-field-key={field.id}
                    style={{ ...inputBase, width: '100%', marginTop: '8px', boxSizing: 'border-box' }}
                  >
                    <option value="">Select…</option>
                    {field.options.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                )}

                {/* Radio — single-select, radio buttons */}
                {field.type === 'radio' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {field.options.map(opt => (
                      <label key={opt.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
                        border: `1px solid ${answers[field.id] === opt.id ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.07)'}`,
                        background: answers[field.id] === opt.id ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.15s',
                      }}>
                        <input
                          type="radio" name={field.id} value={opt.id}
                          checked={answers[field.id] === opt.id}
                          onChange={() => handleSingleChange(field.id, opt.id)}
                          data-field-key={field.id}
                          style={{ accentColor: '#0891B2', width: '14px', height: '14px' }}
                        />
                        <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{opt.label}</span>
                        <CodingBadges snomed={opt.snomed} icd={opt.icd} />
                      </label>
                    ))}
                  </div>
                )}

                {/* Checkboxes — multi-select */}
                {field.type === 'checkboxes' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {field.options.map(opt => {
                      const current = (answers[field.id] as string[]) || [];
                      const checked = current.includes(opt.id);
                      return (
                        <label key={opt.id} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
                          border: `1px solid ${checked ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.07)'}`,
                          background: checked ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
                          transition: 'all 0.15s',
                        }}>
                          <input
                            type="checkbox" value={opt.id} checked={checked}
                            onChange={() => handleMultiChange(field.id, opt.id)}
                            data-field-key={field.id}
                            style={{ accentColor: '#0891B2', width: '14px', height: '14px' }}
                          />
                          <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{opt.label}</span>
                          <CodingBadges snomed={opt.snomed} icd={opt.icd} />
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Numeric */}
                {field.type === 'numeric' && (
                  <input
                    type="number"
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleTextChange(field.id, e.target.value)}
                    placeholder="Enter value…"
                    data-field-key={field.id}
                    id={field.id}
                    style={{ ...inputBase, width: '100%', marginTop: '8px', boxSizing: 'border-box' }}
                  />
                )}

                {/* Free text */}
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleTextChange(field.id, e.target.value)}
                    placeholder="Enter value…"
                    data-field-key={field.id}
                    id={field.id}
                    style={{ ...inputBase, width: '100%', marginTop: '8px', boxSizing: 'border-box' }}
                  />
                )}

                {/* Long text */}
                {field.type === 'longtext' && (
                  <textarea
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleTextChange(field.id, e.target.value)}
                    placeholder="Enter value…"
                    rows={4}
                    data-field-key={field.id}
                    id={field.id}
                    style={{ ...inputBase, width: '100%', marginTop: '8px', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Transition confirmation modal ── */}
      {confirmAction && (
        <ModalOverlay onClose={() => setConfirmAction(null)}>
          {(() => {
            const s = LIFECYCLE_STYLES[confirmAction.target];
            return (
              <>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{confirmAction.icon}</div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 10px' }}>
                  {confirmAction.label}
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px', lineHeight: '1.6' }}>
                  {confirmAction.confirmMsg}
                </p>

                {confirmAction.requireNote && (
                  <textarea
                    value={confirmNote}
                    onChange={e => setConfirmNote(e.target.value)}
                    placeholder={confirmAction.destructive ? 'Reason for changes required (recommended)…' : 'Add notes (optional)…'}
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
                      fontSize: '13px', outline: 'none', resize: 'vertical',
                      boxSizing: 'border-box', marginBottom: '16px',
                    }}
                  />
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="ps-conf-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTransitionConfirm}
                    style={{
                      padding: '9px 20px', borderRadius: '8px', border: 'none',
                      background: confirmAction.destructive ? '#ef4444' : s.bg,
                      color: confirmAction.destructive ? 'white' : s.color,
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Confirm — {confirmAction.label}
                  </button>
                </div>
              </>
            );
          })()}
        </ModalOverlay>
      )}

      {/* ── Reset confirmation modal ── */}
      {confirmReset && (
        <ModalOverlay onClose={() => setConfirmReset(false)}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 10px' }}>
            Reset Protocol?
          </h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px', lineHeight: '1.6' }}>
            This will clear all reviewer annotations and return the lifecycle state to
            <strong style={{ color: '#f1f5f9' }}> Draft</strong>.
            This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmReset(false)}
              className="ps-conf-btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              className="ps-btn-danger-solid"
            >
              Reset to Draft
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Leave without saving warning ── */}
      {showLeaveWarning && (
        <ModalOverlay onClose={() => setShowLeaveWarning(false)}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📝</div>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 10px' }}>
            Unsaved Annotations
          </h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 6px', lineHeight: '1.6' }}>
            You have unsaved reviewer annotations. Your answers are stored locally,
            but no lifecycle transition has been recorded.
          </p>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.6' }}>
            Leave anyway? Your annotations will be preserved but the review will
            remain in its current state.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowLeaveWarning(false)}
              className="ps-conf-btn-secondary"
            >
              Stay
            </button>
            <button
              onClick={handleLeaveConfirm}
              style={{
                padding: '9px 20px', borderRadius: '8px',
                border: '1px solid #f59e0b',
                background: 'rgba(245,158,11,0.12)', color: '#fbbf24',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
            >
              Leave Anyway
            </button>
          </div>
        </ModalOverlay>
      )}

    </div>
  );
};
