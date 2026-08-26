import { describe, it, expect } from 'vitest';
import { shouldAutoUpgradeComplexity, getEffectiveComplexity } from './shouldAutoUpgradeComplexity';

describe('shouldAutoUpgradeComplexity - real, direct verification', () => {
  it('false when there is no real synoptic instance at all', () => {
    expect(shouldAutoUpgradeComplexity(undefined, true)).toBe(false);
  });

  it('false when the template is not diagnostic, even with real answers', () => {
    expect(shouldAutoUpgradeComplexity({ answers: { histologicGrade: 'Grade 2' } }, false)).toBe(false);
  });

  it('false when the diagnostic instance has no real answers yet - the real "provisional state" case the original spec flagged', () => {
    expect(shouldAutoUpgradeComplexity({ answers: {} }, true)).toBe(false);
  });

  it('false when every answer is genuinely empty (blank strings, empty arrays) - never mistaken for real content', () => {
    expect(shouldAutoUpgradeComplexity({ answers: { margins: '', lvi: '   ', nodes: [] } }, true)).toBe(false);
  });

  it('true when a real, diagnostic synoptic has at least one real string answer', () => {
    expect(shouldAutoUpgradeComplexity({ answers: { histologicGrade: 'Grade 2' } }, true)).toBe(true);
  });

  it('true when a real, diagnostic synoptic has at least one real array answer', () => {
    expect(shouldAutoUpgradeComplexity({ answers: { margins: [], lvi: ['Present'] } }, true)).toBe(true);
  });

  it('a mix of empty and real answers still resolves true - one real answer is enough', () => {
    expect(shouldAutoUpgradeComplexity({ answers: { procedure: '', histologicGrade: 'Grade 1' } }, true)).toBe(true);
  });
});

describe('getEffectiveComplexity - real, direct verification of the read-time resolution', () => {
  it('an explicit specimen.complexity always wins, regardless of any real synoptic evidence', () => {
    const result = getEffectiveComplexity(
      { complexity: 'GROSS_ONLY' },
      [{ instance: { answers: { histologicGrade: 'Grade 3' } }, templateIsDiagnostic: true }]
    );
    expect(result).toBe('GROSS_ONLY');
  });

  it('no explicit complexity, no real synoptic evidence: undefined, never a fabricated default', () => {
    expect(getEffectiveComplexity({}, [])).toBeUndefined();
    expect(getEffectiveComplexity({}, [{ instance: { answers: {} }, templateIsDiagnostic: true }])).toBeUndefined();
  });

  it('no explicit complexity, but real diagnostic synoptic evidence: resolves to GROSS_AND_MICRO', () => {
    const result = getEffectiveComplexity(
      {},
      [{ instance: { answers: { margins: 'Negative' } }, templateIsDiagnostic: true }]
    );
    expect(result).toBe('GROSS_AND_MICRO');
  });

  it('a real answer in a non-diagnostic (e.g. Grossing) instance never triggers the upgrade', () => {
    const result = getEffectiveComplexity(
      {},
      [{ instance: { answers: { pieceCount: '3' } }, templateIsDiagnostic: false }]
    );
    expect(result).toBeUndefined();
  });

  it('a specimen with multiple real synoptic instances upgrades if ANY one has real diagnostic evidence', () => {
    const result = getEffectiveComplexity(
      {},
      [
        { instance: { answers: {} }, templateIsDiagnostic: true },
        { instance: { answers: { lvi: 'Present' } }, templateIsDiagnostic: true },
      ]
    );
    expect(result).toBe('GROSS_AND_MICRO');
  });
});
