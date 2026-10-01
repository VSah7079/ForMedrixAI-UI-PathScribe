// src/pages/PrintQueueDashboardSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 ("Print Queue Management Dashboard & Batch
// Operations"). Mirrors OutboundInterfaceDlqSection.tsx's own, proven
// admin-dashboard pattern closely — a real, hand-rolled
// `.ps-conf-table` (no shared <DataTable> component exists anywhere in
// this app), real service calls wired directly to button handlers,
// real busy/selection state kept locally in this component. Every
// piece of real decision-making this dashboard triggers already lives
// in services/printing/ (mockPrintQueueService's hold/release/cancel/
// redirect/tagBatch, redispatchPrintJob's retry/redirect+retry
// composition, runScheduledBatchAggregation's own aggregation) — this
// file only ever wires UI state (which rows are selected, which
// status filter is active, which job a busy spinner belongs to) to
// those real functions, same "component wires, service decides"
// split OutboundInterfaceDlqSection.tsx already establishes. The one
// exception is the bulk-selection Set<string> toggle itself — a plain
// UI-interaction concern, not a domain rule, same real posture
// useMicrotomyWorkstation.ts's own batchSelection already takes.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { mockPrintQueueService } from '@/services/printing/mockPrintQueueService';
import { redispatchPrintJob, redispatchManyPrintJobs, redirectAndRedispatchPrintJob, redirectAndRedispatchManyPrintJobs } from '@/services/printing/redispatchPrintJob';
import { runScheduledBatchAggregation } from '@/services/printing/runScheduledBatchAggregation';
import { useAuth } from '@/contexts/AuthContext';
import type { PrintJob } from '@/types/printing/PrintJob';
import type { BatchGroupBy } from '@/types/printing/PrintBatch';
import type { PrintProtocol } from '@/types/printRouting/PrintDestination';

type StatusFilter = 'ALL' | PrintJob['status'];
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'QUEUED', 'PRINTING', 'FAILED', 'HOLD', 'PRINTED', 'CANCELLED'];

/** Real, per mockPrintQueueService.ts's own HOLDABLE_STATUSES — kept
 *  in sync here for enabling/disabling the real Hold button; the
 *  service itself is still the one, real place that enforces this
 *  rule (a stale/duplicated copy here would only ever affect which
 *  button is clickable, never which job actually gets held). */
const HOLDABLE: PrintJob['status'][] = ['QUEUED', 'PRINTING', 'FAILED'];
const CANCELLABLE: PrintJob['status'][] = ['QUEUED', 'PRINTING', 'FAILED', 'HOLD'];
const RETRIABLE: PrintJob['status'][] = ['QUEUED', 'FAILED'];

const PROTOCOLS: PrintProtocol[] = ['RAW_9100', 'LPR_LPD', 'IPP'];

const PrintQueueDashboardSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const actorId = user?.id ?? 'unknown';

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [batchGroupBy, setBatchGroupBy] = useState<BatchGroupBy>('clientAccount');
  const [batchWindowStart, setBatchWindowStart] = useState('08:00');
  const [batchWindowEnd, setBatchWindowEnd] = useState('17:00');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResultMessage, setBatchResultMessage] = useState<string | null>(null);

  const [redirectTargetIds, setRedirectTargetIds] = useState<string[] | null>(null);
  const [redirectProtocol, setRedirectProtocol] = useState<PrintProtocol>('RAW_9100');
  const [redirectIpAddress, setRedirectIpAddress] = useState('');
  const [redirectPort, setRedirectPort] = useState('');

  const loadAll = useCallback(() => {
    mockPrintQueueService.getAll().then(res => { if (res.ok) setJobs(res.data); });
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const visibleJobs = useMemo(
    () => (statusFilter === 'ALL' ? jobs : jobs.filter(j => j.status === statusFilter)),
    [jobs, statusFilter],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every(j => prev.has(j.id));
      return allVisibleSelected ? new Set() : new Set(visibleJobs.map(j => j.id));
    });
  };

  const withBusy = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try { await action(); } finally { setBusyId(null); loadAll(); }
  };

  const handleHold = (job: PrintJob) => withBusy(job.id, () => mockPrintQueueService.holdPrintJob(job.id, actorId));
  const handleRelease = (job: PrintJob) => withBusy(job.id, () => mockPrintQueueService.releaseHold(job.id, actorId));
  const handleCancel = (job: PrintJob) => withBusy(job.id, () => mockPrintQueueService.cancelPrintJob(job.id, actorId));
  const handleRetry = (job: PrintJob) => withBusy(job.id, () => redispatchPrintJob(job.id));

  const openRedirect = (ids: string[]) => {
    setRedirectTargetIds(ids);
    setRedirectProtocol('RAW_9100');
    setRedirectIpAddress('');
    setRedirectPort('');
  };
  const closeRedirect = () => setRedirectTargetIds(null);

  const submitRedirect = async () => {
    if (!redirectTargetIds || !redirectIpAddress.trim()) return;
    const destination = {
      protocol: redirectProtocol,
      ipAddress: redirectIpAddress.trim(),
      port: redirectPort.trim() ? Number(redirectPort.trim()) : undefined,
    };
    setBulkBusy(true);
    try {
      if (redirectTargetIds.length === 1) {
        await redirectAndRedispatchPrintJob(redirectTargetIds[0], destination, actorId);
      } else {
        await redirectAndRedispatchManyPrintJobs(redirectTargetIds, destination, actorId);
      }
    } finally {
      setBulkBusy(false);
      closeRedirect();
      loadAll();
    }
  };

  const runBulk = async (action: (ids: string[], actor: string) => Promise<unknown>) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await action(ids, actorId);
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
      loadAll();
    }
  };

  const runBatchNow = async () => {
    setBatchRunning(true);
    setBatchResultMessage(null);
    try {
      const result = await runScheduledBatchAggregation(
        { groupBy: batchGroupBy, windowStart: batchWindowStart, windowEnd: batchWindowEnd },
        new Date().toISOString(),
      );
      setBatchResultMessage(t('printQueueDashboard.batch.resultMessage', {
        groups: result.groups.length, tagged: result.taggedJobCount, skipped: result.skippedJobIds.length,
      }));
    } finally {
      setBatchRunning(false);
      loadAll();
    }
  };

  const statusLabel = (status: PrintJob['status']) => t(`printQueueDashboard.status.${status}`);
  const paperSourceLabel = (v?: PrintJob['paperSource']) => (v ? t(`printQueueDashboard.paperSource.${v}`) : '—');
  const duplexLabel = (v?: PrintJob['duplexMode']) => (v ? t(`printQueueDashboard.duplexMode.${v}`) : '—');
  const destinationLabel = (job: PrintJob) => {
    const destination = job.redirectedToDestination ?? job.resolvedDestination;
    if (!destination) return '—';
    return destination.displayName ?? `${destination.protocol} ${destination.ipAddress}${destination.port ? `:${destination.port}` : ''}`;
  };

  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every(j => selectedIds.has(j.id));

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <div>
          <h2 className="ps-conf-section-title">{t('printQueueDashboard.title')}</h2>
          <p className="ps-conf-section-subtitle">{t('printQueueDashboard.subtitle')}</p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="ps-conf-select">
          {STATUS_FILTERS.map(sf => (
            <option key={sf} value={sf}>{sf === 'ALL' ? t('printQueueDashboard.status.ALL') : statusLabel(sf)}</option>
          ))}
        </select>
      </div>

      {/* Real, per PS-279 §2.2.2 — Scheduled batch aggregation, run on
          demand (see runScheduledBatchAggregation.ts's own header for
          why this app has no real background scheduler to run it on a
          timer instead). */}
      <div className="ps-qa-tab-toolbar ps-qa-tab-toolbar--wrap">
        <div className="ps-conf-form-row--3">
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.batch.groupByLabel')}</label>
            <select value={batchGroupBy} onChange={e => setBatchGroupBy(e.target.value as BatchGroupBy)} className="ps-conf-select">
              <option value="clientAccount">{t('printQueueDashboard.batch.groupByClientAccount')}</option>
              <option value="deliveryRoute">{t('printQueueDashboard.batch.groupByDeliveryRoute')}</option>
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.batch.windowStartLabel')}</label>
            <input type="time" value={batchWindowStart} onChange={e => setBatchWindowStart(e.target.value)} className="ps-conf-input" />
          </div>
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.batch.windowEndLabel')}</label>
            <input type="time" value={batchWindowEnd} onChange={e => setBatchWindowEnd(e.target.value)} className="ps-conf-input" />
          </div>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" disabled={batchRunning} onClick={runBatchNow}>
          {batchRunning ? t('printQueueDashboard.batch.running') : t('printQueueDashboard.batch.runNow')}
        </button>
      </div>
      {batchResultMessage && <p className="ps-conf-hint ps-conf-hint--success">{batchResultMessage}</p>}
      <p className="ps-conf-hint">{t('printQueueDashboard.batch.windowHint')}</p>

      {/* Real, per PS-279 §2.2.3 — bulk operations toolbar, only ever
          shown once a real selection exists. */}
      {selectedIds.size > 0 && (
        <div className="ps-qa-tab-toolbar ps-qa-tab-toolbar--center ps-dlq-section-header--spaced">
          <p className="ps-conf-hint">{t('printQueueDashboard.bulk.selectedCount', { count: selectedIds.size })}</p>
          <div className="ps-dlq-inline-actions">
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={() => runBulk((ids, actor) => mockPrintQueueService.holdMany(ids, actor))}>{t('printQueueDashboard.action.hold')}</button>
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={() => runBulk((ids, actor) => mockPrintQueueService.releaseHoldMany(ids, actor))}>{t('printQueueDashboard.action.release')}</button>
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={() => runBulk(ids => redispatchManyPrintJobs(ids))}>{t('printQueueDashboard.action.retry')}</button>
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={() => openRedirect(Array.from(selectedIds))}>{t('printQueueDashboard.action.redirect')}</button>
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={() => runBulk((ids, actor) => mockPrintQueueService.cancelMany(ids, actor))}>{t('printQueueDashboard.action.cancel')}</button>
          </div>
        </div>
      )}

      {redirectTargetIds && (
        <div className="ps-conf-form-row--3 ps-dlq-section-header--spaced">
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.redirect.protocolLabel')}</label>
            <select value={redirectProtocol} onChange={e => setRedirectProtocol(e.target.value as PrintProtocol)} className="ps-conf-select">
              {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.redirect.ipAddressLabel')}</label>
            <input type="text" value={redirectIpAddress} onChange={e => setRedirectIpAddress(e.target.value)} className="ps-conf-input" placeholder="192.168.1.50" />
          </div>
          <div className="ps-conf-form-field">
            <label>{t('printQueueDashboard.redirect.portLabel')}</label>
            <input type="text" value={redirectPort} onChange={e => setRedirectPort(e.target.value)} className="ps-conf-input" placeholder={t('printQueueDashboard.redirect.portPlaceholder')} />
          </div>
          <div className="ps-dlq-inline-actions">
            <button className="ps-conf-btn-primary" disabled={bulkBusy || !redirectIpAddress.trim()} onClick={submitRedirect}>{t('printQueueDashboard.redirect.confirm')}</button>
            <button className="ps-conf-btn-secondary" disabled={bulkBusy} onClick={closeRedirect}>{t('printQueueDashboard.redirect.cancelForm')}</button>
          </div>
        </div>
      )}

      <div className="ps-conf-table-wrap ps-dlq-section-header--spaced">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th"><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} /></th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.caseId')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.reportType')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.mode')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.status')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.presentation')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.destination')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.batchId')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.queuedAt')}</th>
                <th className="ps-conf-th">{t('printQueueDashboard.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map(job => (
                <tr key={job.id} className="ps-conf-tr">
                  <td className="ps-conf-td"><input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleSelected(job.id)} /></td>
                  <td className="ps-conf-td" data-phi="accession">{job.caseId}</td>
                  <td className="ps-conf-td">{job.reportType}</td>
                  <td className="ps-conf-td">{job.mode}</td>
                  <td className="ps-conf-td">
                    {statusLabel(job.status)}
                    {job.status === 'FAILED' && job.errorMessage && <div className="ps-specreq-meta">{job.errorMessage}</div>}
                    {job.status === 'HOLD' && job.holdReason && <div className="ps-specreq-meta">{job.holdReason}</div>}
                  </td>
                  <td className="ps-conf-td">{paperSourceLabel(job.paperSource)} / {duplexLabel(job.duplexMode)}</td>
                  <td className="ps-conf-td">{destinationLabel(job)}</td>
                  <td className="ps-conf-td">{job.batchId ?? '—'}</td>
                  <td className="ps-conf-td">{new Date(job.queuedAt).toLocaleString()}</td>
                  <td className="ps-conf-td">
                    <div className="ps-dlq-inline-actions">
                      <button className="ps-conf-btn-secondary" disabled={busyId === job.id || !HOLDABLE.includes(job.status)} onClick={() => handleHold(job)}>{t('printQueueDashboard.action.hold')}</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === job.id || job.status !== 'HOLD'} onClick={() => handleRelease(job)}>{t('printQueueDashboard.action.release')}</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === job.id || !RETRIABLE.includes(job.status)} onClick={() => handleRetry(job)}>{t('printQueueDashboard.action.retry')}</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === job.id || job.mode !== 'DIRECT_NETWORK_PRINT' || job.status === 'PRINTED' || job.status === 'CANCELLED'} onClick={() => openRedirect([job.id])}>{t('printQueueDashboard.action.redirect')}</button>
                      <button className="ps-conf-btn-secondary" disabled={busyId === job.id || !CANCELLABLE.includes(job.status)} onClick={() => handleCancel(job)}>{t('printQueueDashboard.action.cancel')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleJobs.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={10}>{t('printQueueDashboard.noJobs')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PrintQueueDashboardSection;
