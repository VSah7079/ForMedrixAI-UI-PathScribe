import { describe, it, expect } from 'vitest';
import { isPathwayCountValid } from './resolvePathwayCountValidation';
import type { ProtocolPathway } from './IProtocolService';

function pathway(overrides: Partial<ProtocolPathway>): ProtocolPathway {
  return {
    id: 'p1', pathwayName: 'Track', materialKind: 'block', fixativeType: '10% NBF',
    requiresDecal: false, processingFormat: 'Standard', tasks: [],
    ...overrides,
  };
}

describe('isPathwayCountValid', () => {
  it('a real pathway with neither field set is genuinely valid \u2014 matches every existing protocol that predates this validation', () => {
    expect(isPathwayCountValid(pathway({}))).toBe(true);
  });

  it('a real, positive integer defaultCount on a block pathway is valid', () => {
    expect(isPathwayCountValid(pathway({ defaultCount: 4 }))).toBe(true);
  });

  it('a real, positive integer defaultPieceCount on a block pathway is valid', () => {
    expect(isPathwayCountValid(pathway({ materialKind: 'block', defaultPieceCount: 2 }))).toBe(true);
  });

  it('a real zero defaultCount is genuinely invalid \u2014 "0 blocks" is meaningless', () => {
    expect(isPathwayCountValid(pathway({ defaultCount: 0 }))).toBe(false);
  });

  it('a real negative defaultCount is genuinely invalid', () => {
    expect(isPathwayCountValid(pathway({ defaultCount: -1 }))).toBe(false);
  });

  it('a real non-integer defaultCount is genuinely invalid', () => {
    expect(isPathwayCountValid(pathway({ defaultCount: 2.5 }))).toBe(false);
  });

  it('a real zero or negative defaultPieceCount is genuinely invalid, same as defaultCount', () => {
    expect(isPathwayCountValid(pathway({ materialKind: 'block', defaultPieceCount: 0 }))).toBe(false);
    expect(isPathwayCountValid(pathway({ materialKind: 'block', defaultPieceCount: -3 }))).toBe(false);
  });

  it('a real defaultPieceCount set on a decant pathway is genuinely invalid \u2014 only meaningful for materialKind: block', () => {
    expect(isPathwayCountValid(pathway({ materialKind: 'decant', defaultPieceCount: 2 }))).toBe(false);
  });

  it('a real decant pathway with defaultCount set (but no defaultPieceCount) stays valid \u2014 defaultCount applies to both material kinds', () => {
    expect(isPathwayCountValid(pathway({ materialKind: 'decant', defaultCount: 3 }))).toBe(true);
  });

  it('a real decant pathway with neither field set stays valid', () => {
    expect(isPathwayCountValid(pathway({ materialKind: 'decant' }))).toBe(true);
  });
});
