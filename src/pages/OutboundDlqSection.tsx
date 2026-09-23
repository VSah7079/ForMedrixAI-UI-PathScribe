// src/pages/OutboundDlqSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per Epic: PathScribe Outbound Billing & Charge Event Engine, User
// Story 4 - the Billing Specialist's real DLQ dashboard. Two real failure
// categories shown distinctly, per validateChargeMetadata.ts/
// simulateDispatchFailure.ts's own headers:
//   - MISSING_ICD10/MISSING_PROVIDER_NPI - real, genuine failures, this
//     app really does check real case data for these.
//   - DISPATCH_TIMEOUT/DISPATCH_REJECTED - only ever produced by the
//     explicit "Simulate Failure" action below, since Story 3's real
//     dispatch doesn't exist yet - labeled as such everywhere shown.
//
// Real, per direct follow-up: moved here from Configuration > System
// (an operational, day-to-day monitoring queue belongs in Audit
// alongside Billing Logs, not in admin configuration) and given a
// real "Performing Lab" filter - a facility with its own separate
// billing admin monitoring only its own site's failed dispatches
// shouldn't have to scan every other site's entries to find theirs.
// OutboundChargeQueueEntry itself carries no siteId, so each entry's
// real performing site is resolved via its own case's order.siteId -
// the same real field Billing Type Triggers' own site-scoping
// resolves from.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mockOutboundChargeQueueService } from '@/services/billing/mockOutboundChargeQueueService';
import { validateChargeMetadata } from '@/services/billing/validateChargeMetadata';
import { simulateDispatchFailure } from '@/services/billing/simulateDispatchFailure';
import { caseRouter } from '@/services/cases/CaseRouter';
import { auditService, specimenDeficiencyService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import type { OutboundChargeQueueEntry } from '@/types/billing/OutboundChargeQueueEntry';

const ERROR_LABEL_KEY: Record<NonNullable<OutboundChargeQueueEntry['errorCode']>, string> = {
  MISSING_ICD10: 'outboundDlq.errorLabel.missingIcd10',
  MISSING_PROVIDER_NPI: 'outboundDlq.errorLabel.missingProviderNpi',
  DISPATCH_TIMEOUT: 'outboundDlq.errorLabel.dispatchTimeout',
  DISPATCH_REJECTED: 'outboundDlq.errorLabel.dispatchRejected',
};

const OutboundDlqSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [allEntries, setAllEntries] = useState<OutboundChargeQueueEntry[]>([]);
  const [entrySiteIds, setEntrySiteIds] = useState<Record<string, string | undefined>>({});
  const [sites, setSites] = useState<Site[]>([]);
  const [viewingSiteId, setViewingSiteId] = useState<string>('');
  const [fixValue, setFixValue] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [capturedIds, setCapturedIds] = useState<Set<string>>(new Set());

  const loadAll = useCallback(() => {
    mockOutboundChargeQueueService.getAll().then(async res => {
      if (!res.ok) return;
      setAllEntries(res.data);
      // Real, per direct follow-up: resolve each entry's real
      // performing site from its own case, since the queue entry
      // itself carries no siteId of its own.
      const uniqueCaseIds = [...new Set(res.data.map(e => e.caseId))];
      const bySite: Record<string, string | undefined> = {};
      await Promise.all(uniqueCaseIds.map(async caseId => {
        const c = await caseRouter.getCase(caseId);
        bySite[caseId] = c?.order?.siteId;
      }));
      setEntrySiteIds(bySite);
    });
    listAllSites().then(setSites);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const matchesSite = (e: OutboundChargeQueueEntry) => !viewingSiteId || entrySiteIds[e.caseId] === viewingSiteId;
  const failed = allEntries.filter(e => e.status === 'FAILED' && matchesSite(e));
  const queued = allEntries.filter(e => e.status === 'QUEUED' && matchesSite(e));

  const siteLabelFor = (caseId: string): string => {
    const siteId = entrySiteIds[caseId];
    if (!siteId) return '—';
    return sites.find(s => s.id === siteId)?.name ?? siteId;
  };

  // Real, per direct guidance: "attach missing provider NPI" / add the
  // missing ICD-10 - writes real case data, re-validates against it,
  // and only re-queues if the real gap is actually closed. Every manual
  // edit logged to the real, established audit service, per Story 4's
  // own "immutable audit log of all manual edits" requirement.
  const handleFixAndRetry = async (entry: OutboundChargeQueueEntry) => {
    const value = fixValue[entry.id]?.trim();
    if (!value) return;
    setBusyId(entry.id);
    try {
      const caseData = await caseRouter.getCase(entry.caseId);
      if (!caseData) return;
      if (entry.errorCode === 'MISSING_ICD10') {
        const patch = { order: { ...caseData.order, icd10Codes: [...(caseData.order?.icd10Codes ?? []), { code: value, description: 'Manually attached from DLQ' }] } };
        await caseRouter.updateCase(caseData.id, patch as any, (caseData as any).version ?? 0);
        auditService.logEvent({ type: 'user', event: 'DLQ manual edit — ICD-10 attached', detail: `Attached ICD-10 "${value}" to case ${caseData.id} to resolve queue entry ${entry.id}`, user: 'current', caseId: caseData.id, confidence: null });
      } else if (entry.errorCode === 'MISSING_PROVIDER_NPI') {
        const participants = [...(caseData.participants ?? [])];
        const idx = participants.findIndex(p => p.status === 'active');
        if (idx >= 0) participants[idx] = { ...participants[idx], externalId: value, externalIdType: 'NPI' };
        await caseRouter.updateCase(caseData.id, { participants } as any, (caseData as any).version ?? 0);
        auditService.logEvent({ type: 'user', event: 'DLQ manual edit — provider NPI attached', detail: `Attached NPI "${value}" on case ${caseData.id} to resolve queue entry ${entry.id}`, user: 'current', caseId: caseData.id, confidence: null });
      }

      const refreshed = await caseRouter.getCase(entry.caseId);
      const stillFailing = refreshed ? validateChargeMetadata(refreshed) : [];
      if (stillFailing.length === 0) {
        await mockOutboundChargeQueueService.retryDispatch(entry.id);
      } else {
        // Real fix, found during verification: the entry's own error
        // must reflect whatever's genuinely still wrong, not the
        // stale reason from before this fix - otherwise a user who
        // just resolved the ICD-10 gap would keep seeing "Missing
        // ICD-10" even though the real, remaining issue is now the NPI.
        await mockOutboundChargeQueueService.markFailed(entry.id, {
          errorCode: stillFailing[0].errorCode,
          errorMessage: stillFailing[0].errorMessage,
          maxRetriesExceeded: false,
        });
      }
      setFixValue(prev => ({ ...prev, [entry.id]: '' }));
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryDispatch = async (entry: OutboundChargeQueueEntry) => {
    setBusyId(entry.id);
    try {
      await mockOutboundChargeQueueService.retryDispatch(entry.id);
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  // Real, per direct guidance: "if I was to create a CAPA I might want
  // to capture the information." Raises a real, open SpecimenDeficiency
  // (deficiencyTypeId 'def-outbound-dispatch-failure') that flows into
  // the same, existing CAPA lifecycle already built for Operations/CAPA
  // Engine - visible in QA's own Deficiencies tab, can be escalated,
  // gets a real effectiveness check. Never touches the DLQ entry's own
  // status - capturing a failure for systemic review is independent of
  // whether it also gets retried/resolved here.
  const handleCaptureAsCapa = async (entry: OutboundChargeQueueEntry) => {
    setBusyId(entry.id);
    try {
      await specimenDeficiencyService.raise({
        caseId: entry.caseId,
        deficiencyTypeId: 'def-outbound-dispatch-failure',
        comment: `Outbound charge dispatch failure (${entry.errorCode ?? 'unknown'}): ${entry.errorMessage ?? ''} — component ${entry.billingType}, trigger ${entry.triggerEvent}, ${entry.retryCount} retr${entry.retryCount === 1 ? 'y' : 'ies'}.`,
        raisedBy: user?.id ?? 'unknown',
      });
      setCapturedIds(prev => new Set(prev).add(entry.id));
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulateFailure = async (entry: OutboundChargeQueueEntry, kind: 'timeout' | 'rejected') => {
    setBusyId(entry.id);
    try {
      const failure = simulateDispatchFailure(kind);
      await mockOutboundChargeQueueService.markFailed(entry.id, failure);
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <div>
          <h2 className="ps-conf-section-title">{t('outboundDlq.title')}</h2>
          <p className="ps-conf-section-subtitle">{t('outboundDlq.subtitle')}</p>
        </div>
        <select value={viewingSiteId} onChange={e => setViewingSiteId(e.target.value)} className="ps-conf-select">
          <option value="">{t('outboundDlq.allPerformingLabs')}</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('outboundDlq.caseHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.performingLabHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.componentHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.errorHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.retriesHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.fixAndRetryHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.capaHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {failed.map(e => (
                <tr key={e.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{e.caseId}</td>
                  <td className="ps-conf-td">{siteLabelFor(e.caseId)}</td>
                  <td className="ps-conf-td">{e.billingType}</td>
                  <td className="ps-conf-td">
                    {e.errorCode ? t(ERROR_LABEL_KEY[e.errorCode]) : t('outboundDlq.unknownError')}
                    <div className="ps-specreq-meta">{e.errorMessage}</div>
                  </td>
                  <td className="ps-conf-td">{e.retryCount}{e.maxRetriesExceeded ? ` ${t('outboundDlq.maxExceededSuffix')}` : ''}</td>
                  <td className="ps-conf-td">
                    {(e.errorCode === 'MISSING_ICD10' || e.errorCode === 'MISSING_PROVIDER_NPI') ? (
                      <div className="ps-dlq-inline-actions">
                        <input
                          className="ps-conf-input"
                          placeholder={e.errorCode === 'MISSING_ICD10' ? t('outboundDlq.icd10Placeholder') : t('outboundDlq.providerNpiPlaceholder')}
                          value={fixValue[e.id] ?? ''}
                          onChange={ev => setFixValue(prev => ({ ...prev, [e.id]: ev.target.value }))}
                        />
                        <button className="ps-conf-btn-primary" disabled={busyId === e.id || !fixValue[e.id]?.trim()} onClick={() => handleFixAndRetry(e)}>
                          {t('outboundDlq.saveAndRequeue')}
                        </button>
                      </div>
                    ) : (
                      <button className="ps-conf-btn-primary" disabled={busyId === e.id} onClick={() => handleRetryDispatch(e)}>
                        {t('outboundDlq.retryDispatch')}
                      </button>
                    )}
                  </td>
                  <td className="ps-conf-td">
                    {capturedIds.has(e.id) ? (
                      <span className="ps-conf-hint ps-conf-hint--success">{t('outboundDlq.captured')}</span>
                    ) : (
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => handleCaptureAsCapa(e)}>
                        {t('outboundDlq.captureAsCapa')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {failed.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={7}>{t('outboundDlq.noFailedEntries')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-conf-section-header ps-dlq-section-header--spaced">
        <h2 className="ps-conf-section-title">{t('outboundDlq.queuedSectionTitle')}</h2>
        <p className="ps-conf-section-subtitle">{t('outboundDlq.queuedSectionSubtitle')}</p>
      </div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('outboundDlq.caseHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.performingLabHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.componentHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.triggerHeader')}</th>
                <th className="ps-conf-th">{t('outboundDlq.simulateHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {queued.map(e => (
                <tr key={e.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{e.caseId}</td>
                  <td className="ps-conf-td">{siteLabelFor(e.caseId)}</td>
                  <td className="ps-conf-td">{e.billingType}</td>
                  <td className="ps-conf-td">{e.triggerEvent}</td>
                  <td className="ps-conf-td">
                    <div className="ps-dlq-inline-actions">
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => handleSimulateFailure(e, 'timeout')}>{t('outboundDlq.simulateTimeout')}</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === e.id} onClick={() => handleSimulateFailure(e, 'rejected')}>{t('outboundDlq.simulateRejected')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {queued.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>{t('outboundDlq.noQueuedEntries')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OutboundDlqSection;
