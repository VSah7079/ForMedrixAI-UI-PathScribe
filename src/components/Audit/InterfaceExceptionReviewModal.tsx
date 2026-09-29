// src/components/Audit/InterfaceExceptionReviewModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct confirmation, building the "Manual Review
// Queue / Flagging (Safest)" approach for ADT^A43 exceptions that
// couldn't be safely auto-resolved (services/interfaceExceptions/):
// shows both the source and target patient, plus the source patient's
// real, active Cases, and lets a real HIM/admin operator pick exactly
// which Case(s) should actually move — never auto-moves anything.
//
// Deliberately conservative: nothing here bypasses
// mockPatientIndexService.moveCaseToPatient()'s own real safety check
// (a case must genuinely belong to the claimed source before it can
// move) — this modal is a human-driven front end for that same real
// operation, not a second, parallel implementation.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { interfaceExceptionService, orderIntakeService, specimenDictionaryService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { InterfaceException } from '@/services/interfaceExceptions/IInterfaceExceptionService';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import { SearchableCombobox } from '@/components/Common/SearchableCombobox';

interface CaseSummary {
  id: string;
  specimenLabel: string;
  status: string;
  facilityName?: string;
  createdAt?: string;
}

interface Props {
  exception: InterfaceException;
  requestedBy: string;
  onClose: () => void;
  /** Called after a real resolve/dismiss action completes, so the
   *  parent page can reload its own list — this modal never owns the
   *  list itself. */
  onResolved: () => void;
}

const InterfaceExceptionReviewModal: React.FC<Props> = ({ exception, requestedBy, onClose, onResolved }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sourcePatient, setSourcePatient] = useState<MasterPatientRecord | null>(null);
  const [targetPatient, setTargetPatient] = useState<MasterPatientRecord | null>(null);
  const [sourceCases, setSourceCases] = useState<CaseSummary[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [resultNote, setResultNote] = useState<string | null>(null);
  // Real, per the "Map & Link" contextual resolution feature — a real
  // Specimen Dictionary picker for unmapped_order_code exceptions
  // specifically. Kept separate from `busy` above (case-binding's own
  // busy state) so the two real actions this modal can now perform
  // never interfere with each other's loading state.
  const [dictionary, setDictionary] = useState<SpecimenEntry[]>([]);
  const [mapDictionaryEntryId, setMapDictionaryEntryId] = useState('');
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [sourceRes, targetRes, allCasesRes] = await Promise.all([
        exception.sourcePatientId ? mockPatientIndexService.getById(exception.sourcePatientId) : Promise.resolve(undefined),
        exception.targetPatientId ? mockPatientIndexService.getById(exception.targetPatientId) : Promise.resolve(undefined),
        caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any),
      ]);
      if (cancelled) return;
      setSourcePatient(sourceRes ?? null);
      setTargetPatient(targetRes ?? null);

      if (exception.sourcePatientId && allCasesRes.ok) {
        const matching = (allCasesRes.data as any[])
          .filter(c => c?.patient?.id === exception.sourcePatientId)
          .map(c => ({
            id: c.id,
            specimenLabel: (c.specimens ?? []).map((s: any) => s.specimenLabel).filter(Boolean).join(', ') || '(no specimens)',
            status: c.status,
            facilityName: c.order?.facilityName,
            createdAt: c.createdAt,
          }));
        setSourceCases(matching);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [exception.sourcePatientId, exception.targetPatientId]);

  // Real, per the "Map & Link" contextual resolution feature — only
  // fetches the real Specimen Dictionary when it's actually needed
  // (an unmapped_order_code exception), not for every real exception
  // type this modal handles.
  useEffect(() => {
    if (exception.eventType !== 'unmapped_order_code') return;
    specimenDictionaryService.getAll().then(res => { if (res.ok) setDictionary(res.data); });
  }, [exception.eventType]);

  const toggleCase = (caseId: string) => {
    setSelectedCaseIds(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId); else next.add(caseId);
      return next;
    });
  };

  const handleMoveSelected = async () => {
    if (!exception.sourcePatientId || !exception.targetPatientId || selectedCaseIds.size === 0) return;
    setBusy(true);
    const now = new Date().toISOString();
    let movedCount = 0;
    const failures: string[] = [];
    for (const caseId of selectedCaseIds) {
      const result = await mockPatientIndexService.moveCaseToPatient(caseId, exception.sourcePatientId, exception.targetPatientId, now);
      if (result.moved) movedCount++;
      else failures.push(`${caseId}: ${result.reason ?? 'unknown reason'}`);
    }
    const note = failures.length > 0
      ? `Moved ${movedCount} of ${selectedCaseIds.size} selected case(s) to patient ${exception.targetPatientId}. Failures: ${failures.join('; ')}`
      : `Moved ${movedCount} case(s) to patient ${exception.targetPatientId}: ${[...selectedCaseIds].join(', ')}`;
    await interfaceExceptionService.resolve(exception.id, requestedBy, note);
    setBusy(false);
    setResultNote(note);
    onResolved();
  };

  // Real, per the "Map & Link" contextual resolution feature — writes
  // the real, new crosswalk entry (via addCrosswalkEntry, the same
  // real method Config → Integrations' own "Add Mapping" form uses)
  // directly from this triage view, then resolves the exception. Never
  // silently skips the real, required facilityId — an exception raised
  // before this field existed (or from before this feature's own
  // facilityId capture was added) genuinely can't be mapped from here;
  // the UI guards this rather than creating a mis-scoped crosswalk
  // entry.
  const handleMapAndLink = async () => {
    if (!exception.facilityId || !exception.rawOrderCode || !mapDictionaryEntryId) return;
    setMapBusy(true);
    setMapError(null);
    // Real, deliberate: narrows the plain string InterfaceException.codingSystem
    // carries (a genuinely looser type than SpecimenCodeCrosswalkEntry's
    // own real OrderCodeCodingSystem union) rather than blindly casting
    // — a value that somehow isn't one of the three real coding
    // systems is passed through as undefined, matching this app's own
    // "never fabricate, never silently coerce" posture.
    const validCodingSystem = (['HL7_LOCAL', 'LOINC', 'SNOMED'] as const).find(s => s === exception.codingSystem);
    const created = await orderIntakeService.addCrosswalkEntry({
      clientId: exception.facilityId,
      externalCode: exception.rawOrderCode,
      codingSystem: validCodingSystem,
      dictionaryEntryId: mapDictionaryEntryId,
      createdBy: requestedBy,
    });
    if (created.ok === false) {
      setMapBusy(false);
      setMapError(created.error);
      return;
    }
    const note = `Mapped order code "${exception.rawOrderCode}" to Specimen Dictionary entry ${mapDictionaryEntryId} — crosswalk entry created.`;
    await interfaceExceptionService.resolve(exception.id, requestedBy, note);
    setMapBusy(false);
    setResultNote(note);
    onResolved();
  };

  const handleDismiss = async () => {
    setBusy(true);
    await interfaceExceptionService.dismiss(exception.id, requestedBy, 'Reviewed — no case reassignment needed.');
    setBusy(false);
    onResolved();
    onClose();
  };

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div className="ps-iexc-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-header">
          <h2 className="ps-modal-title">{t('interfaceExceptionReviewModal.title', { eventType: exception.eventType })}</h2>
          <button onClick={onClose} className="ps-modal-close">&#x2715;</button>
        </div>

        <div className="ps-iexc-modal-body">
          <div className="ps-iexc-reason-banner">{exception.reason}</div>

          {loading ? (
            <div className="ps-iexc-loading">{t('interfaceExceptionReviewModal.loadingDetails')}</div>
          ) : (
            <>
              <div className="ps-iexc-patient-row">
                <div className="ps-iexc-patient-card">
                  <div className="ps-iexc-patient-card-label">{t('interfaceExceptionReviewModal.sourcePatient')}</div>
                  {sourcePatient ? (
                    <>
                      <div className="ps-iexc-patient-name" data-phi="name">{sourcePatient.firstName} {sourcePatient.lastName}</div>
                      <div className="ps-iexc-patient-meta" data-phi="true">MRN: {sourcePatient.mrn} · DOB: {sourcePatient.dateOfBirth}</div>
                    </>
                  ) : (
                    <div className="ps-iexc-patient-unresolved" data-phi="true">
                      {exception.sourcePatientIdentifier
                        ? t('interfaceExceptionReviewModal.patientUnresolvedWithId', { id: exception.sourcePatientIdentifier })
                        : t('interfaceExceptionReviewModal.patientUnresolved')}
                    </div>
                  )}
                </div>
                <div className="ps-iexc-patient-arrow">→</div>
                <div className="ps-iexc-patient-card">
                  <div className="ps-iexc-patient-card-label">{t('interfaceExceptionReviewModal.targetPatient')}</div>
                  {targetPatient ? (
                    <>
                      <div className="ps-iexc-patient-name" data-phi="name">{targetPatient.firstName} {targetPatient.lastName}</div>
                      <div className="ps-iexc-patient-meta" data-phi="true">MRN: {targetPatient.mrn} · DOB: {targetPatient.dateOfBirth}</div>
                    </>
                  ) : (
                    <div className="ps-iexc-patient-unresolved" data-phi="true">
                      {exception.targetPatientIdentifier
                        ? t('interfaceExceptionReviewModal.patientUnresolvedWithId', { id: exception.targetPatientIdentifier })
                        : t('interfaceExceptionReviewModal.patientUnresolved')}
                    </div>
                  )}
                </div>
              </div>

              {/* Real feature, per direct architecture confirmation,
                  working through the full Interface Exception &
                  Case-Binding Module Phase A: this section only
                  applies to A43's own real meaning (a specific,
                  misattributed Case moving between two already-known
                  patients). A40/A24/A47 exceptions now routed to this
                  same queue are genuinely different — an unresolved
                  IDENTITY, not a case-binding problem — showing
                  "Move Selected Cases" for those would offer an
                  action that doesn't actually apply. A real, full
                  manual identity-binding UI for A40/A24/A47 is a
                  separate, not-yet-built follow-up; Dismiss remains
                  available for all exception types below. */}
              {exception.eventType === 'A43' && sourcePatient && (
                <div className="ps-iexc-cases-section">
                  <div className="ps-iexc-cases-label">
                    {t('interfaceExceptionReviewModal.casesLabel')}
                  </div>
                  {sourceCases.length === 0 ? (
                    <div className="ps-iexc-no-cases">{t('interfaceExceptionReviewModal.noCasesFound')}</div>
                  ) : (
                    <div className="ps-iexc-cases-list">
                      {sourceCases.map(c => (
                        <label key={c.id} className="ps-iexc-case-row">
                          <input
                            type="checkbox"
                            checked={selectedCaseIds.has(c.id)}
                            onChange={() => toggleCase(c.id)}
                            disabled={busy}
                          />
                          <div className="ps-iexc-case-info">
                            <div className="ps-iexc-case-id" data-phi="accession">{c.id}</div>
                            <div className="ps-iexc-case-detail">{c.specimenLabel}{c.facilityName ? ` · ${c.facilityName}` : ''} · {c.status}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {exception.eventType === 'unmapped_order_code' && (
                <div className="ps-iexc-no-cases">
                  <p>
                    {t('interfaceExceptionReviewModal.unmappedOrderCodeIntro')}
                  </p>
                  <div className="ps-conf-form-row">
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('interfaceExceptionReviewModal.rawOrderCodeLabel')}</label>
                      <span className="ps-conf-identity-name">{exception.rawOrderCode ?? '—'}</span>
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('interfaceExceptionReviewModal.normalizedLabel')}</label>
                      <span className="ps-conf-identity-name">{exception.normalizedOrderCode ?? '—'}</span>
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('interfaceExceptionReviewModal.codingSystemLabel')}</label>
                      <span className="ps-conf-identity-name">{exception.codingSystem ?? `HL7_LOCAL ${t('interfaceExceptionReviewModal.defaultSuffix')}`}</span>
                    </div>
                  </div>
                  {mapError && <p className="ps-conf-error-text">{mapError}</p>}
                  {exception.facilityId ? (
                    <>
                      <div className="ps-conf-form-field">
                        <label className="ps-conf-label">{t('interfaceExceptionReviewModal.mapDictionaryLabel')}</label>
                        <SearchableCombobox
                          value={mapDictionaryEntryId}
                          onChange={setMapDictionaryEntryId}
                          placeholder={t('interfaceExceptionReviewModal.selectSpecimenTypePlaceholder')}
                          noMatchText={t('interfaceExceptionReviewModal.noSpecimenTypesMatch')}
                          disabled={mapBusy}
                          options={dictionary.map(d => ({
                            id: d.id,
                            label: d.name,
                            sublabel: [d.procedure, d.type].filter(Boolean).join(' · '),
                            searchText: d.synonyms.join(' '),
                          }))}
                        />
                      </div>
                      <p>
                        {t('interfaceExceptionReviewModal.createsCrosswalkNote')}
                      </p>
                      <button className="ps-conf-btn-primary" disabled={mapBusy || !mapDictionaryEntryId} onClick={handleMapAndLink}>
                        {mapBusy ? t('interfaceExceptionReviewModal.mapping') : t('interfaceExceptionReviewModal.mapAndLink')}
                      </button>
                    </>
                  ) : (
                    <p>
                      {t('interfaceExceptionReviewModal.noFacilityTrackingNote')}
                    </p>
                  )}
                </div>
              )}

              {exception.eventType !== 'A43' && exception.eventType !== 'unmapped_order_code' && (
                <div className="ps-iexc-no-cases">
                  {t('interfaceExceptionReviewModal.otherEventTypeNote', { eventType: exception.eventType })}
                </div>
              )}

              {resultNote && <div className="ps-iexc-result-banner">{resultNote}</div>}
            </>
          )}
        </div>

        <div className="ps-modal-footer">
          <button onClick={handleDismiss} disabled={busy} className="ps-conf-btn-secondary">
            {t('interfaceExceptionReviewModal.dismissNoAction')}
          </button>
          {exception.eventType === 'A43' && (
            <button
              onClick={handleMoveSelected}
              disabled={busy || selectedCaseIds.size === 0 || !exception.sourcePatientId || !exception.targetPatientId}
              className="ps-conf-btn-primary"
            >
              {busy ? t('interfaceExceptionReviewModal.moving') : t('interfaceExceptionReviewModal.moveSelectedCases', { count: selectedCaseIds.size })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterfaceExceptionReviewModal;
