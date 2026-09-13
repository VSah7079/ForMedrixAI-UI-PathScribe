// src/services/molecular/mockMolecularExtractionRackService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { MolecularMovementRecord } from './IMolecularBatchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const MOVEMENT: MolecularMovementRecord = {
  fromLevel: 'primary_vial', toLevel: 'secondary_rack',
  fromBarcode: 'SPEC-20260907-00000009', toBarcode: 'RACK-MOLE-00001:5',
  at: '2026-09-07T10:00:00.000Z', byUserId: 'u1', byUserName: 'Test Tech',
  stationId: 'station-1', stationName: 'Molecular Bench 1',
};

describe('mockMolecularExtractionRackService — real, per direct follow-up (§2.2/§5.1)', () => {
  it('getAll returns the real, seeded rack with its own real, pre-loaded position', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].rackBarcode).toBe('RACK-MOLE-00001');
      expect(res.data[0].positions).toHaveLength(24);
      expect(res.data[0].positions[0].containerBarcode).toBe('SPEC-20260906-8831');
    }
  });

  it('create correctly builds a real, new rack with the real, correct number of empty positions', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.create({ capacity: 12, createdByUserId: 'u1', createdByUserName: 'Test User' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.rackBarcode).toMatch(/^RACK-MOLE-\d{5}$/);
      expect(res.data.positions).toHaveLength(12);
      expect(res.data.positions.every(p => !p.containerBarcode)).toBe(true);
    }
  });

  it('loadSpecimenIntoPosition correctly places a real specimen at a real, genuinely empty position', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.loadSpecimenIntoPosition(
      'rack-001', '5', { specimenUuid: 'new-uuid', accessionNumber: 'PS26-999', containerBarcode: 'SPEC-20260907-00000009' }, MOVEMENT,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const pos = res.data.positions.find(p => p.positionLabel === '5')!;
      expect(pos.containerBarcode).toBe('SPEC-20260907-00000009');
      expect(pos.movementHistory).toHaveLength(1);
    }
  });

  it('loadSpecimenIntoPosition correctly refuses to overwrite a real, already-occupied position', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.loadSpecimenIntoPosition(
      'rack-001', '1', { accessionNumber: 'PS26-OTHER', containerBarcode: 'SPEC-OTHER' }, MOVEMENT,
    );
    expect(res.ok).toBe(false);
  });

  it('loadSpecimenIntoPosition on a real, non-existent position returns an honest error', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.loadSpecimenIntoPosition(
      'rack-001', '999', { containerBarcode: 'SPEC-X' }, MOVEMENT,
    );
    expect(res.ok).toBe(false);
  });

  it('findPositionByContainerBarcode correctly finds a real, already-racked specimen', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.findPositionByContainerBarcode('SPEC-20260906-8831');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).not.toBeNull();
      expect(res.data!.position.positionLabel).toBe('1');
      expect(res.data!.rack.rackBarcode).toBe('RACK-MOLE-00001');
    }
  });

  it('findPositionByContainerBarcode correctly returns an honest null for a real specimen that was never racked', async () => {
    const { mockMolecularExtractionRackService } = await import('./mockMolecularExtractionRackService');
    const res = await mockMolecularExtractionRackService.findPositionByContainerBarcode('SPEC-NEVER-RACKED');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });
});
