// src/components/QualityAssurance/CountersignTurnaroundTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Department-wide countersign turnaround — the QA-page equivalent of what
// "My Contribution" shows one resident at a time. Real turnaround time
// (countersignedAt - releasedAt), real changed-field-count delta, real
// feedback text. Deliberately separate from the Intraoperative Linkage
// tab's TAT (frozen-to-merge) and the Reconciliation tab's concordance
// rate — this measures a third, genuinely different thing: how long a
// resident's released case actually sits before an attending reviews it.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { countersignService, auditService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import type { CountersignRecord } from '@/types/case/CountersignRecord';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { caseMatchesScope, exportQaReportRows, scopeLabel, QaScope } from './qaReportUtils';

const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;

export const CountersignTurnaroundTab: React.FC = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [records, setRecords] = useState<CountersignRecord[]>([]);
  const [caseClientById, setCaseClientById] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      auditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Countersign Turnaround tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }
    Promise.all([
      countersignService.getAll(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant }),
    ]).then(([recRes, casesRes]) => {
      if (recRes.ok) setRecords(recRes.data);
      if (casesRes.ok) {
        const map: Record<string, string | undefined> = {};
        casesRes.data.forEach((c) => { map[c.id] = c?.order?.facilityId; });
        setCaseClientById(map);
      }
      setLoading(false);
    });
  }, []);

  const scoped = useMemo(
    () => records.filter(r => caseMatchesScope({ order: { clientId: caseClientById[r.caseId] } }, scope)),
    [records, caseClientById, scope]
  );

  const visibleClientIds = useMemo(
    () => Array.from(new Set(Object.values(caseClientById).filter((v): v is string => !!v))),
    [caseClientById]
  );

  const countersigned = scoped.filter(r => r.status === 'countersigned' && r.countersignedAt);
  const pending = scoped.filter(r => r.status === 'pending');
  const avgTurnaroundHours = countersigned.length > 0
    ? countersigned.reduce((s, r) => s + hoursBetween(r.releasedAt, r.countersignedAt!), 0) / countersigned.length
    : null;
  const avgChangedFields = countersigned.length > 0
    ? countersigned.reduce((s, r) => s + (r.changedFieldCount ?? 0), 0) / countersigned.length
    : null;
  const withFeedbackCount = countersigned.filter(r => r.attendingFeedback).length;

  // Real monthly turnaround trend, last 6 months — same pattern as the
  // other two QA tabs' trend charts.
  const monthlyTrend = useMemo(() => {
    const months: { month: string; avgHours: number | null; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = countersigned.filter(r => {
        const t = new Date(r.countersignedAt!).getTime();
        return t >= monthStart && t < monthEnd;
      });
      const avgHours = inMonth.length > 0
        ? +(inMonth.reduce((s, r) => s + hoursBetween(r.releasedAt, r.countersignedAt!), 0) / inMonth.length).toFixed(1)
        : null;
      months.push({ month: monthKey, avgHours, total: inMonth.length });
    }
    return months;
  }, [countersigned]);

  const handleExport = () => {
    const rows = scoped.map(r => ({
      'Case': r.caseId,
      'Resident': r.residentName,
      'Attending': r.attendingName ?? '',
      'Status': r.status,
      'Released At': r.releasedAt,
      'Countersigned At': r.countersignedAt ?? '',
      'Turnaround Hours': r.countersignedAt ? hoursBetween(r.releasedAt, r.countersignedAt).toFixed(1) : '',
      'Changed Fields': r.changedFieldCount ?? '',
      'Attending Feedback': r.attendingFeedback ?? '',
    }));
    exportQaReportRows(rows, `countersign-turnaround-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-loading">Loading countersign data…</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={visibleClientIds} />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>Export</button>
      </div>

      <div className="ps-defic-trend-card">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                    ? <div style={{ color: '#a78bfa' }}>Avg turnaround: {point.avgHours}h ({point.total} countersigned)</div>
                    : <div style={{ color: '#64748b' }}>No countersigns this month</div>}
                </div>
              );
            }} />
            <Line type="monotone" dataKey="avgHours" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 3, fill: '#a78bfa', strokeWidth: 0 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{avgTurnaroundHours !== null ? `${avgTurnaroundHours.toFixed(1)}h` : '—'}</div>
          <div className="ps-qa-tile-label">Avg Turnaround</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{avgChangedFields !== null ? avgChangedFields.toFixed(1) : '—'}</div>
          <div className="ps-qa-tile-label">Avg Fields Changed</div>
        </div>
        <div className="ps-qa-tile" style={pending.length > 0 ? { borderColor: '#f59e0b' } : undefined}>
          <div className="ps-qa-tile-value" style={pending.length > 0 ? { color: '#f59e0b' } : undefined}>{pending.length}</div>
          <div className="ps-qa-tile-label">Pending Countersign</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{withFeedbackCount}</div>
          <div className="ps-qa-tile-label">With Feedback</div>
        </div>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Pending ({pending.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Case</th><th className="ps-conf-th">Resident</th><th className="ps-conf-th">Released At</th><th className="ps-conf-th">Waiting</th></tr></thead>
          <tbody>
            {pending.length === 0 && <tr><td className="ps-conf-td" colSpan={4}>Nothing pending — every released case has been countersigned.</td></tr>}
            {pending.map(r => (
              <tr key={r.id} className="ps-conf-tr-clickable" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>
                <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
                <td className="ps-conf-td">{r.residentName}</td>
                <td className="ps-conf-td">{new Date(r.releasedAt).toLocaleString()}</td>
                <td className="ps-conf-td">{hoursBetween(r.releasedAt, new Date().toISOString()).toFixed(1)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Countersigned ({countersigned.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Case</th><th className="ps-conf-th">Resident</th><th className="ps-conf-th">Attending</th>
              <th className="ps-conf-th">Turnaround</th><th className="ps-conf-th">Fields Changed</th><th className="ps-conf-th">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {countersigned.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>No countersigned records in this scope yet.</td></tr>}
            {countersigned.map(r => (
              <tr key={r.id} className="ps-conf-tr-clickable" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>
                <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
                <td className="ps-conf-td">{r.residentName}</td>
                <td className="ps-conf-td">{r.attendingName}</td>
                <td className="ps-conf-td">{hoursBetween(r.releasedAt, r.countersignedAt!).toFixed(1)}h</td>
                <td className="ps-conf-td">{r.changedFieldCount ?? 0}</td>
                <td className="ps-conf-td">{r.attendingFeedback ?? <span style={{ color: '#64748b', fontStyle: 'italic' }}>none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
