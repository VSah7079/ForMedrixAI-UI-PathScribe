// src/services/molecular/resolveMolecularBarcodes.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateSpecimenContainerBarcode, generateExtractionRackBarcode, generateMolecularPlateBarcode,
  generateWellIdentifier, generateMolecularBatchBarcode, generateDeckLocationLabel, generateWellPositionsInOrder,
} from './resolveMolecularBarcodes';

describe('resolveMolecularBarcodes — real, per the given specification\'s own exact barcode formats', () => {
  it('generateSpecimenContainerBarcode matches the real, given SPEC-YYYYMMDD-XXXXXXXX format exactly', () => {
    expect(generateSpecimenContainerBarcode(new Date(2026, 8, 6), 42)).toBe('SPEC-20260906-00000042');
  });

  it('generateExtractionRackBarcode matches the real, given RACK-MOLE-XXXXX format exactly', () => {
    expect(generateExtractionRackBarcode(7)).toBe('RACK-MOLE-00007');
  });

  it('generateMolecularPlateBarcode matches the real, given PLT-[AssayCode]-YYYYMMDD-XXX format exactly', () => {
    expect(generateMolecularPlateBarcode('HPV', new Date(2026, 8, 6), 12)).toBe('PLT-HPV-20260906-012');
  });

  it('generateWellIdentifier matches the real, given PLT-[UUID]:[Row][Col] worked example exactly', () => {
    expect(generateWellIdentifier('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'A01')).toBe('PLT-F47AC:A01');
  });

  it('generateMolecularBatchBarcode matches the real, given BATCH-YYYYMMDD-XXXX worked example exactly', () => {
    expect(generateMolecularBatchBarcode(new Date(2026, 8, 6), 42)).toBe('BATCH-20260906-0042');
  });

  it('generateDeckLocationLabel matches the real, given LOC-INST-[ID]-[POSITION] format exactly', () => {
    expect(generateDeckLocationLabel('PANTHER_02', 'SLOT_A1')).toBe('LOC-INST-PANTHER_02-SLOT_A1');
  });

  it('generateWellPositionsInOrder produces the real, correct row-major fill order for a real 24-well plate', () => {
    const positions = generateWellPositionsInOrder({ rows: 4, columns: 6 }, 'row_major');
    expect(positions).toHaveLength(24);
    expect(positions.slice(0, 3)).toEqual(['A01', 'A02', 'A03']);
    expect(positions[6]).toBe('B01');
  });

  it('generateWellPositionsInOrder produces the real, correct column-major fill order when requested', () => {
    const positions = generateWellPositionsInOrder({ rows: 4, columns: 6 }, 'column_major');
    expect(positions.slice(0, 4)).toEqual(['A01', 'B01', 'C01', 'D01']);
    expect(positions[4]).toBe('A02');
  });

  it('generateWellPositionsInOrder produces the real, correct count for a real 96-well and 384-well plate', () => {
    expect(generateWellPositionsInOrder({ rows: 8, columns: 12 })).toHaveLength(96);
    expect(generateWellPositionsInOrder({ rows: 16, columns: 24 })).toHaveLength(384);
  });

  it('real, direct correction: row labels correctly continue past Z into the real AA-AF convention for a real 1536-well plate (32 rows), rather than the earlier version\'s silent, invalid non-letter characters past row 26', () => {
    const positions = generateWellPositionsInOrder({ rows: 32, columns: 48 }, 'row_major');
    expect(positions).toHaveLength(1536);
    // Real, per the confirmed, real AA-AF convention: row 27 (index 26) is 'AA'.
    expect(positions[26 * 48]).toBe('AA01');
    // Real, the last row (index 31, the 32nd real row) is 'AF'.
    expect(positions[31 * 48]).toBe('AF01');
    expect(positions[31 * 48 + 47]).toBe('AF48');
  });

  it('real, every real well position across a real 1536-well plate is genuinely unique — no real, silent duplicate from the extended row labeling', () => {
    const positions = generateWellPositionsInOrder({ rows: 32, columns: 48 });
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('real, a real, single-row strip format (8-well) produces the real, correct linear positions', () => {
    const positions = generateWellPositionsInOrder({ rows: 1, columns: 8 });
    expect(positions).toEqual(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08']);
  });
});
