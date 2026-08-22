// src/hooks/useGlobalMaterialScanTracking.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "the tracking event should occur no
// matter what page your on in pathscribe, just need access to the
// NavBar Scan." Confirmed directly: the original
// useMaterialScanTracking.ts (SynopticReportPage/hooks/) only listened
// while a specific case's own Synoptic page was mounted, and only
// ever matched against THAT case's own, currently-loaded data — a
// tech scanning a cassette while on the Worklist, Search, or any
// other page would have been silently ignored, even though
// ScannerProvider's own PATHSCRIBE_SCAN event is already genuinely
// global (window-level, mounted once at the app root alongside
// AuthProvider/SystemConfigProvider/etc. in App.tsx).
//
// This is that real, global replacement — mounted once, app-wide
// (see components/MaterialScanTrackingBridge.tsx), with no
// currently-open-case dependency at all. Parses the real accession
// out of the scanned value, looks up THAT specific case via
// caseRouter (regardless of what's on screen), and only proceeds if
// it genuinely resolves — an unrelated scan (an accession-only
// barcode, a different app's barcode entirely) is silently ignored,
// same real safety posture the original had.
//
// Real fix, per direct follow-up: "Phase 3 — the sibling-propagation
// confirmation system from a few turns back is still sitting there...
// it should come out." That system existed to keep sibling
// specimens sharing one physical cassette (tagged via the legacy
// HistologyBlock.sharedCassetteId) from silently missing their own
// location event. The real architectural fix (Case.matrixBlocks[], a
// single tracked asset per real cassette) made that propagation logic
// structurally unnecessary — a matrix block scan will resolve to one,
// real, shared record directly once the scan/location consumers are
// migrated (real, separate, later work), not N per-specimen copies
// needing a sibling check. Confirmed directly before removing: no
// seed/mock data anywhere in this app still carries a real
// sharedCassetteId, so this is a clean removal. Back to a direct,
// single-target write — exactly what this hook did before that
// system existed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { processMaterialLocationEvent } from '@/services/hl7/processMaterialLocationEvent';
import { dispatchMaterialScanEvent } from '@/utils/dispatchMaterialScanEvent';
import { dispatchSlideLabel } from '@/utils/labels/dispatchSlideLabel';
import { hydrateGrossingBlocks } from '@/utils/hydrateGrossingBlocks';
import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
import type { ResolvedScanTarget } from '@/utils/resolveMaterialFromScan';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { slideIdentifier, matrixSlideIdentifier } from '@/types/labels/LabelData';
import { useCurrentScanStation } from './useCurrentScanStation';
import { useAuth } from '@/contexts/AuthContext';
import type { ScanEvent } from '@/contexts/ScannerProvider';
import type { Case } from '@/types/case/Case';

/** Real, event-carried notification that a specific case's material
 *  was just updated by a scan — listened for by SynopticReportPage.tsx
 *  so a page currently viewing that exact case refreshes live, without
 *  this hook needing to know or care whether such a page even exists. */
export const MATERIAL_SCAN_UPDATED_EVENT = 'PATHSCRIBE_MATERIAL_SCAN_UPDATED';

/** Real feature, per direct follow-up: "slide engravers are common as
 *  well. In that workflow, the user scans the block at microtomy and
 *  the labels get generated dynamically." Confirmed directly:
 *  'Microtomy / Sectioning' is a real, already-established
 *  ScanStation.workflowStage value (mockScanStationService.ts's own
 *  seed data). Only ever fires for a block-level or matrix_block-
 *  level scan at a station on that real stage — a slide-level scan
 *  (the slide already exists) has nothing pending to generate.
 *
 *  Real, deliberate re-fetch of the case rather than reusing the
 *  caller's own, already-resolved snapshot — handleRealScan's own
 *  processMaterialLocationEvent call just wrote a real, new
 *  locationHistory entry onto this exact same block/matrix block
 *  moments earlier; building this update from the stale, pre-write
 *  snapshot would silently overwrite it. Never throws — a real
 *  dispatch/write failure here must never block the tech's own
 *  physical scan from having already happened.
 */
async function processMicrotomyScan(
  fullAccession: string,
  specimenLetter: string | undefined,
  target: ResolvedScanTarget,
  workflowStage: string | undefined,
  userId: string,
): Promise<void> {
  if (workflowStage !== 'Microtomy / Sectioning') return;
  if (target.level !== 'block' && target.level !== 'matrix_block') return;

  try {
    const caseData = await caseRouter.getCase(fullAccession);
    if (!caseData) return;

    if (target.level === 'block') {
      const specimen = (caseData.specimens ?? []).find(sp => sp.label === specimenLetter);
      const block = specimen?.blocks?.find(b => b.label === target.blockNumber);
      if (!specimen || !block) return;
      const pendingIndexes = (block.stains ?? [])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.status === 'Pending Cut');
      if (pendingIndexes.length === 0) return;

      await Promise.all(pendingIndexes.map(({ s, i }) => {
        const level = `L${i + 1}`;
        const slideId = slideIdentifier(fullAccession, specimen.label, block.label, level);
        return dispatchSlideLabel({ fullAccession, specimenLabel: specimen.label, blockLabel: block.label, level, stainName: s.stainName, slideId }).catch(() => {});
      }));

      const updatedSpecimens = (caseData.specimens ?? []).map((sp: Case['specimens'][number]) => sp.id !== specimen.id ? sp : {
        ...sp,
        blocks: (sp.blocks ?? []).map(b => b.id !== block.id ? b : {
          ...b,
          stains: (b.stains ?? []).map(s => s.status === 'Pending Cut' ? { ...s, status: 'Cut & Placed' as const } : s),
        }),
      });
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
      mockAuditService.logEvent({
        type: 'system', event: 'Slides Engraved at Microtomy',
        detail: `${pendingIndexes.length} real slide${pendingIndexes.length === 1 ? '' : 's'} engraved for ${specimen.label}${block.label} at microtomy.`,
        user: userId, caseId: caseData.id, confidence: null,
      }).catch(() => {});
    } else {
      const matrixBlockId = target.matrixBlockId;
      const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === matrixBlockId);
      if (!matrixBlock) return;
      const pendingIndexes = (matrixBlock.slides ?? [])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.status === 'Pending Cut');
      if (pendingIndexes.length === 0) return;

      await Promise.all(pendingIndexes.map(({ s, i }) => {
        const level = `L${i + 1}`;
        const slideId = matrixSlideIdentifier(fullAccession, matrixBlock.label, level);
        return dispatchSlideLabel({ fullAccession, specimenLabel: matrixBlock.label, blockLabel: matrixBlock.label, level, stainName: s.stainName, slideId }).catch(() => {});
      }));

      const updatedMatrixBlocks = (caseData.matrixBlocks ?? []).map(m => m.id !== matrixBlockId ? m : {
        ...m,
        slides: (m.slides ?? []).map(s => s.status === 'Pending Cut' ? { ...s, status: 'Cut & Placed' as const } : s),
      });
      await caseRouter.updateCase(caseData.id, { matrixBlocks: updatedMatrixBlocks });
      mockAuditService.logEvent({
        type: 'system', event: 'Slides Engraved at Microtomy',
        detail: `${pendingIndexes.length} real slide${pendingIndexes.length === 1 ? '' : 's'} engraved for matrix block ${matrixBlock.label} at microtomy.`,
        user: userId, caseId: caseData.id, confidence: null,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[Microtomy] Failed to process dynamic slide generation:', e);
  }
}

/** Real feature, per direct follow-up describing the real grossing-
 *  station workflow: "Scanning the container at grossing means
 *  resolving and releasing those pre-created default blocks into
 *  physical assets... the container scan on the SynopticReportPage
 *  acts as the resolution and execution bridge." Same real, gated
 *  structure as processMicrotomyScan above — only fires for a real,
 *  specimen-level scan at a station on the real 'Grossing' stage
 *  (a block/slide-level scan has no real placeholder blocks of its
 *  own to hydrate).
 *
 *  Deliberately ONLY hydrates (resolves + persists cassetteColorId
 *  onto each real, still-'Pending' block) — never prints anything
 *  itself. Per direct confirmation, the real Execution Release
 *  (print/engrave dispatch) only happens on the PA's own explicit
 *  confirm action in the real Grossing panel, never silently as a
 *  side effect of the scan alone. Never throws — a real hydration
 *  failure must never block the tech's own physical scan from having
 *  already happened. */
async function processGrossingScan(
  fullAccession: string,
  specimenLetter: string | undefined,
  target: ResolvedScanTarget,
  workflowStage: string | undefined,
  userId: string,
): Promise<void> {
  if (workflowStage !== 'Grossing') return;
  if (target.level !== 'specimen') return;

  try {
    const caseData = await caseRouter.getCase(fullAccession);
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find(sp => sp.label === specimenLetter);
    if (!specimen) return;

    const hydrated = await hydrateGrossingBlocks(caseData.id, specimen.id);
    if (hydrated.length === 0) return;

    mockAuditService.logEvent({
      type: 'system', event: 'Grossing Blocks Hydrated',
      detail: `${hydrated.length} real block${hydrated.length === 1 ? '' : 's'} resolved (cassette color) for specimen ${specimenLetter} at grossing — ready for PA release.`,
      user: userId, caseId: caseData.id, confidence: null,
    }).catch(() => {});

    // Real, deliberate follow-up event — the location-event refresh
    // handleRealScan itself already fired (immediately, before this
    // function's own async hydration work here could possibly have
    // finished) is genuinely too early to reflect the real,
    // newly-hydrated cassetteColorId. Same real MATERIAL_SCAN_UPDATED_EVENT,
    // fired again once hydration has actually, genuinely persisted —
    // SynopticReportPage.tsx's own existing listener already handles
    // this generically (re-fetch + toast), no new listener needed.
    window.dispatchEvent(new CustomEvent(MATERIAL_SCAN_UPDATED_EVENT, {
      detail: { caseId: caseData.id, targetDescription: `${specimenLetter} (${hydrated.length} cassette${hydrated.length === 1 ? '' : 's'} resolved)`, stationName: 'Grossing' },
    }));
  } catch (e) {
    console.error('[Grossing] Failed to hydrate placeholder blocks:', e);
  }
}

export function useGlobalMaterialScanTracking() {
  const { stationId } = useCurrentScanStation();
  const { user } = useAuth();
  const location = useLocation();

  const handleRealScan = useCallback(async (scanEvent: ScanEvent) => {
    // Real, explicit guard — per direct follow-up adding a genuinely
    // separate station-switch scan kind (useGlobalStationSwitch.ts):
    // a "STATION:" prefixed value would almost certainly fail to
    // resolve to a real case anyway (case accessions don't start with
    // that literal text), but checking explicitly here is clearer and
    // more robust than relying on that as an implicit side effect.
    if (scanEvent.raw?.trim().toUpperCase().startsWith('STATION:')) return;

    // Real, confirmed bug fix, found via live testing: DisposalQueuePage.tsx
    // (services/retentionPolicy/disposeItemByScan.ts) and this hook both
    // listen to the same real, global PATHSCRIBE_SCAN event, and both
    // independently read-modify-write the SAME case record via
    // caseRouter.updateCase — a genuine race where whichever write lands
    // second silently overwrote the other's change with its own, stale
    // snapshot (confirmed directly: a real scan on the disposal queue
    // correctly showed "disposed" in the UI, yet the underlying
    // disposedAt field was missing afterward — this hook's own,
    // unrelated location-tracking write had clobbered it). Same real
    // guard pattern ScannerProvider.tsx already uses for its own
    // route-specific scan-meaning conflict on '/accession' — a scan on
    // the disposal queue means "dispose this," not "record a new
    // location," and the two must never both act on the same scan.
    if (location.pathname.startsWith('/batch-management/disposal')) return;

    // Real, shared resolution — see resolveMaterialFromScan.ts's own
    // header for why this used to be two independently-maintained
    // copies (this hook's own, and the new Batch Management module's)
    // and is now one, real, shared implementation.
    const resolved = await resolveMaterialFromScan(scanEvent.raw);
    if (!resolved) return; // Real, deliberate silent ignore — not a real, resolvable case+material scan at all.
    const { caseData, fullAccession, specimenLetter, target } = resolved;

    if (!stationId) return; // Real, silent no-op — same as the toast-driven version, but a global listener with no case-specific page open has nowhere sensible to show that toast; the station selector itself (Material tab) still explains this when a tech does check.
    const stationResult = await mockScanStationService.getById(stationId);
    if (!stationResult.ok) return;
    const station = stationResult.data;

    await processMaterialLocationEvent({
      messageId: `local-scan-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organisationId: 'ORG-MFT',
      accessionNumber: fullAccession,
      specimenLetter,
      target,
      location: station.name,
      workflowStage: station.workflowStage,
      observedAt: new Date().toISOString(),
      reportedBy: user?.id ?? 'unknown',
      sourceSystem: 'PathScribe (local scan)',
    });

    await dispatchMaterialScanEvent({
      messageId: `scan-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organisationId: 'ORG-MFT',
      accessionNumber: fullAccession,
      specimenLetter,
      target,
      rawScanValue: scanEvent.raw,
      stationId: station.id,
      stationName: station.name,
      workflowStage: station.workflowStage,
      scannedByUserId: user?.id ?? 'unknown',
    });

    // Real feature, per direct follow-up: "slide engravers are common
    // as well... the user scans the block at microtomy and the labels
    // get generated dynamically." Fire-and-forget, same posture as
    // the other real dispatches above — a slow/failed engrave dispatch
    // must never block the location event that already, correctly
    // applied.
    processMicrotomyScan(fullAccession, specimenLetter, target, station.workflowStage, user?.id ?? 'unknown').catch(() => {});
    processGrossingScan(fullAccession, specimenLetter, target, station.workflowStage, user?.id ?? 'unknown').catch(() => {});

    const targetDescription = target.level === 'matrix_block'
      ? (caseData.matrixBlocks ?? []).find(m => m.id === target.matrixBlockId)?.label ?? target.matrixBlockId
      : target.level === 'matrix_slide'
        ? `${(caseData.matrixBlocks ?? []).find(m => m.id === target.matrixBlockId)?.label ?? target.matrixBlockId}-${target.slideLevel}`
        : target.level === 'specimen'
          ? `${specimenLetter}`
          : target.level === 'decant'
            ? `${specimenLetter}${target.decantLabel}`
            : target.level === 'decant_slide'
              ? `${specimenLetter}${target.decantLabel}-${target.slideLevel}`
              : target.level === 'block'
                ? `${specimenLetter}${target.blockNumber}`
                : `${specimenLetter}${target.blockNumber}-${target.slideLevel}`;

    window.dispatchEvent(new CustomEvent(MATERIAL_SCAN_UPDATED_EVENT, {
      detail: { caseId: caseData.id, targetDescription, stationName: station.name },
    }));
  }, [stationId, user?.id, location.pathname]);

  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<ScanEvent>).detail;
      if (scanEvent) handleRealScan(scanEvent);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [handleRealScan]);
}
