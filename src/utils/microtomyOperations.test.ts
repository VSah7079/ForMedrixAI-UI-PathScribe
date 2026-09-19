// src/utils/microtomyOperations.test.ts
import { describe, it, expect } from 'vitest';
import {
  addMicrotomyStain, removeMicrotomyStain, computeNextUnprintedStain, markStainPrinting,
  markStainPrintResult, reprintMicrotomyStain, reorderBlockStains, updateStainComment,
  updateBlockComment, setBlockAlertFlags, updateDecantCytologyFields, applyCytologyPrepSuggestions,
  addDecantStain, removeDecantStain,
} from './microtomyOperations';
import type { Specimen } from '@/types/case/Specimen';
import type { StainType } from '@/services/stains/IStainService';

const specimen = (overrides: Partial<Specimen> = {}): Specimen => ({
  id: 'sp1', label: 'A', displayId: 'S26-0001-A',
  blocks: [{
    id: 'blk-1', label: '1', status: 'Grossed',
    stains: [
      { id: 'stain-1', stainName: 'H&E', status: 'Pending Cut', printStatus: 'Pending' },
      { id: 'stain-2', stainName: 'PAS', status: 'Pending Cut', printStatus: 'Printed', printedAt: '2026-09-01T00:00:00Z', printedBy: 'tech-1' },
    ],
  }],
  decants: [{
    id: 'dec-1', label: 'D1', decantType: 'residual_fluid' as any, createdAt: '2026-09-01T00:00:00Z',
    stains: [{ id: 'dstain-1', stainName: 'Pap Smear, Conventional', status: 'Pending Cut' }],
  }],
  ...overrides,
} as unknown as Specimen);

const stainType = (id: string, name: string): StainType => ({ id, name, category: 'IHC', active: true } as unknown as StainType);
const actor = { id: 'tech-1', name: 'J. Smith' };

describe('addMicrotomyStain', () => {
  it('adds a single, real, userAdded, Pending-print stain with the requested level depth', () => {
    const result = addMicrotomyStain(specimen(), 'blk-1', stainType('st-ki67', 'Ki-67'), 'S26-0001', { levelDepthMicrons: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains).toHaveLength(3);
    const added = block.stains.find(s => s.stainName === 'Ki-67')!;
    expect(added.userAdded).toBe(true);
    expect(added.printStatus).toBe('Pending');
    expect(added.levelDepthMicrons).toBe(4);
    expect(block.userModified).toBe(true);
  });

  it('honors duplicateCount, creating that many independent slides', () => {
    const result = addMicrotomyStain(specimen(), 'blk-1', stainType('st-he', 'H&E'), 'S26-0001', { duplicateCount: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.filter(s => s.stainName === 'H&E')).toHaveLength(4); // 1 pre-existing + 3 new
  });

  it('pairWithControl creates a real, symmetric-linked control slide alongside the clinical one', () => {
    const result = addMicrotomyStain(specimen(), 'blk-1', stainType('st-ki67', 'Ki-67'), 'S26-0001', { pairWithControl: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const clinical = block.stains.find(s => s.stainName === 'Ki-67')!;
    const control = block.stains.find(s => s.isControlSlide)!;
    expect(control.stainName).toContain('Control');
    expect(control.pairedControlSlideId).toBe(clinical.id);
    expect(clinical.pairedControlSlideId).toBe(control.id);
  });
});

describe('removeMicrotomyStain', () => {
  it('directly deletes an unprinted stain, no reason required', () => {
    const result = removeMicrotomyStain(specimen(), 'blk-1', 'stain-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.find(s => s.id === 'stain-1')).toBeUndefined();
  });

  it('refuses to remove an already-printed stain without a reason', () => {
    const result = removeMicrotomyStain(specimen(), 'blk-1', 'stain-2');
    expect(result.ok).toBe(false);
    expect(!result.ok && 'needsReason' in result && result.needsReason).toBe(true);
  });

  it('with a reason, marks an already-printed stain Cancelled rather than deleting the real record', () => {
    const result = removeMicrotomyStain(specimen(), 'blk-1', 'stain-2', 'Tissue Exhausted');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const stain = block.stains.find(s => s.id === 'stain-2')!;
    expect(stain.status).toBe('Cancelled');
    expect(stain.printStatus).toBe('Canceled');
    expect(stain.printFailureReason).toBe('Tissue Exhausted');
  });
});

describe('computeNextUnprintedStain', () => {
  it('finds the first stain that is not yet Printed/Printing/Canceled', () => {
    const block = specimen().blocks![0];
    const next = computeNextUnprintedStain(block.stains);
    expect(next?.id).toBe('stain-1');
  });

  it('returns undefined once every real stain is Printed', () => {
    const stains = [{ id: 's1', stainName: 'H&E', status: 'Pending Cut' as const, printStatus: 'Printed' as const }];
    expect(computeNextUnprintedStain(stains)).toBeUndefined();
  });
});

describe('markStainPrinting / markStainPrintResult', () => {
  it('transitions Pending -> Printing -> Printed on success', () => {
    const printing = markStainPrinting(specimen(), 'blk-1', 'stain-1');
    expect(printing.ok).toBe(true);
    if (!printing.ok) return;
    const printed = markStainPrintResult(printing.specimen, 'blk-1', 'stain-1', { ok: true }, 'tech-1');
    expect(printed.ok).toBe(true);
    if (!printed.ok) return;
    const stain = printed.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'stain-1')!;
    expect(stain.printStatus).toBe('Printed');
    expect(stain.printedBy).toBe('tech-1');
  });

  it('records a real failure reason on a failed dispatch, leaving the slide retryable', () => {
    const result = markStainPrintResult(specimen(), 'blk-1', 'stain-1', { ok: false, message: 'No GS1 GTIN configured' }, 'tech-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'stain-1')!;
    expect(stain.printStatus).toBe('Failed');
    expect(stain.printFailureReason).toBe('No GS1 GTIN configured');
  });
});

describe('reprintMicrotomyStain', () => {
  it('resets an already-printed slide back to Pending, records the reason, and increments reprintCount', () => {
    const result = reprintMicrotomyStain(specimen(), 'blk-1', 'stain-2', 'Scratched Glass', 'tech-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'stain-2')!;
    expect(stain.printStatus).toBe('Pending');
    expect(stain.lastReprintReason).toBe('Scratched Glass');
    expect(stain.lastReprintOrderedBy).toBe('tech-2');
    expect(stain.reprintCount).toBe(1);
  });

  it('increments reprintCount across repeated reprints rather than resetting it', () => {
    const once = reprintMicrotomyStain(specimen(), 'blk-1', 'stain-2', 'Jam', 'tech-2');
    if (!once.ok) throw new Error('setup failed');
    const twice = reprintMicrotomyStain(once.specimen, 'blk-1', 'stain-2', 'Misprint', 'tech-2');
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    const stain = twice.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'stain-2')!;
    expect(stain.reprintCount).toBe(2);
  });
});

describe('reorderBlockStains', () => {
  it('reorders stains to match the given id order', () => {
    const result = reorderBlockStains(specimen(), 'blk-1', ['stain-2', 'stain-1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.map(s => s.id)).toEqual(['stain-2', 'stain-1']);
  });

  it('defensively appends any real stain missing from the caller\'s own reorder list, rather than dropping it', () => {
    const result = reorderBlockStains(specimen(), 'blk-1', ['stain-2']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.map(s => s.id)).toEqual(['stain-2', 'stain-1']);
  });
});

describe('updateStainComment / updateBlockComment', () => {
  it('appends a real, plain-text comment to a specific slide and records the label-print toggle', () => {
    const result = updateStainComment(specimen(), 'blk-1', 'stain-1', 'Repeat requested — poor uptake', true, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'stain-1')!;
    expect(stain.comments).toHaveLength(1);
    expect(stain.comments![0].text).toBe('Repeat requested — poor uptake');
    expect(stain.commentPrintsOnLabel).toBe(true);
  });

  it('appends a real block-level comment without touching any slide', () => {
    const result = updateBlockComment(specimen(), 'blk-1', 'Tiny fragment, handle with care', actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.comments).toHaveLength(1);
    expect(block.comments![0].authorName).toBe('J. Smith');
  });
});

describe('setBlockAlertFlags', () => {
  it('sets the real, high-contrast alert flags on a block', () => {
    const result = setBlockAlertFlags(specimen(), 'blk-1', { tinyTissue: true, fragile: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.tinyTissue).toBe(true);
    expect(block.fragile).toBe(true);
  });
});

describe('Decant / Cytology operations', () => {
  it('updateDecantCytologyFields records volume/appearance/yield', () => {
    const result = updateDecantCytologyFields(specimen(), 'dec-1', { totalVolumeMl: 25, appearance: 'Bloody', yieldPelletSize: 'High' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decant = result.specimen.decants!.find(d => d.id === 'dec-1')!;
    expect(decant.totalVolumeMl).toBe(25);
    expect(decant.appearance).toBe('Bloody');
    expect(decant.yieldPelletSize).toBe('High');
  });

  it('applyCytologyPrepSuggestions creates the exact real number of real stain rows, with sensible default stains per method', () => {
    const result = applyCytologyPrepSuggestions(
      specimen(), 'dec-1',
      [{ preparationMethod: 'ThinPrep/Liquid-Based', count: 2 }, { preparationMethod: 'Cell Block', count: 1 }],
      'S26-0001',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decant = result.specimen.decants!.find(d => d.id === 'dec-1')!;
    const thinPreps = decant.stains.filter(s => s.preparationMethod === 'ThinPrep/Liquid-Based');
    const cellBlocks = decant.stains.filter(s => s.preparationMethod === 'Cell Block');
    expect(thinPreps).toHaveLength(2);
    expect(cellBlocks).toHaveLength(1);
    expect(cellBlocks[0].stainName).toBe('H&E');
  });

  it('addDecantStain / removeDecantStain mirror the block versions for a decant\'s own slides', () => {
    const added = addDecantStain(specimen(), 'dec-1', stainType('st-diffquik', 'Diff-Quik / Wright-Giemsa'), 'S26-0001', 'Direct Smear (Air-Dried)');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const decant = added.specimen.decants!.find(d => d.id === 'dec-1')!;
    expect(decant.stains).toHaveLength(2);

    const removed = removeDecantStain(added.specimen, 'dec-1', decant.stains[1].id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.specimen.decants!.find(d => d.id === 'dec-1')!.stains).toHaveLength(1);
  });
});
