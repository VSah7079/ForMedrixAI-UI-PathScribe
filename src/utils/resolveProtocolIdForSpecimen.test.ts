// @vitest-environment happy-dom
//
// src/utils/resolveProtocolIdForSpecimen.test.ts
import { describe, it, expect } from 'vitest';
import { resolveProtocolIdForSpecimen } from './resolveProtocolIdForSpecimen';

describe('resolveProtocolIdForSpecimen — real resolution chain, tested against real, seeded dictionary data', () => {
  it('resolves the real, seeded Renal protocol for the real Kidney Biopsy, Native entry', async () => {
    const protocolId = await resolveProtocolIdForSpecimen('sp-kidney-native-biopsy');
    expect(protocolId).toBe('proto-medical-renal');
  });

  it('returns undefined for an unknown specimenDictionaryEntryId, never throws', async () => {
    await expect(resolveProtocolIdForSpecimen('sp-does-not-exist')).resolves.toBeUndefined();
  });

  it('returns undefined when specimenDictionaryEntryId itself is undefined — no unnecessary fetch', async () => {
    await expect(resolveProtocolIdForSpecimen(undefined)).resolves.toBeUndefined();
  });
});
