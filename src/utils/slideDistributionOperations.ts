// src/utils/slideDistributionOperations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286 (Slide Distribution Station) — third of the PS-284→
// 285→286→287→288 workstation-build sequence, the post-staining step:
// routing each finished, physical slide either to a pathologist
// (physical checkout) or a digital scanner (WSI ingestion). Same real
// pure/tested-function + hook-wraps-it shape as
// embeddingOperations.ts/microtomyOperations.ts — the caller
// (useSlideDistributionStation.ts) persists the returned Specimen via
// caseRouter.updateCase; these functions never touch case data or
// other services themselves.
//
// Real, deliberate scope note, confirmed by direct investigation before
// building (see pages/SlideDistributionStationPage/README.md's own
// account): this operates on an individual StainOrder (a real, physical
// glass slide already cut/stained) within an ordinary HistologyBlock.
// MatrixBlock-level slides are NOT covered — same documented scope cut
// PS-284/PS-285 both made, kept consistent across the series.
// ─────────────────────────────────────────────────────────────────────────────

import type { HistologyBlock, Specimen, StainOrder, SlideDistributionEvent } from '@/types/case/Specimen';

export type SlideDistributionOperationResult =
  | { ok: true; specimen: Specimen }
  | { ok: false; error: string };

export type SlideExceptionReason = 'Unreadable Barcode' | 'Unassigned Accession' | 'Missing Glass';
export const SLIDE_EXCEPTION_REASONS: readonly SlideExceptionReason[] = ['Unreadable Barcode', 'Unassigned Accession', 'Missing Glass'];

function findBlockAndStain(specimen: Specimen, blockId: string, stainId: string): { block: HistologyBlock; stain: StainOrder } | undefined {
  const block = (specimen.blocks ?? []).find(b => b.id === blockId);
  const stain = block?.stains?.find(s => s.id === stainId);
  if (!block || !stain) return undefined;
  return { block, stain };
}

function replaceStain(specimen: Specimen, blockId: string, stainId: string, changes: Partial<StainOrder>): Specimen {
  return {
    ...specimen,
    blocks: (specimen.blocks ?? []).map(b => {
      if (b.id !== blockId) return b;
      return { ...b, stains: (b.stains ?? []).map(s => s.id !== stainId ? s : { ...s, ...changes }) };
    }),
  };
}

function appendEvent(existing: SlideDistributionEvent[] | undefined, action: SlideDistributionEvent['action'], techUserId: string, detail: string): SlideDistributionEvent[] {
  const event: SlideDistributionEvent = {
    id: `sde-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    action, timestamp: new Date().toISOString(), techUserId, detail,
  };
  return [...(existing ?? []), event];
}

export interface PhysicalAssignment {
  pathologistId?: string;
  pathologistName?: string;
  subspecialtyId?: string;
  slideFolderId?: string;
  trayNumber?: string;
  courierBagId?: string;
}

/** Real, per the spec's own "Pathologist & Pool Assignment" +
 *  "Physical Location & Carrier Tracking" + "Chain-of-Custody Logging:
 *  sets status to Checked Out/Assigned." One combined real entry
 *  point, since a distribution tech may assign a pathologist first and
 *  record the physical carrier later (or both at once) — mirrors
 *  embeddingOperations.ts's own setMoldAndOrientation "single, combined
 *  setter" shape. Status is 'Checked Out' the moment any real physical
 *  location field is recorded, 'Assigned' when only a
 *  pathologist/pool has been set with no physical location yet — never
 *  the reverse (a real physical location implies the slide has
 *  actually left the bench, which is a stronger real claim than a mere
 *  assignment). */
export function assignPhysicalSlide(
  specimen: Specimen, blockId: string, stainId: string, assignment: PhysicalAssignment, techUserId: string,
): SlideDistributionOperationResult {
  const found = findBlockAndStain(specimen, blockId, stainId);
  if (!found) return { ok: false, error: 'Slide not found.' };
  const { stain } = found;
  const hasLocation = !!(assignment.slideFolderId || assignment.trayNumber || assignment.courierBagId);
  const status = hasLocation ? 'Checked Out' : 'Assigned';
  const detailParts: string[] = [];
  if (assignment.pathologistName) detailParts.push(`assigned to Dr. ${assignment.pathologistName}`);
  else if (assignment.subspecialtyId) detailParts.push(`routed to subspecialty pool ${assignment.subspecialtyId}`);
  if (assignment.slideFolderId) detailParts.push(`folder ${assignment.slideFolderId}`);
  if (assignment.trayNumber) detailParts.push(`tray ${assignment.trayNumber}`);
  if (assignment.courierBagId) detailParts.push(`courier bag ${assignment.courierBagId}`);
  if (detailParts.length === 0) return { ok: false, error: 'At least one of pathologist, pool, or physical location is required.' };

  return {
    ok: true,
    specimen: replaceStain(specimen, blockId, stainId, {
      distributionDestination: 'physical',
      distributionStatus: status,
      assignedPathologistId: assignment.pathologistId ?? stain.assignedPathologistId,
      assignedPathologistName: assignment.pathologistName ?? stain.assignedPathologistName,
      assignedSubspecialtyId: assignment.subspecialtyId ?? stain.assignedSubspecialtyId,
      physicalLocation: {
        slideFolderId: assignment.slideFolderId ?? stain.physicalLocation?.slideFolderId,
        trayNumber: assignment.trayNumber ?? stain.physicalLocation?.trayNumber,
        courierBagId: assignment.courierBagId ?? stain.physicalLocation?.courierBagId,
      },
      distributionEvents: appendEvent(stain.distributionEvents, status === 'Checked Out' ? 'checked_out' : 'assigned', techUserId, detailParts.join(', ')),
    }),
  };
}

export interface ScannerAssignment {
  scannerInstrumentId?: string;
  rackId?: string;
  slotPosition?: string;
}

/** Real, per the spec's own "Equipment & Rack Mapping" + "Chain-of-
 *  Custody Logging: sets status to In Scanning Queue/Loaded on
 *  Scanner." 'Loaded on Scanner' only once a real rack + slot position
 *  are both recorded — a scanner instrument alone means the slide is
 *  queued for that instrument but not yet physically racked. */
export function assignScannerSlide(
  specimen: Specimen, blockId: string, stainId: string, assignment: ScannerAssignment, techUserId: string,
): SlideDistributionOperationResult {
  const found = findBlockAndStain(specimen, blockId, stainId);
  if (!found) return { ok: false, error: 'Slide not found.' };
  const { stain } = found;
  if (!assignment.scannerInstrumentId) return { ok: false, error: 'A scanner instrument is required.' };
  const loaded = !!(assignment.rackId && assignment.slotPosition);
  const status = loaded ? 'Loaded on Scanner' : 'In Scanning Queue';
  const detail = loaded
    ? `loaded on ${assignment.scannerInstrumentId}, rack ${assignment.rackId}, slot ${assignment.slotPosition}`
    : `queued for ${assignment.scannerInstrumentId}`;

  return {
    ok: true,
    specimen: replaceStain(specimen, blockId, stainId, {
      distributionDestination: 'digital',
      distributionStatus: status,
      scannerAssignment: {
        scannerInstrumentId: assignment.scannerInstrumentId,
        rackId: assignment.rackId ?? stain.scannerAssignment?.rackId,
        slotPosition: assignment.slotPosition ?? stain.scannerAssignment?.slotPosition,
      },
      distributionEvents: appendEvent(stain.distributionEvents, loaded ? 'loaded_on_scanner' : 'assigned', techUserId, detail),
    }),
  };
}

/** Real, per the spec's own "Scan Exception Log" — flags an already-
 *  resolved, already-queued slide (e.g. "Missing Glass": the tech
 *  expected a physical slide to actually be there and it wasn't). An
 *  unreadable-barcode/unassigned-accession exception that never
 *  resolved to a real slide record at all is NOT this function's
 *  concern — see this file's own header and the hook's own
 *  session-scoped exception log for that earlier case. */
export function flagSlideException(
  specimen: Specimen, blockId: string, stainId: string, reason: SlideExceptionReason, techUserId: string, note?: string,
): SlideDistributionOperationResult {
  const found = findBlockAndStain(specimen, blockId, stainId);
  if (!found) return { ok: false, error: 'Slide not found.' };
  const { stain } = found;
  const detail = note ? `${reason} — ${note}` : reason;
  return {
    ok: true,
    specimen: replaceStain(specimen, blockId, stainId, {
      activeExceptionReason: reason,
      distributionEvents: appendEvent(stain.distributionEvents, 'exception_flagged', techUserId, detail),
    }),
  };
}

export function resolveSlideException(specimen: Specimen, blockId: string, stainId: string, techUserId: string): SlideDistributionOperationResult {
  const found = findBlockAndStain(specimen, blockId, stainId);
  if (!found) return { ok: false, error: 'Slide not found.' };
  const { stain } = found;
  if (!stain.activeExceptionReason) return { ok: false, error: 'No open exception on this slide.' };
  return {
    ok: true,
    specimen: replaceStain(specimen, blockId, stainId, {
      activeExceptionReason: undefined,
      distributionEvents: appendEvent(stain.distributionEvents, 'exception_resolved', techUserId, `Resolved: ${stain.activeExceptionReason}`),
    }),
  };
}

/** Real, per the spec's own "trigger a replacement label print"
 *  exception action — records the real event only; the caller
 *  dispatches the actual print (printSlideLabel, same real GS1/ZPL
 *  path PS-284's Microtomy Workstation already proved), same
 *  "function records the audited reason, caller does the real I/O"
 *  split as embeddingOperations.ts's own recordCassetteReprint. */
export function recordLabelReprintRequest(specimen: Specimen, blockId: string, stainId: string, techUserId: string): SlideDistributionOperationResult {
  const found = findBlockAndStain(specimen, blockId, stainId);
  if (!found) return { ok: false, error: 'Slide not found.' };
  const { stain } = found;
  return {
    ok: true,
    specimen: replaceStain(specimen, blockId, stainId, {
      distributionEvents: appendEvent(stain.distributionEvents, 'label_reprint_requested', techUserId, 'Replacement label requested from Slide Distribution Station'),
    }),
  };
}

export interface SplitDestinationWarning {
  routed: StainOrder[];
  conflict: boolean;
  detail: string;
}

/** Real, per the spec's own "Split-Destination Warnings: visual alert
 *  when slides from the same block/accession are split across
 *  different physical locations or scanners." Pure read, scoped to one
 *  block (same real "block, not full accession" scope cut PS-285's own
 *  resolveSplitBlockGroupStatus documents for its own, differently-
 *  named split concept — a genuine cross-specimen/whole-accession
 *  check would need data this function deliberately doesn't reach
 *  for). Returns null when fewer than 2 of the block's own slides have
 *  been routed anywhere yet — nothing to compare. */
export function resolveSplitDestinationWarning(specimen: Specimen, blockId: string): SplitDestinationWarning | null {
  const block = (specimen.blocks ?? []).find(b => b.id === blockId);
  if (!block) return null;
  const routed = (block.stains ?? []).filter(s => !!s.distributionDestination);
  if (routed.length < 2) return null;

  const destinations = new Set(routed.map(s => s.distributionDestination));
  const physicalTargets = new Set(
    routed.filter(s => s.distributionDestination === 'physical').map(s => s.assignedPathologistId ?? s.assignedSubspecialtyId ?? s.physicalLocation?.courierBagId ?? '—'),
  );
  const digitalTargets = new Set(
    routed.filter(s => s.distributionDestination === 'digital').map(s => s.scannerAssignment?.scannerInstrumentId ?? '—'),
  );
  const conflict = destinations.size > 1 || physicalTargets.size > 1 || digitalTargets.size > 1;
  const detail = !conflict
    ? 'Every routed slide on this block is headed to the same destination.'
    : destinations.size > 1
      ? 'Slides on this block are split between physical checkout and digital scanning.'
      : physicalTargets.size > 1
        ? 'Slides on this block are checked out to different pathologists/locations.'
        : 'Slides on this block are loaded on different scanners.';

  return { routed, conflict, detail };
}
