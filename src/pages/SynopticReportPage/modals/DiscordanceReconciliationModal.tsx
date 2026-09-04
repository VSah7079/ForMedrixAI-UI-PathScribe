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
import { qaActivityRecordService } from '@/services';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import type { FrozenCategory } from '@/types/intraop/IntraoperativeEntry';
import type { QaActivityRecord, QaDiscordanceDelta, QaDiscordanceSeverity, QaDiscordanceRootCause } from '@/types/quality/QaActivityRecord';

const CATEGORY_LABEL: Record<FrozenCategory, string> = {
  benign: 'Benign', malignant: 'Malignant', atypical_suspicious: 'Atypical / Suspicious', deferred: 'Deferred',
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
        <div className="ps-ms-header">Frozen-to-Permanent Reconciliation</div>
        <div className="ps-ms-body">
          {isTeachingCase && (
            <div className="ps-intraop-note" style={{ borderColor: 'rgba(96,165,250,0.4)' }}>
              <span className="ps-intraop-note-label">🎓 Teaching Case</span>
              Drafted by {draftedBy!.userName} — reconciling as {performedBy.userName}
            </div>
          )}

          <div className="ps-intraop-note">
            <span className="ps-intraop-note-label">Frozen section — {CATEGORY_LABEL[frozenCategory]}</span>
            {frozenDx || '(no diagnosis text recorded)'}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Final diagnosis</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={finalDx} onChange={e => setFinalDx(e.target.value)} placeholder="Enter the final diagnosis for this specimen" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="discordance-final-category">Final category</label>
            <select id="discordance-final-category" className="ps-conf-select" value={finalCategory} onChange={e => { setFinalCategory(e.target.value as FrozenCategory | ''); setShowDiscordantForm(false); }}>
              <option value="">Select…</option>
              <option value="benign">Benign</option>
              <option value="malignant">Malignant</option>
              <option value="atypical_suspicious">Atypical / Suspicious</option>
            </select>
          </div>

          {finalCategory && finalCategory !== frozenCategory && !showDiscordantForm && (
            <p className="ps-intraop-gate-note">Final category differs from frozen — this needs to be logged as a discordance before sign-out can continue.</p>
          )}

          {finalCategory && finalCategory !== frozenCategory && (
            <div className="ps-intraop-action-block">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-delta">Delta</label>
                <select id="discordance-delta" className="ps-conf-select" value={delta} onChange={e => setDelta(e.target.value as QaDiscordanceDelta | '')}>
                  <option value="">Select…</option>
                  <option value="upgrade">Upgrade — frozen understated severity</option>
                  <option value="downgrade">Downgrade — frozen overstated severity</option>
                  <option value="minor_variance">Minor variance — same overall call, subtype/detail shifted</option>
                </select>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-severity">Clinical impact</label>
                <select id="discordance-severity" className="ps-conf-select" value={severity} onChange={e => setSeverity(e.target.value as QaDiscordanceSeverity | '')}>
                  <option value="">Select…</option>
                  <option value="low">Tier 1 — No harm / administrative</option>
                  <option value="medium">Tier 2 — Near miss / minor effect</option>
                  <option value="high">Tier 3 — Significant / major harm</option>
                </select>
                {/* Standard CAP/ISO 15189 patient-impact definitions, not
                    just a bare tier label — the actual wording doesn't
                    need to match any specific accreditation body's own
                    terms, but the tiers do need a clear, consistent
                    definition so two different pathologists apply them
                    the same way. */}
                {severity === 'low' && (
                  <p className="ps-intraop-gate-note">Doesn't alter diagnosis, staging, or treatment plan (e.g. specimen-site phrasing, a non-actionable benign variant). Tracked for internal QA only — no addendum or clinician notification needed.</p>
                )}
                {severity === 'medium' && (
                  <p className="ps-intraop-gate-note">Alters diagnostic detail or staging, but was caught before treatment was affected, or needed only a minor, non-harmful intervention. Requires a report addendum/amendment and departmental peer review.</p>
                )}
                {severity === 'high' && (
                  <p className="ps-intraop-gate-note" style={{ color: '#f87171', fontWeight: 600 }}>
                    Alters the primary diagnosis, surgical approach, oncology protocol, or prognostication. This will be flagged for mandatory clinician escalation and root-cause review.
                  </p>
                )}
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="discordance-root-cause">Root cause</label>
                <select id="discordance-root-cause" className="ps-conf-select" value={rootCause} onChange={e => setRootCause(e.target.value as QaDiscordanceRootCause | '')}>
                  <option value="">Select…</option>
                  <option value="sampling_error">Sampling error — diagnostic tissue not in the frozen piece</option>
                  <option value="interpretation_error">Interpretation error</option>
                  <option value="technical_artifact">Technical artifact — sectioning, staining</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {rootCause === 'other' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Explain</label>
                  <input className="ps-conf-input" value={rootCauseNote} onChange={e => setRootCauseNote(e.target.value)} placeholder="Brief explanation" />
                </div>
              )}
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Comment — required</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder="Auditable narrative explaining the discrepancy — what the frozen and final findings actually were, and why they differed."
                />
              </div>
            </div>
          )}

          {isTeachingCase && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Feedback for {draftedBy!.userName} — optional</label>
              <textarea
                className="ps-conf-input ps-conf-textarea"
                value={attendingFeedback}
                onChange={e => setAttendingFeedback(e.target.value)}
                placeholder="Targeted feedback for the trainee — captured here instead of a separate note later."
              />
            </div>
          )}
        </div>
        <div className="ps-ms-footer">
          {finalCategory && finalCategory === frozenCategory ? (
            <button className="ps-ms-btn-apply" disabled={!canConfirmConcordant || busy} onClick={confirmConcordant}>Confirm Concordant — Continue Sign-Out</button>
          ) : (
            <button className="ps-ms-btn-apply" disabled={busy || !canSubmitDiscordant} onClick={submitDiscordant}>Record Discordance — Continue Sign-Out</button>
          )}
        </div>
      </div>
    </div>
  );
};
