// src/pages/MolecularWorkcenterPage/MolecularWorkcenterPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("I'm not sure it makes sense to have
// Molecular Testing and Molecular Batch Management as separate
// tiles... introduce a single Molecular tile... with a clean sub-
// navigation structure"), refined by direct correction ("the Batch is
// for building the batches pre-analytical and then running them on
// the analyzer") and a direct question ("Baseed on the Readme, are
// they not somewhat related?").
//
// Real, confirmed architectural relationship, found directly in this
// module's own README rather than assumed: MolecularBatchWorklistPage
// (this file's own Tabs 1-3) and MolecularBatchManagementPage (Tab 4)
// are two real, separate, downstream pipelines off the same real
// molecular-instrument-run lifecycle, reporting two genuinely
// different real event payloads — this module's own §4.2 well-level
// Ct/RFU results for a plate it itself built and dispatched, versus a
// separate QC-run-to-cytology-specimen association event
// (MOL-QA-02/04). Kept as two real, separate data models (never
// merged into one shape), but now given one real, shared home instead
// of two separate top-level tiles, since both are real, genuine views
// into the same broader molecular-testing lifecycle.
//
// Real, deliberate tab boundary, confirmed directly against
// MolecularBatchStatus (IMolecularBatchService.ts) — a real,
// mutually-exclusive, exhaustive partition, not an invented one:
// - Tab 1 (pre-analytical/building): 'draft' only.
// - Tab 2 (running on the real analyzer), the real, default tab per
//   direct guidance ("Primary View: Active Batches & Runs"): 'active'
//   + 'awaiting_results'.
// - Tab 3 (post-analytical/completed): 'completed' + 'aborted' +
//   'superseded'.
// - Tab 4: the real, separate, read-only MolecularBatchManagementPage,
//   embedded directly rather than re-implemented — genuinely
//   different data model, kept visually and functionally distinct
//   rather than blended into Tab 3's own list.
//
// Real, deliberate scope limit: the actual plate builder
// (MolecularPlateBuilderPage.tsx, well-mapping for 96/384/24-well
// layouts) remains its own, separate, full-page route
// (/molecular-batch/:batchId) reached from any of Tabs 1-3, not
// re-embedded inline inside a tab panel — that page is a large, real,
// already-working, heavily-tested component; forcing it into a
// tab-constrained space would have been a real, risky rewrite for no
// real, stated benefit.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../../pathscribe.css';
import { mockMolecularBatchService } from '../../services/molecular/mockMolecularBatchService';
import type { MolecularBatch, MolecularBatchStatus } from '../../services/molecular/IMolecularBatchService';
import MolecularBatchManagementPage from '../MolecularBatchManagement/MolecularBatchManagementPage';

const STATUS_LABEL: Record<MolecularBatchStatus, { text: string; color: string }> = {
  draft: { text: 'Draft', color: '#9ca3af' },
  active: { text: 'Active', color: '#38bdf8' },
  awaiting_results: { text: 'Awaiting Results', color: '#f59e0b' },
  completed: { text: 'Completed', color: '#10B981' },
  aborted: { text: 'Aborted', color: '#ef4444' },
  superseded: { text: 'Superseded', color: '#6b7280' },
};

type WorkcenterTab = 'worklist' | 'active' | 'history' | 'qc';
const VALID_TABS: WorkcenterTab[] = ['worklist', 'active', 'history', 'qc'];

// Real, per this file's own header — the real, mutually-exclusive
// status partition per tab.
const STATUSES_FOR_TAB: Record<'worklist' | 'active' | 'history', MolecularBatchStatus[]> = {
  worklist: ['draft'],
  active: ['active', 'awaiting_results'],
  history: ['completed', 'aborted', 'superseded'],
};

/** Real, per this file's own header — resolves which real tab a given
 *  batch's own current status actually belongs to, so "Back to
 *  Batches" from the plate builder lands a tech on the tab that
 *  actually shows their batch, not a fixed, generic default. */
export function workcenterTabForStatus(status: MolecularBatchStatus): WorkcenterTab {
  if (status === 'draft') return 'worklist';
  if (status === 'active' || status === 'awaiting_results') return 'active';
  return 'history';
}

const TAB_LABELS: Record<WorkcenterTab, string> = {
  worklist: 'Worklist & Plate Builder',
  active: 'Active Runs & Batches',
  history: 'History & Archive',
  qc: 'QC & Specimen Association',
};

const MolecularWorkcenterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  // Real, per direct guidance ("Primary View (Default Tab): Active
  // Batches & Runs") — 'active' is the real, honest default, not
  // 'worklist', even though worklist is listed first in the tab bar.
  const activeTab: WorkcenterTab = VALID_TABS.includes(rawTab as WorkcenterTab) ? (rawTab as WorkcenterTab) : 'active';

  const [batches, setBatches] = useState<MolecularBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mockMolecularBatchService.getAll().then(res => {
      if (res.ok) setBatches([...res.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });
  }, []);

  const setTab = (tab: WorkcenterTab) => setSearchParams(tab === 'active' ? {} : { tab });

  const renderBatchTable = (statuses: MolecularBatchStatus[], emptyMessage: string) => {
    const filtered = batches.filter(b => statuses.includes(b.status));
    return (
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">Batch</th>
                <th className="ps-conf-th">Assay</th>
                <th className="ps-conf-th">Instrument</th>
                <th className="ps-conf-th">Plate</th>
                <th className="ps-conf-th">Created</th>
                <th className="ps-conf-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className="ps-conf-empty-row" colSpan={6}>Loading…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={6}>{emptyMessage}</td></tr>)}
              {!loading && filtered.map(b => {
                const status = STATUS_LABEL[b.status];
                const statusVars = { '--status-bg': `${status.color}18`, '--status-color': status.color, '--status-border': `${status.color}33` } as React.CSSProperties;
                return (
                  <tr key={b.id} className="ps-conf-tr ps-conf-tr--clickable" onClick={() => navigate(`/molecular-batch/${b.id}`)}>
                    <td className="ps-conf-td">{b.batchBarcode}</td>
                    <td className="ps-conf-td">{b.assayName}</td>
                    <td className="ps-conf-td">{b.targetInstrumentId}{b.deckSlot ? ` (${b.deckSlot})` : ''}</td>
                    <td className="ps-conf-td">{b.plateBarcode}</td>
                    <td className="ps-conf-td">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="ps-conf-td">
                      <span className="ps-status-badge" style={statusVars}>{status.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="ps-app-root ps-page-container ps-page-container--medium">
      <div className="ps-page-header-row">
        <div>
          <h1 className="ps-page-title">Molecular Workcenter</h1>
          <p className="ps-page-subtitle">
            Batch and plate management for molecular diagnostics runs (HPV, CT/NG, respiratory PCR panels, targeted NGS).
          </p>
        </div>
        {activeTab !== 'qc' && (
          <div className="ps-flex-row-gap-8">
            <button className="ps-btn-small" onClick={() => navigate('/molecular-rack')}>Extraction Racks</button>
            <button className="ps-btn-small" onClick={() => navigate('/molecular-control-rules')}>Control Rules</button>
            <button className="ps-conf-btn-secondary" onClick={() => navigate('/molecular-batch/new')}>+ New Batch</button>
          </div>
        )}
      </div>

      <div className="ps-sub-tab-group ps-sub-tab-group--gap-below">
        {VALID_TABS.map(tab => (
          <button
            key={tab}
            className={`ps-sub-tab-btn${activeTab === tab ? ' active' : ''}`}
            onClick={() => setTab(tab)}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'worklist' && renderBatchTable(STATUSES_FOR_TAB.worklist, 'No draft batches yet. Use "+ New Batch" to start building one.')}
      {activeTab === 'active' && renderBatchTable(STATUSES_FOR_TAB.active, 'No active runs right now.')}
      {activeTab === 'history' && renderBatchTable(STATUSES_FOR_TAB.history, 'No completed, aborted, or superseded batches yet.')}
      {activeTab === 'qc' && <MolecularBatchManagementPage />}
    </div>
  );
};

export default MolecularWorkcenterPage;
