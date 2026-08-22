// src/services/batches/IBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "LIS Batch Management
// module... tracks groups of cassettes and slides through laboratory
// processing nodes (Processor, Embedding, Staining, Cover-slipping,
// Storage) using container barcodes."
//
// Deliberately built ON TOP OF real, already-existing infrastructure,
// confirmed by direct investigation before writing this file, not
// duplicated:
//   - ScannerProvider (contexts/ScannerProvider.tsx) already provides a
//     real, global, no-focus-required scan detector (the spec's own
//     "Continuous Scanning... hands-free... auto-accept input without
//     requiring UI refocusing") — this module listens to the same real
//     PATHSCRIBE_SCAN event, it doesn't reinvent scan detection.
//   - useGlobalMaterialScanTracking already resolves a scanned cassette/
//     slide barcode back to a real case/specimen/block/slide and records
//     a real MaterialLocation event via processMaterialLocationEvent —
//     this module's own addItemByScan() reuses that exact same real
//     resolution logic (see resolveMaterialFromScan.ts) rather than
//     re-deriving it a second, independently-maintained way.
//   - playScanBeep.ts already provides the spec's own "distinct high-tone
//     sound for successful item additions" — this module adds the
//     missing sibling, playScanErrorTone(), for the spec's own "low-tone
//     warning for errors or protocol mismatches."
//   - QualityAssurancePage.tsx / specimenDeficiencyService already
//     implement a real, ISO 15189:2022-compliant nonconformance
//     lifecycle (Open -> Pending Verification -> Closed) spanning
//     several real sources via tabs — the spec's own "QA Incident
//     Ticket" is a new SOURCE feeding that same, real system (see
//     services/batches/batchQaBridge.ts), not a second, competing
//     ticket system.
//
// What's genuinely new here: the BATCH grouping concept itself — a
// master barcode representing one physical carrier (processor basket,
// stainer rack) holding many real cassettes/slides — plus its own
// manifest, protocol validation, and scan-out reconciliation
// (Matched/Missing/Unexpected) against that manifest.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

/** Real, named laboratory processing nodes. Confirmed directly per
 *  follow-up: "Grossing, Processing, Embedding, Microtomy, Checkout -
 *  I may have missed some" — aligned to this app's own, already-
 *  established real workflow-stage vocabulary (ScanStation's own
 *  SCAN_STATION_WORKFLOW_STAGES: Accessioning -> Grossing ->
 *  Processing -> Embedding -> Microtomy/Sectioning -> Staining ->
 *  Slide Archival) rather than the original feature spec's own,
 *  different wording ("Processor, Embedding, Staining, Cover-slipping,
 *  Storage") — one real, shared vocabulary for "what stage is this
 *  material at" across the whole app, not two competing lists. Kept
 *  Staining (a real, distinct lab step, not one to silently drop);
 *  Checkout is the batch-specific completion/reconciliation stage —
 *  the spec's own "Out-of-Process Verification" step — genuinely new
 *  to this vocabulary, not an existing ScanStation stage renamed.
 *  Kept as a closed set (not free text) — a batch's own processing
 *  node drives real, specific behavior downstream, unlike a scan
 *  station's location name, which is purely descriptive. */
export const BATCH_PROCESSING_NODES = [
  'Grossing', 'Processing', 'Embedding', 'Microtomy', 'Staining', 'Checkout',
] as const;
export type BatchProcessingNode = typeof BATCH_PROCESSING_NODES[number];

export type BatchPriority = 'STAT' | 'Routine';

/**
 * active       — accepting scanned items, normal work in progress.
 * reconciling  — the tech has scanned the master barcode to begin
 *                out-of-process verification; items are being scanned
 *                out and matched against the manifest.
 * complete     — every item reconciled Matched (or a supervisor
 *                override was recorded) — the spec's own "hard stop
 *                gatekeeper": a batch can never reach this status any
 *                other way.
 * aborted      — a real, deliberate stop before completion (e.g. a
 *                failed processor run) — kept, not deleted, per the
 *                spec's own "Compliance & Audit Logging" requirement.
 */
export type BatchStatus = 'active' | 'reconciling' | 'complete' | 'aborted';

export type BatchItemMaterialType = 'block' | 'slide';

/** Set only once reconciliation has looked at this specific item —
 *  undefined for the whole normal, active-scanning lifetime of a
 *  batch, matching the spec's own "Matched, Missing, or Unexpected/
 *  Extra" three-way real outcome. */
export type BatchItemReconciliationStatus = 'matched' | 'missing';

export interface BatchItem {
  id: ID;
  materialType: BatchItemMaterialType;
  /** Real, existing cassette/slide identifier (cassetteIdentifier()/
   *  slideIdentifier() shape, e.g. "S26-4403-A1" or "S26-4403-A1-L1")
   *  — the same real ID this app's own material tree/tracking already
   *  resolves against; never a second, batch-local numbering scheme. */
  displayId: string;
  caseAccession: string;
  specimenLabel: string;
  addedAt: string;
  addedByUserId: string;
  addedByUserName: string;
  reconciliationStatus?: BatchItemReconciliationStatus;
}

/** A real, extra item scanned out during reconciliation that never
 *  matched anything in the batch's own manifest — the spec's own
 *  "Unexpected/Extra." Kept as its own real record (not forced into
 *  BatchItem, which represents something that was genuinely added to
 *  the batch) so an extra scan's own real provenance (who scanned it,
 *  when) is preserved even though it was never part of this batch. */
export interface BatchUnexpectedScan {
  id: ID;
  scannedDisplayId: string;
  at: string;
  byUserId: string;
  byUserName: string;
}

export interface BatchOverride {
  byUserId: string;
  byUserName: string;
  reason: string;
  at: string;
}

export interface Batch {
  id: ID;
  /** The real, printable value encoded on the physical carrier's own
   *  Master Batch Barcode label — what a tech actually scans to look
   *  this batch up on any workstation. */
  masterBarcode: string;
  processingNode: BatchProcessingNode;
  /** Free text — real run/protocol name, e.g. "Standard H&E Overnight
   *  Run." Same real, honest reasoning as every other free-text
   *  protocol/vocabulary field elsewhere in this app (MaterialLocation.
   *  location, ScanStation.workflowStage, etc.) — real site protocol
   *  naming varies too much for a closed enum to stay accurate. */
  protocol: string;
  priority: BatchPriority;
  status: BatchStatus;
  items: BatchItem[];
  unexpectedScans: BatchUnexpectedScan[];
  stationId?: string;
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
  reconciliationStartedAt?: string;
  reconciliationStartedByUserId?: string;
  reconciliationStartedByUserName?: string;
  completedAt?: string;
  abortedAt?: string;
  abortReason?: string;
  /** Set only when a supervisor has overridden a real, still-open
   *  discrepancy to force completion — the spec's own "supervisor-
   *  overridden" escape hatch. Never silently applied; see
   *  IBatchService.overrideAndComplete's own doc comment. */
  override?: BatchOverride;
}

/** Real, honest outcome of a single scanned item during active
 *  (non-reconciliation) scanning — distinct possible reasons a scan
 *  didn't simply succeed, per the spec's own "Protocol Validation...
 *  raising an immediate audio-visual alert if an incompatible
 *  specimen is added." */
export type AddItemOutcome =
  | { outcome: 'added'; batch: Batch; item: BatchItem }
  | { outcome: 'already-in-batch'; reason: string }
  | { outcome: 'in-other-active-batch'; reason: string; otherBatchId: ID; otherMasterBarcode: string }
  | { outcome: 'not-found'; reason: string };

export interface IBatchService {
  getAll(): Promise<ServiceResult<Batch[]>>;
  getById(id: ID): Promise<ServiceResult<Batch>>;
  getByMasterBarcode(barcode: string): Promise<ServiceResult<Batch>>;
  create(draft: {
    processingNode: BatchProcessingNode;
    protocol: string;
    priority: BatchPriority;
    stationId?: string;
    createdByUserId: string;
    createdByUserName: string;
  }): Promise<ServiceResult<Batch>>;
  /** Real, central add-item path — resolves `scannedValue` against
   *  this app's own real material tree (via resolveMaterialFromScan.ts,
   *  the same resolution logic useGlobalMaterialScanTracking already
   *  uses) and checks it isn't already active in a DIFFERENT batch
   *  before adding — the spec's own "Protocol Validation... immediate
   *  ...alert if an incompatible specimen is added" starting point;
   *  richer, tissue-type-specific protocol rules are a real, later
   *  refinement once this app has a real tissue-type field to validate
   *  against (confirmed directly — none exists yet). */
  addItemByScan(batchId: ID, scannedValue: string, byUserId: string, byUserName: string): Promise<AddItemOutcome>;
  removeItem(batchId: ID, itemId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>>;
  startReconciliation(batchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>>;
  /** Real out-of-process verification scan — matches `scannedValue`
   *  against this batch's own manifest. A match marks that item
   *  'matched'; no match records a real BatchUnexpectedScan instead
   *  (the spec's own "Unexpected/Extra"). */
  scanItemOut(batchId: ID, scannedValue: string, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>>;
  /** The spec's own "Hard Stop Gatekeeper" — real, enforced server-
   *  side (not just a disabled button): fails with a real, honest
   *  error if any item is still missing/unmatched or any unexpected
   *  scan is unresolved, rather than silently completing anyway. */
  completeReconciliation(batchId: ID): Promise<ServiceResult<Batch>>;
  /** The spec's own "supervisor-overridden" escape hatch — completes
   *  the batch despite real, open discrepancies, but only with a
   *  real, required reason, and always recorded (BatchOverride) —
   *  never a silent bypass. */
  overrideAndComplete(batchId: ID, byUserId: string, byUserName: string, reason: string): Promise<ServiceResult<Batch>>;
  abort(batchId: ID, byUserId: string, byUserName: string, reason: string): Promise<ServiceResult<Batch>>;
}
