// src/services/stains/stainCategoryLookup.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStainCategory, resolveStainType } from './stainCategoryLookup';
import type { StainType } from './IStainService';

function makeStainType(over: Partial<StainType> = {}): StainType {
  return {
    id: 'st-1', name: 'H&E', category: 'Routine', active: true, version: 1,
    updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

describe('resolveStainCategory — real fix: closes the gap StainOrder.stainName\'s own doc comment flagged', () => {
  it('resolves a real, exact stain name to its real category', () => {
    const types = [makeStainType({ name: 'ER', category: 'IHC' })];
    expect(resolveStainCategory('ER', types)).toBe('IHC');
  });

  it('matches case-insensitively and trims whitespace - real stain names are free-typed, not normalized keys', () => {
    const types = [makeStainType({ name: 'H&E', category: 'Routine' })];
    expect(resolveStainCategory(' h&e ', types)).toBe('Routine');
  });

  it('returns null, never a fabricated guess, for a genuinely unresolvable name', () => {
    const types = [makeStainType({ name: 'H&E', category: 'Routine' })];
    expect(resolveStainCategory('Not A Real Stain', types)).toBeNull();
  });

  it('returns null for an empty stain name', () => {
    expect(resolveStainCategory('', [makeStainType()])).toBeNull();
  });
});

describe('resolveStainType — real fix: the general-purpose lookup resolveStainCategory is now built on, giving callers the full real record (e.g. defaultBillingCode), not just category', () => {
  it('returns the full, real matched record, not just its category', () => {
    const types = [makeStainType({ name: 'Ki-67', category: 'IHC', antibodyClone: '30-9' })];
    const result = resolveStainType('Ki-67', types);
    expect(result?.antibodyClone).toBe('30-9');
  });

  it('returns null, never a fabricated record, for an unresolvable name', () => {
    expect(resolveStainType('Not A Real Stain', [makeStainType()])).toBeNull();
  });
});
