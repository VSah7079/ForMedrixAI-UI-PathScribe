// src/utils/embeddingOperations.test.ts
import { describe, it, expect } from 'vitest';
import {
  confirmPieceCount, flagEmbeddingDiscrepancy, setMoldAndOrientation, groupSplitBlocks,
  resolveSplitBlockGroupStatus, recordCassetteReprint, addEmbeddingBlockComment, resolveEmbeddingAlertBadges,
} from './embeddingOperations';
import type { Specimen } from '@/types/case/Specimen';

const specimen = (overrides: Partial<Specimen> = {}): Specimen => ({
  id: 'sp1', label: 'A', displayId: 'S26-0001-A',
  blocks: [
    { id: 'blk-1', label: 'A1', status: 'Grossed', pieceCount: 3, stains: [] },
    { id: 'blk-2', label: 'A2', status: 'Grossed', pieceCount: 1, stains: [] },
  ],
  ...overrides,
} as unknown as Specimen);

const actor = 'tech-1';

describe('confirmPieceCount', () => {
  it('seals the block to Embedded with the real, observed count', () => {
    const result = confirmPieceCount(specimen(), 'blk-1', 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.status).toBe('Embedded');
    expect(block.pieceCountAtEmbedding).toBe(3);
  });

  it('honestly records a genuine mismatch rather than silently correcting it', () => {
    const result = confirmPieceCount(specimen(), 'blk-1', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.pieceCount).toBe(3);
    expect(block.pieceCountAtEmbedding).toBe(2);
  });

  it('refuses a negative observed count', () => {
    const result = confirmPieceCount(specimen(), 'blk-1', -1);
    expect(result.ok).toBe(false);
  });

  it('refuses an unknown block', () => {
    const result = confirmPieceCount(specimen(), 'blk-nope', 1);
    expect(result.ok).toBe(false);
  });
});

describe('flagEmbeddingDiscrepancy', () => {
  it('records the real sub-reason and actor without advancing status', () => {
    const result = flagEmbeddingDiscrepancy(specimen(), 'blk-1', 'Missing Tissue/Empty Cassette', actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.lastDiscrepancyReason).toBe('Missing Tissue/Empty Cassette');
    expect(block.lastDiscrepancyReportedBy).toBe(actor);
    expect(block.status).toBe('Grossed'); // never silently advances — halts the workflow instead
  });
});

describe('setMoldAndOrientation', () => {
  it('sets both fields together', () => {
    const result = setMoldAndOrientation(specimen(), 'blk-1', { moldSize: '15x15mm', orientationInstructions: 'Embed on edge' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.moldSize).toBe('15x15mm');
    expect(block.orientationInstructions).toBe('Embed on edge');
  });
});

describe('groupSplitBlocks / resolveSplitBlockGroupStatus', () => {
  it('refuses to group fewer than 2 blocks', () => {
    const result = groupSplitBlocks(specimen(), ['blk-1']);
    expect(result.ok).toBe(false);
  });

  it('refuses an unknown block id', () => {
    const result = groupSplitBlocks(specimen(), ['blk-1', 'blk-nope']);
    expect(result.ok).toBe(false);
  });

  it('groups real blocks under one shared, generated id', () => {
    const result = groupSplitBlocks(specimen(), ['blk-1', 'blk-2']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [b1, b2] = result.specimen.blocks!;
    expect(b1.splitBlockGroupId).toBeTruthy();
    expect(b1.splitBlockGroupId).toBe(b2.splitBlockGroupId);
  });

  it('resolveSplitBlockGroupStatus returns null for an ungrouped block', () => {
    expect(resolveSplitBlockGroupStatus(specimen(), 'blk-1')).toBeNull();
  });

  it('resolveSplitBlockGroupStatus reports allEmbedded honestly — false until every sibling is', () => {
    const grouped = groupSplitBlocks(specimen(), ['blk-1', 'blk-2']);
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    const partial = resolveSplitBlockGroupStatus(grouped.specimen, 'blk-1')!;
    expect(partial.siblings).toHaveLength(2);
    expect(partial.allEmbedded).toBe(false);

    const oneEmbedded = confirmPieceCount(grouped.specimen, 'blk-1', 3);
    expect(oneEmbedded.ok).toBe(true);
    if (!oneEmbedded.ok) return;
    const stillPartial = resolveSplitBlockGroupStatus(oneEmbedded.specimen, 'blk-1')!;
    expect(stillPartial.allEmbedded).toBe(false); // blk-2 not embedded yet

    const bothEmbedded = confirmPieceCount(oneEmbedded.specimen, 'blk-2', 1);
    expect(bothEmbedded.ok).toBe(true);
    if (!bothEmbedded.ok) return;
    const complete = resolveSplitBlockGroupStatus(bothEmbedded.specimen, 'blk-1')!;
    expect(complete.allEmbedded).toBe(true);
  });
});

describe('recordCassetteReprint', () => {
  it('records the required reason and increments a cumulative, never-cleared count', () => {
    const first = recordCassetteReprint(specimen(), 'blk-1', 'Wax Buildup', actor);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    let block = first.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.lastCassetteReprintReason).toBe('Wax Buildup');
    expect(block.cassetteReprintCount).toBe(1);

    const second = recordCassetteReprint(first.specimen, 'blk-1', 'Faded Barcode', actor);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    block = second.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.lastCassetteReprintReason).toBe('Faded Barcode');
    expect(block.cassetteReprintCount).toBe(2); // cumulative, not reset
  });
});

describe('addEmbeddingBlockComment', () => {
  it('appends a real, plain-text MaterialComment', () => {
    const result = addEmbeddingBlockComment(specimen(), 'blk-1', 'Third piece recovered after re-check.', 'u1', 'J. Smith');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.comments).toHaveLength(1);
    expect(block.comments![0].text).toBe('Third piece recovered after re-check.');
  });

  it('refuses an empty comment', () => {
    const result = addEmbeddingBlockComment(specimen(), 'blk-1', '   ', 'u1', 'J. Smith');
    expect(result.ok).toBe(false);
  });
});

describe('resolveEmbeddingAlertBadges', () => {
  it('reuses the existing tinyTissue/fragile/requiresDecal flags, never duplicating them', () => {
    const block = specimen().blocks!.find(b => b.id === 'blk-1')!;
    const badges = resolveEmbeddingAlertBadges({ ...block, tinyTissue: true, requiresDecal: true });
    expect(badges).toContain('Tiny Tissue');
    expect(badges).toContain('Decal Required');
    expect(badges).not.toContain('Fragile');
  });

  it('derives Biopsy/Needle Core from the specimen dictionary type/procedure, never a stored flag', () => {
    const block = specimen().blocks!.find(b => b.id === 'blk-1')!;
    const badges = resolveEmbeddingAlertBadges(block, 'Biopsy', 'Prostate Needle Biopsy');
    expect(badges).toContain('Biopsy');
    expect(badges).toContain('Needle Core');
  });

  it('never fabricates a badge when nothing is actually flagged', () => {
    const block = specimen().blocks!.find(b => b.id === 'blk-1')!;
    expect(resolveEmbeddingAlertBadges(block)).toEqual([]);
  });
});
