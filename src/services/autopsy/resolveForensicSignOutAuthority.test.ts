// src/services/autopsy/resolveForensicSignOutAuthority.test.ts — Batch 331 (PS-327).
import { describe, it, expect } from 'vitest';
import { resolveForensicSignOutAuthority } from './resolveForensicSignOutAuthority';

const appointment = (over = {}) => ({ type: 'MEDICOLEGAL_APPOINTMENT', issuingBody: 'OCME', jurisdiction: 'US' as const, effectiveDate: '2024-01-01', ...over });
const base = { caseAuthority: 'medicolegal_forensic' as const, jurisdiction: 'US' as const, asOfDate: '2026-09-25' };

describe('resolveForensicSignOutAuthority', () => {
  it('does not apply to hospital-consented autopsies', () => {
    expect(resolveForensicSignOutAuthority({ ...base, caseAuthority: 'hospital_consented', signerCredentials: [] })).toEqual({ required: false, allowed: true });
  });

  it('allows an active appointment for the case jurisdiction, including the UK Home Office register', () => {
    expect(resolveForensicSignOutAuthority({ ...base, signerCredentials: [appointment()] })).toEqual({ required: true, allowed: true });
    expect(resolveForensicSignOutAuthority({ ...base, jurisdiction: 'GB_EW',
      signerCredentials: [appointment({ type: 'UK_HO_REGISTERED_FORENSIC_PATHOLOGIST', jurisdiction: 'GB_EW' })] })).toEqual({ required: true, allowed: true });
  });

  it('refuses no appointment, another jurisdiction, not yet effective, expired, or a non-forensic credential', () => {
    const refused = (signerCredentials: any[]) => resolveForensicSignOutAuthority({ ...base, signerCredentials }).allowed;
    expect(refused([])).toBe(false);
    expect(refused([appointment({ jurisdiction: 'CA' })])).toBe(false);
    expect(refused([appointment({ effectiveDate: '2027-01-01' })])).toBe(false);
    expect(refused([appointment({ expirationDate: '2025-12-31' })])).toBe(false);
    expect(refused([appointment({ type: 'IBMS_ASD' })])).toBe(false);
  });

  it('refuses a forensic case with no jurisdiction rather than guessing', () => {
    expect(resolveForensicSignOutAuthority({ ...base, jurisdiction: undefined, signerCredentials: [appointment()] })).toEqual({ required: true, allowed: false });
  });
});
