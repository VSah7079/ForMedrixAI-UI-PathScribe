// src/components/QualityAssurance/PatientManagementSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("Since we have this PathScribe patient
// concept we need a mechanism to perform Merge, encounter record
// move or link. Those aren't accession activities. Perhaps a new
// section of Quality Assurance maybe Patient Management"). This is
// that section — the second half of that request; the first half
// (fixing mergeIntoExistingPatient()/moveCaseToPatient() to also
// correctly repoint a patient's real Encounter records, not just
// their Cases) is already real and done — see
// services/patients/README.md's own account.
//
// Real, proactive search (reuses mockPatientIndexService.searchPatients()
// directly, same pattern PatientLinkSearch.tsx / OrderLookupModal.tsx
// already use) lets a real user find a patient and act on them
// immediately, instead of the three real, scattered entry points this
// app had before: PatientMatchReviewSection.tsx's own review queue
// (system-flagged only), the inbound A24/A40 HL7 path (also
// system-triggered only), and AccessionPage.tsx's own "Check for
// Existing Patient" search (accessioning-time only, same_person only).
// This screen doesn't replace any of those — it's the one, real,
// on-demand place for a QA/HIM operator to proactively Merge, Link
// (either relationshipType), or Move a specific case, on their own
// initiative, for any real patient at any time.
//
// Reuses PatientLinkSearch.tsx for every "search for a second/target
// patient" step across all three real actions — never a fourth,
// separate implementation of the same real search.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmModal from '../Common/ConfirmModal';
import { PatientLinkSearch } from '@/pages/AccessionPage/PatientLinkSearch';
import { listOrganisations } from '@/services/organisation/organisationService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import type { MasterPatientRecord, PatientLinkRelationshipType } from '@/services/patients/IPatientIndexService';
import type { Case } from '@/types/case/Case';

type ActiveAction = 'merge' | 'link' | 'move' | null;

export const PatientManagementSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);

  // Real, per direct guidance: same real cross-tenant scoping
  // PatientMatchReviewSection.tsx already uses — a standard user
  // searches only their own real organisation; a cross-tenant-permitted
  // admin searches every real, active organisation this app knows
  // about. Fetched once, not hardcoded to specific seed org ids.
  const [searchableOrgIds, setSearchableOrgIds] = useState<string[]>(session?.organisationId ? [session.organisationId] : []);
  useEffect(() => {
    if (crossTenant) {
      listOrganisations().then(orgs => setSearchableOrgIds(orgs.filter(o => o.active).map(o => o.id)));
    }
  }, [crossTenant]);

  // Real, proactive primary search — who is this screen working on right now.
  const [primaryQuery, setPrimaryQuery] = useState('');
  const [primaryResults, setPrimaryResults] = useState<MasterPatientRecord[]>([]);
  const [primaryLoading, setPrimaryLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<MasterPatientRecord | null>(null);

  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [samePersonLinks, setSamePersonLinks] = useState<MasterPatientRecord[]>([]);
  const [familyRelationLinks, setFamilyRelationLinks] = useState<MasterPatientRecord[]>([]);

  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [targetPatient, setTargetPatient] = useState<MasterPatientRecord | null>(null);
  const [linkRelationshipType, setLinkRelationshipType] = useState<PatientLinkRelationshipType>('same_person');
  const [moveCaseId, setMoveCaseId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = primaryQuery.trim();
    if (q.length < 2 || searchableOrgIds.length === 0) { setPrimaryResults([]); return; }
    let cancelled = false;
    setPrimaryLoading(true);
    const timer = setTimeout(() => {
      Promise.all(searchableOrgIds.map(org => mockPatientIndexService.searchPatients(org, q).catch(() => [])))
        .then(batches => { if (!cancelled) setPrimaryResults(batches.flat()); })
        .finally(() => { if (!cancelled) setPrimaryLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [primaryQuery, searchableOrgIds]);

  const loadSelectedPatientDetail = useCallback(async (patient: MasterPatientRecord) => {
    const [casesRes, sameIds, familyIds] = await Promise.all([
      caseRouter.getAll({}, { includeOrchestration: true }),
      mockPatientIndexService.getLinkedPatientIds(patient.id, 'same_person'),
      mockPatientIndexService.getLinkedPatientIds(patient.id, 'family_relation'),
    ]);
    setSelectedCases(casesRes.ok ? (casesRes.data as Case[]).filter(c => c.patient?.id === patient.id) : []);
    const [sameRecords, familyRecords] = await Promise.all([
      Promise.all(sameIds.filter(id => id !== patient.id).map(id => mockPatientIndexService.getById(id))),
      Promise.all(familyIds.filter(id => id !== patient.id).map(id => mockPatientIndexService.getById(id))),
    ]);
    setSamePersonLinks(sameRecords.filter((r): r is MasterPatientRecord => !!r));
    setFamilyRelationLinks(familyRecords.filter((r): r is MasterPatientRecord => !!r));
  }, []);

  const selectPrimaryPatient = (patient: MasterPatientRecord) => {
    setSelectedPatient(patient);
    setPrimaryQuery(''); setPrimaryResults([]);
    setActiveAction(null); setTargetPatient(null); setMoveCaseId(''); setStatusMessage(null);
    loadSelectedPatientDetail(patient);
  };

  const refreshSelectedPatient = async () => {
    if (!selectedPatient) return;
    const refreshed = await mockPatientIndexService.getById(selectedPatient.id);
    if (refreshed) { setSelectedPatient(refreshed); await loadSelectedPatientDetail(refreshed); }
  };

  const openAction = (action: ActiveAction) => {
    setActiveAction(action); setTargetPatient(null); setMoveCaseId('');
    setLinkRelationshipType('same_person'); setStatusMessage(null);
  };

  // PS-72: kept as plain strings (not JSX) — they're only ever consumed
  // below via ConfirmModal, and that's where the single, whole-message
  // data-phi span goes (same "redact the whole message" convention as
  // PhiToastMessage, since every branch here names at least one patient).
  const confirmActionLabel = activeAction === 'merge'
    ? t('patientManagementSection.confirm.mergeLabel', { sourceFirstName: selectedPatient?.firstName, sourceLastName: selectedPatient?.lastName, targetFirstName: targetPatient?.firstName, targetLastName: targetPatient?.lastName })
    : activeAction === 'link'
      ? t('patientManagementSection.confirm.linkLabel', {
          sourceFirstName: selectedPatient?.firstName, sourceLastName: selectedPatient?.lastName,
          targetFirstName: targetPatient?.firstName, targetLastName: targetPatient?.lastName,
          relationship: linkRelationshipType === 'same_person' ? t('patientManagementSection.relationshipLabel.samePersonReal') : t('patientManagementSection.relationshipLabel.familyRelation'),
        })
      : t('patientManagementSection.confirm.moveLabel', { caseId: moveCaseId, sourceFirstName: selectedPatient?.firstName, sourceLastName: selectedPatient?.lastName, targetFirstName: targetPatient?.firstName, targetLastName: targetPatient?.lastName });

  const confirmActionMessage = activeAction === 'merge'
    ? t('patientManagementSection.confirm.mergeMessage')
    : activeAction === 'link'
      ? t('patientManagementSection.confirm.linkMessage')
      : t('patientManagementSection.confirm.moveMessage');

  const handleConfirmedAction = async () => {
    if (!selectedPatient || !targetPatient) return;
    setBusy(true);
    try {
      if (activeAction === 'merge') {
        const result = await mockPatientIndexService.mergeIntoExistingPatient(selectedPatient.id, targetPatient.id);
        setStatusMessage(t('patientManagementSection.status.mergedSuccess', {
          casesFragment: t('patientManagementSection.status.caseCount', { count: result.casesRepointed }),
          encountersFragment: t('patientManagementSection.status.encounterCount', { count: result.encountersRepointed }),
          targetFirstName: targetPatient.firstName, targetLastName: targetPatient.lastName,
        }));
      } else if (activeAction === 'link') {
        await mockPatientIndexService.linkPatients(selectedPatient.id, targetPatient.id, linkRelationshipType, user?.id ?? 'unknown', 'Linked from Patient Management');
        setStatusMessage(t('patientManagementSection.status.linkedSuccess', {
          targetFirstName: targetPatient.firstName, targetLastName: targetPatient.lastName,
          relationship: linkRelationshipType === 'same_person' ? t('patientManagementSection.relationshipLabel.samePerson') : t('patientManagementSection.relationshipLabel.familyRelation'),
        }));
      } else if (activeAction === 'move') {
        const result = await mockPatientIndexService.moveCaseToPatient(moveCaseId, selectedPatient.id, targetPatient.id, new Date().toISOString());
        setStatusMessage(result.moved
          ? t('patientManagementSection.status.moveSuccess', { caseId: moveCaseId, targetFirstName: targetPatient.firstName, targetLastName: targetPatient.lastName, encounterOutcome: result.encounterOutcome ?? t('patientManagementSection.status.noneValue') })
          : t('patientManagementSection.status.moveFailed', { reason: result.reason }));
      }
      setConfirmOpen(false);
      setActiveAction(null); setTargetPatient(null); setMoveCaseId('');
      await refreshSelectedPatient();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <div>
          <h2 className="ps-conf-section-title">{t('patientManagementSection.title')}</h2>
          <p className="ps-conf-section-subtitle">
            {t('patientManagementSection.subtitle')}
          </p>
        </div>
      </div>

      {!selectedPatient ? (
        <>
          <input
            className="ps-conf-input ps-patientmgmt-search-input"
            placeholder={t('patientManagementSection.searchPlaceholder')}
            value={primaryQuery}
            onChange={e => setPrimaryQuery(e.target.value)}
          />
          {primaryLoading && <p className="ps-conf-hint">{t('common.searching')}</p>}
          {primaryResults.length > 0 && (
            <div className="ps-accession-outside-link-results">
              {primaryResults.map(r => (
                <div key={r.id} className="ps-accession-outside-link-result">
                  <span data-phi="true">{t('patientManagementSection.searchResultLine', { firstName: r.firstName, lastName: r.lastName, mrn: r.mrn, dob: new Date(r.dateOfBirth).toLocaleDateString() })}</span>
                  <button className="ps-conf-btn-secondary" onClick={() => selectPrimaryPatient(r)}>{t('common.select')}</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ps-conf-table-wrap ps-conf-table-wrap--padded">
            <div className="ps-patientmgmt-card-header">
              <div>
                <div className="ps-patientmgmt-name" data-phi="name">{selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div className="ps-conf-hint" data-phi="true">{t('patientManagementSection.selectedMetaLine', { mrn: selectedPatient.mrn, dob: new Date(selectedPatient.dateOfBirth).toLocaleDateString(), id: selectedPatient.id })}</div>
                {selectedPatient.mergedInto && (
                  <p className="ps-conf-hint ps-conf-hint--danger">⚠ {t('patientManagementSection.mergedIntoWarning', { mergedInto: selectedPatient.mergedInto })}</p>
                )}
                {selectedPatient.needsReview && (
                  <p className="ps-conf-hint ps-conf-hint--warning">⚠ {t('patientManagementSection.flaggedForReviewWarning', { reason: selectedPatient.reviewReason })}</p>
                )}
                {selectedPatient.isDowntimeRecord && (
                  <p className="ps-conf-hint ps-conf-hint--warning">⚠ {t('patientManagementSection.downtimeWarning')}</p>
                )}
              </div>
              <button className="ps-btn-ghost-dark" onClick={() => { setSelectedPatient(null); setActiveAction(null); }}>← {t('patientManagementSection.newSearchButton')}</button>
            </div>

            <div className="ps-patientmgmt-cases-block">
              <div className="ps-conf-hint ps-patientmgmt-cases-heading">{t('patientManagementSection.realCasesHeading', { count: selectedCases.length })}</div>
              {selectedCases.length === 0 ? <p className="ps-conf-hint">{t('patientManagementSection.noCasesUnderIdentity')}</p> : (
                <ul className="ps-patientmgmt-cases-list">
                  {selectedCases.map(c => <li key={c.id} className="ps-conf-hint" data-phi="accession">{c.accession?.fullAccession ?? c.id}</li>)}
                </ul>
              )}
            </div>

            {(samePersonLinks.length > 0 || familyRelationLinks.length > 0) && (
              <div className="ps-patientmgmt-links-block">
                {samePersonLinks.length > 0 && (
                  <div className="ps-conf-hint" data-phi="name">{t('patientManagementSection.samePersonLine', { names: samePersonLinks.map(r => `${r.firstName} ${r.lastName}`).join(', ') })}</div>
                )}
                {familyRelationLinks.length > 0 && (
                  <div className="ps-conf-hint" data-phi="name">{t('patientManagementSection.familyRelationLine', { names: familyRelationLinks.map(r => `${r.firstName} ${r.lastName}`).join(', ') })}</div>
                )}
              </div>
            )}

            <div className="ps-patientmgmt-actions-row">
              <button className="ps-conf-btn-primary" onClick={() => openAction('merge')}>{t('patientManagementSection.mergeIntoButton')}</button>
              <button className="ps-conf-btn-primary" onClick={() => openAction('link')}>{t('patientManagementSection.linkToButton')}</button>
              <button className="ps-conf-btn-primary" disabled={selectedCases.length === 0} onClick={() => openAction('move')}>{t('patientManagementSection.moveACaseButton')}</button>
            </div>

            {/* PS-72: whole-message tagging, same convention as PhiToastMessage —
                the ✓ success paths here always name a target patient; only the
                ⚠ failure path doesn't, and redacting that one too is the accepted
                trade-off for not needing per-branch logic here. */}
            {statusMessage && <p className={`ps-conf-hint ps-patientmgmt-status-msg ${statusMessage.startsWith('⚠') ? 'ps-conf-hint--danger' : 'ps-conf-hint--success'}`} data-phi="true">{statusMessage}</p>}
          </div>

          {activeAction === 'move' && (
            <div className="ps-conf-table-wrap ps-conf-table-wrap--padded ps-conf-table-wrap--spaced">
              <label className="ps-label">{t('patientManagementSection.whichCaseLabel')}</label>
              <select className="ps-conf-select" data-phi="accession" value={moveCaseId} onChange={e => setMoveCaseId(e.target.value)}>
                <option value="">{t('patientManagementSection.selectPlaceholderOption')}</option>
                {selectedCases.map(c => <option key={c.id} value={c.id}>{c.accession?.fullAccession ?? c.id}</option>)}
              </select>
            </div>
          )}

          {activeAction === 'link' && (
            <div className="ps-conf-table-wrap ps-conf-table-wrap--padded ps-conf-table-wrap--spaced">
              <label className="ps-label">{t('patientManagementSection.relationshipLabel_field')}</label>
              <select className="ps-conf-select" value={linkRelationshipType} onChange={e => setLinkRelationshipType(e.target.value as PatientLinkRelationshipType)}>
                <option value="same_person">{t('patientManagementSection.relationshipOption.samePerson')}</option>
                <option value="family_relation">{t('patientManagementSection.relationshipOption.familyRelation')}</option>
              </select>
            </div>
          )}

          {(activeAction === 'merge' || activeAction === 'link' || (activeAction === 'move' && moveCaseId)) && (
            <div className="ps-patientmgmt-linksearch-wrap">
              <PatientLinkSearch
                organisationId={selectedPatient.organisationId}
                confirmed={targetPatient}
                onConfirm={setTargetPatient}
                title={activeAction === 'merge' ? t('patientManagementSection.linkSearch.mergeTitle') : activeAction === 'link' ? t('patientManagementSection.linkSearch.linkTitle') : t('patientManagementSection.linkSearch.moveTitle')}
                helpText={t('patientManagementSection.linkSearch.helpText')}
                confirmButtonLabel={t('common.select')}
                confirmedLabel={t('patientManagementSection.linkSearch.confirmedLabel')}
              />
              {targetPatient && (
                <button className="ps-conf-btn-primary ps-patientmgmt-continue-btn" onClick={() => setConfirmOpen(true)}>
                  {t('common.continue')}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        show={confirmOpen}
        title={t('patientManagementSection.confirmModalTitle')}
        message={<span data-phi="true">{confirmActionLabel} {confirmActionMessage}</span>}
        confirmLabel={busy ? t('patientManagementSection.workingButton') : t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default PatientManagementSection;
