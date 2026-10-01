// src/services/molecular/resolveMolecularMovementRecord.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularMovementRecord } from './resolveMolecularMovementRecord';

const CONTEXT = { byUserId: 'u1', byUserName: 'Test Tech', stationId: 'station-1', stationName: 'Molecular Bench 1' };
const NOW = new Date('2026-09-07T10:00:00.000Z');

describe('resolveMolecularMovementRecord — real, per the given specification\'s own §5.1', () => {
  it('produces a real, correct record with every real field from the given inputs', () => {
    const record = resolveMolecularMovementRecord('primary_vial', 'plate_well', 'SPEC-20260907-00000001', 'PLT-F47AC:A01', CONTEXT, NOW);
    expect(record).toEqual({
      fromLevel: 'primary_vial', toLevel: 'plate_well',
      fromBarcode: 'SPEC-20260907-00000001', toBarcode: 'PLT-F47AC:A01',
      at: '2026-09-07T10:00:00.000Z',
      byUserId: 'u1', byUserName: 'Test Tech',
      stationId: 'station-1', stationName: 'Molecular Bench 1',
    });
  });

  it('a real intermediate movement (rack to well) is correctly distinguishable from a direct vial-to-well movement', () => {
    const direct = resolveMolecularMovementRecord('primary_vial', 'plate_well', 'SPEC-1', 'PLT-1:A01', CONTEXT, NOW);
    const viaRack = resolveMolecularMovementRecord('secondary_rack', 'plate_well', 'RACK-MOLE-00001', 'PLT-1:A01', CONTEXT, NOW);
    expect(direct.fromLevel).toBe('primary_vial');
    expect(viaRack.fromLevel).toBe('secondary_rack');
  });
});
