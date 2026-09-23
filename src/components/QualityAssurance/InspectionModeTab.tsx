// src/components/QualityAssurance/InspectionModeTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-108, Story 6.1/6.2/6.3 — Inspection Mode: "one-click export of all QA
// evidence for the last 24 months," "drill-down access to underlying cases,"
// "the binder maps each QA activity to the relevant regulatory clause for
// each supported nation." Built on resolveQaEvidenceBinder.ts — see that
// file's own header for the honest, disclosed scope notes on the real
// regulatory-clause mapping and the real, honestly-computed CAPA-threshold
// proxy (this app doesn't store a literal QA-record-to-raised-deficiency
// link).
//
// Real, disclosed scope limit: CSV download only (same real
// exportQaReportRows every other QA tab already uses) — a dedicated print
// layout is a genuinely separate, real piece of work (see
// CytologyHistologyCorrelationPrintView.tsx, built as its own file for one
// specific report), not fabricated here for a first pass.
//
// i18n note: the CSV export in handleExportAll (column headers and cell
// values like "Concordant"/"Yes"/"No jurisdiction configured") is exported
// data and stays literal English, unchanged from the on-screen translated
// text. "CAPA" (Corrective And Preventive Action) is kept literal within
// translated sentences, matching this codebase's existing CAPA Engine
// strings elsewhere.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { mockQaActivityRecordService } from '@/services/quality/mockQaActivityRecordService';
import { mockQaActivityTypeService } from '@/services/quality/mockQaActivityTypeService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { auditService } from '@/services';
import { resolveQaEvidenceBinder, type QaEvidenceBinderReport } from '@/services/quality/resolveQaEvidenceBinder';
import { JURISDICTION_LABELS } from '@/types/systemConfig';
import { exportQaReportRows } from './qaReportUtils';

const EMPTY_REPORT: QaEvidenceBinderReport = {
  windowMonths: 24, windowStart: new Date().toISOString(), generatedAt: new Date().toISOString(),
  totalRecords: 0, entries: [],
};

const WINDOW_OPTIONS = [12, 24, 36] as const;

export const InspectionModeTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [windowMonths, setWindowMonths] = useState<typeof WINDOW_OPTIONS[number]>(24);
  const [report, setReport] = useState<QaEvidenceBinderReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      auditService.logEvent({
        type: 'system', event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Inspection Mode tab (${windowMonths}mo), user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown', caseId: null, confidence: null,
      }).catch(() => {});
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([mockQaActivityRecordService.getAll(), mockQaActivityTypeService.getAll()]).then(([recordsRes, typesRes]) => {
      if (cancelled) return;
      if (recordsRes.ok && typesRes.ok) {
        setReport(resolveQaEvidenceBinder(recordsRes.data, typesRes.data, windowMonths));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [windowMonths]);

  const handleExportAll = () => {
    const rows = report.entries.flatMap(entry => entry.records.map(r => ({
      'Activity Type': entry.activityTypeName,
      'Regulatory Basis': entry.regulatoryBasis.map(b => `${JURISDICTION_LABELS[b.jurisdiction]}: ${b.clause}`).join(' | ') || 'No jurisdiction configured',
      Case: r.caseId,
      Specimen: r.specimenId ?? 'Case-level',
      Outcome: r.outcome === 'concordant' ? 'Concordant' : 'Discordant',
      Severity: r.severity ?? '—',
      'Meets CAPA Threshold': r.meetsCapaThreshold ? 'Yes' : 'No',
      Recorded: r.recordedAt,
      Reviewer: r.recordedByName,
    })));
    exportQaReportRows(rows, `qa-inspection-evidence-binder-${windowMonths}mo-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-page">{t('inspectionModeTab.loading')}</div>;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('inspectionModeTab.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('inspectionModeTab.subtitle')}
      </p>

      <div className="ps-qa-tab-toolbar ps-qa-tab-toolbar--center">
        <label className="ps-label ps-mr-8" htmlFor="inspection-window">{t('inspectionModeTab.windowLabel')}</label>
        <select
          id="inspection-window"
          className="ps-input-dark"
          value={windowMonths}
          onChange={e => setWindowMonths(Number(e.target.value) as typeof WINDOW_OPTIONS[number])}
        >
          {WINDOW_OPTIONS.map(m => <option key={m} value={m}>{t('inspectionModeTab.monthsOption', { count: m })}</option>)}
        </select>
        <button className="ps-conf-btn-secondary" onClick={handleExportAll}>{t('inspectionModeTab.downloadButton')}</button>
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('inspectionModeTab.summaryCardTitle')}</div>
        <div className="ps-inspectmode-summary-stats">
          <div><div className="ps-inspectmode-stat-value">{report.totalRecords}</div><div className="ps-inspectmode-stat-label">{t('inspectionModeTab.totalRecordsLabel')}</div></div>
          <div><div className="ps-inspectmode-stat-value">{report.entries.length}</div><div className="ps-inspectmode-stat-label">{t('inspectionModeTab.activityTypesLabel')}</div></div>
        </div>
        <div className="ps-inspectmode-window-range">
          {t('inspectionModeTab.windowRange', {
            start: new Date(report.windowStart).toLocaleDateString(),
            end: new Date(report.generatedAt).toLocaleDateString(),
          })}
        </div>
      </div>

      {report.entries.map(entry => {
        const expanded = expandedTypeId === entry.activityTypeId;
        return (
          <div key={entry.activityTypeId} className="ps-conf-card ps-conf-card--spaced">
            <div
              className="ps-inspectmode-type-header"
              onClick={() => setExpandedTypeId(expanded ? null : entry.activityTypeId)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedTypeId(expanded ? null : entry.activityTypeId); } }}
            >
              <div>
                <div className="ps-conf-card-title ps-inspectmode-type-title">{entry.activityTypeName}</div>
                <div className="ps-inspectmode-jurisdiction-row">
                  {entry.regulatoryBasis.length === 0 ? (
                    <span className="ps-inspectmode-no-jurisdiction">{t('inspectionModeTab.noJurisdictionConfigured')}</span>
                  ) : entry.regulatoryBasis.map(b => (
                    <span key={b.jurisdiction} title={b.clause} className="ps-inspectmode-jurisdiction-badge">
                      {JURISDICTION_LABELS[b.jurisdiction]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ps-inspectmode-header-stats">
                <span>{t('inspectionModeTab.recordsCount', { count: entry.totalRecords })}</span>
                <span className={entry.discordantCount > 0 ? 'ps-inspectmode-stat--discordant' : undefined}>{t('inspectionModeTab.discordantCount', { count: entry.discordantCount })}</span>
                <span className={entry.capaThresholdMetCount > 0 ? 'ps-inspectmode-stat--capa' : undefined}>{t('inspectionModeTab.capaThresholdCount', { count: entry.capaThresholdMetCount })}</span>
                <span>{expanded ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded && (
              <div className="ps-conf-table-wrap ps-mt-14">
                <div className="ps-conf-table-scroll">
                  <table className="ps-conf-table">
                    <thead className="ps-conf-thead-sticky">
                      <tr>
                        <th className="ps-conf-th">{t('qualityAssurance.common.case')}</th>
                        <th className="ps-conf-th">{t('qualityAssurance.common.specimen')}</th>
                        <th className="ps-conf-th">{t('cytologyQaTab.headers.outcome')}</th>
                        <th className="ps-conf-th">{t('qualityAssurance.common.severity')}</th>
                        <th className="ps-conf-th">{t('inspectionModeTab.recordedHeader')}</th>
                        <th className="ps-conf-th">{t('cytologyQaTab.secondaryScreeningTable.reviewer')}</th>
                        <th className="ps-conf-th">{t('inspectionModeTab.capaThresholdHeader')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.records.map(r => (
                        <tr key={r.recordId} className="ps-conf-tr">
                          <td className="ps-conf-td">
                            <button className="ps-conf-btn-row" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>{r.caseId}</button>
                          </td>
                          <td className="ps-conf-td">{r.specimenId ?? <em className="ps-defic-caselevel">{t('qualityAssurance.operations.caseLevel')}</em>}</td>
                          <td className="ps-conf-td">
                            <span className={`ps-inspectmode-outcome-badge ${r.outcome === 'concordant' ? 'ps-inspectmode-outcome-badge--concordant' : 'ps-inspectmode-outcome-badge--discordant'}`}>
                              {r.outcome === 'concordant' ? t('auditLog.statusLabels.concordant') : t('auditLog.statusLabels.discordant')}
                            </span>
                          </td>
                          <td className="ps-conf-td">{r.severity ?? '—'}</td>
                          <td className="ps-conf-td">{new Date(r.recordedAt).toLocaleDateString()}</td>
                          <td className="ps-conf-td">{r.recordedByName}</td>
                          <td className="ps-conf-td">{r.meetsCapaThreshold ? t('common.yes') : '—'}</td>
                        </tr>
                      ))}
                      {entry.records.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={7}>{t('inspectionModeTab.noRecords')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {report.entries.length === 0 && (
        <div className="ps-conf-card ps-conf-card--spaced ps-inspectmode-empty-state">
          {t('inspectionModeTab.noRecordsInWindow')}
        </div>
      )}
    </div>
  );
};
