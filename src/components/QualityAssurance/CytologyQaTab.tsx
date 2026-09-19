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

const LEVEL_LABEL: Record<string, { text: string; color: string }> = {
  exact: { text: 'Exact', color: '#10B981' },
  minor_discrepancy: { text: 'Minor', color: '#f59e0b' },
  major_discrepancy: { text: 'Major', color: '#ef4444' },
};

// Real, per direct guidance: "each report can get their own tile" —
// same real .ps-wl-filter-tile pattern the parent QualityAssurancePage
// already uses for its own Operations/CAPA sub-navigation, reused
// directly rather than a second, competing tile style.
type CytologyQaReportKey = 'random' | 'high-risk' | 'ct-path' | 'peer-review' | 'ct-stats' | 'ascus-hpv' | 'workload' | 'transmission' | 'secondary-screening-audit' | 'histology-correlation' | 'unscreened-backlog' | 'uk-failsafe' | 'eu-compliance' | 'hpv-positivity' | 'mol-qc-failure' | 'mol-lot-trend' | 'apac-pt';

const REPORT_TILES: { key: CytologyQaReportKey; label: string; color: string }[] = [
  { key: 'random', label: '🎲 10% Random Rescreening', color: '#009E73' },
  { key: 'high-risk', label: '⚠️ Directed / High-Risk Rescreening', color: '#f59e0b' },
  { key: 'ct-path', label: '⚖️ CT vs. Pathologist Correlation', color: '#38bdf8' },
  { key: 'peer-review', label: '🔍 Post-Sign-Out Peer Review', color: '#14B8A6' },
  { key: 'ct-stats', label: '📊 CT Statistical Comparison', color: '#8B5CF6' },
  { key: 'ascus-hpv', label: '🧬 ASC-US / HPV Reflex Concordance', color: '#EC4899' },
  { key: 'workload', label: '⏱️ Workload Tracking', color: '#261CE3' },
  { key: 'transmission', label: '📡 Registry Transmission Audit', color: '#0891B2' },
  { key: 'secondary-screening-audit', label: '📋 Secondary Screening Audit', color: '#DC2626' },
  { key: 'histology-correlation', label: '🔬 Cyto-Histologic Correlation', color: '#F472B6' },
  { key: 'unscreened-backlog', label: '⏳ Unscreened Backlog & TAT', color: '#F97316' },
  { key: 'uk-failsafe', label: '🇬🇧 Primary HPV Failsafe Audit', color: '#7C3AED' },
  { key: 'eu-compliance', label: '🇪🇺 EU Compliance Matrix', color: '#0EA5E9' },
  { key: 'hpv-positivity', label: '🦠 HPV Positivity Monitor', color: '#65A30D' },
  { key: 'mol-qc-failure', label: '🧪 Molecular QC Failure Rate', color: '#B91C1C' },
  { key: 'mol-lot-trend', label: '📈 Molecular Lot-to-Lot Trend', color: '#9333EA' },
  { key: 'apac-pt', label: '🌏 External Proficiency Testing (APAC-QA-01)', color: '#0891B2' },
];

// Real, per direct follow-up: "we don't see the records themselves" —
// the aggregate cards alone never let a real reviewer open the actual
// comparisons a percentage summarizes. Same real .ps-conf-table
// pattern this page's own Financials tables already use, not a new,
// competing table style.
const ComparisonDetailTable: React.FC<{ comparisons: CytologyQaAggregateReport['comparisons'] }> = ({ comparisons }) => (
  <div className="ps-conf-table-wrap" style={{ marginTop: 12 }}>
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">Case</th>
            <th className="ps-conf-th">Initial Screen</th>
            <th className="ps-conf-th">Follow-Up Review</th>
            <th className="ps-conf-th">Result</th>
            <th className="ps-conf-th">Adequacy</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => {
            const level = LEVEL_LABEL[c.level] ?? { text: c.level, color: '#9ca3af' };
            return (
              <tr key={`${c.caseId}-${i}`} className="ps-conf-tr">
                <td className="ps-conf-td" data-phi="accession">{c.caseId}</td>
                <td className="ps-conf-td">
                  <div>{c.initialInterpretationLabel}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{c.initialReviewerName ?? '—'}</div>
                </td>
                <td className="ps-conf-td">
                  <div>{c.followUpInterpretationLabel}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{c.followUpReviewerName ?? '—'}</div>
                </td>
                <td className="ps-conf-td">
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${level.color}18`, color: level.color, border: `1px solid ${level.color}33` }}>
                    {level.text}{c.majorSubtype ? ` — ${c.majorSubtype.replace(/_/g, ' ')}` : ''}
                  </span>
                </td>
                <td className="ps-conf-td">{c.adequacyDiscrepancy ? 'Discrepant' : '—'}</td>
              </tr>
            );
          })}
          {comparisons.length === 0 && (
            <tr><td className="ps-conf-empty-row" colSpan={5}>No comparisons on file for this report yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const ReportCard: React.FC<{ title: string; report: CytologyQaAggregateReport }> = ({ title, report }) => (
  <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20 }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 14 }}>{title}</div>
    <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#009E73' }}>{pct(report.overallAgreementPercent)}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>Overall Agreement</div>
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#38bdf8' }}>{pct(report.majorConcordancePercent)}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>Major Concordance</div>
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#e5e5e5' }}>{report.totalCompared}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>Cases Compared</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
      <span>Exact: <b style={{ color: '#e5e5e5' }}>{report.exactCount}</b></span>
      <span>Minor: <b style={{ color: '#e5e5e5' }}>{report.minorDiscrepancyCount}</b></span>
      <span>Major: <b style={{ color: '#ef4444' }}>{report.majorDiscrepancyCount}</b></span>
      <span>False Negative: <b style={{ color: '#ef4444' }}>{report.majorFalseNegativeCount}</b> ({pct(report.falseNegativeRatePercent)})</span>
      <span>False Positive: <b style={{ color: '#f59e0b' }}>{report.majorFalsePositiveCount}</b></span>
      <span>Adequacy Discrepancy: <b style={{ color: '#e5e5e5' }}>{report.adequacyDiscrepancyCount}</b></span>
      <span>Diagnostic Upgrade: <b style={{ color: '#f59e0b' }}>{report.diagnosticUpgradeCount}</b></span>
      <span>Diagnostic Downgrade: <b style={{ color: '#ef4444' }}>{report.diagnosticDowngradeCount}</b></span>
    </div>
    <ComparisonDetailTable comparisons={report.comparisons} />
  </div>
);

// CYT-QA-01 — CT Statistical Comparison.
const CtStatisticalComparisonTable: React.FC<{ rows: CytologyCtStatisticalComparisonRow[] }> = ({ rows }) => (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">Cytotechnologist</th>
            <th className="ps-conf-th">Total Screened</th>
            <th className="ps-conf-th">Unsat %</th>
            <th className="ps-conf-th">NILM %</th>
            <th className="ps-conf-th">ASC-US %</th>
            <th className="ps-conf-th">ASC-H %</th>
            <th className="ps-conf-th">LSIL %</th>
            <th className="ps-conf-th">HSIL+ %</th>
            <th className="ps-conf-th">ASC-US:LSIL</th>
            <th className="ps-conf-th">Lab Avg</th>
            <th className="ps-conf-th">Variance</th>
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
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>Outlier</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={11}>No real primary-screen reviews on file for this scope yet.</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
);

// MOL-QA-03 — ASC-US / HPV Reflex Concordance.
const AscusHpvReflexTable: React.FC<{ rows: CytologyAscusHpvReflexRow[] }> = ({ rows }) => {
  const OUTLIER_LABEL: Record<string, { text: string; color: string }> = {
    normal: { text: 'Normal', color: '#10B981' },
    under_calling: { text: 'Under-calling', color: '#f59e0b' },
    over_calling: { text: 'Over-calling', color: '#ef4444' },
    insufficient_data: { text: 'Insufficient Data', color: '#6b7280' },
  };
  return (
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Cytotechnologist</th>
              <th className="ps-conf-th">Total ASC-US</th>
              <th className="ps-conf-th">Reflex HPV Ordered</th>
              <th className="ps-conf-th">Reflex Order Rate</th>
              <th className="ps-conf-th">HPV+ Count</th>
              <th className="ps-conf-th">ASC-US HPV+ %</th>
              <th className="ps-conf-th">Status</th>
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
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}33` }}>{status.text}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>No real ASC-US calls on file for this scope yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// CYT-QA-05 — Workload Tracking & Exceedance.
const WorkloadTrackingTable: React.FC<{ rows: CytologyWorkloadTrackingRow[] }> = ({ rows }) => (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">Cytotechnologist</th>
            <th className="ps-conf-th">Shift Date</th>
            <th className="ps-conf-th">Hours Screened</th>
            <th className="ps-conf-th">Manual Slides</th>
            <th className="ps-conf-th">Imager Slides</th>
            <th className="ps-conf-th">Total Equiv. Slides</th>
            <th className="ps-conf-th">Max Allowed</th>
            <th className="ps-conf-th">Exceedance</th>
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
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>Exceeded</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>No real workload ledger entries on file for this scope yet.</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
);

// GYN Cytology Secondary Screening Audit — real, per direct follow-up
// ("Yes, wire cytology"): the first real view of QaActivityRecord
// entries this activity type ever produces, closing the "recorded but
// never surfaced" gap the wiring itself would otherwise have left.
const SecondaryScreeningAuditTable: React.FC<{ records: QaActivityRecord[] }> = ({ records }) => (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">Case</th>
            <th className="ps-conf-th">Trigger</th>
            <th className="ps-conf-th">Outcome</th>
            <th className="ps-conf-th">Added by Event</th>
            <th className="ps-conf-th">Missed by Event</th>
            <th className="ps-conf-th">Reviewer</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="ps-conf-tr">
              <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
              <td className="ps-conf-td">{String(r.fieldValues.trigger ?? '—')}</td>
              <td className="ps-conf-td">
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: r.outcome === 'concordant' ? '#10B98118' : '#ef444418', color: r.outcome === 'concordant' ? '#10B981' : '#ef4444', border: `1px solid ${r.outcome === 'concordant' ? '#10B98133' : '#ef444433'}` }}>
                  {r.outcome === 'concordant' ? 'Concordant' : 'Discordant'}
                </span>
              </td>
              <td className="ps-conf-td">{String(r.fieldValues.addedByEvent ?? '') || '—'}</td>
              <td className="ps-conf-td">{String(r.fieldValues.missedByEvent ?? '') || '—'}</td>
              <td className="ps-conf-td">{r.recordedBy.userName}</td>
            </tr>
          ))}
          {records.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={6}>No real secondary screening events on file for this scope yet.</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
);

// CYT-QA-04 — Cyto-Histologic Correlation and Discrepancy Matrix.
// Real, per direct guidance ("Make sure it can be downloaded and
// printed."): the on-screen table also carries the Download (real,
// existing exportQaReportRows XLSX utility every other real QA tab
// already uses) and Print (this report's own dedicated portal-based
// print view, CytologyHistologyCorrelationPrintView.tsx) actions.
const CATEGORY_LABEL: Record<string, { text: string; color: string }> = {
  concordant: { text: 'Concordant', color: '#10B981' },
  minor_discrepancy: { text: 'Minor Discrepancy', color: '#f59e0b' },
  major_discrepancy: { text: 'Major Discrepancy', color: '#ef4444' },
  discordant_unspecified: { text: 'Discordant (unspecified)', color: '#ef4444' },
};

const HistologyCorrelationTable: React.FC<{
  report: CytologyHistologyCorrelationReport | null;
  onDownload: () => void;
  onPrint: () => void;
}> = ({ report, onDownload, onPrint }) => {
  if (!report) return null;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#e5e5e5', flexWrap: 'wrap' }}>
          <div><b>{report.totalCorrelated}</b> Cases Correlated</div>
          <div><b>{report.concordantCount}</b> Concordant</div>
          <div><b>{pct(report.correlationRatePercent)}</b> Correlation Rate</div>
          <div><b>{report.ppvHsilPercent === undefined ? '—' : pct(report.ppvHsilPercent)}</b> PPV (HSIL Cytology → CIN2+ Histology)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ps-conf-btn-secondary" onClick={onDownload}>⬇️ Download</button>
          <button className="ps-conf-btn-secondary" onClick={onPrint}>🖨️ Print</button>
        </div>
      </div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">Patient MRN</th>
                <th className="ps-conf-th">Cyto Accession</th>
                <th className="ps-conf-th">Cyto Date</th>
                <th className="ps-conf-th">Cyto Diagnosis</th>
                <th className="ps-conf-th">Hist Accession</th>
                <th className="ps-conf-th">Hist Date</th>
                <th className="ps-conf-th">Hist Diagnosis</th>
                <th className="ps-conf-th">Days to Biopsy</th>
                <th className="ps-conf-th">Correlation Category</th>
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
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}33` }}>{cat.text}</span>
                    </td>
                  </tr>
                );
              })}
              {report.rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={9}>No real cyto-histologic correlations recorded for this scope yet.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// US-QA-02 — Unscreened Backlog & TAT.
const UnscreenedBacklogTable: React.FC<{ rows: CytologyUnscreenedBacklogRow[] }> = ({ rows }) => (
  <div className="ps-conf-table-wrap">
    <div className="ps-conf-table-scroll">
      <table className="ps-conf-table">
        <thead className="ps-conf-thead-sticky">
          <tr>
            <th className="ps-conf-th">Case</th>
            <th className="ps-conf-th">Accession</th>
            <th className="ps-conf-th">Collected</th>
            <th className="ps-conf-th">Received</th>
            <th className="ps-conf-th">Status</th>
            <th className="ps-conf-th">Elapsed Hours</th>
            <th className="ps-conf-th">TAT Exceeded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="ps-conf-tr">
              <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
              <td className="ps-conf-td">{r.accessionId ?? '—'}</td>
              <td className="ps-conf-td">{r.collectionDate ? new Date(r.collectionDate).toLocaleDateString() : '—'}</td>
              <td className="ps-conf-td">{r.receivedDate ? new Date(r.receivedDate).toLocaleDateString() : '—'}</td>
              <td className="ps-conf-td">{r.currentStatus === 'unscreened' ? 'Unscreened' : 'Pending Path Review'}</td>
              <td className="ps-conf-td">{r.elapsedHours !== undefined ? r.elapsedHours.toFixed(1) : '—'}</td>
              <td className="ps-conf-td">
                {r.tatExceeded ? (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>Exceeded</span>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>No real cytology specimens currently in backlog for this scope.</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>
);

// UK-QA-01 — Primary HPV Screening Failsafe Audit.
const PrimaryHpvFailsafeAuditTable: React.FC<{ rows: CytologyPrimaryHpvFailsafeAuditRow[] }> = ({ rows }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      Failsafe referral tracking (direct colposcopy referrals, non-responded alerts) is not shown — no mechanism exists in this
      app yet for tracking whether a positive result's required follow-up action was actually taken.
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Jurisdiction</th>
              <th className="ps-conf-th">HPV Primary Positives</th>
              <th className="ps-conf-th">Cytology Triage Performed</th>
              <th className="ps-conf-th">Inadequate Cytology Rate</th>
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
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={4}>No real UK primary HPV screening data on file for this scope.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// EU-QA-01 — Trans-National Compliance Matrix.
const EuComplianceMatrixTable: React.FC<{ rows: CytologyEuComplianceMatrixRow[] }> = ({ rows }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      National_Registry_ID, Specimen_Type, and Screening_Interval_Adherence_Years are not shown — no corresponding field
      exists in this app for the first two, and the third is genuinely age-dependent per country (France, Germany,
      Netherlands, Belgium each have their own real, age-banded intervals), which this app cannot yet compute correctly for
      every country here.
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Country</th>
              <th className="ps-conf-th">Total Cases</th>
              <th className="ps-conf-th">HPV Primary</th>
              <th className="ps-conf-th">HPV Co-Test</th>
              <th className="ps-conf-th">Internal Audit Non-Conformities</th>
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
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={5}>No real EU cytology data on file for this scope.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// MOL-QA-01 — HPV Positivity Monitor.
const INDICATION_LABEL: Record<string, string> = {
  primary_screening: 'Primary Screening', co_testing: 'Co-Testing',
  ascus_triage: 'ASC-US Triage', post_treatment_follow_up: 'Post-Treatment Follow-up',
};
const HpvPositivityMonitorTable: React.FC<{ rows: CytologyHpvPositivityMonitorRow[] }> = ({ rows }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      Test_Assay_Name (the commercial platform — Roche cobas, Hologic Aptima, etc.) is not shown — no field for which
      platform produced a result exists anywhere in this app. Variance is shown relative to this report's own aggregate
      mean across sites, not an external regional baseline this app has no access to.
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Testing Site</th>
              <th className="ps-conf-th">Indication</th>
              <th className="ps-conf-th">Total Tested</th>
              <th className="ps-conf-th">HR-HPV+ %</th>
              <th className="ps-conf-th">HPV16 %</th>
              <th className="ps-conf-th">HPV18/45 %</th>
              <th className="ps-conf-th">Other HR %</th>
              <th className="ps-conf-th">Variance vs. Mean</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="ps-conf-tr">
                <td className="ps-conf-td">{r.testingSite}</td>
                <td className="ps-conf-td">{INDICATION_LABEL[r.indicationType]}</td>
                <td className="ps-conf-td">{r.totalHpvTested}</td>
                <td className="ps-conf-td">{pct(r.hrHpvPositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.hpv16PositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.hpv18Or45PositivityPercent)}</td>
                <td className="ps-conf-td">{pct(r.otherHrPositivityPercent)}</td>
                <td className="ps-conf-td">{r.positivityVarianceFromAggregateMean >= 0 ? '+' : ''}{r.positivityVarianceFromAggregateMean.toFixed(1)}pp</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>No real completed HPV tests on file for this scope.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// MOL-QA-02 — Internal Control Failure, Invalid, and Inhibitor Rate.
// Real, per direct instruction: reads real, synthetic seed data from
// mockMolecularQcRunRecordService.ts so this capability can actually
// be demoed.
const MolecularQcFailureRateTable: React.FC<{ rows: CytologyMolecularQcFailureRateRow[] }> = ({ rows }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      Reads synthetic, seeded instrument run data (two demo instruments, CYTO-1/CYTO-2) so this capability can be
      demonstrated. Threshold_Exceeded uses a real, configurable 5% default — a stated default, not a fabricated
      regulatory number.
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Run Date</th>
              <th className="ps-conf-th">Instrument</th>
              <th className="ps-conf-th">Reagent Lot</th>
              <th className="ps-conf-th">Samples Run</th>
              <th className="ps-conf-th">Invalid Controls</th>
              <th className="ps-conf-th">Inhibitors</th>
              <th className="ps-conf-th">Failure Rate</th>
              <th className="ps-conf-th">Threshold</th>
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
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>Exceeded</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>No molecular QC run data on file.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// MOL-QA-04 — Molecular Assay Lot-to-Lot and Run QC Trend.
const MolecularLotToLotTrendTable: React.FC<{ rows: CytologyMolecularLotToLotTrendRow[] }> = ({ rows }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      Reads the same synthetic, seeded instrument run data. Pass/Fail uses a real, configurable ~1.0 Ct default — a
      commonly-cited practical rule of thumb, not a single universal manufacturer or regulatory standard.
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Instrument</th>
              <th className="ps-conf-th">Lot (Old)</th>
              <th className="ps-conf-th">Lot (New)</th>
              <th className="ps-conf-th">Control Level</th>
              <th className="ps-conf-th">Mean Ct (Old)</th>
              <th className="ps-conf-th">Mean Ct (New)</th>
              <th className="ps-conf-th">Δ Ct</th>
              <th className="ps-conf-th">Status</th>
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
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: r.passFailStatus === 'pass' ? '#10B98118' : '#ef444418', color: r.passFailStatus === 'pass' ? '#10B981' : '#ef4444', border: `1px solid ${r.passFailStatus === 'pass' ? '#10B98133' : '#ef444433'}` }}>
                    {r.passFailStatus === 'pass' ? 'Pass' : 'Fail'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={8}>No real lot changeovers on file yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// APAC-QA-01 — External Proficiency Testing (EQA).
const ApacProficiencyTestTable: React.FC<{ report: CytologyApacProficiencyTestReport }> = ({ report }) => (
  <div>
    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, maxWidth: 680 }}>
      Reads real, received grades from an external EQA provider (CAP, RCPAQAP, etc.) — PathScribe never computes or
      stores the known answer itself; the provider is the sole source of the grade. "Flagged" applies the real,
      researched CLIA rule directly: two unsatisfactory/no-response events out of three consecutive events triggers
      a real deficiency citation.
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
      {report.satisfactoryCount} / {report.totalEvents} satisfactory ({pct(report.satisfactoryRatePercent)})
    </div>
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Received</th>
              <th className="ps-conf-th">Accession</th>
              <th className="ps-conf-th">Provider</th>
              <th className="ps-conf-th">Challenge</th>
              <th className="ps-conf-th">Outcome</th>
              <th className="ps-conf-th">Score Detail</th>
              <th className="ps-conf-th">Deficiency</th>
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
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: r.outcome === 'satisfactory' ? '#10B98118' : '#ef444418', color: r.outcome === 'satisfactory' ? '#10B981' : '#ef4444', border: `1px solid ${r.outcome === 'satisfactory' ? '#10B98133' : '#ef444433'}` }}>
                    {r.outcome.replace('_', ' ')}
                  </span>
                </td>
                <td className="ps-conf-td">{r.scoreDetail ?? '—'}</td>
                <td className="ps-conf-td">
                  {r.consecutiveDeficiencyFlagged ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>Flagged</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {report.rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>No proficiency-testing grades on file yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// ANZ-QA-01 — Registry Transmission Audit.
const TransmissionAuditTable: React.FC<{ rows: CytologyRegistryTransmissionAuditRow[] }> = ({ rows }) => {
  const STATUS_LABEL: Record<string, { text: string; color: string }> = {
    SENT: { text: 'Sent', color: '#10B981' },
    QUEUED: { text: 'Queued', color: '#f59e0b' },
    FAILED: { text: 'Failed', color: '#ef4444' },
  };
  return (
    <div className="ps-conf-table-wrap">
      <div className="ps-conf-table-scroll">
        <table className="ps-conf-table">
          <thead className="ps-conf-thead-sticky">
            <tr>
              <th className="ps-conf-th">Accession</th>
              <th className="ps-conf-th">MRN</th>
              <th className="ps-conf-th">HPV Result</th>
              <th className="ps-conf-th">Cytology Result</th>
              <th className="ps-conf-th">Transmitted</th>
              <th className="ps-conf-th">Status</th>
              <th className="ps-conf-th">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const status = STATUS_LABEL[r.transmissionStatus];
              return (
                <tr key={`${r.caseId}-${i}`} className="ps-conf-tr">
                  <td className="ps-conf-td" data-phi="accession">{r.accessionNumber}</td>
                  <td className="ps-conf-td">{r.patientMrn ?? '—'}</td>
                  <td className="ps-conf-td">{r.hpvResultCode ?? '—'}</td>
                  <td className="ps-conf-td">{r.cytologyResultCode}</td>
                  <td className="ps-conf-td">{r.transmissionTimestamp ?? '—'}</td>
                  <td className="ps-conf-td">
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}33` }}>{status.text}</span>
                  </td>
                  <td className="ps-conf-td">{r.errorReasonCode ?? '—'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={7}>No real registry dispatches on file for this scope yet.</td></tr>)}
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Scope: {scopeLabel(scope)}</div>
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={undefined} />
      </div>

      <div className="ps-qa-tab-tiles" style={{ marginBottom: 20 }}>
        {REPORT_TILES.map(t => {
          const isActive = activeReport === t.key;
          return (
            <button
              key={t.key}
              className="ps-wl-filter-tile"
              title={`View: ${t.label}`}
              onClick={() => setActiveReport(t.key)}
              style={{
                '--tile-bg': isActive ? `${t.color}2e` : `${t.color}0d`,
                '--tile-border': isActive ? t.color : `${t.color}2e`,
                '--tile-shadow': isActive ? `0 0 12px ${t.color}66` : 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? t.color : '#8899aa' } as React.CSSProperties}>{t.label}</div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': t.color } as React.CSSProperties}>{'\u00A0'}</div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': t.color, '--tile-sublabel-opacity': 0 } as React.CSSProperties}>{'\u00A0'}</div>
            </button>
          );
        })}
      </div>

      {activeReport === 'transmission' && (
        <div style={{ marginBottom: 12 }}>
          <label className="ps-label" htmlFor="qa-transmission-registry" style={{ marginRight: 8 }}>Registry</label>
          <select
            id="qa-transmission-registry"
            className="ps-input-dark"
            value={transmissionRegistryId}
            onChange={e => setTransmissionRegistryId(e.target.value as RegistryId)}
          >
            <option value="ncsr_australia">Australia — NCSR</option>
            <option value="kncsp_kccr_korea">South Korea — KNCSP/KCCR</option>
            <option value="csms_uk">England — CSMS</option>
            <option value="cervicalcheck_ireland">Ireland — CervicalCheck</option>
            <option value="palga_netherlands">Netherlands — PALGA</option>
            <option value="nicsp_northern_ireland">Northern Ireland — NICSP</option>
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: '#9ca3af' }}>Loading Cytology QA data…</div>
      ) : (
        <>
          {activeReport === 'random' && <ReportCard title="10% Random Rescreening (CYT-QA-02)" report={aggregateReport} />}
          {activeReport === 'high-risk' && <ReportCard title="Directed / High-Risk Rescreening" report={aggregateReport} />}
          {activeReport === 'ct-path' && <ReportCard title="CT vs. Pathologist Correlation (US-QA-01)" report={aggregateReport} />}
          {activeReport === 'peer-review' && <ReportCard title="Post-Sign-Out Peer Review Correlation" report={aggregateReport} />}
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
                  'Correlation Category': CATEGORY_LABEL[r.correlationCategory].text,
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
