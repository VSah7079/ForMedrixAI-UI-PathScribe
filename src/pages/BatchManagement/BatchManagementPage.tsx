// src/pages/BatchManagement/BatchManagementPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "LIS Batch Management
// module." See services/batches/IBatchService.ts's own header for the full
// architectural reasoning — built on real, already-existing scan/audio/
// tracking infrastructure, not a parallel system.
//
// Per direct follow-up: "I assumed we will access these abilities through
// a new main tile off the home page" — confirmed and wired (Home.tsx's own
// cards array), matching every other top-level module's own real access
// pattern exactly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../pathscribe.css';
import { toast } from 'react-toastify';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentScanStation } from '@/hooks/useCurrentScanStation';
import { batchService } from '@/services';
import { playScanBeep, playScanErrorTone } from '@/utils/playScanBeep';
import type { ScanEvent } from '@/contexts/ScannerProvider';
import type { Batch, BatchProcessingNode } from '@/services/batches/IBatchService';
import { BATCH_PROCESSING_NODES } from '@/services/batches/IBatchService';
import CreateBatchModal from './CreateBatchModal';
import BatchDetailView from './BatchDetailView';

const STATUS_LABEL: Record<Batch['status'], string> = {
  active: 'Active', reconciling: 'Reconciling', complete: 'Complete', aborted: 'Aborted',
};
const STATUS_COLOR: Record<Batch['status'], string> = {
  active: '#38bdf8', reconciling: '#f59e0b', complete: '#34d399', aborted: '#f87171',
};

/** Real feature, per direct follow-up: "we could do something similar
 *  to the worklist and have Tiles at the top." One distinct, real
 *  color per real processing node — same real reasoning as Worklist's
 *  own filter tiles (WorklistPage.tsx): a genuinely distinct hue per
 *  tile, not a repeated one, so the tile itself (not just its label
 *  text) carries real meaning at a glance. */
const NODE_COLOR: Record<BatchProcessingNode, string> = {
  Grossing: '#F59E0B', Processing: '#536EEA', Embedding: '#53E2EA',
  Microtomy: '#8B5CF6', Staining: '#EC4899', Checkout: '#10B981',
};

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

const BatchManagementPage: React.FC = () => {
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb('Batch Management', '/batch-management'); }, [pushCrumb]);
  const { user } = useAuth();
  const { stationId } = useCurrentScanStation();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [lookupValue, setLookupValue] = useState('');
  const [stageFilter, setStageFilter] = useState<BatchProcessingNode | null>(null);
  const lookupRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await batchService.getAll();
    if (res.ok) setBatches(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const selectedBatch = batches.find(b => b.id === selectedBatchId) ?? null;

  const handleLookup = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const res = await batchService.getByMasterBarcode(value);
    if (res.ok) {
      setSelectedBatchId(res.data.id);
      setLookupValue('');
      playScanBeep();
    } else {
      playScanErrorTone();
      toast.error(`No batch found for "${value}".`);
    }
  }, []);

  // Real feature, per the spec's own "Master Barcode Lookup: Scanning a
  // master batch barcode on any workstation displays its active
  // manifest." Listens to the same real, global PATHSCRIBE_SCAN event
  // ScannerProvider (contexts/ScannerProvider.tsx) already dispatches —
  // only acts on it while this page is mounted and no batch is
  // currently open (once a batch is open, BatchDetailView.tsx's own
  // listener takes over scan handling for adding/reconciling items).
  useEffect(() => {
    if (selectedBatchId) return;
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent?.raw?.trim().toUpperCase().startsWith('BATCH:')) {
        handleLookup(scanEvent.raw);
      }
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [selectedBatchId, handleLookup]);

  if (selectedBatch) {
    return (
      <BatchDetailView
        batch={selectedBatch}
        onBack={() => { setSelectedBatchId(null); refresh(); }}
        onBatchUpdated={(updated) => setBatches(prev => prev.map(b => b.id === updated.id ? updated : b))}
        userId={user?.id ?? 'unknown'}
        userName={user?.name ?? 'Unknown User'}
        stationId={stationId}
      />
    );
  }

  const activeBatches = batches
    .filter(b => b.status === 'active' || b.status === 'reconciling')
    .filter(b => !stageFilter || b.processingNode === stageFilter);
  const closedBatches = batches.filter(b => b.status === 'complete' || b.status === 'aborted');
  const activeCountByNode = (node: BatchProcessingNode) =>
    batches.filter(b => (b.status === 'active' || b.status === 'reconciling') && b.processingNode === node).length;

  return (
    <div className="ps-batch-page">
      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <div className="ps-batch-page-header">
            <h1 className="ps-batch-page-title">📦 Batch Management</h1>
            <p className="ps-batch-page-subtitle">
              Track groups of cassettes and slides through processing nodes (Grossing, Processing, Embedding,
              Microtomy, Staining, Checkout) via container barcodes — chain-of-custody scanning, reconciliation,
              and QA discrepancy logging.
            </p>
          </div>

          {/* Real feature, per direct follow-up: "we could do
              something similar to the worklist and have Tiles at the
              top." Same real ps-wl-filter-tile pattern Worklist's own
              status tiles already use (WorklistPage.tsx) — reused
              directly, not re-styled from scratch. Each tile's own
              count is real (active + reconciling batches currently at
              that node); clicking toggles a real filter on the list
              below, same real active-key-to-'off' toggle behavior as
              Worklist's own tiles. */}
          <div className="ps-batch-stage-tiles">
            {BATCH_PROCESSING_NODES.map(node => {
              const isActive = stageFilter === node;
              const count = activeCountByNode(node);
              const color = NODE_COLOR[node];
              return (
                <button
                  key={node}
                  className="ps-wl-filter-tile"
                  title={isActive ? `Showing: ${node} — click to reset` : `Filter by: ${node}`}
                  onClick={() => setStageFilter(isActive ? null : node)}
                  style={{
                    '--tile-bg': isActive ? `${color}2e` : `${color}0d`,
                    '--tile-border': isActive ? color : `${color}2e`,
                    '--tile-shadow': isActive ? `0 0 12px ${color}66` : 'none',
                  } as React.CSSProperties}
                >
                  <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? color : '#8899aa' } as React.CSSProperties}>
                    {node}
                  </div>
                  <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': color } as React.CSSProperties}>
                    {count}
                  </div>
                  <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': color, '--tile-sublabel-opacity': 0 } as React.CSSProperties}>
                    {'\u00A0'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="ps-batch-toolbar">
            <input
              ref={lookupRef}
              className="ps-batch-lookup-input"
              type="text"
              placeholder="Scan or enter a master batch barcode…"
              value={lookupValue}
              onChange={e => setLookupValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(lookupValue); }}
            />
            <button className="ps-btn-primary" onClick={() => setShowCreate(true)}>+ Create Batch</button>
          </div>

          {loading ? (
            <div className="ps-batch-empty">Loading batches…</div>
          ) : (
            <>
              <div className="ps-batch-section-label">Active &amp; Reconciling ({activeBatches.length})</div>
              {activeBatches.length === 0 ? (
                <div className="ps-batch-empty">No active batches. Create one to get started.</div>
              ) : (
                <div className="ps-batch-list">
                  {activeBatches.map(b => (
                    <div key={b.id} className="ps-batch-row" onClick={() => setSelectedBatchId(b.id)}>
                      <span className="ps-batch-row-status" style={{ background: `${STATUS_COLOR[b.status]}22`, color: STATUS_COLOR[b.status] }}>
                        {STATUS_LABEL[b.status]}
                      </span>
                      <span className="ps-batch-row-barcode">{b.masterBarcode}</span>
                      <span className="ps-batch-row-node">{b.processingNode}</span>
                      <span className="ps-batch-row-protocol">{b.protocol}</span>
                      {b.priority === 'STAT' && <span className="ps-batch-row-stat">STAT</span>}
                      <span className="ps-batch-row-count">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</span>
                      <span className="ps-batch-row-time">{formatTimestamp(b.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}

              {closedBatches.length > 0 && (
                <>
                  <div className="ps-batch-section-label">Complete &amp; Aborted ({closedBatches.length})</div>
                  <div className="ps-batch-list">
                    {closedBatches.map(b => (
                      <div key={b.id} className="ps-batch-row ps-batch-row--closed" onClick={() => setSelectedBatchId(b.id)}>
                        <span className="ps-batch-row-status" style={{ background: `${STATUS_COLOR[b.status]}22`, color: STATUS_COLOR[b.status] }}>
                          {STATUS_LABEL[b.status]}
                        </span>
                        <span className="ps-batch-row-barcode">{b.masterBarcode}</span>
                        <span className="ps-batch-row-node">{b.processingNode}</span>
                        <span className="ps-batch-row-protocol">{b.protocol}</span>
                        <span className="ps-batch-row-count">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</span>
                        <span className="ps-batch-row-time">{formatTimestamp(b.completedAt ?? b.abortedAt ?? b.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={(batch) => { setShowCreate(false); refresh(); setSelectedBatchId(batch.id); }}
          userId={user?.id ?? 'unknown'}
          userName={user?.name ?? 'Unknown User'}
          stationId={stationId}
        />
      )}
    </div>
  );
};

export default BatchManagementPage;
