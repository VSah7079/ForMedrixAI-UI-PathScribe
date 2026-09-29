// src/components/Config/System/OutboundMessagePreviewSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("How do users test this. Do the generate
// examples to file, do we have an easy to use tool? Should be
// comprehensive tool so that formats can be verified"): a real,
// working preview/export tool for every real outbound JSON payload
// this app now builds — ADT^A08/A40/A47 (services/patients/
// buildPatientAdtPayload.ts) and ORU^R01 (services/reports/
// buildOruR01Payload.ts). Same real posture as
// DftExportPreviewSection.tsx's own header comment: "PathScribe is
// not generating HL7 transactions, we are just sending json file to
// the interface engine. That is where the magic happens." This tool
// previews and exports that real JSON — it never simulates a real
// dispatch, since none exists anywhere in this app (see
// services/patients/README.md's own account of that consistent,
// deliberate architectural boundary).
//
// Deliberately its own, new screen rather than extended onto
// DftExportPreviewSection.tsx — that screen is scoped to billing
// (Financial & Revenue Lookups); these four transaction types are
// patient-identity and result events, a genuinely different real
// domain, registered in its own sidebar group below.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { buildAdt08Payload, buildAdt40Payload, buildAdt47Payload } from '@/services/patients/buildPatientAdtPayload';
import { buildOruR01Payload } from '@/services/reports/buildOruR01Payload';
import type { OruResultState } from '@/types/case/OutboundResultQueueEntry';

type MessageType = 'A08' | 'A40' | 'A47' | 'ORU_R01';

const MESSAGE_TYPE_LABEL_KEY: Record<MessageType, string> = {
  A08: 'outboundMessagePreviewSection.messageTypeLabels.a08',
  A40: 'outboundMessagePreviewSection.messageTypeLabels.a40',
  A47: 'outboundMessagePreviewSection.messageTypeLabels.a47',
  ORU_R01: 'outboundMessagePreviewSection.messageTypeLabels.oruR01',
};

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const OutboundMessagePreviewSection: React.FC = () => {
  const { t } = useTranslation();
  const [messageType, setMessageType] = useState<MessageType>('A08');

  // A08
  const [patientId, setPatientId] = useState('');
  // A40
  const [priorPatientId, setPriorPatientId] = useState('');
  const [survivingPatientId, setSurvivingPatientId] = useState('');
  // A47
  const [a47PriorId, setA47PriorId] = useState('');
  const [a47ConfirmedId, setA47ConfirmedId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  // ORU_R01
  const [caseId, setCaseId] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [resultState, setResultState] = useState<OruResultState>('FINAL');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);

  const reset = () => { setError(null); setPayload(null); };

  const handlePreview = async () => {
    reset();
    setBusy(true);
    try {
      if (messageType === 'A08') {
        const record = await mockPatientIndexService.getById(patientId.trim());
        if (!record) { setError(t('outboundMessagePreviewSection.errors.patientNotFound', { id: patientId.trim() })); return; }
        const result = await buildAdt08Payload(record.id, record.organisationId);
        setPayload(result);
        if (!result) setError(t('outboundMessagePreviewSection.errors.a08NullPayload'));
      } else if (messageType === 'A40') {
        const prior = await mockPatientIndexService.getById(priorPatientId.trim());
        if (!prior) { setError(t('outboundMessagePreviewSection.errors.a40PriorNotFound', { id: priorPatientId.trim() })); return; }
        const result = await buildAdt40Payload(prior.id, survivingPatientId.trim(), prior.organisationId, 0, 0);
        setPayload(result);
        if (!result) setError(t('outboundMessagePreviewSection.errors.nullPayloadBothIds'));
      } else if (messageType === 'A47') {
        const priorRecord = await mockPatientIndexService.getById(a47PriorId.trim());
        if (!priorRecord) { setError(t('outboundMessagePreviewSection.errors.a47PriorNotFound', { id: a47PriorId.trim() })); return; }
        const result = await buildAdt47Payload(priorRecord.id, a47ConfirmedId.trim(), priorRecord.organisationId, reasonCode.trim(), notes.trim(), 0);
        setPayload(result);
        if (!result) setError(t('outboundMessagePreviewSection.errors.nullPayloadBothIds'));
      } else {
        const result = await buildOruR01Payload(caseId.trim(), instanceId.trim(), resultState);
        setPayload(result);
        if (!result) setError(t('outboundMessagePreviewSection.errors.oruNullPayload'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('outboundMessagePreviewSection.errors.unexpectedError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!payload) return;
    downloadJson(payload, `${messageType}_${Date.now()}.json`);
  };

  const canPreview = (() => {
    if (messageType === 'A08') return !!patientId.trim();
    if (messageType === 'A40') return !!priorPatientId.trim() && !!survivingPatientId.trim();
    if (messageType === 'A47') return !!a47PriorId.trim() && !!a47ConfirmedId.trim() && !!reasonCode.trim() && !!notes.trim();
    return !!caseId.trim() && !!instanceId.trim();
  })();

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <h2 className="ps-conf-section-title">{t('outboundMessagePreviewSection.title')}</h2>
        <p className="ps-conf-section-subtitle">{t('outboundMessagePreviewSection.subtitle')}</p>
        <p className="ps-conf-hint ps-conf-hint--warning">{t('outboundMessagePreviewSection.warnings.adtRepointed')}</p>
      </div>

      <div className="ps-qa-tab-toolbar ps-qa-tab-toolbar--wrap">
        <select className="ps-conf-select" value={messageType} onChange={e => { setMessageType(e.target.value as MessageType); reset(); }}>
          {(Object.keys(MESSAGE_TYPE_LABEL_KEY) as MessageType[]).map(mt => (
            <option key={mt} value={mt}>{t(MESSAGE_TYPE_LABEL_KEY[mt])}</option>
          ))}
        </select>
      </div>

      <div className="ps-conf-form-grid ps-mt-12">
        {messageType === 'A08' && (
          <input className="ps-conf-input" data-phi="mrn" placeholder={t('outboundMessagePreviewSection.fields.patientId')} value={patientId} onChange={e => setPatientId(e.target.value)} />
        )}
        {messageType === 'A40' && (
          <>
            <input className="ps-conf-input" data-phi="mrn" placeholder={t('outboundMessagePreviewSection.fields.priorPatientId')} value={priorPatientId} onChange={e => setPriorPatientId(e.target.value)} />
            <input className="ps-conf-input" data-phi="mrn" placeholder={t('outboundMessagePreviewSection.fields.survivingPatientId')} value={survivingPatientId} onChange={e => setSurvivingPatientId(e.target.value)} />
          </>
        )}
        {messageType === 'A47' && (
          <>
            <input className="ps-conf-input" placeholder={t('outboundMessagePreviewSection.fields.a47PriorId')} value={a47PriorId} onChange={e => setA47PriorId(e.target.value)} />
            <input className="ps-conf-input" placeholder={t('outboundMessagePreviewSection.fields.a47ConfirmedId')} value={a47ConfirmedId} onChange={e => setA47ConfirmedId(e.target.value)} />
            <input className="ps-conf-input" placeholder={t('outboundMessagePreviewSection.fields.reasonCode')} value={reasonCode} onChange={e => setReasonCode(e.target.value)} />
            <input className="ps-conf-input" placeholder={t('outboundMessagePreviewSection.fields.notes')} value={notes} onChange={e => setNotes(e.target.value)} />
          </>
        )}
        {messageType === 'ORU_R01' && (
          <>
            <input className="ps-conf-input" data-phi="accession" placeholder={t('outboundMessagePreviewSection.fields.caseId')} value={caseId} onChange={e => setCaseId(e.target.value)} />
            <input className="ps-conf-input" placeholder={t('outboundMessagePreviewSection.fields.instanceId')} value={instanceId} onChange={e => setInstanceId(e.target.value)} />
            <select className="ps-conf-select" value={resultState} onChange={e => setResultState(e.target.value as OruResultState)}>
              <option value="FINAL">{t('outboundMessagePreviewSection.resultStates.final')}</option>
              <option value="CORRECTED">{t('outboundMessagePreviewSection.resultStates.corrected')}</option>
              <option value="ADDENDUM">{t('outboundMessagePreviewSection.resultStates.addendum')}</option>
            </select>
          </>
        )}
      </div>

      {messageType === 'ORU_R01' && (
        <p className="ps-conf-hint ps-conf-hint--warning ps-mt-8">{t('outboundMessagePreviewSection.warnings.oruMissingFields')}</p>
      )}

      <div className="ps-qa-tab-toolbar ps-mt-12">
        <button className="ps-conf-btn-primary" disabled={busy || !canPreview} onClick={handlePreview}>
          {busy ? t('outboundMessagePreviewSection.buttons.building') : t('outboundMessagePreviewSection.buttons.preview')}
        </button>
        <button className="ps-conf-btn-secondary" disabled={!payload} onClick={handleDownload}>
          {t('outboundMessagePreviewSection.buttons.download')}
        </button>
      </div>

      {error && <p className="ps-conf-hint ps-conf-hint--danger">⚠ {error}</p>}

      {payload !== null && payload !== undefined && (
        <>
          <div className="ps-conf-section-header ps-mt-20">
            <h2 className="ps-conf-section-title">{t('outboundMessagePreviewSection.output.title')}</h2>
            <p className="ps-conf-section-subtitle">{t('outboundMessagePreviewSection.output.subtitle')}</p>
          </div>
          <textarea
            readOnly
            className="ps-conf-input ps-dft-export__mono-textarea ps-outbound-preview__mono-textarea--json"
            value={JSON.stringify(payload, null, 2)}
          />
        </>
      )}
    </div>
  );
};

export default OutboundMessagePreviewSection;
