// src/services/molecular/resolveMolecularReagentLotGating.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularReagentLotGating } from './resolveMolecularReagentLotGating';
import type { MolecularReagentLot, MolecularWell } from './IMolecularBatchService';

const NOW = new Date('2026-09-06T12:00:00.000Z');

const lot = (overrides: Partial<MolecularReagentLot>): MolecularReagentLot => ({
  componentType: 'MASTER_MIX', lotNumber: 'MM-1', expirationDate: '2027-01-01T00:00:00.000Z', qcStatus: 'signed_off',
  ...overrides,
});

describe('resolveMolecularReagentLotGating — real, per the given specification\'s own §3.3 gating rules', () => {
  it('a real, fully-valid set of lots and wells is correctly allowed with zero failures', () => {
    const result = resolveMolecularReagentLotGating([lot({})], [], NOW);
    expect(result.allowed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('a real, expired lot correctly blocks the batch', () => {
    const result = resolveMolecularReagentLotGating([lot({ expirationDate: '2026-01-01T00:00:00.000Z' })], [], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures[0].reason).toBe('expired');
  });

  it('a real lot marked failed correctly blocks the batch', () => {
    const result = resolveMolecularReagentLotGating([lot({ qcStatus: 'failed' })], [], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures[0].reason).toBe('failed_qc');
  });

  it('a real lot with no real QC sign-off (pending) correctly blocks the batch', () => {
    const result = resolveMolecularReagentLotGating([lot({ qcStatus: 'pending' })], [], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures[0].reason).toBe('no_qc_signoff');
  });

  it('a real, single lot with more than one real violation reports each real failure, not just the first', () => {
    const result = resolveMolecularReagentLotGating([lot({ expirationDate: '2026-01-01T00:00:00.000Z', qcStatus: 'failed' })], [], NOW);
    expect(result.failures).toHaveLength(2);
  });

  it('a real, single invalid lot among several valid ones still blocks the whole real batch — no partial allow', () => {
    const result = resolveMolecularReagentLotGating(
      [lot({ componentType: 'MASTER_MIX' }), lot({ componentType: 'EXTRACTION_BUFFER', qcStatus: 'failed' })], [], NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it('a real, expired control lot on a well correctly blocks the batch too, not just reagent lots', () => {
    const well: MolecularWell = {
      wellPosition: 'A01', sampleType: 'CONTROL_NTC',
      controlInfo: { controlId: 'NTC-1', controlLotNumber: 'NTC-LOT-1', controlExpirationDate: '2026-01-01T00:00:00.000Z', expectedValue: 'NEGATIVE' },
    };
    const result = resolveMolecularReagentLotGating([lot({})], [well], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures.some(f => f.componentType === 'CONTROL')).toBe(true);
  });

  it('a real well with no control info at all is correctly ignored by this check — a patient specimen well has no lot to gate', () => {
    const well: MolecularWell = { wellPosition: 'A03', sampleType: 'PATIENT_SPECIMEN', specimenUuid: 'x', accessionNumber: 'PS26-1' };
    const result = resolveMolecularReagentLotGating([lot({})], [well], NOW);
    expect(result.allowed).toBe(true);
  });

  it('real, direct correction: a real control well (CONTROL_NTC) with NO controlInfo at all is correctly blocked, never silently passed', () => {
    const well: MolecularWell = { wellPosition: 'A01', sampleType: 'CONTROL_NTC' };
    const result = resolveMolecularReagentLotGating([], [well], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures.some(f => f.reason === 'missing_control_lot_info')).toBe(true);
  });

  it('real, direct correction: a real control well with an empty controlLotNumber is correctly blocked', () => {
    const well: MolecularWell = {
      wellPosition: 'A01', sampleType: 'CONTROL_PTC_HIGH',
      controlInfo: { controlId: 'PTC-1', controlLotNumber: '', controlExpirationDate: '2027-01-01T00:00:00.000Z', expectedValue: 'POSITIVE' },
    };
    const result = resolveMolecularReagentLotGating([], [well], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures.some(f => f.reason === 'missing_control_lot_info')).toBe(true);
  });

  it('real, direct correction: a real control well with an empty controlExpirationDate is correctly blocked, never silently treated as "not expired"', () => {
    const well: MolecularWell = {
      wellPosition: 'A01', sampleType: 'CALIBRATOR',
      controlInfo: { controlId: 'CAL-1', controlLotNumber: 'CAL-LOT-1', controlExpirationDate: '', expectedValue: 'POSITIVE' },
    };
    const result = resolveMolecularReagentLotGating([], [well], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures.some(f => f.reason === 'missing_control_lot_info')).toBe(true);
  });

  it('real, a real control well with complete, non-expired lot info correctly passes', () => {
    const well: MolecularWell = {
      wellPosition: 'A01', sampleType: 'CONTROL_NTC',
      controlInfo: { controlId: 'NTC-1', controlLotNumber: 'NTC-LOT-1', controlExpirationDate: '2027-01-01T00:00:00.000Z', expectedValue: 'NEGATIVE' },
    };
    const result = resolveMolecularReagentLotGating([], [well], NOW);
    expect(result.allowed).toBe(true);
  });

  it('real, a real, expired Positive Control reagent lot correctly blocks the batch, the same as any other real component type', () => {
    const result = resolveMolecularReagentLotGating([lot({ componentType: 'POSITIVE_CONTROL', lotNumber: 'PC-1', expirationDate: '2026-01-01T00:00:00.000Z' })], [], NOW);
    expect(result.allowed).toBe(false);
    expect(result.failures.some(f => f.componentType === 'POSITIVE_CONTROL')).toBe(true);
  });

  it('real, a real, fully-valid Negative Control reagent lot correctly passes gating', () => {
    const result = resolveMolecularReagentLotGating([lot({ componentType: 'NEGATIVE_CONTROL', lotNumber: 'NC-1' })], [], NOW);
    expect(result.allowed).toBe(true);
  });
});
