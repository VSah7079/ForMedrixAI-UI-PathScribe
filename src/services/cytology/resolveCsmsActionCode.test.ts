// src/services/cytology/resolveCsmsActionCode.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCsmsActionCode } from './resolveCsmsActionCode';

describe('resolveCsmsActionCode — real, per direct research into England\'s actual CSMS action codes', () => {
  it('a real, negative finding with no reasonForStudy specified gets routine recall (A) — the real, safe default', () => {
    expect(resolveCsmsActionCode(false)).toBe('A');
  });

  it('a real, negative finding taken as part of the NHS programme gets routine recall (A)', () => {
    expect(resolveCsmsActionCode(false, 'nhs_programme_invited')).toBe('A');
  });

  it('a real, abnormal finding requiring pathologist review always gets early repeat/referral (R), regardless of reasonForStudy', () => {
    expect(resolveCsmsActionCode(true)).toBe('R');
    expect(resolveCsmsActionCode(true, 'private_or_opportunistic')).toBe('R');
  });

  it('a real, negative finding taken as a private/opportunistic test (real OBR-31/reasonCode data) gets the real "no action" code (H)', () => {
    expect(resolveCsmsActionCode(false, 'private_or_opportunistic')).toBe('H');
  });
});
