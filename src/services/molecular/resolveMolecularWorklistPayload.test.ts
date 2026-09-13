// src/services/molecular/resolveMolecularWorklistPayload.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularWorklistPayload } from './resolveMolecularWorklistPayload';
import type { MolecularBatch } from './IMolecularBatchService';

const SEEDED_BATCH: MolecularBatch = {
  id: 'mb-001',
  batchBarcode: 'BATCH-20260906-0042',
  batchUuid: 'e3b0c442-98fc-4c14-963b-944882006122',
  assayCode: 'HPV_HR_PCR',
  assayName: 'High-Risk HPV Real-Time PCR',
  targetInstrumentId: 'PANTHER_02',
  deckSlot: 'SLOT_A1',
  plateUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  plateBarcode: 'PLT-HPV-20260906-012',
  plateLayout: '96_well',
  reagentLots: [
    { componentType: 'MASTER_MIX', lotNumber: 'MM-2026-8812', expirationDate: '2027-01-15T00:00:00.000Z', qcStatus: 'signed_off' },
    { componentType: 'EXTRACTION_BUFFER', lotNumber: 'EX-2026-0034', expirationDate: '2026-11-30T00:00:00.000Z', qcStatus: 'signed_off' },
  ],
  wells: [
    { wellPosition: 'A01', sampleType: 'CONTROL_NTC', controlInfo: { controlId: 'NTC-LOT-441', controlLotNumber: 'NTC-LOT-441', controlExpirationDate: '2027-01-15T00:00:00.000Z', expectedValue: 'NEGATIVE' } },
    { wellPosition: 'A02', sampleType: 'CONTROL_PTC_HIGH', controlInfo: { controlId: 'PTC-LOT-902', controlLotNumber: 'PTC-LOT-902', controlExpirationDate: '2027-01-15T00:00:00.000Z', expectedValue: 'POSITIVE' } },
    { wellPosition: 'A03', sampleType: 'PATIENT_SPECIMEN', specimenUuid: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0', accessionNumber: 'PS26-100452', containerBarcode: 'SPEC-20260906-8831', aliquotVolumeUl: 200 },
    { wellPosition: 'A04' }, // real, unassigned well
  ],
  status: 'active',
  createdAt: '2026-09-06T16:47:35.000Z',
  createdByUserId: 'u1',
  createdByUserName: 'Test User',
};

describe('resolveMolecularWorklistPayload — real, per the given specification\'s own §4.1 worked example', () => {
  it('produces the real, correct event_type and batch_info fields exactly', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH, new Date('2026-09-06T16:47:35.000Z'));
    expect(payload.event_type).toBe('MOLECULAR_WORKLIST_CREATE');
    expect(payload.batch_info).toEqual({
      batch_id: 'BATCH-20260906-0042', batch_uuid: 'e3b0c442-98fc-4c14-963b-944882006122',
      assay_code: 'HPV_HR_PCR', assay_name: 'High-Risk HPV Real-Time PCR',
      target_instrument_id: 'PANTHER_02', deck_slot: 'SLOT_A1',
    });
  });

  it('produces the real, correct plate_info with real, derived dimensions from the plate layout', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH);
    expect(payload.plate_info).toEqual({
      plate_uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', plate_barcode: 'PLT-HPV-20260906-012',
      dimensions: { rows: 8, columns: 12 },
    });
  });

  it('produces the real, correct reagent_lots with dates trimmed to the real, given date-only format', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH);
    expect(payload.reagent_lots).toEqual([
      { component_type: 'MASTER_MIX', lot_number: 'MM-2026-8812', expiration_date: '2027-01-15' },
      { component_type: 'EXTRACTION_BUFFER', lot_number: 'EX-2026-0034', expiration_date: '2026-11-30' },
    ]);
  });

  it('a real control well correctly gets a null specimen_uuid, matching the given worked example exactly', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH);
    const ntc = payload.well_mappings.find(w => w.well_position === 'A01')!;
    expect(ntc.specimen_uuid).toBeNull();
    expect(ntc.control_info).toEqual({ control_id: 'NTC-LOT-441', expected_value: 'NEGATIVE' });
  });

  it('a real patient specimen well correctly carries every real specimen field', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH);
    const specimenWell = payload.well_mappings.find(w => w.well_position === 'A03')!;
    expect(specimenWell.specimen_uuid).toBe('a1b2c3d4-e5f6-7890-1234-56789abcdef0');
    expect(specimenWell.accession_number).toBe('PS26-100452');
    expect(specimenWell.container_barcode).toBe('SPEC-20260906-8831');
    expect(specimenWell.aliquot_volume_ul).toBe(200);
  });

  it('a real, genuinely unassigned well is correctly excluded from well_mappings, never sent as an empty/fabricated entry', () => {
    const payload = resolveMolecularWorklistPayload(SEEDED_BATCH);
    expect(payload.well_mappings.find(w => w.well_position === 'A04')).toBeUndefined();
    expect(payload.well_mappings).toHaveLength(3);
  });
});
