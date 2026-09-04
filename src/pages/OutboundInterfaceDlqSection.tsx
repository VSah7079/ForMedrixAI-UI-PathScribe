// src/pages/OutboundInterfaceDlqSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("Any existing gaps to deal with?" — the
// two new real outbound queues, services/patients/
// mockOutboundPatientAdtQueueService.ts and services/reports/
// mockOutboundResultQueueService.ts, had real getFailed()/
// markFailed()/retryDispatch() methods with no UI to reach them —
// unlike billing, which already has a real, working dashboard,
// OutboundDlqSection.tsx). Mirrors that proven pattern closely:
// FAILED entries with Retry Dispatch + Capture as CAPA, QUEUED
// entries with a clearly-labeled Simulate Failure action.
//
// Real, per direct follow-up ("do we implement... actual outbound HTTP
// dispatch transport" → "Dispatch needs to be generic so all
// transactions can be checked"): Retry Dispatch and a new Dispatch Now
// action now genuinely send — building the real payload via the
// existing real builder functions, POSTing it to the real receiving
// endpoint (services/interfaceDispatch/dispatchInterfaceMessage.ts),
// and only transitioning to a genuinely-earned 'SENT' on real success.
// Simulate Failure stays exactly what it always was — a real, honest
// testing aid, never confused with a real dispatch attempt.
//
// Real, per direct follow-up (gap #7 — bringing assist-mode's
// sendSynopticReportToLis up to the same honest queue standard):
// extended from two queue types to three (patient_adt/result/lis_sync)
// — restructured around a small per-queue-type config object rather
// than growing every ternary in the file into a three-way chain.
//
// Real, honest scope boundary for lis_sync specifically: its own real
// payload (embeddedHeader/fullPayloadText) is built from a real,
// ephemeral parameter (payloadBody) that's never persisted anywhere —
// unlike the other three types, it genuinely can't be rebuilt later
// from just this queue entry's own reference fields. Real dispatch for
// this type happens elsewhere, immediately, at the one real moment the
// full payload actually exists — see
// pages/SynopticReportPage/hooks/useLisIntegration.ts's own
// sendSynopticReportToLis. This dashboard still shows lis_sync entries
// (for real visibility/CAPA), but Dispatch Now/Retry Dispatch are
// disabled for them here, with a clear, honest reason shown rather
// than silently sending an incomplete payload.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect } from 'react';
import { mockOutboundPatientAdtQueueService } from '@/services/patients/mockOutboundPatientAdtQueueService';
import { mockOutboundResultQueueService } from '@/services/reports/mockOutboundResultQueueService';
import { mockOutboundLisSyncQueueService } from '@/services/reports/mockOutboundLisSyncQueueService';
import { buildAdt08Payload, buildAdt40Payload, buildAdt47Payload } from '@/services/patients/buildPatientAdtPayload';
import { buildOruR01Payload } from '@/services/reports/buildOruR01Payload';
import { dispatchInterfaceMessage, type InterfaceTransactionType } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { simulateInterfaceDispatchFailure } from '@/services/hl7/simulateInterfaceDispatchFailure';
import { specimenDeficiencyService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import type { OutboundPatientAdtQueueEntry } from '@/types/patients/OutboundPatientAdtQueueEntry';
import type { OutboundResultQueueEntry } from '@/types/case/OutboundResultQueueEntry';
import type { OutboundLisSyncQueueEntry } from '@/types/case/OutboundLisSyncQueueEntry';
import type { ServiceResult } from '@/services/types';

type QueueType = 'patient_adt' | 'result' | 'lis_sync';
type AnyEntry = OutboundPatientAdtQueueEntry | OutboundResultQueueEntry | OutboundLisSyncQueueEntry;
type Failure = { errorCode: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED'; errorMessage: string; maxRetriesExceeded: boolean };

interface QueueConfig {
  label: string;
  identifierColumnLabel: string;
  kindColumnLabel: string;
  /** Real, per-entry resolution — A08/A40/A47 all share one queue, so
   *  this can't be a fixed, static value the way it can for the other
   *  two queue types. Returns null when this entry's own real
   *  transaction type genuinely can't be determined (should never
   *  happen for a real, valid entry). */
  getTransactionType: (e: AnyEntry) => InterfaceTransactionType | null;
  getIdentifier: (e: AnyEntry) => string;
  getKind: (e: AnyEntry) => string;
  getCaseId: (e: AnyEntry) => string;
  capaLabel: (e: AnyEntry) => string;
  getAll: () => Promise<ServiceResult<AnyEntry[]>>;
  retryDispatch: (id: string) => Promise<ServiceResult<AnyEntry>>;
  markFailed: (id: string, failure: Failure) => Promise<ServiceResult<AnyEntry>>;
  markSent: (id: string) => Promise<ServiceResult<AnyEntry>>;
  /** Real, per direct guidance: builds the real, actual payload this
   *  entry represents, using the same real builder functions this
   *  app's own preview tool already uses — null when this queue type
   *  can't (see this file's own header comment for lis_sync's real,
   *  honest reason). */
  buildPayload: ((e: AnyEntry) => Promise<object | null>) | null;
}

const QUEUE_CONFIG: Record<QueueType, QueueConfig> = {
  patient_adt: {
    label: 'Patient ADT (A08/A40/A47)',
    identifierColumnLabel: 'Source Patient',
    kindColumnLabel: 'Event Type',
    getTransactionType: e => {
      const eventType = (e as OutboundPatientAdtQueueEntry).eventType;
      if (eventType === 'A08_DEMOGRAPHIC_UPDATE') return 'A08';
      if (eventType === 'A40_MERGE_PATIENT') return 'A40';
      if (eventType === 'A47_CHANGE_IDENTIFIER') return 'A47';
      return null;
    },
    getIdentifier: e => (e as OutboundPatientAdtQueueEntry).sourcePatientId,
    getKind: e => (e as OutboundPatientAdtQueueEntry).eventType,
    getCaseId: e => (e as OutboundPatientAdtQueueEntry).sourcePatientId,
    capaLabel: e => `Outbound ${(e as OutboundPatientAdtQueueEntry).eventType} dispatch failure (${e.errorCode ?? 'unknown'}): ${e.errorMessage ?? ''}, ${e.retryCount} retr${e.retryCount === 1 ? 'y' : 'ies'}.`,
    getAll: () => mockOutboundPatientAdtQueueService.getAll(),
    retryDispatch: id => mockOutboundPatientAdtQueueService.retryDispatch(id),
    markFailed: (id, f) => mockOutboundPatientAdtQueueService.markFailed(id, f),
    markSent: id => mockOutboundPatientAdtQueueService.markSent(id),
    buildPayload: async e => {
      const entry = e as OutboundPatientAdtQueueEntry;
      if (entry.eventType === 'A08_DEMOGRAPHIC_UPDATE') {
        return buildAdt08Payload(entry.sourcePatientId, entry.organisationId);
      }
      if (entry.eventType === 'A40_MERGE_PATIENT') {
        if (!entry.targetPatientId) return null;
        return buildAdt40Payload(entry.sourcePatientId, entry.targetPatientId, entry.organisationId, entry.casesRepointed ?? 0, entry.encountersRepointed ?? 0);
      }
      if (entry.eventType === 'A47_CHANGE_IDENTIFIER') {
        if (!entry.targetPatientId) return null;
        return buildAdt47Payload(entry.sourcePatientId, entry.targetPatientId, entry.organisationId, entry.reasonCode ?? '', entry.notes ?? '', entry.casesRepointed ?? 0);
      }
      return null;
    },
  },
  result: {
    label: 'Pathology Result (ORU^R01)',
    identifierColumnLabel: 'Case',
    kindColumnLabel: 'Result State',
    getTransactionType: () => 'ORU_R01',
    getIdentifier: e => (e as OutboundResultQueueEntry).caseId,
    getKind: e => (e as OutboundResultQueueEntry).resultState,
    getCaseId: e => (e as OutboundResultQueueEntry).caseId,
    capaLabel: e => `Outbound ORU^R01 (${(e as OutboundResultQueueEntry).resultState}) dispatch failure (${e.errorCode ?? 'unknown'}): ${e.errorMessage ?? ''}, ${e.retryCount} retr${e.retryCount === 1 ? 'y' : 'ies'}.`,
    getAll: () => mockOutboundResultQueueService.getAll(),
    retryDispatch: id => mockOutboundResultQueueService.retryDispatch(id),
    markFailed: (id, f) => mockOutboundResultQueueService.markFailed(id, f),
    markSent: id => mockOutboundResultQueueService.markSent(id),
    buildPayload: async e => {
      const entry = e as OutboundResultQueueEntry;
      // Real, honest limitation, same as the preview tool: no
      // generatePdf/generateNarrativeText callback supplied — this
      // standalone dashboard has no access to
      // SynopticReportPage.tsx's own React-component closures.
      // reportPdfBase64/reportNarrativeText genuinely come back
      // undefined; every other field is real and accurate.
      return buildOruR01Payload(entry.caseId, entry.instanceId, entry.resultState);
    },
  },
  lis_sync: {
    label: 'Assist-Mode LIS Sync',
    identifierColumnLabel: 'Case',
    kindColumnLabel: 'Sync Kind',
    getTransactionType: () => 'LIS_SYNC',
    getIdentifier: e => (e as OutboundLisSyncQueueEntry).caseId,
    getKind: e => (e as OutboundLisSyncQueueEntry).kind,
    getCaseId: e => (e as OutboundLisSyncQueueEntry).caseId,
    capaLabel: e => `Outbound LIS sync (${(e as OutboundLisSyncQueueEntry).kind}) dispatch failure (${e.errorCode ?? 'unknown'}): ${e.errorMessage ?? ''}, ${e.retryCount} retr${e.retryCount === 1 ? 'y' : 'ies'}.`,
    getAll: () => mockOutboundLisSyncQueueService.getAll(),
    retryDispatch: id => mockOutboundLisSyncQueueService.retryDispatch(id),
    markFailed: (id, f) => mockOutboundLisSyncQueueService.markFailed(id, f),
    markSent: id => mockOutboundLisSyncQueueService.markSent(id),
    // Real, per direct guidance: null, deliberately — see this file's
    // own header comment for the real, honest reason. Real dispatch
    // for this type happens immediately, elsewhere, at the one real
    // moment its full payload actually exists.
    buildPayload: null,
  },
};

const OutboundInterfaceDlqSection: React.FC = () => {
  const { user } = useAuth();
  const [queueType, setQueueType] = useState<QueueType>('patient_adt');
  const [entriesByType, setEntriesByType] = useState<Record<QueueType, AnyEntry[]>>({ patient_adt: [], result: [], lis_sync: [] });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [capturedIds, setCapturedIds] = useState<Set<string>>(new Set());
  const [dispatchMessages, setDispatchMessages] = useState<Record<string, string>>({});

  const loadAll = useCallback(() => {
    (Object.keys(QUEUE_CONFIG) as QueueType[]).forEach(t => {
      QUEUE_CONFIG[t].getAll().then(res => {
        if (res.ok) setEntriesByType(prev => ({ ...prev, [t]: res.data }));
      });
    });
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const config = QUEUE_CONFIG[queueType];
  const entries = entriesByType[queueType];
  const failed = entries.filter(e => e.status === 'FAILED');
  const queued = entries.filter(e => e.status === 'QUEUED');

  // Real, per direct guidance: the actual, single real dispatch flow
  // every real "send this now" action goes through — builds the real
  // payload, POSTs it to the real receiving endpoint, and only
  // transitions to a genuinely-earned SENT on real success, or FAILED
  // with the real, actual error otherwise. Never a simulated outcome.
  const realDispatch = async (entry: AnyEntry) => {
    if (!config.buildPayload) return; // real, honest no-op — see lis_sync's own scope note above
    const transactionType = config.getTransactionType(entry);
    if (!transactionType) return; // real, defensive — should never happen for a real, valid entry
    setBusyId(entry.id);
    setDispatchMessages(prev => { const next = { ...prev }; delete next[entry.id]; return next; });
    try {
      const payload = await config.buildPayload(entry);
      if (!payload) {
        await config.markFailed(entry.id, { errorCode: 'DISPATCH_REJECTED', errorMessage: 'Could not build a real payload for this entry — a referenced patient/case may no longer exist.', maxRetriesExceeded: false });
        loadAll();
        return;
      }
      const result = await dispatchInterfaceMessage(entry.id, transactionType, payload);
      if (result.ok) {
        await config.markSent(entry.id);
        setDispatchMessages(prev => ({ ...prev, [entry.id]: '✓ Dispatched and accepted by the receiving interface.' }));
      } else {
        await config.markFailed(entry.id, { errorCode: result.errorCode ?? 'DISPATCH_REJECTED', errorMessage: result.error ?? 'Unknown dispatch failure.', maxRetriesExceeded: false });
      }
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const retryDispatch = async (entry: AnyEntry) => {
    setBusyId(entry.id);
    try {
      // Real, per direct guidance: the existing retryDispatch() call
      // stays exactly what it always was — a real, audited "someone
      // manually retried this" record (resets status/retryCount) —
      // then immediately followed by the same real dispatch attempt
      // Dispatch Now uses, rather than just resetting status and
      // leaving it QUEUED again with nothing further happening.
      await config.retryDispatch(entry.id);
    } finally {
      setBusyId(null);
    }
    if (config.buildPayload) await realDispatch(entry);
    else loadAll();
  };

  const simulateFailure = async (entry: AnyEntry, kind: 'timeout' | 'unreachable' | 'rejected') => {
    setBusyId(entry.id);
    try {
      await config.markFailed(entry.id, simulateInterfaceDispatchFailure(kind));
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  // Real, per direct guidance, same reasoning as OutboundDlqSection.tsx's
  // own "if I was to create a CAPA I might want to capture the
  // information" — a real, systemic/recurring dispatch failure raised
  // into the same, existing CAPA lifecycle, using the new, genuinely
  // separate deficiency type (never billing's own def-outbound-dispatch-failure,
  // which is factually RCM/billing-specific in its own name).
  const captureAsCapa = async (entry: AnyEntry) => {
    setBusyId(entry.id);
    try {
      await specimenDeficiencyService.raise({
        caseId: config.getCaseId(entry),
        deficiencyTypeId: 'def-outbound-interface-dispatch-failure',
        comment: config.capaLabel(entry),
        raisedBy: user?.id ?? 'unknown',
      });
      setCapturedIds(prev => new Set(prev).add(entry.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <div>
          <h2 className="ps-conf-section-title">Outbound Interface DLQ</h2>
          <p className="ps-conf-section-subtitle">
            Failed and queued outbound ADT^A08/A40/A47, ORU^R01, and assist-mode LIS sync dispatches. Dispatch Now
            and Retry Dispatch genuinely send the real payload to the real receiving endpoint
            (receive_interface_message) — Simulate Failure stays a real, separate testing aid, never a real
            dispatch attempt.
          </p>
        </div>
        <select value={queueType} onChange={e => setQueueType(e.target.value as QueueType)} className="ps-conf-select">
          {(Object.keys(QUEUE_CONFIG) as QueueType[]).map(t => <option key={t} value={t}>{QUEUE_CONFIG[t].label}</option>)}
        </select>
      </div>

      {!config.buildPayload && (
        <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>
          ⚠ This queue's own real payload (the actual report text) is built from a real, ephemeral value that's
          never persisted anywhere — it genuinely can't be rebuilt here later. Real dispatch for this type happens
          immediately, at the moment its payload is actually built (SynopticReportPage.tsx's own sign-out/amendment
          flow) — Dispatch Now/Retry Dispatch are disabled below rather than sending an incomplete payload.
        </p>
      )}

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{config.identifierColumnLabel}</th>
                <th className="ps-conf-th">{config.kindColumnLabel}</th>
                <th className="ps-conf-th">Error</th>
                <th className="ps-conf-th">Retries</th>
                <th className="ps-conf-th">Retry</th>
                <th className="ps-conf-th">CAPA</th>
              </tr>
            </thead>
            <tbody>
              {failed.map(e => (
                <tr key={e.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{config.getIdentifier(e)}</td>
                  <td className="ps-conf-td">{config.getKind(e)}</td>
                  <td className="ps-conf-td">
                    {e.errorCode === 'DISPATCH_TIMEOUT' ? 'Dispatch timeout' : e.errorCode === 'DISPATCH_UNREACHABLE' ? 'Engine unreachable' : e.errorCode === 'DISPATCH_REJECTED' ? 'Dispatch rejected' : 'Unknown'}
                    <div className="ps-specreq-meta">{e.errorMessage}</div>
                  </td>
                  <td className="ps-conf-td">{e.retryCount}{e.maxRetriesExceeded ? ' (max exceeded)' : ''}</td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-primary" disabled={busyId === e.id || !config.buildPayload} onClick={() => retryDispatch(e)}>
                      {busyId === e.id ? 'Sending…' : 'Retry Dispatch'}
                    </button>
                  </td>
                  <td className="ps-conf-td">
                    {capturedIds.has(e.id) ? (
                      <span className="ps-conf-hint" style={{ color: '#10b981' }}>✓ Captured</span>
                    ) : (
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => captureAsCapa(e)}>
                        Capture as CAPA
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {failed.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No failed dispatches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-conf-section-header" style={{ marginTop: 24 }}>
        <h2 className="ps-conf-section-title">Queued</h2>
        <p className="ps-conf-section-subtitle">
          Real, queued messages awaiting dispatch. Dispatch Now genuinely sends; Simulate Failure honestly
          fabricates a network-style failure for testing this dashboard — it never reflects a real dispatch attempt.
        </p>
      </div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{config.identifierColumnLabel}</th>
                <th className="ps-conf-th">{config.kindColumnLabel}</th>
                <th className="ps-conf-th">Queued At</th>
                <th className="ps-conf-th">Dispatch</th>
                <th className="ps-conf-th">Simulate</th>
              </tr>
            </thead>
            <tbody>
              {queued.map(e => (
                <tr key={e.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{config.getIdentifier(e)}</td>
                  <td className="ps-conf-td">{config.getKind(e)}</td>
                  <td className="ps-conf-td">{new Date(e.queuedAt).toLocaleString()}</td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-primary" disabled={busyId === e.id || !config.buildPayload} onClick={() => realDispatch(e)}>
                      {busyId === e.id ? 'Sending…' : 'Dispatch Now'}
                    </button>
                    {dispatchMessages[e.id] && <div className="ps-conf-hint" style={{ color: '#10b981' }}>{dispatchMessages[e.id]}</div>}
                  </td>
                  <td className="ps-conf-td">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => simulateFailure(e, 'timeout')}>Simulate Timeout</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => simulateFailure(e, 'unreachable')}>Simulate Unreachable</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => simulateFailure(e, 'rejected')}>Simulate Rejected</button>
                    </div>
                  </td>
                </tr>
              ))}
              {queued.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>No queued messages.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OutboundInterfaceDlqSection;
