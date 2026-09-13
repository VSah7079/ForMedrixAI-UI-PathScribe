// src/types/events/MolecularWorklistPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given "Full Molecular Testing Execution Module"
// specification's own §4.1 "Outbound Worklist Payload (PathScribe →
// Interface Engine)" — the exact JSON shape that section specifies,
// field for field, including its own snake_case wire naming.
//
// Real, deliberate naming departure from this app's own usual camelCase
// convention for internal types (HpvResultEventPayload.ts,
// BlockExceptionEventPayload.ts): those files' own real specifications
// already used camelCase as PathScribe's own chosen wire shape. This
// specification's own worked JSON example uses snake_case throughout
// (event_type, batch_info, assay_code...) — matching it exactly here
// means a real interface engine integration can compare this file
// against the given specification byte-for-byte, rather than requiring
// a translation layer between two different naming conventions for the
// same real contract.
//
// Real, deliberate, minor extension beyond the given specification's
// own worked example: sample_type includes CONTROL_PTC_HIGH/
// CONTROL_PTC_LOW (matching this module's own Phase 1
// MolecularSampleType, IMolecularBatchService.ts) rather than only the
// worked example's own undifferentiated "CONTROL_PTC" — the same
// section's own §3.2 explicitly requires "Positive Control (High /
// Low)" as a real, distinct control type, so the wire shape needs to
// carry that real distinction even though the one worked example in
// §4.1 didn't happen to show it.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularReagentComponentType, MolecularSampleType } from '@/services/molecular/IMolecularBatchService';

export interface MolecularWorklistBatchInfo {
  batch_id: string;
  batch_uuid: string;
  assay_code: string;
  assay_name: string;
  target_instrument_id: string;
  deck_slot?: string;
}

export interface MolecularWorklistPlateInfo {
  plate_uuid: string;
  plate_barcode: string;
  dimensions: { rows: number; columns: number };
}

export interface MolecularWorklistReagentLot {
  component_type: MolecularReagentComponentType;
  lot_number: string;
  expiration_date: string;
}

export interface MolecularWorklistControlInfo {
  control_id: string;
  expected_value: 'NEGATIVE' | 'POSITIVE';
}

export interface MolecularWorklistWellMapping {
  well_position: string;
  sample_type: MolecularSampleType;
  /** Real, per the given specification's own worked example: null,
   *  not undefined, for a real control well — the wire contract's own
   *  explicit way of saying "there is genuinely no specimen here,"
   *  distinct from a field simply not being sent. */
  specimen_uuid: string | null;
  control_info?: MolecularWorklistControlInfo;
  accession_number?: string;
  container_barcode?: string;
  aliquot_volume_ul?: number;
}

export interface MolecularWorklistPayload {
  event_type: 'MOLECULAR_WORKLIST_CREATE';
  timestamp: string;
  batch_info: MolecularWorklistBatchInfo;
  plate_info: MolecularWorklistPlateInfo;
  reagent_lots: MolecularWorklistReagentLot[];
  well_mappings: MolecularWorklistWellMapping[];
}
