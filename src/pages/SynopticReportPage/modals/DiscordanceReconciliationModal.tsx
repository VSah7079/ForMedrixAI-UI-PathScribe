// src/pages/SynopticReportPage/modals/DiscordanceReconciliationModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Fires at sign-out only when this case has a merged intraop specimen
// with a real frozen category set (not 'deferred' — no real frozen call
// was made, so there's nothing to reconcile against). Concordant is one
// click, nothing else to fill in. Discordant asks for Delta, Clinical
// Impact, Root Cause, AND a required narrative comment — the
// pathologist's own judgment on the structured fields, but ISO 15189/
// CAP audit expectations require an actual auditable explanation for a
// discordance too, not just a dropdown classification.
//
// draftedBy (optional): when the case has a resident/fellow on its
// participant team, this modal doubles as the Teaching & Onboarding
// feedback capture point — same reasoning as the rest of this feature's
// design: don't make the reviewer write a separate email critique later
// when the moment to capture it is right here at sign-out.
//
// PS-113, Stage 5. Writes only to qaActivityRecordService now — the old
// reconciliationService/ReconciliationRecord this modal used to
// dual-write to has been retired and deleted (first release, no real
// production history to preserve). buildQaActivityRecordPayload below
// is no longer a dual-write helper; it's simply the one, real payload
// builder.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useTranslation } from 'react-i18next';
import { qaActivityRecordService } from '@/services';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import type { FrozenCategory } from '@/types/intraop/IntraoperativeEntry';
import type { QaActivityRecord, QaDiscordanceDelta, QaDiscordanceSeverity, QaDiscordanceRootCause } from '@/types/quality/QaActivityRecord';

// Real, persisted enum values stay as data; only the displayed label is
// translated (this sweep's usual LABEL_KEY pattern). CATEGORY_LABEL_KEY
// reuses the exact intraopQueue.specimenStep.category* keys already
// rendered for this same FrozenCategory enum elsewhere in the app.
const CATEGORY_LABEL_KEY: Record<FrozenCategory, string> = {
  benign: 'intraopQueue.specimenStep.categoryBenign',
  malignant: 'intraopQueue.specimenStep.categoryMalignant',
  atypical_suspicious: 'intraopQueue.specimenStep.categoryAtypical',
  deferred: 'intraopQueue.specimenStep.categoryDeferred',
};

const DELTA_LABEL_KEY: Record<QaDiscordanceDelta, string> = {
  upgrade: 'discordanceReconciliationModal.delta.upgrade',
  downgrade: 'discordanceReconciliationModal.delta.downgrade',
  minor_variance: 'discordanceReconciliationModal.delta.minorVariance',
};

const SEVERITY_LABEL_KEY: Record<QaDiscordanceSeverity, string> = {
  low: 'discordanceReconciliationModal.severity.low',
  medium: 'discordanceReconciliationModal.severity.medium',
  high: 'discordanceReconciliationModal.severity.high',
};

const ROOT_CAUSE_LABEL_KEY: Record<QaDiscordanceRootCause, string> = {
  sampling_error: 'discordanceReconciliationModal.rootCause.samplingError',
  interpretation_error: 'discordanceReconciliationModal.rootCause.interpretationError',
  technical_artifact: 'discordanceReconciliationModal.rootCause.technicalArtifact',
  other: 'clientEditorModal.general.other',
};

function buildQaActivityRecordPayload(args: {
  caseId: string; specimenId: string; caseType: string; subspecialtyId?: string;
  frozenCategory: FrozenCategory; finalCategory: FrozenCategory;
  frozenDx: string; finalDx: string;
  outcome: 'concordant' | 'discordant';
  delta?: QaDiscordanceDelta; severity?: QaDiscordanceSeverity; rootCause?: QaDiscordanceRootCause;
  rootCauseNote?: string; escalationRequired?: boolean; comments?: string;
  recordedBy: { userId: string; userName: string };
  draftedBy?: { userId: string; userName: string };
  isTeachingOnboardingCase: boolean;
  reviewerFeedback?: string;
}): Omit<QaActivityRecord, 'id' | 'recordedAt'> {
  return {
    activityTypeId: FROZEN_FINAL_ACTIVITY_TYPE_ID,
    caseId: args.caseId, specimenId: args.specimenId, caseType: args.caseType, subspecialtyId: args.subspecialtyId,
    fieldValues: {
      frozenCategory: args.frozenCategory, finalCategory: args.finalCategory,
      frozenDx: args.frozenDx, finalDx: args.finalDx,
    },
    outcome: args.outcome,
    delta: args.delta, severity: args.severity, rootCause: args.rootCause,
    rootCauseNote: args.rootCauseNote, escalationRequired: args.escalationRequired, comments: args.comments,
    recordedBy: args.recordedBy,
    draftedBy: args.draftedBy,
    isTeachingOnboardingCase: args.isTeachingOnboardingCase,
    reviewerFeedback: args.reviewerFeedback,
  };
}

interface Props {
  caseId: string;
  specimenId: string;
  caseType: string;
  frozenCategory: FrozenCategory;
  frozenDx: string;
  performedBy: { userId: string; userName: string };
  /** Who authored the original draft, if this case has a resident/
   *  fellow participant whose work is being reconciled — undefined for
   *  the common non-teaching path. See QaActivityRecord.draftedBy's
   *  own doc comment. */
  draftedBy?: { userId: string; userName: string };
  /** The case's own Case.subspecialtyId, passed through unchanged —
   *  see QaActivityRecord.subspecialtyId's own doc comment for why
   *  this is Subspecialty, not Department. */
  subspecialtyId?: string;
  onDone: () => void;
}

export const DiscordanceReconciliationModal: React.FC<Props> = ({ caseId, specimenId, caseType, frozenCategory, frozenDx, performedBy, draftedBy, subspecialtyId, onDone }) => {
  const { t } = useTranslation();
  const [finalCategory, setFinalCategory] = useState<FrozenCategory | ''>('');
  const [finalDx, setFinalDx] = useState('');
  const [showDiscordantForm, setShowDiscordantForm] = useState(false);
  const [delta, setDelta] = useState<QaDiscordanceDelta | ''>('');
  const [severity, setSeverity] = useState<QaDiscordanceSeverity | ''>('');
  const [rootCause, setRootCause] = useState<QaDiscordanceRootCause | ''>('');
  const [rootCauseNote, setRootCauseNote] = useState('');
  const [comments, setComments] = useState('');
  const [attendingFeedback, setAttendingFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const isTeachingCase = !!draftedBy && draftedBy.userId !== performedBy.userId;

  const canConfirmConcordant = finalDx.trim() && finalCategory;
  // comments.trim() is the mandatory-narrative fix — previously only
  // required when rootCause === 'other', which meant sampling error,
  // interpretation error, and technical artifact (the three most common
  // root causes) could be recorded with zero explanation at all.
  const canSubmitDiscordant = canConfirmConcordant && delta && severity && rootCause && comments.trim() && (rootCause !== 'other' || rootCauseNote.trim());

  const confirmConcordant = async () => {
    if (!finalCategory) return;
    setBusy(true);
    await qaActivityRecordService.create(buildQaActivityRecordPayload({
      caseId, specimenId, caseType, subspecialtyId,
      frozenCategory, finalCategory, frozenDx, finalDx: finalDx.trim(),
      outcome: 'concordant',
      recordedBy: performedBy, draftedBy,
      isTeachingOnboardingCase: isTeachingCase,
      reviewerFeedback: attendingFeedback.trim() || undefined,
    }));
    setBusy(false);
    onDone();
  };

  const submitDiscordant = async () => {
    if (!finalCategory || !delta || !severity || !rootCause || !comments.trim()) return;
    setBusy(true);
    await qaActivityRecordService.create(buildQaActivityRecordPayload({
      caseId, specimenId, caseType, subspecialtyId,
      frozenCategory, finalCategory, frozenDx, finalDx: finalDx.trim(),
      outcome: 'discordant',
      delta, severity, rootCause,
      escalationRequired: severity === 'high',
      rootCauseNote: rootCauseNote.trim() || undefined,
      comments: comments.trim(),
      recordedBy: performedBy, draftedBy,
      isTeachingOnboardingCase: isTeachingCase,
      reviewerFeedback: attendingFeedback.trim() || undefined,
    }));
    setBusy(false);
    onDone();
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{t('discordanceReconciliationModal.header')}</div>
        <div className="ps-ms-body">
          {/* Real, per direct follow-up ("shows the intraop vs final
              with AI outcome... an extra step but probably a good
              step") — this modal only ever opens via the real,
              automatic detection in useSignOutWorkflow.ts (confirmed
              directly: there is no other, manual trigger anywhere in
              this app), so every real instance of this screen IS the
              "AI outcome" the pathologist was asked to actively look
              at, not rely on a flag alone. Stated plainly rather than
              left implicit. */}
          <div className="ps-intraop-note ps-intraop-note--flagged">
            <span className="ps-intraop-note-label">⚖ {t('discordanceReconciliationModal.flaggedLabel')}</span>
            {t('discordanceReconciliationModal.flaggedBody')}
          </div>

          {isTeachingCase && (
            <div className="ps-intraop-note ps-intraop-note--teaching">
              <span className="ps-intraop-note-label">🎓 {t('discordanceReconciliationModal.teachingLabel')}</span>
              {t('discordanceReconciliationModal.teachingBody', { drafter: draftedBy!.userName, performer: performedBy.userName })}
            </div>
          )}

          <div className="ps-intraop-note">
            <span className="ps-intraop-note-label">{t('discordanceReconciliationModal.frozenSectionLabel', { category: t(CATEGORY_LABEL_KEY[frozenCategory]) })}</span>
            {frozenDx || t('discordanceReconciliationModal.noDxRecorded')}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('discordanceReconciliationModal.finalDiagnosisLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={finalDx} onChange={e => setFinalDx(e.target.value)} placeholder={t('discordanceReconciliationModal.finalDiagnosisPlaceholder')} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="discordance-final-category">{t('discordanceReconciliationModal.finalCategoryLabel')}</label>
            <select id="discordance-final-category" className="ps-conf-select" value={finalCategory} onChange={e => { setFinalCategory(e.target.value as FrozenCategory | ''); setShowDiscordantForm(false); }}>
              <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
              <option value="benign">{t(CATEGORY_LABEL_KEY.benign)}</option>
              <option value="malignant">{t(CATEGORY_LABEL_KEY.malignant)}</option>
              <option value="atypical_suspicious">{t(CATEGORY_LABEL_KEY.atypical_suspicious)}</option>
            </select>
          </div>

          {finalCategory && finalCategory !== frozenCategory && !showDiscordantForm && (
            <p className="ps-intraop-gate-note">{t('discordanceReconciliationModal.categoryDiffersNote')}</p>
          )}

          {finalCategory && finalCategory !== frozenCategory && (
            <div className="ps-intraop-action-block">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-delta">{t('discordanceReconciliationModal.deltaLabel')}</label>
                <select id="discordance-delta" className="ps-conf-select" value={delta} onChange={e => setDelta(e.target.value as QaDiscordanceDelta | '')}>
                  <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
                  <option value="upgrade">{t(DELTA_LABEL_KEY.upgrade)}</option>
                  <option value="downgrade">{t(DELTA_LABEL_KEY.downgrade)}</option>
                  <option value="minor_variance">{t(DELTA_LABEL_KEY.minor_variance)}</option>
                </select>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-severity">{t('discordanceReconciliationModal.severityLabel')}</label>
                <select id="discordance-severity" className="ps-conf-select" value={severity} onChange={e => setSeverity(e.target.value as QaDiscordanceSeverity | '')}>
                  <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
                  <option value="low">{t(SEVERITY_LABEL_KEY.low)}</option>
                  <option value="medium">{t(SEVERITY_LABEL_KEY.medium)}</option>
                  <option value="high">{t(SEVERITY_LABEL_KEY.high)}</option>
                </select>
                {/* Standard CAP/ISO 15189 patient-impact definitions, not
                    just a bare tier label — the actual wording doesn't
                    need to match any specific accreditation body's own
                    terms, but the tiers do need a clear, consistent
                    definition so two different pathologists apply them
                    the same way. */}
                {severity === 'low' && (
                  <p className="ps-intraop-gate-note">{t('discordanceReconciliationModal.severityHint.low')}</p>
                )}
                {severity === 'medium' && (
                  <p className="ps-intraop-gate-note">{t('discordanceReconciliationModal.severityHint.medium')}</p>
                )}
                {severity === 'high' && (
                  <p className="ps-intraop-gate-note ps-intraop-gate-note--critical">
                    {t('discordanceReconciliationModal.severityHint.high')}
                  </p>
                )}
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-root-cause">{t('discordanceReconciliationModal.rootCauseLabel')}</label>
                <select id="discordance-root-cause" className="ps-conf-select" value={rootCause} onChange={e => setRootCause(e.target.value as QaDiscordanceRootCause | '')}>
                  <option value="">{t('discordanceReconciliationModal.selectPlaceholder')}</option>
                  <option value="sampling_error">{t(ROOT_CAUSE_LABEL_KEY.sampling_error)}</option>
                  <option value="interpretation_error">{t(ROOT_CAUSE_LABEL_KEY.interpretation_error)}</option>
                  <option value="technical_artifact">{t(ROOT_CAUSE_LABEL_KEY.technical_artifact)}</option>
                  <option value="other">{t(ROOT_CAUSE_LABEL_KEY.other)}</option>
                </select>
              </div>
              {rootCause === 'other' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('discordanceReconciliationModal.explainLabel')}</label>
                  <input className="ps-conf-input" value={rootCauseNote} onChange={e => setRootCauseNote(e.target.value)} placeholder={t('discordanceReconciliationModal.explainPlaceholder')} />
                </div>
              )}
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('discordanceReconciliationModal.commentLabel')}</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder={t('discordanceReconciliationModal.commentPlaceholder')}
                />
              </div>
            </div>
          )}

          {isTeachingCase && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('discordanceReconciliationModal.feedbackLabel', { name: draftedBy!.userName })}</label>
              <textarea
                className="ps-conf-input ps-conf-textarea"
                value={attendingFeedback}
                onChange={e => setAttendingFeedback(e.target.value)}
                placeholder={t('discordanceReconciliationModal.feedbackPlaceholder')}
              />
            </div>
          )}
        </div>
        <div className="ps-ms-footer">
          {finalCategory && finalCategory === frozenCategory ? (
            <button className="ps-ms-btn-apply" disabled={!canConfirmConcordant || busy} onClick={confirmConcordant}>{t('discordanceReconciliationModal.confirmConcordantButton')}</button>
          ) : (
            <button className="ps-ms-btn-apply" disabled={busy || !canSubmitDiscordant} onClick={submitDiscordant}>{t('discordanceReconciliationModal.recordDiscordantButton')}</button>
          )}
        </div>
      </div>
    </div>
  );
};
