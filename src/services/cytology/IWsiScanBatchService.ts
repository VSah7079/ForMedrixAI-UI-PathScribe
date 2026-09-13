// src/services/cytology/IWsiScanBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on Cytology Assisted Instrumentation:
// "wsi also includes status updates that should be raised to
// worklist with a new Tile that would exclusively show cases were
// the scans have been completed. The interface engine would be
// involved with managing the bidirectional transactions. There are
// batch operations involved as well as the lab put slides into the
// scanner instruments and then unload it."
//
// Real, deliberate reuse of an already-proven shape: this entity
// mirrors MolecularBatch's own real lifecycle
// (services/molecular/IMolecularBatchService.ts) directly — a real,
// physical batch of slides loaded into one real instrument at once,
// dispatched, and later unloaded once every real slide has either
// scanned successfully or failed. The same real "one batch, many
// real, independent slide-level outcomes" shape that batch's own
// wells[] already established, not a new pattern invented for this.
//
// Real, bidirectional split, per direct guidance's own explicit
// requirement — mirrors this app's own already-proven "PathScribe
// publishes/ingests its own specification; the real interface engine
// owns the actual instrument protocol" split (HPV results, molecular
// batch results, dispatchMolecularWorklist.ts):
// - Outbound: buildWsiScanBatchManifestPayload.ts — PathScribe tells
//   the real interface engine which real cases/specimens are loaded,
//   once a tech has set up the batch here and physically loaded the
//   real slides.
// - Inbound: WsiScanStatusUpdateEventPayload.ts /
//   processInboundWsiScanStatusUpdateEvent.ts — the real scanner's own
//   real status updates (per real slide — loading, scanning,
//   completed, failed) come back as this app's own real, honest,
//   already-translated event shape.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type WsiScanBatchStatus = 'loaded' | 'scanning' | 'completed' | 'failed' | 'unloaded';
export type WsiSlideScanStatus = 'pending' | 'scanning' | 'completed' | 'failed';

export interface WsiScanSlide {
  slidePosition: string;
  caseId: string;
  specimenId: string;
  scanStatus: WsiSlideScanStatus;
  scanCompletedAt?: string;
  failureReason?: string;
}

export interface WsiScanBatch {
  id: ID;
  batchBarcode: string;
  scannerInstrumentId: string;
  status: WsiScanBatchStatus;
  slides: WsiScanSlide[];
  loadedAt: string;
  dispatchedAt?: string;
  unloadedAt?: string;
}

export type NewWsiScanBatch = Omit<WsiScanBatch, 'id' | 'batchBarcode' | 'status' | 'loadedAt'>;

export interface IWsiScanBatchService {
  getAll(): Promise<ServiceResult<WsiScanBatch[]>>;
  getById(id: ID): Promise<ServiceResult<WsiScanBatch>>;
  create(batch: NewWsiScanBatch): Promise<ServiceResult<WsiScanBatch>>;
  /** Real, per this file's own header — marks a real, already-created
   *  batch as dispatched (the real manifest sent to the interface
   *  engine), setting `dispatchedAt` and moving status to 'scanning'.
   *  Real, honest refusal if the batch is not currently 'loaded'. */
  markDispatched(id: ID): Promise<ServiceResult<WsiScanBatch>>;
  /** Real, per this file's own header — the real, physical "unload"
   *  action: marks the batch 'unloaded' once every real slide has
   *  reached a real, terminal per-slide outcome (completed or
   *  failed). Real, honest refusal if any real slide is still
   *  pending/scanning — the lab hasn't actually unloaded the real
   *  instrument yet if a real slide is still being scanned. */
  markUnloaded(id: ID): Promise<ServiceResult<WsiScanBatch>>;
  /** Real, per this file's own header — applies an already-translated
   *  inbound status update to one real slide within one real batch;
   *  never called from manual UI entry. */
  updateSlideStatus(batchId: ID, slidePosition: string, update: Pick<WsiScanSlide, 'scanStatus' | 'scanCompletedAt' | 'failureReason'>): Promise<ServiceResult<WsiScanBatch>>;
}
