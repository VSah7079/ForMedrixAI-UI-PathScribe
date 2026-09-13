import { describe, it, expect } from 'vitest';
import { resolveHasAdvancedSignOutCertification } from './resolveHasAdvancedSignOutCertification';
import type { ProviderCredential } from '@/types/staff/ProviderCredential';

// Real, per direct guidance's own confirmed correction: a provider
// holds a real, raw, jurisdiction-specific credential (e.g. the UK's
// own IBMS_ASD) — the function checks the resulting, real, normalized
// capability (CYTO_ADVANCED_SPECIALIST), never the raw string itself.
const cred = (over: Partial<ProviderCredential> = {}): ProviderCredential => ({
  type: 'IBMS_ASD', issuingBody: 'IBMS', jurisdiction: 'GB_EW', effectiveDate: '2024-01-01', ...over,
});

describe('resolveHasAdvancedSignOutCertification', () => {
  it('a real, active, matching-jurisdiction raw credential normalizes to the required canonical capability', () => {
    expect(resolveHasAdvancedSignOutCertification([cred()], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(true);
  });

  it('undefined credentials never grant certification', () => {
    expect(resolveHasAdvancedSignOutCertification(undefined, 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(false);
  });

  it('a real credential issued for a different jurisdiction confers no authority for this one', () => {
    expect(resolveHasAdvancedSignOutCertification([cred({ jurisdiction: 'DE', type: 'DE_ZYTO_ASSISTENT_ADV' })], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(false);
  });

  it('a real, lapsed (expired) credential no longer grants certification', () => {
    const lapsed = cred({ expirationDate: '2025-06-01' });
    expect(resolveHasAdvancedSignOutCertification([lapsed], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(false);
  });

  it('a real credential with no expiration recorded is treated as currently valid, never assumed expired', () => {
    expect(resolveHasAdvancedSignOutCertification([cred()], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2030-01-01')).toBe(true);
  });

  it('a real credential not yet effective does not yet grant certification', () => {
    const future = cred({ effectiveDate: '2027-01-01' });
    expect(resolveHasAdvancedSignOutCertification([future], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(false);
  });

  it('a different real jurisdiction\'s own raw credential (Dutch NL_KCA_ADVANCED) normalizes to the same real canonical capability', () => {
    const dutch = cred({ type: 'NL_KCA_ADVANCED', jurisdiction: 'NL', issuingBody: 'KCA' });
    expect(resolveHasAdvancedSignOutCertification([dutch], 'NL', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(true);
  });

  it('an unrecognized raw credential type grants no capability, never fabricated', () => {
    expect(resolveHasAdvancedSignOutCertification([cred({ type: 'SOME_UNKNOWN_CREDENTIAL' })], 'GB_EW', 'CYTO_ADVANCED_SPECIALIST', '2026-01-01')).toBe(false);
  });
});
