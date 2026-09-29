// src/pages/BatchManagement/BatchDetailView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per the spec's own "Continuous Scanning... hands-free
// scanning mode must auto-accept input without requiring UI refocusing
// between scans" and "Out-of-Process Verification... Reconciliation &
// Verification." Listens to the same real, global PATHSCRIBE_SCAN event
// ScannerProvider (contexts/ScannerProvider.tsx) already dispatches for
// EVERY real scan app-wide — no focus management of its own needed, the
// global listener already works from anywhere on this page.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { batchService, stainTypeService, reagentLotService } from '@/services';
import { playScanBeep, playScanErrorTone } from '@/utils/playScanBeep';
import { getDecalTimerState, formatDecalDuration } from '@/services/batches/DecalBatch';
import { referralTrackingService } from '@/services';
import type { ReferralTracking } from '@/services/referral/IReferralTrackingService';
import type { ScanEvent } from '@/contexts/ScannerProvider';
import type { Batch, BatchItem } from '@/services/batches/IBatchService';
import type { StainType } from '@/services/stains/IStainService';
import type { ReagentLot } from '@/services/reagentLots/IReagentLotService';

interface Props {
  batch: Batch;
  onBack: () => void;
  onBatchUpdated: (batch: Batch) => void;
  userId: string;
  userName: string;
  stationId: string | null;
  /** Real feature, per direct follow-up: "Is there a mechanism to move
   *  an asset from one container to the other?" Every other real,
   *  currently-loaded batch — filtered down to real, 'active' ones
   *  (excluding this one) for the move-to picker. Passed down from
   *  BatchManagementPage.tsx's own already-loaded `batches` state
   *  rather than a second, separate fetch here. */
  allBatches: Batch[];
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

// Real, colors only — the label itself now reuses the shared
// batchManagement.status.* keys already established by
// BatchManagementPage.tsx's own identical status set.
const STATUS_COLOR: Record<Batch['status'], string> = {
  active: '#38bdf8', reconciling: '#f59e0b', complete: '#34d399', aborted: '#f87171',
};

const BatchDetailView: React.FC<Props> = ({ batch, onBack, onBatchUpdated, userId, userName, allBatches }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [showAbort, setShowAbort] = useState(false);
  const [abortReason, setAbortReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
  // Laboratory Specimen Referral gap — fetched fresh per batch, since
  // a real referral's own status can change after this view is
  // already open (a result can arrive while a tech is looking at it).
  const [referralTracking, setReferralTracking] = useState<ReferralTracking | null>(null);
  useEffect(() => {
    if (batch.processingNode !== 'External Referral') { setReferralTracking(null); return; }
    referralTrackingService.getByBatchId(batch.id).then(res => {
      if (res.ok) setReferralTracking(res.data);
    });
  }, [batch.id, batch.processingNode, batch.status]);

  // Real, per direct request — resolves batch.cytologyStainTypeId and
  // batch.stainingReagentLotIds to real, human-readable names rather
  // than showing a bare, opaque id. Fetched once; both dictionaries
  // are small, admin-managed lookups, not per-batch data.
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [reagentLots, setReagentLots] = useState<ReagentLot[]>([]);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
    reagentLotService.getAll().then(res => { if (res.ok) setReagentLots(res.data); });
  }, []);
  // Real feature, per direct, detailed specification: "Target
  // Duration / Alert Timer... Warning alert at 3h 45m." A real, live
  // countdown — this state has no meaning of its own beyond forcing a
  // re-render every 30s so getDecalTimerState's own real, elapsed-time
  // calculation (Date.now() - createdAt) actually reflects the
  // passage of time on screen, not just at the moment this view first
  // mounted.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (batch.processingNode !== 'Decal / Special Processing' || !batch.targetDurationMinutes) return;
    const interval = window.setInterval(() => setTick(tick => tick + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [batch.processingNode, batch.targetDurationMinutes]);

  const flashFeedback = useCallback((kind: 'success' | 'error', text: string) => {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 2200);
  }, []);

  // Real, central scan handler — per the spec's own "Continuous
  // Scanning" and "Out-of-Process Verification," routes each real scan
  // to addItemByScan (while 'active') or scanItemOut (while
  // 'reconciling') depending on the batch's own current, real status —
  // never both at once, and never while 'complete'/'aborted' (a closed
  // batch's own manifest is final; see IBatchService's own real
  // status-guard errors for why re-scanning into one is rejected).
  const handleScan = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value || value.toUpperCase().startsWith('STATION:') || value.toUpperCase().startsWith('BATCH:')) return;

    if (batch.status === 'active') {
      const result = await batchService.addItemByScan(batch.id, value, userId, userName);
      if (result.outcome === 'added') {
        playScanBeep();
        flashFeedback('success', `✓ ${t('batchDetail.addedFlash', { displayId: result.item.displayId })}`);
        onBatchUpdated(result.batch);
      } else {
        playScanErrorTone();
        flashFeedback('error', result.reason);
        toast.error(result.reason);
      }
    } else if (batch.status === 'reconciling') {
      const res = await batchService.scanItemOut(batch.id, value, userId, userName);
      // Real, established workaround for a real TS narrowing quirk this
      // codebase already hit elsewhere (see StaffTab.tsx's own identical
      // 'error' in res pattern) — plain `if (!res.ok)` fails to narrow
      // ServiceResult<T> correctly in this project for reasons not fully
      // understood, confirmed directly via an isolated repro against an
      // unrelated, pre-existing service before assuming this was a bug
      // in this file's own code.
      if ('error' in res) {
        playScanErrorTone();
        toast.error(res.error);
        return;
      }
      const matchedNow = res.data.items.find(i => i.reconciliationStatus === 'matched' && !batch.items.find(bi => bi.id === i.id && bi.reconciliationStatus === 'matched'));
      if (matchedNow) {
        playScanBeep();
        flashFeedback('success', `✓ ${t('batchDetail.matchedFlash', { displayId: matchedNow.displayId })}`);
      } else {
        playScanErrorTone();
        flashFeedback('error', `⚠ ${t('batchDetail.unexpectedFlash')}`);
      }
      onBatchUpdated(res.data);
    }
  }, [batch, userId, userName, flashFeedback, onBatchUpdated, t]);

  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent) handleScan(scanEvent.raw);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [handleScan]);

  const handleStartReconciliation = async () => {
    setBusy(true);
    const res = await batchService.startReconciliation(batch.id, userId, userName);
    setBusy(false);
    if ('error' in res) toast.error(res.error);
    else onBatchUpdated(res.data);
  };

  // Real feature, per direct, detailed specification: "Transfer
  // Action... a single tap moves the entire cassette batch out of
  // Decal and into the standard PROCESSING queue." Returns to the
  // batch list rather than staying on this now-'complete', now-empty
  // Decal batch — the real, new Processing batch this created is what
  // a tech actually wants to see/work from next, and it's right there
  // in the list (same real "active" filter every other new batch
  // shows up under).
  const handleTransferToProcessing = async () => {
    setBusy(true);
    const res = await batchService.transferToProcessing(batch.id, userId, userName);
    setBusy(false);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success(t('batchDetail.transferredToast', { count: res.data.toBatch.items.length, barcode: res.data.toBatch.masterBarcode }));
    onBack();
  };

  const handleComplete = async () => {
    setBusy(true);
    const res = await batchService.completeReconciliation(batch.id);
    setBusy(false);
    if ('error' in res) {
      // Real "Hard Stop Gatekeeper" surfacing — the service itself
      // already refused; this just shows the real, specific reason
      // rather than a generic failure message.
      toast.error(res.error);
    } else {
      toast.success(t('batchDetail.batchCompleteToast', { barcode: batch.masterBarcode }));
      onBatchUpdated(res.data);
    }
  };

  const handleOverride = async () => {
    if (!overrideReason.trim()) return;
    setBusy(true);
    const res = await batchService.overrideAndComplete(batch.id, userId, userName, overrideReason.trim());
    setBusy(false);
    if ('error' in res) {
      toast.error(res.error);
    } else {
      toast.success(t('batchDetail.forceCompletedToast', { barcode: batch.masterBarcode }));
      setShowOverride(false);
      onBatchUpdated(res.data);
    }
  };

  const handleAbort = async () => {
    setBusy(true);
    const res = await batchService.abort(batch.id, userId, userName, abortReason.trim() || 'No reason given.');
    setBusy(false);
    if (res.ok) {
      toast.success(t('batchDetail.abortedToast', { barcode: batch.masterBarcode }));
      setShowAbort(false);
      onBatchUpdated(res.data);
    }
  };

  const handleRemoveItem = async (item: BatchItem) => {
    const res = await batchService.removeItem(batch.id, item.id, userId, userName);
    if (res.ok) {
      toast.info(t('batchDetail.removedToast', { displayId: item.displayId }));
      onBatchUpdated(res.data);
    }
  };

  // Real feature, per direct follow-up: "Is there a mechanism to move
  // an asset from one container to the other?" A real, atomic move —
  // see batchService.moveItem's own doc comment (IBatchService.ts) for
  // why this is one linked operation, not a remove + a separate
  // re-scan. Only the fromBatch side is reflected here
  // (onBatchUpdated) — the destination batch updates the next time its
  // own detail view is opened, same as any other real, out-of-view
  // change elsewhere in this app.
  const handleMoveItem = async (item: BatchItem, toBatchId: string) => {
    setMovingItemId(null);
    const res = await batchService.moveItem(batch.id, item.id, toBatchId, userId, userName);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success(t('batchDetail.movedToast', { displayId: item.displayId, barcode: res.data.toBatch.masterBarcode }));
    onBatchUpdated(res.data.fromBatch);
  };

  // Real feature, per direct, detailed specification ("Container &
  // Batch Label Management," FR-3.1): "[ 🔓 Release Rack ]" action
  // pill. The rack itself checks back in as Available (real, atomic
  // hardwareContainerRegistryService.checkIn, via batchService's own
  // releaseRack); this batch and everything already scanned into it
  // is untouched — only the physical-hardware association ends.
  const handleReleaseRack = async () => {
    setBusy(true);
    const res = await batchService.releaseRack(batch.id, userId, userName);
    setBusy(false);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success(t('batchDetail.rackReleasedToast', { rackId: batch.linkedRackId }));
    onBatchUpdated(res.data);
  };

  const missingCount = batch.items.filter(i => i.reconciliationStatus !== 'matched').length;
  const canComplete = batch.status === 'reconciling' && missingCount === 0 && batch.unexpectedScans.length === 0;

  return (
    <div className="ps-batch-page">
      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <button className="ps-batch-back-btn" onClick={onBack}>← {t('batchDetail.backToBatches')}</button>

          <div className="ps-batch-detail-header">
            <div>
              <div className="ps-batch-detail-barcode">{batch.masterBarcode}</div>
              <div className="ps-batch-detail-meta">
                {batch.containerType && <>{batch.containerType} · </>}{t(`batchManagement.nodes.${batch.processingNode}`)} · {batch.protocol}
                {batch.solutionType && <> · {batch.solutionType}</>}
                {batch.referralTestRequested && <> · {batch.referralTestRequested}</>}
                {batch.priority === 'STAT' && <span className="ps-batch-row-stat ps-batch-detail-stat-badge">STAT</span>}
                {batch.identifierMode === 'semi_permanent' && (
                  <span className="ps-batch-rack-badge ps-batch-detail-rack-badge">
                    {batch.linkedRackId ? <>🔒 {batch.linkedRackId}</> : <>🔓 {t('batchDetail.rackReleased')}</>}
                  </span>
                )}
              </div>
            </div>
            <span className="ps-batch-row-status ps-batch-row-status--hued ps-batch-detail-status-pill" style={{ '--ps-hue': STATUS_COLOR[batch.status] } as React.CSSProperties}>
              {t(`batchManagement.status.${batch.status}`)}
            </span>
          </div>

          {/* Real, per direct request — a real, pre-existing gap fixed
              here: neither cytologyInstrumentStatus nor
              stainingInstrumentStatus was displayed anywhere in this
              app before this. Both real instrument-status fields
              share one display, since they're the same real kind of
              information on different real nodes. 'Run Failed' gets
              its own, distinct real styling — a real instrument
              failure is not the same as an in-progress or completed
              run, and shouldn't read the same at a glance. */}
          {(batch.cytologyInstrumentStatus || batch.stainingInstrumentStatus) && (() => {
            const status = batch.cytologyInstrumentStatus ?? batch.stainingInstrumentStatus!;
            const isFailure = status === 'Run Failed';
            return (
              <div className={`ps-batch-decal-timer ${isFailure ? 'ps-batch-decal-timer--overdue' : ''}`}>
                <span className="ps-batch-decal-timer-icon">{isFailure ? '⚠️' : '🔬'}</span>
                <span className="ps-batch-decal-timer-text">{t('batchDetail.instrumentReports', { status })}</span>
              </div>
            );
          })()}

          {/* Real, per direct request — resolves the real reagent
              lots actually used for this Staining run, by real name,
              never a bare id. */}
          {batch.processingNode === 'Staining' && batch.stainingReagentLotIds && batch.stainingReagentLotIds.length > 0 && (
            <div className="ps-batch-reagent-lot-summary">
              <span className="ps-batch-field-label ps-batch-field-label--flush">{t('batchDetail.reagentLotsUsed')}</span>
              <div>
                {batch.stainingReagentLotIds.map(lotId => {
                  const lot = reagentLots.find(l => l.id === lotId);
                  if (!lot) return <div key={lotId}>{lotId}</div>;
                  const label = lot.stainTypeId
                    ? (stainTypes.find(s => s.id === lot.stainTypeId)?.name ?? lot.stainTypeId)
                    : (lot.routineComponentType ?? '\u2014');
                  return <div key={lotId}>{label} \u2014 {lot.lotNumber}</div>;
                })}
              </div>
            </div>
          )}

          {/* Real feature, per direct, detailed specification: "Target
              Duration / Alert Timer... Warning alert at 3h 45m." Only
              shown for a real Decal batch that's still open — a
              completed/transferred batch's own timer no longer means
              anything real. */}
          {batch.processingNode === 'Decal / Special Processing' && batch.targetDurationMinutes && (batch.status === 'active' || batch.status === 'reconciling') && (() => {
            const timer = getDecalTimerState(batch.createdAt, batch.targetDurationMinutes);
            return (
              <div className={`ps-batch-decal-timer ps-batch-decal-timer--${timer.status}`}>
                <span className="ps-batch-decal-timer-icon">{timer.status === 'overdue' ? '⏰' : timer.status === 'warning' ? '⚠️' : '⏱️'}</span>
                <span className="ps-batch-decal-timer-text">
                  {timer.status === 'overdue'
                    ? t('batchDetail.overdueBy', { duration: formatDecalDuration(Math.abs(timer.remainingMinutes)), target: formatDecalDuration(batch.targetDurationMinutes) })
                    : t('batchDetail.remainingOfTarget', { remaining: formatDecalDuration(timer.remainingMinutes), target: formatDecalDuration(batch.targetDurationMinutes) })}
                </span>
              </div>
            );
          })()}

          {/* Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
              Inter-Laboratory Specimen Referral gap — "Real-time
              transit status updates" and the real, received result,
              once one has come back. Only shown for a real referral
              batch that's actually been dispatched (a still-'active'/
              'reconciling' referral batch has no tracking record yet). */}
          {batch.processingNode === 'External Referral' && referralTracking && (
            <div className="ps-batch-decal-timer">
              <span className="ps-batch-decal-timer-icon">
                {referralTracking.transitStatus === 'result_received' ? '✅' : '🚚'}
              </span>
              <span className="ps-batch-decal-timer-text">
                {referralTracking.transitStatus === 'dispatched' && t('batchDetail.referral.dispatched')}
                {referralTracking.transitStatus === 'in_transit' && t('batchDetail.referral.inTransit')}
                {referralTracking.transitStatus === 'delivered' && t('batchDetail.referral.delivered')}
                {referralTracking.transitStatus === 'result_received' && (
                  referralTracking.resultType === 'pdf_attachment'
                    ? <>{t('batchDetail.referral.resultReceivedPdf')} <a href={referralTracking.pdfAttachmentUrl} target="_blank" rel="noreferrer">{t('batchDetail.referral.viewReport')}</a></>
                    : <>{t('batchDetail.referral.resultReceived', { result: referralTracking.discreteResult })}</>
                )}
              </span>
            </div>
          )}

          {/* Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
              Reference Laboratory Sensor & Cold-Chain Integration gap
              — a real, visible alert for the workflow hold that's
              already blocking completion server-side, not just a
              silent, invisible gate. */}
          {batch.coldChainExcursion && !batch.coldChainExcursion.acknowledgedAt && (
            <div className="ps-batch-decal-timer ps-batch-decal-timer--overdue">
              <span className="ps-batch-decal-timer-icon">🥶</span>
              <span className="ps-batch-decal-timer-text">
                {t('batchDetail.coldChainExcursion', { temp: batch.coldChainExcursion.temperatureCelsius, time: batch.coldChainExcursion.detectedAt })}
              </span>
              <button
                className="ps-btn-small ps-batch-coldchain-ack-btn"
                onClick={async () => {
                  const note = window.prompt(t('batchDetail.acknowledgeNotePrompt'));
                  if (!note || !note.trim()) return;
                  const res = await batchService.acknowledgeColdChainExcursion(batch.id, userId, userName, note);
                  if (res.ok) onBatchUpdated(res.data);
                }}
              >
                {t('batchDetail.acknowledge')}
              </button>
            </div>
          )}

          {flash && (
            <div className={`ps-batch-flash ps-batch-flash--${flash.kind}`}>{flash.text}</div>
          )}

          {batch.status === 'active' && (
            <div className="ps-batch-scan-hint">📷 {t('batchDetail.scanHintActive')}</div>
          )}
          {batch.status === 'reconciling' && (
            <div className="ps-batch-scan-hint ps-batch-scan-hint--reconcile">📷 {t('batchDetail.scanHintReconcile')}</div>
          )}

          <div className="ps-batch-section-label">
            {t('batchDetail.manifestSection', { count: t('batchManagement.itemCount', { count: batch.items.length }) })}
          </div>
          {batch.items.length === 0 ? (
            <div className="ps-batch-empty">{t('batchDetail.emptyManifest')}</div>
          ) : (
            <div className="ps-batch-manifest">
              {batch.items.map(item => (
                <div key={item.id} className="ps-batch-manifest-row">
                  <span className="ps-batch-manifest-id">{item.displayId}</span>
                  <span className="ps-batch-manifest-type">{t(`batchDetail.materialType.${item.materialType}`)}</span>
                  <span className="ps-batch-manifest-added">
                    {item.addedByUserName} · {formatTimestamp(item.addedAt)}
                    {/* Real, honest trace — an item that's been moved
                        shows where it came from, not just its most
                        recent addedAt as if it had only ever been
                        here. */}
                    {item.transferHistory && item.transferHistory.length > 0 && (
                      <span className="ps-batch-transfer-note"> · {t('batchDetail.movedFrom', { barcode: item.transferHistory[item.transferHistory.length - 1].fromMasterBarcode })}</span>
                    )}
                  </span>
                  {batch.status === 'reconciling' ? (
                    <span className={`ps-batch-recon-flag ps-batch-recon-flag--${item.reconciliationStatus === 'matched' ? 'matched' : 'missing'}`}>
                      {item.reconciliationStatus === 'matched' ? `✓ ${t('batchDetail.matched')}` : `○ ${t('batchDetail.missing')}`}
                    </span>
                  ) : batch.status === 'active' ? (
                    <div className="ps-batch-manifest-actions">
                      <div className="ps-batch-move-wrap">
                        <button className="ps-batch-move-btn" onClick={() => setMovingItemId(movingItemId === item.id ? null : item.id)} title={t('batchDetail.moveTitle')}>⇄ {t('batchDetail.move')}</button>
                        {movingItemId === item.id && (
                          <div className="ps-batch-move-picker">
                            {allBatches.filter(b => b.status === 'active' && b.id !== batch.id).length === 0 ? (
                              <div className="ps-batch-move-picker-empty">{t('batchDetail.noOtherBatches')}</div>
                            ) : (
                              allBatches.filter(b => b.status === 'active' && b.id !== batch.id).map(b => (
                                <button key={b.id} className="ps-batch-move-picker-row" onClick={() => handleMoveItem(item, b.id)}>
                                  <span className="ps-batch-move-picker-barcode">{b.masterBarcode}</span>
                                  <span className="ps-batch-move-picker-protocol">{b.protocol}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <button className="ps-batch-remove-btn" onClick={() => handleRemoveItem(item)} title={t('batchDetail.removeTitle')}>✕</button>
                    </div>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}

          {batch.status === 'reconciling' && batch.unexpectedScans.length > 0 && (
            <>
              <div className="ps-batch-section-label ps-batch-section-label--warn">{t('batchDetail.unexpectedSection', { count: batch.unexpectedScans.length })}</div>
              <div className="ps-batch-manifest">
                {batch.unexpectedScans.map(s => (
                  <div key={s.id} className="ps-batch-manifest-row">
                    <span className="ps-batch-manifest-id">{s.scannedDisplayId}</span>
                    <span className="ps-batch-manifest-added">{s.byUserName} · {formatTimestamp(s.at)}</span>
                    <span className="ps-batch-recon-flag ps-batch-recon-flag--unexpected">⚠ {t('batchDetail.unexpected')}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {batch.override && (
            <div className="ps-batch-override-note">
              ⚠ {t('batchDetail.overrideNote', { user: batch.override.byUserName, time: formatTimestamp(batch.override.at), reason: batch.override.reason })}
            </div>
          )}
          {batch.status === 'aborted' && batch.abortReason && (
            <div className="ps-batch-override-note">{t('batchDetail.abortedNote', { reason: batch.abortReason })}</div>
          )}

          <div className="ps-batch-detail-actions">
            {/* Real feature, per direct, detailed specification, FR-3.1:
                "active batch cards shall display a [ 🔓 Release Rack ]
                action pill." Shown whenever a real rack is still
                checked out (active OR reconciling — a tech may need
                the physical rack back before this batch is fully
                done), not gated to just 'active'. */}
            {(batch.status === 'active' || batch.status === 'reconciling') && batch.identifierMode === 'semi_permanent' && batch.linkedRackId && (
              <button className="ps-batch-release-rack-pill" disabled={busy} onClick={handleReleaseRack} title={t('batchDetail.releaseRackTitle', { rackId: batch.linkedRackId })}>
                🔓 {t('batchDetail.releaseRackPill')}
              </button>
            )}
            {batch.status === 'active' && (
              <>
                {batch.processingNode === 'Decal / Special Processing' ? (
                  /* Real feature, per direct, detailed specification:
                     "Transfer Action... a single tap moves the entire
                     cassette batch out of Decal and into the standard
                     PROCESSING queue." Replaces Start Reconciliation
                     for this one real node — there's no real ambiguity
                     to reconcile against; this batch's own manifest
                     already is the trusted, complete record. */
                  <button className="ps-btn-primary" disabled={batch.items.length === 0 || busy} onClick={handleTransferToProcessing}>
                    ➜ {t('batchDetail.transferToProcessing')}
                  </button>
                ) : (
                  <button className="ps-btn-primary" disabled={batch.items.length === 0 || busy} onClick={handleStartReconciliation}>
                    {t('batchDetail.startReconciliation')}
                  </button>
                )}
                <button className="ps-batch-abort-link" onClick={() => setShowAbort(true)}>{t('batchDetail.abortBatch')}</button>
              </>
            )}
            {batch.status === 'reconciling' && (
              <>
                <button className="ps-btn-primary" disabled={!canComplete || busy} onClick={handleComplete} title={!canComplete ? t('batchDetail.completeDisabledTitle', { missing: missingCount, unexpected: batch.unexpectedScans.length }) : undefined}>
                  {t('batchDetail.completeBatch')}
                </button>
                {!canComplete && (
                  <button className="ps-batch-override-link" onClick={() => setShowOverride(true)}>{t('batchDetail.supervisorOverrideLink')}</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showAbort && (
        <div className="ps-overlay ps-batch-overlay" onClick={() => setShowAbort(false)}>
          <div className="ps-modal-dark ps-batch-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-title">{t('batchDetail.abortModalTitle')}</div>
            <p className="ps-batch-confirm-text">{t('batchDetail.abortModalText')}</p>
            <textarea className="ps-batch-textarea" placeholder={t('batchDetail.abortReasonPlaceholder')} value={abortReason} onChange={e => setAbortReason(e.target.value)} />
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={() => setShowAbort(false)}>{t('batchDetail.cancel')}</button>
              <button className="ps-batch-danger-btn" disabled={busy} onClick={handleAbort}>{t('batchDetail.abortBatch')}</button>
            </div>
          </div>
        </div>
      )}

      {showOverride && (
        <div className="ps-overlay ps-batch-overlay" onClick={() => setShowOverride(false)}>
          <div className="ps-modal-dark ps-batch-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-title">{t('batchDetail.overrideModalTitle')}</div>
            <p className="ps-batch-confirm-text">
              {t('batchDetail.overrideModalText', { missing: missingCount, unexpected: batch.unexpectedScans.length })}
            </p>
            <textarea className="ps-batch-textarea" placeholder={t('batchDetail.overrideReasonPlaceholder')} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={() => setShowOverride(false)}>{t('batchDetail.cancel')}</button>
              <button className="ps-batch-danger-btn" disabled={!overrideReason.trim() || busy} onClick={handleOverride}>{t('batchDetail.overrideAndComplete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchDetailView;
