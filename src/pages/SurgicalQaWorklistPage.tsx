// src/pages/SurgicalQaWorklistPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. The real, minimal worklist surface for the two surgical
// post-sign-out QA activities this ticket built: cases flagged for
// Post-Sign-Out Peer Review (random/targeted sampling, PS-117 engine +
// this ticket's own subspecialty risk-weighting) and specimens with an
// unresolved Biopsy-to-Resection Correlation candidate. Deliberately a
// standalone page/route for now, not embedded in the main worklist's
// own tiles yet — same real, disclosed placement CytologyQcQueuePage.tsx's
// own header already established for exactly this reason, and this
// page is built the same size/shape so it can move there unchanged
// later.
//
// Real, deliberate scope: this page's own job is finding and listing
// the real, already-detected flags/candidates (applySurgicalPostSignOutQa.ts
// is what actually detects them, at sign-out) and letting a reviewer
// record the actual review through the existing, generic
// QaReviewCaptureForm (PS-118) — it owns no detection or validation
// logic of its own.
//
// File-by-file cleanup sweep: this page's own header used to disclose a
// deliberate i18n gap ("real, separate follow-up work, not bundled into
// the same pass that built the underlying engine") — this sweep is that
// follow-up, per direct instruction. Every visible string now goes through
// useTranslation()/t() (surgicalQaWorklist.* in all five locale files). The
// duplicated patient-display-name helper this file used to carry its own
// copy of is now the shared resolvePatientFullDisplayName()
// (utils/personName.ts) — the same consolidation applied to
// CytologyQcQueuePage.tsx, which had copy-pasted the identical logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { qaActivityRecordService } from '@/services';
import {
  mockQaActivityTypeService,
  SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID,
  SURGICAL_BIOPSY_RESECTION_CORRELATION_ACTIVITY_TYPE_ID,
} from '@/services/quality/mockQaActivityTypeService';
import { resolveSurgicalPeerReviewPoolMembership } from '@/services/quality/resolveSurgicalPeerReviewPoolMembership';
import { resolveSurgicalBiopsyToResectionCorrelationPoolMembership } from '@/services/quality/resolveSurgicalBiopsyToResectionCorrelationPoolMembership';
import { QaReviewCaptureForm, type QaReviewCaptureSubmission } from '@/components/QualityAssurance/QaReviewCaptureForm';
import { resolvePatientFullDisplayName } from '@/utils/personName';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';

interface PeerReviewRow {
  kind: 'peer_review';
  caseId: string;
  specimenId: string;
  caseData: Case;
}

interface CorrelationRow {
  kind: 'correlation';
  caseId: string;
  specimenId: string;
  candidateCaseId: string;
  candidateSpecimenId: string;
  caseData: Case;
}

type Row = PeerReviewRow | CorrelationRow;

const SurgicalQaWorklistPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [activityTypes, setActivityTypes] = useState<QaActivityType[]>([]);
  const [activeRow, setActiveRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [casesRes, typesRes] = await Promise.all([caseRouter.getAll(), mockQaActivityTypeService.getAll()]);
    if (typesRes.ok) setActivityTypes(typesRes.data);
    if (!casesRes.ok) return;

    const nextRows: Row[] = [];
    for (const c of casesRes.data) {
      for (const s of c.specimens ?? []) {
        const spr = (s as Specimen).surgicalPeerReview;
        if (resolveSurgicalPeerReviewPoolMembership(spr)) {
          nextRows.push({ kind: 'peer_review', caseId: c.id, specimenId: s.id, caseData: c });
        }
        if (resolveSurgicalBiopsyToResectionCorrelationPoolMembership(spr?.biopsyToResectionCandidates)) {
          for (const cand of spr!.biopsyToResectionCandidates!.filter(x => x.recordedActivityRecordId === undefined && !x.dismissedAsNotRelevant)) {
            nextRows.push({
              kind: 'correlation', caseId: c.id, specimenId: s.id,
              candidateCaseId: cand.candidateCaseId, candidateSpecimenId: cand.candidateSpecimenId, caseData: c,
            });
          }
        }
      }
    }
    setRows(nextRows);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activityTypeForRow = (row: Row): QaActivityType | undefined =>
    activityTypes.find(t => t.id === (row.kind === 'peer_review' ? SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID : SURGICAL_BIOPSY_RESECTION_CORRELATION_ACTIVITY_TYPE_ID));

  const patchSpecimen = async (caseId: string, specimenId: string, mutate: (s: Specimen) => Specimen) => {
    const freshCase = await caseRouter.getCase(caseId);
    if (!freshCase) return;
    const patched = (freshCase.specimens ?? []).map(s => (s.id === specimenId ? mutate(s) : s));
    await caseRouter.updateCase(caseId, { specimens: patched });
  };

  const handleSubmit = async (row: Row, submission: QaReviewCaptureSubmission) => {
    if (!user) return;
    setBusy(true);
    try {
      const activityType = activityTypeForRow(row);
      if (!activityType) return;

      const record = await qaActivityRecordService.create({
        activityTypeId: activityType.id,
        caseId: row.caseId,
        specimenId: row.specimenId,
        caseType: row.caseData.specimens?.find(s => s.id === row.specimenId)?.description || row.caseData.id,
        subspecialtyId: row.caseData.subspecialtyId,
        fieldValues: submission.fieldValues,
        outcome: submission.outcome,
        delta: submission.delta,
        severity: submission.severity,
        rootCause: submission.rootCause,
        rootCauseNote: submission.rootCauseNote,
        comments: submission.comments,
        recordedBy: { userId: user.id, userName: user.name },
      });
      if (!record.ok) return;

      if (row.kind === 'peer_review') {
        await patchSpecimen(row.caseId, row.specimenId, s => ({
          ...s,
          surgicalPeerReview: { ...s.surgicalPeerReview, peerReviewRecordedActivityRecordId: record.data.id },
        }));
      } else {
        await patchSpecimen(row.caseId, row.specimenId, s => ({
          ...s,
          surgicalPeerReview: {
            ...s.surgicalPeerReview,
            biopsyToResectionCandidates: (s.surgicalPeerReview?.biopsyToResectionCandidates ?? []).map(c =>
              c.candidateCaseId === row.candidateCaseId && c.candidateSpecimenId === row.candidateSpecimenId
                ? { ...c, recordedActivityRecordId: record.data.id }
                : c
            ),
          },
        }));
      }
      setActiveRow(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDismissCandidate = async (row: CorrelationRow) => {
    await patchSpecimen(row.caseId, row.specimenId, s => ({
      ...s,
      surgicalPeerReview: {
        ...s.surgicalPeerReview,
        biopsyToResectionCandidates: (s.surgicalPeerReview?.biopsyToResectionCandidates ?? []).map(c =>
          c.candidateCaseId === row.candidateCaseId && c.candidateSpecimenId === row.candidateSpecimenId
            ? { ...c, dismissedAsNotRelevant: true }
            : c
        ),
      },
    }));
    await refresh();
  };

  return (
    <div className="ps-qcqueue-page">
      <h1 className="ps-qcqueue-title">{t('surgicalQaWorklist.pageTitle')}</h1>

      <div className="ps-qcqueue-list">
        {rows.map((row, i) => (
          <div key={`${row.kind}-${row.caseId}-${row.specimenId}-${i}`} className="ps-qcqueue-row">
            <div className="ps-qcqueue-row-patient">
              {resolvePatientFullDisplayName(row.caseData.patient) ?? row.caseData.id}
              <span className="ps-qcqueue-row-accession" data-phi="accession">{row.caseData.accession?.accessionNumber}</span>
            </div>
            <div className="ps-qcqueue-row-badges">
              {row.kind === 'peer_review' ? (
                <span className="ps-qcqueue-badge-pill">
                  {row.caseData.specimens?.find(s => s.id === row.specimenId)?.surgicalPeerReview?.postSignOutPeerReviewFlag?.reason === 'targeted_high_risk'
                    ? t('surgicalQaWorklist.peerReviewTargeted')
                    : t('surgicalQaWorklist.peerReviewRandom')}
                </span>
              ) : (
                <span className="ps-qcqueue-badge-pill">{t('surgicalQaWorklist.correlationCandidate', { candidateCaseId: row.candidateCaseId })}</span>
              )}
            </div>
            <div className="ps-qcqueue-row-actions">
              <button className="ps-conf-btn-primary" onClick={() => setActiveRow(row)}>{t('surgicalQaWorklist.recordReviewBtn')}</button>
              {row.kind === 'correlation' && (
                <button className="ps-conf-btn-secondary" onClick={() => handleDismissCandidate(row)}>{t('surgicalQaWorklist.notRelevantBtn')}</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="ps-conf-empty-row">{t('surgicalQaWorklist.emptyRow')}</div>}
      </div>

      {activeRow && (() => {
        const activityType = activityTypeForRow(activeRow);
        if (!activityType) return null;
        return (
          <div data-capture-hide="true" className="ps-conf-backdrop" onClick={() => setActiveRow(null)}>
            <div className="ps-conf-modal" onClick={e => e.stopPropagation()}>
              <div className="ps-conf-modal-header">{activityType.name}</div>
              <div className="ps-conf-modal-body">
                <QaReviewCaptureForm
                  activityType={activityType}
                  busy={busy}
                  onSubmit={submission => handleSubmit(activeRow, submission)}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SurgicalQaWorklistPage;
