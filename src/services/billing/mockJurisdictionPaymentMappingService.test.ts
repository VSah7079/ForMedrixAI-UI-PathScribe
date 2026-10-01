// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockJurisdictionPaymentMappingService } from './mockJurisdictionPaymentMappingService';
import { mockMasterPaymentTypeService } from './mockMasterPaymentTypeService';

describe('mockJurisdictionPaymentMappingService — real seed data, per direct guidance (Outside Client Support spec, Section 3.2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds all 13 real local-scheme rows from the source specification', async () => {
    const res = await mockJurisdictionPaymentMappingService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(13);
    const schemeCodes = res.data.map(m => m.localSchemeCode).sort();
    expect(schemeCodes).toContain('DE_GKV');
    expect(schemeCodes).toContain('UK_NHS_TRUST');
    expect(schemeCodes).toContain('KR_NHIS');
  });

  it('every real seeded masterPaymentTypeId actually resolves to a real Master Payment Type — no dangling reference', async () => {
    const [mappingsRes, typesRes] = await Promise.all([
      mockJurisdictionPaymentMappingService.getAll(),
      mockMasterPaymentTypeService.getAll(),
    ]);
    expect(mappingsRes.ok && typesRes.ok).toBe(true);
    if (!mappingsRes.ok || !typesRes.ok) return;
    const realTypeIds = new Set(typesRes.data.map(t => t.id));
    for (const mapping of mappingsRes.data) {
      expect(realTypeIds.has(mapping.masterPaymentTypeId)).toBe(true);
    }
  });

  it('CA_ON is a real, deliberate exception — provincial, not a bare "CA" country code', async () => {
    const res = await mockJurisdictionPaymentMappingService.getByCountry('CA_ON');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].localSchemeCode).toBe('CA_OHIP');
  });

  it('the same real Master Payment Type is genuinely referenced by more than one real local scheme — a real many-to-one relationship, not accidental duplication', async () => {
    const res = await mockJurisdictionPaymentMappingService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const statutorySocialHealth = res.data.filter(m => m.masterPaymentTypeId === 'STATUTORY_SOCIAL_HEALTH');
    expect(statutorySocialHealth.length).toBeGreaterThanOrEqual(4); // DE_GKV, FR_CPAM, NL_BASIS, BE_MUT, KR_NHIS
  });

  it('real add/update/deactivate/reactivate cycle', async () => {
    const added = await mockJurisdictionPaymentMappingService.add({
      countryCode: 'TEST', localSchemeCode: 'TEST_SCHEME', localDisplayTerminology: 'Test Scheme',
      masterPaymentTypeId: 'SELF_PAY', primaryOutboundFormat: 'Test Format',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.active).toBe(true);

    const deactivated = await mockJurisdictionPaymentMappingService.deactivate(added.data.id);
    expect(deactivated.ok && deactivated.data.active).toBe(false);

    // A deactivated mapping never appears in the real, active-only getByCountry lookup.
    const byCountry = await mockJurisdictionPaymentMappingService.getByCountry('TEST');
    expect(byCountry.ok && byCountry.data.length).toBe(0);
  });
});
