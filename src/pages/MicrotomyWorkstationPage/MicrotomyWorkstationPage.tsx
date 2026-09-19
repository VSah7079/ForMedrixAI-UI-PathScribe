// src/pages/MicrotomyWorkstationPage/MicrotomyWorkstationPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284 — "Microtomy Workstation: real-time on-demand/batch
// slide printing & etching UI." A dedicated, bench-scoped page
// (reached by scanning a block/decant barcode at a real 'Microtomy /
// Sectioning' ScanStation, or a direct block selection) — deliberately
// NOT a case-scoped route like GrossingScreenPage/SynopticReportPage,
// since a microtomy tech works block-by-block across many cases in a
// single shift, not one case at a time.
//
// Real, per direct follow-up asking to keep this visually consistent
// with GrossingScreenPage/SynopticReportPage rather than a new visual
// language: same header/back-button convention, same ps-overlay/
// ps-modal-dark modal pattern, same dark palette — see
// pathscribe.css's own ps-microtomy-* block, styled to match
// ps-grossing-* directly.
//
// Real, deliberate scope cut, stated plainly (also documented in this
// folder's own README): no shared-cassette/MatrixBlock support yet,
// and the "1:1 visual canvas" label preview is a real,
// proportionally-scaled schematic, not a pixel-exact DataMatrix
// render.
//
// **Real fix, per direct follow-up ("these foot pedals are ubiquitous
// and we must support them"):** the physical foot-pedal integration
// this file's own header used to disclaim as out of reach ("no
// browser API reaches a generic USB pedal without a native agent")
// was independently re-verified and found incorrect — the Gamepad API
// (HID-class pedals) plus keyboard-emulation capture
// (useFootPedal.ts, built for SynopticReportPage.tsx's own dictation
// controls) already reaches real, physical foot pedals from the
// browser today, no native agent required. PS-284's own named
// "Print/Etch Next... physical foot pedal integration" trigger is now
// wired below via that same, already-working hook — Pedal 2 (see
// FOOT_PEDAL_ACTION_LABELS's own doc comment).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { printSettingsService } from '@/services';
import { DEFAULT_SLIDE_LABEL_LAYOUT } from '@/services/printSettings/IPrintSettingsService';
import type { SlideLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import { resolveSlideLabelFitWarnings } from '@/utils/labels/resolveSlideLabelFitWarnings';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { printerProfileService } from '@/services';
import type { StainOrder } from '@/types/case/Specimen';
import { useFootPedal } from '@/hooks/useFootPedal';
import { useMicrotomyWorkstation } from './hooks/useMicrotomyWorkstation';
import SlideGridPanel from './components/SlideGridPanel';
import HardwarePrintPanel from './components/HardwarePrintPanel';
import CytologyPanel from './components/CytologyPanel';
import CommentDrawer from './components/CommentDrawer';
import BatchProgressModal from './components/BatchProgressModal';
import { computeNextUnprintedStain, MICROTOMY_CANCEL_REASONS } from '@/utils/microtomyOperations';
import '../../pathscribe.css';

const MicrotomyWorkstationPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('microtomyWorkstation.pageTitle'), '/workstations/microtomy'); }, [pushCrumb, t]);

  const w = useMicrotomyWorkstation();
  const [scanInput, setScanInput] = useState('');
  const [labelLayout, setLabelLayout] = useState<SlideLabelLayoutConfig>(DEFAULT_SLIDE_LABEL_LAYOUT);
  const [printer, setPrinter] = useState<PrinterProfile | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<{ scope: 'block'; } | { scope: 'stain'; stain: StainOrder } | null>(null);

  useEffect(() => { w.loadStainTypes(); w.loadDefaultPrintMode(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real, per PS-284's own named "Print/Etch Next... physical foot
  // pedal integration" trigger — Pedal 2, same real hook/binding
  // already working for SynopticReportPage.tsx's dictation controls.
  // w.handlePrintNext() already no-ops safely with no open work item
  // or no real unprinted slide left (see its own doc comment in
  // useMicrotomyWorkstation.ts), so no extra guard is needed here.
  useFootPedal({ actions: { pedal2_nextField: () => { w.handlePrintNext(); } } });

  useEffect(() => {
    printSettingsService.get().then(res => { if (res.ok) setLabelLayout(res.data.slideLabelLayout); });
  }, []);

  useEffect(() => {
    if (!w.effectiveStationId) { setPrinter(null); setPrinterError(t('microtomyWorkstation.hardware.noStation')); return; }
    mockScanStationService.getById(w.effectiveStationId).then(async stationRes => {
      if (!stationRes.ok || !stationRes.data.supportsPrinting || !stationRes.data.cassetteSlidePrinterProfileId) {
        setPrinter(null); setPrinterError(t('microtomyWorkstation.hardware.notConfigured'));
        return;
      }
      const printerRes = await printerProfileService.getById(stationRes.data.cassetteSlidePrinterProfileId);
      if (printerRes.ok && printerRes.data) { setPrinter(printerRes.data); setPrinterError(null); }
      else { setPrinter(null); setPrinterError(t('microtomyWorkstation.hardware.profileMissing')); }
    });
  }, [w.effectiveStationId, t]);

  // Real, per this app's own established scan pattern (useGlobalMaterialScanTracking.ts
  // et al.) — a real barcode wedge scanner just types into whatever
  // has focus, which the manual form above already handles; this
  // listener additionally handles the global PATHSCRIBE_SCAN event so
  // a scan is picked up even when the scan input isn't focused (e.g.
  // right after finishing a prior block, before a tech clicks back
  // into the field). Same 'STATION:' guard every other real listener
  // here uses — a station-switch barcode is never also a material scan.
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

  // Real, per removeMicrotomyStain's own doc comment: an unprinted
  // slide is removed immediately; a printed one instead sets
  // w.pendingRemoval, and the reason modal below handles the rest.
  const handleRemoveClick = useCallback((stainId: string) => { w.requestRemoveStain(stainId); }, [w]);

  const fitWarnings = resolveSlideLabelFitWarnings(labelLayout);

  const stains = !w.workItem ? [] : w.workItem.kind === 'block' ? w.workItem.block.stains : w.workItem.decant.stains;
  const nextUnprinted = computeNextUnprintedStain(stains);
  const previewStain = w.printMode === 'on_demand' ? nextUnprinted : stains.find(s => w.batchSelection.has(s.id));

  const commentComments = !commentTarget
    ? []
    : commentTarget.scope === 'block' && w.workItem?.kind === 'block'
      ? (w.workItem.block.comments ?? [])
      : commentTarget.scope === 'stain'
        ? (commentTarget.stain.comments ?? [])
        : [];

  return (
    <div className="ps-microtomy-page">
      <div className="ps-microtomy-header">
        <button className="ps-btn-secondary" onClick={() => navigate('/worklist')}>{t('common.back')}</button>
        <h1 className="ps-microtomy-title">🔬 {t('microtomyWorkstation.pageTitle')}</h1>
      </div>

      {!w.workItem ? (
        <div className="ps-microtomy-panel">
          <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.scanPrompt')}</p>
          <form className="ps-microtomy-scan-row" onSubmit={handleScanSubmit}>
            <input
              type="text" className="ps-microtomy-scan-input" autoFocus
              value={scanInput} onChange={e => setScanInput(e.target.value)}
              placeholder={t('microtomyWorkstation.scanPlaceholder') ?? ''}
            />
            <button type="submit" className="ps-btn-primary">{t('microtomyWorkstation.scanSubmit')}</button>
          </form>
          {w.scanError && <div className="ps-microtomy-scan-error">{w.scanError}</div>}
        </div>
      ) : (
        <>
          <div className="ps-microtomy-context-bar">
            <span>{t('microtomyWorkstation.context.accession')} <strong data-phi="accession">{w.workItem.caseData.accession?.fullAccession ?? w.workItem.caseData.id}</strong></span>
            <span>{t('microtomyWorkstation.context.patient')} <strong>{`${w.workItem.caseData.patient?.givenNames ?? ''} ${w.workItem.caseData.patient?.familyNames ?? ''}`.trim() || '—'}</strong></span>
            <span>{t('microtomyWorkstation.context.dob')} <strong data-phi="dob">{w.workItem.caseData.patient?.dateOfBirth ?? '—'}</strong></span>
            <span>
              {t('microtomyWorkstation.context.specimenBlock')}{' '}
              <strong>{w.workItem.specimen.label}{w.workItem.kind === 'block' ? w.workItem.block.label : w.workItem.decant.label}</strong>
            </span>
            <span>{t('microtomyWorkstation.context.specimenType')} <strong>{w.workItem.specimen.description ?? '—'}</strong></span>
            <button type="button" className="ps-microtomy-row-btn" onClick={() => { setScanInput(''); w.clearWorkItem(); }} style={{ marginLeft: 'auto' }}>
              {t('microtomyWorkstation.context.scanNext')}
            </button>
          </div>

          <div className="ps-microtomy-layout">
            {/* Left: Work Item Context */}
            <div>
              {w.workItem.kind === 'block' && (() => {
                const block = w.workItem.block;
                const alertFlags = ['tinyTissue', 'fragile', 'requiresDecal'] as const;
                return (
                  <div className="ps-microtomy-panel" style={{ marginBottom: 14 }}>
                    <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.context.title')}</p>
                    <div className="ps-microtomy-alert-badges">
                      {alertFlags.map(flag => (
                        <button
                          key={flag} type="button"
                          className={`ps-microtomy-alert-badge${block[flag] ? '' : ' ps-microtomy-alert-badge--off'}`}
                          onClick={() => w.handleSetAlertFlags({ [flag]: !block[flag] } as Record<typeof flag, boolean>)}
                        >
                          {t(`microtomyWorkstation.context.flag.${flag}`)}
                        </button>
                      ))}
                    </div>
                    <div className="ps-microtomy-context-field">{t('microtomyWorkstation.context.status')}<strong>{block.status}</strong></div>
                    <div className="ps-microtomy-context-field">{t('microtomyWorkstation.context.pieceCount')}<strong>{block.pieceCount ?? '—'}</strong></div>
                    {block.tissueDescription && (
                      <div className="ps-microtomy-context-field">{t('microtomyWorkstation.context.tissueDescription')}<strong>{block.tissueDescription}</strong></div>
                    )}
                    <button type="button" className="ps-microtomy-row-btn" onClick={() => setCommentTarget({ scope: 'block' })}>
                      💬 {t('microtomyWorkstation.context.blockComments')}{block.comments?.length ? ` (${block.comments.length})` : ''}
                    </button>
                  </div>
                );
              })()}
              <div className="ps-microtomy-panel">
                <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.context.priorHistory')}</p>
                <ul className="ps-microtomy-history-list">
                  {stains.filter(s => s.printedAt).sort((a, b) => (b.printedAt ?? '').localeCompare(a.printedAt ?? '')).map(s => (
                    <li key={s.id}>{s.stainName} — {new Date(s.printedAt!).toLocaleString()}</li>
                  ))}
                  {stains.every(s => !s.printedAt) && <li>{t('microtomyWorkstation.context.noHistory')}</li>}
                </ul>
              </div>
            </div>

            {/* Center: Interactive Slide Grid (+ Cytology panel for a decant) */}
            <div>
              {w.workItem.kind === 'decant' && (
                <CytologyPanel decant={w.workItem.decant} onUpdateFields={w.handleUpdateCytologyFields} onApplySuggestions={w.handleApplyPrepSuggestions} />
              )}
              <SlideGridPanel
                stains={stains}
                stainTypes={w.stainTypes}
                printMode={w.printMode}
                batchSelection={w.batchSelection}
                onToggleSelect={id => w.setBatchSelection(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                onPrintOne={stain => w.handlePrintSelected([stain.id])}
                onReprint={w.handleReprint}
                onAddLevel={stain => w.handleAddLevelOfExistingStain(stain)}
                onRemove={handleRemoveClick}
                onAddStain={w.handleAddStain}
                onOpenComments={stain => setCommentTarget({ scope: 'stain', stain })}
                onReorder={w.handleReorder}
                supportsControlPairing={w.workItem.kind === 'block'}
              />
            </div>

            {/* Right: Hardware & Print Control */}
            <HardwarePrintPanel
              printMode={w.printMode}
              onSetPrintMode={w.setPrintMode}
              nextStain={nextUnprinted}
              onPrintNext={w.handlePrintNext}
              batchSelectedCount={w.batchSelection.size}
              onPrintBatch={() => w.handlePrintSelected(Array.from(w.batchSelection))}
              printer={printer}
              printerError={printerError}
              labelLayout={labelLayout}
              fitWarnings={fitWarnings}
              previewStain={previewStain}
              specimenLabel={w.workItem.specimen.label}
              blockLabel={w.workItem.kind === 'block' ? w.workItem.block.label : w.workItem.decant.label}
            />
          </div>
        </>
      )}

      {w.pendingRemoval && (
        <div className="ps-overlay" onClick={w.cancelPendingRemoval}>
          <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-header"><div className="ps-batch-modal-title">{t('microtomyWorkstation.removeReason.title')}</div></div>
            <div className="ps-batch-modal-body">
              <p>{t('microtomyWorkstation.removeReason.body')}</p>
              <select className="ps-microtomy-field-select" defaultValue="" onChange={e => { if (e.target.value) w.confirmPendingRemoval(e.target.value as any); }}>
                <option value="" disabled>{t('microtomyWorkstation.removeReason.select')}</option>
                {MICROTOMY_CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={w.cancelPendingRemoval}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {commentTarget && (
        <CommentDrawer
          title={commentTarget.scope === 'block' ? t('microtomyWorkstation.context.blockComments') : t('microtomyWorkstation.slideGrid.slideComments')}
          comments={commentComments}
          showPrintToggle={commentTarget.scope === 'stain'}
          onClose={() => setCommentTarget(null)}
          onSubmit={(text, printsOnLabel) => {
            if (commentTarget.scope === 'block') w.handleAddBlockComment(text);
            else w.handleAddStainComment(commentTarget.stain.id, text, printsOnLabel);
          }}
        />
      )}

      {w.batchProgress && <BatchProgressModal entries={w.batchProgress} onClose={w.clearBatchProgress} />}
    </div>
  );
};

export default MicrotomyWorkstationPage;
