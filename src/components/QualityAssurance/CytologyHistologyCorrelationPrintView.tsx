// src/components/QualityAssurance/CytologyHistologyCorrelationPrintView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Make sure it can be downloaded and
// printed." Real, deliberate reuse of this app's own already-proven
// print pattern (MaterialTrackingHistoryModal.tsx's own
// ps-mth-overlay/ps-mth-print-area), not a new one invented — a real,
// documented bug already exists in this app for any print feature
// that doesn't follow it: a real, global @media print rule
// (pathscribe.css) hides the entire app root except a small,
// explicit exemption list, since the app root itself is never the
// exempted shell. Rendered via a real React portal directly under
// document.body, exactly like the proven fix — CSS specificity alone
// cannot undo `display: none` on an ancestor no matter how correct
// this component's own print CSS is.
// ─────────────────────────────────────────────────────────────────────────────
//
// i18n note: this print view is a portal-rendered copy of
// CytologyQaTab.tsx's own on-screen histology-correlation table, so
// every summary label, column header and category label reuses that
// screen's own exact keys (`cytologyQaTab.histologyTable.*`/
// `.category.*`) rather than re-wording a duplicate report — the two
// should read identically. "CYT-QA-04" is this app's own internal QA
// metric identifier and stays literal, like other internal
// ticket/rule references elsewhere in the app. `r.cytoDiagnosis`/
// `r.histDiagnosis` (real diagnosis text) and every id/MRN/date value
// are real data, left as-is.

import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { CytologyHistologyCorrelationReport } from '@/services/cytology/resolveCytologyHistologyCorrelationReport';

const pct = (n: number) => `${n.toFixed(1)}%`;

const CATEGORY_LABEL_KEY: Record<string, string> = {
  concordant: 'cytologyQaTab.category.concordant',
  minor_discrepancy: 'cytologyQaTab.category.minorDiscrepancy',
  major_discrepancy: 'cytologyQaTab.category.majorDiscrepancy',
  discordant_unspecified: 'cytologyQaTab.category.discordantUnspecified',
};

export const CytologyHistologyCorrelationPrintView: React.FC<{ report: CytologyHistologyCorrelationReport; scopeLabel: string; onClose: () => void }> = ({ report, scopeLabel, onClose }) => {
  const { t } = useTranslation();
  return ReactDOM.createPortal(
    <div className="ps-overlay ps-cyto-histo-print-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-cyto-histo-print-modal ps-cyto-histo-print-area" onClick={e => e.stopPropagation()}>
        <div className="ps-cyto-histo-print-header">
          <div>
            <div className="ps-cyto-histo-print-title">{t('cytologyHistologyCorrelationPrintView.title')}</div>
            <div className="ps-cyto-histo-print-scope">{t('cytologyHistologyCorrelationPrintView.scopeLine', { scope: scopeLabel, date: new Date().toLocaleString() })}</div>
          </div>
          <div className="ps-cyto-histo-print-header-actions">
            <button className="ps-btn-small" onClick={() => window.print()}>🖨️ {t('cytologyQaTab.histologyTable.printButton')}</button>
            <button className="ps-btn-small" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>

        <div className="ps-cyto-histo-print-summary">
          <div><b>{report.totalCorrelated}</b> {t('cytologyQaTab.histologyTable.casesCorrelated')}</div>
          <div><b>{report.concordantCount}</b> {t('cytologyQaTab.category.concordant')}</div>
          <div><b>{pct(report.correlationRatePercent)}</b> {t('cytologyQaTab.histologyTable.correlationRate')}</div>
          <div><b>{report.ppvHsilPercent === undefined ? '—' : pct(report.ppvHsilPercent)}</b> {t('cytologyQaTab.histologyTable.ppvHsil')}</div>
        </div>

        <table className="ps-cyto-histo-print-table">
          <thead>
            <tr>
              <th>{t('cytologyQaTab.histologyTable.patientMrn')}</th>
              <th>{t('cytologyQaTab.histologyTable.cytoAccession')}</th>
              <th>{t('cytologyQaTab.histologyTable.cytoDate')}</th>
              <th>{t('cytologyQaTab.histologyTable.cytoDiagnosis')}</th>
              <th>{t('cytologyQaTab.histologyTable.histAccession')}</th>
              <th>{t('cytologyQaTab.histologyTable.histDate')}</th>
              <th>{t('cytologyQaTab.histologyTable.histDiagnosis')}</th>
              <th>{t('cytologyQaTab.histologyTable.daysToBiopsy')}</th>
              <th>{t('cytologyQaTab.histologyTable.correlationCategory')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.patientMrn ?? '—'}</td>
                <td>{r.cytoAccessionId ?? '—'}</td>
                <td>{r.cytoDate ? new Date(r.cytoDate).toLocaleDateString() : '—'}</td>
                <td>{r.cytoDiagnosis}</td>
                <td>{r.histAccessionId ?? '—'}</td>
                <td>{r.histDate ? new Date(r.histDate).toLocaleDateString() : '—'}</td>
                <td>{r.histDiagnosis}</td>
                <td>{r.daysToBiopsy ?? '—'}</td>
                <td>{t(CATEGORY_LABEL_KEY[r.correlationCategory])}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr><td className="ps-cyto-histo-print-empty-row" colSpan={9}>{t('cytologyQaTab.histologyTable.noCorrelationsYet')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
};
