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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [targetPatient, setTargetPatient] = useState<MasterPatientRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<React.ReactNode | null>(null);
  const [moveOk, setMoveOk] = useState<boolean | null>(null);
  const [sourceOrgId, setSourceOrgId] = useState<string | null>(null);

  const sourcePatientId = caseData.patient?.id;
  const sourceName = `${caseData.patient?.firstName ?? ''} ${caseData.patient?.lastName ?? ''}`.trim() || t('reassignCasePatientPanel.unknownPatient');
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
      if (result.moved) {
        setMoveOk(true);
        setStatusMessage(
          <>
            {'✓ '}
            {t('reassignCasePatientPanel.moveSuccessPrefix')}
            {' '}
            <span data-phi="name">{targetPatient.firstName} {targetPatient.lastName}</span>
            {'. '}
            {t('reassignCasePatientPanel.encounterLabel', { outcome: result.encounterOutcome ?? t('reassignCasePatientPanel.none') })}
          </>
        );
        onReassigned();
      } else {
        setMoveOk(false);
        setStatusMessage(`⚠ ${t('reassignCasePatientPanel.moveFailedPrefix')}: ${result.reason}`);
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (!sourcePatientId) {
    return (
      <div className="ps-conf-table-wrap rcpp-panel">
        <p className="ps-conf-hint rcpp-error-text">{'⚠ '}{t('reassignCasePatientPanel.noResolvedIdentity')}</p>
        <button className="ps-btn-ghost-dark" onClick={onClose}>{t('reassignCasePatientPanel.close')}</button>
      </div>
    );
  }

  return (
    <div className="ps-conf-table-wrap rcpp-panel">
      <div className="rcpp-header-row">
        <div>
          <div className="rcpp-title">{t('reassignCasePatientPanel.title')}</div>
          <p className="ps-conf-hint" data-phi="true">
            {t('reassignCasePatientPanel.attributionText', {
              accession: caseData.accession?.fullAccession ?? caseData.id,
              name: sourceName,
              mrn: sourceMrn,
              firstName: sourceName.split(' ')[0] || t('reassignCasePatientPanel.thisPatient'),
            })}
          </p>
        </div>
        <button className="ps-btn-ghost-dark" onClick={onClose}>✕</button>
      </div>

      {sourceOrgId && (
        <PatientLinkSearch
          organisationId={sourceOrgId}
          confirmed={targetPatient}
          onConfirm={setTargetPatient}
          title={t('reassignCasePatientPanel.moveToWhichPatient')}
          helpText={t('reassignCasePatientPanel.searchHelpText')}
          confirmButtonLabel={t('reassignCasePatientPanel.select')}
          confirmedLabel={t('reassignCasePatientPanel.target')}
        />
      )}

      {targetPatient && !statusMessage && (
        <button className="ps-conf-btn-primary rcpp-move-btn" onClick={() => setConfirmOpen(true)}>
          {t('reassignCasePatientPanel.moveCase')}
        </button>
      )}

      {statusMessage && (
        <p className="ps-conf-hint rcpp-status-text" style={{ color: moveOk === false ? '#ef4444' : '#10b981' }} data-phi={moveOk ? 'true' : undefined}>
          {statusMessage}
        </p>
      )}

      <ConfirmModal
        show={confirmOpen}
        title={t('reassignCasePatientPanel.confirmTitle')}
        message={
          <span data-phi="true">
            {t('reassignCasePatientPanel.confirmMoveMessage', {
              accession: caseData.accession?.fullAccession ?? caseData.id,
              source: sourceName,
              target: `${targetPatient?.firstName} ${targetPatient?.lastName}`,
            })}
          </span>
        }
        confirmLabel={busy ? t('reassignCasePatientPanel.working') : t('reassignCasePatientPanel.confirm')}
        cancelLabel={t('reassignCasePatientPanel.cancel')}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default ReassignCasePatientPanel;
