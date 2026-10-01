// src/services/molecular/resolveMolecularScanVerification.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularScanVerification } from './resolveMolecularScanVerification';

const BATCH = { plateBarcode: 'PLT-HPV-20260906-012', targetInstrumentId: 'PANTHER_02', deckSlot: 'SLOT_A1' };

describe('resolveMolecularScanVerification — real, per the given specification\'s own §3.4', () => {
  it('a real, correct scan of both the plate barcode and deck location correctly fully verifies', () => {
    const result = resolveMolecularScanVerification(BATCH, 'PLT-HPV-20260906-012', 'LOC-INST-PANTHER_02-SLOT_A1');
    expect(result.plateVerified).toBe(true);
    expect(result.deckLocationVerified).toBe(true);
    expect(result.fullyVerified).toBe(true);
  });

  it('a real, mismatched plate barcode scan is correctly rejected, even when the deck location scan is correct', () => {
    const result = resolveMolecularScanVerification(BATCH, 'PLT-WRONG-20260906-099', 'LOC-INST-PANTHER_02-SLOT_A1');
    expect(result.plateVerified).toBe(false);
    expect(result.deckLocationVerified).toBe(true);
    expect(result.fullyVerified).toBe(false);
  });

  it('a real, mismatched deck location scan is correctly rejected, even when the plate scan is correct', () => {
    const result = resolveMolecularScanVerification(BATCH, 'PLT-HPV-20260906-012', 'LOC-INST-WRONG_INSTRUMENT-SLOT_A1');
    expect(result.deckLocationVerified).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('a real, genuinely missing scan (undefined) on either side never accidentally verifies', () => {
    const result = resolveMolecularScanVerification(BATCH, undefined, undefined);
    expect(result.fullyVerified).toBe(false);
  });

  it('a real batch with no deck slot assigned yet correctly never verifies the deck location, since there is nothing real to match against', () => {
    const result = resolveMolecularScanVerification({ ...BATCH, deckSlot: undefined }, 'PLT-HPV-20260906-012', 'LOC-INST-PANTHER_02-SLOT_A1');
    expect(result.deckLocationVerified).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });
});

describe('resolveMolecularScanVerification — the instrument\'s scan station (Batch 356, PS-326)', () => {
  const good = ['PLT-HPV-20260906-012', 'LOC-INST-PANTHER_02-SLOT_A1'] as const;
  it('a failed station check blocks dispatch; a pass or no check does not', () => {
    expect(resolveMolecularScanVerification(BATCH, ...good, false)).toMatchObject({ stationVerified: false, fullyVerified: false });
    expect(resolveMolecularScanVerification(BATCH, ...good, true).fullyVerified).toBe(true);
    expect(resolveMolecularScanVerification(BATCH, ...good).stationVerified).toBeNull();
    expect(resolveMolecularScanVerification(BATCH, ...good).fullyVerified).toBe(true);
  });
});
