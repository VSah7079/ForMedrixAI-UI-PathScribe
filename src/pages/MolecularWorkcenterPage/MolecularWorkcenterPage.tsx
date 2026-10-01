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
//
// i18n note: `b.batchBarcode`/`.assayName`/`.targetInstrumentId`/
// `.deckSlot`/`.plateBarcode` are real batch data — never translated.
// The `STATUS_LABEL`/`TAB_LABELS` maps' display text is on-screen only
// and has no export/persistence use in this file, so their values are
// translation keys directly (a `_KEY`-style split map wasn't needed
// since nothing here consumes the literal English text).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import '../../pathscribe.css';
import { molecularBatchService } from '@/services';
import type { MolecularBatch, MolecularBatchStatus } from '../../services/molecular/IMolecularBatchService';
import MolecularBatchManagementPage from '../MolecularBatchManagement/MolecularBatchManagementPage';

const STATUS_LABEL_KEY: Record<MolecularBatchStatus, { key: string; color: string }> = {
  draft:             { key: 'protocolShared.lifecycle.draft',              color: '#9ca3af' },
  active:            { key: 'common.active',                               color: '#38bdf8' },
  awaiting_results:  { key: 'molecularWorkcenterPage.status.awaitingResults', color: '#f59e0b' },
  completed:         { key: 'auditLog.statusLabels.completed',             color: '#10B981' },
  aborted:           { key: 'batchManagement.status.aborted',              color: '#ef4444' },
  superseded:        { key: 'molecularWorkcenterPage.status.superseded',   color: '#6b7280' },
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

const TAB_LABEL_KEY: Record<WorkcenterTab, string> = {
  worklist: 'molecularWorkcenterPage.tab.worklist',
  active:   'molecularWorkcenterPage.tab.active',
  history:  'molecularWorkcenterPage.tab.history',
  qc:       'molecularWorkcenterPage.tab.qc',
};

const MolecularWorkcenterPage: React.FC = () => {
  const { t } = useTranslation();
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
    molecularBatchService.getAll().then(res => {
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
                <th className="ps-conf-th">{t('microtomyWorkstation.hardware.batch')}</th>
                <th className="ps-conf-th">{t('molecularOrderQueue.col.assay')}</th>
                <th className="ps-conf-th">{t('molecularOrderQueue.typeInstrument')}</th>
                <th className="ps-conf-th">{t('molecularWorkcenterPage.plateHeader')}</th>
                <th className="ps-conf-th">{t('molecularRackWorklistPage.colCreated')}</th>
                <th className="ps-conf-th">{t('qualityAssurance.common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className="ps-conf-empty-row" colSpan={6}>{t('common.loading')}</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={6}>{emptyMessage}</td></tr>)}
              {!loading && filtered.map(b => {
                const status = STATUS_LABEL_KEY[b.status];
                const statusVars = { '--ps-hue': status.color } as React.CSSProperties;
                return (
                  <tr key={b.id} className="ps-conf-tr ps-conf-tr--clickable" onClick={() => navigate(`/molecular-batch/${b.id}`)}>
                    <td className="ps-conf-td">{b.batchBarcode}</td>
                    <td className="ps-conf-td">{b.assayName}</td>
                    <td className="ps-conf-td">{b.targetInstrumentId}{b.deckSlot ? ` (${b.deckSlot})` : ''}</td>
                    <td className="ps-conf-td">{b.plateBarcode}</td>
                    <td className="ps-conf-td">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="ps-conf-td">
                      <span className="ps-status-badge ps-status-badge--hued" style={statusVars}>{t(status.key)}</span>
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
          <h1 className="ps-page-title">{t('pathologyWorkspace.molecularTile.title')}</h1>
          <p className="ps-page-subtitle">
            {t('molecularWorkcenterPage.subtitle')}
          </p>
        </div>
        {activeTab !== 'qc' && (
          <div className="ps-flex-row-gap-8">
            <button className="ps-btn-small" onClick={() => navigate('/molecular-rack')}>{t('molecularRackWorklistPage.title')}</button>
            <button className="ps-btn-small" onClick={() => navigate('/molecular-control-rules')}>{t('molecularWorkcenterPage.controlRulesButton')}</button>
            <button className="ps-conf-btn-secondary" onClick={() => navigate('/molecular-batch/new')}>+ {t('molecularWorkcenterPage.newBatchButton')}</button>
          </div>
        )}
      </div>

      <div className="ps-sub-tab-group ps-sub-tab-group--gap-below">
        {VALID_TABS.map(tab => (
          <button
            key={tab}
            className={`ps-sub-tab-btn${activeTab === tab ? ' active' : ''}`}
            onClick={() => setTab(tab)}>
            {t(TAB_LABEL_KEY[tab])}
          </button>
        ))}
      </div>

      {activeTab === 'worklist' && renderBatchTable(STATUSES_FOR_TAB.worklist, t('molecularWorkcenterPage.emptyWorklist'))}
      {activeTab === 'active' && renderBatchTable(STATUSES_FOR_TAB.active, t('molecularWorkcenterPage.emptyActive'))}
      {activeTab === 'history' && renderBatchTable(STATUSES_FOR_TAB.history, t('molecularWorkcenterPage.emptyHistory'))}
      {activeTab === 'qc' && <MolecularBatchManagementPage />}
    </div>
  );
};

export default MolecularWorkcenterPage;
