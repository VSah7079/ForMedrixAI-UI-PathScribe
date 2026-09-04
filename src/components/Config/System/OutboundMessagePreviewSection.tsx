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
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { buildAdt08Payload, buildAdt40Payload, buildAdt47Payload } from '@/services/patients/buildPatientAdtPayload';
import { buildOruR01Payload } from '@/services/reports/buildOruR01Payload';
import type { OruResultState } from '@/types/case/OutboundResultQueueEntry';

type MessageType = 'A08' | 'A40' | 'A47' | 'ORU_R01';

const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  A08: 'ADT^A08 — Demographic Update',
  A40: 'ADT^A40 — Merge Patient',
  A47: 'ADT^A47 — Change Identifier',
  ORU_R01: 'ORU^R01 — Pathology Result',
};

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const OutboundMessagePreviewSection: React.FC = () => {
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
        if (!record) { setError(`No patient found with id "${patientId.trim()}".`); return; }
        const result = await buildAdt08Payload(record.id, record.organisationId);
        setPayload(result);
        if (!result) setError('Payload builder returned null — check the patient id.');
      } else if (messageType === 'A40') {
        const prior = await mockPatientIndexService.getById(priorPatientId.trim());
        if (!prior) { setError(`No prior/merged-away patient found with id "${priorPatientId.trim()}".`); return; }
        const result = await buildAdt40Payload(prior.id, survivingPatientId.trim(), prior.organisationId, 0, 0);
        setPayload(result);
        if (!result) setError('Payload builder returned null — check both patient ids.');
      } else if (messageType === 'A47') {
        const priorRecord = await mockPatientIndexService.getById(a47PriorId.trim());
        if (!priorRecord) { setError(`No downtime/temporary patient found with id "${a47PriorId.trim()}".`); return; }
        const result = await buildAdt47Payload(priorRecord.id, a47ConfirmedId.trim(), priorRecord.organisationId, reasonCode.trim(), notes.trim(), 0);
        setPayload(result);
        if (!result) setError('Payload builder returned null — check both patient ids.');
      } else {
        const result = await buildOruR01Payload(caseId.trim(), instanceId.trim(), resultState);
        setPayload(result);
        if (!result) setError('Payload builder returned null — check the case is reportingMode "orchestrator" and the instance id is a real, finalized synoptic report on it.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Real, unexpected error building this payload.');
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
        <h2 className="ps-conf-section-title">Outbound Interface Message Preview</h2>
        <p className="ps-conf-section-subtitle">
          Preview and export the real JSON packages PathScribe builds for your interface engine — ADT^A08/A40/A47
          (services/patients/) and ORU^R01 (services/reports/). PathScribe never builds or sends HL7 itself; this
          tool lets you verify exactly what the engine receives to work from, and download real example files for
          your own integration testing.
        </p>
        <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>
          ⚠ A40/A47 previews here show real patient identity data for real, already-existing patients, but
          casesRepointed/encountersRepointed are shown as 0 — this tool builds a payload on demand, it doesn't
          perform the real merge/rebind operation, so those real counts aren't available outside an actual
          operation. Every other field is the real, accurate shape.
        </p>
      </div>

      <div className="ps-qa-tab-toolbar" style={{ flexWrap: 'wrap' }}>
        <select className="ps-conf-select" value={messageType} onChange={e => { setMessageType(e.target.value as MessageType); reset(); }}>
          {(Object.keys(MESSAGE_TYPE_LABELS) as MessageType[]).map(t => (
            <option key={t} value={t}>{MESSAGE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div className="ps-conf-form-grid" style={{ marginTop: 12 }}>
        {messageType === 'A08' && (
          <input className="ps-conf-input" placeholder="Patient ID" value={patientId} onChange={e => setPatientId(e.target.value)} />
        )}
        {messageType === 'A40' && (
          <>
            <input className="ps-conf-input" placeholder="Prior (merged-away) Patient ID" value={priorPatientId} onChange={e => setPriorPatientId(e.target.value)} />
            <input className="ps-conf-input" placeholder="Surviving Patient ID" value={survivingPatientId} onChange={e => setSurvivingPatientId(e.target.value)} />
          </>
        )}
        {messageType === 'A47' && (
          <>
            <input className="ps-conf-input" placeholder="Downtime/Temporary Patient ID" value={a47PriorId} onChange={e => setA47PriorId(e.target.value)} />
            <input className="ps-conf-input" placeholder="Confirmed Patient ID" value={a47ConfirmedId} onChange={e => setA47ConfirmedId(e.target.value)} />
            <input className="ps-conf-input" placeholder="Reason Code" value={reasonCode} onChange={e => setReasonCode(e.target.value)} />
            <input className="ps-conf-input" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          </>
        )}
        {messageType === 'ORU_R01' && (
          <>
            <input className="ps-conf-input" placeholder="Case ID" value={caseId} onChange={e => setCaseId(e.target.value)} />
            <input className="ps-conf-input" placeholder="Synoptic Instance ID" value={instanceId} onChange={e => setInstanceId(e.target.value)} />
            <select className="ps-conf-select" value={resultState} onChange={e => setResultState(e.target.value as OruResultState)}>
              <option value="FINAL">Final</option>
              <option value="CORRECTED">Corrected</option>
              <option value="ADDENDUM">Addendum</option>
            </select>
          </>
        )}
      </div>

      {messageType === 'ORU_R01' && (
        <p className="ps-conf-hint" style={{ color: '#f59e0b', marginTop: 8 }}>
          ⚠ reportPdfBase64/reportNarrativeText will show as absent here — generating either requires the real
          report-rendering pipeline (SynopticReportPage.tsx's own closures), which this standalone admin tool
          doesn't have access to. Every other field — patient identity, narrative fields, structuredDiagnosisAnswers
          — is the real, accurate shape from your actual case data.
        </p>
      )}

      <div className="ps-qa-tab-toolbar" style={{ marginTop: 12 }}>
        <button className="ps-conf-btn-primary" disabled={busy || !canPreview} onClick={handlePreview}>
          {busy ? 'Building…' : 'Preview Payload'}
        </button>
        <button className="ps-conf-btn-secondary" disabled={!payload} onClick={handleDownload}>
          ⬇ Download JSON
        </button>
      </div>

      {error && <p className="ps-conf-hint" style={{ color: '#ef4444' }}>⚠ {error}</p>}

      {payload !== null && payload !== undefined && (
        <>
          <div className="ps-conf-section-header" style={{ marginTop: 20 }}>
            <h2 className="ps-conf-section-title">Real Output — JSON Payload to Interface Engine</h2>
            <p className="ps-conf-section-subtitle">
              This is exactly what PathScribe would enqueue for this real operation — use "Download JSON" to save a
              real example file for your own format verification.
            </p>
          </div>
          <textarea
            readOnly
            className="ps-conf-input"
            style={{ width: '100%', minHeight: 380, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre' }}
            value={JSON.stringify(payload, null, 2)}
          />
        </>
      )}
    </div>
  );
};

export default OutboundMessagePreviewSection;
