// src/components/QualityAssurance/IntraopLinkageTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The department-wide view of intraop-to-case linkage — merged entries
// (with the real resolution detail from the audit-log fix: matchType,
// confidence, whether a human overrode a suggestion) and still-pending
// entries (with time-since-created as the real operational risk signal —
// a frozen sitting unlinked for days is a genuine safety flag).
//
// This is genuinely the same data that was already sitting in "My
// Contribution"'s Active Intraop Sessions tile — that panel's own
// getPending() call was previously unfiltered (a real bug, since fixed
// there to scope to the current pathologist). Here, the same underlying
// service is queried deliberately unfiltered (or scoped by Client), since
// that's exactly what an aggregate QA view needs.
//
// i18n note: this tab shares its trend-chart/summary-tile/banner/table
// layout with ReconciliationTab.tsx (batch 153), so it reuses that
// file's own `.ps-qa-tile--alert`/`.ps-conf-td--high-severity`/
// `.ps-conf-td--muted-italic`/`.ps-defic-trend-tooltip-empty` classes
// and the `.ps-mt-20`/`.ps-mb-8`/`.ps-defic-review-banner-label`
// utility classes verbatim — no new CSS needed for this batch.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { intraoperativeService } from '@/services';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';
import type { AuditLog } from '@/services/auditlog/IAuditService';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { caseMatchesScope, exportQaReportRows, scopeLabel, QaScope } from './qaReportUtils';

const hoursSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);

export const IntraopLinkageTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [entries, setEntries] = useState<IntraoperativeEntry[]>([]);
  const [mergeLogs, setMergeLogs] = useState<AuditLog[]>([]);
  const [caseClientById, setCaseClientById] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      mockAuditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Intraoperative Linkage tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }
    Promise.all([
      intraoperativeService.getAll(),
      mockAuditService.getAuditLogs(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant }),
    ]).then(([entriesRes, logsRes, casesRes]) => {
      if (entriesRes.ok) setEntries(entriesRes.data);
      if (logsRes.ok) setMergeLogs(logsRes.data.filter(l => l.event === 'Intraop Entry Merged'));
      if (casesRes.ok) {
        const map: Record<string, string | undefined> = {};
        casesRes.data.forEach((c) => { map[c.id] = c?.order?.facilityId; });
        setCaseClientById(map);
      }
      setLoading(false);
    });
  }, []);

  // Scope filter applies to which CASE the entry is (or would be) linked
  // to — a pending entry has no case yet, so it can't be scoped by
  // client at all and always shows under every scope (there's nothing
  // to exclude it on; hiding it would just make genuinely pending work
  // invisible under a client-scoped view, which defeats the point of
  // this report).
  const scopedMerged = useMemo(
    () => entries.filter(e => e.status === 'merged' && e.mergedIntoCaseId
      && caseMatchesScope({ order: { clientId: caseClientById[e.mergedIntoCaseId] } }, scope)),
    [entries, caseClientById, scope]
  );
  const scopedPending = useMemo(() => entries.filter(e => e.status === 'pending'), [entries]);
  const visibleClientIds = useMemo(
    () => Array.from(new Set(Object.values(caseClientById).filter((v): v is string => !!v))),
    [caseClientById]
  );

  const logForCase = (caseId: string) => mergeLogs.find(l => l.caseId === caseId);

  const overduePending = scopedPending.filter(e => hoursSince(e.createdAt) > 24);

  // Real monthly average linkage TAT (hours from frozen-section creation
  // to actual merge), last 6 months — this is the metric that actually
  // matters for this tab: not "how many merged" but "how long is data
  // sitting unlinked before it gets there." Mirrors the same pattern as
  // the Reconciliation tab's concordance trend.
  const tatTrend = useMemo(() => {
    const months: { month: string; avgHours: number | null; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = scopedMerged.filter(e => {
        if (!e.mergedAt) return false;
        const ts = new Date(e.mergedAt).getTime();
        return ts >= monthStart && ts < monthEnd;
      });
      const avgHours = inMonth.length > 0
        ? +(inMonth.reduce((s, e) => s + (new Date(e.mergedAt!).getTime() - new Date(e.createdAt).getTime()) / 3600000, 0) / inMonth.length).toFixed(1)
        : null;
      months.push({ month: monthKey, avgHours, total: inMonth.length });
    }
    return months;
  }, [scopedMerged]);

  const handleExport = () => {
    // CSV export headers and content stay in English — persisted/
    // exported data, not on-screen UI (this sweep's established rule).
    const mergedRows = scopedMerged.map(e => {
      const log = e.mergedIntoCaseId ? logForCase(e.mergedIntoCaseId) : undefined;
      return {
        'Entry ID': e.id,
        'Merged Into Case': e.mergedIntoCaseId ?? '',
        'Merged At': e.mergedAt ?? '',
        'Performed By': e.performedBy.userName,
        'Resolution': log?.detail ?? '(no audit record — merged before the resolution-logging fix)',
      };
    });
    const pendingRows = scopedPending.map(e => ({
      'Entry ID': e.id,
      'Status': 'Pending',
      'Created At': e.createdAt,
      'Hours Pending': hoursSince(e.createdAt),
      'Performed By': e.performedBy.userName,
      'OR Number': e.orNumber,
    }));
    exportQaReportRows([...mergedRows, ...pendingRows], `intraoperative-linkage-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-loading">{t('intraopLinkageTab.loading')}</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={visibleClientIds} />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>{t('common.export')}</button>
      </div>

      <div className="ps-defic-trend-card">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={tatTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} unit="h" />
            <Tooltip content={({ active, payload, label }: TooltipContentProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload;
              return (
                <div className="ps-tat-trend__tooltip">
                  <div className="ps-tat-trend__tooltip-header">{label}</div>
                  {point?.avgHours !== null
                    ? <div className="ps-defic-trend-tooltip-closed">{t('intraopLinkageTab.tooltip.avgLinkageTat', { hours: point.avgHours, count: point.total })}</div>
                    : <div className="ps-defic-trend-tooltip-empty">{t('intraopLinkageTab.tooltip.noMerges')}</div>}
                </div>
              );
            }} />
            <Line type="monotone" dataKey="avgHours" stroke="#0891B2" strokeWidth={2.5} dot={{ r: 3, fill: '#0891B2', strokeWidth: 0 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{scopedMerged.length}</div>
          <div className="ps-qa-tile-label">{t('auditLog.statusLabels.merged')}</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{scopedPending.length}</div>
          <div className="ps-qa-tile-label">{t('intraopLinkageTab.tile.pendingLinkage')}</div>
        </div>
        <div className={`ps-qa-tile${overduePending.length > 0 ? ' ps-qa-tile--alert' : ''}`}>
          <div className={`ps-qa-tile-value${overduePending.length > 0 ? ' ps-qa-tile-value--alert' : ''}`}>{overduePending.length}</div>
          <div className="ps-qa-tile-label">{t('intraopLinkageTab.tile.pendingOver24h')}</div>
        </div>
      </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('intraopLinkageTab.pendingBanner', { count: scopedPending.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead><tr><th className="ps-conf-th">{t('intraopLinkageTab.entryHeader')}</th><th className="ps-conf-th">{t('intraopLinkageTab.performedByHeader')}</th><th className="ps-conf-th">{t('intraopLinkageTab.orHeader')}</th><th className="ps-conf-th">{t('molecularRackWorklistPage.colCreated')}</th><th className="ps-conf-th">{t('auditLog.statusLabels.pending')}</th></tr></thead>
            <tbody>
              {scopedPending.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>{t('intraopLinkageTab.noPendingMessage')}</td></tr>}
              {scopedPending.map(e => (
                <tr key={e.id} className="ps-conf-tr-clickable" onClick={() => navigate('/intraop-queue')}>
                  <td className="ps-conf-td">{e.id}</td>
                  <td className="ps-conf-td">{e.performedBy.userName}</td>
                  <td className="ps-conf-td">{e.orNumber}</td>
                  <td className="ps-conf-td">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className={`ps-conf-td${hoursSince(e.createdAt) > 24 ? ' ps-conf-td--high-severity' : ''}`}>{hoursSince(e.createdAt)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('intraopLinkageTab.mergedBanner', { count: scopedMerged.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead><tr><th className="ps-conf-th">{t('intraopLinkageTab.entryHeader')}</th><th className="ps-conf-th">{t('qualityAssurance.common.case')}</th><th className="ps-conf-th">{t('intraopLinkageTab.mergedAtHeader')}</th><th className="ps-conf-th">{t('intraopLinkageTab.performedByHeader')}</th><th className="ps-conf-th">{t('qualityAssurance.common.resolution')}</th></tr></thead>
            <tbody>
              {scopedMerged.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>{t('intraopLinkageTab.noMergedMessage')}</td></tr>}
              {scopedMerged.map(e => {
                const log = e.mergedIntoCaseId ? logForCase(e.mergedIntoCaseId) : undefined;
                return (
                  <tr key={e.id} className="ps-conf-tr-clickable" onClick={() => e.mergedIntoCaseId && navigate(`/case/${e.mergedIntoCaseId}/synoptic`)}>
                    <td className="ps-conf-td">{e.id}</td>
                    <td className="ps-conf-td">{e.mergedIntoCaseId}</td>
                    <td className="ps-conf-td">{e.mergedAt ? new Date(e.mergedAt).toLocaleString() : ''}</td>
                    <td className="ps-conf-td">{e.performedBy.userName}</td>
                    <td className="ps-conf-td">{log?.detail ?? <span className="ps-conf-td--muted-italic">{t('intraopLinkageTab.noAuditRecordNote')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
};
