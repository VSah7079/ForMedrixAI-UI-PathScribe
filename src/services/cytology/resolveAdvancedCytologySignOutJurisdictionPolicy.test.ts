import { describe, it, expect } from 'vitest';
import { resolveAdvancedCytologySignOutJurisdictionPolicy } from './resolveAdvancedCytologySignOutJurisdictionPolicy';

describe('resolveAdvancedCytologySignOutJurisdictionPolicy', () => {
  it('the real, confirmed UK/NL/DE jurisdictions permit the advanced-CT exception', () => {
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('GB_EW').permitted).toBe(true);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('GB_SCT').permitted).toBe(true);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('GB_NIR').permitted).toBe(true);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('NL').permitted).toBe(true);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('DE').permitted).toBe(true);
  });

  it('the real, confirmed US/CA/FR/AU/NZ/KR jurisdictions do not permit the exception', () => {
    for (const j of ['US', 'CA', 'FR', 'AU', 'NZ', 'KR'] as const) {
      expect(resolveAdvancedCytologySignOutJurisdictionPolicy(j).permitted).toBe(false);
    }
  });

  it('a real, unconfirmed jurisdiction (IE, BE) defaults to the conservative false, never guessed permitted', () => {
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('IE').permitted).toBe(false);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('BE').permitted).toBe(false);
  });

  it('every real, permitted jurisdiction now uniformly requires the one, canonical CYTO_ADVANCED_SPECIALIST capability', () => {
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('GB_EW').acceptedCredentialTypes).toEqual(['CYTO_ADVANCED_SPECIALIST']);
    expect(resolveAdvancedCytologySignOutJurisdictionPolicy('NL').acceptedCredentialTypes).toEqual(['CYTO_ADVANCED_SPECIALIST']);
  });

  it('Germany is genuinely permitted and now has its own real, resolved canonical capability requirement \u2014 no longer an honest placeholder gap', () => {
    const policy = resolveAdvancedCytologySignOutJurisdictionPolicy('DE');
    expect(policy.permitted).toBe(true);
    expect(policy.acceptedCredentialTypes).toEqual(['CYTO_ADVANCED_SPECIALIST']);
  });
});
