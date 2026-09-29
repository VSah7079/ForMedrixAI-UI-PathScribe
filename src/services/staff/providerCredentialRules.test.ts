// src/services/staff/providerCredentialRules.test.ts — Batch 331 (PS-327).
import { describe, it, expect } from 'vitest';
import { blankProviderCredential, normalizeProviderCredentials, providerCredentialChangeDetail, validateProviderCredentials } from './providerCredentialRules';

const good = { type: 'MEDICOLEGAL_APPOINTMENT', issuingBody: 'OCME', jurisdiction: 'US' as const, effectiveDate: '2024-01-01' };

describe('providerCredentialRules', () => {
  it('reports each missing field and a backwards date range, by row', () => {
    expect(validateProviderCredentials([good])).toEqual({});
    expect(validateProviderCredentials([good, blankProviderCredential()])).toEqual({
      1: ['typeRequired', 'issuingBodyRequired', 'jurisdictionRequired', 'effectiveDateRequired'],
    });
    expect(validateProviderCredentials([{ ...good, expirationDate: '2023-01-01' }])).toEqual({ 0: ['expiryBeforeEffective'] });
  });

  it('trims text and drops an empty expiry', () => {
    expect(normalizeProviderCredentials([{ ...good, type: ' MEDICOLEGAL_APPOINTMENT ', issuingBody: ' OCME ', expirationDate: '' }]))
      .toEqual([good]);
  });

  it('describes additions and removals for the audit log, and nothing when unchanged', () => {
    expect(providerCredentialChangeDetail('Jane Doe', [], [good]))
      .toBe('Jurisdictional credentials for Jane Doe: added MEDICOLEGAL_APPOINTMENT (OCME, US, 2024-01-01)');
    expect(providerCredentialChangeDetail('Jane Doe', [good], [{ ...good, expirationDate: '2027-01-01' }]))
      .toBe('Jurisdictional credentials for Jane Doe: added MEDICOLEGAL_APPOINTMENT (OCME, US, 2024-01-01 to 2027-01-01) | removed MEDICOLEGAL_APPOINTMENT (OCME, US, 2024-01-01)');
    expect(providerCredentialChangeDetail('Jane Doe', [good], [good])).toBeNull();
    expect(providerCredentialChangeDetail('Jane Doe', undefined, [])).toBeNull();
  });
});
