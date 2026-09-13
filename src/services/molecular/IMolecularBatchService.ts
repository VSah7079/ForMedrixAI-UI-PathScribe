// src/services/molecular/IMolecularBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "PathScribe Full
// Molecular Testing Execution Module" — extends this app's own
// existing sample-tracking and batching framework (services/batches/)
// to support Molecular Diagnostics workflows (HPV, CT/NG, Respiratory
// PCR panels, targeted NGS).
//
// Real, deliberate architecture decision, made after directly reading
// the existing Batch system (IBatchService.ts, 393 lines) and hardware
// container registry (IHardwareContainerRegistryService.ts) before
// writing a line of this file: genuinely reuses their real patterns —
// a master barcode representing one physical carrier, per-item audit
// fields (addedAt/addedByUserId/addedByUserName), a closed
// BatchStatus-style lifecycle — but is NOT folded into the existing
// Batch entity itself. A molecular plate's own spatial model (a 2D
// grid of wells, each holding either a real control or a real patient
// specimen at a specific row/column coordinate) has no analog in the
// existing BatchItem shape (a flat list of scanned items with no
// spatial/grid concept at all) — forcing the two together would
// distort a working, real system for Histology to accommodate a
// genuinely different real geometry, not simplify anything.
//
// This is Phase 1 of a real, multi-phase build (see this module's own
// README for the full phase breakdown) — the foundational entities,
// barcode/UUID generation, and reagent-lot gating rules every later
// phase (plate/well UI, JSON payload processing, barcode printing,
// audit trail wiring) depends on.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { MolecularWellResult, MolecularReviewStatus } from '@/types/events/MolecularRunResultsPayload';

// ── Plate geometry ──────────────────────────────────────────────────

/** Real, per the given specification's own three named grid sizes. A
 *  closed set, not free-form rows/columns — a plate's own real
 *  dimensions drive real, specific well-count/labeling behavior
 *  downstream, the same reasoning BatchProcessingNode (IBatchService.ts)
 *  already uses for keeping its own vocabulary closed. */
/** Real, direct expansion per real, cited ANSI/SLAS microplate
 *  standards, supplied directly: all standard SBS/ANSI/SLAS
 *  microplates share the same real outer footprint regardless of well
 *  density, and the well counts/grid configurations below are the
 *  real, standard formats actually used across molecular workflows.
 *  Real, deliberate scope limit — NOT included here: circular rotor
 *  formats (e.g. Qiagen Rotor-Gene) are a genuinely different physical
 *  geometry, not a rows×columns rectangular grid, and forcing them
 *  into this shape would misrepresent the real, physical layout
 *  rather than model it; a real, separate data model would be needed
 *  for those, not a new entry here. */
export const MOLECULAR_PLATE_LAYOUTS = {
  '6_well': { rows: 2, columns: 3 },
  '12_well': { rows: 3, columns: 4 },
  '24_well': { rows: 4, columns: 6 },
  '48_well': { rows: 6, columns: 8 },
  '96_well': { rows: 8, columns: 12 },
  '384_well': { rows: 16, columns: 24 },
  '1536_well': { rows: 32, columns: 48 },
  // Real, per direct guidance — low-density strip formats "very common
  // in clinical molecular labs running small specimen batches without
  // wasting a full 96-well plate." A real, single-row strip, not a
  // full rectangular plate — modeled honestly as rows: 1 rather than
  // approximated into an existing grid shape.
  '8_strip': { rows: 1, columns: 8 },
  '12_strip': { rows: 1, columns: 12 },
} as const;
export type MolecularPlateLayout = keyof typeof MOLECULAR_PLATE_LAYOUTS;

// ── Wells, samples, and controls ────────────────────────────────────

/** Real, per the given specification's own §3.2 "Dynamic Control
 *  Rules." PATIENT_SPECIMEN is the real, non-control case every well
 *  isn't necessarily one of the other four. */
export const MOLECULAR_SAMPLE_TYPES = [
  'CONTROL_NTC', 'CONTROL_PTC_HIGH', 'CONTROL_PTC_LOW', 'CALIBRATOR', 'PATIENT_SPECIMEN',
] as const;
export type MolecularSampleType = typeof MOLECULAR_SAMPLE_TYPES[number];

export interface MolecularControlInfo {
  controlId: string;
  controlLotNumber: string;
  controlExpirationDate: string;
  expectedValue: 'NEGATIVE' | 'POSITIVE';
}

/** Real, per the given specification's own §2.4 well identifier format
 *  (PLT-[UUID]:[Row][Col]) and §4.1 well_mappings shape. One real well
 *  is either a real control (controlInfo set, specimen fields
 *  undefined) or a real patient specimen (specimen fields set,
 *  controlInfo undefined) — never honestly both, and this module never
 *  fabricates one to fill in for a genuinely empty/unassigned well
 *  (wellPosition alone, sampleType undefined, is a real, legitimate
 *  "not yet mapped" state during manual layout). */
// ── Audit trail — Phase 8 ───────────────────────────────────────────

/** Real, per the given specification's own §5.1 "Complete Lifecycle
 *  Tracking": "Every sample movement (Primary Vial → Secondary Rack →
 *  Molecular Plate Well) is recorded with timestamp, User ID, and
 *  Station ID." A closed set matching the spec's own three named
 *  stages exactly. */
export type MolecularMovementLevel = 'primary_vial' | 'secondary_rack' | 'plate_well';

/** Real, deliberately mirroring this app's own already-established
 *  BatchItemTransfer shape (services/batches/IBatchService.ts) —
 *  timestamp + user id/name — with stationId/stationName added on top
 *  to match this specification's own explicit Station ID requirement,
 *  in the same real shape MaterialScanEventPayload.ts already uses
 *  (a real, admin-configured ScanStation reference, never free text). */
export interface MolecularMovementRecord {
  fromLevel: MolecularMovementLevel;
  toLevel: MolecularMovementLevel;
  fromBarcode: string;
  toBarcode: string;
  at: string;
  byUserId: string;
  byUserName: string;
  stationId: string;
  stationName: string;
}

export interface MolecularWell {
  wellPosition: string; // e.g. 'A01'
  sampleType?: MolecularSampleType;
  specimenUuid?: string;
  accessionNumber?: string;
  containerBarcode?: string;
  aliquotVolumeUl?: number;
  controlInfo?: MolecularControlInfo;
  /** Real, per this file's own §5.1 doc comment above — every real
   *  movement this specific well's own specimen has gone through.
   *  Undefined for a well with no real specimen scanned in yet, never
   *  a fabricated empty array standing in for "nothing happened." */
  movementHistory?: MolecularMovementRecord[];
}

// ── Reagent kit / lot tracking ──────────────────────────────────────

/** Real, per the given specification's own §3.3 "Multi-Part Kit
 *  Schema." A closed set — each real component type has its own real
 *  gating rule (below), so an open string here would let a caller
 *  invent a fifth kind of lot this module has no real gating logic
 *  for at all. */
// Real, direct correction, per direct follow-up: commercial Positive
// and Negative Control materials are real, lot-tracked consumables in
// molecular diagnostics, exactly like Master Mix or Extraction
// Buffer — under real CLIA/CAP requirements, a control's own lot
// number and expiration date must be logged for every real run, the
// same real requirement §3.3's own four component types already
// exist to satisfy. Added here, alongside them, rather than replacing
// anything — this is a real, separate, batch-level lot-tracking
// concern (one control lot used across a whole real run) from
// MolecularWell.controlInfo below (which well, if any, a control
// physically occupies) — both are real and both stay, matching a real
// lab's own practice of tracking control material inventory
// separately from where it gets pipetted on a given real plate.
export const MOLECULAR_REAGENT_COMPONENT_TYPES = [
  'EXTRACTION_BUFFER', 'MASTER_MIX', 'PRIMER_PROBE', 'DETECTION_REAGENT', 'POSITIVE_CONTROL', 'NEGATIVE_CONTROL',
] as const;
export type MolecularReagentComponentType = typeof MOLECULAR_REAGENT_COMPONENT_TYPES[number];

export type MolecularReagentQcStatus = 'signed_off' | 'pending' | 'failed';

export interface MolecularReagentLot {
  componentType: MolecularReagentComponentType;
  lotNumber: string;
  expirationDate: string;
  qcStatus: MolecularReagentQcStatus;
}

// ── The batch itself ────────────────────────────────────────────────

/** Real, per the given specification's own §2 UUID hierarchy — closed,
 *  matching this app's own established "real, specific lifecycle
 *  states drive real downstream behavior" reasoning
 *  (BatchStatus, IBatchService.ts). */
// Real, per direct guidance on why "Clone & Supersede" is the
// stronger choice over live-editing an already-created batch: real
// regulatory/audit integrity (a mutable batch breaks the 1:1 trail
// between a requested sample-to-well mapping and any executed
// results), real defensive architecture (live editing opens real edge
// cases like changing a well assignment mid-run), and a real, simpler
// implementation (no partial-state updates, no transactional
// rollbacks, no races with live instruments). 'superseded' is a real,
// terminal status — once set, a batch is never re-superseded again
// (see cloneAndSupersede's own real, one-shot enforcement below).
export type MolecularBatchStatus = 'draft' | 'active' | 'awaiting_results' | 'completed' | 'aborted' | 'superseded';

export interface MolecularBatch {
  id: ID;
  batchBarcode: string; // BATCH-YYYYMMDD-XXXX
  batchUuid: string;
  /** Real, per direct follow-up ("wouldn't we use the existing
   *  process catalog to define the assays?") — a real reference to
   *  StainType.id (services/stains/, this app's own existing,
   *  admin-managed "Diagnostic Catalog," category: 'Molecular'),
   *  never a free-typed string. Real, direct fix: was a genuinely
   *  disconnected, unvalidated string before this — the plate
   *  builder now selects from the real catalog directly, and
   *  assayName below is derived from that same selection's own
   *  StainType.name, not independently typed. */
  assayCode: string;
  assayName: string;
  targetInstrumentId: string;
  deckSlot?: string;
  plateUuid: string;
  plateBarcode: string; // PLT-[AssayCode]-YYYYMMDD-XXX
  plateLayout: MolecularPlateLayout;
  reagentLots: MolecularReagentLot[];
  wells: MolecularWell[];
  status: MolecularBatchStatus;
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
  /** Real, per the given specification's own §4.2 inbound payload —
   *  set once this batch's own real results are received
   *  (processInboundMolecularRunResults.ts). Undefined for the whole
   *  real lifetime of a batch before its run completes — never a
   *  fabricated empty array standing in for "no results yet." */
  results?: MolecularWellResult[];
  controlsPassed?: boolean;
  reviewStatus?: MolecularReviewStatus;
  /** Real, per §3.4/§4.1 — set once this batch's own real outbound
   *  worklist has actually been dispatched (dispatchMolecularWorklist.ts).
   *  Undefined for the whole real lifetime of a batch before that real
   *  dispatch happens — never a fabricated timestamp standing in for
   *  "not yet sent." */
  worklistDispatchedAt?: string;
  /** Real, per this file's own header on Clone & Supersede — set only
   *  on a real clone, pointing back to the real, original batch it
   *  was created from. Undefined for every batch created the normal
   *  way (create()) — never a fabricated self-reference. */
  clonedFromBatchId?: ID;
  /** Real, per this file's own header — set only once this specific
   *  batch has actually been superseded by a real clone; from that
   *  point on this batch is a real, terminal, immutable record of
   *  what was actually requested/executed at the time, kept for a
   *  real 1:1 audit trail rather than mutated in place. */
  supersededByBatchId?: ID;
  supersededAt?: string;
  supersededByUserId?: string;
  supersededByUserName?: string;
  /** Real, required justification for the real, explicit user action
   *  that invalidates this batch's own configuration — never a
   *  silent, unexplained status flip. */
  supersededReason?: string;
}

export type NewMolecularBatch = Omit<MolecularBatch, 'id' | 'batchBarcode' | 'batchUuid' | 'plateUuid' | 'plateBarcode' | 'status' | 'createdAt'>;

export interface IMolecularBatchService {
  getAll(): Promise<ServiceResult<MolecularBatch[]>>;
  getById(id: ID): Promise<ServiceResult<MolecularBatch>>;
  /** Real, per the given specification's own §3.3 "Gating Rules":
   *  rejected outright (never created) if any assigned reagent lot is
   *  expired, marked failed, or lacks active QC sign-off — see
   *  resolveMolecularReagentLotGating.ts for the real, shared check
   *  this also exposes standalone (a caller may want to validate
   *  before attempting creation, not only discover the rejection
   *  after). */
  create(batch: NewMolecularBatch): Promise<ServiceResult<MolecularBatch>>;
  /** Real, per Phase 3's own inbound results processing
   *  (processInboundMolecularRunResults.ts) — looked up by the real,
   *  stable batchUuid (the same real identifier both the outbound
   *  worklist payload and inbound results payload carry), not the
   *  internal id, since an external interface engine only ever knows
   *  the real UUID, never PathScribe's own internal record id. */
  updateByUuid(batchUuid: string, changes: Partial<MolecularBatch>): Promise<ServiceResult<MolecularBatch>>;
  /**
   * Real, per this file's own header on Clone & Supersede — the one
   * real, sanctioned way to change an already-created batch's own
   * configuration. Never mutates the original in place: creates a
   * real, new batch (through this same service's own real create(),
   * so the clone is gated by the exact same real reagent-lot and
   * dynamic-control-rule checks any new batch gets — never a
   * back-door around them), then marks the original as a real,
   * terminal 'superseded' record pointing forward to its own real
   * replacement. Real, deliberate carry-over rule: structural
   * configuration (assay, instrument, plate layout, reagent lots) and
   * control/calibrator well assignments (sampleType + controlInfo —
   * real reagent-lot metadata, not a scan event) carry over as a real
   * starting point; every patient-specimen assignment and every
   * well's own movementHistory resets to genuinely empty on the
   * clone, since a past scan event is a real fact about the original
   * batch's own run, not something honestly true of a batch that
   * hasn't been touched yet — a tech must actually re-scan every real
   * patient specimen for the new batch to earn its own real audit
   * trail. Real, honest refusal, never a partial state: if the real
   * create() call fails (e.g. a reagent lot has since expired), the
   * original is left completely untouched and this returns that same
   * real error. Real, one-shot enforcement: refuses outright if the
   * original is already superseded — no branching chains, one real,
   * linear trail per batch. `reason` is real and required — never an
   * unexplained status flip.
   */
  cloneAndSupersede(originalBatchId: ID, reason: string, byUserId: string, byUserName: string): Promise<ServiceResult<MolecularBatch>>;
}
