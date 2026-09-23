// src/components/QualityAssurance/FppeTrackingTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Department-wide FPPE oversight — separate from the resident/attending
// Countersign Turnaround tab, since these represent genuinely different
// audiences and regulatory contexts (Joint Commission credentialing
// verification for new hires, not ACGME trainee milestones). Real data
// from fppeAssignmentService — active assignments, their real progress
// toward the configured end condition, and completed ones with how they
// actually concluded.
//
// i18n note: `a.completedReason` is a real, persisted enum value —
// its display text below reuses the identical, already-translated
// strings from the admin-config counterpart, `fppeAssignmentsSection`
// (`Config/System/`), which also supplies almost every other label on
// this page (same real FPPE assignment concept, admin vs. tracking
// views). CSV export headers in `handleExport` stay literal English
// (persisted/exported data).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fppeAssignmentService, subspecialtyService } from '@/services';
import type { Subspecialty } from '@/services';
import type { FppeAssignment } from '@/types/case/FppeAssignment';
import { exportQaReportRows } from './qaReportUtils';

export const FppeTrackingTab: React.FC = () => {
  const { t } = useTranslation();
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

  const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : t('fppeAssignmentsSection.form.allSubspecialties');
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

  if (loading) return <div className="ps-conf-loading">{t('fppeAssignmentsSection.loading')}</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <div />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>{t('qualityAssurance.common.export')}</button>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{active.length}</div><div className="ps-qa-tile-label">{t('fppeTrackingTab.tileActiveAssignments')}</div></div>
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{completed.length}</div><div className="ps-qa-tile-label">{t('fppeAssignmentsSection.table.headers.completed')}</div></div>
        <div className="ps-qa-tile" style={overdue.length > 0 ? { borderColor: '#f59e0b' } : undefined}>
          <div className="ps-qa-tile-value" style={overdue.length > 0 ? { color: '#f59e0b' } : undefined}>{overdue.length}</div>
          <div className="ps-qa-tile-label">{t('fppeTrackingTab.tileThresholdReached')}</div>
        </div>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{t('fppeAssignmentsSection.banners.active', { count: active.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">{t('fppeAssignmentsSection.form.provisionalHireLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.form.proctorLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.scope')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.casesReviewed')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.progress')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.started')}</th></tr></thead>
          <tbody>
            {active.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>{t('fppeAssignmentsSection.table.emptyActiveGlobal')}</td></tr>}
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
        <span style={{ fontWeight: 600 }}>{t('fppeAssignmentsSection.banners.completed', { count: completed.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">{t('fppeAssignmentsSection.form.provisionalHireLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.form.proctorLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.casesReviewed')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.completed')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.reason')}</th></tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>{t('fppeAssignmentsSection.table.emptyCompletedGlobal')}</td></tr>}
            {completed.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{a.casesReviewedCount}</td>
                <td className="ps-conf-td">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</td>
                <td className="ps-conf-td">
                  {a.completedReason === 'manually_graduated'
                    ? t('fppeAssignmentsSection.table.completedReason.graduatedEarly')
                    : a.completedReason === 'case_count_met'
                      ? t('fppeAssignmentsSection.form.endConditionCaseCount')
                      : t('fppeAssignmentsSection.form.endConditionDuration')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
