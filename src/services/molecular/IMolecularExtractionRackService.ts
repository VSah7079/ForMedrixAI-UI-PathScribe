// src/services/molecular/IMolecularExtractionRackService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Implement the load into extraction
// rack workflow step (§5.1's secondary_rack stage)." Confirmed
// directly against the given specification's own §2.2: "Physical
// tube rack holding input tubes prior to or during lysis/extraction"
// — a real, distinct physical object from a MolecularBatch's own
// plate (a rack holds raw specimen tubes pre-extraction; a plate
// holds prepared reactions). Kept as its own, separate entity rather
// than folded into MolecularBatch — a rack's own real lifecycle
// (loading tubes) happens independently of, and normally before, any
// specific batch/plate even being created, matching this project's
// own established "genuinely different real object, genuinely
// separate entity" reasoning (services/molecular/README.md's own
// architecture decision for Phase 1).
//
// Real, deliberate simplicity: a rack's own real positions are a flat,
// linear sequence (position "1" through "N"), not a row/column grid
// like a plate's own wells — matching how a real physical tube rack
// is actually laid out (a single row or a simple linear count),
// confirmed against the given specification's own §2.2 description,
// which names no grid/row/column concept for a rack the way §2.3
// explicitly does for a plate.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { MolecularMovementRecord } from './IMolecularBatchService';

export interface MolecularRackPosition {
  positionLabel: string; // e.g. '1', '2', ... 'N' — real, linear, per this file's own header
  specimenUuid?: string;
  accessionNumber?: string;
  containerBarcode?: string;
  /** Real, per §5.1 — the real movement(s) that placed this specific
   *  specimen at this position. Undefined for a genuinely empty
   *  position, never a fabricated empty array. */
  movementHistory?: MolecularMovementRecord[];
}

export interface MolecularExtractionRack {
  id: ID;
  rackBarcode: string; // RACK-MOLE-XXXXX
  rackUuid: string;
  capacity: number;
  positions: MolecularRackPosition[];
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
}

export type NewMolecularExtractionRack = Pick<MolecularExtractionRack, 'capacity' | 'createdByUserId' | 'createdByUserName'>;

export interface IMolecularExtractionRackService {
  getAll(): Promise<ServiceResult<MolecularExtractionRack[]>>;
  getById(id: ID): Promise<ServiceResult<MolecularExtractionRack>>;
  create(rack: NewMolecularExtractionRack): Promise<ServiceResult<MolecularExtractionRack>>;
  /** Real, per this file's own header (§5.1) — loads a real, scanned
   *  specimen into a specific real position on this rack, recording
   *  the real primary_vial → secondary_rack movement. Real, honest
   *  refusal (never overwrites) when the given position is already
   *  real and occupied — a real rack position holds exactly one real
   *  tube at a time. */
  loadSpecimenIntoPosition(
    rackId: ID,
    positionLabel: string,
    specimen: { specimenUuid?: string; accessionNumber?: string; containerBarcode: string },
    movement: MolecularMovementRecord,
  ): Promise<ServiceResult<MolecularExtractionRack>>;
  /** Real, per this file's own header — given a real, already-scanned
   *  container barcode, finds which rack (if any) and which position
   *  currently holds it. Real, honest null when the specimen was
   *  never racked (e.g. going straight from vial to plate well) —
   *  the plate builder's own scan-to-well flow uses this to decide
   *  whether a well's own movement should read
   *  secondary_rack → plate_well (racked first) or
   *  primary_vial → plate_well (not racked), matching what actually
   *  happened rather than assuming one or the other. */
  findPositionByContainerBarcode(containerBarcode: string): Promise<ServiceResult<{ rack: MolecularExtractionRack; position: MolecularRackPosition } | null>>;
}
