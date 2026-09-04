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

  const confirmActionLabel = activeAction === 'merge'
    ? `Merge ${selectedPatient?.firstName} ${selectedPatient?.lastName} into ${targetPatient?.firstName} ${targetPatient?.lastName}?`
    : activeAction === 'link'
      ? `Link ${selectedPatient?.firstName} ${selectedPatient?.lastName} to ${targetPatient?.firstName} ${targetPatient?.lastName} as ${linkRelationshipType === 'same_person' ? 'the same real person' : 'a family relation'}?`
      : `Move case ${moveCaseId} from ${selectedPatient?.firstName} ${selectedPatient?.lastName} to ${targetPatient?.firstName} ${targetPatient?.lastName}?`;

  const confirmActionMessage = activeAction === 'merge'
    ? 'This is irreversible: every real case and encounter under the merged-away identity will be repointed to the surviving one. The merged-away record is kept, not deleted, as a permanent audit trail.'
    : activeAction === 'link'
      ? 'Both identities stay fully, independently active — nothing is merged or repointed.'
      : 'Only this one specific case moves. Both identities stay independently active; any other real case under the source patient is untouched.';

  const handleConfirmedAction = async () => {
    if (!selectedPatient || !targetPatient) return;
    setBusy(true);
    try {
      if (activeAction === 'merge') {
        const result = await mockPatientIndexService.mergeIntoExistingPatient(selectedPatient.id, targetPatient.id);
        setStatusMessage(`✓ Merged — ${result.casesRepointed} case(s) and ${result.encountersRepointed} encounter(s) repointed to ${targetPatient.firstName} ${targetPatient.lastName}.`);
      } else if (activeAction === 'link') {
        await mockPatientIndexService.linkPatients(selectedPatient.id, targetPatient.id, linkRelationshipType, user?.id ?? 'unknown', 'Linked from Patient Management');
        setStatusMessage(`✓ Linked to ${targetPatient.firstName} ${targetPatient.lastName} as ${linkRelationshipType === 'same_person' ? 'the same person' : 'a family relation'}.`);
      } else if (activeAction === 'move') {
        const result = await mockPatientIndexService.moveCaseToPatient(moveCaseId, selectedPatient.id, targetPatient.id, new Date().toISOString());
        setStatusMessage(result.moved
          ? `✓ Case ${moveCaseId} moved to ${targetPatient.firstName} ${targetPatient.lastName}. Encounter: ${result.encounterOutcome ?? 'none'}.`
          : `⚠ Move failed: ${result.reason}`);
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
          <h2 className="ps-conf-section-title">Patient Management</h2>
          <p className="ps-conf-section-subtitle">
            Real, proactive Merge, Link, and Move — search for any real patient and act on them directly, rather
            than waiting for the system to flag something. Merge and Move both correctly repoint real Encounter
            records, not just Cases.
          </p>
        </div>
      </div>

      {!selectedPatient ? (
        <>
          <input
            className="ps-conf-input"
            style={{ maxWidth: 400 }}
            placeholder="Search by name or MRN…"
            value={primaryQuery}
            onChange={e => setPrimaryQuery(e.target.value)}
          />
          {primaryLoading && <p className="ps-conf-hint">Searching…</p>}
          {primaryResults.length > 0 && (
            <div className="ps-accession-outside-link-results" style={{ marginTop: 10 }}>
              {primaryResults.map(r => (
                <div key={r.id} className="ps-accession-outside-link-result">
                  <span>{r.firstName} {r.lastName} — MRN {r.mrn} — DOB {new Date(r.dateOfBirth).toLocaleDateString()}</span>
                  <button className="ps-conf-btn-secondary" onClick={() => selectPrimaryPatient(r)}>Select</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ps-conf-table-wrap" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div className="ps-conf-hint">MRN {selectedPatient.mrn} · DOB {new Date(selectedPatient.dateOfBirth).toLocaleDateString()} · {selectedPatient.id}</div>
                {selectedPatient.mergedInto && (
                  <p className="ps-conf-hint" style={{ color: '#ef4444' }}>⚠ This record was merged into {selectedPatient.mergedInto} — acting on the surviving record is usually correct instead.</p>
                )}
                {selectedPatient.needsReview && (
                  <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>⚠ Flagged for review: {selectedPatient.reviewReason}</p>
                )}
                {selectedPatient.isDowntimeRecord && (
                  <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>⚠ Downtime/placeholder identity</p>
                )}
              </div>
              <button className="ps-btn-ghost-dark" onClick={() => { setSelectedPatient(null); setActiveAction(null); }}>← New Search</button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="ps-conf-hint" style={{ fontWeight: 600 }}>Real Cases ({selectedCases.length})</div>
              {selectedCases.length === 0 ? <p className="ps-conf-hint">No real cases under this identity.</p> : (
                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                  {selectedCases.map(c => <li key={c.id} className="ps-conf-hint">{c.accession?.fullAccession ?? c.id}</li>)}
                </ul>
              )}
            </div>

            {(samePersonLinks.length > 0 || familyRelationLinks.length > 0) && (
              <div style={{ marginTop: 10 }}>
                {samePersonLinks.length > 0 && (
                  <div className="ps-conf-hint">Same person: {samePersonLinks.map(r => `${r.firstName} ${r.lastName}`).join(', ')}</div>
                )}
                {familyRelationLinks.length > 0 && (
                  <div className="ps-conf-hint">Family relation: {familyRelationLinks.map(r => `${r.firstName} ${r.lastName}`).join(', ')}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="ps-conf-btn-primary" onClick={() => openAction('merge')}>Merge Into…</button>
              <button className="ps-conf-btn-primary" onClick={() => openAction('link')}>Link To…</button>
              <button className="ps-conf-btn-primary" disabled={selectedCases.length === 0} onClick={() => openAction('move')}>Move a Case…</button>
            </div>

            {statusMessage && <p className="ps-conf-hint" style={{ color: statusMessage.startsWith('⚠') ? '#ef4444' : '#10b981', marginTop: 10 }}>{statusMessage}</p>}
          </div>

          {activeAction === 'move' && (
            <div className="ps-conf-table-wrap" style={{ padding: 16, marginTop: 12 }}>
              <label className="ps-label">Which case?</label>
              <select className="ps-conf-select" value={moveCaseId} onChange={e => setMoveCaseId(e.target.value)}>
                <option value="">— Select —</option>
                {selectedCases.map(c => <option key={c.id} value={c.id}>{c.accession?.fullAccession ?? c.id}</option>)}
              </select>
            </div>
          )}

          {activeAction === 'link' && (
            <div className="ps-conf-table-wrap" style={{ padding: 16, marginTop: 12 }}>
              <label className="ps-label">Relationship</label>
              <select className="ps-conf-select" value={linkRelationshipType} onChange={e => setLinkRelationshipType(e.target.value as PatientLinkRelationshipType)}>
                <option value="same_person">Same real person (e.g. maiden/married name)</option>
                <option value="family_relation">Family relation (e.g. newborn/mother, or siblings for cascade molecular testing) — distinct real people</option>
              </select>
            </div>
          )}

          {(activeAction === 'merge' || activeAction === 'link' || (activeAction === 'move' && moveCaseId)) && (
            <div style={{ marginTop: 12 }}>
              <PatientLinkSearch
                organisationId={selectedPatient.organisationId}
                confirmed={targetPatient}
                onConfirm={setTargetPatient}
                title={activeAction === 'merge' ? 'Merge into which patient?' : activeAction === 'link' ? 'Link to which patient?' : 'Move to which patient?'}
                helpText="Search and select the real, target patient for this action."
                confirmButtonLabel="Select"
                confirmedLabel="Target"
              />
              {targetPatient && (
                <button className="ps-conf-btn-primary" style={{ marginTop: 10 }} onClick={() => setConfirmOpen(true)}>
                  Continue
                </button>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        show={confirmOpen}
        title="Confirm Patient Management Action"
        message={`${confirmActionLabel} ${confirmActionMessage}`}
        confirmLabel={busy ? 'Working…' : 'Confirm'}
        cancelLabel="Cancel"
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default PatientManagementSection;
