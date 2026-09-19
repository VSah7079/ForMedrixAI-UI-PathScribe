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
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentScanStation } from '@/hooks/useCurrentScanStation';
import { batchService, hardwareContainerRegistryService } from '@/services';
import { playScanBeep, playScanErrorTone } from '@/utils/playScanBeep';
import type { ScanEvent } from '@/contexts/ScannerProvider';
import type { Batch, BatchProcessingNode } from '@/services/batches/IBatchService';
import { BATCH_PROCESSING_NODES } from '@/services/batches/IBatchService';
import NewContainerModal from './NewContainerModal';
import BatchDetailView from './BatchDetailView';

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
  'Decal / Special Processing': '#F59E0B', Processing: '#536EEA', Embedding: '#53E2EA',
  'Microtomy / Sectioning': '#8B5CF6', Staining: '#EC4899', Checkout: '#10B981', 'External Referral': '#F43F5E',
  // Real, additive — per the Protocol-Driven Workflow Infrastructure
  // story's Part 2a. Three genuinely distinct hues from every node
  // above, same real "the tile itself carries meaning at a glance"
  // reasoning.
  'Cytology Processing': '#0EA5E9', 'Cytology Staining': '#D946EF', 'Cytology Imaging': '#84CC16',
};
function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

const BatchManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('batchManagement.pageTitle'), '/batch-management'); }, [pushCrumb, t]);
  const { user } = useAuth();
  const { stationId } = useCurrentScanStation();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [lookupValue, setLookupValue] = useState('');
  const [stageFilter, setStageFilter] = useState<BatchProcessingNode | null>(null);
  const lookupRef = useRef<HTMLInputElement>(null);

  const [prefillRackId, setPrefillRackId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await batchService.getAll();
    if (res.ok) setBatches(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const selectedBatch = batches.find(b => b.id === selectedBatchId) ?? null;

  // Real feature, per direct, detailed specification ("Container &
  // Batch Label Management," FR-2.2): "Scanning a valid container
  // string immediately creates or loads an active batch record." Three
  // real, distinct outcomes: (1) an existing batch's own masterBarcode
  // — open it directly. (2) a real, registered, currently-Available
  // hardware rack with no active batch of its own yet — the spec's own
  // Mode B "instantiate a new software batch session" — opens New
  // Container pre-filled with that rack (protocol/processing node
  // still need a real, human answer; never silently fabricated). (3)
  // neither — a real, honest "not found."
  const handleLookup = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const batchRes = await batchService.getByMasterBarcode(value);
    if ('ok' in batchRes && batchRes.ok) {
      setSelectedBatchId(batchRes.data.id);
      setLookupValue('');
      playScanBeep();
      return;
    }
    const rackRes = await hardwareContainerRegistryService.getByRackId(value);
    if ('ok' in rackRes && rackRes.ok && rackRes.data.status === 'Available') {
      setLookupValue('');
      playScanBeep();
      setPrefillRackId(rackRes.data.rackId);
      setShowCreate(true);
      return;
    }
    playScanErrorTone();
    if ('ok' in rackRes && rackRes.ok) {
      toast.error(t('batchManagement.rackCheckedOutError', { value }));
    } else {
      toast.error(t('batchManagement.notFoundError', { value }));
    }
  }, [t]);

  // Real feature, per the spec's own "Master Barcode Lookup: Scanning a
  // master batch barcode on any workstation displays its active
  // manifest." Listens to the same real, global PATHSCRIBE_SCAN event
  // ScannerProvider (contexts/ScannerProvider.tsx) already dispatches —
  // only acts on it while this page is mounted and no batch is
  // currently open (once a batch is open, BatchDetailView.tsx's own
  // listener takes over scan handling for adding/reconciling items).
  // Real, spec-compliant prefixes (FR-1.2): CONT- (disposable) or
  // RACK- (semi-permanent) — replaces this file's own earlier,
  // pre-spec "BATCH:" prefix, which no real container barcode ever
  // carries now.
  useEffect(() => {
    if (selectedBatchId) return;
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      const upper = scanEvent?.raw?.trim().toUpperCase();
      if (upper?.startsWith('CONT-') || upper?.startsWith('RACK-')) {
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
        allBatches={batches}
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
            <h1 className="ps-batch-page-title">📦 {t('batchManagement.pageTitle')}</h1>
            <p className="ps-batch-page-subtitle">
              {t('batchManagement.pageSubtitle')}
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
                  title={isActive ? t('batchManagement.filterTileTitleActive', { node: t(`batchManagement.nodes.${node}`) }) : t('batchManagement.filterTileTitle', { node: t(`batchManagement.nodes.${node}`) })}
                  onClick={() => setStageFilter(isActive ? null : node)}
                  style={{
                    '--tile-bg': isActive ? `${color}2e` : `${color}0d`,
                    '--tile-border': isActive ? color : `${color}2e`,
                    '--tile-shadow': isActive ? `0 0 12px ${color}66` : 'none',
                  } as React.CSSProperties}
                >
                  <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? color : '#8899aa' } as React.CSSProperties}>
                    {t(`batchManagement.nodeTileLabel.${node}`)}
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
            {/* Real feature, per direct follow-up: "the client selects
                the disposal tile and the system delivers a list of
                specimens that qualify for disposal." A real,
                distinct tile, not a stageFilter toggle like the ones
                above — this one navigates to the real, computed
                disposal queue (DisposalQueuePage.tsx) instead of
                filtering the batch list in place, since disposal no
                longer runs through the batch/container model at all
                (see IBatchService.ts's own header for why). */}
            <button
              className="ps-wl-filter-tile"
              title={t('batchManagement.disposalTitle')}
              onClick={() => navigate('/batch-management/disposal')}
              style={{
                '--tile-bg': '#DC26260d', '--tile-border': '#DC26262e', '--tile-shadow': 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': '#8899aa' } as React.CSSProperties}>
                {t('batchManagement.disposalTile')}
              </div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': '#DC2626' } as React.CSSProperties}>
                🗑️
              </div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': '#DC2626', '--tile-sublabel-opacity': 0 } as React.CSSProperties}>
                {'\u00A0'}
              </div>
            </button>
            {/* Real feature — Stain QC Module §2.5 waste
                tracking/reporting. Same real, distinct-tile-navigates-
                to-its-own-page pattern as Disposal immediately above
                — this one is read-only reporting on already-disposed
                items (DisposalReportPage.tsx), never the disposal
                action itself. */}
            <button
              className="ps-wl-filter-tile"
              title={t('batchManagement.disposalReportTitle')}
              onClick={() => navigate('/batch-management/disposal-report')}
              style={{
                '--tile-bg': '#8B5CF60d', '--tile-border': '#8B5CF62e', '--tile-shadow': 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': '#8899aa' } as React.CSSProperties}>
                {t('batchManagement.disposalReportTile')}
              </div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': '#8B5CF6' } as React.CSSProperties}>
                📊
              </div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': '#8B5CF6', '--tile-sublabel-opacity': 0 } as React.CSSProperties}>
                {' '}
              </div>
            </button>
            {/* Real feature, per direct follow-up: "the pending batch
                queue has no UI at all... the natural place for this
                is a new tab/section [in Batch Management]." Same
                real, distinct-tile-navigates-to-its-own-page pattern
                as Disposal immediately above, not a stageFilter
                toggle — this is a genuinely different, computed list
                (computePendingBatchQueue.ts), not a filtered view of
                the batches already shown below. Emoji rather than a
                live count, same real reasoning as Disposal's own
                tile: avoids a second, extra fetch on this page purely
                to populate one tile's own number. */}
            <button
              className="ps-wl-filter-tile"
              title={t('batchManagement.pendingLoadTitle')}
              onClick={() => navigate('/batch-management/pending-load')}
              style={{
                '--tile-bg': '#EAB3080d', '--tile-border': '#EAB3082e', '--tile-shadow': 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': '#8899aa' } as React.CSSProperties}>
                {t('batchManagement.pendingLoadTile')}
              </div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': '#EAB308' } as React.CSSProperties}>
                📥
              </div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': '#EAB308', '--tile-sublabel-opacity': 0 } as React.CSSProperties}>
                {'\u00A0'}
              </div>
            </button>
            {/* Real feature, per direct guidance's own confirmed
                architectural verdict on the Engraver Monitor
                requirement (Option 3: thin, read-only status surface).
                Same real, distinct-tile-navigates-to-its-own-page
                pattern as Disposal/Pending Load above. */}
            <button
              className="ps-wl-filter-tile"
              title={t('batchManagement.engraverMonitorTitle')}
              onClick={() => navigate('/batch-management/engraver-monitor')}
              style={{
                '--tile-bg': '#38bdf80d', '--tile-border': '#38bdf82e', '--tile-shadow': 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': '#8899aa' } as React.CSSProperties}>
                {t('batchManagement.engraverMonitorTile')}
              </div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': '#38bdf8' } as React.CSSProperties}>
                🖨️
              </div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': '#38bdf8', '--tile-sublabel-opacity': 0 } as React.CSSProperties}>
                {'\u00A0'}
              </div>
            </button>
          </div>

          <div className="ps-batch-toolbar">
            <input
              ref={lookupRef}
              className="ps-batch-lookup-input"
              type="text"
              placeholder={t('batchManagement.lookupPlaceholder')}
              value={lookupValue}
              onChange={e => setLookupValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(lookupValue); }}
            />
            <button className="ps-btn-primary" onClick={() => setShowCreate(true)}>🖨️ {t('batchManagement.newContainer')}</button>
          </div>

          {loading ? (
            <div className="ps-batch-empty">{t('batchManagement.loading')}</div>
          ) : (
            <>
              <div className="ps-batch-section-label">{t('batchManagement.activeSectionLabel', { count: activeBatches.length })}</div>
              {activeBatches.length === 0 ? (
                <div className="ps-batch-empty">{t('batchManagement.emptyActive')}</div>
              ) : (
                <div className="ps-batch-list">
                  {activeBatches.map(b => (
                    <div key={b.id} className="ps-batch-row" onClick={() => setSelectedBatchId(b.id)}>
                      <span className="ps-batch-row-status" style={{ background: `${STATUS_COLOR[b.status]}22`, color: STATUS_COLOR[b.status] }}>
                        {t(`batchManagement.status.${b.status}`)}
                      </span>
                      <span className="ps-batch-row-barcode">{b.masterBarcode}</span>
                      <span className="ps-batch-row-node">{t(`batchManagement.nodes.${b.processingNode}`)}</span>
                      <span className="ps-batch-row-protocol">{b.protocol}</span>
                      {b.priority === 'STAT' && <span className="ps-batch-row-stat">{t('newContainerModal.stat')}</span>}
                      <span className="ps-batch-row-count">{t('batchManagement.itemCount', { count: b.items.length })}</span>
                      <span className="ps-batch-row-time">{formatTimestamp(b.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}

              {closedBatches.length > 0 && (
                <>
                  <div className="ps-batch-section-label">{t('batchManagement.closedSectionLabel', { count: closedBatches.length })}</div>
                  <div className="ps-batch-list">
                    {closedBatches.map(b => (
                      <div key={b.id} className="ps-batch-row ps-batch-row--closed" onClick={() => setSelectedBatchId(b.id)}>
                        <span className="ps-batch-row-status" style={{ background: `${STATUS_COLOR[b.status]}22`, color: STATUS_COLOR[b.status] }}>
                          {t(`batchManagement.status.${b.status}`)}
                        </span>
                        <span className="ps-batch-row-barcode">{b.masterBarcode}</span>
                        <span className="ps-batch-row-node">{t(`batchManagement.nodes.${b.processingNode}`)}</span>
                        <span className="ps-batch-row-protocol">{b.protocol}</span>
                        <span className="ps-batch-row-count">{t('batchManagement.itemCount', { count: b.items.length })}</span>
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
        <NewContainerModal
          onClose={() => { setShowCreate(false); setPrefillRackId(null); }}
          onCreated={(batch) => { setShowCreate(false); setPrefillRackId(null); refresh(); setSelectedBatchId(batch.id); }}
          userId={user?.id ?? 'unknown'}
          userName={user?.name ?? 'Unknown User'}
          stationId={stationId}
          initialRackId={prefillRackId ?? undefined}
        />
      )}
    </div>
  );
};

export default BatchManagementPage;
