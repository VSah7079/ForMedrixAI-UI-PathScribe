// src/utils/resolveOutboundMolecularAssaysForProtocol.test.ts
import { describe, it, expect } from 'vitest';
import { resolveOutboundMolecularAssaysForProtocol } from './resolveOutboundMolecularAssaysForProtocol';
import type { Protocol, ProtocolPathway, PathwayTask } from '@/services/protocols/IProtocolService';

const task = (overrides: Partial<PathwayTask>): PathwayTask => ({
  id: overrides.id ?? 't1', stepOrder: overrides.stepOrder ?? 1, action: overrides.action ?? 'Cut Level 1',
  stainTypeIds: overrides.stainTypeIds ?? [], sendOutboundOrder: overrides.sendOutboundOrder,
});

const pathway = (overrides: Partial<ProtocolPathway>): ProtocolPathway => ({
  id: overrides.id ?? 'p1', pathwayName: overrides.pathwayName ?? 'Track', materialKind: overrides.materialKind ?? 'decant',
  fixativeType: overrides.fixativeType ?? 'PreservCyt', requiresDecal: overrides.requiresDecal ?? false,
  processingFormat: overrides.processingFormat ?? 'Standard', tasks: overrides.tasks ?? [],
});

const protocolWith = (pathways: ProtocolPathway[]): Protocol => ({
  id: 'proto-test', name: 'Test Protocol', requiresTriage: false, pathways,
  active: true, version: 1, updatedBy: 'test', updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('resolveOutboundMolecularAssaysForProtocol', () => {
  it('returns an empty array for an undefined protocol', () => {
    expect(resolveOutboundMolecularAssaysForProtocol(undefined)).toEqual([]);
  });

  it('returns an empty array for a protocol with no flagged tasks', () => {
    const protocol = protocolWith([pathway({ tasks: [task({ stainTypeIds: ['st-pap'], sendOutboundOrder: false })] })]);
    expect(resolveOutboundMolecularAssaysForProtocol(protocol)).toEqual([]);
  });

  it('the real, cited ThinPrep Pap co-testing case — Pap stain (not flagged, handled by the batch node) alongside HPV reflex (flagged) — returns only the flagged assay', () => {
    const protocol = protocolWith([
      pathway({
        id: 'p1', pathwayName: 'ThinPrep Slide', tasks: [
          task({ id: 't1', stainTypeIds: ['st-pap'], sendOutboundOrder: false }),
        ],
      }),
      pathway({
        id: 'p2', pathwayName: 'Molecular', tasks: [
          task({ id: 't2', stainTypeIds: ['st-hpv-reflex'], sendOutboundOrder: true }),
        ],
      }),
    ]);
    expect(resolveOutboundMolecularAssaysForProtocol(protocol)).toEqual(['st-hpv-reflex']);
  });

  it('flattens flagged tasks across multiple pathways and dedupes a repeated assay id', () => {
    const protocol = protocolWith([
      pathway({ id: 'p1', tasks: [task({ id: 't1', stainTypeIds: ['st-hpv-highrisk-screen'], sendOutboundOrder: true })] }),
      pathway({ id: 'p2', tasks: [task({ id: 't2', stainTypeIds: ['st-hpv-highrisk-screen', 'st-hpv-genotyping'], sendOutboundOrder: true })] }),
    ]);
    expect(resolveOutboundMolecularAssaysForProtocol(protocol)).toEqual(['st-hpv-highrisk-screen', 'st-hpv-genotyping']);
  });

  it('a protocol with no pathways at all returns an empty array, never throws', () => {
    expect(resolveOutboundMolecularAssaysForProtocol(protocolWith([]))).toEqual([]);
  });
});
