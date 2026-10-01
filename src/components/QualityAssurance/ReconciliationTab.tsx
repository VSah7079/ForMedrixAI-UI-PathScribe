// src/components/QualityAssurance/ReconciliationTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Department-wide Frozen-to-Permanent reconciliation reporting — renamed
// from DiscordanceTab.tsx alongside the DiscordanceRecord ->
// ReconciliationRecord rename (see that type's own header for the full
// reasoning: every reconciliation now writes a record, concordant or
// discordant, closing the missing-denominator gap for a real
// concordance-rate calculation).
//
// PHI note: exports here include frozenDx/finalDx (diagnosis text) since
// a reconciliation report is clinically meaningless without knowing what
// the two diagnoses were — standard for internal QA/M&M-style review
// records. What's still deliberately excluded, same as every other
// export in this feature: patient name, MRN, DOB. Case/accession ID
// stays in — necessary for the report to be actionable.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { qaActivityRecordService, auditService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import type { QaActivityRecord, QaDiscordanceDelta, QaDiscordanceSeverity, QaDiscordanceRootCause } from '@/types/quality/QaActivityRecord';
import type { FrozenCategory } from '@/types/intraop/IntraoperativeEntry';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { caseMatchesScope, exportQaReportRows, scopeLabel, QaScope, qaScopeContext } from './qaReportUtils';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '@/services';

// Real, persisted FrozenCategory enum values stay as data; only the
// displayed label is translated. Reuses the exact intraopQueue.
// specimenStep.category* keys already rendered for this same enum
// elsewhere in the app (same mapping as DiscordanceReconciliationModal.tsx).
const CATEGORY_LABEL_KEY: Record<FrozenCategory, string> = {
  benign: 'intraopQueue.specimenStep.categoryBenign',
  malignant: 'intraopQueue.specimenStep.categoryMalignant',
  atypical_suspicious: 'intraopQueue.specimenStep.categoryAtypical',
  deferred: 'intraopQueue.specimenStep.categoryDeferred',
};

// Real, persisted QaDiscordance* enum values — reuses the exact label
// keys DiscordanceReconciliationModal.tsx already established for the
// same three enums, rather than duplicating the translation content.
const DELTA_LABEL_KEY: Record<QaDiscordanceDelta, string> = {
  upgrade: 'discordanceReconciliationModal.delta.upgrade',
  downgrade: 'discordanceReconciliationModal.delta.downgrade',
  minor_variance: 'discordanceReconciliationModal.delta.minorVariance',
};
const SEVERITY_LABEL_KEY: Record<QaDiscordanceSeverity, string> = {
  low: 'discordanceReconciliationModal.severity.low',
  medium: 'discordanceReconciliationModal.severity.medium',
  high: 'discordanceReconciliationModal.severity.high',
};
const ROOT_CAUSE_LABEL_KEY: Record<QaDiscordanceRootCause, string> = {
  sampling_error: 'discordanceReconciliationModal.rootCause.samplingError',
  interpretation_error: 'discordanceReconciliationModal.rootCause.interpretationError',
  technical_artifact: 'discordanceReconciliationModal.rootCause.technicalArtifact',
  other: 'clientEditorModal.general.other',
};

export const ReconciliationTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [records, setRecords] = useState<QaActivityRecord[]>([]);
  const [caseClientById, setCaseClientById] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      auditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Reconciliation tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }
    Promise.all([
      // PS-113, Stage 4 — real migration from reconciliationService to
      // the new, generic mockQaActivityRecordService. This tab only
      // ever cares about Frozen vs Final correlation specifically, so
      // filters to that one real activity type - the service itself
      // is genuinely shared across activity types now.
      qaActivityRecordService.getAll(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant }),
    ]).then(([recRes, casesRes]) => {
      if (recRes.ok) setRecords(recRes.data.filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID));
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

  const discordant = scoped.filter(r => r.outcome === 'discordant');
  const concordant = scoped.filter(r => r.outcome === 'concordant');
  const highCount = discordant.filter(r => r.severity === 'high').length;
  const mediumCount = discordant.filter(r => r.severity === 'medium').length;
  const escalationCount = scoped.filter(r => r.escalationRequired).length;
  const teachingCount = scoped.filter(r => r.isTeachingOnboardingCase).length;

  // Real monthly concordance-rate trend, last 6 months — respects the
  // active Client/Enterprise scope like everything else on this tab.
  // Replaces the earlier "just hide the chart" fix: the actual problem
  // wasn't that a trend chart doesn't belong here, it's that the
  // deficiency-closure chart it inherited was the wrong metric for this
  // tab. This is the right one — concordance rate over time is exactly
  // what a QA reviewer would want to see trending on this specific page.
  const monthlyTrend = useMemo(() => {
    const months: { month: string; rate: number | null; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = scoped.filter(r => {
        const ts = new Date(r.recordedAt).getTime();
        return ts >= monthStart && ts < monthEnd;
      });
      const monthConcordant = inMonth.filter(r => r.outcome === 'concordant').length;
      months.push({
        month: monthKey,
        rate: inMonth.length > 0 ? +((monthConcordant / inMonth.length) * 100).toFixed(1) : null,
        total: inMonth.length,
      });
    }
    return months;
  }, [scoped]);
  // Real rate now — a true denominator exists because every
  // reconciliation writes a record (concordant included), not just the
  // ones that found a problem. Previously impossible to compute at all;
  // see ReconciliationRecord.ts's header for the full history.
  const concordanceRate = scoped.length > 0 ? (concordant.length / scoped.length) * 100 : null;

  const handleExport = () => {
    // CSV export headers and content stay in English — persisted/
    // exported data, not on-screen UI (this sweep's established rule).
    const rows = scoped.map(r => ({
      'Case': r.caseId,
      'Specimen Type': r.caseType,
      'Outcome': r.outcome,
      'Frozen Category': String(r.fieldValues.frozenCategory ?? ''),
      'Final Category': String(r.fieldValues.finalCategory ?? ''),
      'Frozen Dx': String(r.fieldValues.frozenDx ?? ''),
      'Final Dx': String(r.fieldValues.finalDx ?? ''),
      'Delta': r.delta ?? '',
      'Severity': r.severity ?? '',
      'Root Cause': r.rootCause ?? '',
      'Root Cause Note': r.rootCauseNote ?? '',
      'Comments': r.comments ?? '',
      'Escalation Required': r.escalationRequired ? 'Yes' : 'No',
      'Teaching Case': r.isTeachingOnboardingCase ? 'Yes' : 'No',
      'Drafted By': r.draftedBy?.userName ?? '',
      'Attending Feedback': r.reviewerFeedback ?? '',
      'Recorded At': r.recordedAt,
      'Recorded By': r.recordedBy.userName,
    }));
    void exportQaReportRows('qa:reconciliation:export', rows, `reconciliation-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`, qaScopeContext(scope));
  };

  if (loading) return <div className="ps-conf-loading">{t('reconciliationTab.loading')}</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={visibleClientIds} />
        <CapabilityButton capability="qa:reconciliation:export" context={qaScopeContext(scope)} className="ps-conf-btn-secondary" onClick={handleExport}>{t('common.export')}</CapabilityButton>
      </div>

      <div className="ps-defic-trend-card">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} unit="%" />
            <Tooltip content={({ active, payload, label }: TooltipContentProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload;
              return (
                <div className="ps-tat-trend__tooltip">
                  <div className="ps-tat-trend__tooltip-header">{label}</div>
                  {point?.rate !== null
                    ? <div className="ps-tat-trend__tooltip-footer--good">{t('reconciliationTab.tooltip.concordance', { rate: point.rate, count: point.total })}</div>
                    : <div className="ps-defic-trend-tooltip-empty">{t('reconciliationTab.tooltip.noData')}</div>}
                </div>
              );
            }} />
            <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{concordanceRate !== null ? `${concordanceRate.toFixed(1)}%` : '—'}</div>
          <div className="ps-qa-tile-label">{t('reconciliationTab.tile.concordanceRate')}</div>
        </div>
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{scoped.length}</div><div className="ps-qa-tile-label">{t('reconciliationTab.tile.totalReconciliations')}</div></div>
        <div className={`ps-qa-tile${highCount > 0 ? ' ps-qa-tile--alert' : ''}`}>
          <div className={`ps-qa-tile-value${highCount > 0 ? ' ps-qa-tile-value--alert' : ''}`}>{highCount}</div>
          <div className="ps-qa-tile-label">{t('reconciliationTab.tile.highSeverityDiscordances')}</div>
        </div>
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{mediumCount}</div><div className="ps-qa-tile-label">{t('reconciliationTab.tile.mediumSeverityDiscordances')}</div></div>
        <div className={`ps-qa-tile${escalationCount > 0 ? ' ps-qa-tile--alert' : ''}`}>
          <div className={`ps-qa-tile-value${escalationCount > 0 ? ' ps-qa-tile-value--alert' : ''}`}>{escalationCount}</div>
          <div className="ps-qa-tile-label">{t('reconciliationTab.tile.requiringEscalation')}</div>
        </div>
        <div className="ps-qa-tile"><div className="ps-qa-tile-value">{teachingCount}</div><div className="ps-qa-tile-label">{t('reconciliationTab.tile.teachingCases')}</div></div>
      </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('reconciliationTab.discordantBanner', { count: discordant.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead>
              <tr>
                <th className="ps-conf-th">{t('qualityAssurance.common.case')}</th><th className="ps-conf-th">{t('qualityAssurance.common.type')}</th><th className="ps-conf-th">{t('reconciliationTab.frozenToFinalHeader')}</th>
                <th className="ps-conf-th">{t('discordanceReconciliationModal.deltaLabel')}</th><th className="ps-conf-th">{t('qualityAssurance.common.severity')}</th><th className="ps-conf-th">{t('qualityAssurance.modals.resolve.rootCause')}</th>
                <th className="ps-conf-th">{t('reconciliationTab.recordedByHeader')}</th><th className="ps-conf-th">{t('reconciliationTab.recordedAtHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {discordant.length === 0 && <tr><td className="ps-conf-td" colSpan={8}>{t('reconciliationTab.noDiscordant')}</td></tr>}
              {discordant.map(r => (
                <tr key={r.id} className="ps-conf-tr-clickable" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>
                  <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
                  <td className="ps-conf-td">{r.caseType}</td>
                  <td className="ps-conf-td">{t(CATEGORY_LABEL_KEY[r.fieldValues.frozenCategory as FrozenCategory])} → {t(CATEGORY_LABEL_KEY[r.fieldValues.finalCategory as FrozenCategory])}</td>
                  <td className="ps-conf-td">{r.delta ? t(DELTA_LABEL_KEY[r.delta]) : ''}</td>
                  <td className={`ps-conf-td${r.severity === 'high' ? ' ps-conf-td--high-severity' : ''}`}>{r.severity ? t(SEVERITY_LABEL_KEY[r.severity]) : ''}</td>
                  <td className="ps-conf-td">{r.rootCause ? t(ROOT_CAUSE_LABEL_KEY[r.rootCause]) : ''}</td>
                  <td className="ps-conf-td">{r.recordedBy.userName}</td>
                  <td className="ps-conf-td">{new Date(r.recordedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('reconciliationTab.concordantBanner', { count: concordant.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
            <thead><tr><th className="ps-conf-th">{t('qualityAssurance.common.case')}</th><th className="ps-conf-th">{t('qualityAssurance.common.type')}</th><th className="ps-conf-th">{t('containerTypesSection.headers.category')}</th><th className="ps-conf-th">{t('reconciliationTab.recordedByHeader')}</th><th className="ps-conf-th">{t('reconciliationTab.recordedAtHeader')}</th></tr></thead>
            <tbody>
              {concordant.length === 0 && <tr><td className="ps-conf-td" colSpan={5}>{t('reconciliationTab.noConcordant')}</td></tr>}
              {concordant.slice(0, 25).map(r => (
                <tr key={r.id} className="ps-conf-tr-clickable" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>
                  <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
                  <td className="ps-conf-td">{r.caseType}</td>
                  <td className="ps-conf-td">{t(CATEGORY_LABEL_KEY[r.fieldValues.finalCategory as FrozenCategory])}</td>
                  <td className="ps-conf-td">{r.recordedBy.userName}</td>
                  <td className="ps-conf-td">{new Date(r.recordedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {concordant.length > 25 && (
                <tr><td className="ps-conf-td ps-conf-td--muted-italic" colSpan={5}>{t('reconciliationTab.moreRows', { count: concordant.length - 25 })}</td></tr>
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
};
