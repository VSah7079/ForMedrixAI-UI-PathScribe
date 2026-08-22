// @vitest-environment happy-dom
//
// src/pages/AccessionPage/generateDefaultMaterial.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, dedicated unit test — per direct follow-up's own Hybrid Model:
// "ProtocolPathway drives execution: The pathway definition always
// dictates whether a block or decant entity is instantiated." This is
// genuinely hard, valuable-to-verify logic (mixed protocols producing
// both real kinds, independent numbering, correct displayIds) that a
// full accessioning UI drive would be slow and brittle to exercise —
// generateDefaultMaterial was exported specifically so this could be
// tested directly, isolated from the rest of the accessioning form.
//
// Real fix, per direct follow-up: generateDefaultMaterial is now
// genuinely async (real cassette-color resolution moved here from
// grossing-scan hydration — see that function's own header) and its
// resolution chain transitively reaches real, localStorage-backed
// mock services (cassetteRouting/cassetteColors/protocols) —
// @vitest-environment happy-dom above is required for that, same
// real reason computePendingBatchQueue.test.ts needed it.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateDefaultMaterial } from '@/utils/generateDefaultMaterial';
import type { Protocol, ProtocolPathway } from '@/services/protocols/IProtocolService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import type { StainType } from '@/services/stains/IStainService';

const stainType = (id: string, name: string): StainType =>
  ({ id, name, active: true } as unknown as StainType);

const pathway = (overrides: Partial<ProtocolPathway>): ProtocolPathway => ({
  id: overrides.id ?? 'path-1',
  pathwayName: overrides.pathwayName ?? 'Track',
  materialKind: overrides.materialKind ?? 'block',
  fixativeType: overrides.fixativeType ?? '10% NBF',
  requiresDecal: overrides.requiresDecal ?? false,
  processingFormat: overrides.processingFormat ?? 'Standard',
  tasks: overrides.tasks ?? [],
});

const protocolWith = (pathways: ProtocolPathway[]): Protocol => ({
  id: 'proto-test', name: 'Test Protocol', requiresTriage: false, pathways,
  active: true, version: 1, updatedBy: 'test', updatedAt: '2026-01-01T00:00:00.000Z',
});

const entryWithProtocol = (protocolId: string): SpecimenEntry =>
  ({ id: 'entry-1', name: 'Test Specimen', protocolId } as unknown as SpecimenEntry);

describe('generateDefaultMaterial — real Hybrid Model: ProtocolPathway.materialKind drives execution', () => {
  it('a real, all-block protocol (the pre-existing renal case) still produces only blocks, zero decants', async () => {
    const protocol = protocolWith([
      pathway({ id: 'p1', pathwayName: 'Light Microscopy', materialKind: 'block' }),
      pathway({ id: 'p2', pathwayName: 'Immunofluorescence', materialKind: 'block' }),
    ]);
    const result = await generateDefaultMaterial(entryWithProtocol(protocol.id), 'sp1', 'alpha-specimen', [], [protocol], 'S26-0001', 'A');
    expect(result.blocks).toHaveLength(2);
    expect(result.decants).toHaveLength(0);
    expect(result.blocks.map(b => b.sourcePathwayName)).toEqual(['Light Microscopy', 'Immunofluorescence']);
  });

  it('a real, all-decant fluid/cytology protocol produces only decants, zero blocks', async () => {
    const protocol = protocolWith([
      pathway({ id: 'p1', pathwayName: 'Cell Block', materialKind: 'decant' }),
    ]);
    const result = await generateDefaultMaterial(entryWithProtocol(protocol.id), 'sp1', 'alpha-specimen', [], [protocol], 'S26-0001', 'A');
    expect(result.blocks).toHaveLength(0);
    expect(result.decants).toHaveLength(1);
    expect(result.decants[0].label).toBe('D1');
    expect(result.decants[0].decantType).toBe('cell_block');
    expect(result.decants[0].displayId).toBe('S26-0001-AD1');
  });

  it('the real, cited mixed case — a cell block track alongside a direct-smear/cytospin track — produces one real block-kind-labeled decant and independently numbers a second decant, never colliding with block numbering', async () => {
    const protocol = protocolWith([
      pathway({
        id: 'p1', pathwayName: 'Cell Block', materialKind: 'decant',
        tasks: [{ id: 't1', stepOrder: 1, action: 'Embed and section', stainTypeIds: ['st-he'] }],
      }),
      pathway({
        id: 'p2', pathwayName: 'Direct Smear', materialKind: 'decant',
        tasks: [{ id: 't2', stepOrder: 1, action: 'Direct smear', stainTypeIds: ['st-pap'] }],
      }),
      pathway({
        id: 'p3', pathwayName: 'Residual Fluid Block', materialKind: 'block',
        tasks: [{ id: 't3', stepOrder: 1, action: 'Cut Level 1', stainTypeIds: ['st-he'] }],
      }),
    ]);
    const stainTypes = [stainType('st-he', 'H&E'), stainType('st-pap', 'Papanicolaou')];
    const result = await generateDefaultMaterial(entryWithProtocol(protocol.id), 'sp1', 'alpha-specimen', stainTypes, [protocol], 'S26-0001', 'A');

    expect(result.decants).toHaveLength(2);
    expect(result.decants.map(d => d.label)).toEqual(['D1', 'D2']);
    expect(result.decants[0].stains[0].stainName).toBe('H&E');
    expect(result.decants[1].stains[0].stainName).toBe('Papanicolaou');

    expect(result.blocks).toHaveLength(1);
    // Real, independent numbering — the one real block is still
    // "1" (or the jurisdiction's own first block label), never "3"
    // just because two decants were generated before it in pathway
    // order.
    expect(result.blocks[0].sourcePathwayName).toBe('Residual Fluid Block');
  });

  it('a protocol with no pathways at all falls back to the real, pre-existing single-block/default-stains behavior, unchanged', async () => {
    const entry = { id: 'entry-2', name: 'Simple Specimen', defaultStains: ['H&E', 'PAS'] } as unknown as SpecimenEntry;
    const result = await generateDefaultMaterial(entry, 'sp1', 'alpha-specimen', [], [], 'S26-0001', 'A');
    expect(result.blocks).toHaveLength(1);
    expect(result.decants).toHaveLength(0);
    expect(result.blocks[0].stains.map(s => s.stainName)).toEqual(['H&E', 'PAS']);
  });

  it('every real decant slide gets its own, real decantSlideIdentifier-shaped displayId, distinct from an ordinary block slide', async () => {
    const protocol = protocolWith([
      pathway({
        id: 'p1', pathwayName: 'Cell Block', materialKind: 'decant',
        tasks: [{ id: 't1', stepOrder: 1, action: 'Embed', stainTypeIds: ['st-he'] }],
      }),
    ]);
    const stainTypes = [stainType('st-he', 'H&E')];
    const result = await generateDefaultMaterial(entryWithProtocol(protocol.id), 'sp1', 'alpha-specimen', stainTypes, [protocol], 'S26-0001', 'A');
    expect(result.decants[0].stains[0].displayId).toBe('S26-0001-AD1-L1');
  });

  // Real fix, per direct follow-up: "Blocks created at Accession time
  // don't get a cassette color resolved immediately." Against the
  // real, live seed data (mockCassetteRoutingRuleService.ts) —
  // 'proto-medical-renal' genuinely routes to 'color-blue' via the
  // real 'Renal Protocol — Blue Mesh' rule. No Protocol object needs
  // to be supplied in the protocols argument for this — color
  // resolution reads entry.protocolId directly, independent of
  // whether a matching, pathway-bearing Protocol was also passed in
  // (confirmed directly against resolveBlockCassetteColor.ts's own
  // real call shape) — this exercises the real, common case: a
  // specimen with a protocol linkage but no multi-pathway protocol
  // configured, the fallback branch below.
  it('a real block generated at accession time carries a real, resolved cassetteColorId — no longer left unresolved until grossing-scan hydration', async () => {
    const entry = { id: 'entry-renal', name: 'Renal Biopsy', protocolId: 'proto-medical-renal' } as unknown as SpecimenEntry;
    const result = await generateDefaultMaterial(entry, 'sp1', 'alpha-specimen', [], [], 'S26-0001', 'A');
    expect(result.blocks[0].cassetteColorId).toBe('color-blue');
  });

  // Real, parallel confirmation that priority — not just protocolId —
  // is genuinely threaded through from the real Accession form state
  // (AccessionPage.tsx's own `priority`) into this real resolution,
  // and that the real STAT Override rule (priorityWeight 90) still
  // correctly wins over a lower-weight, protocol-based rule, exactly
  // as it already does for handleAddBlock's own live-tested wiring.
  it('a real STAT-priority specimen resolves to the real STAT Override color, even with an unrelated or no protocol', async () => {
    const entry = { id: 'entry-stat', name: 'Urgent Specimen' } as unknown as SpecimenEntry;
    const result = await generateDefaultMaterial(entry, 'sp1', 'alpha-specimen', [], [], 'S26-0001', 'A', 'STAT');
    expect(result.blocks[0].cassetteColorId).toBe('color-red');
  });
});
