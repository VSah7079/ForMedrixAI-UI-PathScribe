// src/utils/addOnOrderOperations.test.ts
import { describe, it, expect } from 'vitest';
import {
  createAddOnOrder, stampPerformingLab, resolveAddOnRouting, resolveRoutingStations,
  computeAddOnTrackingStage, markBlockRetrieved, flagBlockExhaustion, resolvePathologistException,
} from './addOnOrderOperations';
import type { Specimen, HistologyBlock, StainOrder } from '@/types/case/Specimen';
import type { StainType } from '@/services/stains/IStainService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';

function makeStain(overrides: Partial<StainOrder> = {}): StainOrder {
  return { id: 's-' + Math.random().toString(36).slice(2), stainName: 'H&E', status: 'Pending Cut', ...overrides };
}

function makeBlock(overrides: Partial<HistologyBlock> = {}): HistologyBlock {
  return { id: 'blk-1', label: 'A1', status: 'Embedded', stains: [makeStain()], ...overrides } as HistologyBlock;
}

function makeSpecimen(blocks: HistologyBlock[] = [makeBlock()]): Specimen {
  return { id: 'sp-1', label: 'A', blocks } as Specimen;
}

const actor = { id: 'path-1', name: 'Dr. Chen' };

const ihcStain: StainType = {
  id: 'st-ki67', name: 'Ki-67', category: 'IHC', requiresTargetControl: true, allowControlAutoAppend: true,
  defaultControlTissueType: 'Tonsil', active: true, version: 1, updatedBy: 'system', updatedAt: '2026-01-01',
} as StainType;

const heStain: StainType = {
  id: 'st-he', name: 'H&E', category: 'Routine', active: true, version: 1, updatedBy: 'system', updatedAt: '2026-01-01',
} as StainType;

describe('resolveAddOnRouting', () => {
  it('routes a recut to the Histology Cutting Queue regardless of category', () => {
    expect(resolveAddOnRouting('recut', 'IHC')).toEqual({ queueLabel: 'Histology Cutting Queue', workflowStage: 'Microtomy / Sectioning' });
  });
  it('routes Special Stain to the Special Stains Bench Queue', () => {
    expect(resolveAddOnRouting('special_stain', 'Special Stain')).toEqual({ queueLabel: 'Special Stains Bench Queue', workflowStage: 'Staining' });
  });
  it('routes IHC and Immunofluorescence to the IHC/Special Histochemistry Queue', () => {
    expect(resolveAddOnRouting('ihc', 'IHC')).toEqual({ queueLabel: 'IHC/Special Histochemistry Queue', workflowStage: 'Staining' });
    expect(resolveAddOnRouting('ihc', 'Immunofluorescence')).toEqual({ queueLabel: 'IHC/Special Histochemistry Queue', workflowStage: 'Staining' });
  });
  it('routes Molecular to the Reference/Send-Out Lab Queue with no internal workflow stage', () => {
    expect(resolveAddOnRouting('molecular', 'Molecular')).toEqual({ queueLabel: 'Reference/Send-Out Lab Queue' });
  });
  it('falls back Routine/other categories to the Histology Cutting Queue', () => {
    expect(resolveAddOnRouting('special_stain', 'Routine')).toEqual({ queueLabel: 'Histology Cutting Queue', workflowStage: 'Microtomy / Sectioning' });
  });
});

describe('resolveRoutingStations', () => {
  const stations: ScanStation[] = [
    { id: 'st-1', name: 'Sectioning 1', barcodeCode: 'S1', facilityId: 'lab-a', workflowStage: 'Microtomy / Sectioning', status: 'Active', supportsEngraving: false, supportsPrinting: false },
    { id: 'st-2', name: 'Sectioning 2 (other lab)', barcodeCode: 'S2', facilityId: 'lab-b', workflowStage: 'Microtomy / Sectioning', status: 'Active', supportsEngraving: false, supportsPrinting: false },
    { id: 'st-3', name: 'Staining 1', barcodeCode: 'S3', facilityId: 'lab-a', workflowStage: 'Staining', status: 'Active', supportsEngraving: false, supportsPrinting: false },
    { id: 'st-4', name: 'Inactive Sectioning', barcodeCode: 'S4', facilityId: 'lab-a', workflowStage: 'Microtomy / Sectioning', status: 'Inactive', supportsEngraving: false, supportsPrinting: false },
  ];

  it('scopes to the matching workflow stage AND the case\'s own performing lab', () => {
    const result = resolveRoutingStations(stations, 'Microtomy / Sectioning', 'lab-a');
    expect(result.map(s => s.id)).toEqual(['st-1']);
  });
  it('never returns another lab\'s station even if the stage matches', () => {
    const result = resolveRoutingStations(stations, 'Microtomy / Sectioning', 'lab-a');
    expect(result.find(s => s.facilityId === 'lab-b')).toBeUndefined();
  });
  it('excludes inactive stations', () => {
    const result = resolveRoutingStations(stations, 'Microtomy / Sectioning', 'lab-a');
    expect(result.find(s => s.id === 'st-4')).toBeUndefined();
  });
  it('falls back to all active matching-stage stations when performing lab is unresolved', () => {
    const result = resolveRoutingStations(stations, 'Microtomy / Sectioning', undefined);
    expect(result.map(s => s.id).sort()).toEqual(['st-1', 'st-2']);
  });
  it('returns empty for a send-out order (no workflow stage at all)', () => {
    expect(resolveRoutingStations(stations, undefined, 'lab-a')).toEqual([]);
  });
});

describe('createAddOnOrder', () => {
  it('creates a real StainOrder stamped with priority/routing/media/ordering pathologist', () => {
    const specimen = makeSpecimen();
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [
      { stainType: heStain, orderKind: 'recut', levelDepthMicrons: 4 },
    ], { priority: 'STAT/Urgent', slideMediaType: 'Plus Glass', cuttingInstructions: 'Deep levels through lesion' }, actor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const created = block.stains.find(s => s.id === result.createdStainIds[0])!;
    expect(created.addOnPriority).toBe('STAT/Urgent');
    expect(created.routedQueueLabel).toBe('Histology Cutting Queue');
    expect(created.routedWorkflowStage).toBe('Microtomy / Sectioning');
    expect(created.slideMediaType).toBe('Plus Glass');
    expect(created.orderedByPathologistId).toBe('path-1');
    expect(created.userAdded).toBe(true);
    expect(created.status).toBe('Pending Cut');
  });

  it('auto-appends a real, cross-linked separate control slide when the stain requires+allows one', () => {
    const specimen = makeSpecimen();
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [
      { stainType: ihcStain, orderKind: 'ihc' },
    ], { priority: 'Routine Sign-Out', slideMediaType: 'Standard Charged' }, actor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdStainIds.length).toBe(2);
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const clinical = block.stains.find(s => s.id === result.createdStainIds[0])!;
    const control = block.stains.find(s => s.id === result.createdStainIds[1])!;
    expect(control.isControlSlide).toBe(true);
    expect(control.pairedControlSlideId).toBe(clinical.id);
    expect(clinical.pairedControlSlideId).toBe(control.id);
    expect(control.routedQueueLabel).toBe('IHC/Special Histochemistry Queue');
  });

  it('records an on-slide control instead of a second slide when controlMode is on_slide', () => {
    const specimen = makeSpecimen();
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [
      { stainType: ihcStain, orderKind: 'ihc', controlMode: 'on_slide' },
    ], { priority: 'Routine Sign-Out', slideMediaType: 'Standard Charged' }, actor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdStainIds.length).toBe(1);
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const clinical = block.stains.find(s => s.id === result.createdStainIds[0])!;
    expect(clinical.onSlideControlTissue).toBe('Tonsil');
  });

  it('routes a molecular order to Reference/Send-Out with the chosen facility, no workflow stage', () => {
    const molecular: StainType = { ...heStain, id: 'st-her2-fish', name: 'HER2 FISH', category: 'Molecular' };
    const specimen = makeSpecimen();
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [
      { stainType: molecular, orderKind: 'molecular' },
    ], { priority: 'Routine Sign-Out', slideMediaType: 'Standard Charged', sendOutReferenceLabFacilityId: 'fac-refA', sendOutReferenceLabName: 'Reference Lab A' }, actor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    const created = block.stains.find(s => s.id === result.createdStainIds[0])!;
    expect(created.routedQueueLabel).toBe('Reference/Send-Out Lab Queue');
    expect(created.routedWorkflowStage).toBeUndefined();
    expect(created.sendOutReferenceLabFacilityId).toBe('fac-refA');
  });

  it('refuses to order against an already-Exhausted block', () => {
    const specimen = makeSpecimen([makeBlock({ status: 'Exhausted' })]);
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [{ stainType: heStain, orderKind: 'recut' }], { priority: 'Routine Sign-Out', slideMediaType: 'Standard Charged' }, actor);
    expect(result.ok).toBe(false);
  });

  it('refuses with no lines', () => {
    const specimen = makeSpecimen();
    const result = createAddOnOrder(specimen, 'blk-1', 'S26-1001', [], { priority: 'Routine Sign-Out', slideMediaType: 'Standard Charged' }, actor);
    expect(result.ok).toBe(false);
  });
});

describe('stampPerformingLab', () => {
  it('stamps performingLabFacilityId only onto the given stain ids', () => {
    const specimen = makeSpecimen([makeBlock({ stains: [makeStain({ id: 's-a' }), makeStain({ id: 's-b' })] })]);
    const result = stampPerformingLab(specimen, 'blk-1', ['s-a'], 'lab-a');
    const block = result.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.find(s => s.id === 's-a')!.performingLabFacilityId).toBe('lab-a');
    expect(block.stains.find(s => s.id === 's-b')!.performingLabFacilityId).toBeUndefined();
  });
  it('is a no-op when performingLabFacilityId is undefined', () => {
    const specimen = makeSpecimen();
    const result = stampPerformingLab(specimen, 'blk-1', ['s-a'], undefined);
    expect(result).toBe(specimen);
  });
});

describe('computeAddOnTrackingStage', () => {
  it('derives Requested for a fresh order', () => {
    expect(computeAddOnTrackingStage(makeStain())).toBe('Requested');
  });
  it('derives Block Retrieved once blockRetrievedAt is set', () => {
    expect(computeAddOnTrackingStage(makeStain({ blockRetrievedAt: '2026-01-01T00:00:00Z' }))).toBe('Block Retrieved');
  });
  it('derives Cut / Pending Stain from status', () => {
    expect(computeAddOnTrackingStage(makeStain({ status: 'Cut & Placed' }))).toBe('Cut / Pending Stain');
    expect(computeAddOnTrackingStage(makeStain({ status: 'Staining' }))).toBe('Cut / Pending Stain');
  });
  it('derives Stained / QC from status', () => {
    expect(computeAddOnTrackingStage(makeStain({ status: 'Coverslipped' }))).toBe('Stained / QC');
    expect(computeAddOnTrackingStage(makeStain({ status: 'QC Failed' }))).toBe('Stained / QC');
  });
  it('derives Checked Out / Scanned from PS-286\'s own distributionStatus', () => {
    expect(computeAddOnTrackingStage(makeStain({ status: 'Coverslipped', distributionStatus: 'Checked Out' }))).toBe('Checked Out / Scanned');
    expect(computeAddOnTrackingStage(makeStain({ status: 'Coverslipped', distributionStatus: 'Loaded on Scanner' }))).toBe('Checked Out / Scanned');
  });
  it('derives Exception when an open exception exists, taking priority over status', () => {
    const stain = makeStain({ status: 'Cut & Placed', exception: { reason: 'Block exhausted', flaggedBy: 'u1', flaggedByName: 'Tech', flaggedAt: '2026-01-01', status: 'pending_pathologist_review' } });
    expect(computeAddOnTrackingStage(stain)).toBe('Exception');
  });
  it('derives Cancelled from status', () => {
    expect(computeAddOnTrackingStage(makeStain({ status: 'Cancelled' }))).toBe('Cancelled');
  });
});

describe('markBlockRetrieved', () => {
  it('sets blockRetrievedAt/By on the targeted order only', () => {
    const specimen = makeSpecimen([makeBlock({ stains: [makeStain({ id: 's-a' }), makeStain({ id: 's-b' })] })]);
    const result = markBlockRetrieved(specimen, 'blk-1', 's-a', actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.specimen.blocks!.find(b => b.id === 'blk-1')!;
    expect(block.stains.find(s => s.id === 's-a')!.blockRetrievedAt).toBeDefined();
    expect(block.stains.find(s => s.id === 's-b')!.blockRetrievedAt).toBeUndefined();
  });
});

describe('flagBlockExhaustion', () => {
  it('sets the block to Exhausted only for the "Block exhausted" reason', () => {
    const specimen = makeSpecimen();
    const result = flagBlockExhaustion(specimen, 'blk-1', specimen.blocks![0].stains[0].id, 'Block exhausted', 'Nothing left', actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.specimen.blocks![0].status).toBe('Exhausted');
    expect(result.specimen.blocks![0].stains[0].exception?.status).toBe('pending_pathologist_review');
    expect(result.specimen.blocks![0].stains[0].exceptionEvents?.length).toBe(1);
  });

  it('does NOT mark the block Exhausted for "Insufficient tissue for panel"', () => {
    const specimen = makeSpecimen();
    const result = flagBlockExhaustion(specimen, 'blk-1', specimen.blocks![0].stains[0].id, 'Insufficient tissue for panel', undefined, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.specimen.blocks![0].status).toBe('Embedded');
  });

  it('refuses a second exception while one is already open', () => {
    const stainId = 's-fixed';
    const specimen = makeSpecimen([makeBlock({ stains: [makeStain({ id: stainId, exception: { reason: 'Block exhausted', flaggedBy: 'u1', flaggedByName: 'Tech', flaggedAt: '2026-01-01', status: 'pending_pathologist_review' } })] })]);
    const result = flagBlockExhaustion(specimen, 'blk-1', stainId, 'Requires re-grossing', undefined, actor);
    expect(result.ok).toBe(false);
  });
});

describe('resolvePathologistException', () => {
  function specimenWithException() {
    const stainId = 's-fixed';
    return { specimen: makeSpecimen([makeBlock({ stains: [makeStain({ id: stainId, exception: { reason: 'Block exhausted', flaggedBy: 'u1', flaggedByName: 'Tech', flaggedAt: '2026-01-01', status: 'pending_pathologist_review' } })] })]), stainId };
  }

  it('approve_destructive_cut leaves order status alone but resolves the exception', () => {
    const { specimen, stainId } = specimenWithException();
    const result = resolvePathologistException(specimen, 'blk-1', stainId, 'approve_destructive_cut', 'Proceed anyway', undefined, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.specimen.blocks![0].stains[0];
    expect(order.exception?.status).toBe('approved_destructive_cut');
    expect(order.status).toBe('Pending Cut');
    expect(order.exceptionEvents?.length).toBe(1);
  });

  it('cancel sets the order status to Cancelled', () => {
    const { specimen, stainId } = specimenWithException();
    const result = resolvePathologistException(specimen, 'blk-1', stainId, 'cancel', undefined, undefined, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.specimen.blocks![0].stains[0].status).toBe('Cancelled');
  });

  it('modify applies changes, clears the exception, and resets status to Pending Cut', () => {
    const { specimen, stainId } = specimenWithException();
    const result = resolvePathologistException(specimen, 'blk-1', stainId, 'modify', 'Cut thinner', { levelDepthMicrons: 6 }, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.specimen.blocks![0].stains[0];
    expect(order.exception).toBeUndefined();
    expect(order.levelDepthMicrons).toBe(6);
    expect(order.status).toBe('Pending Cut');
  });

  it('refuses when there is no open exception', () => {
    const specimen = makeSpecimen();
    const result = resolvePathologistException(specimen, 'blk-1', specimen.blocks![0].stains[0].id, 'cancel', undefined, undefined, actor);
    expect(result.ok).toBe(false);
  });
});
