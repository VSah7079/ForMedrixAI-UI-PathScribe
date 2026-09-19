// src/components/QualityAssurance/FppeTrackingTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Department-wide FPPE oversight — separate from the resident/attending
// Countersign Turnaround tab, since these represent genuinely different
// audiences and regulatory contexts (Joint Commission credentialing
// verification for new hires, not ACGME trainee milestones). Real data
// from fppeAssignmentService — active assignments, their real progress
// toward the configured end condition, and completed ones with how they
// actually concluded.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { fppeAssignmentService, subspecialtyService } from '@/services';
import type { Subspecialty } from '@/services';
import type { FppeAssignment } from '@/types/case/FppeAssignment';
import { exportQaReportRows } from './qaReportUtils';

export const FppeTrackingTab: React.FC = () => {
  const [assignments, setAssignments] = useState<FppeAssignment[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fppeAssignmentService.getAll(), subspecialtyService.getAll()]).then(([aRes, sRes]) => {
      if (aRes.ok) setAssignments(aRes.data);
      if (sRes.ok) setSubspecialties(sRes.data);
      setLoading(false);
    });
  }, []);

  const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : 'All subspecialties';
  const progressPercent = (a: FppeAssignment): number | null => {
    const daysSince = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
    if (a.endCondition.type === 'case_count') return Math.min(100, (a.casesReviewedCount / a.endCondition.threshold) * 100);
    if (a.endCondition.type === 'duration_days') return Math.min(100, (daysSince / a.endCondition.threshold) * 100);
    const byCases = a.casesReviewedCount / a.endCondition.caseCountThreshold;
    const byDuration = daysSince / a.endCondition.durationDaysThreshold;
    return Math.min(100, Math.max(byCases, byDuration) * 100);
  };

  const active = assignments.filter(a => a.status === 'active');
  const completed = assignments.filter(a => a.status === 'completed');
  const overdue = active.filter(a => (progressPercent(a) ?? 0) >= 100); // hit the threshold but not yet formally graduated

  const handleExport = () => {
    const rows = assignments.map(a => ({
      'Provisional Hire': a.provisionalUserName,
      'Proctor': a.proctorUserName,
      'Scope': subspecialtyName(a.subspecialtyId),
      'Status': a.status,
      'Cases Reviewed': a.casesReviewedCount,
      'Started At': a.startedAt,
      'Completed At': a.completedAt ?? '',
      'Completion Reason': a.completedReason ?? '',
      'Progress %': progressPercent(a)?.toFixed(0) ?? '',
    }));
    exportQaReportRows(rows, `fppe-tracking-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-loading">Loading FPPE assignments…</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <div />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>Export</button>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{active.length}</div><div className="ps-qa-tile-label">Active Assignments</div></div>
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{completed.length}</div><div className="ps-qa-tile-label">Completed</div></div>
        <div className="ps-qa-tile" style={overdue.length > 0 ? { borderColor: '#f59e0b' } : undefined}>
          <div className="ps-qa-tile-value" style={overdue.length > 0 ? { color: '#f59e0b' } : undefined}>{overdue.length}</div>
          <div className="ps-qa-tile-label">Threshold Reached — Needs Formal Graduation</div>
        </div>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Active ({active.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Provisional Hire</th><th className="ps-conf-th">Proctor</th><th className="ps-conf-th">Scope</th><th className="ps-conf-th">Cases Reviewed</th><th className="ps-conf-th">Progress</th><th className="ps-conf-th">Started</th></tr></thead>
          <tbody>
            {active.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>No active FPPE assignments.</td></tr>}
            {active.map(a => {
              const pct = progressPercent(a);
              return (
                <tr key={a.id}>
                  <td className="ps-conf-td">{a.provisionalUserName}</td>
                  <td className="ps-conf-td">{a.proctorUserName}</td>
                  <td className="ps-conf-td">{subspecialtyName(a.subspecialtyId)}</td>
                  <td className="ps-conf-td">{a.casesReviewedCount}</td>
                  <td className="ps-conf-td" style={pct !== null && pct >= 100 ? { color: '#f59e0b', fontWeight: 600 } : undefined}>{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                  <td className="ps-conf-td">{new Date(a.startedAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Completed ({completed.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Provisional Hire</th><th className="ps-conf-th">Proctor</th><th className="ps-conf-th">Cases Reviewed</th><th className="ps-conf-th">Completed</th><th className="ps-conf-th">Reason</th></tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>No completed FPPE assignments yet.</td></tr>}
            {completed.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{a.casesReviewedCount}</td>
                <td className="ps-conf-td">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</td>
                <td className="ps-conf-td">{a.completedReason === 'manually_graduated' ? 'Graduated early' : a.completedReason === 'case_count_met' ? 'Case count reached' : 'Duration elapsed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
