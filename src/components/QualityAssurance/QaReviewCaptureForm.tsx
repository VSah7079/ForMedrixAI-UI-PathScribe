// src/components/QualityAssurance/QaReviewCaptureForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-118. The real Unified QA Review Workbench — one generic, schema-
// driven review-capture form for ANY QaActivityType, reusing
// TemplateRenderer.tsx's own real, proven field-type-switch pattern
// (dropdown/radio/checkboxes/numeric/text/longtext) rather than a
// bespoke form per activity.
//
// DiscordanceReconciliationModal.tsx is the real, working proof of what
// a *good* review capture looks like — this generalizes that structure
// (the fixed outcome/delta/severity/rootCause/comments section every
// review-with-outcome activity shares, per QaActivityRecord.ts's own
// header) rather than rebuilding it from nothing. The activity-specific
// comparison fields (frozenCategory/finalCategory/finalDx for
// Discordance, or whatever a Custom activity defines) render generically
// from the owning QaActivityType's own `fields` schema — the same real
// mechanism TemplateRenderer.tsx already uses for synoptic report
// fields.
//
// Validation is delegated entirely to validateQaReviewSubmission.ts —
// this component owns no validation logic of its own, so the rule set
// (including the real mandatory-narrative-on-discordant fix already
// applied to Discordance) can never drift between the two.
//
// Deliberately NOT wired into useSignOutWorkflow.ts's live Discordance
// call site in this pass — that's real, working, sign-out-critical code
// with its own regression surface; migrating it to this generic
// component is a real, low-risk follow-up once this workbench has
// proven itself on a genuinely new activity (PS-324), not a change to
// bundle into the same pass that introduces the workbench itself.
//
// i18n note: `field.label`/`field.hint`/`opt.label` come from the owning
// QaActivityType's own admin-configured `fields` schema — real,
// persisted configuration content, same posture TemplateRenderer.tsx
// already takes for synoptic field labels — and stay untouched. This
// generic, activity-agnostic form's own delta/root-cause option wording
// is deliberately shorter than DiscordanceReconciliationModal.tsx's
// frozen-section-specific phrasing (batch 149), so only the options with
// genuinely identical wording (severity tiers, "Minor variance", "Other")
// reuse that file's exact keys; the rest get their own, shorter keys.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaDiscordanceDelta, QaDiscordanceRootCause, QaDiscordanceSeverity, QaReviewOutcome } from '@/types/quality/QaActivityRecord';
import { validateQaReviewSubmission, type QaReviewSubmissionDraft } from '@/services/quality/validateQaReviewSubmission';

export interface QaReviewCaptureSubmission {
  fieldValues: Record<string, string | string[] | number>;
  outcome: QaReviewOutcome;
  delta?: QaDiscordanceDelta;
  severity?: QaDiscordanceSeverity;
  rootCause?: QaDiscordanceRootCause;
  rootCauseNote?: string;
  comments?: string;
}

interface Props {
  activityType: QaActivityType;
  onSubmit: (submission: QaReviewCaptureSubmission) => void | Promise<void>;
  busy?: boolean;
  /** Real, optional label override for the submit button — a caller
   *  embedding this in a case sign-out flow (mirroring Discordance's
   *  own "Continue Sign-Out" phrasing) vs. a standalone review
   *  worklist wants different call-to-action text on the same real
   *  form. */
  submitLabel?: string;
}

// Real, persisted QaReviewOutcome enum values — reuses auditLog.
// statusLabels.concordant/.discordant, an already-generic exact-wording
// match for these same two values.
const OUTCOME_LABEL_KEY: Record<QaReviewOutcome, string> = {
  concordant: 'auditLog.statusLabels.concordant',
  discordant: 'auditLog.statusLabels.discordant',
};

// Real, persisted QaDiscordanceDelta values. This generic form's own
// upgrade/downgrade wording is deliberately shorter than
// DiscordanceReconciliationModal.tsx's frozen-specific phrasing, but
// "Minor variance" is identically worded there, so it reuses that
// exact key.
const DELTA_LABEL_KEY: Record<QaDiscordanceDelta, string> = {
  upgrade: 'qaReviewCaptureForm.delta.upgrade',
  downgrade: 'qaReviewCaptureForm.delta.downgrade',
  minor_variance: 'discordanceReconciliationModal.delta.minorVariance',
};

// Real, persisted QaDiscordanceSeverity values — identical tier wording
// to DiscordanceReconciliationModal.tsx, reused verbatim.
const SEVERITY_LABEL_KEY: Record<QaDiscordanceSeverity, string> = {
  low: 'discordanceReconciliationModal.severity.low',
  medium: 'discordanceReconciliationModal.severity.medium',
  high: 'discordanceReconciliationModal.severity.high',
};

// Real, persisted QaDiscordanceRootCause values. "Interpretation error"
// and "Other" are identically worded to DiscordanceReconciliationModal.
// tsx/its own reused clientEditorModal key; sampling/technical are this
// form's own shorter, generic versions (no frozen-section-specific
// elaboration).
const ROOT_CAUSE_LABEL_KEY: Record<QaDiscordanceRootCause, string> = {
  sampling_error: 'qaReviewCaptureForm.rootCause.samplingError',
  interpretation_error: 'discordanceReconciliationModal.rootCause.interpretationError',
  technical_artifact: 'qaReviewCaptureForm.rootCause.technicalArtifact',
  other: 'clientEditorModal.general.other',
};

export const QaReviewCaptureForm: React.FC<Props> = ({ activityType, onSubmit, busy, submitLabel }) => {
  const { t } = useTranslation();
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[] | number>>({});
  const [outcome, setOutcome] = useState<QaReviewOutcome | ''>('');
  const [delta, setDelta] = useState<QaDiscordanceDelta | ''>('');
  const [severity, setSeverity] = useState<QaDiscordanceSeverity | ''>('');
  const [rootCause, setRootCause] = useState<QaDiscordanceRootCause | ''>('');
  const [rootCauseNote, setRootCauseNote] = useState('');
  const [comments, setComments] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const draft: QaReviewSubmissionDraft = {
    fieldValues, outcome,
    delta: delta || undefined, severity: severity || undefined, rootCause: rootCause || undefined,
    rootCauseNote, comments,
  };
  const validation = validateQaReviewSubmission(activityType, draft);

  const setSingle = (fieldId: string, value: string) => setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  const setMulti = (fieldId: string, optionId: string) => setFieldValues(prev => {
    const current = (prev[fieldId] as string[]) || [];
    const next = current.includes(optionId) ? current.filter(v => v !== optionId) : [...current, optionId];
    return { ...prev, [fieldId]: next };
  });

  const handleSubmit = async () => {
    if (!validation.valid) { setShowErrors(true); return; }
    await onSubmit({
      fieldValues,
      outcome: outcome as QaReviewOutcome,
      delta: delta || undefined,
      severity: severity || undefined,
      rootCause: rootCause || undefined,
      rootCauseNote: rootCauseNote.trim() || undefined,
      comments: comments.trim() || undefined,
    });
  };

  return (
    <div data-testid="qa-review-capture-form">
      {activityType.fields.map(field => (
        <div className="ps-conf-form-field" key={field.id}>
          <label className="ps-conf-label" htmlFor={`qa-field-${field.id}`}>
            {field.label}{field.required && <span className="ps-qareview-required-marker">*</span>}
          </label>
          {field.hint && <p className="ps-intraop-gate-note">{field.hint}</p>}

          {field.type === 'dropdown' && (
            <select id={`qa-field-${field.id}`} className="ps-conf-select ps-qareview-input-base"
              value={(fieldValues[field.id] as string) || ''} onChange={e => setSingle(field.id, e.target.value)}>
              <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
              {field.options.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
          )}

          {field.type === 'radio' && (
            <div className="ps-qareview-option-list">
              {field.options.map(opt => (
                <label key={opt.id} className="ps-qareview-option-row">
                  <input type="radio" name={field.id} value={opt.id}
                    checked={fieldValues[field.id] === opt.id}
                    onChange={() => setSingle(field.id, opt.id)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {field.type === 'checkboxes' && (
            <div className="ps-qareview-option-list">
              {field.options.map(opt => {
                const current = (fieldValues[field.id] as string[]) || [];
                return (
                  <label key={opt.id} className="ps-qareview-option-row">
                    <input type="checkbox" checked={current.includes(opt.id)} onChange={() => setMulti(field.id, opt.id)} />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}

          {field.type === 'numeric' && (
            <input id={`qa-field-${field.id}`} className="ps-conf-input ps-qareview-input-base" type="number"
              value={(fieldValues[field.id] as string) ?? ''} onChange={e => setSingle(field.id, e.target.value)} />
          )}

          {field.type === 'text' && (
            <input id={`qa-field-${field.id}`} className="ps-conf-input ps-qareview-input-base" type="text"
              value={(fieldValues[field.id] as string) || ''} onChange={e => setSingle(field.id, e.target.value)} />
          )}

          {field.type === 'longtext' && (
            <textarea id={`qa-field-${field.id}`} className="ps-conf-input ps-conf-textarea ps-qareview-input-base"
              value={(fieldValues[field.id] as string) || ''} onChange={e => setSingle(field.id, e.target.value)} />
          )}

          {showErrors && validation.errors[field.id] && (
            <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors[field.id]}</p>
          )}
        </div>
      ))}

      <div className="ps-conf-form-field">
        <label className="ps-conf-label">{t('cytologyQaTab.headers.outcome')}</label>
        <div className="ps-qareview-outcome-row">
          <label className="ps-qareview-option-row">
            <input type="radio" name="qa-outcome" checked={outcome === 'concordant'} onChange={() => setOutcome('concordant')} />
            <span>{t(OUTCOME_LABEL_KEY.concordant)}</span>
          </label>
          <label className="ps-qareview-option-row">
            <input type="radio" name="qa-outcome" checked={outcome === 'discordant'} onChange={() => setOutcome('discordant')} />
            <span>{t(OUTCOME_LABEL_KEY.discordant)}</span>
          </label>
        </div>
        {showErrors && validation.errors.outcome && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.outcome}</p>}
      </div>

      {outcome === 'discordant' && (
        <div className="ps-intraop-action-block">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="qa-delta">{t('discordanceReconciliationModal.deltaLabel')}</label>
            <select id="qa-delta" className="ps-conf-select ps-qareview-input-base" value={delta} onChange={e => setDelta(e.target.value as QaDiscordanceDelta | '')}>
              <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
              <option value="upgrade">{t(DELTA_LABEL_KEY.upgrade)}</option>
              <option value="downgrade">{t(DELTA_LABEL_KEY.downgrade)}</option>
              <option value="minor_variance">{t(DELTA_LABEL_KEY.minor_variance)}</option>
            </select>
            {showErrors && validation.errors.delta && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.delta}</p>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="qa-severity">{t('discordanceReconciliationModal.severityLabel')}</label>
            <select id="qa-severity" className="ps-conf-select ps-qareview-input-base" value={severity} onChange={e => setSeverity(e.target.value as QaDiscordanceSeverity | '')}>
              <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
              <option value="low">{t(SEVERITY_LABEL_KEY.low)}</option>
              <option value="medium">{t(SEVERITY_LABEL_KEY.medium)}</option>
              <option value="high">{t(SEVERITY_LABEL_KEY.high)}</option>
            </select>
            {showErrors && validation.errors.severity && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.severity}</p>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="qa-root-cause">{t('discordanceReconciliationModal.rootCauseLabel')}</label>
            <select id="qa-root-cause" className="ps-conf-select ps-qareview-input-base" value={rootCause} onChange={e => setRootCause(e.target.value as QaDiscordanceRootCause | '')}>
              <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
              <option value="sampling_error">{t(ROOT_CAUSE_LABEL_KEY.sampling_error)}</option>
              <option value="interpretation_error">{t(ROOT_CAUSE_LABEL_KEY.interpretation_error)}</option>
              <option value="technical_artifact">{t(ROOT_CAUSE_LABEL_KEY.technical_artifact)}</option>
              <option value="other">{t(ROOT_CAUSE_LABEL_KEY.other)}</option>
            </select>
            {showErrors && validation.errors.rootCause && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.rootCause}</p>}
          </div>

          {rootCause === 'other' && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="qa-root-cause-note">{t('discordanceReconciliationModal.explainLabel')}</label>
              <input id="qa-root-cause-note" className="ps-conf-input ps-qareview-input-base" value={rootCauseNote} onChange={e => setRootCauseNote(e.target.value)} placeholder={t('discordanceReconciliationModal.explainPlaceholder')} />
              {showErrors && validation.errors.rootCauseNote && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.rootCauseNote}</p>}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="qa-comments">{t('discordanceReconciliationModal.commentLabel')}</label>
            <textarea id="qa-comments" className="ps-conf-input ps-conf-textarea ps-qareview-input-base" value={comments} onChange={e => setComments(e.target.value)}
              placeholder={t('qaReviewCaptureForm.commentsPlaceholder')} />
            {showErrors && validation.errors.comments && <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">{validation.errors.comments}</p>}
          </div>
        </div>
      )}

      <button className="ps-ms-btn-apply" disabled={!!busy} onClick={handleSubmit}>
        {submitLabel ?? (outcome === 'discordant' ? t('qaReviewCaptureForm.recordDiscordanceButton') : t('qaReviewCaptureForm.confirmReviewButton'))}
      </button>
    </div>
  );
};
