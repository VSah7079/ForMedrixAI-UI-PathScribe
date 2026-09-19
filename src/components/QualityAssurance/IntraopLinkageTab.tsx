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
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
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
        const t = new Date(e.mergedAt).getTime();
        return t >= monthStart && t < monthEnd;
      });
      const avgHours = inMonth.length > 0
        ? +(inMonth.reduce((s, e) => s + (new Date(e.mergedAt!).getTime() - new Date(e.createdAt).getTime()) / 3600000, 0) / inMonth.length).toFixed(1)
        : null;
      months.push({ month: monthKey, avgHours, total: inMonth.length });
    }
    return months;
  }, [scopedMerged]);

  const handleExport = () => {
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

  if (loading) return <div className="ps-conf-loading">Loading intraoperative linkage data…</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={visibleClientIds} />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>Export</button>
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
                    ? <div style={{ color: '#0891B2' }}>Avg linkage TAT: {point.avgHours}h ({point.total} merged)</div>
                    : <div style={{ color: '#64748b' }}>No merges this month</div>}
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
          <div className="ps-qa-tile-label">Merged</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{scopedPending.length}</div>
          <div className="ps-qa-tile-label">Pending Linkage</div>
        </div>
        <div className="ps-qa-tile" style={overduePending.length > 0 ? { borderColor: '#f87171' } : undefined}>
          <div className="ps-qa-tile-value" style={overduePending.length > 0 ? { color: '#f87171' } : undefined}>{overduePending.length}</div>
          <div className="ps-qa-tile-label">Pending &gt; 24h</div>
        </div>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Pending Linkage ({scopedPending.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead><tr><th className="ps-conf-th">Entry</th><th className="ps-conf-th">Performed By</th><th className="ps-conf-th">OR</th><th className="ps-conf-th">Created</th><th className="ps-conf-th">Pending</th></tr></thead>
            <tbody>
              {scopedPending.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>Nothing pending — every intraop entry has been linked to a case.</td></tr>}
              {scopedPending.map(e => (
                <tr key={e.id} className="ps-conf-tr-clickable" onClick={() => navigate('/intraop-queue')}>
                  <td className="ps-conf-td">{e.id}</td>
                  <td className="ps-conf-td">{e.performedBy.userName}</td>
                  <td className="ps-conf-td">{e.orNumber}</td>
                  <td className="ps-conf-td">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="ps-conf-td" style={hoursSince(e.createdAt) > 24 ? { color: '#f87171', fontWeight: 600 } : undefined}>{hoursSince(e.createdAt)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Merged ({scopedMerged.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead><tr><th className="ps-conf-th">Entry</th><th className="ps-conf-th">Case</th><th className="ps-conf-th">Merged At</th><th className="ps-conf-th">Performed By</th><th className="ps-conf-th">Resolution</th></tr></thead>
            <tbody>
              {scopedMerged.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>No merged entries in this scope yet.</td></tr>}
              {scopedMerged.map(e => {
                const log = e.mergedIntoCaseId ? logForCase(e.mergedIntoCaseId) : undefined;
                return (
                  <tr key={e.id} className="ps-conf-tr-clickable" onClick={() => e.mergedIntoCaseId && navigate(`/case/${e.mergedIntoCaseId}/synoptic`)}>
                    <td className="ps-conf-td">{e.id}</td>
                    <td className="ps-conf-td">{e.mergedIntoCaseId}</td>
                    <td className="ps-conf-td">{e.mergedAt ? new Date(e.mergedAt).toLocaleString() : ''}</td>
                    <td className="ps-conf-td">{e.performedBy.userName}</td>
                    <td className="ps-conf-td">{log?.detail ?? <span style={{ color: '#64748b', fontStyle: 'italic' }}>no audit record (merged before resolution logging)</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
};
