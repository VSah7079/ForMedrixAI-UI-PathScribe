import { describe, it, expect } from 'vitest';
import { resolveNormalizedCredentialCapabilities } from './resolveNormalizedCredentialCapabilities';
import type { ProviderCredential } from '@/types/staff/ProviderCredential';

const cred = (over: Partial<ProviderCredential> = {}): ProviderCredential => ({
  type: 'IBMS_ASD', issuingBody: 'IBMS', jurisdiction: 'GB_EW', effectiveDate: '2024-01-01', ...over,
});

describe('resolveNormalizedCredentialCapabilities', () => {
  it('a real UK IBMS_ASD credential normalizes to the canonical CYTO_ADVANCED_SPECIALIST capability', () => {
    expect(resolveNormalizedCredentialCapabilities([cred()], 'GB_EW', '2026-01-01')).toEqual(['CYTO_ADVANCED_SPECIALIST']);
  });

  it('a real Dutch NL_KCA_ADVANCED credential normalizes to the same canonical capability', () => {
    const dutch = cred({ type: 'NL_KCA_ADVANCED', jurisdiction: 'NL', issuingBody: 'KCA' });
    expect(resolveNormalizedCredentialCapabilities([dutch], 'NL', '2026-01-01')).toEqual(['CYTO_ADVANCED_SPECIALIST']);
  });

  it('a real German DE_ZYTO_ASSISTENT_ADV credential also normalizes to the same canonical capability', () => {
    const german = cred({ type: 'DE_ZYTO_ASSISTENT_ADV', jurisdiction: 'DE', issuingBody: 'DGZ' });
    expect(resolveNormalizedCredentialCapabilities([german], 'DE', '2026-01-01')).toEqual(['CYTO_ADVANCED_SPECIALIST']);
  });

  it('a real credential for a different jurisdiction than the one being checked contributes no capability', () => {
    expect(resolveNormalizedCredentialCapabilities([cred({ jurisdiction: 'DE' })], 'GB_EW', '2026-01-01')).toEqual([]);
  });

  it('a real, lapsed credential contributes no capability', () => {
    expect(resolveNormalizedCredentialCapabilities([cred({ expirationDate: '2025-01-01' })], 'GB_EW', '2026-01-01')).toEqual([]);
  });

  it('an unrecognized raw credential type normalizes to nothing, never a fabricated capability', () => {
    expect(resolveNormalizedCredentialCapabilities([cred({ type: 'SOME_UNKNOWN_CREDENTIAL' })], 'GB_EW', '2026-01-01')).toEqual([]);
  });

  it('undefined credentials produce an empty, real result, never an error', () => {
    expect(resolveNormalizedCredentialCapabilities(undefined, 'GB_EW', '2026-01-01')).toEqual([]);
  });
});
