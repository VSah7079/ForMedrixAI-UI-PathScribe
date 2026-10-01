// src/utils/slideDistributionOperations.test.ts
import { describe, it, expect } from 'vitest';
import {
  assignPhysicalSlide, assignScannerSlide, flagSlideException, resolveSlideException,
  recordLabelReprintRequest, resolveSplitDestinationWarning,
} from './slideDistributionOperations';
import type { Specimen } from '@/types/case/Specimen';

const specimen = (overrides: Partial<Specimen> = {}): Specimen => ({
  id: 'sp1', label: 'A', displayId: 'S26-0001-A',
  blocks: [
    {
      id: 'blk-1', label: 'A1', status: 'Embedded', pieceCount: 3,
      stains: [
        { id: 'st-1', stainName: 'H&E', comments: [] } as any,
        { id: 'st-2', stainName: 'CK7', comments: [] } as any,
      ],
    },
  ],
  ...overrides,
} as unknown as Specimen);

const actor = 'tech-1';

describe('assignPhysicalSlide', () => {
  it('sets status Assigned when only a pathologist is given, no location yet', () => {
    const result = assignPhysicalSlide(specimen(), 'blk-1', 'st-1', { pathologistId: 'u1', pathologistName: 'Chen' }, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.distributionDestination).toBe('physical');
    expect(stain.distributionStatus).toBe('Assigned');
    expect(stain.assignedPathologistName).toBe('Chen');
    expect(stain.distributionEvents).toHaveLength(1);
    expect(stain.distributionEvents![0].action).toBe('assigned');
  });

  it('sets status Checked Out the moment any real physical location field is recorded', () => {
    const result = assignPhysicalSlide(specimen(), 'blk-1', 'st-1', { pathologistId: 'u1', pathologistName: 'Chen', courierBagId: 'BAG-9' }, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.distributionStatus).toBe('Checked Out');
    expect(stain.physicalLocation?.courierBagId).toBe('BAG-9');
    expect(stain.distributionEvents![0].action).toBe('checked_out');
  });

  it('refuses when nothing real is actually given', () => {
    const result = assignPhysicalSlide(specimen(), 'blk-1', 'st-1', {}, actor);
    expect(result.ok).toBe(false);
  });

  it('refuses an unknown slide', () => {
    const result = assignPhysicalSlide(specimen(), 'blk-1', 'st-nope', { pathologistId: 'u1' }, actor);
    expect(result.ok).toBe(false);
  });
});

describe('assignScannerSlide', () => {
  it('sets In Scanning Queue when only the instrument is given', () => {
    const result = assignScannerSlide(specimen(), 'blk-1', 'st-1', { scannerInstrumentId: 'Leica Aperio GT450 #2' }, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.distributionDestination).toBe('digital');
    expect(stain.distributionStatus).toBe('In Scanning Queue');
  });

  it('sets Loaded on Scanner once rack + slot are both recorded', () => {
    const result = assignScannerSlide(specimen(), 'blk-1', 'st-1', { scannerInstrumentId: 'Leica Aperio GT450 #2', rackId: 'RACK-102', slotPosition: '4' }, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.distributionStatus).toBe('Loaded on Scanner');
    expect(stain.scannerAssignment?.rackId).toBe('RACK-102');
  });

  it('refuses without a scanner instrument', () => {
    const result = assignScannerSlide(specimen(), 'blk-1', 'st-1', { rackId: 'RACK-102', slotPosition: '4' }, actor);
    expect(result.ok).toBe(false);
  });
});

describe('flagSlideException / resolveSlideException', () => {
  it('flags and clears an exception, appending events for both', () => {
    const flagged = flagSlideException(specimen(), 'blk-1', 'st-1', 'Missing Glass', actor, 'checked the tray twice');
    expect(flagged.ok).toBe(true);
    if (!flagged.ok) return;
    let stain = flagged.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.activeExceptionReason).toBe('Missing Glass');

    const resolved = resolveSlideException(flagged.specimen, 'blk-1', 'st-1', actor);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    stain = resolved.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.activeExceptionReason).toBeUndefined();
    expect(stain.distributionEvents).toHaveLength(2);
  });

  it('refuses to resolve when nothing is actually flagged', () => {
    const result = resolveSlideException(specimen(), 'blk-1', 'st-1', actor);
    expect(result.ok).toBe(false);
  });
});

describe('recordLabelReprintRequest', () => {
  it('records a real, auditable event', () => {
    const result = recordLabelReprintRequest(specimen(), 'blk-1', 'st-1', actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stain = result.specimen.blocks!.find(b => b.id === 'blk-1')!.stains.find(s => s.id === 'st-1')!;
    expect(stain.distributionEvents![0].action).toBe('label_reprint_requested');
  });
});

describe('resolveSplitDestinationWarning', () => {
  it('returns null when fewer than 2 slides on the block have been routed', () => {
    const routed = assignPhysicalSlide(specimen(), 'blk-1', 'st-1', { pathologistId: 'u1', pathologistName: 'Chen' }, actor);
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(resolveSplitDestinationWarning(routed.specimen, 'blk-1')).toBeNull();
  });

  it('reports no conflict when every routed slide shares the same real destination/target', () => {
    let s = specimen();
    const r1 = assignPhysicalSlide(s, 'blk-1', 'st-1', { pathologistId: 'u1', pathologistName: 'Chen' }, actor);
    expect(r1.ok).toBe(true); if (!r1.ok) return; s = r1.specimen;
    const r2 = assignPhysicalSlide(s, 'blk-1', 'st-2', { pathologistId: 'u1', pathologistName: 'Chen' }, actor);
    expect(r2.ok).toBe(true); if (!r2.ok) return; s = r2.specimen;
    const warning = resolveSplitDestinationWarning(s, 'blk-1')!;
    expect(warning.conflict).toBe(false);
  });

  it('honestly flags a real conflict when routed slides genuinely disagree', () => {
    let s = specimen();
    const r1 = assignPhysicalSlide(s, 'blk-1', 'st-1', { pathologistId: 'u1', pathologistName: 'Chen' }, actor);
    expect(r1.ok).toBe(true); if (!r1.ok) return; s = r1.specimen;
    const r2 = assignScannerSlide(s, 'blk-1', 'st-2', { scannerInstrumentId: 'Leica Aperio GT450 #2' }, actor);
    expect(r2.ok).toBe(true); if (!r2.ok) return; s = r2.specimen;
    const warning = resolveSplitDestinationWarning(s, 'blk-1')!;
    expect(warning.conflict).toBe(true);
  });
});
