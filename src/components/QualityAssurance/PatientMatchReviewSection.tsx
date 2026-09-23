// src/components/QualityAssurance/PatientMatchReviewSection.tsx
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
// Lives here, not Config/System/ (where it was first placed, and
// correctly relocated after a direct question) — this isn't a
// "configure once" settings screen the way TAT Configuration or Session
// Security are. It's a recurring work queue of flagged items needing
// real, ongoing human review and action — exactly the same shape as
// every other tab in this folder (Countersign Turnaround, Drift
// Correction, FPPE), not the shape of an admin settings screen.
// (Real, per direct discovery while converting this file: the old
// Config/System/PatientMatchReviewSection.tsx this was relocated FROM
// is still sitting there, unimported by anything — real, orphaned dead
// code from before the move, left untouched here since it's a
// different file outside this pass's own scope.)
//
// Scoped the same way as the other QA tabs' cross-tenant access
// (services/auth/caseAccessControl.ts's canViewCrossTenantQaData) — a
// standard user reviews their own organisation's queue only; a
// cross-tenant-permitted admin can pick any organisation.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { listOrganisations } from '@/services/organisation/organisationService';
import type { Organisation } from '@/services/organisation/organisationService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { caseRouter } from '@/services/cases/CaseRouter';
import ConfirmModal from '../Common/ConfirmModal';
import { exportQaReportRows } from './qaReportUtils';

const ALL_ORGS_VALUE = '__all__';

export const PatientMatchReviewSection: React.FC = () => {
  const { t } = useTranslation();
  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);

  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(session?.organisationId ?? '');
  const [pending, setPending] = useState<MasterPatientRecord[]>([]);
  const [candidateDetails, setCandidateDetails] = useState<Record<string, MasterPatientRecord>>({});
  /** Real accession context per provisional record — the actual case(s)
   *  that triggered the ambiguous flag. Without this, a reviewer is
   *  comparing two bare demographic records with nothing to help judge
   *  whether they're genuinely the same person: which specimen, which
   *  referring physician, when. Keyed by provisional record id. */
  const [caseContext, setCaseContext] = useState<Record<string, { accession?: string; specimen?: string; provider?: string; accessionedAt?: string; accessionedBy?: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ provisional: MasterPatientRecord; candidate: MasterPatientRecord } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ provisional: MasterPatientRecord; candidate: MasterPatientRecord } | null>(null);
  const [confirmNewTarget, setConfirmNewTarget] = useState<MasterPatientRecord | null>(null);
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
    // Real fix, item #92: cross-tenant admins previously had to switch
    // between organisations one at a time to see pending reviews across
    // the whole system - a real "See All" sentinel, aggregating across
    // every active org, closes that gap.
    const records = selectedOrgId === ALL_ORGS_VALUE
      ? (await Promise.all(organisations.map(o => mockPatientIndexService.listPendingReview(o.id)))).flat()
      : await mockPatientIndexService.listPendingReview(selectedOrgId);
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

    // Real accession context — one bulk fetch, grouped by provisional
    // patient id client-side, rather than one search per record.
    const casesRes = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    const contextByRecord: Record<string, { accession?: string; specimen?: string; provider?: string; accessionedAt?: string; accessionedBy?: string }[]> = {};
    if (casesRes.ok) {
      const recordIds = new Set(records.map(r => r.id));
      (casesRes.data as any[]).forEach(c => {
        const pid = c?.patient?.id;
        if (!pid || !recordIds.has(pid)) return;
        if (!contextByRecord[pid]) contextByRecord[pid] = [];
        contextByRecord[pid].push({
          accession: c?.fullAccession ?? c?.accession?.fullAccession,
          specimen: c?.specimens?.[0]?.description,
          provider: c?.order?.requestingProvider,
          accessionedAt: c?.accession?.accessionedAt,
          accessionedBy: c?.accession?.accessionedBy,
        });
      });
    }
    setCaseContext(contextByRecord);
    setLoading(false);
  }, [selectedOrgId, organisations]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleConfirmNewClick = (record: MasterPatientRecord) => {
    setConfirmNewTarget(record);
  };

  const handleConfirmNewConfirmed = async () => {
    if (!confirmNewTarget) return;
    setActionInFlight(confirmNewTarget.id);
    await mockPatientIndexService.confirmAsNewPatient(confirmNewTarget.id);
    setActionInFlight(null);
    setConfirmNewTarget(null);
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

  const handleLinkConfirmed = async () => {
    if (!linkTarget) return;
    setActionInFlight(linkTarget.provisional.id);
    await mockPatientIndexService.linkPatients(
      linkTarget.provisional.id,
      linkTarget.candidate.id,
      // Real, per direct guidance: this real review queue only ever
      // handles the MPI's own automatic 'ambiguous' matcher output —
      // the same real, single real person under two source-system
      // identities, never a family relation (which is never surfaced
      // to this queue in the first place, since it's not something
      // resolveOrCreatePatient()'s own matching logic ever flags).
      'same_person',
      session?.id ?? 'unknown',
      linkTarget.provisional.reviewReason,
    );
    setActionInFlight(null);
    setLinkTarget(null);
    loadQueue();
  };

  // "Just the working rows" — the queue currently on screen, not a
  // complete historical record (there isn't one for this queue the way
  // there is for deficiencies; a resolved match doesn't stay queryable
  // here once it's merged/linked/confirmed).
  // Real, exported/persisted CSV content — column headers and the
  // 'none' fallback value stay English per this app's established
  // convention (exported data keeps its own fixed shape/language).
  const handleExport = () => {
    const rows = pending.map(record => {
      const candidates = (record.reviewCandidateIds ?? [])
        .map(id => candidateDetails[id])
        .filter((c): c is MasterPatientRecord => !!c)
        .map(c => `${c.lastName}, ${c.firstName} (MRN ${c.mrn})`)
        .join('; ');
      const context = (caseContext[record.id] ?? [])
        .map(ctx => ctx.accession ?? '')
        .filter(Boolean)
        .join('; ');
      return {
        'Record': `${record.lastName}, ${record.firstName}`,
        'MRN': record.mrn,
        'DOB': new Date(record.dateOfBirth).toLocaleDateString(),
        'Flagged': record.createdAt,
        'Reason': record.reviewReason,
        'From Accession(s)': context,
        'Possible Matches': candidates || 'none',
      };
    });
    exportQaReportRows(rows, `patient-match-review-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const candidateCount = confirmNewTarget?.reviewCandidateIds?.length ?? 0;
  const confirmNewMessage = confirmNewTarget
    ? (candidateCount > 0
        ? t('patientMatchReviewSection.confirmNewModal.messageWithCandidates', {
            count: candidateCount,
            lastName: confirmNewTarget.lastName,
            firstName: confirmNewTarget.firstName,
            mrn: confirmNewTarget.mrn,
          })
        : t('patientMatchReviewSection.confirmNewModal.messageNoCandidates', {
            lastName: confirmNewTarget.lastName,
            firstName: confirmNewTarget.firstName,
            mrn: confirmNewTarget.mrn,
          }))
    : '';

  const mergeMessage = mergeTarget
    ? t('patientMatchReviewSection.mergeModal.message', {
        provisionalLastName: mergeTarget.provisional.lastName,
        provisionalFirstName: mergeTarget.provisional.firstName,
        provisionalMrn: mergeTarget.provisional.mrn,
        candidateLastName: mergeTarget.candidate.lastName,
        candidateFirstName: mergeTarget.candidate.firstName,
        candidateMrn: mergeTarget.candidate.mrn,
      })
    : '';

  const linkMessage = linkTarget
    ? t('patientMatchReviewSection.linkModal.message', {
        provisionalLastName: linkTarget.provisional.lastName,
        provisionalFirstName: linkTarget.provisional.firstName,
        provisionalMrn: linkTarget.provisional.mrn,
        candidateLastName: linkTarget.candidate.lastName,
        candidateFirstName: linkTarget.candidate.firstName,
        candidateMrn: linkTarget.candidate.mrn,
      })
    : '';

  return (
    <div className="ps-patientmatch-page">
      <div className="ps-patientmatch-header">
        <h1 className="ps-patientmatch-title">{t('patientMatchReviewSection.header.title')}</h1>
        <p className="ps-patientmatch-intro">
          {t('patientMatchReviewSection.header.intro')}
        </p>
      </div>

      {crossTenant && (
        <div className="ps-patientmatch-org-row">
          <label className="ps-conf-label ps-patientmatch-org-label" htmlFor="pmr-organisation-select">{t('patientMatchReviewSection.organisationLabel')}</label>
          <select
            id="pmr-organisation-select"
            value={selectedOrgId}
            onChange={e => setSelectedOrgId(e.target.value)}
            className="ps-conf-select ps-patientmatch-org-select"
          >
            <option value="">{t('patientMatchReviewSection.selectOrganisationPlaceholder')}</option>
            <option value={ALL_ORGS_VALUE}>{t('patientMatchReviewSection.allOrganisationsOption')}</option>
            {organisations.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="ps-qa-tab-toolbar">
        <button className="ps-conf-btn-secondary" onClick={handleExport}>{t('common.export')}</button>
      </div>

      {lastMergeCount !== null && (
        <div className="ps-patientmatch-merged-banner">
          {/* Reuses the existing patientMatchReviewSection.mergedBanner key
              (already defined for this same namespace, checkmark and all —
              see the orphaned-file note above) rather than duplicating it. */}
          {t('patientMatchReviewSection.mergedBanner', { count: lastMergeCount })}
        </div>
      )}

      {loading ? (
        <div className="ps-patientmatch-status-text">{t('patientMatchReviewSection.loadingQueue')}</div>
      ) : !selectedOrgId ? (
        <div className="ps-patientmatch-status-text">{t('patientMatchReviewSection.selectOrgPrompt')}</div>
      ) : pending.length === 0 ? (
        <div className="ps-patientmatch-empty-box">
          {t('patientMatchReviewSection.nothingPending')}
        </div>
      ) : (
        <div className="ps-patientmatch-list">
          {pending.map(record => (
            <div key={record.id} className="ps-patientmatch-card">
              <div className="ps-patientmatch-card-header">
                <div>
                  <div className="ps-patientmatch-name" data-phi="name">
                    {record.lastName}, {record.firstName}
                  </div>
                  <div className="ps-patientmatch-meta" data-phi="true">
                    {t('patientMatchReviewSection.record.metaLine', {
                      mrn: record.mrn,
                      dob: new Date(record.dateOfBirth).toLocaleDateString(),
                      flagged: new Date(record.createdAt).toLocaleString(),
                    })}
                  </div>
                </div>
                <div className="ps-conf-status-cell">
                  <span className="ps-conf-status-dot ps-conf-status-dot--pending" />
                  <span className="ps-conf-status-text ps-conf-status-text--pending">{t('patientMatchReviewSection.needsReviewBadge')}</span>
                </div>
              </div>

              <div className="ps-patientmatch-reason">
                {record.reviewReason}
              </div>

              {(caseContext[record.id] ?? []).length > 0 && (
                <div className="ps-patientmatch-context-box">
                  <div className="ps-patientmatch-section-heading">
                    {t('patientMatchReviewSection.fromThisAccession')}
                  </div>
                  {(caseContext[record.id] ?? []).map((ctx, i) => (
                    <div key={i} className="ps-patientmatch-context-line">
                      {ctx.accession && <span data-phi="accession">{ctx.accession}</span>}
                      {ctx.specimen && <span> · {ctx.specimen}</span>}
                      {ctx.provider && <span> · {t('patientMatchReviewSection.referring', { provider: ctx.provider })}</span>}
                      {ctx.accessionedBy && <span> · {t('patientMatchReviewSection.accessionedBy', { by: ctx.accessionedBy })}</span>}
                      {ctx.accessionedAt && <span> {t('patientMatchReviewSection.onDate', { date: new Date(ctx.accessionedAt).toLocaleDateString() })}</span>}
                    </div>
                  ))}
                </div>
              )}

              {(record.reviewCandidateIds ?? []).length > 0 && (
                <div className="ps-patientmatch-candidates">
                  <div className="ps-patientmatch-section-heading ps-patientmatch-section-heading--spaced">
                    {t('patientMatchReviewSection.possibleMatchesHeading', { count: (record.reviewCandidateIds ?? []).length })}
                  </div>
                  <div className="ps-patientmatch-candidate-list">
                    {(record.reviewCandidateIds ?? []).map(candId => {
                      const cand = candidateDetails[candId];
                      if (!cand) return null;
                      return (
                        <div key={candId} className="ps-patientmatch-candidate-row">
                          <div>
                            <div className="ps-patientmatch-candidate-name" data-phi="name">{cand.lastName}, {cand.firstName}</div>
                            <div className="ps-patientmatch-candidate-meta" data-phi="true">
                              {/* Reuses the existing patientMatchReviewSection.mrnDob key
                                  (same {{mrn}}/{{dob}} shape already defined for this
                                  namespace) instead of a new duplicate key. */}
                              {t('patientMatchReviewSection.mrnDob', { mrn: cand.mrn, dob: new Date(cand.dateOfBirth).toLocaleDateString() })}
                            </div>
                          </div>
                          <div className="ps-patientmatch-candidate-actions">
                            <button
                              type="button"
                              className="ps-conf-btn-secondary"
                              disabled={actionInFlight === record.id}
                              onClick={() => setLinkTarget({ provisional: record, candidate: cand })}
                              title={t('patientMatchReviewSection.linkButtonTooltip')}
                            >
                              {t('patientMatchReviewSection.linkButton')}
                            </button>
                            <button
                              type="button"
                              className="ps-conf-btn-secondary"
                              disabled={actionInFlight === record.id}
                              onClick={() => setMergeTarget({ provisional: record, candidate: cand })}
                            >
                              {t('patientMatchReviewSection.mergeButton')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="ps-patientmatch-footer-row">
                <button
                  type="button"
                  className="ps-conf-btn-secondary"
                  disabled={actionInFlight === record.id}
                  onClick={() => handleConfirmNewClick(record)}
                >
                  {t('patientMatchReviewSection.confirmNewLabel')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        show={!!confirmNewTarget}
        title={t('patientMatchReviewSection.confirmNewLabel')}
        message={confirmNewTarget ? <span data-phi="true">{confirmNewMessage}</span> : ''}
        confirmLabel={t('patientMatchReviewSection.confirmNewModal.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmNewConfirmed}
        onCancel={() => setConfirmNewTarget(null)}
      />

      <ConfirmModal
        show={!!mergeTarget}
        title={t('patientMatchReviewSection.mergeModal.title')}
        message={mergeTarget ? <span data-phi="true">{mergeMessage}</span> : ''}
        confirmLabel={t('patientMatchReviewSection.mergeButton')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleMergeConfirmed}
        onCancel={() => setMergeTarget(null)}
      />

      <ConfirmModal
        show={!!linkTarget}
        title={t('patientMatchReviewSection.linkModal.title')}
        message={linkTarget ? <span data-phi="true">{linkMessage}</span> : ''}
        confirmLabel={t('patientMatchReviewSection.linkModal.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleLinkConfirmed}
        onCancel={() => setLinkTarget(null)}
      />
    </div>
  );
};
