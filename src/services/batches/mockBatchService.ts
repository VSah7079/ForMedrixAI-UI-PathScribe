// src/services/batches/mockBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working implementation of IBatchService.ts — see that file's own
// header for the full architectural reasoning (built on real, existing
// scan/tracking infrastructure, not a parallel system).
//
// Same real, established persistence pattern as every other mock service
// in this app (storageGet/storageSet, services/mockStorage.ts) — a real
// browser-session store, not just in-memory state that vanishes on
// reload.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
import { mockAuditService } from '../auditlog/mockAuditService';
import { mockHardwareContainerRegistryService } from '../hardwareContainers/mockHardwareContainerRegistryService';
import { CONTAINER_TYPE_CODE } from '../hardwareContainers/IHardwareContainerRegistryService';
import type { ContainerType } from '../hardwareContainers/IHardwareContainerRegistryService';
import { DEFAULT_PRINT_SETTINGS_CONFIG } from '../printSettings/IPrintSettingsService';
import type { PrintSettingsConfig } from '../printSettings/IPrintSettingsService';
import type {
  IBatchService, Batch, BatchItem, AddItemOutcome,
} from './IBatchService';

const STORAGE_KEY = 'batches';

function loadBatches(): Batch[] {
  return storageGet<Batch[]>(STORAGE_KEY, []);
}
function saveBatches(batches: Batch[]): void {
  storageSet(STORAGE_KEY, batches);
}

let counter = 0;
function genId(prefix: string): ID {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * Real, printable Master Batch Barcode — the spec's own FR-1.2 worked
 * example: "CONT-STAIN-YYYYMMDD-XXXX" for a disposable (Mode A) label.
 *
 * Real fix, per direct follow-up: "I assumed we are using a Guid to
 * safely identify the container." Confirmed directly, honestly: the
 * earlier version here used Math.random() over only a 4-digit range
 * (1000-9999) scoped per (containerType, day) — with no check against
 * already-issued barcodes at all. For a busy lab printing many labels
 * of the same container type in one day, that's a real, meaningful
 * collision risk (birthday-paradox math: ~13% chance of a collision
 * at just 50 same-day, same-type labels), not a safely-unique
 * identifier — exactly the kind of silent gap this whole chain-of-
 * custody system exists to prevent.
 *
 * A real, full GUID (36 chars) is impractical on a small, physical
 * container label and painful to hand-key if a scanner fails, and
 * doesn't match the spec's own worked example format at all — so this
 * keeps the short, human-readable, printable shape, but now
 * GUARANTEES uniqueness rather than merely hoping the random space is
 * big enough: crypto.getRandomValues (a real CSPRNG, not Math.random's
 * weaker PRNG) over a 6-digit space (900,000 values — a real,
 * substantial improvement over 9,000), AND an explicit, real
 * check-and-retry against every already-issued barcode (existingBarcodes)
 * before accepting one. Throws (a real, loud failure) rather than
 * silently returning a colliding code in the astronomically unlikely
 * case all real retries are exhausted — a caller must never silently
 * issue a duplicate physical label.
 */
/** Real, direct storage read — this service function isn't a React
 *  component, so it can't call the printSettingsService's own
 *  get()/React-context path; same real, shared mockStorage.ts key
 *  ('printSettings') mockPrintSettingsService.ts itself reads from,
 *  read directly here rather than duplicated or guessed at. */
function getCurrentPrintSettings(): PrintSettingsConfig {
  return storageGet<PrintSettingsConfig>('printSettings', DEFAULT_PRINT_SETTINGS_CONFIG);
}

function generateDisposableBarcode(containerType: ContainerType | undefined, existingBarcodes: Set<string>): string {
  const settings = getCurrentPrintSettings();
  const code = settings.containerTypeCodes[containerType ?? 'Ad-Hoc Batch'] ?? CONTAINER_TYPE_CODE[containerType ?? 'Ad-Hoc Batch'];
  const prefix = settings.disposableBarcodePrefix || 'CONT';
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  const MAX_ATTEMPTS = 50;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const suffix = 100000 + (randomArray[0] % 900000); // real, 6-digit space — 100000-999999
    const candidate = `${prefix}-${code}-${yyyymmdd}-${suffix}`;
    if (!existingBarcodes.has(candidate.toUpperCase())) return candidate;
  }
  // Real, loud failure — see this function's own header for why a
  // silent duplicate is never acceptable here.
  throw new Error(`Could not generate a unique container barcode after ${MAX_ATTEMPTS} attempts — this should be astronomically unlikely; check the random source.`);
}

function findBatch(batches: Batch[], id: ID): Batch | undefined {
  return batches.find(b => b.id === id);
}

export const mockBatchService: IBatchService = {
  async getAll(): Promise<ServiceResult<Batch[]>> {
    return { ok: true, data: loadBatches() };
  },

  async getById(id: ID): Promise<ServiceResult<Batch>> {
    const batch = findBatch(loadBatches(), id);
    if (!batch) return { ok: false, error: `No batch found with id "${id}".` };
    return { ok: true, data: batch };
  },

  async getByMasterBarcode(barcode: string): Promise<ServiceResult<Batch>> {
    const normalized = barcode.trim().toUpperCase();
    const batch = loadBatches().find(b => b.masterBarcode.toUpperCase() === normalized);
    if (!batch) return { ok: false, error: `No batch found for master barcode "${barcode}".` };
    return { ok: true, data: batch };
  },

  async create(draft): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();

    let masterBarcode: string;
    if (draft.identifierMode === 'semi_permanent') {
      // Real FR-1.2 Mode B — the rack's OWN real, already-engraved
      // identifier becomes the batch's own masterBarcode directly
      // (never a second, PathScribe-invented code for the same real
      // hardware), and the real hardware gets atomically checked out
      // first — a real, honest failure here (already checked out to a
      // different active batch) must stop batch creation entirely,
      // not create an orphaned batch with no real, available rack
      // behind it.
      if (!draft.rackId?.trim()) return { ok: false, error: 'A rack ID is required for a semi-permanent container.' };
      masterBarcode = draft.rackId.trim().toUpperCase();
    } else {
      masterBarcode = generateDisposableBarcode(draft.containerType, new Set(batches.map(b => b.masterBarcode.toUpperCase())));
    }

    const batch: Batch = {
      id: genId('batch'),
      masterBarcode,
      containerType: draft.containerType,
      identifierMode: draft.identifierMode,
      linkedRackId: draft.identifierMode === 'semi_permanent' ? draft.rackId?.trim().toUpperCase() : undefined,
      processingNode: draft.processingNode,
      solutionType: draft.processingNode === 'Decal / Special Processing' ? draft.solutionType : undefined,
      targetDurationMinutes: draft.processingNode === 'Decal / Special Processing' ? draft.targetDurationMinutes : undefined,
      protocol: draft.protocol,
      priority: draft.priority,
      status: 'active',
      items: [],
      unexpectedScans: [],
      stationId: draft.stationId,
      createdAt: new Date().toISOString(),
      createdByUserId: draft.createdByUserId,
      createdByUserName: draft.createdByUserName,
    };

    if (draft.identifierMode === 'semi_permanent' && draft.rackId) {
      const checkOutResult = await mockHardwareContainerRegistryService.checkOut(draft.rackId, batch.id);
      // Real, established workaround for a real TS narrowing quirk this
      // codebase already hit (and fixed the same way) in
      // BatchDetailView.tsx — see that file's own comment for the full
      // reasoning.
      if ('error' in checkOutResult) return { ok: false, error: checkOutResult.error };
    }

    batches.push(batch);
    saveBatches(batches);
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Created',
      detail: `Batch ${batch.masterBarcode} created — ${batch.processingNode}, protocol "${batch.protocol}", ${batch.priority}.`,
      user: draft.createdByUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: batch };
  },

  async addItemByScan(batchId: ID, scannedValue: string, byUserId: string, byUserName: string): Promise<AddItemOutcome> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { outcome: 'not-found', reason: `No batch found with id "${batchId}".` };

    const resolved = await resolveMaterialFromScan(scannedValue);
    if (!resolved) {
      return { outcome: 'not-found', reason: `"${scannedValue}" doesn't match any real cassette or slide on any case.` };
    }
    const { fullAccession, specimenLetter, displayId } = resolved;

    if (batch.items.some(i => i.displayId === displayId)) {
      return { outcome: 'already-in-batch', reason: `${displayId} is already in this batch.` };
    }

    // Real protocol-validation starting point, per the spec's own
    // "checks tissue type and run parameters upon each scan" — no real
    // tissue-type field exists anywhere in this app yet to validate
    // against (confirmed directly), so the real, meaningful check
    // available today is: the same physical cassette/slide can't
    // genuinely be in two different active processing runs at once.
    const otherActiveBatch = batches.find(b => b.id !== batchId && b.status === 'active' && b.items.some(i => i.displayId === displayId));
    if (otherActiveBatch) {
      mockAuditService.logEvent({
        type: 'system', event: 'Batch Item Scan Rejected — Already In Another Active Batch',
        detail: `${displayId} scan into batch ${batch.masterBarcode} rejected — already active in batch ${otherActiveBatch.masterBarcode} (${otherActiveBatch.protocol}).`,
        user: byUserName, caseId: fullAccession, confidence: null,
      }).catch(() => {});
      return {
        outcome: 'in-other-active-batch',
        reason: `${displayId} is already in active batch ${otherActiveBatch.masterBarcode} (${otherActiveBatch.protocol}).`,
        otherBatchId: otherActiveBatch.id,
        otherMasterBarcode: otherActiveBatch.masterBarcode,
      };
    }

    const item: BatchItem = {
      id: genId('item'),
      materialType: resolved.target.level,
      displayId,
      caseAccession: fullAccession,
      specimenLabel: specimenLetter,
      addedAt: new Date().toISOString(),
      addedByUserId: byUserId,
      addedByUserName: byUserName,
    };
    const updatedBatch: Batch = { ...batch, items: [...batch.items, item] };
    const updatedBatches = batches.map(b => b.id === batchId ? updatedBatch : b);
    saveBatches(updatedBatches);
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Item Added',
      detail: `${displayId} added to batch ${batch.masterBarcode} (${batch.processingNode}).`,
      user: byUserName, caseId: fullAccession, confidence: null,
    }).catch(() => {});
    return { outcome: 'added', batch: updatedBatch, item };
  },

  async removeItem(batchId: ID, itemId: ID, _byUserId: string, byUserName: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    const removedItem = batch.items.find(i => i.id === itemId);
    const updatedBatch: Batch = { ...batch, items: batch.items.filter(i => i.id !== itemId) };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    if (removedItem) {
      mockAuditService.logEvent({
        type: 'system', event: 'Batch Item Removed',
        detail: `${removedItem.displayId} removed from batch ${batch.masterBarcode} (${batch.processingNode}) — batch splitting.`,
        user: byUserName, caseId: removedItem.caseAccession, confidence: null,
      }).catch(() => {});
    }
    return { ok: true, data: updatedBatch };
  },

  async moveItem(fromBatchId: ID, itemId: ID, toBatchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<{ fromBatch: Batch; toBatch: Batch }>> {
    if (fromBatchId === toBatchId) return { ok: false, error: 'Source and destination are the same batch.' };
    const batches = loadBatches();
    const fromBatch = findBatch(batches, fromBatchId);
    if (!fromBatch) return { ok: false, error: `No batch found with id "${fromBatchId}".` };
    const toBatch = findBatch(batches, toBatchId);
    if (!toBatch) return { ok: false, error: `No batch found with id "${toBatchId}".` };

    // Real, honest guard — see this method's own doc comment
    // (IBatchService.ts) for why both sides must be 'active'.
    if (fromBatch.status !== 'active') return { ok: false, error: `Source batch ${fromBatch.masterBarcode} is "${fromBatch.status}", not "active" — items can't be moved out of it right now.` };
    if (toBatch.status !== 'active') return { ok: false, error: `Destination batch ${toBatch.masterBarcode} is "${toBatch.status}", not "active" — items can't be moved into it right now.` };

    const item = fromBatch.items.find(i => i.id === itemId);
    if (!item) return { ok: false, error: `No item with id "${itemId}" found in batch ${fromBatch.masterBarcode}.` };
    if (toBatch.items.some(i => i.displayId === item.displayId)) {
      return { ok: false, error: `${item.displayId} is already in batch ${toBatch.masterBarcode}.` };
    }

    const transfer = {
      fromBatchId, fromMasterBarcode: fromBatch.masterBarcode,
      toBatchId, toMasterBarcode: toBatch.masterBarcode,
      at: new Date().toISOString(), byUserId, byUserName,
    };
    const movedItem: BatchItem = {
      ...item,
      addedAt: transfer.at, addedByUserId: byUserId, addedByUserName: byUserName,
      reconciliationStatus: undefined, // real, honest reset — this item hasn't been reconciled in its new batch's own pass yet
      transferHistory: [...(item.transferHistory ?? []), transfer],
    };

    const updatedFromBatch: Batch = { ...fromBatch, items: fromBatch.items.filter(i => i.id !== itemId) };
    const updatedToBatch: Batch = { ...toBatch, items: [...toBatch.items, movedItem] };
    saveBatches(batches.map(b => {
      if (b.id === fromBatchId) return updatedFromBatch;
      if (b.id === toBatchId) return updatedToBatch;
      return b;
    }));
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Item Moved',
      detail: `${item.displayId} moved from batch ${fromBatch.masterBarcode} to batch ${toBatch.masterBarcode}.`,
      user: byUserName, caseId: item.caseAccession, confidence: null,
    }).catch(() => {});
    return { ok: true, data: { fromBatch: updatedFromBatch, toBatch: updatedToBatch } };
  },

  async startReconciliation(batchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.status !== 'active') return { ok: false, error: `Batch is "${batch.status}", not "active" — reconciliation can only start on an active batch.` };
    const updatedBatch: Batch = {
      ...batch,
      status: 'reconciling',
      reconciliationStartedAt: new Date().toISOString(),
      reconciliationStartedByUserId: byUserId,
      reconciliationStartedByUserName: byUserName,
      // Real, deliberate reset — every item starts this new
      // reconciliation pass genuinely unverified, even if a PRIOR
      // reconciliation attempt on this same batch had already marked
      // some items matched (e.g. a batch sent back into reconciliation
      // after an abort) — carrying stale matched flags forward would
      // let a real, un-rescanned item silently pass this time.
      items: batch.items.map(i => ({ ...i, reconciliationStatus: undefined })),
      unexpectedScans: [],
    };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Reconciliation Started',
      detail: `Out-of-process verification started for batch ${batch.masterBarcode} (${batch.items.length} item(s) to verify).`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async scanItemOut(batchId: ID, scannedValue: string, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.status !== 'reconciling') return { ok: false, error: `Batch is "${batch.status}", not "reconciling" — start reconciliation first.` };

    const resolved = await resolveMaterialFromScan(scannedValue);
    const displayId = resolved?.displayId ?? scannedValue.trim();
    const matchedItem = batch.items.find(i => i.displayId === displayId);

    let updatedBatch: Batch;
    if (matchedItem) {
      updatedBatch = {
        ...batch,
        items: batch.items.map(i => i.id === matchedItem.id ? { ...i, reconciliationStatus: 'matched' as const } : i),
      };
      saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
      mockAuditService.logEvent({
        type: 'system', event: 'Batch Item Verified — Matched',
        detail: `${displayId} scanned out of batch ${batch.masterBarcode} and matched against manifest.`,
        user: byUserName, caseId: matchedItem.caseAccession, confidence: null,
      }).catch(() => {});
    } else {
      // Real "Unexpected/Extra" — a real, physical item scanned out of
      // the carrier that was never part of this batch's own manifest.
      updatedBatch = {
        ...batch,
        unexpectedScans: [...batch.unexpectedScans, { id: genId('unexpected'), scannedDisplayId: displayId, at: new Date().toISOString(), byUserId, byUserName }],
      };
      saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
      mockAuditService.logEvent({
        type: 'system', event: 'Batch Item Verified — Unexpected/Extra',
        detail: `${displayId} scanned out of batch ${batch.masterBarcode} but is NOT on the batch's own manifest — flagged as unexpected/extra.`,
        user: byUserName, caseId: resolved?.fullAccession ?? null, confidence: null,
      }).catch(() => {});
    }
    return { ok: true, data: updatedBatch };
  },

  async completeReconciliation(batchId: ID): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.status !== 'reconciling') return { ok: false, error: `Batch is "${batch.status}", not "reconciling".` };

    // Real "Hard Stop Gatekeeper" — per the spec's own words: "cannot
    // be marked Complete... until missing or extra items are
    // reconciled." Enforced here, server-side, not just a disabled
    // button — a caller that somehow bypasses the UI still can't force
    // this through.
    const missingItems = batch.items.filter(i => i.reconciliationStatus !== 'matched');
    if (missingItems.length > 0) {
      return { ok: false, error: `${missingItems.length} item(s) still missing/unscanned: ${missingItems.map(i => i.displayId).join(', ')}. Scan them out or use a supervisor override.` };
    }
    if (batch.unexpectedScans.length > 0) {
      return { ok: false, error: `${batch.unexpectedScans.length} unexpected item(s) scanned that don't belong to this batch: ${batch.unexpectedScans.map(s => s.scannedDisplayId).join(', ')}. Resolve them or use a supervisor override.` };
    }

    const updatedBatch: Batch = { ...batch, status: 'complete', completedAt: new Date().toISOString() };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    // Real FR-3.2 "disbanding logic" — auto-release on a real,
    // successful completion path, not just the explicit "Release Rack"
    // action. Fire-and-forget: a real hardware check-in failure must
    // never block the batch's own, already-successful completion.
    if (updatedBatch.identifierMode === 'semi_permanent' && updatedBatch.linkedRackId) {
      mockHardwareContainerRegistryService.checkIn(updatedBatch.linkedRackId).catch(() => {});
    }
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Complete',
      detail: `Batch ${batch.masterBarcode} reconciled and marked complete — all ${batch.items.length} item(s) matched, no unexpected scans.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async overrideAndComplete(batchId: ID, byUserId: string, byUserName: string, reason: string): Promise<ServiceResult<Batch>> {
    if (!reason.trim()) return { ok: false, error: 'A reason is required to override a reconciliation discrepancy.' };
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.status !== 'reconciling') return { ok: false, error: `Batch is "${batch.status}", not "reconciling".` };

    const updatedBatch: Batch = {
      ...batch,
      status: 'complete',
      completedAt: new Date().toISOString(),
      override: { byUserId, byUserName, reason: reason.trim(), at: new Date().toISOString() },
    };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    if (updatedBatch.identifierMode === 'semi_permanent' && updatedBatch.linkedRackId) {
      mockHardwareContainerRegistryService.checkIn(updatedBatch.linkedRackId).catch(() => {});
    }
    const missingCount = batch.items.filter(i => i.reconciliationStatus !== 'matched').length;
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Reconciliation Overridden',
      detail: `Batch ${batch.masterBarcode} force-completed by supervisor override — ${missingCount} missing item(s), ${batch.unexpectedScans.length} unexpected scan(s). Reason: ${reason.trim()}`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async abort(batchId: ID, _byUserId: string, byUserName: string, reason: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    const updatedBatch: Batch = { ...batch, status: 'aborted', abortedAt: new Date().toISOString(), abortReason: reason.trim() || `Aborted by ${byUserName}.` };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    if (updatedBatch.identifierMode === 'semi_permanent' && updatedBatch.linkedRackId) {
      mockHardwareContainerRegistryService.checkIn(updatedBatch.linkedRackId).catch(() => {});
    }
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Aborted',
      detail: `Batch ${batch.masterBarcode} (${batch.processingNode}, ${batch.items.length} item(s)) aborted. Reason: ${reason.trim() || 'Not specified.'}`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async releaseRack(batchId: ID, _byUserId: string, byUserName: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.identifierMode !== 'semi_permanent' || !batch.linkedRackId) {
      return { ok: false, error: 'This batch has no semi-permanent hardware rack to release.' };
    }
    const checkInResult = await mockHardwareContainerRegistryService.checkIn(batch.linkedRackId);
    if ('error' in checkInResult) return { ok: false, error: checkInResult.error };

    const updatedBatch: Batch = { ...batch, linkedRackId: undefined };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Rack Released',
      detail: `Rack ${batch.linkedRackId} manually released from batch ${batch.masterBarcode} — still ${batch.status}, hardware now Available for re-use.`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async transferToProcessing(batchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<{ fromBatch: Batch; toBatch: Batch }>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.processingNode !== 'Decal / Special Processing') {
      return { ok: false, error: `Batch ${batch.masterBarcode} is not a Decal / Special Processing batch — transfer-to-Processing only applies there.` };
    }
    if (batch.status !== 'active') {
      return { ok: false, error: `Batch is "${batch.status}", not "active" — it may have already been transferred or closed out.` };
    }
    if (batch.items.length === 0) {
      return { ok: false, error: 'This batch has no items to transfer.' };
    }

    const nowIso = new Date().toISOString();
    const newBarcode = generateDisposableBarcode('Tissue Processor Basket', new Set(batches.map(b => b.masterBarcode.toUpperCase())));
    const newBatchId = genId('batch');

    const transferredItems: BatchItem[] = batch.items.map(item => ({
      ...item,
      addedAt: nowIso, addedByUserId: byUserId, addedByUserName: byUserName,
      reconciliationStatus: undefined,
      transferHistory: [
        ...(item.transferHistory ?? []),
        { fromBatchId: batch.id, fromMasterBarcode: batch.masterBarcode, toBatchId: newBatchId, toMasterBarcode: newBarcode, at: nowIso, byUserId, byUserName },
      ],
    }));

    const newBatch: Batch = {
      id: newBatchId,
      masterBarcode: newBarcode,
      containerType: 'Tissue Processor Basket',
      identifierMode: 'disposable',
      processingNode: 'Processing',
      protocol: `${batch.protocol} (transferred from Decal ${batch.masterBarcode})`,
      priority: batch.priority,
      status: 'active',
      items: transferredItems,
      unexpectedScans: [],
      stationId: batch.stationId,
      createdAt: nowIso,
      createdByUserId: byUserId,
      createdByUserName: byUserName,
    };

    const updatedSourceBatch: Batch = {
      ...batch, status: 'complete', completedAt: nowIso, transferredToBatchId: newBatch.id, items: [],
    };

    if (updatedSourceBatch.identifierMode === 'semi_permanent' && updatedSourceBatch.linkedRackId) {
      mockHardwareContainerRegistryService.checkIn(updatedSourceBatch.linkedRackId).catch(() => {});
    }

    saveBatches([...batches.map(b => b.id === batchId ? updatedSourceBatch : b), newBatch]);
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Transferred to Processing',
      detail: `${batch.items.length} item(s) bulk-transferred from Decal batch ${batch.masterBarcode} to new Processing batch ${newBatch.masterBarcode}.`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});

    return { ok: true, data: { fromBatch: updatedSourceBatch, toBatch: newBatch } };
  },
};
