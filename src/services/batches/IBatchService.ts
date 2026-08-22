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
import type { ContainerType } from '../hardwareContainers/IHardwareContainerRegistryService';
import type { DecalSolutionType } from './DecalBatch';

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
 *  station's location name, which is purely descriptive.
 *
 *  Real fix, per direct follow-up: "We should be consistent with
 *  respect to the scan stations. I see a scan station belonging to a
 *  workload stage." Confirmed directly: 'Microtomy' here was a real,
 *  literal near-miss against ScanStation's own 'Microtomy / Sectioning'
 *  — same real concept, two slightly different strings — which is
 *  exactly the kind of drift that breaks the real, direct string
 *  matching NewContainerModal.tsx now does to derive a batch's own
 *  processing node from a selected station's own real workflowStage.
 *  Fixed to the exact same string a ScanStation record itself carries,
 *  not a re-abbreviated copy of it.
 *
 *  'Disposal' added, then removed, per direct follow-up: "I think
 *  disposal is the only workflow that demands this approach, building
 *  batches absolutely makes sense for the other workflow." Disposal
 *  now runs through its own, dedicated, queue-driven flow
 *  (services/retentionPolicy/computeDisposalQueue.ts) instead — a
 *  real, computed worklist of what's actually eligible, with direct
 *  scan-to-dispose and real-time mismatch feedback, not a manually-
 *  assembled container. Keeping 'Disposal' as a selectable batch node
 *  alongside that would leave two, parallel ways to accomplish the
 *  same irreversible action — a real, unnecessary safety/consistency
 *  risk, not a harmless option to leave in.
 *
 *  'Grossing' replaced with 'Decal / Special Processing' per direct
 *  follow-up: "Instead of a generic GROSSING batch node... update the
 *  processing node taxonomy to reflect actual lab operations."
 *  Grossing is real, but it's genuinely not a batch-container step in
 *  the sense every other node here is — it's where cassettes are
 *  first CREATED, not something pre-existing cassettes get scanned
 *  INTO a shared physical carrier for. Decal/special processing (bone,
 *  calcified tissue needing EDTA or rapid acid decal, or an extended
 *  fixation window) is a real, distinct, genuinely batch-able vessel
 *  stage that sits between Grossing and Processing — see
 *  DecalBatchAttributes below for its own real, additional fields. A
 *  Grossing-stage ScanStation simply won't auto-derive a processing
 *  node anymore (deriveNodeFromStation's own real, existing "no match,
 *  no guess" behavior in NewContainerModal.tsx — no code change
 *  needed there), same as any other station whose workflowStage was
 *  never a batch-container concept to begin with. */
export const BATCH_PROCESSING_NODES = [
  'Decal / Special Processing', 'Processing', 'Embedding', 'Microtomy / Sectioning', 'Staining', 'Checkout',
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

/** Real, architectural fix, per direct follow-up: "Batch Management:
 *  Scanning a cassette adds the matrixBlockId to the batch manifest
 *  once, correctly computing real physical unit counts for processor
 *  runs." A real matrix block checks into a batch as this one, real,
 *  distinct material type — never miscounted as an ordinary block. */
export type BatchItemMaterialType = 'block' | 'slide' | 'matrix_block' | 'matrix_slide' | 'specimen' | 'decant' | 'decant_slide';

/** Set only once reconciliation has looked at this specific item —
 *  undefined for the whole normal, active-scanning lifetime of a
 *  batch, matching the spec's own "Matched, Missing, or Unexpected/
 *  Extra" three-way real outcome. */
export type BatchItemReconciliationStatus = 'matched' | 'missing';

/** Real feature, per direct follow-up: "Is there a mechanism to move
 *  an asset from one container to the other?" A real, single record
 *  of one real transfer — every time this item moved from one batch
 *  to another via IBatchService.moveItem, not just the item's own
 *  addedAt/addedByUserName silently overwritten and its earlier
 *  history lost. */
export interface BatchItemTransfer {
  fromBatchId: ID;
  fromMasterBarcode: string;
  toBatchId: ID;
  toMasterBarcode: string;
  at: string;
  byUserId: string;
  byUserName: string;
}

export interface BatchItem {
  id: ID;
  materialType: BatchItemMaterialType;
  /** Real, existing cassette/slide identifier (cassetteIdentifier()/
   *  slideIdentifier() shape, e.g. "S26-4403-A1" or "S26-4403-A1-L1")
   *  — the same real ID this app's own material tree/tracking already
   *  resolves against; never a second, batch-local numbering scheme. */
  displayId: string;
  caseAccession: string;
  /** Real, architectural fix, per direct follow-up: undefined exactly
   *  when materialType === 'matrix_block' — a real matrix block
   *  doesn't belong to one specimen (see MatrixBlock.ts's own header),
   *  so there's no real, single specimen label to report here. */
  specimenLabel?: string;
  addedAt: string;
  addedByUserId: string;
  addedByUserName: string;
  reconciliationStatus?: BatchItemReconciliationStatus;
  /** Real, full transfer history — every real move this item has been
   *  through (IBatchService.moveItem). Empty/undefined for an item
   *  that's only ever been in the one batch it was originally scanned
   *  into — the common case, not something every item needs to carry. */
  transferHistory?: BatchItemTransfer[];
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
   *  this batch up on any workstation. Real, spec-defined prefix
   *  conventions per direct, detailed specification ("Container &
   *  Batch Label Management," FR-1.2): CONT-{TYPE}-{YYYYMMDD}-{XXXX}
   *  for a disposable label (Mode A), or the physical, laser-engraved
   *  RACK-{TYPE}-{NN} itself for a semi-permanent container (Mode B) —
   *  the same real identifier the physical hardware already carries,
   *  never a second, PathScribe-invented code for the same real rack. */
  masterBarcode: string;
  /** Real feature, per the same spec's own FR-1.2 "Container Type
   *  Selection." Optional — batches created before this feature
   *  existed, or created directly via the older, generic flow, never
   *  had a real container type; undefined there, never guessed. */
  containerType?: ContainerType;
  /** Mode A (disposable, timestamped label) vs Mode B (semi-permanent,
   *  reusable hardware) — the spec's own "Container Identifier Mode."
   *  Drives real, different downstream behavior: only 'semi_permanent'
   *  batches show the spec's own "Release Rack" action and check a
   *  real rack in/out of hardwareContainerRegistryService. */
  identifierMode?: 'disposable' | 'semi_permanent';
  /** Set only when identifierMode === 'semi_permanent' — the real,
   *  physical rack's own rackId (hardwareContainerRegistryService),
   *  currently checked out to this batch. */
  linkedRackId?: string;
  processingNode: BatchProcessingNode;
  /** Real feature, per direct, detailed specification: "Decal /
   *  Special Processing Batch Attributes." Both fields only meaningful
   *  when processingNode === 'Decal / Special Processing' — see
   *  DecalBatch.ts's own header. solutionType is a real, closed set
   *  (EDTA / Rapid Decal / 10% NBF fixation window) — the spec's own
   *  three named options, not open free text, since downstream alert
   *  timing depends on knowing which real solution is in use.
   *  targetDurationMinutes drives the real, live timer/alert
   *  (DecalBatch.ts's getDecalTimerState) — Batch.createdAt IS the
   *  real start timestamp (see that function's own doc comment for
   *  why this isn't a second, separate field). */
  solutionType?: DecalSolutionType;
  targetDurationMinutes?: number;
  /** Real feature, per the same spec's own "Transfer Action... a
   *  single tap moves the entire cassette batch out of Decal and into
   *  the standard PROCESSING queue." Set only on a Decal batch once
   *  transferred — points at the real, new Processing-node batch every
   *  item was bulk-moved into (IBatchService.transferToProcessing's
   *  own doc comment). The source Decal batch's own status moves to
   *  'complete' at the same time — its real job is done once every
   *  item has moved on. */
  transferredToBatchId?: string;
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
  /** Real feature, per direct, detailed specification ("Container &
   *  Batch Label Management," FR-1.2): Mode A (containerType +
   *  identifierMode: 'disposable') generates a real, new masterBarcode
   *  here (CONT-{TYPE}-{YYYYMMDD}-{XXXX}). Mode B (identifierMode:
   *  'semi_permanent' + a real rackId) uses that rack's OWN real,
   *  already-engraved identifier as masterBarcode directly, and
   *  atomically checks the real hardware out via
   *  hardwareContainerRegistryService — fails honestly (same real
   *  error hardwareContainerRegistryService.checkOut itself returns)
   *  if that rack is already checked out to a different active batch,
   *  rather than silently creating a second, conflicting session on
   *  the same physical rack. */
  create(draft: {
    processingNode: BatchProcessingNode;
    protocol: string;
    priority: BatchPriority;
    stationId?: string;
    createdByUserId: string;
    createdByUserName: string;
    containerType?: ContainerType;
    identifierMode?: 'disposable' | 'semi_permanent';
    /** Required when identifierMode === 'semi_permanent' — the real,
     *  scanned/selected rackId to check out. */
    rackId?: string;
    /** Both only meaningful (and only shown by NewContainerModal.tsx)
     *  when processingNode === 'Decal / Special Processing' — see
     *  Batch.solutionType/targetDurationMinutes's own doc comments. */
    solutionType?: DecalSolutionType;
    targetDurationMinutes?: number;
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
  /** Real feature, per direct follow-up: "Is there a mechanism to move
   *  an asset from one container to the other?" A real, single,
   *  atomic operation — not the same real outcome as a tech calling
   *  removeItem then addItemByScan themselves, which would produce two
   *  disconnected audit events with no link between them and would
   *  reset the item's own addedAt/addedByUserName as if it were newly
   *  discovered rather than moved. Both batches must be real and
   *  'active' — a still-open, in-progress state on both sides, not a
   *  batch already reconciling/complete/aborted on either end,
   *  otherwise the move could silently invalidate a reconciliation
   *  pass already in progress. Fails honestly (not silently) if the
   *  item is already present in the destination batch. */
  moveItem(fromBatchId: ID, itemId: ID, toBatchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<{ fromBatch: Batch; toBatch: Batch }>>;
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
  /** The spec's own FR-3.1 "[ 🔓 Release Rack ]" action pill — a real,
   *  explicit, manual release of a semi-permanent batch's own rack
   *  while the batch itself is still active/reconciling (e.g. the
   *  tech needs the physical rack for a different run before this
   *  batch is fully done). Clears linkedRackId/identifierMode's own
   *  hardware tie and checks the rack back in as Available — the
   *  batch record itself, and everything already scanned into it,
   *  is untouched; only the physical-hardware association ends. Only
   *  valid for identifierMode === 'semi_permanent' batches — fails
   *  honestly otherwise, rather than silently no-op-ing on a batch
   *  that never had a rack to release. Completion/abort/override also
   *  auto-release any still-checked-out rack on their own, real,
   *  successful paths — this exists for the real, separate "I need
   *  the rack back before the batch itself is done" case. */
  releaseRack(batchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<Batch>>;
  /** Real feature, per direct, detailed specification: "Transfer
   *  Action... a single tap moves the entire cassette batch out of
   *  Decal and into the standard PROCESSING queue for the overnight
   *  tissue processor run." A real, bulk, atomic operation — creates a
   *  brand-new 'Processing'-node batch (a fresh, real, disposable
   *  master barcode, same generation this app already uses elsewhere),
   *  moves every real item from the source Decal batch into it in one
   *  step, and marks the source batch 'complete' with
   *  transferredToBatchId set. Deliberately does NOT require a
   *  scan-out reconciliation pass first — the spec's own "single tap"
   *  wording, and there's no real ambiguity to reconcile against: this
   *  batch's own manifest already IS the complete, trusted record of
   *  what's physically in the vessel. Only valid on a real, 'active'
   *  batch whose processingNode is 'Decal / Special Processing' —
   *  fails honestly otherwise. */
  transferToProcessing(batchId: ID, byUserId: string, byUserName: string): Promise<ServiceResult<{ fromBatch: Batch; toBatch: Batch }>>;
}
