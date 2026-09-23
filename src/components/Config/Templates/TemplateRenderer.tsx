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
 * i18n (file-by-file sweep):
 *   Source-aware terminology (SOURCE_TERMS / SOURCE_STATE_LABEL_KEY) varies
 *   the words shown for the "sign off" and "go live" transitions by the
 *   template's governing body (CAP/RCPath/ICCR/Custom) — these are UI chrome,
 *   not persisted data, so every one of those words is now a translation key
 *   rather than raw English. getTransitionActions() and getStateLabelKey()
 *   are plain (non-hook) functions, so they take the `t` function from
 *   useTranslation() as a parameter rather than calling the hook themselves.
 *   The pre-existing local `const t = getTerms(source)` inside
 *   getTransitionActions was renamed to `terms` to avoid shadowing the
 *   translator function now passed into that same function.
 *   section.title and field.label are real authored protocol content
 *   (persisted data from the template author) and are deliberately left
 *   untranslated, per the sweep's "exported/persisted data stays English"
 *   convention. The SCT/ICD prefixes in CodingBadges are fixed coding-system
 *   nomenclature (same posture as CPT/SNOMED/ICD codes elsewhere in this
 *   sweep) and are also left untranslated.
 *
 * Consumed by:
 *   App.tsx  route: /template-review/:templateId
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
// Each field holds a translation KEY (not display text) — real i18n
// indirection per the file-by-file i18n sweep of this component.

interface SourceTerms {
  signOffKey:     string;   // key for the label of the 'approved' transition
  signOffVerbKey: string;   // key for past tense, interpolated into confirmMsg
  goLiveKey:      string;   // key for the label of the 'published' transition
  goLiveVerbKey:  string;   // key for past tense, interpolated into the live banner
}

const SOURCE_TERMS: Record<string, SourceTerms> = {
  CAP: {
    signOffKey:     'templateRenderer.terms.cap.signOff',
    signOffVerbKey: 'templateRenderer.terms.cap.signOffVerb',
    goLiveKey:      'templateRenderer.terms.cap.goLive',
    goLiveVerbKey:  'templateRenderer.terms.cap.goLiveVerb',
  },
  RCPath: {
    signOffKey:     'templateRenderer.terms.rcpath.signOff',
    signOffVerbKey: 'templateRenderer.terms.rcpath.signOffVerb',
    goLiveKey:      'templateRenderer.terms.rcpath.goLive',
    goLiveVerbKey:  'templateRenderer.terms.rcpath.goLiveVerb',
  },
  ICCR: {
    signOffKey:     'templateRenderer.terms.iccr.signOff',
    signOffVerbKey: 'templateRenderer.terms.iccr.signOffVerb',
    goLiveKey:      'templateRenderer.terms.iccr.goLive',
    goLiveVerbKey:  'templateRenderer.terms.iccr.goLiveVerb',
  },
  Custom: {
    signOffKey:     'templateRenderer.terms.custom.signOff',
    signOffVerbKey: 'templateRenderer.terms.custom.signOffVerb',
    goLiveKey:      'templateRenderer.terms.custom.goLive',
    goLiveVerbKey:  'templateRenderer.terms.custom.goLiveVerb',
  },
};

// State labels shown in the lifecycle tracker — also vary by source.
// Values are translation keys; states without an override fall back to the
// generic templateRenderer.state.<state> key (see getStateLabelKey below).
const SOURCE_STATE_LABEL_KEY: Record<string, Partial<Record<TemplateLifecycleState, string>>> = {
  CAP:    { approved: 'templateRenderer.stateLabel.cap.approved',    published: 'templateRenderer.stateLabel.cap.published'    },
  RCPath: { approved: 'templateRenderer.stateLabel.rcpath.approved', published: 'templateRenderer.stateLabel.rcpath.published' },
};

function getTerms(source?: string): SourceTerms {
  // If source contains multiple values, use the first recognised one
  if (!source) return SOURCE_TERMS.Custom;
  const key = Object.keys(SOURCE_TERMS).find(k => source.includes(k));
  return SOURCE_TERMS[key ?? 'Custom'];
}

function getStateLabelKey(state: TemplateLifecycleState, source?: string): string {
  const overrides = SOURCE_STATE_LABEL_KEY[source ?? ''] ?? {};
  return overrides[state] ?? `templateRenderer.state.${state}`;
}

// A plain (non-hook) function, so it takes the translator as a parameter
// rather than calling useTranslation() itself. `terms` here was renamed
// from the original `t` to avoid shadowing that translator parameter.
function getTransitionActions(source: string | undefined, t: TFunction): TransitionAction[] {
  const terms = getTerms(source);
  return [
    {
      target:      'in_review',
      label:       t('templateRenderer.transitions.inReview.label'),
      color:       '#f59e0b',
      icon:        '🔍',
      requireNote: false,
      confirmMsg:  t('templateRenderer.transitions.inReview.confirmMsg'),
      destructive: false,
    },
    {
      target:      'needs_changes',
      label:       t('templateRenderer.transitions.needsChanges.label'),
      color:       '#ef4444',
      icon:        '↩️',
      requireNote: true,
      confirmMsg:  t('templateRenderer.transitions.needsChanges.confirmMsg'),
      destructive: true,
    },
    {
      target:      'approved',
      label:       t(terms.signOffKey),
      color:       '#10B981',
      icon:        '✓',
      requireNote: true,
      confirmMsg:  t('templateRenderer.transitions.approved.confirmMsg', {
        signOff:     t(terms.signOffKey),
        signOffVerb: t(terms.signOffVerbKey),
        goLiveVerb:  t(terms.goLiveVerbKey),
      }),
      destructive: false,
    },
    {
      target:      'published',
      label:       t(terms.goLiveKey),
      color:       '#0891B2',
      icon:        '🚀',
      requireNote: true,
      confirmMsg:  t('templateRenderer.transitions.published.confirmMsg', {
        goLive: t(terms.goLiveKey),
      }),
      destructive: false,
    },
  ];
}

// ─── LifecycleBadge ───────────────────────────────────────────────────────────

const LifecycleBadge: React.FC<{ state: TemplateLifecycleState; source?: string }> = ({ state, source }) => {
  const { t } = useTranslation();
  const s = LIFECYCLE_STYLES[state] ?? LIFECYCLE_STYLES.draft;
  return (
    <span
      className="ps-tmplr-lifecycle-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {t(getStateLabelKey(state, source))}
    </span>
  );
};

// ─── Coding badge (SNOMED / ICD) ───────────────────────────────────────────────
// New in this rewrite — the old renderer had no way to show coding at all,
// since its schema didn't carry any. Matches SynopticEditor.tsx's own
// SCT/ICD pill styling for visual consistency between builder and reviewer.
// "SCT"/"ICD" are fixed coding-system prefixes, not on-screen prose — left
// untranslated, same posture as CPT/SNOMED/ICD codes elsewhere in this sweep.

const CodingBadges: React.FC<{ snomed?: string; icd?: string }> = ({ snomed, icd }) => {
  if (!snomed && !icd) return null;
  return (
    <span className="ps-tmplr-coding-badges">
      {snomed && (
        <span className="ps-tmplr-coding-badge ps-tmplr-coding-badge--snomed">
          SCT {snomed}
        </span>
      )}
      {icd && (
        <span className="ps-tmplr-coding-badge ps-tmplr-coding-badge--icd">
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
  <div className="ps-tmplr-status-screen">
    {children}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const TemplateRenderer: React.FC = () => {
  const { t }           = useTranslation();
  const navigate         = useNavigate();
  const { templateId }   = useParams();
  const { user }         = useAuth();
  const currentUser      = user?.name ?? 'Unknown User';
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
    if (!templateId) { setLoadError(t('templateRenderer.notFound.noTemplateId')); setLoading(false); return; }
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
        setLoadError(err?.message ?? t('templateRenderer.notFound.templateNotFound', { templateId }));
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Loading / not-found states (after all hooks — safe early return) ──────
  if (loading) {
    return <StatusScreen>{t('templateRenderer.loading')}</StatusScreen>;
  }
  if (loadError || !template) {
    return (
      <StatusScreen>
        <div className="ps-tmplr-status-icon">⚠️</div>
        <div className="ps-tmplr-status-heading">
          {t('templateRenderer.notFound.heading')}
        </div>
        <div className="ps-tmplr-status-body">{loadError ?? t('templateRenderer.notFound.unknownError')}</div>
        <button
          onClick={() => navigate(backTarget)}
          className="ps-tmplr-status-back-btn"
        >
          {t('templateRenderer.notFound.backButton')}
        </button>
      </StatusScreen>
    );
  }

  const terms        = getTerms(template.source);
  const transActions = getTransitionActions(template.source, t);
  const sections      = template.template.sections;
  const hasContent    = sections.length > 0;

  return (
    <div className="ps-tmplr-page">

      {/* ── Nav bar ── */}
      <nav className="ps-tmplr-nav">
        <div className="ps-tmplr-nav-left">
          <button
            onClick={() => navigateAway(backTarget)}
            className="ps-tmplr-back-btn"
          >
            {t('templateRenderer.nav.back')}
          </button>

          {/* Breadcrumb */}
          <div className="ps-tmplr-breadcrumb">
            <span
              onClick={() => navigateAway(backTarget)}
              className="ps-tmplr-breadcrumb-link"
            >
              {t('templateRenderer.nav.breadcrumbProtocols')}
            </span>
            <span className="ps-tmplr-breadcrumb-sep">›</span>
            <span
              onClick={() => navigateAway(backTarget)}
              className="ps-tmplr-breadcrumb-link"
            >
              {t('templateRenderer.nav.breadcrumbReviewQueue')}
            </span>
            <span className="ps-tmplr-breadcrumb-sep">›</span>
            <span className="ps-tmplr-breadcrumb-current">
              {template.name}
            </span>
          </div>
        </div>

        <div className="ps-tmplr-nav-right">
          {isDirty && (
            <span className="ps-tmplr-unsaved-indicator">
              {t('templateRenderer.nav.unsavedAnnotations')}
            </span>
          )}
          <LifecycleBadge state={state} source={template.source} />
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="ps-tmplr-main">

        {/* ── Page header ── */}
        <div className="ps-tmplr-header">
          <h1 className="ps-tmplr-title">
            {template.name}
          </h1>
          <div className="ps-tmplr-meta">
            <span>{t('templateRenderer.header.version', { version: template.version })}</span>
            <span>•</span><span>{template.source}</span>
            <span>•</span><span>{template.category ?? ''}</span>
          </div>
        </div>

        {/* ── Lifecycle action bar ── */}
        <div className="ps-tmplr-lifecycle-bar">
          {isPublished ? (
            <div className="ps-tmplr-published-banner">
              {t('templateRenderer.lifecycleBar.publishedBanner', { goLiveVerb: t(terms.goLiveVerbKey) })}
            </div>
          ) : (
            <>
              <div className="ps-tmplr-transition-label">
                {t('templateRenderer.lifecycleBar.transitionLabel')}
              </div>
              <div className="ps-tmplr-transition-row">
                {transActions.map(action => {
                  const isAllowed = allowed.includes(action.target);
                  const s = LIFECYCLE_STYLES[action.target];
                  return (
                    <button
                      key={action.target}
                      onClick={() => isAllowed && openConfirm(action)}
                      disabled={!isAllowed}
                      title={!isAllowed ? t('templateRenderer.lifecycleBar.notAvailableTooltip', { state: t(getStateLabelKey(state)) }) : undefined}
                      className="ps-tmplr-transition-btn"
                      style={{
                        border: `1px solid ${isAllowed ? s.border : 'rgba(255,255,255,0.06)'}`,
                        background: isAllowed ? s.bg : 'rgba(255,255,255,0.02)',
                        color: isAllowed ? s.color : '#cbd5e1',
                        cursor: isAllowed ? 'pointer' : 'not-allowed',
                        opacity: isAllowed ? 1 : 0.65,
                      }}
                    >
                      {action.icon} {action.label}
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="ps-tmplr-divider" />

                {/* Reset */}
                <button
                  onClick={() => setConfirmReset(true)}
                  className="ps-tmplr-reset-btn"
                >
                  {t('templateRenderer.lifecycleBar.resetButton')}
                </button>
              </div>

              {/* Linear flow hint */}
              <div className="ps-tmplr-flow-hint">
                {(['draft', 'in_review', 'approved', 'published'] as TemplateLifecycleState[]).map((s, i, arr) => {
                  const sStyle = LIFECYCLE_STYLES[s];
                  const isCurrent = state === s;
                  const isPast = arr.indexOf(state) > i;
                  return (
                    <React.Fragment key={s}>
                      <span
                        className="ps-tmplr-flow-step"
                        style={{
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? sStyle.color : isPast ? '#334155' : '#1e293b',
                          background: isCurrent ? sStyle.bg : 'transparent',
                          border: `1px solid ${isCurrent ? sStyle.border : isPast ? '#1e293b' : '#1e293b'}`,
                        }}
                      >
                        {isPast ? '✓ ' : ''}{t(getStateLabelKey(s, template.source))}
                      </span>
                      {i < arr.length - 1 && (
                        <span className="ps-tmplr-flow-arrow">→</span>
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
          <div className="ps-tmplr-empty-state">
            <div className="ps-tmplr-empty-icon">📝</div>
            <div className="ps-tmplr-empty-heading">
              {t('templateRenderer.emptyState.heading')}
            </div>
            <div className="ps-tmplr-empty-body">
              {t('templateRenderer.emptyState.body')}
            </div>
            <button
              onClick={() => navigate(`/template-editor/${templateId}`)}
              className="ps-tmplr-empty-btn"
            >
              {t('templateRenderer.emptyState.openEditor')}
            </button>
          </div>
        )}

        {/* section.title and field.label below are real authored protocol
            content (persisted data), left untranslated per the sweep's
            "exported/persisted data stays English" convention. */}
        {sections.map((section: EditorSection) => (
          <div key={section.id} className="ps-tmplr-section">
            <div className="ps-tmplr-section-title">
              {section.title}
            </div>

            {section.fields.map((field: EditorField) => (
              <div key={field.id} data-field-key={field.id} className="ps-tmplr-field">
                <div className="ps-tmplr-field-label">
                  {field.label}
                  <CodingBadges snomed={field.snomed} icd={field.icd} />
                  {field.required && <span className="ps-tmplr-field-required">*</span>}
                </div>

                <InlineCommentThread questionId={field.id} templateId={templateId!} currentUser={currentUser} />

                {/* Dropdown — real <select>, single-select */}
                {field.type === 'dropdown' && (
                  <select
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleSingleChange(field.id, e.target.value)}
                    data-field-key={field.id}
                    className="ps-tmplr-input"
                  >
                    <option value="">{t('templateRenderer.field.selectPlaceholder')}</option>
                    {field.options.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                )}

                {/* Radio — single-select, radio buttons */}
                {field.type === 'radio' && (
                  <div className="ps-tmplr-option-list">
                    {field.options.map(opt => (
                      <label
                        key={opt.id}
                        className="ps-tmplr-option-label"
                        style={{
                          border: `1px solid ${answers[field.id] === opt.id ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.07)'}`,
                          background: answers[field.id] === opt.id ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <input
                          type="radio" name={field.id} value={opt.id}
                          checked={answers[field.id] === opt.id}
                          onChange={() => handleSingleChange(field.id, opt.id)}
                          data-field-key={field.id}
                          className="ps-tmplr-option-input"
                        />
                        <span className="ps-tmplr-option-text">{opt.label}</span>
                        <CodingBadges snomed={opt.snomed} icd={opt.icd} />
                      </label>
                    ))}
                  </div>
                )}

                {/* Checkboxes — multi-select */}
                {field.type === 'checkboxes' && (
                  <div className="ps-tmplr-option-list">
                    {field.options.map(opt => {
                      const current = (answers[field.id] as string[]) || [];
                      const checked = current.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className="ps-tmplr-option-label"
                          style={{
                            border: `1px solid ${checked ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.07)'}`,
                            background: checked ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <input
                            type="checkbox" value={opt.id} checked={checked}
                            onChange={() => handleMultiChange(field.id, opt.id)}
                            data-field-key={field.id}
                            className="ps-tmplr-option-input"
                          />
                          <span className="ps-tmplr-option-text">{opt.label}</span>
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
                    placeholder={t('templateRenderer.field.enterValuePlaceholder')}
                    data-field-key={field.id}
                    id={field.id}
                    className="ps-tmplr-input"
                  />
                )}

                {/* Free text */}
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleTextChange(field.id, e.target.value)}
                    placeholder={t('templateRenderer.field.enterValuePlaceholder')}
                    data-field-key={field.id}
                    id={field.id}
                    className="ps-tmplr-input"
                  />
                )}

                {/* Long text */}
                {field.type === 'longtext' && (
                  <textarea
                    value={(answers[field.id] as string) || ''}
                    onChange={e => handleTextChange(field.id, e.target.value)}
                    placeholder={t('templateRenderer.field.enterValuePlaceholder')}
                    rows={4}
                    data-field-key={field.id}
                    id={field.id}
                    className="ps-tmplr-textarea"
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
                <div className="ps-tmplr-modal-icon">{confirmAction.icon}</div>
                <h3 className="ps-tmplr-modal-title">
                  {confirmAction.label}
                </h3>
                <p className="ps-tmplr-modal-msg">
                  {confirmAction.confirmMsg}
                </p>

                {confirmAction.requireNote && (
                  <textarea
                    value={confirmNote}
                    onChange={e => setConfirmNote(e.target.value)}
                    placeholder={confirmAction.destructive ? t('templateRenderer.modal.placeholderRequired') : t('templateRenderer.modal.placeholderOptional')}
                    rows={3}
                    className="ps-tmplr-modal-textarea"
                  />
                )}

                <div className="ps-tmplr-modal-actions">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="ps-conf-btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleTransitionConfirm}
                    className="ps-tmplr-modal-confirm-btn"
                    style={{
                      background: confirmAction.destructive ? '#ef4444' : s.bg,
                      color: confirmAction.destructive ? 'white' : s.color,
                    }}
                  >
                    {t('templateRenderer.modal.confirmButton', { label: confirmAction.label })}
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
          <div className="ps-tmplr-modal-icon ps-tmplr-modal-icon--lg">⚠️</div>
          <h3 className="ps-tmplr-modal-title">
            {t('templateRenderer.modal.reset.title')}
          </h3>
          <p className="ps-tmplr-modal-msg ps-tmplr-modal-msg--wide">
            {t('templateRenderer.modal.reset.bodyPre')}
            <strong style={{ color: '#f1f5f9' }}> {t('templateRenderer.modal.reset.draftWord')}</strong>
            {t('templateRenderer.modal.reset.bodySuffix')}
          </p>
          <div className="ps-tmplr-modal-actions">
            <button
              onClick={() => setConfirmReset(false)}
              className="ps-conf-btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleReset}
              className="ps-btn-danger-solid"
            >
              {t('templateRenderer.modal.reset.confirmButton')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Leave without saving warning ── */}
      {showLeaveWarning && (
        <ModalOverlay onClose={() => setShowLeaveWarning(false)}>
          <div className="ps-tmplr-modal-icon ps-tmplr-modal-icon--lg">📝</div>
          <h3 className="ps-tmplr-modal-title">
            {t('templateRenderer.leaveWarning.title')}
          </h3>
          <p className="ps-tmplr-modal-msg ps-tmplr-modal-msg--tight">
            {t('templateRenderer.leaveWarning.body1')}
          </p>
          <p className="ps-tmplr-modal-msg ps-tmplr-modal-msg--wide" style={{ color: '#64748b' }}>
            {t('templateRenderer.leaveWarning.body2')}
          </p>
          <div className="ps-tmplr-modal-actions">
            <button
              onClick={() => setShowLeaveWarning(false)}
              className="ps-conf-btn-secondary"
            >
              {t('templateRenderer.leaveWarning.stay')}
            </button>
            <button
              onClick={handleLeaveConfirm}
              className="ps-tmplr-leave-btn"
            >
              {t('templateRenderer.leaveWarning.leaveAnyway')}
            </button>
          </div>
        </ModalOverlay>
      )}

    </div>
  );
};
