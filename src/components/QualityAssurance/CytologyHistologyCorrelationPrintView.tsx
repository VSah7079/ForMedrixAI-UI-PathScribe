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

import React from 'react';
import ReactDOM from 'react-dom';
import type { CytologyHistologyCorrelationReport } from '@/services/cytology/resolveCytologyHistologyCorrelationReport';

const pct = (n: number) => `${n.toFixed(1)}%`;

const CATEGORY_LABEL: Record<string, string> = {
  concordant: 'Concordant',
  minor_discrepancy: 'Minor Discrepancy',
  major_discrepancy: 'Major Discrepancy',
  discordant_unspecified: 'Discordant (unspecified)',
};

export const CytologyHistologyCorrelationPrintView: React.FC<{ report: CytologyHistologyCorrelationReport; scopeLabel: string; onClose: () => void }> = ({ report, scopeLabel, onClose }) => {
  return ReactDOM.createPortal(
    <div className="ps-overlay ps-cyto-histo-print-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-cyto-histo-print-modal ps-cyto-histo-print-area" onClick={e => e.stopPropagation()}>
        <div className="ps-cyto-histo-print-header">
          <div>
            <div className="ps-cyto-histo-print-title">CYT-QA-04 — Cyto-Histologic Correlation and Discrepancy Matrix</div>
            <div className="ps-cyto-histo-print-scope">Scope: {scopeLabel} — Generated {new Date().toLocaleString()}</div>
          </div>
          <div className="ps-cyto-histo-print-header-actions">
            <button className="ps-btn-small" onClick={() => window.print()}>🖨️ Print</button>
            <button className="ps-btn-small" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="ps-cyto-histo-print-summary">
          <div><b>{report.totalCorrelated}</b> Cases Correlated</div>
          <div><b>{report.concordantCount}</b> Concordant</div>
          <div><b>{pct(report.correlationRatePercent)}</b> Correlation Rate</div>
          <div><b>{report.ppvHsilPercent === undefined ? '—' : pct(report.ppvHsilPercent)}</b> PPV (HSIL Cytology → CIN2+ Histology)</div>
        </div>

        <table className="ps-cyto-histo-print-table">
          <thead>
            <tr>
              <th>Patient MRN</th>
              <th>Cyto Accession</th>
              <th>Cyto Date</th>
              <th>Cyto Diagnosis</th>
              <th>Hist Accession</th>
              <th>Hist Date</th>
              <th>Hist Diagnosis</th>
              <th>Days to Biopsy</th>
              <th>Correlation Category</th>
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
                <td>{CATEGORY_LABEL[r.correlationCategory]}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16 }}>No correlations recorded for this scope yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
};
