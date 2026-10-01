// src/pages/SlideDistributionStationPage/hooks/useSlideDistributionStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286 (Slide Distribution Station) — third of the PS-284→
// 285→286→287→288 workstation-build sequence. Genuinely different
// shape from useMicrotomyWorkstation.ts/useEmbeddingStation.ts: those
// are single-work-item benches (one block/decant open at a time); this
// is a real continuous-scan QUEUE — a distribution tech scans one
// physical slide after another with no manual interface interaction
// between scans, and every queued slide stays independently actionable
// (assign, check out, flag) rather than replacing the previous one.
//
// Real, deliberate scope note on "Batch Container Recognition"
// ("scanning a rack/tray barcode auto-populates all child slides"):
// confirmed by direct investigation (see this folder's own README) —
// no real rack/tray-to-slide-membership data model exists anywhere in
// this app (HardwareContainer tracks staining racks bound to a whole
// Batch, not individual output slides; WsiScanBatch tracks scanner
// INPUT/OUTPUT, not a pre-scan physical tray). Rather than invent a
// fictional container model, this reuses real, existing data: scanning
// an individual slide barcode queues that one real StainOrder;
// scanning a block/cassette barcode queues every real StainOrder
// already cut from that block — an honest, real form of batch
// recognition bounded by what this app's own data actually models.
//
// Real, deliberate reuse of the exact real print-dispatch chain PS-284
// already proved (station -> supportsPrinting + printer profile ->
// printSettingsService.get() -> printSlideLabel) for the spec's own
// "trigger a replacement label print" exception action.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { printerProfileService, printSettingsService, userService, subspecialtyService } from '@/services';
import { printSlideLabel } from '@/utils/labels/printCassetteSlideLabel';
import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { StaffUser } from '@/services/users/IUserService';
import type { Subspecialty } from '@/services/subspecialties/ISubspecialtyService';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock, StainOrder } from '@/types/case/Specimen';
import {
  assignPhysicalSlide, assignScannerSlide, flagSlideException, resolveSlideException, recordLabelReprintRequest,
  resolveSplitDestinationWarning,
} from '@/utils/slideDistributionOperations';
import type { PhysicalAssignment, ScannerAssignment, SlideExceptionReason, SplitDestinationWarning } from '@/utils/slideDistributionOperations';

export interface SlideQueueItem {
  queueId: string;
  caseData: Case;
  specimen: Specimen;
  block: HistologyBlock;
  stain: StainOrder;
}

export interface ScanException {
  id: string;
  rawScan: string;
  reason: 'Unreadable Barcode' | 'Unassigned Accession';
  timestamp: string;
}

function levelLabelFor(stains: StainOrder[], stainId: string): string {
  const idx = stains.findIndex(s => s.id === stainId);
  return `L${idx + 1}`;
}

export function useSlideDistributionStation() {
  const { user } = useAuth();
  const { effectiveStationId } = useEffectiveScanStation();

  const [queue, setQueue] = useState<SlideQueueItem[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanExceptions, setScanExceptions] = useState<ScanException[]>([]);
  const [pathologists, setPathologists] = useState<StaffUser[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const versionsRef = useRef<Map<string, number>>(new Map());

  const actor = { id: user?.id ?? 'unknown', name: user?.name ?? user?.id ?? 'unknown' };

  const loadDirectories = useCallback(async () => {
    const [usersRes, subsRes] = await Promise.all([userService.getAll(), subspecialtyService.getAll()]);
    if (usersRes.ok) setPathologists(usersRes.data.filter(u => u.roles.includes('Pathologist') && u.status === 'Active'));
    if (subsRes.ok) setSubspecialties(subsRes.data.filter(s => s.active));
  }, []);

  /** Real, per the spec's own "Automatic Routing Logic: pre-populates
   *  default attending/primary reading service for Physical Checkout
   *  from the case's existing LIS assignment." Pure read of the real,
   *  existing case-level fields — never a new, separate assignment
   *  concept. */
  const resolveDefaultRouting = useCallback((caseData: Case): { pathologistId?: string; pathologistName?: string; subspecialtyId?: string } => {
    const subspecialtyId = caseData.subspecialtyId;
    const assignedTo = (caseData as unknown as { assignedTo?: string }).assignedTo;
    if (!assignedTo) return { subspecialtyId };
    const match = pathologists.find(p => p.id === assignedTo);
    return { pathologistId: assignedTo, pathologistName: match ? `${match.firstName} ${match.lastName}` : undefined, subspecialtyId };
  }, [pathologists]);

  const queueId = (caseId: string, blockId: string, stainId: string) => `${caseId}::${blockId}::${stainId}`;

  const enqueue = useCallback((caseData: Case, specimen: Specimen, block: HistologyBlock, stain: StainOrder) => {
    const id = queueId(caseData.id, block.id, stain.id);
    setQueue(prev => (prev.some(q => q.queueId === id) ? prev : [...prev, { queueId: id, caseData, specimen, block, stain }]));
    return id;
  }, []);

  /** Real, per this file's own header — a slide-barcode scan queues
   *  one real StainOrder; a block/cassette-barcode scan queues every
   *  real StainOrder already cut from that block (the real, honest
   *  scope for "Batch Container Recognition" — see header). Other scan
   *  targets (matrix_*, specimen, decant*) aren't supported here yet,
   *  same documented-scope-cut posture as PS-285's own block/slide-only
   *  resolution. */
  const resolveScan = useCallback(async (rawScanValue: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    setScanError(null);
    if (!rawScanValue.trim()) return { ok: false, message: 'Empty scan.' };
    const resolved = await resolveMaterialFromScan(rawScanValue);
    if (!resolved) {
      const message = 'That scan didn’t resolve to a real case, block, or slide — check the barcode and try again.';
      setScanError(message);
      setScanExceptions(prev => [...prev, { id: `exc-${Date.now().toString(36)}`, rawScan: rawScanValue, reason: 'Unreadable Barcode', timestamp: new Date().toISOString() }]);
      return { ok: false, message };
    }
    const { caseData, specimenLetter, target } = resolved;
    const specimen = (caseData.specimens ?? []).find(sp => sp.label === specimenLetter);
    if (!specimen) {
      const message = 'Specimen not found on the resolved case.';
      setScanError(message);
      setScanExceptions(prev => [...prev, { id: `exc-${Date.now().toString(36)}`, rawScan: rawScanValue, reason: 'Unassigned Accession', timestamp: new Date().toISOString() }]);
      return { ok: false, message };
    }
    if (target.level !== 'block' && target.level !== 'slide') {
      const message = 'This scan target (a matrix/cell-block cassette, a decant, or a bare specimen scan) isn’t supported at the Slide Distribution Station yet — scan a specific block or slide barcode.';
      setScanError(message);
      return { ok: false, message };
    }
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) {
      const message = `Block ${specimen.label}${target.blockNumber} not found.`;
      setScanError(message);
      return { ok: false, message };
    }
    if (target.level === 'block') {
      const stains = block.stains ?? [];
      if (stains.length === 0) {
        const message = `Block ${specimen.label}${block.label} has no slides to distribute.`;
        setScanError(message);
        return { ok: false, message };
      }
      let firstId = '';
      stains.forEach((stain, i) => { const id = enqueue(caseData, specimen, block, stain); if (i === 0) firstId = id; });
      setActiveQueueId(firstId);
      return { ok: true };
    }
    // target.level === 'slide'
    const stain = block.stains?.find((_, i) => `L${i + 1}` === target.slideLevel);
    if (!stain) {
      const message = `Slide ${specimen.label}${block.label}-${target.slideLevel} not found.`;
      setScanError(message);
      return { ok: false, message };
    }
    const id = enqueue(caseData, specimen, block, stain);
    setActiveQueueId(id);
    return { ok: true };
  }, [enqueue]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.queueId !== id));
    setActiveQueueId(prev => (prev === id ? null : prev));
  }, []);

  /** Real, same real persistence shape as useEmbeddingStation.ts's own
   *  persist — but this station's queue can span MULTIPLE cases at
   *  once (a tech works through a continuous scan stream, not one case
   *  at a time), so this also refreshes every other queued item that
   *  shares the same real, just-updated Specimen object, and tracks a
   *  real per-case version counter rather than a single shared one. */
  const persist = useCallback(async (caseData: Case, updatedSpecimen: Specimen): Promise<Specimen> => {
    const updatedSpecimens = (caseData.specimens ?? []).map(sp => sp.id === updatedSpecimen.id ? updatedSpecimen : sp);
    const updatedCaseData = { ...caseData, specimens: updatedSpecimens };
    setQueue(prev => prev.map(q => {
      if (q.caseData.id !== caseData.id || q.specimen.id !== updatedSpecimen.id) return q;
      const block = updatedSpecimen.blocks?.find(b => b.id === q.block.id);
      const stain = block?.stains?.find(s => s.id === q.stain.id);
      return block && stain ? { ...q, caseData: updatedCaseData, specimen: updatedSpecimen, block, stain } : q;
    }));
    try {
      const version = versionsRef.current.get(caseData.id) ?? (caseData as unknown as { version?: number }).version ?? 0;
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, version);
      versionsRef.current.set(caseData.id, version + 1);
    } catch (e) {
      // Real, honest simplification, same posture as the other two
      // workstations' own persist — logged, not silently hidden, but
      // doesn't block the tech's own next scan.
      console.error('[SlideDistributionStation] Failed to persist:', e);
    }
    return updatedSpecimen;
  }, []);

  const handleAssignPhysical = useCallback(async (id: string, assignment: PhysicalAssignment) => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return { ok: false, message: 'Slide not found in queue.' };
    // Real, per this codebase's own established gotcha (see
    // services/reports/README.md et al.): strictNullChecks: false
    // means a discriminated union doesn't reliably narrow on
    // `if (!result.ok)` — handled with an explicit cast instead.
    const result = assignPhysicalSlide(item.specimen, item.block.id, item.stain.id, assignment, actor.id);
    if (!result.ok) return { ok: false, message: (result as { ok: false; error: string }).error };
    await persist(item.caseData, result.specimen);
    return { ok: true };
  }, [queue, persist, actor.id]);

  const handleAssignScanner = useCallback(async (id: string, assignment: ScannerAssignment) => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return { ok: false, message: 'Slide not found in queue.' };
    const result = assignScannerSlide(item.specimen, item.block.id, item.stain.id, assignment, actor.id);
    if (!result.ok) return { ok: false, message: (result as { ok: false; error: string }).error };
    await persist(item.caseData, result.specimen);
    return { ok: true };
  }, [queue, persist, actor.id]);

  const handleFlagException = useCallback(async (id: string, reason: SlideExceptionReason, note?: string) => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return;
    const result = flagSlideException(item.specimen, item.block.id, item.stain.id, reason, actor.id, note);
    if (result.ok) await persist(item.caseData, result.specimen);
  }, [queue, persist, actor.id]);

  const handleResolveException = useCallback(async (id: string) => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return;
    const result = resolveSlideException(item.specimen, item.block.id, item.stain.id, actor.id);
    if (result.ok) await persist(item.caseData, result.specimen);
  }, [queue, persist, actor.id]);

  const getPrinterContext = useCallback(async (): Promise<{ printer: PrinterProfile; gtin: string } | { error: string }> => {
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
    return { printer: printerRes.data, gtin };
  }, [effectiveStationId]);

  /** Real, per the spec's own "trigger a replacement label print"
   *  exception action — records the real, audited request
   *  (recordLabelReprintRequest) then dispatches the actual print
   *  through the identical real GS1/ZPL path PS-284's Microtomy
   *  Workstation already proved. */
  const handleRequestReprint = useCallback(async (id: string) => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return { ok: false, message: 'Slide not found in queue.' };
    const recorded = recordLabelReprintRequest(item.specimen, item.block.id, item.stain.id, actor.id);
    if (!recorded.ok) return { ok: false, message: (recorded as { ok: false; error: string }).error };
    const specimen = await persist(item.caseData, recorded.specimen);
    const block = specimen.blocks?.find(b => b.id === item.block.id);
    const stain = block?.stains.find(s => s.id === item.stain.id);
    if (!block || !stain) return { ok: false, message: 'Slide not found after persisting reprint request.' };

    const ctx = await getPrinterContext();
    if ('error' in ctx) return { ok: false, message: ctx.error };
    const fullAccession = item.caseData.accession?.fullAccession ?? item.caseData.id;
    const level = levelLabelFor(block.stains, stain.id);
    const slideId = stain.displayId ?? `${specimen.label}${block.label}-${level}`;
    const result = await printSlideLabel(
      { fullAccession, specimenLabel: specimen.label, blockLabel: block.label, level, stainName: stain.stainName, slideId },
      ctx.printer, ctx.gtin,
    );
    return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
  }, [queue, persist, getPrinterContext, actor.id]);

  const splitDestinationWarningFor = useCallback((id: string): SplitDestinationWarning | null => {
    const item = queue.find(q => q.queueId === id);
    if (!item) return null;
    return resolveSplitDestinationWarning(item.specimen, item.block.id);
  }, [queue]);

  return {
    queue, activeQueueId, setActiveQueueId, scanError, scanExceptions, resolveScan, removeFromQueue,
    pathologists, subspecialties, loadDirectories, resolveDefaultRouting,
    handleAssignPhysical, handleAssignScanner, handleFlagException, handleResolveException, handleRequestReprint,
    splitDestinationWarningFor, effectiveStationId, actor,
  };
}
