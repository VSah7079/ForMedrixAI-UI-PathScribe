// src/pages/MolecularOrderQueuePage/MolecularOrderQueuePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "we need to simulate or at least be able
// to demo our orders and inbound results for HPV testing." Confirmed
// directly first: NONE of this app's real outbound queues (accession,
// referral, cytology registry, molecular orders) have any viewer UI
// at all — every one is fire-and-forget from its own trigger point.
// This page is the first: a real, working viewer for
// services/molecularOrders/ specifically, scoped to what was actually
// asked for rather than building a generic queue-management system
// for every queue type at once.
//
// The HPV simulation panel operates against a real, already-existing
// seed case (S26-5003-CYT-001, Specimen A) — deliberately not a new,
// synthetic case created from scratch: that case's own seed data
// already has cytologyScreening.hpvResult: 'Pending', the exact real
// "co-test ordered, result not back yet" state this demo needs to
// pick up from. "Queue HPV Co-Test Order" enqueues the real
// order.molecular entry the accession trigger would have produced;
// "Simulate Inbound HPV Result" calls the real
// processInboundHpvResultEvent(), the same function a real interface
// engine's own inbound HL7 ORU would call — never a separate,
// parallel demo-only code path. A Positive result against the
// standalone st-hpv-highrisk-screen assay fires the real reflex
// genotyping order, visibly, in the same table below.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mockMolecularOrderOutboundQueueService } from '@/services/molecularOrders/mockMolecularOrderOutboundQueueService';
import { processInboundHpvResultEvent } from '@/services/hl7/processInboundHpvResultEvent';
import type { MolecularOrderOutboundQueueEntry, MolecularOrderPayload, InstrumentOrderPayload } from '@/types/case/MolecularOrderOutboundQueueEntry';

const DEMO_ACCESSION = 'S26-5003-CYT-001';
const DEMO_SPECIMEN_LETTER = 'A';
const DEMO_ASSAY_STANDALONE = 'st-hpv-highrisk-screen';
const DEMO_ASSAY_BUNDLED = 'st-hpv-reflex';

function isMolecularPayload(payload: MolecularOrderPayload | InstrumentOrderPayload): payload is MolecularOrderPayload {
  return 'assayCode' in payload;
}

const MolecularOrderQueuePage: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MolecularOrderOutboundQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [assayChoice, setAssayChoice] = useState<typeof DEMO_ASSAY_STANDALONE | typeof DEMO_ASSAY_BUNDLED>(DEMO_ASSAY_STANDALONE);
  const [resultChoice, setResultChoice] = useState<'Positive' | 'Negative'>('Positive');
  const [busy, setBusy] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await mockMolecularOrderOutboundQueueService.getAll();
    if (res.ok) setEntries([...res.data].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const queueDemoOrder = async () => {
    setBusy(true);
    await mockMolecularOrderOutboundQueueService.enqueue({
      caseId: DEMO_ACCESSION,
      eventType: 'order.molecular',
      payload: {
        accessionNumber: DEMO_ACCESSION, specimenLetter: DEMO_SPECIMEN_LETTER,
        assayCode: assayChoice, orderReason: 'protocol_configured', priority: 'Routine',
      },
    });
    setBusy(false);
    setLastOutcome(t('molecularOrderQueue.demoOrderQueued'));
    await refresh();
  };

  const simulateInboundResult = async () => {
    setBusy(true);
    const result = await processInboundHpvResultEvent({
      messageId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      organisationId: 'demo-org',
      accessionNumber: DEMO_ACCESSION,
      specimenLetter: DEMO_SPECIMEN_LETTER,
      hrHpvResult: resultChoice,
      assayStainTypeId: assayChoice,
      abnormalFlag: resultChoice === 'Positive' ? 'A' : 'N',
      referenceRange: 'Not Detected',
    });
    setBusy(false);
    setLastOutcome(
      result.outcome === 'applied'
        ? (resultChoice === 'Positive' && assayChoice === DEMO_ASSAY_STANDALONE
            ? t('molecularOrderQueue.resultAppliedWithReflex')
            : t('molecularOrderQueue.resultApplied'))
        : t('molecularOrderQueue.resultOutcome', { outcome: result.outcome })
    );
    await refresh();
  };

  return (
    <div className="ps-molq-page">
      <h1 className="ps-molq-title">{t('molecularOrderQueue.pageTitle')}</h1>
      <p className="ps-molq-subtitle">{t('molecularOrderQueue.pageSubtitle')}</p>

      <div className="ps-molq-demo-panel">
        <div className="ps-molq-demo-title">{t('molecularOrderQueue.demoPanelTitle')}</div>
        <p className="ps-molq-demo-description">{t('molecularOrderQueue.demoPanelDescription', { accession: DEMO_ACCESSION })}</p>

        <label className="ps-molq-field-label">{t('molecularOrderQueue.assayLabel')}</label>
        <select className="ps-batch-select" value={assayChoice} onChange={e => setAssayChoice(e.target.value as typeof assayChoice)}>
          <option value={DEMO_ASSAY_STANDALONE}>{t('molecularOrderQueue.assayStandalone')}</option>
          <option value={DEMO_ASSAY_BUNDLED}>{t('molecularOrderQueue.assayBundled')}</option>
        </select>

        <button className="ps-btn-secondary ps-molq-demo-btn" disabled={busy} onClick={queueDemoOrder}>
          {t('molecularOrderQueue.queueOrderBtn')}
        </button>

        <label className="ps-molq-field-label">{t('molecularOrderQueue.resultLabel')}</label>
        <select className="ps-batch-select" value={resultChoice} onChange={e => setResultChoice(e.target.value as typeof resultChoice)}>
          <option value="Positive">{t('molecularOrderQueue.resultPositive')}</option>
          <option value="Negative">{t('molecularOrderQueue.resultNegative')}</option>
        </select>

        <button className="ps-btn-primary ps-molq-demo-btn" disabled={busy} onClick={simulateInboundResult}>
          {t('molecularOrderQueue.simulateResultBtn')}
        </button>

        {lastOutcome && <div className="ps-molq-outcome">{lastOutcome}</div>}
      </div>

      {loading ? (
        <div className="ps-molq-loading">{t('common.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="ps-molq-empty">{t('molecularOrderQueue.noEntries')}</div>
      ) : (
        <table className="ps-molq-table">
          <thead>
            <tr>
              <th>{t('molecularOrderQueue.col.type')}</th>
              <th data-phi="accession">{t('molecularOrderQueue.col.accession')}</th>
              <th>{t('molecularOrderQueue.col.assay')}</th>
              <th>{t('molecularOrderQueue.col.reason')}</th>
              <th>{t('molecularOrderQueue.col.status')}</th>
              <th>{t('molecularOrderQueue.col.queuedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id} className={isMolecularPayload(entry.payload) && entry.payload.reflexFromMessageId ? 'ps-molq-row--reflex' : ''}>
                <td>{entry.eventType === 'order.molecular' ? t('molecularOrderQueue.typeMolecular') : t('molecularOrderQueue.typeInstrument')}</td>
                <td>{isMolecularPayload(entry.payload) ? `${entry.payload.accessionNumber}-${entry.payload.specimenLetter}` : entry.payload.masterBarcode}</td>
                <td>{isMolecularPayload(entry.payload) ? entry.payload.assayCode : entry.payload.instrumentVendor}</td>
                <td>
                  {isMolecularPayload(entry.payload) ? (
                    entry.payload.reflexFromMessageId
                      ? t('molecularOrderQueue.reasonReflex')
                      : t(`molecularOrderQueue.reason.${entry.payload.orderReason}`)
                  ) : '—'}
                </td>
                <td>{t(`molecularOrderQueue.status.${entry.status}`)}</td>
                <td>{new Date(entry.queuedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MolecularOrderQueuePage;
