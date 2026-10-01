// src/services/molecular/resolveMolecularWorklistPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §4.1 — a real, pure function
// building the exact outbound JSON shape from a real MolecularBatch
// (Phase 1/2's own entity). Real, deliberate pure-function shape,
// matching this module's own established posture — the real caller
// (a future outbound-dispatch service, not built in this phase) is
// responsible for actually sending this over the wire; this function
// only shapes it.
// ─────────────────────────────────────────────────────────────────────────────

import { MOLECULAR_PLATE_LAYOUTS } from './IMolecularBatchService';
import type { MolecularBatch } from './IMolecularBatchService';
import type { MolecularWorklistPayload, MolecularWorklistWellMapping } from '@/types/events/MolecularWorklistPayload';

export function resolveMolecularWorklistPayload(batch: MolecularBatch, now: Date = new Date()): MolecularWorklistPayload {
  const wellMappings: MolecularWorklistWellMapping[] = batch.wells
    .filter(w => w.sampleType !== undefined)
    .map(w => ({
      well_position: w.wellPosition,
      sample_type: w.sampleType!,
      // Real, per this file's own header: null, not undefined, for a
      // real control well — matching the given specification's own
      // worked example exactly.
      specimen_uuid: w.specimenUuid ?? null,
      control_info: w.controlInfo ? { control_id: w.controlInfo.controlId, expected_value: w.controlInfo.expectedValue } : undefined,
      accession_number: w.accessionNumber,
      container_barcode: w.containerBarcode,
      aliquot_volume_ul: w.aliquotVolumeUl,
    }));

  return {
    event_type: 'MOLECULAR_WORKLIST_CREATE',
    timestamp: now.toISOString(),
    batch_info: {
      batch_id: batch.batchBarcode,
      batch_uuid: batch.batchUuid,
      assay_code: batch.assayCode,
      assay_name: batch.assayName,
      target_instrument_id: batch.targetInstrumentId,
      deck_slot: batch.deckSlot,
    },
    plate_info: {
      plate_uuid: batch.plateUuid,
      plate_barcode: batch.plateBarcode,
      dimensions: MOLECULAR_PLATE_LAYOUTS[batch.plateLayout],
    },
    reagent_lots: batch.reagentLots.map(lot => ({
      component_type: lot.componentType,
      lot_number: lot.lotNumber,
      expiration_date: lot.expirationDate.slice(0, 10),
    })),
    well_mappings: wellMappings,
  };
}
