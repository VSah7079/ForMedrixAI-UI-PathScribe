// src/components/Search/ReassignCasePatientPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (gap #6 — the proactive moveCaseToPatient()
// trigger): moveCaseToPatient() is already reachable from
// PatientManagementSection.tsx's own "Move a Case…" action — but that's
// a patient-first workflow (search for the source patient, see their
// cases, pick one). The realistic way someone actually discovers a
// misattributed case is the opposite: they're already looking at THAT
// specific case (via SearchPage.tsx) and notice the patient info looks
// wrong. This is that case-first entry point — genuinely complementary
// to, not a duplicate of, the existing patient-first one.
//
// Deliberately its own small, focused component rather than a change to
// the shared WorklistTable.tsx (used across multiple pages) — this
// action is only relevant here, triggered from SearchPage.tsx's own
// already-real row-selection state (selectedResultIndex, driven by real
// user click via WorklistTable's own onRowSelect), not a new per-row
// action embedded in a widely-shared table component.
//
// Reuses PatientLinkSearch.tsx for the target-patient search (the same
// component now used by AccessionPage.tsx and PatientManagementSection.tsx)
// and mockPatientIndexService.moveCaseToPatient() directly — the exact
// same, already-tested operation, no new service logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { PatientLinkSearch } from '@/pages/AccessionPage/PatientLinkSearch';
import ConfirmModal from '../Common/ConfirmModal';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import type { Case } from '@/types/case/Case';

interface ReassignCasePatientPanelProps {
  caseData: Case;
  onClose: () => void;
  onReassigned: () => void;
}

export const ReassignCasePatientPanel: React.FC<ReassignCasePatientPanelProps> = ({ caseData, onClose, onReassigned }) => {
  const [targetPatient, setTargetPatient] = useState<MasterPatientRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sourceOrgId, setSourceOrgId] = useState<string | null>(null);

  const sourcePatientId = caseData.patient?.id;
  const sourceName = `${caseData.patient?.firstName ?? ''} ${caseData.patient?.lastName ?? ''}`.trim() || '(unknown)';
  const sourceMrn = caseData.patient?.mrn ?? '—';

  // Real, per direct guidance: resolves organisationId from the real,
  // already-looked-up patient record, same pattern already established
  // in OutboundMessagePreviewSection.tsx — never a separate, manual org
  // resolution step.
  React.useEffect(() => {
    if (!sourcePatientId) return;
    mockPatientIndexService.getById(sourcePatientId).then(r => setSourceOrgId(r?.organisationId ?? null));
  }, [sourcePatientId]);

  const handleConfirm = async () => {
    if (!sourcePatientId || !targetPatient) return;
    setBusy(true);
    try {
      const result = await mockPatientIndexService.moveCaseToPatient(caseData.id, sourcePatientId, targetPatient.id, new Date().toISOString());
      setStatusMessage(result.moved
        ? `✓ Case moved to ${targetPatient.firstName} ${targetPatient.lastName}. Encounter: ${result.encounterOutcome ?? 'none'}.`
        : `⚠ Move failed: ${result.reason}`);
      if (result.moved) onReassigned();
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (!sourcePatientId) {
    return (
      <div className="ps-conf-table-wrap" style={{ padding: 16 }}>
        <p className="ps-conf-hint" style={{ color: '#ef4444' }}>⚠ This case has no real, resolved patient identity to reassign from.</p>
        <button className="ps-btn-ghost-dark" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="ps-conf-table-wrap" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Reassign Case Patient</div>
          <p className="ps-conf-hint">
            Case {caseData.accession?.fullAccession ?? caseData.id} is currently attributed to <strong>{sourceName}</strong> (MRN {sourceMrn}).
            Moving it repoints only this one case — both identities stay independently active, and any other real case
            under {sourceName.split(' ')[0] || 'this patient'} is untouched.
          </p>
        </div>
        <button className="ps-btn-ghost-dark" onClick={onClose}>✕</button>
      </div>

      {sourceOrgId && (
        <PatientLinkSearch
          organisationId={sourceOrgId}
          confirmed={targetPatient}
          onConfirm={setTargetPatient}
          title="Move to which patient?"
          helpText="Search for the real, correct patient this case actually belongs to."
          confirmButtonLabel="Select"
          confirmedLabel="Target"
        />
      )}

      {targetPatient && !statusMessage && (
        <button className="ps-conf-btn-primary" style={{ marginTop: 10 }} onClick={() => setConfirmOpen(true)}>
          Move Case
        </button>
      )}

      {statusMessage && (
        <p className="ps-conf-hint" style={{ color: statusMessage.startsWith('⚠') ? '#ef4444' : '#10b981', marginTop: 10 }}>
          {statusMessage}
        </p>
      )}

      <ConfirmModal
        show={confirmOpen}
        title="Confirm Case Reassignment"
        message={`Move case ${caseData.accession?.fullAccession ?? caseData.id} from ${sourceName} to ${targetPatient?.firstName} ${targetPatient?.lastName}? Both identities stay independently active; only this one case moves.`}
        confirmLabel={busy ? 'Working…' : 'Confirm'}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default ReassignCasePatientPanel;
