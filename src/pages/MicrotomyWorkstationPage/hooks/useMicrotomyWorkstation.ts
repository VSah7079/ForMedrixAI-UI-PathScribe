// src/pages/MicrotomyWorkstationPage/hooks/useMicrotomyWorkstation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284 (Microtomy Workstation). Same real optimistic-
// update + real persistence shape as useGrossingScreen.ts (wraps
// microtomyOperations.ts's pure functions), plus the real print
// dispatch pattern already proven in useSpecimenBlockManagement.ts's
// own attemptPrintedLabel (station -> printer profile -> gtin/layout
// from printSettingsService -> printCassetteSlideLabel.ts). Nothing
// here reinvents that pipeline — it reuses it directly for the first
// time from a REAL, dedicated print-control surface, rather than the
// one "Reprint" button buried in BlockStainEditorModal.tsx.
//
// Real, deliberate scope cut, stated plainly rather than silently:
// this resolves a scanned/selected BLOCK or DECANT only — a shared
// MatrixBlock (cassette spanning multiple specimens) and a bare
// specimen-level scan are not yet supported here. PS-284's own spec
// text is framed entirely around "Block barcode scan" and the
// Cytology/Decant panel; matrix-block support is real, separate,
// follow-up work, not attempted in this pass.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { printerProfileService, printSettingsService, stainTypeService } from '@/services';
import { printSlideLabel } from '@/utils/labels/printCassetteSlideLabel';
import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
import { DEFAULT_SLIDE_LABEL_LAYOUT } from '@/services/printSettings/IPrintSettingsService';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { SlideLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock, StainOrder } from '@/types/case/Specimen';
import type { Decant } from '@/types/case/Material';
import type { StainType } from '@/services/stains/IStainService';
import type { CytologyPrepSuggestion } from '@/services/cytology/computeCytologyPrepSuggestions';
import {
  addMicrotomyStain, removeMicrotomyStain, markStainPrinting, markStainPrintResult,
  reprintMicrotomyStain, reorderBlockStains, updateStainComment, updateBlockComment,
  setBlockAlertFlags, updateDecantCytologyFields, applyCytologyPrepSuggestions,
  addDecantStain, removeDecantStain, computeNextUnprintedStain,
  type MicrotomyCancelReason, MICROTOMY_REPRINT_REASONS,
} from '@/utils/microtomyOperations';

export type MicrotomyWorkItem =
  | { kind: 'block'; caseData: Case; specimen: Specimen; block: HistologyBlock }
  | { kind: 'decant'; caseData: Case; specimen: Specimen; decant: Decant };

export type PrintMode = 'on_demand' | 'batch';

export interface BatchProgressEntry {
  stainId: string;
  stainName: string;
  status: 'pending' | 'printing' | 'printed' | 'failed';
  message?: string;
}

function levelLabelFor(stains: StainOrder[], stainId: string): string {
  const idx = stains.findIndex(s => s.id === stainId);
  return `L${idx + 1}`;
}

export function useMicrotomyWorkstation() {
  const { user } = useAuth();
  const { effectiveStationId } = useEffectiveScanStation();

  const [workItem, setWorkItem] = useState<MicrotomyWorkItem | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('on_demand');
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<BatchProgressEntry[] | null>(null);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<{ kind: 'block' | 'decant'; parentId: string; stainId: string } | null>(null);
  const versionRef = useRef(0);

  const actor = { id: user?.id ?? 'unknown', name: user?.name ?? user?.id ?? 'unknown' };

  const loadStainTypes = useCallback(async () => {
    const res = await stainTypeService.getAll();
    if (res.ok) setStainTypes(res.data.filter(s => s.active));
  }, []);

  // Real default print mode — per PrintSettingsConfig.defaultPrintBehavior
  // (services/printSettings/), same real config On-Demand/Batch already
  // governs elsewhere in this app; the page's own header switcher can
  // still override it per session, per the spec's own "Global header
  // mode switcher."
  const loadDefaultPrintMode = useCallback(async () => {
    const res = await printSettingsService.get();
    if (res.ok) setPrintMode(res.data.defaultPrintBehavior);
  }, []);

  /** Real, per the spec's own "auto-selects first unprinted slide on
   *  Block barcode scan or Block selection from queue." Resolves a
   *  raw scanned value to a real block or decant work item — see this
   *  file's own header for the real, deliberate matrix-block/
   *  specimen-level scope cut. */
  const resolveScan = useCallback(async (rawScanValue: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    setScanError(null);
    if (!rawScanValue.trim()) return { ok: false, message: 'Empty scan.' };
    const resolved = await resolveMaterialFromScan(rawScanValue);
    if (!resolved) {
      const message = 'That scan didn’t resolve to a real case, block, or decant — check the barcode and try again.';
      setScanError(message);
      return { ok: false, message };
    }
    const { caseData, specimenLetter, target } = resolved;
    const specimen = (caseData.specimens ?? []).find(sp => sp.label === specimenLetter);
    if (!specimen) {
      const message = 'Specimen not found on the resolved case.';
      setScanError(message);
      return { ok: false, message };
    }

    versionRef.current = (caseData as unknown as { version?: number }).version ?? 0;

    if (target.level === 'block' || target.level === 'slide') {
      const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
      if (!block) {
        const message = `Block ${specimen.label}${target.blockNumber} not found.`;
        setScanError(message);
        return { ok: false, message };
      }
      setWorkItem({ kind: 'block', caseData, specimen, block });
      setBatchSelection(new Set());
      return { ok: true };
    }
    if (target.level === 'decant' || target.level === 'decant_slide') {
      const decant = (specimen.decants ?? []).find(d => d.label === target.decantLabel);
      if (!decant) {
        const message = `Decant ${specimen.label}${target.decantLabel} not found.`;
        setScanError(message);
        return { ok: false, message };
      }
      setWorkItem({ kind: 'decant', caseData, specimen, decant });
      setBatchSelection(new Set());
      return { ok: true };
    }

    const message = 'This scan target (matrix block/cell-block cassette, or a bare specimen scan) isn’t supported at the Microtomy Workstation yet — scan a specific block or decant/fluid container barcode.';
    setScanError(message);
    return { ok: false, message };
  }, []);

  /** Real, direct, non-scan selection — per the spec's own "Block
   *  selection from queue." Loads a specific case + selects a block
   *  by id, same real work-item shape as a scan resolution. */
  const selectBlockDirectly = useCallback(async (caseId: string, specimenId: string, blockId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    const caseData = await caseRouter.getCase(caseId);
    if (!caseData) return { ok: false, message: 'Case not found.' };
    const specimen = (caseData.specimens ?? []).find(sp => sp.id === specimenId);
    const block = specimen?.blocks?.find(b => b.id === blockId);
    if (!specimen || !block) return { ok: false, message: 'Block not found on this case.' };
    versionRef.current = (caseData as unknown as { version?: number }).version ?? 0;
    setWorkItem({ kind: 'block', caseData, specimen, block });
    setBatchSelection(new Set());
    return { ok: true };
  }, []);

  /** Real, per the spec's own bench workflow — a tech finishes one
   *  block/decant and scans the next; this clears the current work
   *  item and any batch/selection state without touching real data. */
  const clearWorkItem = useCallback(() => {
    setWorkItem(null);
    setScanError(null);
    setBatchSelection(new Set());
    setBatchProgress(null);
  }, []);

  const persist = useCallback(async (caseData: Case, updatedSpecimen: Specimen): Promise<Specimen> => {
    const updatedSpecimens = (caseData.specimens ?? []).map(sp => sp.id === updatedSpecimen.id ? updatedSpecimen : sp);
    const updatedCaseData = { ...caseData, specimens: updatedSpecimens };
    setWorkItem(prev => {
      if (!prev) return prev;
      if (prev.kind === 'block') {
        const block = updatedSpecimen.blocks?.find(b => b.id === prev.block.id);
        return block ? { kind: 'block', caseData: updatedCaseData, specimen: updatedSpecimen, block } : prev;
      }
      const decant = updatedSpecimen.decants?.find(d => d.id === prev.decant.id);
      return decant ? { kind: 'decant', caseData: updatedCaseData, specimen: updatedSpecimen, decant } : prev;
    });
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, versionRef.current);
      versionRef.current += 1;
    } catch (e) {
      // Real, honest simplification vs. useGrossingScreen.ts's own full
      // concurrency-conflict reload modal: this bench page is scoped to
      // one, single physical block/decant at a time and the real,
      // expected case is one tech at one bench — a genuine write
      // collision here is logged, not silently hidden, but doesn't
      // block the tech's own next action. Worth the fuller modal as a
      // real follow-up if multi-tech contention on the same block turns
      // out to be a real, common scenario in the field.
      console.error('[MicrotomyWorkstation] Failed to persist:', e);
    }
    return updatedSpecimen;
  }, []);

  /** Real, per the spec's own Right Panel: resolves the actual,
   *  configured printer/gtin/layout for the CURRENT station — same
   *  real chain useSpecimenBlockManagement.ts's own attemptPrintedLabel
   *  already established and proved working. */
  const getPrinterContext = useCallback(async (): Promise<{ printer: PrinterProfile; gtin: string; layout: SlideLabelLayoutConfig } | { error: string }> => {
    if (!effectiveStationId) return { error: 'No scan station selected for this device — set one from the NavBar station indicator.' };
    const stationRes = await mockScanStationService.getById(effectiveStationId);
    if (!stationRes.ok) return { error: 'Scan station not found.' };
    if (!stationRes.data.supportsPrinting || !stationRes.data.cassetteSlidePrinterProfileId) {
      return { error: 'This station isn’t configured for real slide-label printing — check Scan Stations config.' };
    }
    const printerRes = await printerProfileService.getById(stationRes.data.cassetteSlidePrinterProfileId);
    if (!printerRes.ok || !printerRes.data) return { error: 'The configured printer profile no longer exists — check Scan Stations config.' };
    const settingsRes = await printSettingsService.get();
    const gtin = settingsRes.ok ? settingsRes.data.gs1Gtin : '';
    const layout = settingsRes.ok ? settingsRes.data.slideLabelLayout : DEFAULT_SLIDE_LABEL_LAYOUT;
    return { printer: printerRes.data, gtin, layout };
  }, [effectiveStationId]);

  /** Real, single-slide dispatch: Pending -> Printing (persisted
   *  immediately, so a batch progress UI reflects "in flight"
   *  honestly) -> Printed/Failed. Returns the final, real specimen
   *  snapshot so a caller looping over several slides can thread it
   *  forward without racing this hook's own async state. */
  const dispatchAndRecordPrint = useCallback(async (
    caseData: Case, specimen: Specimen, parentKind: 'block' | 'decant', parentId: string, stains: StainOrder[], stain: StainOrder,
  ): Promise<{ ok: boolean; specimen: Specimen; message?: string }> => {
    const printingResult = parentKind === 'block'
      ? markStainPrinting(specimen, parentId, stain.id)
      : (() => {
          // Decant slides reuse the same pure state-machine functions,
          // which are block-shaped — real, minimal adapter: treat the
          // decant's own stains array as a synthetic single-block view.
          const updatedStains = stains.map(s => s.id !== stain.id ? s : { ...s, printStatus: 'Printing' as const, printFailureReason: undefined });
          return { ok: true as const, specimen: { ...specimen, decants: (specimen.decants ?? []).map(d => d.id !== parentId ? d : { ...d, stains: updatedStains }) } };
        })();
    if (!printingResult.ok) return { ok: false, specimen, message: 'error' in printingResult ? printingResult.error : 'Could not start print.' };
    let current = await persist(caseData, printingResult.specimen);

    const ctx = await getPrinterContext();
    const level = levelLabelFor(stains, stain.id);
    const slideId = stain.displayId ?? `${specimen.label}${parentId}-${level}`;
    const outcome = 'error' in ctx
      ? { ok: false as const, message: ctx.error }
      : await printSlideLabel(
          { fullAccession: caseData.accession?.fullAccession ?? caseData.id, specimenLabel: specimen.label, blockLabel: parentKind === 'block' ? (workItemBlockLabel(current, parentId) ?? '') : (workItemDecantLabel(current, parentId) ?? ''), level, stainName: stain.stainName, slideId },
          ctx.printer, ctx.gtin,
        ).then(r => (r.ok ? { ok: true as const } : { ok: false as const, message: (r as { ok: false; message: string }).message }));

    const finalResult = parentKind === 'block'
      ? markStainPrintResult(current, parentId, stain.id, outcome, actor.id)
      : (() => {
          const updatedStains = (current.decants ?? []).find(d => d.id === parentId)!.stains.map(s => s.id !== stain.id ? s : (
            outcome.ok
              ? { ...s, printStatus: 'Printed' as const, printedAt: new Date().toISOString(), printedBy: actor.id, printFailureReason: undefined }
              : { ...s, printStatus: 'Failed' as const, printFailureReason: outcome.message }
          ));
          return { ok: true as const, specimen: { ...current, decants: (current.decants ?? []).map(d => d.id !== parentId ? d : { ...d, stains: updatedStains }) } };
        })();
    if (!finalResult.ok) return { ok: false, specimen: current, message: 'error' in finalResult ? finalResult.error : 'Could not record print result.' };
    current = await persist(caseData, finalResult.specimen);
    return { ok: outcome.ok, specimen: current, message: outcome.ok ? undefined : outcome.message };
  }, [persist, getPrinterContext, actor.id]);

  function workItemBlockLabel(specimen: Specimen, blockId: string): string | undefined {
    return specimen.blocks?.find(b => b.id === blockId)?.label;
  }
  function workItemDecantLabel(specimen: Specimen, decantId: string): string | undefined {
    return specimen.decants?.find(d => d.id === decantId)?.label;
  }

  /** Real, per the spec's own On-Demand "Print/Etch Next." */
  const handlePrintNext = useCallback(async () => {
    if (!workItem) return;
    const stains = workItem.kind === 'block' ? workItem.block.stains : workItem.decant.stains;
    const next = computeNextUnprintedStain(stains);
    if (!next) return;
    const parentId = workItem.kind === 'block' ? workItem.block.id : workItem.decant.id;
    await dispatchAndRecordPrint(workItem.caseData, workItem.specimen, workItem.kind, parentId, stains, next);
  }, [workItem, dispatchAndRecordPrint]);

  /** Real, per the spec's own "Print Selected" (on-demand, one row)
   *  and Batch "select-all/partial multi-select... Print Batch." Runs
   *  sequentially (not in parallel) so the real-time progress modal
   *  reflects one real, physical print job completing before the
   *  next begins — matching how a single physical printer actually
   *  works, not simulating false concurrency. */
  const handlePrintSelected = useCallback(async (stainIds: string[]) => {
    if (!workItem || stainIds.length === 0) return;
    const stains = workItem.kind === 'block' ? workItem.block.stains : workItem.decant.stains;
    const parentId = workItem.kind === 'block' ? workItem.block.id : workItem.decant.id;
    const ordered = stainIds.map(id => stains.find(s => s.id === id)).filter((s): s is StainOrder => !!s);

    setBatchProgress(ordered.map(s => ({ stainId: s.id, stainName: s.stainName, status: 'pending' })));

    let caseData = workItem.caseData;
    let specimen = workItem.specimen;
    for (const stain of ordered) {
      setBatchProgress(prev => prev?.map(e => e.stainId === stain.id ? { ...e, status: 'printing' } : e) ?? prev);
      const currentStains = workItem.kind === 'block'
        ? specimen.blocks?.find(b => b.id === parentId)?.stains ?? stains
        : specimen.decants?.find(d => d.id === parentId)?.stains ?? stains;
      const result = await dispatchAndRecordPrint(caseData, specimen, workItem.kind, parentId, currentStains, stain);
      specimen = result.specimen;
      caseData = { ...caseData, specimens: (caseData.specimens ?? []).map(sp => sp.id === specimen.id ? specimen : sp) };
      setBatchProgress(prev => prev?.map(e => e.stainId === stain.id ? { ...e, status: result.ok ? 'printed' : 'failed', message: result.message } : e) ?? prev);
    }
  }, [workItem, dispatchAndRecordPrint]);

  const clearBatchProgress = useCallback(() => setBatchProgress(null), []);

  // ── Stain management ────────────────────────────────────────────────────
  const handleAddStain = useCallback(async (stainType: StainType, options: { duplicateCount?: number; levelDepthMicrons?: number; pairWithControl?: boolean; preparationMethod?: StainOrder['preparationMethod'] } = {}) => {
    if (!workItem) return;
    const fullAccession = workItem.caseData.accession?.fullAccession ?? workItem.caseData.id;
    if (workItem.kind === 'block') {
      const result = addMicrotomyStain(workItem.specimen, workItem.block.id, stainType, fullAccession, options);
      if (result.ok) await persist(workItem.caseData, result.specimen);
    } else {
      const result = addDecantStain(workItem.specimen, workItem.decant.id, stainType, fullAccession, options.preparationMethod);
      if (result.ok) await persist(workItem.caseData, result.specimen);
    }
  }, [workItem, persist]);

  /** Real, per direct follow-up: the spec's own Add Stain Quick-Picker
   *  category list ("Special Stains, IHC, Levels/Recuts, Controls")
   *  includes ordering another LEVEL of a stain already on this block
   *  — a real, distinct action from picking a brand-new stain type,
   *  since "Levels/Recuts" isn't itself a real StainType.category
   *  (SectioningProtocol already owns "how deep/how many levels" as
   *  its own, separate real dimension — see IStainService.ts's own
   *  header). This is the direct, one-click version: cut another
   *  level of the EXACT SAME stain already sitting in this row,
   *  reusing the same real duplicate/level-depth machinery as the
   *  general picker rather than a second, parallel mechanism. */
  const handleAddLevelOfExistingStain = useCallback(async (stain: StainOrder, levelDepthMicrons?: number) => {
    if (!workItem) return;
    const fullAccession = workItem.caseData.accession?.fullAccession ?? workItem.caseData.id;
    const matchedType = stainTypes.find(t => t.name === stain.stainName);
    const stainTypeForRecut: StainType = matchedType ?? ({
      id: `adhoc-${stain.stainName}`, name: stain.stainName, category: 'Other',
      active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
    } as StainType);
    if (workItem.kind === 'block') {
      const result = addMicrotomyStain(workItem.specimen, workItem.block.id, stainTypeForRecut, fullAccession, { levelDepthMicrons, duplicateCount: 1 });
      if (result.ok) await persist(workItem.caseData, result.specimen);
    } else {
      const result = addDecantStain(workItem.specimen, workItem.decant.id, stainTypeForRecut, fullAccession, stain.preparationMethod);
      if (result.ok) await persist(workItem.caseData, result.specimen);
    }
  }, [workItem, persist, stainTypes]);

  const requestRemoveStain = useCallback((stainId: string) => {
    if (!workItem) return;
    const parentId = workItem.kind === 'block' ? workItem.block.id : workItem.decant.id;
    const stains = workItem.kind === 'block' ? workItem.block.stains : workItem.decant.stains;
    const stain = stains.find(s => s.id === stainId);
    const alreadyPrinted = stain?.printStatus === 'Printed' || stain?.printStatus === 'Printing';
    if (alreadyPrinted) {
      setPendingRemoval({ kind: workItem.kind, parentId, stainId });
      return 'needs_reason' as const;
    }
    void performRemoveStain(stainId);
    return 'removed' as const;
  }, [workItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const performRemoveStain = useCallback(async (stainId: string, reason?: MicrotomyCancelReason) => {
    if (!workItem) return;
    const result = workItem.kind === 'block'
      ? removeMicrotomyStain(workItem.specimen, workItem.block.id, stainId, reason)
      : removeDecantStain(workItem.specimen, workItem.decant.id, stainId, reason);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  const confirmPendingRemoval = useCallback(async (reason: MicrotomyCancelReason) => {
    if (!pendingRemoval) return;
    await performRemoveStain(pendingRemoval.stainId, reason);
    setPendingRemoval(null);
  }, [pendingRemoval, performRemoveStain]);

  const cancelPendingRemoval = useCallback(() => setPendingRemoval(null), []);

  const handleReprint = useCallback(async (stainId: string, reason: typeof MICROTOMY_REPRINT_REASONS[number]) => {
    if (!workItem || workItem.kind !== 'block') return; // Real scope note: reprint reasons are spec'd for the block slide grid; a decant slide reuses removeDecantStain's own reason gate instead.
    const result = reprintMicrotomyStain(workItem.specimen, workItem.block.id, stainId, reason, actor.id);
    if (!result.ok) return;
    const specimen = await persist(workItem.caseData, result.specimen);
    const stain = specimen.blocks?.find(b => b.id === workItem.block.id)?.stains.find(s => s.id === stainId);
    if (stain) {
      const stains = specimen.blocks?.find(b => b.id === workItem.block.id)?.stains ?? [];
      await dispatchAndRecordPrint(workItem.caseData, specimen, 'block', workItem.block.id, stains, stain);
    }
  }, [workItem, persist, dispatchAndRecordPrint, actor.id]);

  const handleReorder = useCallback(async (orderedStainIds: string[]) => {
    if (!workItem || workItem.kind !== 'block') return;
    const result = reorderBlockStains(workItem.specimen, workItem.block.id, orderedStainIds);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  // ── Comments ─────────────────────────────────────────────────────────────
  const handleAddStainComment = useCallback(async (stainId: string, text: string, printsOnLabel: boolean) => {
    if (!workItem || workItem.kind !== 'block') return;
    const result = updateStainComment(workItem.specimen, workItem.block.id, stainId, text, printsOnLabel, actor);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist, actor]);

  const handleAddBlockComment = useCallback(async (text: string) => {
    if (!workItem || workItem.kind !== 'block') return;
    const result = updateBlockComment(workItem.specimen, workItem.block.id, text, actor);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist, actor]);

  const handleSetAlertFlags = useCallback(async (flags: { tinyTissue?: boolean; fragile?: boolean; requiresDecal?: boolean }) => {
    if (!workItem || workItem.kind !== 'block') return;
    const result = setBlockAlertFlags(workItem.specimen, workItem.block.id, flags);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  // ── Cytology / Decant panel ──────────────────────────────────────────────
  const handleUpdateCytologyFields = useCallback(async (fields: { totalVolumeMl?: number; appearance?: Decant['appearance']; yieldPelletSize?: Decant['yieldPelletSize'] }) => {
    if (!workItem || workItem.kind !== 'decant') return;
    const result = updateDecantCytologyFields(workItem.specimen, workItem.decant.id, fields);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  const handleApplyPrepSuggestions = useCallback(async (suggestions: CytologyPrepSuggestion[]) => {
    if (!workItem || workItem.kind !== 'decant') return;
    const fullAccession = workItem.caseData.accession?.fullAccession ?? workItem.caseData.id;
    const result = applyCytologyPrepSuggestions(workItem.specimen, workItem.decant.id, suggestions, fullAccession);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  return {
    workItem, scanError, resolveScan, selectBlockDirectly, clearWorkItem,
    printMode, setPrintMode, loadDefaultPrintMode,
    batchSelection, setBatchSelection, batchProgress, clearBatchProgress,
    stainTypes, loadStainTypes,
    handlePrintNext, handlePrintSelected,
    handleAddStain, handleAddLevelOfExistingStain, requestRemoveStain, pendingRemoval, confirmPendingRemoval, cancelPendingRemoval,
    handleReprint, handleReorder,
    handleAddStainComment, handleAddBlockComment, handleSetAlertFlags,
    handleUpdateCytologyFields, handleApplyPrepSuggestions,
    effectiveStationId, actor,
  };
}
