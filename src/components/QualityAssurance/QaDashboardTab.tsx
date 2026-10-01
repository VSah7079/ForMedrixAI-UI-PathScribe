// src/components/QualityAssurance/QaDashboardTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-108, Story 5.1/5.2 — the real, cross-specialty QA Dashboard: every real
// QA activity this app's generic QA Activity Engine (PS-113/PS-117) has ever
// recorded a review against, rolled up by activity type, organ system
// (Subspecialty), and reviewer — not scoped to one domain the way
// CytologyQaTab.tsx's own reports are. See
// resolveQaActivityDashboardReport.ts's own header for the honest, disclosed
// scope note on why this reports discordance/concordance rate and volume
// trend rather than a fabricated "completion rate" this app's real data
// model has no denominator for.
//
// Same real .ps-conf-table/.ps-conf-card visual language and recharts trend
// pattern QualityAssurancePage.tsx's own CAPA trend chart and
// EnterpriseRollupTab.tsx already use — reused directly, not a new,
// competing dashboard style.
//
// i18n note: the CSV export headers (`handleExport`'s `rows` object keys)
// and the audit-log `detail` string stay literal English — persisted/
// exported data, not on-screen UI. `r.name` (activity type/subspecialty/
// reviewer names) is real data too.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { auditService } from '@/services';
import { resolveQaActivityDashboardReport, type QaActivityDashboardReport, type QaDashboardGroupRow } from '@/services/quality/resolveQaActivityDashboardReport';
import { exportQaReportRows, qaScopeContext } from './qaReportUtils';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { qaActivityRecordService, qaActivityTypeService, subspecialtyService } from '@/services';

const pct = (n: number) => `${n.toFixed(1)}%`;

const EMPTY_REPORT: QaActivityDashboardReport = {
  totalRecords: 0, concordantCount: 0, discordantCount: 0, overallConcordantPercent: 0, escalationRequiredCount: 0,
  byActivityType: [], bySubspecialty: [], byReviewer: [], monthlyTrend: [],
};

const GroupTable: React.FC<{ title: string; rows: QaDashboardGroupRow[]; leadColumnLabel: string }> = ({ title, rows, leadColumnLabel }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-conf-card ps-conf-card--spaced">
      <div className="ps-conf-card-title">{title}</div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{leadColumnLabel}</th>
                <th className="ps-conf-th">{t('qaDashboardTab.tableHeaders.total')}</th>
                <th className="ps-conf-th">{t('auditLog.statusLabels.concordant')}</th>
                <th className="ps-conf-th">{t('auditLog.statusLabels.discordant')}</th>
                <th className="ps-conf-th">{t('qaDashboardTab.tableHeaders.concordance')}</th>
                <th className="ps-conf-th">{t('qaDashboardTab.tableHeaders.mandatoryFollowUp')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{r.name}</td>
                  <td className="ps-conf-td">{r.total}</td>
                  <td className="ps-conf-td">{r.concordant}</td>
                  <td className={`ps-conf-td${r.discordant > 0 ? ' ps-qa-dashboard-discordant-cell' : ''}`}>{r.discordant}</td>
                  <td className="ps-conf-td">{pct(r.concordantPercent)}</td>
                  <td className="ps-conf-td">{r.escalationRequiredCount || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>{t('qaDashboardTab.tableHeaders.emptyState')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const QaDashboardTab: React.FC = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState<QaActivityDashboardReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      auditService.logEvent({
        type: 'system', event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: QA Dashboard tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown', caseId: null, confidence: null,
      }).catch(() => {});
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      qaActivityRecordService.getAll(),
      qaActivityTypeService.getAll(),
      subspecialtyService.getAll(),
    ]).then(([recordsRes, typesRes, subspecialtiesRes]) => {
      if (cancelled) return;
      if (recordsRes.ok && typesRes.ok && subspecialtiesRes.ok) {
        setReport(resolveQaActivityDashboardReport(recordsRes.data, typesRes.data, subspecialtiesRes.data));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleExport = () => {
    const rows = report.byActivityType.map(r => ({
      'Activity Type': r.name, Total: r.total, Concordant: r.concordant, Discordant: r.discordant,
      'Concordance %': r.concordantPercent.toFixed(1), 'Mandatory Follow-Up': r.escalationRequiredCount,
    }));
    void exportQaReportRows('qa:activity-dashboard:export', rows, `qa-dashboard-by-activity-type-${new Date().toISOString().slice(0, 10)}.csv`, qaScopeContext());
  };

  if (loading) return <div className="ps-conf-page">{t('qaDashboardTab.loading')}</div>;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('qaDashboardTab.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('qaDashboardTab.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('qaDashboardTab.overallCard.title')}</div>
        <div className="ps-qa-dashboard-stats-row">
          <div><div className="ps-qa-dashboard-stat-value ps-qa-dashboard-stat-value--neutral">{report.totalRecords}</div><div className="ps-qa-dashboard-stat-label">{t('qaDashboardTab.overallCard.totalReviews')}</div></div>
          <div><div className="ps-qa-dashboard-stat-value ps-qa-dashboard-stat-value--concordance">{pct(report.overallConcordantPercent)}</div><div className="ps-qa-dashboard-stat-label">{t('qaDashboardTab.tableHeaders.concordance')}</div></div>
          <div><div className="ps-qa-dashboard-stat-value ps-qa-dashboard-stat-value--discordant">{report.discordantCount}</div><div className="ps-qa-dashboard-stat-label">{t('auditLog.statusLabels.discordant')}</div></div>
          <div><div className="ps-qa-dashboard-stat-value ps-qa-dashboard-stat-value--warning">{report.escalationRequiredCount}</div><div className="ps-qa-dashboard-stat-label">{t('qaDashboardTab.tableHeaders.mandatoryFollowUp')}</div></div>
        </div>
      </div>

      <div className="ps-defic-trend-card ps-mb-16">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={report.monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={({ active, payload, label }: TooltipContentProps<number, string>) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="ps-tat-trend__tooltip">
                  <div className="ps-tat-trend__tooltip-header">{label}</div>
                  <div>{t('qaDashboardTab.tooltip.total', { value: payload[0]?.payload?.total ?? 0 })}</div>
                  <div className="ps-qa-dashboard-tooltip-discordant">{t('qaDashboardTab.tooltip.discordant', { value: payload[0]?.payload?.discordant ?? 0 })}</div>
                </div>
              );
            }} />
            <Line type="monotone" dataKey="total" stroke="#0891B2" strokeWidth={2.5} dot={{ r: 3, fill: '#0891B2', strokeWidth: 0 }} />
            <Line type="monotone" dataKey="discordant" stroke="#f87171" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2, fill: '#f87171', strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ps-qa-tab-toolbar">
        <CapabilityButton capability="qa:activity-dashboard:export" context={qaScopeContext()} className="ps-conf-btn-secondary" onClick={handleExport}>{t('qaDashboardTab.exportButton')}</CapabilityButton>
      </div>

      <GroupTable title={t('qaDashboardTab.sections.byActivityType')} rows={report.byActivityType} leadColumnLabel={t('qaDashboardTab.leadColumns.activityType')} />
      <GroupTable title={t('qaDashboardTab.sections.byOrganSystem')} rows={report.bySubspecialty} leadColumnLabel={t('qaDashboardTab.leadColumns.organSystem')} />
      <GroupTable title={t('qaDashboardTab.sections.byReviewer')} rows={report.byReviewer} leadColumnLabel={t('cytologyQaTab.secondaryScreeningTable.reviewer')} />
    </div>
  );
};
