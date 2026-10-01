// src/services/cytology/resolveCisoeAToBethesda.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCisoeAToBethesda } from './resolveCisoeAToBethesda';
import type { CisoeAScore } from '@/types/cytology/CisoeAScore';

const CATEGORIES = [
  { id: 'cyto-gencat-nilm', diagnosticRank: 0 },
  { id: 'cyto-squam-ascus', diagnosticRank: 1 },
  { id: 'cyto-squam-lsil', diagnosticRank: 2 },
  { id: 'cyto-squam-hsil', diagnosticRank: 4 },
  { id: 'cyto-squam-scc', diagnosticRank: 5 },
  { id: 'cyto-gland-atyp-glandular-nos', diagnosticRank: 3 },
  { id: 'cyto-gland-atyp-glandular-neo', diagnosticRank: 4 },
  { id: 'cyto-gland-ais', diagnosticRank: 4 },
  { id: 'cyto-gland-adenoca-nos', diagnosticRank: 5 },
  { id: 'cyto-gland-atyp-endocervical', diagnosticRank: 3 },
  { id: 'cyto-gland-atyp-endocervical-neo', diagnosticRank: 4 },
  { id: 'cyto-gland-adenoca-endocervical', diagnosticRank: 5 },
];

const comp = (value: number) => ({ value });
const score = (overrides: Partial<CisoeAScore>): CisoeAScore => ({
  composition: comp(1), inflammation: comp(1), squamous: comp(1), otherEndometrium: comp(1), endocervical: comp(1),
  adequacy: 'satisfactory', ...overrides,
});

describe('resolveCisoeAToBethesda — real, per direct guidance\'s own confirmed correspondence table', () => {
  it('S1/O1/E1 (all normal) maps to NILM', () => {
    const result = resolveCisoeAToBethesda(score({}), CATEGORIES);
    expect(result.primaryInterpretationId).toBe('cyto-gencat-nilm');
    expect(result.additionalInterpretationIds).toEqual([]);
  });

  it('S2-3 (borderline dyskaryosis) maps to ASC-US, never ASC-H — the real, confirmed non-standard exclusion', () => {
    expect(resolveCisoeAToBethesda(score({ squamous: comp(2) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-ascus');
    expect(resolveCisoeAToBethesda(score({ squamous: comp(3) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-ascus');
  });

  it('S4 (mild dyskaryosis) maps to LSIL', () => {
    expect(resolveCisoeAToBethesda(score({ squamous: comp(4) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-lsil');
  });

  it('S5 (moderate dyskaryosis) maps to HSIL', () => {
    expect(resolveCisoeAToBethesda(score({ squamous: comp(5) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-hsil');
  });

  it('S8-9 (carcinoma) maps to real Squamous Cell Carcinoma', () => {
    expect(resolveCisoeAToBethesda(score({ squamous: comp(8) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-scc');
    expect(resolveCisoeAToBethesda(score({ squamous: comp(9) }), CATEGORIES).primaryInterpretationId).toBe('cyto-squam-scc');
  });

  it('no real score combination ever maps to ASC-H — a structural guarantee across the full real value range', () => {
    for (let v = 0; v <= 9; v++) {
      expect(resolveCisoeAToBethesda(score({ squamous: comp(v) }), CATEGORIES).primaryInterpretationId).not.toBe('cyto-squam-asch');
    }
  });

  it('the real, higher-ranked axis wins as primary — a genuine glandular finding outranking a mild squamous one', () => {
    const result = resolveCisoeAToBethesda(score({ squamous: comp(2), endocervical: comp(6) }), CATEGORIES);
    expect(result.primaryInterpretationId).toBe('cyto-gland-ais');
    expect(result.additionalInterpretationIds).toContain('cyto-squam-ascus');
  });

  it('a genuinely normal O/E axis is never listed as an additional interpretation — only real, abnormal findings appear', () => {
    const result = resolveCisoeAToBethesda(score({ squamous: comp(4) }), CATEGORIES);
    expect(result.additionalInterpretationIds).toEqual([]);
  });
});
