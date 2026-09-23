// src/components/QualityAssurance/CytologyQaTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the aggregate QA dashboard this module's
// own README (services/cytology/) has flagged as a real, deliberate
// gap since Phase 5 — the per-comparison classification engine
// (classifyCytologyAgreement.ts) and the three named report resolvers
// built on it (resolveCytologyQaReports.ts) already existed and were
// already tested; nothing had ever rendered them. Same real scope-
// switching and cross-tenant audit pattern this page's own other real
// tabs already use (ReconciliationTab.tsx) — reused directly, not
// reinvented.
//
// PHI note, same posture as this page's own established convention:
// case/accession identifiers are shown (necessary for the report to
// be actionable), patient name/MRN/DOB are not.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockCytologyQaReportService } from '@/services/cytology/mockCytologyQaReportService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { auditService } from '@/services';
import type { RegistryId } from '@/services/facilities/IRegistrySettingsService';
import type { CytologyQaAggregateReport } from '@/services/cytology/resolveCytologyQaAggregateReport';
import type { CytologyCtStatisticalComparisonRow } from '@/services/cytology/resolveCytologyCtStatisticalComparisonReport';
import type { CytologyAscusHpvReflexRow } from '@/services/cytology/resolveCytologyAscusHpvReflexReport';
import type { CytologyWorkloadTrackingRow } from '@/services/cytology/resolveCytologyWorkloadTrackingReport';
import type { CytologyRegistryTransmissionAuditRow } from '@/services/cytology/resolveCytologyRegistryTransmissionAuditReport';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { CytologyHistologyCorrelationReport } from '@/services/cytology/resolveCytologyHistologyCorrelationReport';
import type { CytologyUnscreenedBacklogRow } from '@/services/cytology/resolveCytologyUnscreenedBacklogReport';
import type { CytologyPrimaryHpvFailsafeAuditRow } from '@/services/cytology/resolveCytologyPrimaryHpvFailsafeAuditReport';
import type { CytologyEuComplianceMatrixRow } from '@/services/cytology/resolveCytologyEuComplianceMatrixReport';
import type { CytologyHpvPositivityMonitorRow } from '@/services/cytology/resolveCytologyHpvPositivityMonitorReport';
import type { CytologyMolecularQcFailureRateRow } from '@/services/cytology/resolveCytologyMolecularQcFailureRateReport';
import type { CytologyMolecularLotToLotTrendRow } from '@/services/cytology/resolveCytologyMolecularLotToLotTrendReport';
import type { CytologyApacProficiencyTestReport } from '@/services/cytology/resolveCytologyApacProficiencyTestReport';
import { CytologyHistologyCorrelationPrintView } from './CytologyHistologyCorrelationPrintView';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { scopeLabel, exportQaReportRows, QaScope } from './qaReportUtils';

const pct = (n: number) => `${n.toFixed(1)}%`;
const num = (n: number, digits = 2) => n.toFixed(digits);

// Real, computed comparison-classification labels (classifyCytologyAgreement.ts's
// own output) — the underlying level value (c.level) is real, persisted
// classification data and is never touched; only the displayed badge
// text translates, via the same label-key indirection used for
// persisted enums throughout this sweep.
const LEVEL_LABEL: Record<string, { textKey: string; color: string }> = {
  exact: { textKey: 'cytologyQaTab.level.exact', color: '#10B981' },
  minor_discrepancy: { textKey: 'cytologyQaTab.level.minor', color: '#f59e0b' },
  major_discrepancy: { textKey: 'cytologyQaTab.level.major', color: '#ef4444' },
};

// Real, per direct guidance: "each report can get their own tile" —
// same real .ps-wl-filter-tile pattern the parent QualityAssurancePage
// already uses for its own Operations/CAPA sub-navigation, reused
// directly rather than a second, competing tile style.
type CytologyQaReportKey = 'random' | 'high-risk' | 'ct-path' | 'peer-review' | 'ct-stats' | 'ascus-hpv' | 'workload' | 'transmission' | 'secondary-screening-audit' | 'histology-correlation' | 'unscreened-backlog' | 'uk-failsafe' | 'eu-compliance' | 'hpv-positivity' | 'mol-qc-failure' | 'mol-lot-trend' | 'apac-pt';

// Tile labels are UI chrome — icon kept as literal, text resolved via
// t() at render with labelKey below.
const REPORT_TILES: { key: CytologyQaReportKey; icon: string; labelKey: string; color: string }[] = [
  { key: 'random', icon: '🎲', labelKey: 'cytologyQaTab.tiles.random', color: '#009E73' },
  { key: 'high-risk', icon: '⚠️', labelKey: 'cytologyQaTab.tiles.highRisk', color: '#f59e0b' },
  { key: 'ct-path', icon: '⚖️', labelKey: 'cytologyQaTab.tiles.ctPath', color: '#38bdf8' },
  { key: 'peer-review', icon: '🔍', labelKey: 'cytologyQaTab.tiles.peerReview', color: '#14B8A6' },
  { key: 'ct-stats', icon: '📊', labelKey: 'cytologyQaTab.tiles.ctStats', color: '#8B5CF6' },
  { key: 'ascus-hpv', icon: '🧬', labelKey: 'cytologyQaTab.tiles.ascusHpv', color: '#EC4899' },
  { key: 'workload', icon: '⏱️', labelKey: 'cytologyQaTab.tiles.workload', color: '#261CE3' },
  { key: 'transmission', icon: '📡', labelKey: 'cytologyQaTab.tiles.transmission', color: '#0891B2' },
  { key: 'secondary-screening-audit', icon: '📋', labelKey: 'cytologyQaTab.tiles.secondaryScreeningAudit', color: '#DC2626' },
  { key: 'histology-correlation', icon: '🔬', labelKey: 'cytologyQaTab.tiles.histologyCorrelation', color: '#F472B6' },
  { key: 'unscreened-backlog', icon: '⏳', labelKey: 'cytologyQaTab.tiles.unscreenedBacklog', color: '#F97316' },
  { key: 'uk-failsafe', icon: '🇬🇧', labelKey: 'cytologyQaTab.tiles.ukFailsafe', color: '#7C3AED' },
  { key: 'eu-compliance', icon: '🇪🇺', labelKey: 'cytologyQaTab.tiles.euCompliance', color: '#0EA5E9' },
  { key: 'hpv-positivity', icon: '🦠', labelKey: 'cytologyQaTab.tiles.hpvPositivity', color: '#65A30D' },
  { key: 'mol-qc-failure', icon: '🧪', labelKey: 'cytologyQaTab.tiles.molQcFailure', color: '#B91C1C' },
  { key: 'mol-lot-trend', icon: '📈', labelKey: 'cytologyQaTab.tiles.molLotTrend', color: '#9333EA' },
  { key: 'apac-pt', icon: '🌏', labelKey: 'cytologyQaTab.tiles.apacPt', color: '#0891B2' },
];

// Real, per direct follow-up: "we don't see the records themselves" —
// the aggregate cards alone never let a real reviewer open the actual
// comparisons a percentage summarizes. Same real .ps-conf-table
// pattern this page's own Financials tables already use, not a new,
// competing table style.
const ComparisonDetailTable: React.FC<{ comparisons: CytologyQaAggregateReport['comparisons'] }> = ({ comparisons }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-conf-table-wrap ps-qa-table-wrap--spaced">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.case')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.comparisonTable.initialScreen')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.comparisonTable.followUpReview')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.comparisonTable.result')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.comparisonTable.adequacy')}</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => {
            const level = LEVEL_LABEL[c.level];
            const levelText = level ? t(level.textKey) : c.level;
            const levelColor = level ? level.color : '#9ca3af';
            return (
              <tr key={`${c.caseId}-${i}`} className="ps-conf-tr">
                <td className="ps-conf-td" data-phi="accession">{c.caseId}</td>
                <td className="ps-conf-td">
                  <div>{c.initialInterpretationLabel}</div>
                  <div className="ps-qa-subtext">{c.initialReviewerName ?? '—'}</div>
                </td>
                <td className="ps-conf-td">
                  <div>{c.followUpInterpretationLabel}</div>
                  <div className="ps-qa-subtext">{c.followUpReviewerName ?? '—'}</div>
                </td>
                <td className="ps-conf-td">
                  <span className="ps-qa-badge" style={{ '--qa-badge-color': levelColor } as React.CSSProperties}>
                    {levelText}{c.majorSubtype ? ` — ${c.majorSubtype.replace(/_/g, ' ')}` : ''}
                  </span>
                </td>
                <td className="ps-conf-td">{c.adequacyDiscrepancy ? t('cytologyQaTab.comparisonTable.discrepant') : '—'}</td>
              </tr>
            );
          })}
          {comparisons.length === 0 && (
            <tr><td className="ps-conf-empty-row" colSpan={5}>{t('cytologyQaTab.comparisonTable.noComparisonsYet')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
  );
};

const ReportCard: React.FC<{ titleKey: string; titleCode?: string; report: CytologyQaAggregateReport }> = ({ titleKey, titleCode, report }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-qa-report-card">
    <div className="ps-qa-report-card-title">{t(titleKey)}{titleCode ? ` (${titleCode})` : ''}</div>
    <div className="ps-qa-report-card-stats">
      <div>
        <div className="ps-qa-stat-value ps-qa-stat-value--teal">{pct(report.overallAgreementPercent)}</div>
        <div className="ps-qa-stat-label">{t('cytologyQaTab.reportCard.overallAgreement')}</div>
      </div>
      <div>
        <div className="ps-qa-stat-value ps-qa-stat-value--blue">{pct(report.majorConcordancePercent)}</div>
        <div className="ps-qa-stat-label">{t('cytologyQaTab.reportCard.majorConcordance')}</div>
      </div>
      <div>
        <div className="ps-qa-stat-value ps-qa-stat-value--plain">{report.totalCompared}</div>
        <div className="ps-qa-stat-label">{t('cytologyQaTab.reportCard.casesCompared')}</div>
      </div>
    </div>
    <div className="ps-qa-report-card-breakdown">
      <span>{t('cytologyQaTab.level.exact')}: <b className="ps-qa-breakdown-value">{report.exactCount}</b></span>
      <span>{t('cytologyQaTab.level.minor')}: <b className="ps-qa-breakdown-value">{report.minorDiscrepancyCount}</b></span>
      <span>{t('cytologyQaTab.level.major')}: <b className="ps-qa-breakdown-value--danger">{report.majorDiscrepancyCount}</b></span>
      <span>{t('cytologyQaTab.reportCard.falseNegative')}: <b className="ps-qa-breakdown-value--danger">{report.majorFalseNegativeCount}</b> ({pct(report.falseNegativeRatePercent)})</span>
      <span>{t('cytologyQaTab.reportCard.falsePositive')}: <b className="ps-qa-breakdown-value--warn">{report.majorFalsePositiveCount}</b></span>
      <span>{t('cytologyQaTab.reportCard.adequacyDiscrepancy')}: <b className="ps-qa-breakdown-value">{report.adequacyDiscrepancyCount}</b></span>
      <span>{t('cytologyQaTab.reportCard.diagnosticUpgrade')}: <b className="ps-qa-breakdown-value--warn">{report.diagnosticUpgradeCount}</b></span>
      <span>{t('cytologyQaTab.reportCard.diagnosticDowngrade')}: <b className="ps-qa-breakdown-value--danger">{report.diagnosticDowngradeCount}</b></span>
    </div>
    <ComparisonDetailTable comparisons={report.comparisons} />
  </div>
  );
};

// CYT-QA-01 — CT Statistical Comparison.
const CtStatisticalComparisonTable: React.FC<{ rows: CytologyCtStatisticalComparisonRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.cytotechnologist')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.ctStatsTable.totalScreened')}</th>
            {/* Unsat/NILM/ASC-US/ASC-H/LSIL/HSIL+ are standardized Bethesda
                System cytology diagnostic-category abbreviations — real,
                internationally recognized clinical nomenclature, left
                untranslated exactly like CPT codes and other fixed
                clinical vocabulary elsewhere in this sweep. */}
            <th className="ps-conf-th">Unsat %</th>
            <th className="ps-conf-th">NILM %</th>
            <th className="ps-conf-th">ASC-US %</th>
            <th className="ps-conf-th">ASC-H %</th>
            <th className="ps-conf-th">LSIL %</th>
            <th className="ps-conf-th">HSIL+ %</th>
            <th className="ps-conf-th">ASC-US:LSIL</th>
            <th className="ps-conf-th">{t('cytologyQaTab.ctStatsTable.labAvg')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.ctStatsTable.variance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.ctUserId} className="ps-conf-tr">
              <td className="ps-conf-td">{r.ctUserName ?? r.ctUserId}</td>
              <td className="ps-conf-td">{r.totalScreened}</td>
              <td className="ps-conf-td">{pct(r.unsatRatePercent)}</td>
              <td className="ps-conf-td">{pct(r.nilmRatePercent)}</td>
              <td className="ps-conf-td">{pct(r.ascusRatePercent)}</td>
              <td className="ps-conf-td">{pct(r.aschRatePercent)}</td>
              <td className="ps-conf-td">{pct(r.lsilRatePercent)}</td>
              <td className="ps-conf-td">{pct(r.hsilPlusRatePercent)}</td>
              <td className="ps-conf-td">{r.ascusLsilRatio === null ? '—' : num(r.ascusLsilRatio)}</td>
              <td className="ps-conf-td">{r.labAvgAscusLsilRatio === null ? '—' : num(r.labAvgAscusLsilRatio)}</td>
              <td className="ps-conf-td">
                {r.varianceFlag ? (
                  <span className="ps-qa-badge ps-qa-badge--danger">{t('cytologyQaTab.outlierBadge')}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={11}>{t('cytologyQaTab.ctStatsTable.noReviewsYet')}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
  );
};

// MOL-QA-03 — ASC-US / HPV Reflex Concordance.
const AscusHpvReflexTable: React.FC<{ rows: CytologyAscusHpvReflexRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  const OUTLIER_LABEL: Record<string, { textKey: string; color: string }> = {
    normal: { textKey: 'cytologyQaTab.ascusHpvTable.outlier.normal', color: '#10B981' },
    under_calling: { textKey: 'cytologyQaTab.ascusHpvTable.outlier.underCalling', color: '#f59e0b' },
    over_calling: { textKey: 'cytologyQaTab.ascusHpvTable.outlier.overCalling', color: '#ef4444' },
    insufficient_data: { textKey: 'cytologyQaTab.ascusHpvTable.outlier.insufficientData', color: '#6b7280' },
  };
  return (
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.cytotechnologist')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ascusHpvTable.totalAscus')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ascusHpvTable.reflexHpvOrdered')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ascusHpvTable.reflexOrderRate')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ascusHpvTable.hpvPositiveCount')}</th>
              <th className="ps-conf-th">ASC-US HPV+ %</th>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const status = OUTLIER_LABEL[r.outlierStatus];
              return (
                <tr key={r.ctUserId} className="ps-conf-tr">
                  <td className="ps-conf-td">{r.ctUserName ?? r.ctUserId}</td>
                  <td className="ps-conf-td">{r.totalAscusCases}</td>
                  <td className="ps-conf-td">{r.reflexHpvOrdered}</td>
                  <td className="ps-conf-td">{pct(r.reflexOrderRatePercent)}</td>
                  <td className="ps-conf-td">{r.hpvPositiveCount}</td>
                  <td className="ps-conf-td">{pct(r.ascusHpvPosPercent)}</td>
                  <td className="ps-conf-td">
                    <span className="ps-qa-badge" style={{ '--qa-badge-color': status.color } as React.CSSProperties}>{t(status.textKey)}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>{t('cytologyQaTab.ascusHpvTable.noCallsYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// CYT-QA-05 — Workload Tracking & Exceedance.
const WorkloadTrackingTable: React.FC<{ rows: CytologyWorkloadTrackingRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.cytotechnologist')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.shiftDate')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.hoursScreened')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.manualSlides')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.imagerSlides')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.totalEquivSlides')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.maxAllowed')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.workloadTable.exceedance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.ctUserId}-${r.shiftDate}-${i}`} className="ps-conf-tr">
              <td className="ps-conf-td">{r.ctUserId}</td>
              <td className="ps-conf-td">{r.shiftDate}</td>
              <td className="ps-conf-td">{num(r.hoursScreened, 1)}</td>
              <td className="ps-conf-td">{r.manualSlidesCount}</td>
              <td className="ps-conf-td">{r.imagerSlidesCount}</td>
              <td className="ps-conf-td">{num(r.totalEquivSlides, 1)}</td>
              <td className="ps-conf-td">{num(r.maxAllowedVolume, 1)}</td>
              <td className="ps-conf-td">
                {r.exceedanceFlag ? (
                  <span className="ps-qa-badge ps-qa-badge--danger">{t('cytologyQaTab.exceededBadge')}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>{t('cytologyQaTab.workloadTable.noLedgerEntriesYet')}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
  );
};

// GYN Cytology Secondary Screening Audit — real, per direct follow-up
// ("Yes, wire cytology"): the first real view of QaActivityRecord
// entries this activity type ever produces, closing the "recorded but
// never surfaced" gap the wiring itself would otherwise have left.
const SecondaryScreeningAuditTable: React.FC<{ records: QaActivityRecord[] }> = ({ records }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.case')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.secondaryScreeningTable.trigger')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.outcome')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.secondaryScreeningTable.addedByEvent')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.secondaryScreeningTable.missedByEvent')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.secondaryScreeningTable.reviewer')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="ps-conf-tr">
              <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
              <td className="ps-conf-td">{String(r.fieldValues.trigger ?? '—')}</td>
              <td className="ps-conf-td">
                <span className={`ps-qa-badge ${r.outcome === 'concordant' ? 'ps-qa-badge--success' : 'ps-qa-badge--danger'}`}>
                  {r.outcome === 'concordant' ? t('cytologyQaTab.concordantBadge') : t('cytologyQaTab.discordantBadge')}
                </span>
              </td>
              <td className="ps-conf-td">{String(r.fieldValues.addedByEvent ?? '') || '—'}</td>
              <td className="ps-conf-td">{String(r.fieldValues.missedByEvent ?? '') || '—'}</td>
              <td className="ps-conf-td">{r.recordedBy.userName}</td>
            </tr>
          ))}
          {records.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={6}>{t('cytologyQaTab.secondaryScreeningTable.noEventsYet')}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
  );
};

// CYT-QA-04 — Cyto-Histologic Correlation and Discrepancy Matrix.
// Real, per direct guidance ("Make sure it can be downloaded and
// printed."): the on-screen table also carries the Download (real,
// existing exportQaReportRows XLSX utility every other real QA tab
// already uses) and Print (this report's own dedicated portal-based
// print view, CytologyHistologyCorrelationPrintView.tsx) actions.
const CATEGORY_LABEL: Record<string, { textKey: string; color: string }> = {
  concordant: { textKey: 'cytologyQaTab.category.concordant', color: '#10B981' },
  minor_discrepancy: { textKey: 'cytologyQaTab.category.minorDiscrepancy', color: '#f59e0b' },
  major_discrepancy: { textKey: 'cytologyQaTab.category.majorDiscrepancy', color: '#ef4444' },
  discordant_unspecified: { textKey: 'cytologyQaTab.category.discordantUnspecified', color: '#ef4444' },
};

// Fixed English text for the same correlation-category enum, used only
// for the CSV export column value below — exported/persisted data
// stays English regardless of the UI's active locale, same convention
// as every other CSV/XLSX export in this sweep.
const CATEGORY_LABEL_EXPORT_TEXT: Record<string, string> = {
  concordant: 'Concordant',
  minor_discrepancy: 'Minor Discrepancy',
  major_discrepancy: 'Major Discrepancy',
  discordant_unspecified: 'Discordant (Unspecified)',
};

const HistologyCorrelationTable: React.FC<{
  report: CytologyHistologyCorrelationReport | null;
  onDownload: () => void;
  onPrint: () => void;
}> = ({ report, onDownload, onPrint }) => {
  const { t } = useTranslation();
  if (!report) return null;
  return (
    <div>
      <div className="ps-qa-histo-summary-row">
        <div className="ps-qa-histo-summary-stats">
          <div><b>{report.totalCorrelated}</b> {t('cytologyQaTab.histologyTable.casesCorrelated')}</div>
          <div><b>{report.concordantCount}</b> {t('cytologyQaTab.category.concordant')}</div>
          <div><b>{pct(report.correlationRatePercent)}</b> {t('cytologyQaTab.histologyTable.correlationRate')}</div>
          <div><b>{report.ppvHsilPercent === undefined ? '—' : pct(report.ppvHsilPercent)}</b> {t('cytologyQaTab.histologyTable.ppvHsil')}</div>
        </div>
        <div className="ps-qa-histo-summary-actions">
          <button className="ps-conf-btn-secondary" onClick={onDownload}>⬇️ {t('cytologyQaTab.histologyTable.downloadButton')}</button>
          <button className="ps-conf-btn-secondary" onClick={onPrint}>🖨️ {t('cytologyQaTab.histologyTable.printButton')}</button>
        </div>
      </div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.patientMrn')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.cytoAccession')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.cytoDate')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.cytoDiagnosis')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.histAccession')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.histDate')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.histDiagnosis')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.daysToBiopsy')}</th>
                <th className="ps-conf-th">{t('cytologyQaTab.histologyTable.correlationCategory')}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => {
                const cat = CATEGORY_LABEL[r.correlationCategory];
                return (
                  <tr key={i} className="ps-conf-tr">
                    <td className="ps-conf-td">{r.patientMrn ?? '—'}</td>
                    <td className="ps-conf-td">{r.cytoAccessionId ?? '—'}</td>
                    <td className="ps-conf-td">{r.cytoDate ? new Date(r.cytoDate).toLocaleDateString() : '—'}</td>
                    <td className="ps-conf-td">{r.cytoDiagnosis}</td>
                    <td className="ps-conf-td">{r.histAccessionId ?? '—'}</td>
                    <td className="ps-conf-td">{r.histDate ? new Date(r.histDate).toLocaleDateString() : '—'}</td>
                    <td className="ps-conf-td">{r.histDiagnosis}</td>
                    <td className="ps-conf-td">{r.daysToBiopsy ?? '—'}</td>
                    <td className="ps-conf-td">
                      <span className="ps-qa-badge" style={{ '--qa-badge-color': cat.color } as React.CSSProperties}>{t(cat.textKey)}</span>
                    </td>
                  </tr>
                );
              })}
              {report.rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={9}>{t('cytologyQaTab.histologyTable.noCorrelationsYet')}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// US-QA-02 — Unscreened Backlog & TAT.
const UnscreenedBacklogTable: React.FC<{ rows: CytologyUnscreenedBacklogRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.case')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.accession')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.unscreenedBacklogTable.collected')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.unscreenedBacklogTable.received')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.headers.status')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.unscreenedBacklogTable.elapsedHours')}</th>
            <th className="ps-conf-th">{t('cytologyQaTab.unscreenedBacklogTable.tatExceeded')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="ps-conf-tr">
              <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
              <td className="ps-conf-td">{r.accessionId ?? '—'}</td>
              <td className="ps-conf-td">{r.collectionDate ? new Date(r.collectionDate).toLocaleDateString() : '—'}</td>
              <td className="ps-conf-td">{r.receivedDate ? new Date(r.receivedDate).toLocaleDateString() : '—'}</td>
              <td className="ps-conf-td">{r.currentStatus === 'unscreened' ? t('cytologyQaTab.unscreenedBacklogTable.unscreenedStatus') : t('cytologyQaTab.unscreenedBacklogTable.pendingPathReviewStatus')}</td>
              <td className="ps-conf-td">{r.elapsedHours !== undefined ? r.elapsedHours.toFixed(1) : '—'}</td>
              <td className="ps-conf-td">
                {r.tatExceeded ? (
                  <span className="ps-qa-badge ps-qa-badge--danger">{t('cytologyQaTab.exceededBadge')}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>{t('cytologyQaTab.unscreenedBacklogTable.noBacklogYet')}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
  );
};

// UK-QA-01 — Primary HPV Screening Failsafe Audit.
const PrimaryHpvFailsafeAuditTable: React.FC<{ rows: CytologyPrimaryHpvFailsafeAuditRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.ukFailsafeTable.disclaimer')}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.ukFailsafeTable.jurisdiction')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ukFailsafeTable.hpvPrimaryPositives')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ukFailsafeTable.cytologyTriagePerformed')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.ukFailsafeTable.inadequateCytologyRate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.jurisdiction} className="ps-conf-tr">
                <td className="ps-conf-td">{r.jurisdiction}</td>
                <td className="ps-conf-td">{r.totalHpvPrimaryPositives}</td>
                <td className="ps-conf-td">{r.cytologyTriagePerformedCount}</td>
                <td className="ps-conf-td">{pct(r.inadequateCytologyRatePercent)}</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={4}>{t('cytologyQaTab.ukFailsafeTable.noDataYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// EU-QA-01 — Trans-National Compliance Matrix.
const EuComplianceMatrixTable: React.FC<{ rows: CytologyEuComplianceMatrixRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.euComplianceTable.disclaimer')}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.euComplianceTable.country')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.euComplianceTable.totalCases')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.euComplianceTable.hpvPrimary')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.euComplianceTable.hpvCoTest')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.euComplianceTable.internalAuditNonConformities')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.countryCode} className="ps-conf-tr">
                <td className="ps-conf-td">{r.countryCode}</td>
                <td className="ps-conf-td">{r.totalCases}</td>
                <td className="ps-conf-td">{r.hpvPrimaryCount}</td>
                <td className="ps-conf-td">{r.hpvCoTestCount}</td>
                <td className="ps-conf-td">{r.internalAuditNonConformityCount}</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={5}>{t('cytologyQaTab.euComplianceTable.noDataYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// MOL-QA-01 — HPV Positivity Monitor.
const INDICATION_LABEL_KEY: Record<string, string> = {
  primary_screening: 'cytologyQaTab.indication.primaryScreening', co_testing: 'cytologyQaTab.indication.coTesting',
  ascus_triage: 'cytologyQaTab.indication.ascusTriage', post_treatment_follow_up: 'cytologyQaTab.indication.postTreatmentFollowUp',
};
const HpvPositivityMonitorTable: React.FC<{ rows: CytologyHpvPositivityMonitorRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.hpvPositivityTable.disclaimer')}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.hpvPositivityTable.testingSite')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.hpvPositivityTable.indication')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.hpvPositivityTable.totalTested')}</th>
              <th className="ps-conf-th">HR-HPV+ %</th>
              <th className="ps-conf-th">HPV16 %</th>
              <th className="ps-conf-th">HPV18/45 %</th>
              <th className="ps-conf-th">{t('cytologyQaTab.hpvPositivityTable.otherHrPercent')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.hpvPositivityTable.varianceVsMean')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="ps-conf-tr">
                <td className="ps-conf-td">{r.testingSite}</td>
                <td className="ps-conf-td">{t(INDICATION_LABEL_KEY[r.indicationType])}</td>
                <td className="ps-conf-td">{r.totalHpvTested}</td>
                <td className="ps-conf-td">{pct(r.hrHpvPositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.hpv16PositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.hpv18Or45PositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.otherHrPositivityPercent)}</td>
                <td className="ps-conf-td">{r.positivityVarianceFromAggregateMean >= 0 ? '+' : ''}{r.positivityVarianceFromAggregateMean.toFixed(1)}pp</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>{t('cytologyQaTab.hpvPositivityTable.noDataYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// MOL-QA-02 — Internal Control Failure, Invalid, and Inhibitor Rate.
// Real, per direct instruction: reads real, synthetic seed data from
// mockMolecularQcRunRecordService.ts so this capability can actually
// be demoed.
const MolecularQcFailureRateTable: React.FC<{ rows: CytologyMolecularQcFailureRateRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.molQcFailureTable.disclaimer')}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.runDate')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.instrument')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.reagentLot')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.samplesRun')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.invalidControls')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.inhibitors')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.failureRate')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.threshold')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="ps-conf-tr">
                <td className="ps-conf-td">{new Date(r.runDate).toLocaleDateString()}</td>
                <td className="ps-conf-td">{r.instrumentId}</td>
                <td className="ps-conf-td">{r.reagentLotNumber}</td>
                <td className="ps-conf-td">{r.totalSamplesRun}</td>
                <td className="ps-conf-td">{r.invalidControlCount}</td>
                <td className="ps-conf-td">{r.inhibitorCount}</td>
                <td className="ps-conf-td">{pct(r.overallFailureRatePercent)}</td>
                <td className="ps-conf-td">
                  {r.thresholdExceeded ? (
                    <span className="ps-qa-badge ps-qa-badge--danger">{t('cytologyQaTab.exceededBadge')}</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>{t('cytologyQaTab.molQcFailureTable.noDataYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// MOL-QA-04 — Molecular Assay Lot-to-Lot and Run QC Trend.
const MolecularLotToLotTrendTable: React.FC<{ rows: CytologyMolecularLotToLotTrendRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.molLotTrendTable.disclaimer')}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.molQcFailureTable.instrument')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molLotTrendTable.lotOld')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molLotTrendTable.lotNew')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molLotTrendTable.controlLevel')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molLotTrendTable.meanCtOld')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.molLotTrendTable.meanCtNew')}</th>
              <th className="ps-conf-th">Δ Ct</th>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="ps-conf-tr">
                <td className="ps-conf-td">{r.instrumentId}</td>
                <td className="ps-conf-td">{r.reagentLotOld}</td>
                <td className="ps-conf-td">{r.reagentLotNew}</td>
                <td className="ps-conf-td">{r.controlLevel.replace('_', ' ')}</td>
                <td className="ps-conf-td">{r.meanCtOld.toFixed(1)}</td>
                <td className="ps-conf-td">{r.meanCtNew.toFixed(1)}</td>
                <td className="ps-conf-td">{r.deltaCtDifference >= 0 ? '+' : ''}{r.deltaCtDifference.toFixed(2)}</td>
                <td className="ps-conf-td">
                  <span className={`ps-qa-badge ${r.passFailStatus === 'pass' ? 'ps-qa-badge--success' : 'ps-qa-badge--danger'}`}>
                    {r.passFailStatus === 'pass' ? t('cytologyQaTab.passBadge') : t('cytologyQaTab.failBadge')}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>{t('cytologyQaTab.molLotTrendTable.noLotChangeoversYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// APAC-QA-01 — External Proficiency Testing (EQA).
const ApacProficiencyTestTable: React.FC<{ report: CytologyApacProficiencyTestReport }> = ({ report }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="ps-qa-disclaimer">
      {t('cytologyQaTab.apacPtTable.disclaimer')}
    </div>
    <div className="ps-qa-apac-summary">
      {t('cytologyQaTab.apacPtTable.satisfactorySummary', { satisfactory: report.satisfactoryCount, total: report.totalEvents, rate: pct(report.satisfactoryRatePercent) })}
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.apacPtTable.received')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.accession')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.apacPtTable.provider')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.apacPtTable.challenge')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.outcome')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.apacPtTable.scoreDetail')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.apacPtTable.deficiency')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i} className="ps-conf-tr">
                <td className="ps-conf-td">{new Date(r.receivedAt).toLocaleDateString()}</td>
                <td className="ps-conf-td" data-phi="accession">{r.accessionNumber}</td>
                <td className="ps-conf-td">{r.provider}</td>
                <td className="ps-conf-td">{r.challengeReferenceId}</td>
                <td className="ps-conf-td">
                  <span className={`ps-qa-badge ${r.outcome === 'satisfactory' ? 'ps-qa-badge--success' : 'ps-qa-badge--danger'}`}>
                    {r.outcome === 'satisfactory' ? t('cytologyQaTab.apacPtTable.satisfactoryOutcome') : t('cytologyQaTab.apacPtTable.unsatisfactoryOutcome')}
                  </span>
                </td>
                <td className="ps-conf-td">{r.scoreDetail ?? '—'}</td>
                <td className="ps-conf-td">
                  {r.consecutiveDeficiencyFlagged ? (
                    <span className="ps-qa-badge ps-qa-badge--danger">{t('cytologyQaTab.apacPtTable.flaggedBadge')}</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {report.rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>{t('cytologyQaTab.apacPtTable.noGradesYet')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// ANZ-QA-01 — Registry Transmission Audit.
const TRANSMISSION_STATUS_LABEL_KEY: Record<string, { textKey: string; color: string }> = {
  SENT: { textKey: 'cytologyQaTab.transmissionTable.status.sent', color: '#10B981' },
  QUEUED: { textKey: 'cytologyQaTab.transmissionTable.status.queued', color: '#f59e0b' },
  FAILED: { textKey: 'cytologyQaTab.transmissionTable.status.failed', color: '#ef4444' },
};

const TransmissionAuditTable: React.FC<{ rows: CytologyRegistryTransmissionAuditRow[] }> = ({ rows }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">{t('cytologyQaTab.headers.accession')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.mrn')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.hpvResult')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.cytologyResult')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.transmitted')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.status.header')}</th>
              <th className="ps-conf-th">{t('cytologyQaTab.transmissionTable.error')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const status = TRANSMISSION_STATUS_LABEL_KEY[r.transmissionStatus];
              return (
                <tr key={`${r.caseId}-${i}`} className="ps-conf-tr">
                  <td className="ps-conf-td" data-phi="accession">{r.accessionNumber}</td>
                  <td className="ps-conf-td">{r.patientMrn ?? '—'}</td>
                  <td className="ps-conf-td">{r.hpvResultCode ?? '—'}</td>
                  <td className="ps-conf-td">{r.cytologyResultCode}</td>
                  <td className="ps-conf-td">{r.transmissionTimestamp ?? '—'}</td>
                  <td className="ps-conf-td">
                    <span className="ps-qa-badge" style={{ '--qa-badge-color': status.color } as React.CSSProperties}>{t(status.textKey)}</span>
                  </td>
                  <td className="ps-conf-td">{r.errorReasonCode ?? '—'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>{t('cytologyQaTab.transmissionTable.noneOnFile')}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Real, per direct guidance's own real service interface
// (ICytologyQaReportService.ts) — a real, empty/zeroed default for
// each aggregate report shape, shown only for the instant before its
// own real fetch resolves; never displayed as if it were real data.
const EMPTY_AGGREGATE: CytologyQaAggregateReport = {
  totalCompared: 0, exactCount: 0, minorDiscrepancyCount: 0, majorDiscrepancyCount: 0,
  majorFalseNegativeCount: 0, majorFalsePositiveCount: 0, adequacyDiscrepancyCount: 0,
  overallAgreementPercent: 0, majorConcordancePercent: 0, falseNegativeRatePercent: 0,
  diagnosticUpgradeCount: 0, diagnosticDowngradeCount: 0, comparisons: [],
};

export const CytologyQaTab: React.FC = () => {
  const [activeReport, setActiveReport] = useState<CytologyQaReportKey>('random');
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [transmissionRegistryId, setTransmissionRegistryId] = useState<RegistryId>('ncsr_australia');
  const [loading, setLoading] = useState(true);

  const [aggregateReport, setAggregateReport] = useState<CytologyQaAggregateReport>(EMPTY_AGGREGATE);
  const [ctStatsReport, setCtStatsReport] = useState<CytologyCtStatisticalComparisonRow[]>([]);
  const [ascusHpvReport, setAscusHpvReport] = useState<CytologyAscusHpvReflexRow[]>([]);
  const [workloadReport, setWorkloadReport] = useState<CytologyWorkloadTrackingRow[]>([]);
  const [transmissionReport, setTransmissionReport] = useState<CytologyRegistryTransmissionAuditRow[]>([]);
  const [secondaryScreeningAuditReport, setSecondaryScreeningAuditReport] = useState<QaActivityRecord[]>([]);
  const [histologyCorrelationReport, setHistologyCorrelationReport] = useState<CytologyHistologyCorrelationReport | null>(null);
  const [showHistologyCorrelationPrint, setShowHistologyCorrelationPrint] = useState(false);
  const [unscreenedBacklogReport, setUnscreenedBacklogReport] = useState<CytologyUnscreenedBacklogRow[]>([]);
  const [ukFailsafeReport, setUkFailsafeReport] = useState<CytologyPrimaryHpvFailsafeAuditRow[]>([]);
  const [euComplianceReport, setEuComplianceReport] = useState<CytologyEuComplianceMatrixRow[]>([]);
  const [hpvPositivityReport, setHpvPositivityReport] = useState<CytologyHpvPositivityMonitorRow[]>([]);
  const [molQcFailureReport, setMolQcFailureReport] = useState<CytologyMolecularQcFailureRateRow[]>([]);
  const [molLotTrendReport, setMolLotTrendReport] = useState<CytologyMolecularLotToLotTrendRow[]>([]);
  const [apacPtReport, setApacPtReport] = useState<CytologyApacProficiencyTestReport>({ rows: [], totalEvents: 0, satisfactoryCount: 0, satisfactoryRatePercent: 0 });

  // Real, per direct follow-up ("mimicking the backend bits against
  // the mock while the real backend gets built"): only the currently
  // active report's own real data is fetched — never all seven at
  // once regardless of which tile is showing. The same real principle
  // a real backend-driven page would follow, and a genuine improvement
  // over eager-loading everything up front, independent of whichever
  // implementation (mock or real) sits behind the service interface.
  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      auditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Cytology QA tab (${activeReport}), user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }

    setLoading(true);
    let cancelled = false;

    (async () => {
      if (activeReport === 'random') {
        const res = await mockCytologyQaReportService.get10PercentRandomRescreeningReport(scope);
        if (!cancelled && res.ok) setAggregateReport(res.data);
      } else if (activeReport === 'high-risk') {
        const res = await mockCytologyQaReportService.getDirectedHighRiskRescreeningReport(scope);
        if (!cancelled && res.ok) setAggregateReport(res.data);
      } else if (activeReport === 'ct-path') {
        const res = await mockCytologyQaReportService.getCtVsPathologistCorrelationReport(scope);
        if (!cancelled && res.ok) setAggregateReport(res.data);
      } else if (activeReport === 'peer-review') {
        const res = await mockCytologyQaReportService.getPostSignOutPeerReviewCorrelationReport(scope);
        if (!cancelled && res.ok) setAggregateReport(res.data);
      } else if (activeReport === 'ct-stats') {
        const res = await mockCytologyQaReportService.getCtStatisticalComparisonReport(scope);
        if (!cancelled && res.ok) setCtStatsReport(res.data);
      } else if (activeReport === 'ascus-hpv') {
        const res = await mockCytologyQaReportService.getAscusHpvReflexReport(scope);
        if (!cancelled && res.ok) setAscusHpvReport(res.data);
      } else if (activeReport === 'workload') {
        const res = await mockCytologyQaReportService.getWorkloadTrackingReport(scope);
        if (!cancelled && res.ok) setWorkloadReport(res.data);
      } else if (activeReport === 'transmission') {
        const res = await mockCytologyQaReportService.getRegistryTransmissionAuditReport(scope, transmissionRegistryId);
        if (!cancelled && res.ok) setTransmissionReport(res.data);
      } else if (activeReport === 'secondary-screening-audit') {
        const res = await mockCytologyQaReportService.getGynCytologySecondaryScreeningAuditReport(scope);
        if (!cancelled && res.ok) setSecondaryScreeningAuditReport(res.data);
      } else if (activeReport === 'histology-correlation') {
        const res = await mockCytologyQaReportService.getHistologyCorrelationReport(scope);
        if (!cancelled && res.ok) setHistologyCorrelationReport(res.data);
      } else if (activeReport === 'unscreened-backlog') {
        const res = await mockCytologyQaReportService.getUnscreenedBacklogReport(scope);
        if (!cancelled && res.ok) setUnscreenedBacklogReport(res.data);
      } else if (activeReport === 'uk-failsafe') {
        const res = await mockCytologyQaReportService.getPrimaryHpvFailsafeAuditReport(scope);
        if (!cancelled && res.ok) setUkFailsafeReport(res.data);
      } else if (activeReport === 'eu-compliance') {
        const res = await mockCytologyQaReportService.getEuComplianceMatrixReport(scope);
        if (!cancelled && res.ok) setEuComplianceReport(res.data);
      } else if (activeReport === 'hpv-positivity') {
        const res = await mockCytologyQaReportService.getHpvPositivityMonitorReport(scope);
        if (!cancelled && res.ok) setHpvPositivityReport(res.data);
      } else if (activeReport === 'mol-qc-failure') {
        const res = await mockCytologyQaReportService.getMolecularQcFailureRateReport(scope);
        if (!cancelled && res.ok) setMolQcFailureReport(res.data);
      } else if (activeReport === 'mol-lot-trend') {
        const res = await mockCytologyQaReportService.getMolecularLotToLotTrendReport(scope);
        if (!cancelled && res.ok) setMolLotTrendReport(res.data);
      } else if (activeReport === 'apac-pt') {
        const res = await mockCytologyQaReportService.getApacProficiencyTestReport(scope);
        if (!cancelled && res.ok) setApacPtReport(res.data);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [activeReport, scope, transmissionRegistryId]);

  const { t } = useTranslation();

  return (
    <div className="ps-qa-tab-page">
      <div className="ps-qa-tab-header">
        <div className="ps-qa-tab-scope-label">{t('cytologyQaTab.scopeLabel', { scope: scopeLabel(scope) })}</div>
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={undefined} />
      </div>

      <div className="ps-qa-tab-tiles">
        {REPORT_TILES.map(tile => {
          const isActive = activeReport === tile.key;
          return (
            <button
              key={tile.key}
              className="ps-wl-filter-tile"
              title={t('cytologyQaTab.tileViewTooltip', { label: `${tile.icon} ${t(tile.labelKey)}` })}
              onClick={() => setActiveReport(tile.key)}
              style={{
                '--tile-bg': isActive ? `${tile.color}2e` : `${tile.color}0d`,
                '--tile-border': isActive ? tile.color : `${tile.color}2e`,
                '--tile-shadow': isActive ? `0 0 12px ${tile.color}66` : 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? tile.color : '#8899aa' } as React.CSSProperties}>{tile.icon} {t(tile.labelKey)}</div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': tile.color } as React.CSSProperties}>{'\u00A0'}</div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': tile.color, '--tile-sublabel-opacity': 0 } as React.CSSProperties}>{'\u00A0'}</div>
            </button>
          );
        })}
      </div>

      {activeReport === 'transmission' && (
        <div className="ps-qa-registry-picker">
          <label className="ps-label ps-mr-8" htmlFor="qa-transmission-registry">{t('cytologyQaTab.registryLabel')}</label>
          <select
            id="qa-transmission-registry"
            className="ps-input-dark"
            value={transmissionRegistryId}
            onChange={e => setTransmissionRegistryId(e.target.value as RegistryId)}
          >
            <option value="ncsr_australia">{t('cytologyQaTab.registry.australia')} — NCSR</option>
            <option value="kncsp_kccr_korea">{t('cytologyQaTab.registry.southKorea')} — KNCSP/KCCR</option>
            <option value="csms_uk">{t('cytologyQaTab.registry.england')} — CSMS</option>
            <option value="cervicalcheck_ireland">{t('cytologyQaTab.registry.ireland')} — CervicalCheck</option>
            <option value="palga_netherlands">{t('cytologyQaTab.registry.netherlands')} — PALGA</option>
            <option value="nicsp_northern_ireland">{t('cytologyQaTab.registry.northernIreland')} — NICSP</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="ps-qa-loading">{t('cytologyQaTab.loading')}</div>
      ) : (
        <>
          {activeReport === 'random' && <ReportCard titleKey="cytologyQaTab.reportTitle.random" titleCode="CYT-QA-02" report={aggregateReport} />}
          {activeReport === 'high-risk' && <ReportCard titleKey="cytologyQaTab.reportTitle.highRisk" report={aggregateReport} />}
          {activeReport === 'ct-path' && <ReportCard titleKey="cytologyQaTab.reportTitle.ctPath" titleCode="US-QA-01" report={aggregateReport} />}
          {activeReport === 'peer-review' && <ReportCard titleKey="cytologyQaTab.reportTitle.peerReview" report={aggregateReport} />}
          {activeReport === 'ct-stats' && <CtStatisticalComparisonTable rows={ctStatsReport} />}
          {activeReport === 'ascus-hpv' && <AscusHpvReflexTable rows={ascusHpvReport} />}
          {activeReport === 'workload' && <WorkloadTrackingTable rows={workloadReport} />}
          {activeReport === 'transmission' && <TransmissionAuditTable rows={transmissionReport} />}
          {activeReport === 'secondary-screening-audit' && <SecondaryScreeningAuditTable records={secondaryScreeningAuditReport} />}
          {activeReport === 'histology-correlation' && (
            <HistologyCorrelationTable
              report={histologyCorrelationReport}
              onDownload={() => {
                if (!histologyCorrelationReport) return;
                const rows = histologyCorrelationReport.rows.map(r => ({
                  'Patient MRN': r.patientMrn ?? '', 'Cyto Accession': r.cytoAccessionId ?? '',
                  'Cyto Date': r.cytoDate ? new Date(r.cytoDate).toLocaleDateString() : '',
                  'Cyto Diagnosis': r.cytoDiagnosis, 'Hist Accession': r.histAccessionId ?? '',
                  'Hist Date': r.histDate ? new Date(r.histDate).toLocaleDateString() : '',
                  'Hist Diagnosis': r.histDiagnosis, 'Days to Biopsy': r.daysToBiopsy ?? '',
                  'Correlation Category': CATEGORY_LABEL_EXPORT_TEXT[r.correlationCategory],
                }));
                exportQaReportRows(rows, `cyto-histo-correlation-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
              onPrint={() => setShowHistologyCorrelationPrint(true)}
            />
          )}
          {activeReport === 'unscreened-backlog' && <UnscreenedBacklogTable rows={unscreenedBacklogReport} />}
          {activeReport === 'uk-failsafe' && <PrimaryHpvFailsafeAuditTable rows={ukFailsafeReport} />}
          {activeReport === 'eu-compliance' && <EuComplianceMatrixTable rows={euComplianceReport} />}
          {activeReport === 'hpv-positivity' && <HpvPositivityMonitorTable rows={hpvPositivityReport} />}
          {activeReport === 'mol-qc-failure' && <MolecularQcFailureRateTable rows={molQcFailureReport} />}
          {activeReport === 'mol-lot-trend' && <MolecularLotToLotTrendTable rows={molLotTrendReport} />}
          {activeReport === 'apac-pt' && <ApacProficiencyTestTable report={apacPtReport} />}
        </>
      )}
      {showHistologyCorrelationPrint && histologyCorrelationReport && (
        <CytologyHistologyCorrelationPrintView
          report={histologyCorrelationReport}
          scopeLabel={scopeLabel(scope)}
          onClose={() => setShowHistologyCorrelationPrint(false)}
        />
      )}
    </div>
  );
};
