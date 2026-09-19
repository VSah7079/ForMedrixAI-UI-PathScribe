// src/components/QualityAssurance/AccessRequestResponseTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Do we Track the request to gain
// access? I would think that would be a good quality metric. How long
// did the Admins take, Do we generate a ticket system that has its own
// status. (Quality Assurance Tab)." The department-wide equivalent of
// what "My Contribution" shows one Admin at a time (see
// qualityCalculations.ts's own computeAccessRequestResponseOutliers) —
// same real relationship CountersignTurnaroundTab has to its own
// per-resident "My Contribution" figure. Real turnaround time
// (resolvedAt - requestedAt), across all three real request types
// (Pediatric, Pool, Orchestration).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { accessRequestService } from '@/services';
import type { AccessRequest } from '@/types/access/AccessRequest';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { exportQaReportRows, scopeLabel, QaScope } from './qaReportUtils';

const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;

const TYPE_LABELS: Record<AccessRequest['type'], string> = {
  pediatric: 'Pediatric',
  pool: 'Pool',
  orchestration: 'Orchestration',
};

/** AccessRequest doesn't share Case's shape (order.facilityId /
 *  originHospitalId), so this scopes directly against its own real
 *  fields rather than forcing it through caseMatchesScope. Pool and
 *  Orchestration requests have no real facilityId (neither is tied to
 *  a referring facility) — only match a 'client' scope for Pediatric,
 *  which genuinely has one. */
function accessRequestMatchesScope(r: AccessRequest, scope: QaScope): boolean {
  if (scope.level === 'enterprise') return true;
  if (scope.level === 'client') return r.facilityId === scope.clientId;
  return r.organisationId === scope.organisationId;
}

export const AccessRequestResponseTab: React.FC = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accessRequestService.getAll().then(res => {
      if (res.ok) setRequests(res.data);
      setLoading(false);
    });
  }, []);

  const scoped = useMemo(
    () => requests.filter(r => accessRequestMatchesScope(r, scope)),
    [requests, scope]
  );

  const visibleClientIds = useMemo(
    () => Array.from(new Set(scoped.map(r => r.facilityId).filter((v): v is string => !!v))),
    [scoped]
  );

  const resolved = scoped.filter(r => r.status !== 'pending' && r.resolvedAt);
  const pending = scoped.filter(r => r.status === 'pending');
  const avgTurnaroundHours = resolved.length > 0
    ? resolved.reduce((s, r) => s + hoursBetween(r.requestedAt, r.resolvedAt!), 0) / resolved.length
    : null;
  const grantedCount = scoped.filter(r => r.status === 'granted').length;
  const deniedCount = scoped.filter(r => r.status === 'denied').length;

  // Real monthly turnaround trend, last 6 months — same pattern as the
  // other QA tabs' trend charts.
  const monthlyTrend = useMemo(() => {
    const months: { month: string; avgHours: number | null; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = resolved.filter(r => {
        const t = new Date(r.resolvedAt!).getTime();
        return t >= monthStart && t < monthEnd;
      });
      const avgHours = inMonth.length > 0
        ? +(inMonth.reduce((s, r) => s + hoursBetween(r.requestedAt, r.resolvedAt!), 0) / inMonth.length).toFixed(1)
        : null;
      months.push({ month: monthKey, avgHours, total: inMonth.length });
    }
    return months;
  }, [resolved]);

  const handleExport = () => {
    const rows = scoped.map(r => ({
      'Type': TYPE_LABELS[r.type],
      'Requested By': r.requestingUserName,
      'Case': r.caseId ?? '',
      'Status': r.status,
      'Requested At': r.requestedAt,
      'Resolved At': r.resolvedAt ?? '',
      'Turnaround Hours': r.resolvedAt ? hoursBetween(r.requestedAt, r.resolvedAt).toFixed(1) : '',
      'Resolved By': r.resolvedByUserName ?? '',
    }));
    exportQaReportRows(rows, `access-request-response-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-loading">Loading access request data…</div>;

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
                    ? <div style={{ color: '#38bdf8' }}>Avg turnaround: {point.avgHours}h ({point.total} resolved)</div>
                    : <div style={{ color: '#64748b' }}>No requests resolved this month</div>}
                </div>
              );
            }} />
            <Line type="monotone" dataKey="avgHours" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{avgTurnaroundHours !== null ? `${avgTurnaroundHours.toFixed(1)}h` : '—'}</div>
          <div className="ps-qa-tile-label">Avg Turnaround</div>
        </div>
        <div className="ps-qa-tile" style={pending.length > 0 ? { borderColor: '#f59e0b' } : undefined}>
          <div className="ps-qa-tile-value" style={pending.length > 0 ? { color: '#f59e0b' } : undefined}>{pending.length}</div>
          <div className="ps-qa-tile-label">Pending</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{grantedCount}</div>
          <div className="ps-qa-tile-label">Granted</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{deniedCount}</div>
          <div className="ps-qa-tile-label">Denied</div>
        </div>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Pending ({pending.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Type</th><th className="ps-conf-th">Requested By</th><th className="ps-conf-th">Case</th><th className="ps-conf-th">Requested At</th><th className="ps-conf-th">Waiting</th></tr></thead>
          <tbody>
            {pending.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>Nothing pending — every access request has been resolved.</td></tr>}
            {pending.map(r => (
              <tr key={r.id} className={r.caseId ? 'ps-conf-tr-clickable' : undefined} onClick={r.caseId ? () => navigate(`/case/${r.caseId}/synoptic`) : undefined}>
                <td className="ps-conf-td">{TYPE_LABELS[r.type]}</td>
                <td className="ps-conf-td">{r.requestingUserName}</td>
                <td className="ps-conf-td">{r.caseId ?? <span style={{ color: '#64748b', fontStyle: 'italic' }}>—</span>}</td>
                <td className="ps-conf-td">{new Date(r.requestedAt).toLocaleString()}</td>
                <td className="ps-conf-td">{hoursBetween(r.requestedAt, new Date().toISOString()).toFixed(1)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Resolved ({resolved.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Type</th><th className="ps-conf-th">Requested By</th><th className="ps-conf-th">Status</th>
              <th className="ps-conf-th">Turnaround</th><th className="ps-conf-th">Resolved By</th>
            </tr>
          </thead>
          <tbody>
            {resolved.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>No resolved requests in this scope yet.</td></tr>}
            {resolved.map(r => (
              <tr key={r.id} className={r.caseId ? 'ps-conf-tr-clickable' : undefined} onClick={r.caseId ? () => navigate(`/case/${r.caseId}/synoptic`) : undefined}>
                <td className="ps-conf-td">{TYPE_LABELS[r.type]}</td>
                <td className="ps-conf-td">{r.requestingUserName}</td>
                <td className="ps-conf-td" style={{ color: r.status === 'granted' ? '#34d399' : '#f87171' }}>{r.status}</td>
                <td className="ps-conf-td">{hoursBetween(r.requestedAt, r.resolvedAt!).toFixed(1)}h</td>
                <td className="ps-conf-td">{r.resolvedByUserName ?? <span style={{ color: '#64748b', fontStyle: 'italic' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
