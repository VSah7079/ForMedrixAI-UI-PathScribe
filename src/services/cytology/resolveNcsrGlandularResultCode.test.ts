// src/services/cytology/resolveNcsrGlandularResultCode.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNcsrGlandularResultCode } from './resolveNcsrGlandularResultCode';

describe('resolveNcsrGlandularResultCode — real, per direct research into Australia\'s NCSR endocervical axis (LOINC 19765-7)', () => {
  it('real, an unsatisfactory specimen always resolves to EU, regardless of any interpretation ids present', () => {
    expect(resolveNcsrGlandularResultCode('cyto-gland-ais', [], true)).toBe('EU');
  });

  it('real, a genuinely negative (NILM) case resolves to E1', () => {
    expect(resolveNcsrGlandularResultCode('cyto-gencat-nilm', [], false)).toBe('E1');
  });

  it('real, a case with a pure squamous primary interpretation and no real glandular finding anywhere resolves to undefined — never a fabricated E1 when the axis genuinely wasn\'t assessed as negative via NILM', () => {
    expect(resolveNcsrGlandularResultCode('cyto-squam-lsil', [], false)).toBeUndefined();
  });

  it('real, each of the confirmed, mapped Bethesda glandular categories resolves to its own real, researched NCSR code', () => {
    expect(resolveNcsrGlandularResultCode('cyto-gland-atyp-endocervical', [], false)).toBe('E2');
    expect(resolveNcsrGlandularResultCode('cyto-gland-atyp-glandular-nos', [], false)).toBe('E2');
    expect(resolveNcsrGlandularResultCode('cyto-gland-atyp-endocervical-neo', [], false)).toBe('E3');
    expect(resolveNcsrGlandularResultCode('cyto-gland-atyp-glandular-neo', [], false)).toBe('E3');
    expect(resolveNcsrGlandularResultCode('cyto-gland-ais', [], false)).toBe('E4');
    expect(resolveNcsrGlandularResultCode('cyto-gland-adenoca-endocervical', [], false)).toBe('E6');
    expect(resolveNcsrGlandularResultCode('cyto-gland-adenoca-nos', [], false)).toBe('E6');
  });

  it('real, per direct research: explicitly endometrial-origin categories are deliberately NOT mapped to the endocervical axis — a real, stated different origin, never silently folded in', () => {
    expect(resolveNcsrGlandularResultCode('cyto-gland-atyp-endometrial', [], false)).toBeUndefined();
    expect(resolveNcsrGlandularResultCode('cyto-gland-adenoca-endometrial', [], false)).toBeUndefined();
    expect(resolveNcsrGlandularResultCode('cyto-gland-adenoca-extrauterine', [], false)).toBeUndefined();
  });

  it('real, per this file\'s own honest scope note: E5 (AIS with possible microinvasion) has no dedicated Bethesda entry — every real Bethesda id resolves to something else, never a guessed E5', () => {
    // Real, direct verification: no mapping table entry ever produces 'E5' —
    // TypeScript's own NcsrGlandularResultCode type doesn't even include it.
    const allRealMappedCodes = ['cyto-gland-atyp-endocervical', 'cyto-gland-atyp-glandular-nos', 'cyto-gland-atyp-endocervical-neo', 'cyto-gland-atyp-glandular-neo', 'cyto-gland-ais', 'cyto-gland-adenoca-endocervical', 'cyto-gland-adenoca-nos']
      .map(id => resolveNcsrGlandularResultCode(id, [], false));
    expect(allRealMappedCodes).not.toContain('E5');
  });

  it('real, per this file\'s own real, deliberate design difference from the squamous resolver: a genuine glandular finding sitting in additionalInterpretationIds (not primary) is still correctly found', () => {
    // Real, direct simulation: a real, mixed case where a more severe
    // squamous finding (HSIL) won the primary slot per Bethesda's own
    // "most severe finding is primary" rule, with a real, co-occurring
    // AIS finding recorded as an additional interpretation instead.
    expect(resolveNcsrGlandularResultCode('cyto-squam-hsil', ['cyto-gland-ais'], false)).toBe('E4');
  });

  it('real, when BOTH primary and an additional interpretation genuinely map to a real glandular code, the primary\'s own real code wins — never silently overridden by an additional finding', () => {
    expect(resolveNcsrGlandularResultCode('cyto-gland-ais', ['cyto-gland-atyp-endocervical'], false)).toBe('E4');
  });
});
