// src/services/molecular/resolveMolecularHistoricalTrace.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularHistoricalTrace } from './resolveMolecularHistoricalTrace';
import type { MolecularBatch } from './IMolecularBatchService';

const MOVEMENT = {
  fromLevel: 'primary_vial' as const, toLevel: 'plate_well' as const,
  fromBarcode: 'SPEC-20260907-00000001', toBarcode: 'well:A03',
  at: '2026-09-07T10:00:00.000Z', byUserId: 'u1', byUserName: 'Test Tech',
  stationId: 'station-1', stationName: 'Molecular Bench 1',
};

const BATCH: MolecularBatch = {
  id: 'mb-001', batchBarcode: 'BATCH-20260907-0001', batchUuid: 'uuid-1',
  assayCode: 'HPV_HR_PCR', assayName: 'High-Risk HPV Real-Time PCR', targetInstrumentId: 'PANTHER_02',
  deckSlot: 'SLOT_A1', plateUuid: 'plate-uuid-1', plateBarcode: 'PLT-HPV-20260907-001',
  plateLayout: '96_well',
  reagentLots: [{ componentType: 'MASTER_MIX', lotNumber: 'MM-1', expirationDate: '2027-01-01T00:00:00.000Z', qcStatus: 'signed_off' }],
  wells: [
    { wellPosition: 'A01', sampleType: 'CONTROL_NTC' },
    { wellPosition: 'A03', sampleType: 'PATIENT_SPECIMEN', specimenUuid: 'specimen-uuid-1', accessionNumber: 'PS26-100452', containerBarcode: 'SPEC-20260907-00000001', movementHistory: [MOVEMENT] },
  ],
  status: 'completed', createdAt: '2026-09-07T09:00:00.000Z',
  createdByUserId: 'u1', createdByUserName: 'Test Tech',
  results: [{ well_position: 'A03', specimen_uuid: 'specimen-uuid-1', accession_number: 'PS26-100452', raw_data: { ct_value: 22.4 }, interpretation: 'POSITIVE', flag: 'NONE' }],
};

describe('resolveMolecularHistoricalTrace — real, per the given specification\'s own §5.3', () => {
  it('a real, correct lookup by specimenUuid finds the full, correct trace', () => {
    const trace = resolveMolecularHistoricalTrace([BATCH], { specimenUuid: 'specimen-uuid-1' });
    expect(trace).not.toBeNull();
    expect(trace!.plateUuid).toBe('plate-uuid-1');
    expect(trace!.deckSlot).toBe('SLOT_A1');
    expect(trace!.targetInstrumentId).toBe('PANTHER_02');
    expect(trace!.reagentLots).toHaveLength(1);
    expect(trace!.createdByUserName).toBe('Test Tech');
  });

  it('a real, correct lookup by accessionNumber finds the same real trace', () => {
    const trace = resolveMolecularHistoricalTrace([BATCH], { accessionNumber: 'PS26-100452' });
    expect(trace).not.toBeNull();
    expect(trace!.wellPosition).toBe('A03');
  });

  it('the real trace includes the real movement history for that specific well', () => {
    const trace = resolveMolecularHistoricalTrace([BATCH], { accessionNumber: 'PS26-100452' });
    expect(trace!.movementHistory).toHaveLength(1);
    expect(trace!.movementHistory[0].stationName).toBe('Molecular Bench 1');
  });

  it('the real trace includes the real result for that specific well, when one exists', () => {
    const trace = resolveMolecularHistoricalTrace([BATCH], { accessionNumber: 'PS26-100452' });
    expect(trace!.result?.interpretation).toBe('POSITIVE');
  });

  it('a real, genuinely non-existent specimen returns an honest null, never a fabricated trace', () => {
    const trace = resolveMolecularHistoricalTrace([BATCH], { accessionNumber: 'does-not-exist' });
    expect(trace).toBeNull();
  });

  it('a real specimen with no movement history yet (not scanned into a well via the tracked flow) returns an honest empty array, not undefined or a fabrication', () => {
    const batchNoMovement: MolecularBatch = { ...BATCH, wells: [{ ...BATCH.wells[1], movementHistory: undefined }] };
    const trace = resolveMolecularHistoricalTrace([batchNoMovement], { accessionNumber: 'PS26-100452' });
    expect(trace!.movementHistory).toEqual([]);
  });
});
