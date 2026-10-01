// src/components/Config/System/PatientMatchReviewSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real review queue for the MPI's 'ambiguous' outcomes — every record
// resolveOrCreatePatient() couldn't confidently match one way or the
// other, per services/patients/IPatientIndexService.ts's own reasoning:
// a deterministic matcher that only ever auto-matches or auto-creates,
// with nothing routed to a human, would either silently merge two
// different people's histories or silently fragment one person's
// history across duplicate records — either is a real patient-safety
// problem, not a cosmetic one. This is the screen that closes the loop:
// without it, an ambiguous match gets flagged and then never actually
// looked at by anyone.
//
// Scoped the same way as the QA tabs' cross-tenant access
// (services/auth/caseAccessControl.ts's canViewCrossTenantQaData) — a
// standard user reviews their own organisation's queue only; a
// cross-tenant-permitted admin can pick any organisation.
//
// i18n sweep (batch 58): every on-screen label, placeholder, and status
// message converted to a new `patientMatchReviewSection` namespace,
// including the merge-confirmation dialog's message (translated phrasing,
// with the real patient names/MRNs interpolated in — this is on-screen UI
// text, not a persisted/audit record). Real patient data (lastName,
// firstName, mrn, dateOfBirth, reviewReason) and resolved organisation
// names stay exactly as stored — none of that is UI chrome.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { listOrganisations } from '@/services/organisation/organisationService';
import type { Organisation } from '@/services/organisation/organisationService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import ConfirmModal from '../../Common/ConfirmModal';

const PatientMatchReviewSection: React.FC = () => {
  const { t } = useTranslation();
  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);

  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(session?.organisationId ?? '');
  const [pending, setPending] = useState<MasterPatientRecord[]>([]);
  const [candidateDetails, setCandidateDetails] = useState<Record<string, MasterPatientRecord>>({});
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ provisional: MasterPatientRecord; candidate: MasterPatientRecord } | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [lastMergeCount, setLastMergeCount] = useState<number | null>(null);

  useEffect(() => {
    if (crossTenant) {
      listOrganisations().then(orgs => setOrganisations(orgs.filter(o => o.active)));
    }
  }, [crossTenant]);

  const loadQueue = React.useCallback(async () => {
    if (!selectedOrgId) { setPending([]); setLoading(false); return; }
    setLoading(true);
    const records = await mockPatientIndexService.listPendingReview(selectedOrgId);
    setPending(records);
    // Real candidate detail lookup — the queue needs to show WHO each
    // flagged record might actually be (name, MRN, DOB), not just an
    // opaque id, or a reviewer has nothing to actually compare against.
    const ids = Array.from(new Set(records.flatMap(r => r.reviewCandidateIds ?? [])));
    const details: Record<string, MasterPatientRecord> = {};
    await Promise.all(ids.map(async id => {
      const rec = await mockPatientIndexService.getById(id);
      if (rec) details[id] = rec;
    }));
    setCandidateDetails(details);
    setLoading(false);
  }, [selectedOrgId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleConfirmNew = async (record: MasterPatientRecord) => {
    setActionInFlight(record.id);
    await mockPatientIndexService.confirmAsNewPatient(record.id);
    setActionInFlight(null);
    loadQueue();
  };

  const handleMergeConfirmed = async () => {
    if (!mergeTarget) return;
    setActionInFlight(mergeTarget.provisional.id);
    const result = await mockPatientIndexService.mergeIntoExistingPatient(mergeTarget.provisional.id, mergeTarget.candidate.id);
    setActionInFlight(null);
    setLastMergeCount(result.casesRepointed);
    setMergeTarget(null);
    loadQueue();
  };

  return (
    <div className="ps-patientmatch__page">
      <div className="ps-patientmatch__header">
        <h1 className="ps-routingrules__title">{t('patientMatchReviewSection.title')}</h1>
        <p className="ps-routingrules__subtitle">
          {t('patientMatchReviewSection.subtitle')}
        </p>
      </div>

      {crossTenant && (
        <div className="ps-patientmatch__org-wrap">
          <label className="ps-conf-label ps-patientmatch__org-label">{t('patientMatchReviewSection.orgLabel')}</label>
          <select
            value={selectedOrgId}
            onChange={e => setSelectedOrgId(e.target.value)}
            className="ps-conf-select ps-patientmatch__org-select"
          >
            <option value="">{t('patientMatchReviewSection.orgPlaceholder')}</option>
            {organisations.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {lastMergeCount !== null && (
        <div className="ps-patientmatch__merge-banner">
          {t('patientMatchReviewSection.mergedBanner', { count: lastMergeCount })}
        </div>
      )}

      {loading ? (
        <div className="ps-patientmatch__placeholder">{t('patientMatchReviewSection.loadingQueue')}</div>
      ) : !selectedOrgId ? (
        <div className="ps-patientmatch__placeholder">{t('patientMatchReviewSection.selectOrgPrompt')}</div>
      ) : pending.length === 0 ? (
        <div className="ps-patientmatch__empty-box">
          {t('patientMatchReviewSection.emptyQueue')}
        </div>
      ) : (
        <div className="ps-vs-studies">
          {pending.map(record => (
            <div key={record.id} className="ps-snomed-severity__add-card">
              <div className="ps-patientmatch__record-header">
                <div>
                  <div className="ps-patientmatch__record-name">
                    {record.lastName}, {record.firstName}
                  </div>
                  <div className="ps-patientmatch__record-meta" data-phi="mrn">
                    {t('patientMatchReviewSection.mrnDob', { mrn: record.mrn, dob: new Date(record.dateOfBirth).toLocaleDateString() })}
                  </div>
                </div>
                <span className="ps-patientmatch__badge">
                  {t('patientMatchReviewSection.needsReviewBadge')}
                </span>
              </div>

              <div className="ps-patientmatch__reason">
                {record.reviewReason}
              </div>

              {(record.reviewCandidateIds ?? []).length > 0 && (
                <div className="ps-patientmatch__candidates">
                  <div className="ps-patientmatch__candidates-label">
                    {t('patientMatchReviewSection.possibleMatch', { count: (record.reviewCandidateIds ?? []).length })}
                  </div>
                  <div className="ps-diff-list">
                    {(record.reviewCandidateIds ?? []).map(candId => {
                      const cand = candidateDetails[candId];
                      if (!cand) return null;
                      return (
                        <div key={candId} className="ps-patientmatch__candidate-row">
                          <div>
                            <div className="ps-patientmatch__candidate-name">{cand.lastName}, {cand.firstName}</div>
                            <div className="ps-patientmatch__candidate-meta" data-phi="mrn">{t('patientMatchReviewSection.mrnDob', { mrn: cand.mrn, dob: new Date(cand.dateOfBirth).toLocaleDateString() })}</div>
                          </div>
                          <button
                            type="button"
                            className="ps-conf-btn-secondary"
                            disabled={actionInFlight === record.id}
                            onClick={() => setMergeTarget({ provisional: record, candidate: cand })}
                          >
                            {t('patientMatchReviewSection.mergeIntoBtn')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="ps-patientmatch__actions-row">
                <button
                  type="button"
                  className="ps-conf-btn-secondary"
                  disabled={actionInFlight === record.id}
                  onClick={() => handleConfirmNew(record)}
                >
                  {actionInFlight === record.id ? t('patientMatchReviewSection.confirmingBtn') : t('patientMatchReviewSection.confirmNewBtn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        show={!!mergeTarget}
        title={t('patientMatchReviewSection.modal.title')}
        message={mergeTarget
          ? t('patientMatchReviewSection.modal.message', {
              provisionalName: `${mergeTarget.provisional.lastName}, ${mergeTarget.provisional.firstName}`,
              provisionalMrn: mergeTarget.provisional.mrn,
              candidateName: `${mergeTarget.candidate.lastName}, ${mergeTarget.candidate.firstName}`,
              candidateMrn: mergeTarget.candidate.mrn,
            })
          : ''}
        confirmLabel={t('patientMatchReviewSection.modal.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleMergeConfirmed}
        onCancel={() => setMergeTarget(null)}
      />
    </div>
  );
};

export default PatientMatchReviewSection;
