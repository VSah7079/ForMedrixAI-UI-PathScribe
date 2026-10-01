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
import { mockSpecimenDeficiencyService } from '../deficiencies/mockSpecimenDeficiencyService';
import { mockReagentLotService } from '../reagentLots/mockReagentLotService';
import { mockStainTypeService } from '../stains/mockStainTypeService';
import { mockScanStationService } from '../scanStations/mockScanStationService';
import { shouldAutoAppendControl } from './shouldAutoAppendControl';
import { batchHasControlForLot, createControlSlideCase } from './ensureControlSlideAppended';
import { mockHardwareContainerRegistryService } from '../hardwareContainers/mockHardwareContainerRegistryService';
import { CONTAINER_TYPE_CODE } from '../hardwareContainers/IHardwareContainerRegistryService';
import type { ContainerType } from '../hardwareContainers/IHardwareContainerRegistryService';
import { DEFAULT_PRINT_SETTINGS_CONFIG } from '../printSettings/IPrintSettingsService';
import { buildReferralManifestPayload } from '../referral/buildReferralManifestPayload';
import { mockReferralOutboundQueueService } from '../referral/mockReferralOutboundQueueService';
import { mockReferralTrackingService } from '../referral/mockReferralTrackingService';
import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import { mockDpVendorService } from '../digitalPathology/mockDpVendorService';
import { mockAiScreeningResultService } from '../digitalPathology/mockAiScreeningResultService';
import { mockMolecularOrderOutboundQueueService } from '../molecularOrders/mockMolecularOrderOutboundQueueService';
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

// Real, additive — per 'Cytology Staining' (stainer rack batch),
// Part 3 of the Protocol-Driven Workflow Infrastructure story:
// "completion transitions slides to 'Ready for Screening'." Real,
// deliberate reuse of the existing StainOrderStatus value 'Ready for
// Review' rather than adding a near-duplicate 'Ready for Screening'
// string — same real vocabulary-drift concern BATCH_PROCESSING_NODES'
// own header already documents for 'Microtomy' vs 'Microtomy /
// Sectioning'. A cytology slide that's ready for the cytotechnologist
// to screen and a histology slide that's ready for the pathologist to
// review are the same real state (stained, coverslipped, ready for a
// human's first look) — one shared status, not two competing ones.
//
// Fire-and-forget, same real posture as dispatchReferralIfApplicable
// above — a real failure resolving/persisting this must never block
// the batch's own, already-successful completion.
async function transitionSlidesToReadyForScreeningIfApplicable(batch: Batch): Promise<void> {
  if (batch.processingNode !== 'Cytology Staining') return;
  try {
    // Real, deliberate per-case grouping — several items in the same
    // rack batch commonly belong to the same case (or even the same
    // specimen), and each needs its own real caseRouter.updateCase
    // call, not one call per item racing against itself.
    const byCase = new Map<string, { caseId: string; specimens: any[] }>();
    for (const item of batch.items) {
      const resolved = await resolveMaterialFromScan(item.displayId);
      if (!resolved) continue;
      const entry = byCase.get(resolved.caseData.id) ?? { caseId: resolved.caseData.id, specimens: (resolved.caseData.specimens as any[]) ?? [] };
      entry.specimens = entry.specimens.map((sp: any) => {
        if (sp.label !== resolved.specimenLetter) return sp;
        const updateStain = (stain: any) => stain.displayId === item.displayId ? { ...stain, status: 'Ready for Review' } : stain;
        return {
          ...sp,
          blocks: (sp.blocks ?? []).map((b: any) => ({ ...b, stains: (b.stains ?? []).map(updateStain) })),
          decants: (sp.decants ?? []).map((d: any) => ({ ...d, stains: (d.stains ?? []).map(updateStain) })),
        };
      });
      byCase.set(resolved.caseData.id, entry);
    }
    for (const { caseId, specimens } of byCase.values()) {
      try {
        await caseRouter.updateCase(caseId, { specimens } as any);
      } catch (e) {
        if (e instanceof ConcurrencyConflictError) {
          await caseRouter.updateCase(caseId, { specimens } as any);
        } else {
          throw e;
        }
      }
    }
    mockAuditService.logEvent({
      type: 'system', event: 'Cytology Staining Batch Complete — Slides Ready for Screening',
      detail: `Batch ${batch.masterBarcode}: ${batch.items.length} slide(s) transitioned to Ready for Review.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
  } catch (e) {
    console.error('[Batch] Failed to transition slides to Ready for Screening on Cytology Staining completion:', e);
  }
}

// Real, additive — per 'Cytology Imaging' (imager batch), closing the
// Story 10 gap: "mockAiScreeningResultService.order() had no real
// callers." This is that real caller. One order per distinct
// specimen (never per slide) — a real AI screening product screens a
// specimen's slide(s) as one unit, not once per individual slide in
// the imaging batch.
//
// Real, deliberate default-vendor resolution: no explicit "default
// vendor" flag exists anywhere in the DP Vendor Dictionary
// (services/digitalPathology/mockDpVendorService.ts) — resolves via
// getByModality('cervical_cytology'), which already returns only
// active vendors sorted by sortOrder, and takes the first. Today that
// resolves to Hologic Genius (sortOrder 5), the same real vendor
// Part 2b's own instrument trigger targets — not a hardcoded vendor
// ID, so this adapts automatically if the Dictionary's own
// configuration changes. Skips honestly (logs, never throws) if no
// active cervical_cytology vendor is configured at all.
async function triggerAiScreeningOrderIfApplicable(batch: Batch): Promise<void> {
  if (batch.processingNode !== 'Cytology Imaging') return;
  try {
    const vendorRes = await mockDpVendorService.getByModality('cervical_cytology');
    const vendorId = vendorRes.ok ? vendorRes.data[0]?.id : undefined;
    if (!vendorId) {
      mockAuditService.logEvent({
        type: 'system', event: 'Cytology Imaging Batch Complete — AI Screening Order Skipped',
        detail: `Batch ${batch.masterBarcode}: no active cervical_cytology AI vendor configured — no screening order placed.`,
        user: 'System', caseId: null, confidence: null,
      }).catch(() => {});
      return;
    }

    const ordered = new Set<string>(); // `${caseId}:${specimenId}` — real de-dup, one order per specimen
    for (const item of batch.items) {
      const resolved = await resolveMaterialFromScan(item.displayId);
      if (!resolved) continue;
      const specimen = ((resolved.caseData.specimens as any[]) ?? []).find((sp: any) => sp.label === resolved.specimenLetter);
      if (!specimen) continue;
      const key = `${resolved.caseData.id}:${specimen.id}`;
      if (ordered.has(key)) continue;
      ordered.add(key);
      await mockAiScreeningResultService.order({
        caseId: resolved.caseData.id,
        specimenId: specimen.id,
        vendorId,
        orderedAt: new Date().toISOString(),
      });
    }
    mockAuditService.logEvent({
      type: 'system', event: 'Cytology Imaging Batch Complete — AI Screening Ordered',
      detail: `Batch ${batch.masterBarcode}: AI screening ordered for ${ordered.size} specimen(s).`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
  } catch (e) {
    console.error('[Batch] Failed to order AI screening on Cytology Imaging completion:', e);
  }
}

// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap: dispatches the real outbound
// manifest and creates the real tracking record the moment an
// 'External Referral' batch genuinely completes reconciliation —
// "Automated creation of outgoing referral manifests," per that
// gap's own wording, not a separate, manual trigger a tech has to
// remember to click. Fire-and-forget: a real referral-side failure
// must never block the batch's own, already-successful reconciliation
// completion, the same real posture the rack-release call above
// already takes.
function dispatchReferralIfApplicable(batch: Batch): void {
  if (batch.processingNode !== 'External Referral') return;
  if (!batch.referralDestinationFacilityId) return;
  try {
    const payload = buildReferralManifestPayload(batch);
    mockReferralOutboundQueueService.enqueue({ batchId: batch.id, payload }).catch(() => {});
    mockReferralTrackingService.createOnDispatch(batch.id).catch(() => {});
  } catch {
    // Real, honest no-op: buildReferralManifestPayload's own real
    // guard clauses (wrong node, missing destination) are already
    // checked above; this catch exists only for a genuinely
    // unexpected failure, which must never block the batch's own
    // completion.
  }
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
      referralDestinationFacilityId: draft.processingNode === 'External Referral' ? draft.referralDestinationFacilityId : undefined,
      referralTestRequested: draft.processingNode === 'External Referral' ? draft.referralTestRequested : undefined,
      cytologyStainTypeId: draft.processingNode === 'Cytology Staining' ? draft.cytologyStainTypeId : undefined,
      stainingReagentLotIds: draft.processingNode === 'Staining' ? draft.stainingReagentLotIds : undefined,
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

    // Real, per PS-289/PS-292's own "batch-manifest scanning with
    // automatic control-slide appending" piece — for every real
    // reagent lot selected for this new 'Staining' batch whose own
    // stain requires an auto-appended control (shouldAutoAppendControl.ts),
    // and isn't already represented in this same, brand-new batch
    // (trivially true at creation, but checked the same real way a
    // later addition would be, for forward compatibility), create and
    // append one real control item now. Never blocks batch creation
    // on a failure here — a reagent lot that fails to resolve, or a
    // stain type that no longer exists, is a real, separate data
    // problem the tech's own physical batch creation must not be
    // held hostage to.
    if (batch.processingNode === 'Staining' && batch.stainingReagentLotIds && batch.stainingReagentLotIds.length > 0) {
      for (const reagentLotId of batch.stainingReagentLotIds) {
        try {
          const lotRes = await mockReagentLotService.getById(reagentLotId);
          if (!lotRes.ok || !lotRes.data.stainTypeId) continue;
          const stainTypesRes = await mockStainTypeService.getAll();
          if (!stainTypesRes.ok) continue;
          const stainType = stainTypesRes.data.find(s => s.id === lotRes.data.stainTypeId);
          if (!stainType || !shouldAutoAppendControl(stainType)) continue;
          if (await batchHasControlForLot(batch, reagentLotId)) continue;

          let facilityId = 'unknown';
          if (draft.stationId) {
            const stationRes = await mockScanStationService.getById(draft.stationId);
            if (stationRes.ok) facilityId = stationRes.data.facilityId;
          }
          const { caseData, slideId } = await createControlSlideCase(lotRes.data, stainType, facilityId);
          batch.items.push({
            id: genId('batch-item'), materialType: 'slide', displayId: slideId,
            caseAccession: caseData.accession.fullAccession,
            specimenLabel: 'A', addedAt: new Date().toISOString(),
            addedByUserId: 'system', addedByUserName: 'System (auto-appended control)',
          });
        } catch {
          // Real, deliberate silent skip — see this block's own header.
        }
      }
    }

    batches.push(batch);
    saveBatches(batches);
    mockAuditService.logEvent({
      type: 'system', event: 'Batch Created',
      detail: `Batch ${batch.masterBarcode} created — ${batch.processingNode}, protocol "${batch.protocol}", ${batch.priority}.`,
      user: draft.createdByUserName, caseId: null, confidence: null,
    }).catch(() => {});
    // Real, per the Protocol-Driven Workflow Infrastructure story's
    // Part 2b instrument trigger — "at cytology batch creation,
    // enqueues 'order.instrument' for the Hologic processor." Fire-
    // and-forget, same real posture as every other outbound dispatch
    // in this app: a real queueing failure here must never block the
    // batch's own, already-successful creation.
    if (batch.processingNode === 'Cytology Processing') {
      mockMolecularOrderOutboundQueueService.enqueue({
        eventType: 'order.instrument',
        payload: { masterBarcode: batch.masterBarcode, instrumentVendor: 'Hologic' },
      }).catch(console.error);
    }
    return { ok: true, data: batch };
  },

  async addItemByScan(batchId: ID, scannedValue: string, byUserId: string, byUserName: string, fovCount?: number): Promise<AddItemOutcome> {
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
      // Real, additive — per BatchItem.fovCount's own doc comment:
      // only ever meaningful on a 'Cytology Imaging' batch. A caller
      // passing fovCount on any other node is silently ignored here
      // rather than stored as meaningless data.
      fovCount: batch.processingNode === 'Cytology Imaging' ? fovCount : undefined,
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
    // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
    // Laboratory Sensor & Cold-Chain Integration gap — "workflow hold
    // triggers if transit temperature exceeds defined parameters."
    // Same real "hard stop, supervisor override available" posture as
    // the two checks immediately above.
    if (batch.coldChainExcursion && !batch.coldChainExcursion.acknowledgedAt) {
      return { ok: false, error: `A real cold-chain excursion (${batch.coldChainExcursion.temperatureCelsius}°C, detected ${batch.coldChainExcursion.detectedAt}) has not been acknowledged. Acknowledge it or use a supervisor override.` };
    }

    const updatedBatch: Batch = { ...batch, status: 'complete', completedAt: new Date().toISOString() };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    dispatchReferralIfApplicable(updatedBatch);
    transitionSlidesToReadyForScreeningIfApplicable(updatedBatch).catch(() => {});
    triggerAiScreeningOrderIfApplicable(updatedBatch).catch(() => {});
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
    dispatchReferralIfApplicable(updatedBatch);
    transitionSlidesToReadyForScreeningIfApplicable(updatedBatch).catch(() => {});
    triggerAiScreeningOrderIfApplicable(updatedBatch).catch(() => {});
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

  async setColdChainExcursion(batchId: ID, readingId: string, temperatureCelsius: number, detectedAt: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.coldChainExcursion && !batch.coldChainExcursion.acknowledgedAt) {
      return { ok: false, error: `Batch ${batch.masterBarcode} already has an unacknowledged cold-chain excursion on file — acknowledge it before recording a new one.` };
    }
    const updatedBatch: Batch = { ...batch, coldChainExcursion: { detectedAt, readingId, temperatureCelsius } };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'Cold-Chain Excursion Detected',
      detail: `Batch ${batch.masterBarcode}: real cold-chain excursion detected at ${temperatureCelsius}°C (reading ${readingId}). Batch completion blocked until acknowledged.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async acknowledgeColdChainExcursion(batchId: ID, byUserId: string, byUserName: string, note: string): Promise<ServiceResult<Batch>> {
    if (!note.trim()) return { ok: false, error: 'A real note is required to acknowledge a cold-chain excursion.' };
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (!batch.coldChainExcursion) return { ok: false, error: `Batch ${batch.masterBarcode} has no real cold-chain excursion on file.` };
    const updatedBatch: Batch = {
      ...batch,
      coldChainExcursion: {
        ...batch.coldChainExcursion,
        acknowledgedAt: new Date().toISOString(), acknowledgedByUserId: byUserId, acknowledgedByUserName: byUserName, acknowledgedNote: note.trim(),
      },
    };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'user', event: 'Cold-Chain Excursion Acknowledged',
      detail: `Batch ${batch.masterBarcode}: cold-chain excursion acknowledged. Note: ${note.trim()}`,
      user: byUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  // Real, additive — per 'Cytology Processing' (CytologyInstrumentStatus's
  // own doc comment, IBatchService.ts). Called by
  // processInboundCytologyInstrumentStatusEvent.ts the moment the
  // ThinPrep instrument reports a real status transition.
  async setCytologyInstrumentStatus(batchId: ID, status): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.processingNode !== 'Cytology Processing') {
      return { ok: false, error: `Batch ${batch.masterBarcode} is a '${batch.processingNode}' batch, not 'Cytology Processing' — instrument status only applies to a ThinPrep processor batch.` };
    }
    const updatedBatch: Batch = { ...batch, cytologyInstrumentStatus: status };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'Cytology Instrument Status Update',
      detail: `Batch ${batch.masterBarcode} (Cytology Processing): instrument reports '${status}'.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updatedBatch };
  },

  async setStainingInstrumentStatus(batchId: ID, status): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.processingNode !== 'Staining') {
      return { ok: false, error: `Batch ${batch.masterBarcode} is a '${batch.processingNode}' batch, not 'Staining' — instrument status only applies to a Staining batch.` };
    }
    const updatedBatch: Batch = { ...batch, stainingInstrumentStatus: status };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'Staining Instrument Status Update',
      detail: `Batch ${batch.masterBarcode} (Staining): instrument reports '${status}'.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});

    // Real, per the original Stain QC Module spec's own §2.4 — a
    // real, confirmed run failure auto-raises a real deficiency
    // against every real specimen this batch's own items belong to,
    // never left for a human to notice and raise by hand (unlike
    // def-missing-fixation-completion's own deliberately manual
    // posture) — a known instrument failure is a real, conclusive
    // signal already in hand the moment it's received.
    if (status === 'Run Failed') {
      const affectedAccessions = [...new Set((batch.items ?? []).map(i => i.caseAccession))];
      for (const accession of affectedAccessions) {
        const caseData = await caseRouter.getCase(accession);
        if (!caseData) continue;
        const specimenLabels = [...new Set((batch.items ?? []).filter(i => i.caseAccession === accession).map(i => i.specimenLabel).filter((l): l is string => !!l))];
        const targets = specimenLabels.length > 0 ? specimenLabels : [undefined];
        for (const specimenLabel of targets) {
          const specimen = specimenLabel ? (caseData.specimens ?? []).find(sp => sp.label === specimenLabel) : undefined;
          await mockSpecimenDeficiencyService.raise({
            caseId: caseData.id,
            specimenId: specimen?.id,
            specimenLabel,
            deficiencyTypeId: 'def-stain-batch-failed',
            comment: `Automated stainer reported 'Run Failed' for batch ${batch.masterBarcode}.`,
            raisedBy: 'system',
          }).catch(() => {});
        }
      }
    }

    return { ok: true, data: updatedBatch };
  },

  async confirmQcVisualRead(batchId: ID, userId: string, userName: string): Promise<ServiceResult<Batch>> {
    const batches = loadBatches();
    const batch = findBatch(batches, batchId);
    if (!batch) return { ok: false, error: `No batch found with id "${batchId}".` };
    if (batch.processingNode !== 'Staining') {
      return { ok: false, error: `Batch ${batch.masterBarcode} is a '${batch.processingNode}' batch, not 'Staining' — the QC visual read checklist only applies to a Staining batch.` };
    }
    const updatedBatch: Batch = { ...batch, qcVisualReadConfirmation: { userId, userName, confirmedAt: new Date().toISOString() } };
    saveBatches(batches.map(b => b.id === batchId ? updatedBatch : b));
    mockAuditService.logEvent({
      type: 'system', event: 'QC Visual Read Confirmed',
      detail: `Batch ${batch.masterBarcode} (Staining): visual read checklist confirmed by ${userName}.`,
      user: userId, caseId: null, confidence: null,
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
