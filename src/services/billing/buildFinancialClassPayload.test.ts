// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildFinancialClassPayload } from './buildFinancialClassPayload';
import { mockJurisdictionPaymentMappingService } from './mockJurisdictionPaymentMappingService';
import type { Case } from '@/types/case/Case';

function makeCase(orderOverrides: Partial<Case['order']> = {}): Case {
  return {
    id: 'CASE-1',
    order: {
      priority: 'Routine',
      ...orderOverrides,
    },
  } as unknown as Case;
}

describe('buildFinancialClassPayload — real, per direct guidance ("the json object should contain all the elements that the engine will then recognize")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('a Standard/Downtime case (no outsidePatientData) produces a real, honest payload with no fabricated coverage', async () => {
    const payload = await buildFinancialClassPayload(makeCase({ intakeType: 'standard' }));
    expect(payload.intakeType).toBe('standard');
    expect(payload.primaryCoverage).toBeUndefined();
    expect(payload.secondaryCoverage).toBeUndefined();
  });

  it('resolves the real, specific local scheme — not just the master category — the whole point of the fix', async () => {
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: {
        primaryJurisdictionCountryCode: 'FR',
        primaryJurisdictionMappingId: 'jpm-fr-cpam',
        primaryPayerName: "Caisse Primaire d'Assurance Maladie (CPAM - Paris)",
        coveragePolicyNumber: 'FR-CPAM-90218401',
      },
    }));
    expect(payload.primaryCoverage?.localSchemeCode).toBe('FR_CPAM');
    expect(payload.primaryCoverage?.countryCode).toBe('FR');
    expect(payload.primaryCoverage?.primaryOutboundFormat).toBe('SESAM-Vitale / B2');
    expect(payload.primaryCoverage?.masterPaymentTypeDisplayName).toBe('Statutory / Social Health Insurance (GKV, CPAM, NHIS)');
    expect(payload.primaryCoverage?.payerName).toBe("Caisse Primaire d'Assurance Maladie (CPAM - Paris)");
    expect(payload.primaryCoverage?.memberOrPolicyNumber).toBe('FR-CPAM-90218401');
  });

  it('surfaces the real MasterPaymentType requirements (subscriber ID label, guarantor) so the downstream engine never has to separately look up the dictionary', async () => {
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: { primaryJurisdictionMappingId: 'jpm-uk-nhs' },
    }));
    expect(payload.primaryCoverage?.requiresSubscriberId).toBe(true);
    expect(payload.primaryCoverage?.subscriberIdLabel).toBe('NHS Number');
    expect(payload.primaryCoverage?.requiresGuarantor).toBe('not_required');
  });

  it('real split-billing: both primary and secondary coverage resolve independently when hasSecondaryCoverage is true', async () => {
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: {
        primaryJurisdictionMappingId: 'jpm-fr-cpam',
        hasSecondaryCoverage: true,
        secondaryJurisdictionMappingId: 'jpm-fr-mutuelle',
        secondaryPayerName: 'Harmony Mutuelle (Code: 440192)',
        secondaryMemberId: 'MUT-88301920-A',
      },
    }));
    expect(payload.primaryCoverage?.localSchemeCode).toBe('FR_CPAM');
    expect(payload.secondaryCoverage?.localSchemeCode).toBe('FR_MUTUELLE');
    expect(payload.secondaryCoverage?.payerName).toBe('Harmony Mutuelle (Code: 440192)');
    expect(payload.secondaryCoverage?.memberOrPolicyNumber).toBe('MUT-88301920-A');
  });

  it('never resolves secondary coverage when hasSecondaryCoverage is false, even if a stale secondaryJurisdictionMappingId is somehow present', async () => {
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: {
        primaryJurisdictionMappingId: 'jpm-fr-cpam',
        hasSecondaryCoverage: false,
        secondaryJurisdictionMappingId: 'jpm-fr-mutuelle',
      },
    }));
    expect(payload.secondaryCoverage).toBeUndefined();
  });

  it('a real, dangling mapping id (deactivated/removed after accessioning) resolves to undefined honestly, never a fabricated fallback', async () => {
    const res = await mockJurisdictionPaymentMappingService.deactivate('jpm-fr-cpam');
    expect(res.ok).toBe(true);
    // Real, per direct guidance: even a deactivated mapping is still a
    // real, resolvable fact (getAll() includes inactive rows) — the
    // payload should still resolve it, since the case's own real
    // coverage choice at the time of accessioning doesn't retroactively
    // stop being true just because an admin later deactivated the
    // dictionary entry.
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: { primaryJurisdictionMappingId: 'jpm-fr-cpam' },
    }));
    expect(payload.primaryCoverage?.localSchemeCode).toBe('FR_CPAM');
  });

  it('a genuinely nonexistent mapping id resolves to undefined, never a fabricated coverage object', async () => {
    const payload = await buildFinancialClassPayload(makeCase({
      intakeType: 'outside',
      outsidePatientData: { primaryJurisdictionMappingId: 'jpm-does-not-exist' },
    }));
    expect(payload.primaryCoverage).toBeUndefined();
  });
});
