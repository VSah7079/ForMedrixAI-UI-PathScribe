// src/pages/SynopticReportPage/hooks/useSpecimenBlockManagement.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx (originally lines ~391-476,
// ~2359-2415) as part of the same incremental cleanup that produced
// useLisIntegration.ts — see that file's header for the full rationale.
//
// PURE MOVE, not a rewrite — every function body is unchanged from its
// original implementation.
//
// Scope: focused-block navigation/state and the block-level edit
// operations (advance status, confirm triage, manual edit, add a new
// block). Deliberately does NOT include handleGrossComplete, even
// though its name also mentions grossing/specimens — that function is
// ~235 lines and genuinely depends on handleProtocolChangesDetected
// (part of the amendment/protocol-change domain), plus pool routing,
// AI-behavior config, and Stage 1 synoptic evaluation. It's cross-
// cutting enough that it deserves its own dedicated extraction pass
// rather than being bundled in here just because of its name.
//
// allBlocks, focusedBlockIndex, and handleAdvanceFocusedBlockStatus /
// handleConfirmTriage are also read directly by a large voice-command
// listener elsewhere in the main file (search for "openFlagManager,
// showTeamModal" in SynopticReportPage.tsx for the comment explaining
// why that listener couldn't live next to these). That listener is
// untouched by this extraction — it continues to reference these by
// name, now sourced from this hook's return value instead of being
// defined inline in the same scope.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback, useRef, type MutableRefObject } from 'react';
import { caseRouter } from '@/services/cases/CaseRouter';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock, BlockStatus, StainOrder } from '@/types/case/Specimen';
import type { MatrixBlock } from '@/types/case/MatrixBlock';
import type { Decant } from '@/types/case/Material';
import { UNSTAINED_LABEL } from '@/types/case/Specimen';
import type { SigningUser, SetConcurrencyConflict } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';
import { useCassetteScanVerification } from './useCassetteScanVerification';
import { printSettingsService, specimenDeficiencyService, auditService as mockAuditService } from '@/services/index';
import type { PrintSettingsConfig } from '@/services/printSettings/IPrintSettingsService';
import { dispatchCassetteLabel, dispatchMatrixCassetteLabel } from '@/utils/labels/dispatchCassetteLabel';
import { getAllCassetteLabelRequests } from '@/utils/labels/getAllCassetteLabelRequests';
import { cassetteIdentifier, slideIdentifier, decantIdentifier, matrixBlockIdentifier } from '@/types/labels/LabelData';
import { dispatchSlideLabel } from '@/utils/labels/dispatchSlideLabel';
import { getAllSlideLabelRequests } from '@/utils/labels/getAllSlideLabelRequests';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { printerProfileService } from '@/services/index';
import { printCassetteLabel, printSlideLabel } from '@/utils/labels/printCassetteSlideLabel';
import { resolveDecantCassetteColor } from '@/utils/resolveDecantCassetteColor';
import { resolveBlockCassetteColor } from '@/utils/resolveBlockCassetteColor';
import { resolveProtocolIdForSpecimen } from '@/utils/resolveProtocolIdForSpecimen';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

interface UseSpecimenBlockManagementParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  signingUser: SigningUser;
  markDirty: (section: string) => void;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  sendMaterialOrderToLis: (order: { kind: 'block_recut' | 'stain' | 'cancel' | 'restain'; specimenId: string; label: string }) => Promise<{ ok: boolean }>;
  showToast: (message: string) => void;
  /** Real fix, per direct follow-up: "I would like to support both
   *  slide engraving and printed labels." Passed in explicitly by the
   *  caller (SynopticReportPage.tsx, via useEffectiveScanStation())
   *  rather than this hook calling useEffectiveScanStation() itself —
   *  that hook depends on useAuth()/AuthContext, and this hook is
   *  deliberately, explicitly designed to take every real dependency
   *  as a plain parameter so it stays testable with renderHook() and
   *  no provider tree at all (confirmed directly: the existing
   *  integration test renders this hook completely unwrapped). Real,
   *  optional — null/undefined behaves exactly as this feature not
   *  existing at all. */
  effectiveStationId?: string | null;
}

export function useSpecimenBlockManagement({
  caseData, setCaseData, signingUser, markDirty, knownVersionRef,
  setConcurrencyConflict, sendMaterialOrderToLis, showToast, effectiveStationId,
}: UseSpecimenBlockManagementParams) {
  // Real fix, per direct follow-up: "what will happen if two
  // transaction happen at the same time?" Confirmed directly: the
  // optimistic block/stain flow below has a real, second async phase
  // (confirming/rejecting the request, ~400ms later in the mock) that
  // was persisting from a snapshot of specimens captured back at the
  // START of that phase — a real, unrelated change made anywhere else
  // on the case during that window would get silently overwritten
  // and lost the moment this phase's own write went through, since
  // it would blindly re-save its own stale copy of everything, not
  // just the one field it actually meant to change. This ref is kept
  // synced to the real, latest caseData on every render — reading
  // caseDataRef.current at the moment of persisting (rather than a
  // value closed over when the async function started) means Phase 2
  // only ever builds its write from what's genuinely current.
  const caseDataRef = useRef(caseData);
  caseDataRef.current = caseData;

  // Real feature, per direct follow-up: Step 4 of the label-printing
  // build plan — on-demand trigger wiring + scan verification. Real,
  // deliberate composition here (not threaded in from the parent as a
  // prop) — this hook already owns block creation (handleAddBlock
  // below), the one real place a cassette gets created during
  // grossing, so the trigger and the verification state live right
  // next to each other.
  const { pendingVerification, registerPendingVerification, hasUnverifiedPendingCassette } = useCassetteScanVerification();
  const [printSettings, setPrintSettings] = useState<PrintSettingsConfig | null>(null);
  useEffect(() => {
    printSettingsService.get().then(res => { if (res.ok) setPrintSettings(res.data); });
  }, []);

  // ── Grossing: focused block navigation ──────────────────────────────────────
  // A voice command like "mark grossed" needs to know *which* block,
  // unambiguously — there was no such concept anywhere before this.
  // Flattened across every specimen so "next/previous block" moves
  // through the whole case in one sequence, not per-specimen.
  const allBlocks = useMemo(() => {
    const out: { specimenId: string; specimenLabel: string; specimenDescription: string; block: HistologyBlock }[] = [];
    (caseData?.specimens ?? []).forEach((sp: Specimen) => {
      (sp.blocks ?? []).forEach((block: HistologyBlock) => out.push({ specimenId: sp.id, specimenLabel: sp.label, specimenDescription: sp.description, block }));
    });
    return out;
  }, [caseData?.specimens]);
  // Real feature, per direct follow-up: "decant-level linking UI. In
  // the same UI we add specimens, blocks stains, protocols?" Real,
  // parallel counterpart to allBlocks above — kept genuinely separate
  // (not merged into one, unioned array) rather than risk an invasive
  // type-union rippling through allBlocks' own established consumers
  // (focusedBlockIndex, voice commands, etc.), which never needed to
  // know about decants at all.
  const allDecants = useMemo(() => {
    const out: { specimenId: string; specimenLabel: string; specimenDescription: string; decant: Decant }[] = [];
    (caseData?.specimens ?? []).forEach((sp: Specimen) => {
      (sp.decants ?? []).forEach((decant: Decant) => out.push({ specimenId: sp.id, specimenLabel: sp.label, specimenDescription: sp.description, decant }));
    });
    return out;
  }, [caseData?.specimens]);
  const [focusedBlockIndex, setFocusedBlockIndex] = useState(0);
  useEffect(() => {
    if (focusedBlockIndex >= allBlocks.length) setFocusedBlockIndex(Math.max(0, allBlocks.length - 1));
  }, [allBlocks.length, focusedBlockIndex]);
  const focusedBlockEntry = allBlocks[focusedBlockIndex];

  // Real feature, per direct research: Step 6 of the label-printing build
  // plan — "PathScribe, print current cassette" vs "PathScribe, batch
  // print case slides" as real voice/hotkey actions
  // (services/actionRegistry/'s own PRINT_CURRENT_CASSETTE and
  // BATCH_PRINT_CASE_LABELS entries dispatch these same custom events).
  // Both real functions here are also directly callable from a UI
  // button (MaterialTreePanel.tsx) — the voice/hotkey listener and the
  // button share one real implementation, not two parallel ones that
  // could drift apart.
  // Real feature, per direct follow-up: "Label Reprint is a real thing
  // too. Either a batch or single." The real, underlying print logic
  // takes an explicit specimen/block — never depends on what's
  // currently focused — so a reprint action on ANY block (not just the
  // one the user happens to have open) can call this directly.
  // Real feature, per direct follow-up: "I would like to support both
  // slide engraving and printed labels." Real, effective scan station
  // (services/scanStations/) is where "does THIS station actually
  // print, engrave, both, or neither" now lives — see
  // ScanStation.supportsEngraving/supportsPrinting's own doc comments.
  // Received as an explicit parameter (see UseSpecimenBlockManagementParams's
  // own doc comment) rather than called directly here.

  /** Real, deliberate, purely-ADDITIVE helper — never replaces or
   *  gates the existing dispatchCassetteLabel/dispatchSlideLabel
   *  engrave-stub calls below, which stay exactly as they were.
   *  Fetches the real, effective station, and — only when it's
   *  genuinely configured with supportsPrinting and a real target
   *  printer profile — fires the real, parallel print via
   *  printCassetteSlideLabel.ts. A station with neither flag set
   *  (the real default for every seeded station except the two
   *  deliberately configured as print-capable examples) behaves
   *  exactly as it did before this feature existed. Fire-and-forget,
   *  same posture as the engrave-stub calls it sits beside — a real
   *  print failure surfaces via its own toast, never blocks the rest
   *  of the grossing/scanning workflow.
   *
   *  `build`'s own return shape is deliberately a flat
   *  { ok, message? } rather than printCassetteSlideLabel.ts's own
   *  real, discriminated PrintCassetteSlideLabelResult|Error union —
   *  this project's own tsconfig.json has strictNullChecks disabled,
   *  under which that union can't be reliably narrowed at this call
   *  boundary; each real call site below does its own, local,
   *  established cast against the real union before flattening it
   *  here, rather than fighting that limitation a second time in this
   *  shared helper. */
  const attemptPrintedLabel = useCallback(async (
    kind: 'cassette' | 'slide',
    build: (printer: PrinterProfile, gtin: string) => Promise<{ ok: boolean; message?: string }>,
  ) => {
    if (!effectiveStationId) return;
    const stationRes = await mockScanStationService.getById(effectiveStationId);
    if (!stationRes.ok || !stationRes.data.supportsPrinting || !stationRes.data.cassetteSlidePrinterProfileId) return;
    const printerRes = await printerProfileService.getById(stationRes.data.cassetteSlidePrinterProfileId);
    if (!printerRes.ok || !printerRes.data) {
      showToast(`Station is configured to print ${kind} labels, but its own printer profile no longer exists — check Scan Stations config.`);
      return;
    }
    const settingsRes = await printSettingsService.get();
    const gtin = settingsRes.ok ? settingsRes.data.gs1Gtin : '';
    const result = await build(printerRes.data, gtin);
    if (!result.ok) showToast(`Printed ${kind} label failed: ${result.message ?? 'unknown error'}`);
  }, [effectiveStationId, showToast]);

  const printCassetteForBlock = useCallback((specimenLabel: string, blockLabel: string) => {
    if (!caseData) return;
    const cassetteId = cassetteIdentifier(caseData.accession.fullAccession, specimenLabel, blockLabel);
    dispatchCassetteLabel({
      fullAccession: caseData.accession.fullAccession,
      specimenLabel,
      blockLabel,
      cassetteId,
    }).catch(console.error);
    // Real, purely additive — see attemptPrintedLabel's own doc
    // comment. Never affects the dispatchCassetteLabel engrave-stub
    // call above.
    attemptPrintedLabel('cassette', async (printer, gtin) => {
      const result = await printCassetteLabel({
        fullAccession: caseData.accession.fullAccession, specimenLabel, blockLabel, cassetteId,
        patientName: `${caseData.patient.givenNames} ${caseData.patient.familyNames}`.trim(),
      }, printer, gtin);
      // Real, deliberate cast — see attemptPrintedLabel's own doc
      // comment on why this project's own tsconfig.json requires it.
      return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
    }).catch(console.error);
    registerPendingVerification({ cassetteId, blockLabel, specimenLabel });
    showToast(`Printing cassette ${cassetteId}…`);
  }, [caseData, registerPendingVerification, showToast, attemptPrintedLabel]);

  // Real, dedicated sibling to printCassetteForBlock above, for a real
  // matrix block — added per direct follow-up: "primary label
  // printing for matrix blocks." Same real on-demand reprint
  // capability (voice/hotkey/button-callable), just resolving every
  // real participant's own label rather than a single specimenLabel.
  const printMatrixCassette = useCallback((matrixBlockId: string) => {
    if (!caseData) return;
    const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === matrixBlockId);
    if (!matrixBlock) return;
    const fullAccession = caseData.accession.fullAccession;
    const cassetteId = matrixBlockIdentifier(fullAccession, matrixBlock.label);
    const specimenLabels = matrixBlock.participants.map(p =>
      (caseData.specimens ?? []).find(s => s.id === p.specimenId)?.label ?? '?');
    dispatchMatrixCassetteLabel({
      fullAccession, specimenLabels, matrixBlockLabel: matrixBlock.label, cassetteId,
    }).catch(console.error);
    // Real, purely additive — see attemptPrintedLabel's own doc
    // comment. Never affects the dispatchMatrixCassetteLabel
    // engrave-stub call above. Real, deliberate reuse of the ordinary-
    // block printCassetteLabel rather than a whole, separate matrix-
    // specific print function: the GS1 barcode itself only ever
    // encodes the accession + this cassette's own real, shared id
    // (matrix or ordinary makes no difference there) — the joined
    // specimen labels below only affect the human-readable text line.
    attemptPrintedLabel('cassette', async (printer, gtin) => {
      const result = await printCassetteLabel({
        fullAccession, specimenLabel: specimenLabels.join(','), blockLabel: matrixBlock.label, cassetteId,
        patientName: `${caseData.patient.givenNames} ${caseData.patient.familyNames}`.trim(),
      }, printer, gtin);
      return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
    }).catch(console.error);
    registerPendingVerification({ cassetteId, blockLabel: matrixBlock.label, specimenLabel: '' });
    showToast(`Printing cassette ${cassetteId}…`);
  }, [caseData, registerPendingVerification, showToast, attemptPrintedLabel]);

  // Voice/hotkey entry point — "print current cassette" genuinely means
  // whatever's focused right now, so this stays a thin wrapper around
  // the real, explicit-block function above rather than its own,
  // separate implementation.
  const handlePrintCurrentCassette = useCallback(() => {
    if (!focusedBlockEntry) return;
    printCassetteForBlock(focusedBlockEntry.specimenLabel, focusedBlockEntry.block.label);
  }, [focusedBlockEntry, printCassetteForBlock]);

  // Real fix, per direct follow-up: enforceOnDemandGuardrails was a
  // real, working Config toggle (Step 3) that persisted correctly but
  // was never actually read anywhere — confirmed directly (grepped the
  // whole codebase, zero real matches outside its own definition and
  // the Config UI). "When on, the default above is fixed lab-wide —
  // accessioners cannot switch to Batch for an individual case"
  // (PrintSettingsSection.tsx's own stated behavior) now means what it
  // says: batch printing is genuinely blocked, not just described as
  // blocked, whenever the lab's real default is on-demand and the
  // guardrail is enforced.
  const batchPrintBlocked = printSettings?.defaultPrintBehavior === 'on_demand' && printSettings?.enforceOnDemandGuardrails === true;

  const handleBatchPrintCassettes = useCallback(() => {
    if (!caseData) return;
    if (batchPrintBlocked) {
      showToast('Batch printing is disabled — this lab enforces on-demand cassette printing. Ask an admin to change this in Print Settings if needed.');
      return;
    }
    const { ordinary, matrix } = getAllCassetteLabelRequests(caseData);
    const total = ordinary.length + matrix.length;
    if (total === 0) {
      showToast('No cassettes on this case yet — nothing to print.');
      return;
    }
    Promise.all([
      ...ordinary.map(r => dispatchCassetteLabel(r)),
      ...matrix.map(r => dispatchMatrixCassetteLabel(r)),
    ]).catch(console.error);
    // Real, purely additive — see attemptPrintedLabel's own doc
    // comment. A real batch run touches every real cassette on the
    // case, ordinary and matrix alike, same as the engrave-stub calls
    // immediately above — this was a real, genuine gap until now: the
    // on-demand print paths (printCassetteForBlock/printMatrixCassette)
    // already had this wired; batch printing hadn't.
    const patientName = `${caseData.patient.givenNames} ${caseData.patient.familyNames}`.trim();
    Promise.all([
      ...ordinary.map(r => attemptPrintedLabel('cassette', async (printer, gtin) => {
        const result = await printCassetteLabel({ ...r, patientName }, printer, gtin);
        return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
      })),
      ...matrix.map(r => attemptPrintedLabel('cassette', async (printer, gtin) => {
        const result = await printCassetteLabel({
          fullAccession: r.fullAccession, specimenLabel: r.specimenLabels.join(','), blockLabel: r.matrixBlockLabel,
          cassetteId: r.cassetteId, patientName,
        }, printer, gtin);
        return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
      })),
    ]).catch(console.error);
    showToast(`Printing ${total} cassette label${total === 1 ? '' : 's'} for ${caseData.accession.fullAccession}…`);
  }, [caseData, batchPrintBlocked, showToast, attemptPrintedLabel]);

  // Real feature, per direct follow-up: "I think I would expect to
  // reprint a slide label but that print icon is for the cassette...
  // perhaps we need a larger modal window to manage reprints at the
  // Req/Container/Cassette and slide level." Same real pattern as the
  // cassette functions immediately above — single and batch share one
  // real implementation, respects the same lab-wide batchPrintBlocked
  // guardrail (a slide label is the same kind of physical, per-item
  // print job as a cassette one, so the same on-demand-only policy
  // applies equally here).
  const printSlideForStain = useCallback((specimenLabel: string, blockLabel: string, level: string, stainName: string) => {
    if (!caseData) return;
    const slideId = slideIdentifier(caseData.accession.fullAccession, specimenLabel, blockLabel, level);
    dispatchSlideLabel({
      fullAccession: caseData.accession.fullAccession,
      specimenLabel, blockLabel, level, stainName, slideId,
    }).catch(console.error);
    // Real, purely additive — see attemptPrintedLabel's own doc
    // comment. Never affects the dispatchSlideLabel engrave-stub call
    // above.
    attemptPrintedLabel('slide', async (printer, gtin) => {
      const result = await printSlideLabel({
        fullAccession: caseData.accession.fullAccession, specimenLabel, blockLabel, level, stainName, slideId,
      }, printer, gtin);
      return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
    }).catch(console.error);
    showToast(`Printing slide ${slideId}…`);
  }, [caseData, showToast, attemptPrintedLabel]);

  const handleBatchPrintSlides = useCallback(() => {
    if (!caseData) return;
    if (batchPrintBlocked) {
      showToast('Batch printing is disabled — this lab enforces on-demand slide printing. Ask an admin to change this in Print Settings if needed.');
      return;
    }
    const requests = getAllSlideLabelRequests(caseData);
    if (requests.length === 0) {
      showToast('No slides on this case yet — nothing to print.');
      return;
    }
    Promise.all(requests.map(r => dispatchSlideLabel(r))).catch(console.error);
    // Real, purely additive — same real gap-fix as
    // handleBatchPrintCassettes immediately above; see that function's
    // own comment.
    Promise.all(requests.map(r => attemptPrintedLabel('slide', async (printer, gtin) => {
      const result = await printSlideLabel(r, printer, gtin);
      return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
    }))).catch(console.error);
    showToast(`Printing ${requests.length} slide label${requests.length === 1 ? '' : 's'} for ${caseData.accession.fullAccession}…`);
  }, [caseData, batchPrintBlocked, showToast, attemptPrintedLabel]);

  useEffect(() => {
    const onPrintCurrent = () => handlePrintCurrentCassette();
    const onBatchPrint = () => handleBatchPrintCassettes();
    window.addEventListener('PATHSCRIBE_PRINT_CURRENT_CASSETTE', onPrintCurrent);
    window.addEventListener('PATHSCRIBE_BATCH_PRINT_CASE_LABELS', onBatchPrint);
    return () => {
      window.removeEventListener('PATHSCRIBE_PRINT_CURRENT_CASSETTE', onPrintCurrent);
      window.removeEventListener('PATHSCRIBE_BATCH_PRINT_CASE_LABELS', onBatchPrint);
    };
  }, [handlePrintCurrentCassette, handleBatchPrintCassettes]);

  // Real fix, per direct follow-up: "Phase 3 — the sibling-
  // propagation confirmation system from a few turns back is still
  // sitting there... it should come out." That system existed to
  // keep N per-specimen HistologyBlock records (tied together by a
  // sharedCassetteId string tag) from drifting out of sync — the
  // real architectural fix (Case.matrixBlocks[], a single tracked
  // asset) made that propagation logic structurally unnecessary, not
  // just unused. Confirmed directly before removing: no seed/mock
  // data anywhere in this app still carries a real sharedCassetteId,
  // so this is a clean removal, not a silent behavior change for any
  // real, persisted case. Back to a direct, single-block update —
  // exactly what this function did before that system existed.
  const handleAdvanceFocusedBlockStatus = useCallback(async () => {
    if (!caseData?.id || !focusedBlockEntry) return;
    const nextStatus: Record<string, BlockStatus> = { Pending: 'Grossed', Grossed: 'Embedded' };
    const newStatus = nextStatus[focusedBlockEntry.block.status];
    if (!newStatus) return; // Embedded/Exhausted are terminal or exception states — not voice-advanceable
    const patchedSpecimens = (caseData.specimens ?? []).map((sp: Specimen) => ({
      ...sp,
      blocks: (sp.blocks ?? []).map((b: HistologyBlock) => b.id === focusedBlockEntry.block.id ? { ...b, status: newStatus } : b),
    }));
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
      markDirty('Block status');
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to advance block status:', e);
    }
  }, [caseData, focusedBlockEntry, markDirty, knownVersionRef, setCaseData, setConcurrencyConflict]);

  const handleConfirmTriage = useCallback(async () => {
    if (!caseData?.id || !focusedBlockEntry) return;
    const patchedSpecimens = (caseData.specimens ?? []).map((sp: Specimen) =>
      sp.id !== focusedBlockEntry.specimenId ? sp : {
        ...sp, triageConfirmedAt: new Date().toISOString(), triageConfirmedBy: signingUser?.id ?? 'unknown',
      }
    );
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
      markDirty('Triage confirmation');
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to confirm triage:', e);
    }
  }, [caseData, focusedBlockEntry, signingUser, markDirty, knownVersionRef, setCaseData, setConcurrencyConflict]);

  // ── Generic block update — the manual Block/Stain editor ────────────────────
  // Distinct from handleAdvanceFocusedBlockStatus above, which only ever
  // cycles the *focused* block one status forward for voice commands.
  // This applies any change (status, priority override, stains) to any
  // specific block by id, for the actual visual editor at the bench —
  // there was no way to hand-edit a block at all before this, only
  // auto-generation at accession time and one-step voice advancement.
  const handleUpdateBlock = useCallback(async (specimenId: string, blockId: string, changes: Partial<HistologyBlock>) => {
    if (!caseData?.id) return;
    // Real fix, per direct follow-up: "what will happen if two
    // transaction happen at the same time?" Reads caseDataRef.current
    // (the genuinely latest specimens) rather than the caseData
    // parameter this callback closed over — the same stale-snapshot
    // risk as this hook's own two-phase optimistic block flow (see
    // caseDataRef's own top-level comment), and a real one here
    // specifically: the new optimistic stain flow calls onUpdateBlock
    // twice from the same, already-running handler (once immediately,
    // once ~400ms later once the real request resolves) — the second
    // call must not silently revert whatever changed on the case,
    // including the first call's own update, in between.
    const currentSpecimens = caseDataRef.current?.specimens ?? caseData.specimens ?? [];

    // Real feature, per direct follow-up: "Is the discrepancy being
    // tracked in the Quality Assurance Module?" It wasn't — only a
    // computed badge on the Material tree, no real QA record. Fires
    // exactly once, at the real moment a genuine mismatch is
    // confirmed (this call is specifically the embedding-confirmation
    // one — see BlockStainEditorModal.tsx's own embedCountPrompt),
    // raising a real, tracked SpecimenDeficiency through the same,
    // existing, ISO 15189-aligned engine every other real deficiency
    // in this app already uses — not a second, parallel QA mechanism.
    // Fire-and-forget: a QA logging failure must never block the real,
    // physical embedding transition itself from completing.
    if (changes.pieceCountAtEmbedding != null) {
      const sp = currentSpecimens.find((s: Specimen) => s.id === specimenId);
      const block = sp?.blocks?.find((b: HistologyBlock) => b.id === blockId);
      if (block && typeof block.pieceCount === 'number' && block.pieceCount !== changes.pieceCountAtEmbedding) {
        specimenDeficiencyService.raise({
          caseId: caseData.id,
          specimenId,
          specimenLabel: sp?.label,
          deficiencyTypeId: 'def-tissue-discrepancy',
          comment: `Block ${sp?.label ?? ''}${block.label}: ${block.pieceCount} piece${block.pieceCount === 1 ? '' : 's'} recorded at grossing, ${changes.pieceCountAtEmbedding} observed at embedding.`,
          raisedBy: signingUser?.id ?? 'unknown',
        }).catch(err => console.error('[Grossing] Failed to raise Tissue Discrepancy deficiency:', err));
      }
    }

    // Real feature, per direct follow-up: "Audit Trail Tracking: Log
    // the exact moment the foreign 2D barcode was scanned and bound
    // to the internal CaseID to maintain strict chain-of-custody
    // compliance." Real bug caught before this ever ran: the UI
    // commits externalId and externalIdSource as two SEPARATE field
    // edits (one onBlur per input), never together in one `changes`
    // object — a naive "both present in changes" check would never
    // fire. This instead compares the real, merged pre/post state
    // (falling back to the record's own existing value for whichever
    // field this particular call doesn't touch) and fires exactly
    // once: the moment the pair genuinely becomes complete, or the
    // id itself changes on an already-complete pair — never on a
    // partial edit, and never twice for the same real binding,
    // regardless of which field the tech happened to fill in first.
    if (changes.externalId !== undefined || changes.externalIdSource !== undefined) {
      const sp = currentSpecimens.find((s: Specimen) => s.id === specimenId);
      const block = sp?.blocks?.find((b: HistologyBlock) => b.id === blockId);
      if (block) {
        const mergedExternalId = changes.externalId !== undefined ? changes.externalId : block.externalId;
        const mergedExternalIdSource = changes.externalIdSource !== undefined ? changes.externalIdSource : block.externalIdSource;
        const wasComplete = !!block.externalId && !!block.externalIdSource;
        const isNowComplete = !!mergedExternalId && !!mergedExternalIdSource;
        if (isNowComplete && (!wasComplete || mergedExternalId !== block.externalId)) {
          mockAuditService.logEvent({
            type: 'system',
            event: 'Foreign ID Bound',
            detail: `Block ${sp?.label ?? ''}${block.label} bound to foreign id "${mergedExternalId}" (source: ${mergedExternalIdSource}).`,
            user: signingUser?.id ?? 'unknown',
            caseId: caseData.id,
            confidence: null,
          }).catch(err => console.error('[Grossing] Failed to log Foreign ID Bound audit entry:', err));
        }
      }
    }

    const patchedSpecimens = currentSpecimens.map((sp: Specimen) => ({
      ...sp,
      blocks: (sp.blocks ?? []).map((b: HistologyBlock) => b.id === blockId ? { ...b, ...changes } : b),
    }));
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
      markDirty('Block edit');
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to update block:', e);
    }
  }, [caseData, markDirty, knownVersionRef, setCaseData, setConcurrencyConflict, signingUser]);

  // Real feature, per direct confirmation: "what happens is when the
  // wrong piece gets into the wrong block" — corrects a genuine
  // mis-assignment error, not withdrawal of an unfulfilled order.
  // Grounded explicitly in CAP ANP.11600, CLIA 493.1105, and ISO
  // 15189:2012 5.8 per direct confirmation of the required workflow:
  // create → cancel with a required reason → automatically removed
  // from active workflow → audit trail retained permanently.
  //
  // Sets status to 'Cancelled' rather than deleting the record, so
  // the mistake and its correction stay visible as real history —
  // same "keep the record, change its state" posture as Biopsy
  // Array's own unlink behavior. Sends a real LIS order (unlike
  // handleUpdateBlock above, which has no LIS side-effect at all) —
  // cancelling tells the lab not to process this block, a genuine
  // physical-world action. Also clears any Biopsy Array membership —
  // a cancelled block no longer represents valid tissue at that
  // position, so it shouldn't still occupy a slot in the array
  // diagram.
  //
  // Cascade-cancels every stain order still in a non-terminal state
  // (anything short of Coverslipped/Ready for Review/QC Failed) —
  // this IS the concrete "what downstream actions were prevented"
  // record the spec calls for: each affected stain's own status
  // becoming 'Cancelled' documents exactly what processing this
  // stopped. A stain that already finished (coverslipped, reviewed,
  // or already failed QC) is real, completed lab work — cancelling
  // the block doesn't retroactively undo work that already happened.
  const handleCancelBlock = useCallback(async (specimenId: string, blockId: string, reason: string) => {
    if (!caseData?.id || !reason.trim()) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    const block = sp?.blocks?.find(b => b.id === blockId);
    if (!sp || !block) return;

    showToast('Sending block cancellation to LIS…');
    const result = await sendMaterialOrderToLis({ kind: 'cancel', specimenId, label: block.label });
    if (!result.ok) {
      showToast('LIS did not acknowledge the cancellation — nothing was recorded. Try again.');
      return;
    }

    const TERMINAL_STAIN_STATUSES = new Set(['Coverslipped', 'Ready for Review', 'QC Failed', 'Cancelled']);
    const nowIso = new Date().toISOString();
    const patchedSpecimens = specimens.map((s: Specimen) =>
      s.id !== specimenId ? s : {
        ...s,
        blocks: (s.blocks ?? []).map((b: HistologyBlock) =>
          b.id === blockId
            ? {
                ...b,
                status: 'Cancelled' as const,
                sharedCassetteId: undefined,
                positionInBlock: undefined,
                cancelReason: reason.trim(),
                cancelledBy: signingUser?.id ?? 'unknown',
                cancelledAt: nowIso,
                stains: b.stains.map(stain =>
                  TERMINAL_STAIN_STATUSES.has(stain.status) ? stain : { ...stain, status: 'Cancelled' as const }
                ),
              }
            : b
        ),
      }
    );
    setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
          showToast('Note: this case had unsaved changes elsewhere — the cancellation was saved, but double-check the rest of the case reflects what you expect.');
        } catch (retryErr) {
          console.error('[Grossing] Failed to save block cancellation after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(`Block ${sp.label}${block.label} cancelled`);
  }, [caseData, signingUser, sendMaterialOrderToLis, markDirty, showToast, knownVersionRef, setCaseData]);

  // Real feature, per direct confirmation: "Create Spare Slide —
  // Generates a new slide ID, links to block, no stain assigned
  // yet." Deliberately NO LIS call — a spare documents a slide that
  // was ALREADY physically cut (a tech, already at the microtome
  // for other reasons, opportunistically cuts an extra unstained
  // section "just in case," per direct confirmation: "They just
  // pickup the unstained slide and stain it"). Nothing new happens
  // in the physical world at creation time, so there is nothing for
  // the LIS to be told yet — that happens at handleOrderRestain
  // below, which is the real trigger.
  const handleCreateSpareSlide = useCallback(async (specimenId: string, blockId: string) => {
    if (!caseData?.id) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    const block = sp?.blocks?.find(b => b.id === blockId);
    if (!sp || !block) return;

    const newSpare: StainOrder = {
      id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stainName: UNSTAINED_LABEL,
      // Real feature, per direct confirmation: the physical cutting
      // already happened — that's the whole point of a spare (a
      // tech, already at the microtome, opportunistically cuts an
      // extra section "just in case"). 'Cut & Placed' is the
      // correct, honest status: cut and on a slide, just not yet
      // stained. Not 'Pending Cut', which would incorrectly say the
      // cutting itself hasn't happened.
      status: 'Cut & Placed',
    };
    const patchedSpecimens = specimens.map((s: Specimen) =>
      s.id !== specimenId ? s : {
        ...s,
        blocks: (s.blocks ?? []).map((b: HistologyBlock) =>
          b.id === blockId ? { ...b, stains: [...b.stains, newSpare] } : b
        ),
      }
    );
    setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to create spare slide:', e);
      return;
    }
    markDirty('Blocks');
    showToast(`Spare slide added to block ${sp.label}${block.label} — unstained, ready if needed`);
  }, [caseData, markDirty, showToast, knownVersionRef, setCaseData, setConcurrencyConflict]);

  // Real feature, per direct confirmation: "Order Restain — Converts
  // spare → staining workflow. Captures reason... Logs who ordered
  // it." "Never delete restains... not be merged with or overwrite
  // the original slide." THIS is the real physical-world trigger —
  // unlike handleCreateSpareSlide above, this sends a real LIS
  // order, since it's the moment the lab is actually told which
  // stain to apply.
  //
  // Real feature, per direct confirmation: "we need a stain order
  // called Unstained which is the only stain that can technically be
  // restained on the same label." Enforced here, in one place,
  // rather than relying on every caller to pass the right mode: the
  // target slide's OWN current stainName decides what happens —
  //   - UNSTAINED_LABEL: a real, physical spare, cut and never
  //     stained — converts in place (same slide id). This is the
  //     efficient path: "saves them from a recut later," per direct
  //     confirmation.
  //   - any real stain name: already went through real staining —
  //     converting it would overwrite completed lab work, which is
  //     exactly what must never happen. A genuinely new StainOrder is
  //     created instead, restainOfSlideId pointing back at the
  //     original — which is never touched.
  const handleOrderRestain = useCallback(async (
    specimenId: string,
    blockId: string,
    params: { targetSlideId: string; stainName: string; reason: string },
  ) => {
    if (!caseData?.id || !params.stainName.trim() || !params.reason.trim()) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    const block = sp?.blocks?.find(b => b.id === blockId);
    const targetSlide = block?.stains.find(st => st.id === params.targetSlideId);
    if (!sp || !block || !targetSlide) return;
    const isConvertingSpare = targetSlide.stainName === UNSTAINED_LABEL;

    showToast('Sending restain order to LIS…');
    const result = await sendMaterialOrderToLis({ kind: 'restain', specimenId, label: `${block.label}: ${params.stainName}` });
    if (!result.ok) {
      showToast('LIS did not acknowledge the restain order — nothing was recorded. Try again.');
      return;
    }

    const nowIso = new Date().toISOString();
    const orderedBy = signingUser?.id ?? 'unknown';
    const patchedSpecimens = specimens.map((s: Specimen) => {
      if (s.id !== specimenId) return s;
      let stains = s.blocks?.find(b => b.id === blockId)?.stains ?? [];

      if (isConvertingSpare) {
        // Convert the existing spare in place — same slide id, real
        // tissue that was already cut, now actually being stained.
        stains = stains.map(stain =>
          stain.id === params.targetSlideId
            ? {
                ...stain,
                stainName: params.stainName.trim(),
                // Real feature, per direct confirmation: the
                // physical slide is already cut and placed — this
                // moves it straight to 'Staining', not back to
                // 'Pending Cut' (which would incorrectly say the
                // cutting hasn't happened yet).
                status: 'Staining' as const,
                restainReason: params.reason.trim(),
                restainOrderedBy: orderedBy,
                restainOrderedAt: nowIso,
              }
            : stain
        );
      } else {
        // The target already has real stain on it — never overwritten.
        // A genuinely new slide, linked back to it, gets ordered instead.
        const newRestain: StainOrder = {
          id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          stainName: params.stainName.trim(),
          status: 'Pending Cut',
          restainReason: params.reason.trim(),
          restainOrderedBy: orderedBy,
          restainOrderedAt: nowIso,
          restainOfSlideId: params.targetSlideId,
        };
        stains = [...stains, newRestain];
      }

      return {
        ...s,
        blocks: (s.blocks ?? []).map((b: HistologyBlock) => b.id === blockId ? { ...b, stains } : b),
      };
    });

    setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
          showToast('Note: this case had unsaved changes elsewhere — the restain order was saved, but double-check the rest of the case reflects what you expect.');
        } catch (retryErr) {
          console.error('[Grossing] Failed to save restain order after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(
      isConvertingSpare
        ? `Restain ordered — reusing the spare, no recut needed`
        : `Restain ordered — new slide cut for ${params.stainName.trim()}`
    );
  }, [caseData, signingUser, sendMaterialOrderToLis, markDirty, showToast, knownVersionRef, setCaseData]);

  // Real replacement for Add Orders' old "Blocks/Recut" tab — appends
  // an actual HistologyBlock to specimen.blocks (what the Material tree
  // reads from), not the old cassette_key/total_cassettes free-text
  // fields on the grossing report, which the tree never read and would
  // have made a new block invisible in the tree that triggered adding it.
  const handleAddBlock = useCallback(async (specimenId: string) => {
    if (!caseData) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    if (!sp) return;

    // Real feature, per direct research: "Barcode Scan Verification...
    // to close the loop." Soft guardrail only — see this hook's own
    // useCassetteScanVerification import and that file's header
    // comment for why this warns rather than blocks. A real,
    // unverified prior cassette doesn't stop a new one from being
    // added; it's flagged so the accessioner knows to go back and
    // scan it.
    if (hasUnverifiedPendingCassette(printSettings?.requireScanVerificationBeforeNextBlock ?? false) && pendingVerification) {
      showToast(`Reminder: Block ${pendingVerification.specimenLabel}${pendingVerification.blockLabel}'s cassette label hasn't been scanned yet.`);
    }

    const existingBlocks = sp.blocks ?? [];
    const nextNumber = existingBlocks.length + 1;
    const blockLabel = String(nextNumber);
    const newBlockId = `blk-${specimenId}-${Date.now().toString(36)}`;
    const fullAccession = caseData.accession?.fullAccession;

    // Real feature, per direct follow-up describing the real
    // grossing-station workflow: "Context & Protocol Resolution...
    // Required cassette media attributes." Real, first production
    // wiring of resolveBlockCassetteColor.ts — same real pattern as
    // handleAddDecant's own resolveDecantCassetteColor call.
    const specimenProtocolId = await resolveProtocolIdForSpecimen(sp.specimenDictionaryEntryId);
    const cassetteColorId = await resolveBlockCassetteColor({ protocolId: specimenProtocolId, priority: caseData.order?.priority });

    // Real feature, per direct follow-up on the Hybrid Request-Driven
    // Workflow spec: "Optimistic / 'Pending' State: When a pathologist
    // adds an IHC or Recut in PathScribe, render it immediately in the
    // Material tree with a clear visual badge." Previously this
    // awaited the (simulated) LIS round-trip BEFORE the block ever
    // appeared at all — pessimistic, and increasingly sluggish-feeling
    // the longer a real LIS's actual latency is. Now appears
    // immediately as 'pending', confirmed or flagged 'rejected' in
    // place once the real request resolves — never silently removed
    // on rejection, per the spec's own "flag the item with a clear
    // alert" instruction.
    const newBlock: HistologyBlock = {
      id: newBlockId,
      label: blockLabel,
      status: 'Grossed',
      // Real feature, per direct confirmation: every new block
      // defaults to a real, pending H&E stain order — the universal,
      // standard first stain for any new tissue block in real
      // practice, not something a PA should have to add manually
      // every single time.
      stains: [{
        id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: 'H&E', status: 'Pending Cut',
        // Real feature, per direct follow-up on unique material
        // identification — see HistologyBlock.displayId's own doc
        // comment for the full reasoning.
        displayId: fullAccession ? slideIdentifier(fullAccession, sp.label, blockLabel, 'L1') : undefined,
      }],
      lisRequestStatus: 'pending',
      displayId: fullAccession ? cassetteIdentifier(fullAccession, sp.label, blockLabel) : undefined,
      cassetteColorId,
    };

    // ── Phase 1: optimistic add, visible immediately as 'pending' ──
    const optimisticSpecimens = specimens.map((s: Specimen) =>
      s.id === specimenId ? { ...s, blocks: [...existingBlocks, newBlock] } : s
    );
    setCaseData({ ...caseData, specimens: optimisticSpecimens, updatedAt: new Date().toISOString() });
    let phase1HadConflict = false;
    try {
      await caseRouter.updateCase(caseData.id, { specimens: optimisticSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        // Same "force through, don't discard" reasoning as every other
        // real write in this file — real, deliberate, established
        // pattern (see the cancel/restain/biopsy-array equivalents),
        // not something to silently drop for this one flow.
        phase1HadConflict = true;
        try {
          await caseRouter.updateCase(caseData.id, { specimens: optimisticSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
        } catch (retryErr) {
          console.error('[Grossing] Failed to save optimistic block add after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(`Block ${sp.label}${nextNumber} requested — awaiting LIS confirmation`);
    if (phase1HadConflict) {
      showToast('Note: this case had unsaved changes elsewhere — your new block request was saved, but double-check the rest of the case reflects what you expect.');
    }

    // ── Phase 2: real request, confirm or flag the SAME block in place ──
    const result = await sendMaterialOrderToLis({ kind: 'block_recut', specimenId, label: newBlock.label });
    const finalStatus: 'confirmed' | 'rejected' = result.ok ? 'confirmed' : 'rejected';

    // Functional update — the pathologist may have made other,
    // unrelated edits while this request was in flight; only this
    // one block's own lisRequestStatus should change here, nothing
    // else about the current state gets clobbered.
    const applyFinalStatus = (specimensToPatch: Specimen[]) => specimensToPatch.map((s: Specimen) =>
      s.id !== specimenId ? s : {
        ...s,
        blocks: (s.blocks ?? []).map(b => b.id === newBlockId ? { ...b, lisRequestStatus: finalStatus } : b),
      }
    );
    setCaseData(prev => prev ? ({ ...prev, specimens: applyFinalStatus(prev.specimens ?? []), updatedAt: new Date().toISOString() } as typeof prev) : prev);
    // Real fix: persist from caseDataRef.current (the genuinely
    // latest specimens at this exact moment), not the Phase-1-era
    // optimisticSpecimens closure — see this hook's own top-level
    // comment on caseDataRef for the real data-loss bug this avoids.
    const freshSpecimensForPersist = applyFinalStatus(caseDataRef.current?.specimens ?? optimisticSpecimens);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: freshSpecimensForPersist }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        // Same reasoning as the block/recut order itself below — the
        // real LIS request has already resolved by this point, so
        // there's no safe "discard and reload" option; force the
        // confirmed/rejected status through rather than losing it.
        // Re-derives from caseDataRef.current again at retry time —
        // the version conflict itself proves something else changed
        // since the read above, so re-reading once more is the only
        // way this retry doesn't reintroduce the exact bug it exists
        // to avoid.
        try {
          const freshAtRetry = applyFinalStatus(caseDataRef.current?.specimens ?? optimisticSpecimens);
          await caseRouter.updateCase(caseData.id, { specimens: freshAtRetry });
          knownVersionRef.current = e.actualVersion + 1;
        } catch (retryErr) {
          console.error('[Grossing] Failed to persist LIS confirmation status after conflict retry:', retryErr);
        }
      } else {
        console.error('[Grossing] Failed to persist LIS confirmation status:', e);
      }
    }

    if (!result.ok) {
      showToast(`LIS rejected the block/recut request for ${sp.label}${nextNumber} — flagged, follow up with histology.`);
      return;
    }
    showToast(`Block ${sp.label}${nextNumber} confirmed by LIS`);

    // Real feature, per direct research: "Single-Click / Triggered
    // Printing: When a Pathologist Assistant grosses Specimen A and
    // generates cassettes A1, A2, and A3, triggering the print action
    // sends jobs sequentially as each cassette/specimen is logged."
    // Fires only for on_demand (the real, researched default) — batch
    // mode defers all printing to an explicit, separate bulk action,
    // not built here. Genuinely fire-and-forget: a real dispatch
    // failure here must never block or roll back a block that's
    // already been successfully created and saved above.
    if (printSettings?.defaultPrintBehavior === 'on_demand') {
      const newCassetteId = cassetteIdentifier(caseData.accession.fullAccession, sp.label, newBlock.label);
      dispatchCassetteLabel({
        fullAccession: caseData.accession.fullAccession,
        specimenLabel: sp.label,
        blockLabel: newBlock.label,
        cassetteId: newCassetteId,
      }).catch(console.error);
      registerPendingVerification({ cassetteId: newCassetteId, blockLabel: newBlock.label, specimenLabel: sp.label });
    }

    // Real fix, item #28: adding a block never navigated the editor to
    // it - setFocusedBlockIndex already exists and is what the block
    // editor modal reads to know which block to show, it just wasn't
    // being called here. Same flatten order allBlocks itself uses
    // (specimen order, then block order within each specimen), so the
    // computed index is guaranteed to match what allBlocks recomputes
    // to once caseData updates above.
    let flatIndex = 0;
    for (const s of optimisticSpecimens) {
      const idx = (s.blocks ?? []).findIndex((b: HistologyBlock) => b.id === newBlock.id);
      if (idx >= 0) { flatIndex += idx; break; }
      flatIndex += (s.blocks ?? []).length;
    }
    setFocusedBlockIndex(flatIndex);
  }, [caseData, sendMaterialOrderToLis, markDirty, showToast, knownVersionRef, setCaseData, printSettings, hasUnverifiedPendingCassette, pendingVerification, registerPendingVerification]);

  // Real feature, per direct follow-up describing the real grossing-
  // station workflow: "Execution Release... Upon confirmation... PA
  // can accept them as-is, adjust the block count... or override the
  // resolved color." This is the real "Release & Print" action for a
  // batch of real, hydrated (cassetteColorId already resolved by
  // hydrateGrossingBlocks.ts), still-'Pending' placeholder blocks —
  // flips each to 'Grossed' and calls the SAME real printCassetteForBlock
  // this hook already exposes for an ordinary, one-at-a-time block
  // (both the engrave stub and, when a station is print-configured,
  // the real printed path) — no second, competing print mechanism.
  //
  // Real, deliberate scope note: these blocks were already created at
  // Accession (generateDefaultMaterial) — this action never sends a
  // new LIS block/recut order, since nothing new is being requested
  // here, only a real, physical release of what the LIS already knows
  // about.
  const handleReleaseGrossingBlocks = useCallback(async (specimenId: string, blockIds: string[]) => {
    if (!caseData?.id || blockIds.length === 0) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    if (!sp) return;
    const blockIdSet = new Set(blockIds);
    const blocksToRelease = (sp.blocks ?? []).filter(b => blockIdSet.has(b.id) && b.status === 'Pending');
    if (blocksToRelease.length === 0) return;

    const updatedSpecimens = specimens.map((s: Specimen) =>
      s.id !== specimenId ? s : {
        ...s,
        blocks: (s.blocks ?? []).map((b: HistologyBlock) => blockIdSet.has(b.id) && b.status === 'Pending' ? { ...b, status: 'Grossed' as const } : b),
      }
    );
    setCaseData({ ...caseData, specimens: updatedSpecimens, updatedAt: new Date().toISOString() });
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
        } catch (retryErr) {
          console.error('[Grossing] Failed to persist block release after conflict retry:', retryErr);
        }
      } else {
        console.error('[Grossing] Failed to persist block release:', e);
      }
    }
    markDirty('Blocks');
    showToast(`Releasing ${blocksToRelease.length} cassette${blocksToRelease.length === 1 ? '' : 's'} for printing…`);

    for (const b of blocksToRelease) {
      printCassetteForBlock(sp.label, b.label);
    }
  }, [caseData, markDirty, showToast, knownVersionRef, setCaseData, printCassetteForBlock]);

  // Real, deliberate sibling to handleReleaseGrossingBlocks — a real
  // 'Pending' placeholder the PA decides isn't actually needed (the
  // gross exam found fewer real pieces than the protocol's own
  // default assumed) is removed outright, never soft-cancelled — it
  // was never physically created, so there's no real, physical
  // cassette to record a cancellation reason against (unlike
  // handleCancelBlock, which is for a real, already-grossed block).
  const handleRemovePendingBlock = useCallback(async (specimenId: string, blockId: string) => {
    if (!caseData?.id) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    const block = sp?.blocks?.find(b => b.id === blockId);
    if (!sp || !block || block.status !== 'Pending') return;

    const updatedSpecimens = specimens.map((s: Specimen) =>
      s.id !== specimenId ? s : { ...s, blocks: (s.blocks ?? []).filter(b => b.id !== blockId) }
    );
    setCaseData({ ...caseData, specimens: updatedSpecimens, updatedAt: new Date().toISOString() });
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
        } catch (retryErr) {
          console.error('[Grossing] Failed to persist placeholder removal after conflict retry:', retryErr);
        }
      } else {
        console.error('[Grossing] Failed to persist placeholder removal:', e);
      }
    }
    markDirty('Blocks');
    showToast(`Removed unreleased block ${sp.label}${block.label}.`);
  }, [caseData, markDirty, showToast, knownVersionRef, setCaseData]);

  // Real feature, per direct follow-up: "Decant has no creation flow
  // at all — the ID scheme is ready for something that doesn't exist
  // yet." Confirmed directly before building: Decant (types/case/
  // Material.ts) has no lisRequestStatus field at all, unlike
  // HistologyBlock — cytology material never goes through the same
  // real LIS order/confirm round-trip a block/recut does, so this is
  // deliberately the simpler, single-phase shape (optimistic add,
  // persist, done) rather than copying handleAddBlock's own two-phase
  // LIS-confirmation flow wholesale for a real workflow this material
  // type doesn't have.
  const handleAddDecant = useCallback(async (specimenId: string, decantType: Decant['decantType']) => {
    if (!caseData) return;
    const specimens = caseData.specimens ?? [];
    const sp = specimens.find((s: Specimen) => s.id === specimenId);
    if (!sp) return;

    const existingDecants = sp.decants ?? [];
    const nextNumber = existingDecants.length + 1;
    const decantLabel = `D${nextNumber}`;
    const newDecantId = `dcnt-${specimenId}-${Date.now().toString(36)}`;
    const fullAccession = caseData.accession?.fullAccession;

    // Real feature, per direct follow-up: "Additional Requirements for
    // Batch Management: cell blocks... Dedicated Hopper Assignment."
    // Real, first production call to evaluateCassetteRouting.ts's own
    // engine — resolves which real, logical color this decant's own
    // cassette should use (Green/Mesh for a cell block, per the
    // seeded routing rule) at the moment it's created, not left
    // unresolved until some later, separate step.
    const cassetteColorId = await resolveDecantCassetteColor(decantType, { priority: caseData.order?.priority });

    const newDecant: Decant = {
      id: newDecantId,
      label: decantLabel,
      decantType,
      stains: [],
      createdAt: new Date().toISOString(),
      createdBy: signingUser?.name,
      // Real feature, per direct follow-up on unique material
      // identification — see Decant.displayId's own doc comment for
      // the full reasoning; identical shape to HistologyBlock's own
      // displayId set in handleAddBlock immediately above.
      displayId: fullAccession ? decantIdentifier(fullAccession, sp.label, decantLabel) : undefined,
      cassetteColorId,
    };

    const updatedSpecimens = specimens.map((s: Specimen) =>
      s.id === specimenId ? { ...s, decants: [...existingDecants, newDecant] } : s
    );
    setCaseData({ ...caseData, specimens: updatedSpecimens, updatedAt: new Date().toISOString() });
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        // Same real "force through, don't discard" posture as
        // handleAddBlock's own identical situation immediately above.
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
          knownVersionRef.current = e.actualVersion + 1;
        } catch (retryErr) {
          console.error('[Grossing] Failed to save decant add after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Decants');
    showToast(`Decant ${sp.label}${decantLabel} added.`);
  }, [caseData, markDirty, showToast, knownVersionRef, setCaseData, signingUser]);

  // Real feature, per direct follow-up: "decant-level linking UI. In
  // the same UI we add specimens, blocks stains, protocols?" Real,
  // genuine gap found while answering that question — handleAddDecant
  // (above) existed and worked, but nothing could ever UPDATE a real
  // decant afterward: no stains, no foreign id, nothing. Mirrors
  // handleUpdateBlock's own exact structure immediately below in this
  // file, simplified — a real Decant has no status/pieceCount
  // lifecycle of its own to guard (see Decant's own type definition,
  // types/case/Material.ts), just its own real stains[] and the same
  // real Foreign ID Bound audit logging.
  const handleUpdateDecant = useCallback(async (specimenId: string, decantId: string, changes: Partial<Decant>) => {
    if (!caseData?.id) return;
    const currentSpecimens = caseDataRef.current?.specimens ?? caseData.specimens ?? [];

    // Same real, merged pre/post-state check as handleUpdateBlock's
    // own identical fix — see that comment for the full reasoning on
    // why a naive "both fields present in one changes object" check
    // isn't enough on its own.
    if (changes.externalId !== undefined || changes.externalIdSource !== undefined) {
      const sp = currentSpecimens.find((s: Specimen) => s.id === specimenId);
      const decant = sp?.decants?.find((d: Decant) => d.id === decantId);
      if (decant) {
        const mergedExternalId = changes.externalId !== undefined ? changes.externalId : decant.externalId;
        const mergedExternalIdSource = changes.externalIdSource !== undefined ? changes.externalIdSource : decant.externalIdSource;
        const wasComplete = !!decant.externalId && !!decant.externalIdSource;
        const isNowComplete = !!mergedExternalId && !!mergedExternalIdSource;
        if (isNowComplete && (!wasComplete || mergedExternalId !== decant.externalId)) {
          mockAuditService.logEvent({
            type: 'system',
            event: 'Foreign ID Bound',
            detail: `Decant ${sp?.label ?? ''}${decant.label} bound to foreign id "${mergedExternalId}" (source: ${mergedExternalIdSource}).`,
            user: signingUser?.id ?? 'unknown',
            caseId: caseData.id,
            confidence: null,
          }).catch(err => console.error('[Grossing] Failed to log Foreign ID Bound audit entry:', err));
        }
      }
    }

    const patchedSpecimens = currentSpecimens.map((sp: Specimen) => ({
      ...sp,
      decants: (sp.decants ?? []).map((d: Decant) => d.id === decantId ? { ...d, ...changes } : d),
    }));
    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);
      markDirty('Decant edit');
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to update decant:', e);
    }
  }, [caseData, markDirty, knownVersionRef, setCaseData, setConcurrencyConflict, signingUser]);

  // Real feature, per direct confirmation: "I wanted to be able to
  // assign each core to a specific section of a single block... so
  // the Pathologist can always identify what section of the block
  // the core tissue was embedded into." A grossing activity — the PA
  // decides, while grossing, that several specimens' tissue is going
  // into one shared cassette rather than separate ones.
  //
  // Each specimen still gets its OWN HistologyBlock record (same
  // shape handleAddBlock above already creates) — this creates one
  // per selected specimen, all sharing the same new
  // sharedCassetteId, each with its own sequential positionInBlock.
  // Slides/stains keep working exactly as they already do, per
  // specimen — this only adds the shared-block linkage on top.
  // Real, architectural fix, per direct follow-up: "pulling shared
  // blocks out of individual Specimen.blocks arrays into a top-level
  // Case.matrixBlocks[] converts the matrix block into a first-class,
  // single-identity asset across the entire LIS pipeline rather than
  // maintaining fragmented, competing state records on each child
  // specimen." Builds exactly ONE real MatrixBlock (types/case/
  // MatrixBlock.ts) — not one HistologyBlock per participating
  // specimen tagged with a shared string, the prior design this
  // replaces. Each participating specimen gets a lightweight
  // matrixBlockIds reference, never its own competing copy of the
  // block's own real status/location.
  const handleCreateBiopsyArray = useCallback(async (specimenIds: string[], cassetteLabel: string) => {
    if (!caseData || specimenIds.length < 2) return;
    const specimens = caseData.specimens ?? [];
    const targetSpecimens = specimenIds
      .map(id => specimens.find((s: Specimen) => s.id === id))
      .filter((s): s is Specimen => !!s);
    if (targetSpecimens.length < 2) return;

    const fullAccession = caseData.accession?.fullAccession;
    const label = cassetteLabel.trim();
    const matrixBlockId = `mtx-${caseData.id}-${Date.now().toString(36)}`;

    const newMatrixBlock: MatrixBlock = {
      id: matrixBlockId,
      label,
      status: 'Grossed',
      participants: targetSpecimens.map((sp, i) => ({ specimenId: sp.id, positionInBlock: i + 1 })),
      // Real feature, per direct confirmation: same H&E default as
      // handleAddBlock's own ordinary blocks — every new matrix
      // block gets a real, pending H&E stain order, not an empty
      // one. Reuses StainOrder directly — see MatrixBlock.slides's
      // own doc comment for the full reasoning.
      slides: [{
        id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: 'H&E', status: 'Pending Cut',
        displayId: fullAccession ? `${matrixBlockIdentifier(fullAccession, label)}-L1` : undefined,
      }],
      createdAt: new Date().toISOString(),
      createdBy: signingUser?.id ?? 'unknown',
    };

    showToast('Sending Biopsy Array request to LIS…');
    // Same real-LIS-order posture as handleAddBlock — one order per
    // specimen, all referencing the same cassetteLabel so the LIS
    // side can see they're physically the same block.
    const results = await Promise.all(targetSpecimens.map(sp =>
      sendMaterialOrderToLis({ kind: 'block_recut', specimenId: sp.id, label: cassetteLabel })
    ));
    if (results.some(r => !r.ok)) {
      showToast('LIS did not acknowledge the Biopsy Array request — nothing was recorded. Try again.');
      return;
    }

    const updatedSpecimens = specimens.map((s: Specimen) =>
      specimenIds.includes(s.id) ? { ...s, matrixBlockIds: [...(s.matrixBlockIds ?? []), matrixBlockId] } : s
    );
    const updatedMatrixBlocks = [...(caseData.matrixBlocks ?? []), newMatrixBlock];
    const updated = { ...caseData, specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks, updatedAt: new Date().toISOString() };
    setCaseData(updated);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        // Same reasoning as handleAddBlock's own conflict handling —
        // the LIS orders were already sent and acknowledged above,
        // before this write; there's no safe "discard" option.
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks });
          knownVersionRef.current = e.actualVersion + 1;
          showToast('Note: this case had unsaved changes elsewhere — your Biopsy Array was saved, but double-check the rest of the case reflects what you expect.');
        } catch (retryErr) {
          console.error('[Grossing] Failed to save Biopsy Array after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(`Biopsy Array ${cassetteLabel} created — ${targetSpecimens.length} specimens linked, sent to LIS`);

    // Real feature, per direct follow-up: "primary label printing for
    // matrix blocks." Same real, on-demand-only gating as
    // handleAddBlock's own identical ordinary-block dispatch just
    // above in this file — fires only when the lab's real, configured
    // default is on_demand; batch mode defers all printing to the
    // separate, explicit bulk action (handleBatchPrintCassettes).
    // Genuinely fire-and-forget: a real dispatch failure here must
    // never block or roll back a matrix block that's already been
    // successfully created and saved above.
    if (printSettings?.defaultPrintBehavior === 'on_demand') {
      const matrixCassetteId = matrixBlockIdentifier(fullAccession ?? caseData.id, label);
      dispatchMatrixCassetteLabel({
        fullAccession: fullAccession ?? caseData.id,
        specimenLabels: targetSpecimens.map(sp => sp.label),
        matrixBlockLabel: label,
        cassetteId: matrixCassetteId,
      }).catch(console.error);
      // Same real scan-verification loop as an ordinary block's own
      // dispatch — PendingCassetteVerification is keyed purely on
      // cassetteId, so it works unchanged here; specimenLabel left
      // empty since a matrix block has no single one, so the real
      // reminder toast reads as "Block C1's cassette..." rather than
      // a confusing concatenation of every participant's own label.
      registerPendingVerification({ cassetteId: matrixCassetteId, blockLabel: label, specimenLabel: '' });
    }
  }, [caseData, sendMaterialOrderToLis, markDirty, showToast, knownVersionRef, setCaseData, signingUser, printSettings, registerPendingVerification]);

  // Real feature, per direct confirmation: completes the Biopsy Array
  // feature with the edit capability flagged as the one real gap
  // after create-only shipped — "allowing edits of the Biopsy array."
  // Given the FULL desired specimen list (in the order positions
  // should be), diffs it against whichever blocks currently carry
  // this cassetteId across every specimen:
  //   - specimens no longer selected → unlinked (sharedCassetteId/
  //     positionInBlock cleared). The block record itself is kept,
  //     not deleted — nothing about the physical tissue changed, it's
  //     just no longer tracked as part of this shared cassette. It
  //     becomes an ordinary, standalone block, same as any block that
  //     was never part of an array.
  //   - specimens newly selected → get a real new block, same shape
  //     handleCreateBiopsyArray already creates, with a real LIS
  //     order (this is new physical tissue actually going into this
  //     cassette, same posture as create).
  //   - specimens still selected → keep their existing block, just
  //     renumbered to the new position if the order changed.
  // Fewer than 2 specimens in the new selection dissolves the whole
  // array (see handleDissolveBiopsyArray) — an array of 0 or 1 isn't
  // a real array.
  // Real feature, per direct confirmation: completes the Biopsy Array
  // feature with the edit capability flagged as the one real gap
  // after create-only shipped — "allowing edits of the Biopsy array."
  // Real, architectural fix, per direct follow-up: operates on the
  // one, real MatrixBlock record (Case.matrixBlocks[]) directly —
  // matrixBlockId (not a human-typed label) is now the real, stable
  // key. Given the FULL desired specimen list (in the order positions
  // should be), diffs it against the real block's own participants[]:
  //   - specimens no longer selected → their matrixBlockIds reference
  //     removed, AND a real, new, ordinary HistologyBlock created for
  //     them — nothing about the physical tissue changed, it's just
  //     no longer tracked as part of this shared cassette; the
  //     specimen still needs a real block of its own going forward.
  //   - specimens newly selected → get a real matrixBlockIds
  //     reference added, with a real LIS order (this is new physical
  //     tissue actually going into this cassette, same posture as
  //     create).
  //   - specimens still selected → participants[] renumbered to the
  //     new position if the order changed.
  // Fewer than 2 specimens in the new selection dissolves the whole
  // array (see handleDissolveBiopsyArray) — an array of 0 or 1 isn't
  // a real array.
  const handleUpdateBiopsyArray = useCallback(async (matrixBlockId: string, specimenIds: string[]) => {
    if (!caseData) return;
    if (specimenIds.length < 2) {
      await handleDissolveBiopsyArrayRef.current?.(matrixBlockId);
      return;
    }
    const specimens = caseData.specimens ?? [];
    const matrixBlocks = caseData.matrixBlocks ?? [];
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) return;

    const currentlyLinkedIds = matrixBlock.participants.map(p => p.specimenId);
    const toAdd = specimenIds.filter(id => !currentlyLinkedIds.includes(id));
    const toRemove = currentlyLinkedIds.filter(id => !specimenIds.includes(id));

    if (toAdd.length > 0) {
      showToast('Sending Biopsy Array update to LIS…');
      const targetSpecimens = toAdd.map(id => specimens.find(s => s.id === id)).filter((s): s is Specimen => !!s);
      const results = await Promise.all(targetSpecimens.map(sp =>
        sendMaterialOrderToLis({ kind: 'block_recut', specimenId: sp.id, label: matrixBlock.label })
      ));
      if (results.some(r => !r.ok)) {
        showToast('LIS did not acknowledge the added specimens — nothing was recorded. Try again.');
        return;
      }
    }

    const fullAccession = caseData.accession?.fullAccession;
    // Real, honest posture matching the prior toRemove path: "nothing
    // about the physical tissue changed, it's just no longer tracked
    // as part of this shared cassette." A removed specimen needs a
    // real, new, ordinary HistologyBlock of its own to represent that
    // same, real tissue going forward — same shape handleAddBlock
    // already creates, inheriting the matrix block's own current
    // status rather than starting back at 'Grossed'.
    const removedSpecimenNewBlocks = new Map<string, HistologyBlock>();
    toRemove.forEach(id => {
      const sp = specimens.find(s => s.id === id);
      if (!sp) return;
      const existingBlocks = sp.blocks ?? [];
      const blockLabel = String(existingBlocks.length + 1);
      removedSpecimenNewBlocks.set(id, {
        id: `blk-${id}-${Date.now().toString(36)}`,
        label: blockLabel,
        status: matrixBlock.status,
        stains: [{
          id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: 'H&E', status: 'Pending Cut',
          displayId: fullAccession ? slideIdentifier(fullAccession, sp.label, blockLabel, 'L1') : undefined,
        }],
        displayId: fullAccession ? cassetteIdentifier(fullAccession, sp.label, blockLabel) : undefined,
      });
    });

    const updatedSpecimens = specimens.map((s: Specimen) => {
      if (toRemove.includes(s.id)) {
        const newBlock = removedSpecimenNewBlocks.get(s.id);
        return {
          ...s,
          matrixBlockIds: (s.matrixBlockIds ?? []).filter(id => id !== matrixBlockId),
          blocks: newBlock ? [...(s.blocks ?? []), newBlock] : s.blocks,
        };
      }
      if (toAdd.includes(s.id)) {
        return { ...s, matrixBlockIds: [...(s.matrixBlockIds ?? []), matrixBlockId] };
      }
      return s;
    });

    // Real, explicit renumbering — participants[] is rebuilt fresh
    // from the new, full specimenIds order, preserving each real
    // participant's own tissueType where one was already recorded.
    const updatedParticipants = specimenIds.map((id, i) => ({
      specimenId: id,
      positionInBlock: i + 1,
      tissueType: matrixBlock.participants.find(p => p.specimenId === id)?.tissueType,
    }));
    const updatedMatrixBlocks = matrixBlocks.map(m => m.id === matrixBlockId ? { ...m, participants: updatedParticipants } : m);

    const updated = { ...caseData, specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks, updatedAt: new Date().toISOString() };
    setCaseData(updated);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks });
          knownVersionRef.current = e.actualVersion + 1;
          showToast('Note: this case had unsaved changes elsewhere — your Biopsy Array update was saved, but double-check the rest of the case reflects what you expect.');
        } catch (retryErr) {
          console.error('[Grossing] Failed to save Biopsy Array update after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(`Biopsy Array ${matrixBlock.label} updated — ${specimenIds.length} specimens linked`);
  }, [caseData, sendMaterialOrderToLis, markDirty, showToast, knownVersionRef, setCaseData]);

  // Real feature: a direct, explicit "undo the whole array" action —
  // clearer than editing a selection down to zero. Every specimen
  // currently carrying this cassetteId gets unlinked; each block
  // record itself is kept as an ordinary, standalone block, same
  // "nothing physical changed, just the tracking" posture as removing
  // one specimen in handleUpdateBiopsyArray above.
  // Real feature: a direct, explicit "undo the whole array" action —
  // clearer than editing a selection down to zero. Real, architectural
  // fix, per direct follow-up: every real participant gets a real,
  // new, ordinary HistologyBlock of its own (same "nothing physical
  // changed, just the tracking" posture as handleUpdateBiopsyArray's
  // own toRemove path) and the real MatrixBlock record itself is
  // removed from Case.matrixBlocks — there's no more tagged block
  // record to simply unlink, since the shared cassette was never a
  // per-specimen record to begin with.
  const handleDissolveBiopsyArray = useCallback(async (matrixBlockId: string) => {
    if (!caseData) return;
    const specimens = caseData.specimens ?? [];
    const matrixBlocks = caseData.matrixBlocks ?? [];
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) return;

    const fullAccession = caseData.accession?.fullAccession;
    const participantIds = new Set(matrixBlock.participants.map(p => p.specimenId));
    const newBlocksBySpecimenId = new Map<string, HistologyBlock>();
    matrixBlock.participants.forEach(participant => {
      const sp = specimens.find(s => s.id === participant.specimenId);
      if (!sp) return;
      const existingBlocks = sp.blocks ?? [];
      const blockLabel = String(existingBlocks.length + 1);
      newBlocksBySpecimenId.set(sp.id, {
        id: `blk-${sp.id}-${Date.now().toString(36)}`,
        label: blockLabel,
        status: matrixBlock.status,
        stains: [{
          id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: 'H&E', status: 'Pending Cut',
          displayId: fullAccession ? slideIdentifier(fullAccession, sp.label, blockLabel, 'L1') : undefined,
        }],
        displayId: fullAccession ? cassetteIdentifier(fullAccession, sp.label, blockLabel) : undefined,
      });
    });

    const updatedSpecimens = specimens.map((s: Specimen) => {
      if (!participantIds.has(s.id)) return s;
      const newBlock = newBlocksBySpecimenId.get(s.id);
      return {
        ...s,
        matrixBlockIds: (s.matrixBlockIds ?? []).filter(id => id !== matrixBlockId),
        blocks: newBlock ? [...(s.blocks ?? []), newBlock] : s.blocks,
      };
    });
    const updatedMatrixBlocks = matrixBlocks.filter(m => m.id !== matrixBlockId);
    const updated = { ...caseData, specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks, updatedAt: new Date().toISOString() };
    setCaseData(updated);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens, matrixBlocks: updatedMatrixBlocks });
          knownVersionRef.current = e.actualVersion + 1;
          showToast('Note: this case had unsaved changes elsewhere — the Biopsy Array was dissolved, but double-check the rest of the case reflects what you expect.');
        } catch (retryErr) {
          console.error('[Grossing] Failed to save Biopsy Array dissolve after conflict retry:', retryErr);
        }
      } else {
        console.error(e);
      }
    }
    markDirty('Blocks');
    showToast(`Biopsy Array ${matrixBlock.label} dissolved — specimens are now separate blocks again`);
  }, [caseData, markDirty, showToast, knownVersionRef, setCaseData]);

  // Real, architectural fix, per direct follow-up: "the matrix block
  // itself is the tracked asset." The direct write-path for a real
  // MatrixBlock's own physical properties (status, piece tracking,
  // location) — the single-record analog of handleUpdateBlock above.
  // No sibling-propagation confirmation needed here at all (unlike
  // handleUpdateBlock's own real, live sibling-confirm logic for the
  // legacy sharedCassetteId model) — there's only ever one real
  // record to update, so drift between copies is structurally
  // impossible rather than something to detect and confirm around.
  const handleUpdateMatrixBlock = useCallback(async (matrixBlockId: string, changes: Partial<MatrixBlock>) => {
    if (!caseData?.id) return;
    const currentMatrixBlocks = caseDataRef.current?.matrixBlocks ?? caseData.matrixBlocks ?? [];

    // Real feature, per direct follow-up: "Audit Trail Tracking: Log
    // the exact moment the foreign 2D barcode was scanned and bound
    // to the internal CaseID." Same real, merged pre/post-state check
    // as handleUpdateBlock's own identical fix — see that comment for
    // the full reasoning on why a naive "both fields present in one
    // changes object" check would never fire.
    if (changes.externalId !== undefined || changes.externalIdSource !== undefined) {
      const matrixBlock = currentMatrixBlocks.find(m => m.id === matrixBlockId);
      if (matrixBlock) {
        const mergedExternalId = changes.externalId !== undefined ? changes.externalId : matrixBlock.externalId;
        const mergedExternalIdSource = changes.externalIdSource !== undefined ? changes.externalIdSource : matrixBlock.externalIdSource;
        const wasComplete = !!matrixBlock.externalId && !!matrixBlock.externalIdSource;
        const isNowComplete = !!mergedExternalId && !!mergedExternalIdSource;
        if (isNowComplete && (!wasComplete || mergedExternalId !== matrixBlock.externalId)) {
          mockAuditService.logEvent({
            type: 'system',
            event: 'Foreign ID Bound',
            detail: `Matrix Block ${matrixBlock.label} bound to foreign id "${mergedExternalId}" (source: ${mergedExternalIdSource}).`,
            user: signingUser?.id ?? 'unknown',
            caseId: caseData.id,
            confidence: null,
          }).catch(err => console.error('[Grossing] Failed to log Foreign ID Bound audit entry:', err));
        }
      }
    }

    const patchedMatrixBlocks = currentMatrixBlocks.map(m => m.id === matrixBlockId ? { ...m, ...changes } : m);
    try {
      await caseRouter.updateCase(caseData.id, { matrixBlocks: patchedMatrixBlocks }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, matrixBlocks: patchedMatrixBlocks } as typeof prev) : prev);
      markDirty('Matrix block edit');
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[Grossing] Failed to update matrix block:', e);
    }
  }, [caseData, markDirty, knownVersionRef, setCaseData, setConcurrencyConflict, signingUser]);

  // Real fix: handleUpdateBiopsyArray needs to call
  // handleDissolveBiopsyArray when the edited selection drops below 2
  // specimens, but both are useCallback-memoized in the same hook —
  // a direct reference would create a circular dependency between the
  // two useCallback declarations. A ref side-steps that cleanly:
  // always points at the latest handleDissolveBiopsyArray without
  // handleUpdateBiopsyArray needing it in its own dependency array.
  const handleDissolveBiopsyArrayRef = useRef(handleDissolveBiopsyArray);
  handleDissolveBiopsyArrayRef.current = handleDissolveBiopsyArray;

  return {
    allBlocks,
    allDecants,
    focusedBlockIndex, setFocusedBlockIndex,
    handlePrintCurrentCassette,
    printCassetteForBlock,
    printMatrixCassette,
    handleBatchPrintCassettes,
    printSlideForStain,
    handleBatchPrintSlides,
    batchPrintBlocked,
    focusedBlockEntry,
    handleAdvanceFocusedBlockStatus,
    handleConfirmTriage,
    handleUpdateBlock,
    handleCancelBlock,
    handleCreateSpareSlide,
    handleOrderRestain,
    handleAddBlock,
    handleReleaseGrossingBlocks,
    handleRemovePendingBlock,
    handleAddDecant,
    handleUpdateDecant,
    // Real feature, per direct research on scan-verification guardrails
    // — real, inspectable state, so a future UI indicator (e.g. a real
    // "unscanned cassette" badge) can be built against this directly.
    pendingCassetteVerification: pendingVerification,
    handleCreateBiopsyArray,
    handleUpdateBiopsyArray,
    handleDissolveBiopsyArray,
    handleUpdateMatrixBlock,
  };
}
