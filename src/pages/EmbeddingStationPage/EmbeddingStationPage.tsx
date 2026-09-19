// src/pages/EmbeddingStationPage/EmbeddingStationPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285 — "Embedding Station: a dedicated, bench-scoped
// workstation for cassette scan/verify, mold selection, and
// discrepancy flagging." Sibling workstation to PS-284's Microtomy
// Workstation — reached by scanning a cassette barcode at a real
// 'Embedding' ScanStation, deliberately NOT a case-scoped route like
// GrossingScreenPage/SynopticReportPage, for the identical reason
// MicrotomyWorkstationPage.tsx states: an embedding tech works
// cassette-by-cassette across many cases in a single shift.
//
// Real, per direct follow-up asking to keep this visually consistent
// with the rest of the workstation series rather than a new visual
// language: same header/back-button convention, same ps-overlay/
// ps-modal-dark modal pattern, same dark palette — see
// pathscribe.css's own ps-embedding-* block, styled to match
// ps-microtomy-*/ps-grossing-* directly.
//
// Real, deliberate scope cut, stated plainly (also documented in this
// folder's own README): no MatrixBlock support yet (see
// useEmbeddingStation.ts's own header), and the cassette label preview
// is a real, proportionally-scaled schematic, not a pixel-exact
// DataMatrix render — identical honest posture to
// HardwarePrintPanel.tsx's own slide preview.
//
// **Real fix, per direct follow-up ("these foot pedals are ubiquitous
// and we must support them"):** the physical foot-pedal integration
// this file's own header used to disclaim as out of reach ("same real
// hardware-reach limit as every other workstation in this app") was
// independently re-verified and found incorrect — the same real,
// already-working useFootPedal.ts hook (Gamepad API + keyboard-
// emulation capture, built for SynopticReportPage.tsx's own dictation
// controls) reaches real, physical foot pedals from the browser
// today, no native agent required. PS-285's own named "hands-free
// triggers for piece-count confirmation" is now wired below via that
// same hook — Pedal 1 (see FOOT_PEDAL_ACTION_LABELS's own doc
// comment). Its sibling, "advancing to next queued cassette," is
// deliberately NOT wired — this page is a real, scan-to-open, single-
// cassette workspace with no real queue/next-item navigation to
// advance (confirmed directly, not assumed); wiring a pedal to a
// feature that doesn't exist yet would be dishonest.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { printSettingsService, printerProfileService } from '@/services';
import { DEFAULT_CASSETTE_LABEL_LAYOUT } from '@/services/printSettings/IPrintSettingsService';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { CassetteReprintReason } from '@/types/case/Specimen';
import { useFootPedal } from '@/hooks/useFootPedal';
import { useEmbeddingStation } from './hooks/useEmbeddingStation';
import EmbeddingCenterPanel from './components/EmbeddingCenterPanel';
import CassettePrintPanel from './components/CassettePrintPanel';
import CommentDrawer from './components/CommentDrawer';
import { CASSETTE_REPRINT_REASONS } from '@/utils/embeddingOperations';
import '../../pathscribe.css';

const EmbeddingStationPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('embeddingStation.pageTitle'), '/workstations/embedding'); }, [pushCrumb, t]);

  const w = useEmbeddingStation();

  // Real, per PS-285's own named "hands-free triggers for piece-count
  // confirmation" — Pedal 1, same real hook/binding already working
  // for SynopticReportPage.tsx's dictation controls. Mirrors the
  // on-screen "✅ Confirm" button's own default behavior
  // (EmbeddingCenterPanel.tsx's observedCount state initializes to
  // the expected, grossing-recorded count) — a bare pedal press
  // confirms "yes, this matches," the common case; a genuine
  // discrepancy still requires the on-screen numeric field + Confirm,
  // since a pedal has no way to type a different count. Real,
  // explicit guard: only fires with an open work item, a known
  // expected count, and a block not already sealed — a stray press
  // after the block is already 'Embedded' must never silently
  // re-confirm and overwrite the real, already-recorded count.
  useFootPedal({
    actions: {
      pedal1_pushToTalk: () => {
        const block = w.workItem?.block;
        if (!block || block.pieceCount == null || block.status === 'Embedded') return;
        w.handleConfirmPieceCount(block.pieceCount);
      },
    },
  });

  const [scanInput, setScanInput] = useState('');
  const [labelLayout, setLabelLayout] = useState<CassetteLabelLayoutConfig>(DEFAULT_CASSETTE_LABEL_LAYOUT);
  const [printer, setPrinter] = useState<PrinterProfile | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [pendingReprint, setPendingReprint] = useState(false);
  const [reprintInFlight, setReprintInFlight] = useState(false);
  const [reprintFeedback, setReprintFeedback] = useState<string | null>(null);

  useEffect(() => {
    printSettingsService.get().then(res => { if (res.ok) setLabelLayout(res.data.cassetteLabelLayout); });
  }, []);

  useEffect(() => {
    if (!w.effectiveStationId) { setPrinter(null); setPrinterError(t('embeddingStation.hardware.noStation')); return; }
    mockScanStationService.getById(w.effectiveStationId).then(async stationRes => {
      if (!stationRes.ok || !stationRes.data.supportsPrinting || !stationRes.data.cassetteSlidePrinterProfileId) {
        setPrinter(null); setPrinterError(t('embeddingStation.hardware.notConfigured'));
        return;
      }
      const printerRes = await printerProfileService.getById(stationRes.data.cassetteSlidePrinterProfileId);
      if (printerRes.ok && printerRes.data) { setPrinter(printerRes.data); setPrinterError(null); }
      else { setPrinter(null); setPrinterError(t('embeddingStation.hardware.profileMissing')); }
    });
  }, [w.effectiveStationId, t]);

  // Real, same real global-scan-event pattern as
  // MicrotomyWorkstationPage.tsx's own listener — a real barcode wedge
  // scanner just types into whatever has focus, so this additionally
  // picks up PATHSCRIBE_SCAN even when the scan input isn't focused.
  // Same 'STATION:' guard every other real listener here uses.
  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<{ raw: string }>).detail;
      if (!scanEvent?.raw || scanEvent.raw.trim().toUpperCase().startsWith('STATION:')) return;
      w.resolveScan(scanEvent.raw);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [w]);

  const handleScanSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    await w.resolveScan(scanInput.trim());
    setScanInput('');
  }, [scanInput, w]);

  const handleToggleAlertFlag = useCallback((flag: 'tinyTissue' | 'fragile' | 'requiresDecal') => {
    if (!w.workItem) return;
    // Real, same real per-block boolean toggle as
    // MicrotomyWorkstationPage.tsx's own handleSetAlertFlags — this
    // page reuses the identical real, stored fields
    // (tinyTissue/fragile/requiresDecal), never a second copy.
    w.handleSetAlertFlags({ [flag]: !w.workItem.block[flag] });
  }, [w]);

  const handleConfirmReprint = useCallback(async (reason: CassetteReprintReason) => {
    setPendingReprint(false);
    setReprintInFlight(true);
    setReprintFeedback(null);
    const result = await w.handleReprintCassette(reason);
    setReprintInFlight(false);
    if (!result.ok) setReprintFeedback(result.message ?? t('embeddingStation.hardware.reprintFailed'));
  }, [w, t]);

  return (
    <div className="ps-embedding-page">
      <div className="ps-embedding-header">
        <button className="ps-btn-secondary" onClick={() => navigate('/worklist')}>{t('common.back')}</button>
        <h1 className="ps-embedding-title">🧊 {t('embeddingStation.pageTitle')}</h1>
      </div>

      {!w.workItem ? (
        <div className="ps-embedding-panel">
          <p className="ps-embedding-panel-title">{t('embeddingStation.scanPrompt')}</p>
          <form className="ps-embedding-scan-row" onSubmit={handleScanSubmit}>
            <input
              type="text" className="ps-embedding-scan-input" autoFocus
              value={scanInput} onChange={e => setScanInput(e.target.value)}
              placeholder={t('embeddingStation.scanPlaceholder') ?? ''}
            />
            <button type="submit" className="ps-btn-primary">{t('embeddingStation.scanSubmit')}</button>
          </form>
          {w.scanError && <div className="ps-embedding-scan-error">{w.scanError}</div>}
        </div>
      ) : (
        <>
          <div className="ps-embedding-context-bar">
            <span>{t('embeddingStation.context.accession')} <strong data-phi="accession">{w.workItem.caseData.accession?.fullAccession ?? w.workItem.caseData.id}</strong></span>
            <span>{t('embeddingStation.context.patient')} <strong>{`${w.workItem.caseData.patient?.givenNames ?? ''} ${w.workItem.caseData.patient?.familyNames ?? ''}`.trim() || '—'}</strong></span>
            <span>{t('embeddingStation.context.dob')} <strong data-phi="dob">{w.workItem.caseData.patient?.dateOfBirth ?? '—'}</strong></span>
            <span>
              {t('embeddingStation.context.specimenBlock')}{' '}
              <strong>{w.workItem.specimen.label}{w.workItem.block.label}</strong>
            </span>
            <span>{t('embeddingStation.context.specimenType')} <strong>{w.workItem.specimen.description ?? '—'}</strong></span>
            <button type="button" className="ps-embedding-row-btn" onClick={() => { setScanInput(''); w.clearWorkItem(); }} style={{ marginLeft: 'auto' }}>
              {t('embeddingStation.context.scanNext')}
            </button>
          </div>

          <div className="ps-embedding-layout">
            {/* Left: Specimen block summary */}
            <div className="ps-embedding-panel">
              <p className="ps-embedding-panel-title">{t('embeddingStation.specimenSummary.title')}</p>
              <ul className="ps-embedding-comment-list">
                {(w.workItem.specimen.blocks ?? []).map(b => (
                  <li key={b.id} className="ps-embedding-comment-item">
                    <strong>{w.workItem!.specimen.label}{b.label}</strong> — {b.status}
                    {b.id === w.workItem!.block.id && <span> ({t('embeddingStation.specimenSummary.current')})</span>}
                  </li>
                ))}
              </ul>
            </div>

            {/* Center: Piece Count / Mold & Orientation / Discrepancy / Split-Block */}
            <EmbeddingCenterPanel
              specimen={w.workItem.specimen}
              block={w.workItem.block}
              alertBadges={w.alertBadges}
              splitBlockGroupStatus={w.splitBlockGroupStatus}
              onToggleAlertFlag={handleToggleAlertFlag}
              onConfirmPieceCount={w.handleConfirmPieceCount}
              onFlagDiscrepancy={w.handleFlagDiscrepancy}
              onSetMoldAndOrientation={w.handleSetMoldAndOrientation}
              onGroupSplitBlocks={w.handleGroupSplitBlocks}
              onOpenComments={() => setCommentsOpen(true)}
            />

            {/* Right: Hardware & Print Control */}
            <CassettePrintPanel
              printer={printer}
              printerError={printerError}
              labelLayout={labelLayout}
              specimenLabel={w.workItem.specimen.label}
              blockLabel={w.workItem.block.label}
              cassetteReprintCount={w.workItem.block.cassetteReprintCount}
              lastCassetteReprintReason={w.workItem.block.lastCassetteReprintReason}
              onRequestReprint={() => { setReprintFeedback(null); setPendingReprint(true); }}
              reprintInFlight={reprintInFlight}
              reprintFeedback={reprintFeedback}
            />
          </div>
        </>
      )}

      {pendingReprint && (
        <div className="ps-overlay" onClick={() => setPendingReprint(false)}>
          <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-header"><div className="ps-batch-modal-title">{t('embeddingStation.reprintReason.title')}</div></div>
            <div className="ps-batch-modal-body">
              <p>{t('embeddingStation.reprintReason.body')}</p>
              <select className="ps-embedding-field-select" defaultValue="" onChange={e => { if (e.target.value) handleConfirmReprint(e.target.value as CassetteReprintReason); }}>
                <option value="" disabled>{t('embeddingStation.reprintReason.select')}</option>
                {CASSETTE_REPRINT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={() => setPendingReprint(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {commentsOpen && w.workItem && (
        <CommentDrawer
          title={t('embeddingStation.context.blockComments')}
          comments={w.workItem.block.comments ?? []}
          onClose={() => setCommentsOpen(false)}
          onSubmit={text => w.handleAddComment(text)}
        />
      )}
    </div>
  );
};

export default EmbeddingStationPage;
