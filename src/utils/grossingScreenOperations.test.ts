// src/utils/grossingScreenOperations.test.ts
import { describe, it, expect } from 'vitest';
import { addGrossingBlock, removeGrossingBlock, addGrossingStain, removeGrossingStain, updateGrossingPieceCount } from './grossingScreenOperations';
import type { Specimen } from '@/types/case/Specimen';
import type { ProtocolPathway } from '@/services/protocols/IProtocolService';
import type { StainType } from '@/services/stains/IStainService';

const specimen = (overrides: Partial<Specimen> = {}): Specimen => ({
  id: 'sp1', label: 'A', displayId: 'S26-0001-A',
  blocks: [{ id: 'blk-1', label: '1', status: 'Pending', stains: [{ id: 'stain-1', stainName: 'H&E', status: 'Pending Cut' }] }],
  ...overrides,
} as unknown as Specimen);

const pathway = (overrides: Partial<ProtocolPathway> = {}): ProtocolPathway => ({
  id: 'p1', pathwayName: 'Track', materialKind: 'block', fixativeType: '10% NBF',
  requiresDecal: false, processingFormat: 'Standard', defaultPieceCount: 3,
  tasks: [{ id: 't1', stepOrder: 1, action: 'H&E', stainTypeIds: ['st-he'] }],
  ...overrides,
});

const stainType = (id: string, name: string): StainType => ({ id, name, category: 'Special', active: true } as unknown as StainType);

describe('addGrossingBlock', () => {
  it('creates a new block with the next sequential label, protocol default stains (never userAdded), and defaultPieceCount', () => {
    const result = addGrossingBlock(specimen(), pathway(), 'S26-0001', 'alpha-specimen');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const newBlock = result.specimen.blocks!.find(b => b.id !== 'blk-1')!;
    expect(newBlock.label).toBe('2');
    expect(newBlock.status).toBe('Pending');
    expect(newBlock.pieceCount).toBe(3);
    expect(newBlock.stains).toHaveLength(1);
    expect(newBlock.stains[0].userAdded).toBeUndefined();
  });
});

describe('removeGrossingBlock', () => {
  it('removes a real, still-Pending block', () => {
    const result = removeGrossingBlock(specimen(), 'blk-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.specimen.blocks).toHaveLength(0);
  });

  it('refuses to remove a block once processing has begun, with a clear, honest error', () => {
    const sp = specimen({ blocks: [{ id: 'blk-1', label: '1', status: 'Grossed', stains: [] }] } as any);
    const result = removeGrossingBlock(sp, 'blk-1');
    expect(result.ok).toBe(false);
    expect(!result.ok && 'error' in result && result.error).toContain('cannot be removed');
  });
});

describe('addGrossingStain', () => {
  it('adds a real stain flagged userAdded, flags the block userModified, and logs a real override', () => {
    const result = addGrossingStain(specimen(), 'blk-1', stainType('st-pas', 'PAS'), 'tech-1', 'S26-0001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.userModified).toBe(true);
    const added = block.stains.find(s => s.stainName === 'PAS')!;
    expect(added.userAdded).toBe(true);
    expect(result.specimen.grossingOverrides).toHaveLength(1);
    expect(result.specimen.grossingOverrides![0]).toMatchObject({ field: 'stainAdded', blockLabel: '1', newValue: 'PAS', actor: 'tech-1' });
  });
});

describe('removeGrossingStain', () => {
  it('requires confirmation before removing a real protocol-default stain', () => {
    const result = removeGrossingStain(specimen(), 'blk-1', 'stain-1', 'tech-1', false);
    expect(result.ok).toBe(false);
    expect(!result.ok && 'needsConfirmation' in result && result.needsConfirmation).toBe(true);
  });

  it('removes a protocol-default stain once confirmed, flags the block userModified, and logs a real override', () => {
    const result = removeGrossingStain(specimen(), 'blk-1', 'stain-1', 'tech-1', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains).toHaveLength(0);
    expect(block.userModified).toBe(true);
    expect(result.specimen.grossingOverrides).toHaveLength(1);
    expect(result.specimen.grossingOverrides![0]).toMatchObject({ field: 'stainRemoved', blockLabel: '1', originalValue: 'H&E' });
  });

  it('removes a real, user-added stain with no confirmation and no audit entry — undoing your own addition is not an override', () => {
    const sp = specimen({
      blocks: [{ id: 'blk-1', label: '1', status: 'Pending', stains: [{ id: 'stain-2', stainName: 'PAS', status: 'Pending Cut', userAdded: true }] }],
    } as any);
    const result = removeGrossingStain(sp, 'blk-1', 'stain-2', 'tech-1', false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.specimen.blocks![0].stains).toHaveLength(0);
    expect(result.specimen.grossingOverrides ?? []).toHaveLength(0);
  });
});

describe('updateGrossingPieceCount', () => {
  it('updates the real piece count and always logs a real override, even the first time it is set', () => {
    const result = updateGrossingPieceCount(specimen(), 'blk-1', 4, 'tech-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.specimen.blocks!.find(b => b.id === 'blk-1')!.pieceCount).toBe(4);
    expect(result.specimen.grossingOverrides).toHaveLength(1);
    expect(result.specimen.grossingOverrides![0]).toMatchObject({ field: 'pieceCount', originalValue: '(none)', newValue: '4' });
  });
});
