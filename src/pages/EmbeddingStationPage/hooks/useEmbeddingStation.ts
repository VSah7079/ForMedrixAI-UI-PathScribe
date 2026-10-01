// src/pages/EmbeddingStationPage/hooks/useEmbeddingStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285 (Embedding Station) — the ticket's own "sibling,
// bench-focused workstation" to PS-284's Microtomy Workstation. Same
// real optimistic-update + real persistence shape as
// useMicrotomyWorkstation.ts (wraps embeddingOperations.ts's pure
// functions), plus the exact same real cassette-print dispatch chain
// (station -> printer profile -> gtin/layout from printSettingsService
// -> printCassetteLabel) already proven there and, before that, in
// useSpecimenBlockManagement.ts's own attemptPrintedLabel.
//
// Real, deliberate scope cut, matching PS-284's own stated precedent:
// this resolves a scanned/selected ordinary HistologyBlock only — a
// shared MatrixBlock (cassette spanning multiple specimens) is not yet
// supported here. Kept consistent with PS-284's identical cut rather
// than solved once, ad hoc, in whichever ticket happens to touch it
// first.
//
// Real, deliberate reuse note on the discrepancy deficiency: this
// raises the real, existing def-tissue-discrepancy deficiency through
// specimenDeficiencyService — the exact same real mechanism
// useSpecimenBlockManagement.ts's own handleUpdateBlock already uses
// for a piece-count mismatch — never a second, parallel QA channel.
// The spec's own "Audit Triggers: ...routes an alert to the
// histotechnology supervisor" is implemented as that same real,
// existing deficiency landing in the real, existing QA working queue
// (QualityAssurancePage.tsx) supervisors already monitor — not a new,
// separate paging/notification channel this pass doesn't build.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { printerProfileService, printSettingsService, specimenDeficiencyService, specimenDictionaryService } from '@/services';
import { printCassetteLabel } from '@/utils/labels/printCassetteSlideLabel';
import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
// Real, deliberate reuse: setBlockAlertFlags is a genuinely generic
// HistologyBlock operation (Tiny Tissue/Fragile/Decal Required),
// already built for PS-284 — reused here verbatim rather than a
// second, duplicate toggle function in embeddingOperations.ts. See
// that function's own doc comment in microtomyOperations.ts.
import { setBlockAlertFlags } from '@/utils/microtomyOperations';
import { DEFAULT_CASSETTE_LABEL_LAYOUT } from '@/services/printSettings/IPrintSettingsService';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock, EmbeddingMoldSize, EmbeddingDiscrepancyReason, CassetteReprintReason } from '@/types/case/Specimen';
import {
  confirmPieceCount, flagEmbeddingDiscrepancy, setMoldAndOrientation, groupSplitBlocks,
  resolveSplitBlockGroupStatus, recordCassetteReprint, addEmbeddingBlockComment, resolveEmbeddingAlertBadges,
} from '@/utils/embeddingOperations';

export interface EmbeddingWorkItem {
  caseData: Case;
  specimen: Specimen;
  block: HistologyBlock;
}

export function useEmbeddingStation() {
  const { user } = useAuth();
  const { effectiveStationId } = useEffectiveScanStation();

  const [workItem, setWorkItem] = useState<EmbeddingWorkItem | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [dictionaryType, setDictionaryType] = useState<{ type?: string; procedure?: string }>({});
  const versionRef = useRef(0);

  const actor = { id: user?.id ?? 'unknown', name: user?.name ?? user?.id ?? 'unknown' };

  /** Real, per "Biopsy/Needle Core" alert badges — resolveEmbeddingAlertBadges
   *  needs the linked specimen dictionary entry's real type/procedure,
   *  never a second, stored, driftable copy of it (see that function's
   *  own doc comment). Looked up once per work item, not on every render. */
  const loadDictionaryType = useCallback(async (specimenDictionaryEntryId?: string) => {
    if (!specimenDictionaryEntryId) { setDictionaryType({}); return; }
    const res = await specimenDictionaryService.getAll();
    if (!res.ok) { setDictionaryType({}); return; }
    const entry = res.data.find(e => e.id === specimenDictionaryEntryId);
    setDictionaryType(entry ? { type: entry.type, procedure: entry.procedure } : {});
  }, []);

  /** Real, per the spec's own "Scan-to-Open: scanning a cassette
   *  barcode auto-opens the corresponding embedding record and locks
   *  the workspace to that block." See this file's own header for the
   *  real, deliberate MatrixBlock scope cut. */
  const resolveScan = useCallback(async (rawScanValue: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    setScanError(null);
    if (!rawScanValue.trim()) return { ok: false, message: 'Empty scan.' };
    const resolved = await resolveMaterialFromScan(rawScanValue);
    if (!resolved) {
      const message = 'That scan didn’t resolve to a real case or block — check the barcode and try again.';
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
    if (target.level !== 'block' && target.level !== 'slide') {
      const message = 'This scan target (a matrix/cell-block cassette, a decant, or a bare specimen scan) isn’t supported at the Embedding Station yet — scan a specific block/cassette barcode.';
      setScanError(message);
      return { ok: false, message };
    }
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) {
      const message = `Block ${specimen.label}${target.blockNumber} not found.`;
      setScanError(message);
      return { ok: false, message };
    }
    versionRef.current = (caseData as unknown as { version?: number }).version ?? 0;
    setWorkItem({ caseData, specimen, block });
    void loadDictionaryType(specimen.specimenDictionaryEntryId);
    return { ok: true };
  }, [loadDictionaryType]);

  const clearWorkItem = useCallback(() => {
    setWorkItem(null);
    setScanError(null);
    setDictionaryType({});
  }, []);

  const persist = useCallback(async (caseData: Case, updatedSpecimen: Specimen): Promise<Specimen> => {
    const updatedSpecimens = (caseData.specimens ?? []).map(sp => sp.id === updatedSpecimen.id ? updatedSpecimen : sp);
    const updatedCaseData = { ...caseData, specimens: updatedSpecimens };
    setWorkItem(prev => {
      if (!prev) return prev;
      const block = updatedSpecimen.blocks?.find(b => b.id === prev.block.id);
      return block ? { caseData: updatedCaseData, specimen: updatedSpecimen, block } : prev;
    });
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, versionRef.current);
      versionRef.current += 1;
    } catch (e) {
      // Real, honest simplification, same posture as
      // useMicrotomyWorkstation.ts's own persist — this bench page is
      // scoped to one physical block at a time; a genuine write
      // collision is logged, not silently hidden, but doesn't block
      // the tech's own next action.
      console.error('[EmbeddingStation] Failed to persist:', e);
    }
    return updatedSpecimen;
  }, []);

  /** Real, per the spec's own "Piece Count Verification: requires
   *  single-touch confirmation... before sealing the block." On a
   *  genuine mismatch, raises the real, existing def-tissue-discrepancy
   *  deficiency — the identical real mechanism/wording
   *  useSpecimenBlockManagement.ts's own handleUpdateBlock already
   *  uses, so the two real embedding-confirmation entry points (this
   *  bench page, and the pathologist-facing BlockStainEditorModal.tsx)
   *  raise the exact same real QA record, never two different shapes
   *  for the same real event. */
  const handleConfirmPieceCount = useCallback(async (observedCount: number) => {
    if (!workItem) return;
    const expected = workItem.block.pieceCount;
    const result = confirmPieceCount(workItem.specimen, workItem.block.id, observedCount);
    if (!result.ok) return;
    await persist(workItem.caseData, result.specimen);
    if (typeof expected === 'number' && expected !== observedCount) {
      specimenDeficiencyService.raise({
        caseId: workItem.caseData.id,
        specimenId: workItem.specimen.id,
        specimenLabel: workItem.specimen.label,
        deficiencyTypeId: 'def-tissue-discrepancy',
        comment: `Block ${workItem.specimen.label}${workItem.block.label}: ${expected} piece${expected === 1 ? '' : 's'} recorded at grossing, ${observedCount} observed at embedding.`,
        raisedBy: actor.id,
      }).catch(err => console.error('[EmbeddingStation] Failed to raise Tissue Discrepancy deficiency:', err));
    }
  }, [workItem, persist, actor.id]);

  /** Real, per the spec's own "Discrepancy Reporting: one-touch buttons
   *  ... Audit Triggers: a flagged discrepancy halts the block
   *  workflow and routes an alert." Records the real sub-reason on the
   *  block AND raises the same real deficiency as above — this is the
   *  one-touch path, distinct from a genuine piece-count number
   *  mismatch, for when the tech already knows exactly what's wrong
   *  (an unopened cassette, a broken hinge) without needing to type a
   *  count at all. */
  const handleFlagDiscrepancy = useCallback(async (reason: EmbeddingDiscrepancyReason) => {
    if (!workItem) return;
    const result = flagEmbeddingDiscrepancy(workItem.specimen, workItem.block.id, reason, actor.id);
    if (!result.ok) return;
    await persist(workItem.caseData, result.specimen);
    specimenDeficiencyService.raise({
      caseId: workItem.caseData.id,
      specimenId: workItem.specimen.id,
      specimenLabel: workItem.specimen.label,
      deficiencyTypeId: 'def-tissue-discrepancy',
      comment: `Block ${workItem.specimen.label}${workItem.block.label}: flagged at embedding — ${reason}.`,
      raisedBy: actor.id,
    }).catch(err => console.error('[EmbeddingStation] Failed to raise Tissue Discrepancy deficiency:', err));
  }, [workItem, persist, actor.id]);

  const handleSetMoldAndOrientation = useCallback(async (changes: { moldSize?: EmbeddingMoldSize; orientationInstructions?: string }) => {
    if (!workItem) return;
    const result = setMoldAndOrientation(workItem.specimen, workItem.block.id, changes);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  /** Real, per the spec's own "High-Contrast Visual Alerts: Tiny/
   *  Fragile, Decal Required" toggle badges — reuses the identical
   *  real setBlockAlertFlags PS-284 already built (see this file's
   *  own import comment) rather than a second, parallel toggle. */
  const handleSetAlertFlags = useCallback(async (flags: { tinyTissue?: boolean; fragile?: boolean; requiresDecal?: boolean }) => {
    if (!workItem) return;
    const result = setBlockAlertFlags(workItem.specimen, workItem.block.id, flags);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  /** Real, per the spec's own "Multi-Cassette / Split-Block Tracking...
   *  to ensure all related cassettes are embedded together." Groups
   *  the current work item's block with one or more sibling block ids
   *  already on this specimen (a tech picks the related cassette(s)
   *  from this specimen's own block list) — never creates a new block,
   *  see groupSplitBlocks's own doc comment. */
  const handleGroupSplitBlocks = useCallback(async (siblingBlockIds: string[]) => {
    if (!workItem) return;
    const result = groupSplitBlocks(workItem.specimen, [workItem.block.id, ...siblingBlockIds]);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist]);

  const splitBlockGroupStatus = workItem ? resolveSplitBlockGroupStatus(workItem.specimen, workItem.block.id) : null;

  const handleAddComment = useCallback(async (text: string) => {
    if (!workItem) return;
    const result = addEmbeddingBlockComment(workItem.specimen, workItem.block.id, text, actor.id, actor.name);
    if (result.ok) await persist(workItem.caseData, result.specimen);
  }, [workItem, persist, actor]);

  /** Real, per the spec's own Right Panel: resolves the actual,
   *  configured printer/gtin/layout for the CURRENT station — the
   *  identical real chain useMicrotomyWorkstation.ts's own
   *  getPrinterContext already proved for slides, reused here for
   *  cassettes (same real cassetteSlidePrinterProfileId station
   *  field covers both — see ScanStation's own doc comment). */
  const getPrinterContext = useCallback(async (): Promise<{ printer: PrinterProfile; gtin: string; layout: CassetteLabelLayoutConfig } | { error: string }> => {
    if (!effectiveStationId) return { error: 'No scan station selected for this device — set one from the NavBar station indicator.' };
    const stationRes = await mockScanStationService.getById(effectiveStationId);
    if (!stationRes.ok) return { error: 'Scan station not found.' };
    if (!stationRes.data.supportsPrinting || !stationRes.data.cassetteSlidePrinterProfileId) {
      return { error: 'This station isn’t configured for real cassette-label printing — check Scan Stations config.' };
    }
    const printerRes = await printerProfileService.getById(stationRes.data.cassetteSlidePrinterProfileId);
    if (!printerRes.ok || !printerRes.data) return { error: 'The configured printer profile no longer exists — check Scan Stations config.' };
    const settingsRes = await printSettingsService.get();
    const gtin = settingsRes.ok ? settingsRes.data.gs1Gtin : '';
    const layout = settingsRes.ok ? settingsRes.data.cassetteLabelLayout : DEFAULT_CASSETTE_LABEL_LAYOUT;
    return { printer: printerRes.data, gtin, layout };
  }, [effectiveStationId]);

  /** Real, per the spec's own "On-Demand Reprint/Re-labeling for a
   *  damaged or wax-obscured cassette label... Reason Log: mandatory
   *  reason prompt for any reprint." Records the required reason first
   *  (embeddingOperations.recordCassetteReprint — real, audited,
   *  cumulative count), then dispatches the actual real print through
   *  the identical GS1/ZPL path this app's own cassette printing
   *  already uses everywhere else. */
  const handleReprintCassette = useCallback(async (reason: CassetteReprintReason) => {
    if (!workItem) return { ok: false, message: 'No block selected.' };
    // Real, per this codebase's own established gotcha (see
    // services/reports/README.md / microtomyOperations.ts's own
    // markStainPrintResult): strictNullChecks: false means a
    // discriminated union doesn't reliably narrow on `if (!x.ok)`
    // either — handled explicitly with `if (recorded.ok) {...}` instead.
    const recorded = recordCassetteReprint(workItem.specimen, workItem.block.id, reason, actor.id);
    if (!recorded.ok) {
      const failureMessage: string = (recorded as { ok: false; error: string }).error;
      return { ok: false, message: failureMessage };
    }
    const specimen = await persist(workItem.caseData, recorded.specimen);
    const block = specimen.blocks?.find(b => b.id === workItem.block.id);
    if (!block) return { ok: false, message: 'Block not found after persisting reprint reason.' };

    const ctx = await getPrinterContext();
    if ('error' in ctx) return { ok: false, message: ctx.error };
    const fullAccession = workItem.caseData.accession?.fullAccession ?? workItem.caseData.id;
    const patientName = `${workItem.caseData.patient.givenNames ?? ''} ${workItem.caseData.patient.familyNames ?? ''}`.trim();
    const result = await printCassetteLabel(
      { fullAccession, specimenLabel: specimen.label, blockLabel: block.label, cassetteId: `${fullAccession}-${specimen.label}${block.label}`, patientName, tissueDescription: block.tissueDescription },
      ctx.printer, ctx.gtin, ctx.layout,
    );
    return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
  }, [workItem, persist, getPrinterContext, actor.id]);

  const alertBadges = workItem ? resolveEmbeddingAlertBadges(workItem.block, dictionaryType.type, dictionaryType.procedure) : [];

  return {
    workItem, scanError, resolveScan, clearWorkItem,
    alertBadges, splitBlockGroupStatus,
    handleConfirmPieceCount, handleFlagDiscrepancy, handleSetMoldAndOrientation, handleSetAlertFlags, handleGroupSplitBlocks,
    handleAddComment, handleReprintCassette,
    effectiveStationId, actor,
  };
}
