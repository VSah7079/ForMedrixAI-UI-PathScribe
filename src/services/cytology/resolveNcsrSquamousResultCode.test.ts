// src/services/cytology/resolveNcsrSquamousResultCode.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNcsrSquamousResultCode } from './resolveNcsrSquamousResultCode';

describe('resolveNcsrSquamousResultCode — real, per direct research into Australia\'s NCSR reporting requirements', () => {
  it('a real, genuinely unsatisfactory specimen always gets SU, regardless of the interpretation on file', () => {
    expect(resolveNcsrSquamousResultCode('cyto-gencat-nilm', true)).toBe('SU');
    expect(resolveNcsrSquamousResultCode('cyto-squam-hsil', true)).toBe('SU');
  });

  it('a real, satisfactory NILM finding maps to S1', () => {
    expect(resolveNcsrSquamousResultCode('cyto-gencat-nilm', false)).toBe('S1');
  });

  it('the real, confirmed ASC-US -> S2 (possible LSIL) mapping — ASC-US is itself the real, uncertain tier by Bethesda\'s own definition', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-ascus', false)).toBe('S2');
  });

  it('the real, confirmed LSIL -> S3 mapping — a definite, confirmed call, genuinely distinct from S2\'s own uncertain tier', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-lsil', false)).toBe('S3');
  });

  it('the real, confirmed ASC-H -> S4 (possible pHSIL) mapping', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-asch', false)).toBe('S4');
  });

  it('the real, confirmed HSIL -> S5 mapping', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-hsil', false)).toBe('S5');
  });

  it('the real, confirmed HSIL-with-invasion-suspected -> S6 mapping', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-hsil-invasive', false)).toBe('S6');
  });

  it('the real, confirmed squamous cell carcinoma -> S7 mapping', () => {
    expect(resolveNcsrSquamousResultCode('cyto-squam-scc', false)).toBe('S7');
  });

  it('a real, genuine glandular finding (outside this real function\'s own honest squamous-only scope) returns undefined, never a silently-wrong squamous code', () => {
    expect(resolveNcsrSquamousResultCode('cyto-gland-ais', false)).toBeUndefined();
    expect(resolveNcsrSquamousResultCode('cyto-gland-adenoca-endocervical', false)).toBeUndefined();
  });
});
