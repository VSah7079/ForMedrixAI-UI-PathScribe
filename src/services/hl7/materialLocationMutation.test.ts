import { describe, it, expect } from 'vitest';
import { applyMaterialLocation } from './materialLocationMutation';
import type { Specimen } from '@/types/case/Specimen';
import type { MatrixBlock } from '@/types/case/MatrixBlock';

const baseSpecimens = (): Specimen[] => [
  {
    id: 'SP-1', label: 'A', description: 'Breast',
    locationHistory: [],
    blocks: [
      { id: 'BLK-1', label: '1', locationHistory: [], stains: [{ id: 'ST-1', locationHistory: [], aliquots: [] }] },
    ],
    decants: [
      { id: 'DEC-1', label: '1', locationHistory: [], stains: [{ id: 'DST-1', locationHistory: [], aliquots: [] }] },
    ],
  } as any,
];

const baseMatrixBlocks = (): MatrixBlock[] => [
  { id: 'MB-1', label: 'MX1', locationHistory: [], slides: [{ id: 'MS-1', locationHistory: [] }] } as any,
];

const commonInput = { location: 'Grossing Station 2', timestamp: '2026-01-01T00:00:00Z', sourceSystem: 'CEREBRO' };

describe('applyMaterialLocation', () => {
  it('appends to specimen-level locationHistory', () => {
    const result = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'specimen' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      expect(result.result.level).toBe('specimen');
      const sp = (result.result as any).specimens[0];
      expect(sp.locationHistory).toHaveLength(1);
      expect(sp.locationHistory[0].location).toBe('Grossing Station 2');
      expect(result.result.targetDescription).toBe('Specimen A');
    }
  });

  it('appends to block-level locationHistory without touching specimen-level history', () => {
    const result = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'block', blockNumber: '1' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      const sp = (result.result as any).specimens[0];
      expect(sp.blocks[0].locationHistory).toHaveLength(1);
      expect(sp.locationHistory).toHaveLength(0);
    }
  });

  it('appends to slide-level locationHistory using 1-based L-notation', () => {
    const result = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'slide', blockNumber: '1', slideLevel: 'L1' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      const sp = (result.result as any).specimens[0];
      expect(sp.blocks[0].stains[0].locationHistory).toHaveLength(1);
    }
  });

  it('appends to decant-level and decant_slide-level locationHistory', () => {
    const r1 = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'decant', decantLabel: '1' } });
    expect(r1.outcome).toBe('applied');
    const r2 = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'decant_slide', decantLabel: '1', slideLevel: 'L1' } });
    expect(r2.outcome).toBe('applied');
    if (r2.outcome === 'applied') {
      const sp = (r2.result as any).specimens[0];
      expect(sp.decants[0].stains[0].locationHistory).toHaveLength(1);
    }
  });

  it('creates a new aliquot when none exists, and appends to an existing one on a later event', () => {
    const r1 = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'aliquot', blockNumber: '1', slideLevel: 'L1', aliquotLabel: 'A' } });
    expect(r1.outcome).toBe('applied');
    if (r1.outcome !== 'applied') return;
    const specimensAfterFirst = (r1.result as any).specimens;
    const stainAfterFirst = specimensAfterFirst[0].blocks[0].stains[0];
    expect(stainAfterFirst.aliquots).toHaveLength(1);
    expect(stainAfterFirst.aliquots[0].locationHistory).toHaveLength(1);

    const r2 = applyMaterialLocation(specimensAfterFirst, [], { ...commonInput, specimenLetter: 'A', target: { level: 'aliquot', blockNumber: '1', slideLevel: 'L1', aliquotLabel: 'A' } });
    expect(r2.outcome).toBe('applied');
    if (r2.outcome !== 'applied') return;
    const stainAfterSecond = (r2.result as any).specimens[0].blocks[0].stains[0];
    expect(stainAfterSecond.aliquots).toHaveLength(1); // same aliquot, not a duplicate
    expect(stainAfterSecond.aliquots[0].locationHistory).toHaveLength(2); // real history append
  });

  it('handles decant_aliquot the same way as aliquot', () => {
    const result = applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'decant_aliquot', decantLabel: '1', slideLevel: 'L1', aliquotLabel: 'A' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      const sp = (result.result as any).specimens[0];
      expect(sp.decants[0].stains[0].aliquots).toHaveLength(1);
    }
  });

  it('matrix_block updates matrixBlocks, never specimens, and needs no specimenLetter', () => {
    const result = applyMaterialLocation(baseSpecimens(), baseMatrixBlocks(), { ...commonInput, target: { level: 'matrix_block', matrixBlockId: 'MB-1' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      expect(result.result.level).toBe('matrix');
      const mb = (result.result as any).matrixBlocks[0];
      expect(mb.locationHistory).toHaveLength(1);
      expect(result.result.targetDescription).toBe('MX1');
    }
  });

  it('matrix_slide updates the matrix block\'s own slides[] array (real field name, not stains)', () => {
    const result = applyMaterialLocation(baseSpecimens(), baseMatrixBlocks(), { ...commonInput, target: { level: 'matrix_slide', matrixBlockId: 'MB-1', slideLevel: 'L1' } });
    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      const mb = (result.result as any).matrixBlocks[0];
      expect(mb.slides[0].locationHistory).toHaveLength(1);
      expect(result.result.targetDescription).toBe('MX1-L1');
    }
  });

  it('returns target-not-found for an unknown specimen, block, decant, or matrix block', () => {
    expect(applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'Z', target: { level: 'specimen' } }).outcome).toBe('target-not-found');
    expect(applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'block', blockNumber: '99' } }).outcome).toBe('target-not-found');
    expect(applyMaterialLocation(baseSpecimens(), [], { ...commonInput, specimenLetter: 'A', target: { level: 'decant', decantLabel: '99' } }).outcome).toBe('target-not-found');
    expect(applyMaterialLocation(baseSpecimens(), baseMatrixBlocks(), { ...commonInput, target: { level: 'matrix_block', matrixBlockId: 'MB-99' } }).outcome).toBe('target-not-found');
    expect(applyMaterialLocation(baseSpecimens(), baseMatrixBlocks(), { ...commonInput, target: { level: 'matrix_slide', matrixBlockId: 'MB-1', slideLevel: 'L99' } }).outcome).toBe('target-not-found');
  });
});
