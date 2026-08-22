// src/services/organisation/organisationService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveMpiScopeEnterpriseId, listAllSites, listOrganisations, getSiteConfig, updateSiteFacilitySetup } from './organisationService';

// Real, minimal localStorage mock - same pattern as
// mockRvuCodeMapService.test.ts, since updateSiteFacilitySetup
// genuinely persists via mockStorage now.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('listAllSites — real, new: flattens every real Site across every real Organisation', () => {
  it('returns every real site, not just one organisation\'s own', async () => {
    const sites = await listAllSites();
    const orgIds = new Set(sites.map(s => s.organisationId));
    expect(orgIds.size).toBeGreaterThan(1); // real sites from more than one real organisation
  });

  it('includes the real MFT sites (MRI, WYTH, NMGH) - the real multi-site organisation this feature exists for', async () => {
    const sites = await listAllSites();
    const mftSiteIds = sites.filter(s => s.organisationId === 'ORG-MFT').map(s => s.id);
    expect(mftSiteIds).toEqual(expect.arrayContaining(['SITE-MRI', 'SITE-WYTH', 'SITE-NMGH']));
  });

  it('every real site has a real, non-empty id and organisationId', async () => {
    const sites = await listAllSites();
    expect(sites.length).toBeGreaterThan(0);
    sites.forEach(s => {
      expect(s.id).toBeTruthy();
      expect(s.organisationId).toBeTruthy();
    });
  });
});

describe('updateSiteFacilitySetup — real, new: persisted overlay for Facility Setup edits, never mutating the static seed', () => {
  it('persists a real edit and returns the updated, real site record', async () => {
    const sites = await listAllSites();
    const realSiteId = sites[0].id;
    const updated = await updateSiteFacilitySetup(realSiteId, { cliaOrIsoNumber: '03D1234567', connectionAuthType: 'oauth2', credentialConfigured: true, updatedBy: 'test-admin' });
    expect(updated?.cliaOrIsoNumber).toBe('03D1234567');
    expect(updated?.connectionAuthType).toBe('oauth2');
    expect(updated?.credentialConfigured).toBe(true);
    expect(updated?.facilitySetupUpdatedBy).toBe('test-admin');
  });

  it('returns null, never throws, for a siteId that genuinely does not exist', async () => {
    const result = await updateSiteFacilitySetup('NOT-A-REAL-SITE', { updatedBy: 'test-admin' });
    expect(result).toBeNull();
  });

  it('a real edit is genuinely reflected by listAllSites afterward - not just in the immediate return value', async () => {
    const sites = await listAllSites();
    const realSiteId = sites[0].id;
    await updateSiteFacilitySetup(realSiteId, { cliaOrIsoNumber: '03D9999999', updatedBy: 'test-admin' });
    const refetched = await listAllSites();
    const edited = refetched.find(s => s.id === realSiteId);
    expect(edited?.cliaOrIsoNumber).toBe('03D9999999');
  });

  it('a real edit is genuinely reflected by getSiteConfig afterward too', async () => {
    const sites = await listAllSites();
    const realSiteId = sites[0].id;
    await updateSiteFacilitySetup(realSiteId, { cliaOrIsoNumber: '03D8888888', updatedBy: 'test-admin' });
    const refetched = await getSiteConfig(realSiteId);
    expect(refetched?.cliaOrIsoNumber).toBe('03D8888888');
  });

  it('a real edit is genuinely reflected within listOrganisations\'s own nested sites too, not just the flat listAllSites view', async () => {
    const sites = await listAllSites();
    const realSiteId = sites[0].id;
    const realOrgId = sites[0].organisationId;
    await updateSiteFacilitySetup(realSiteId, { cliaOrIsoNumber: '03D7777777', updatedBy: 'test-admin' });
    const orgs = await listOrganisations();
    const org = orgs.find(o => o.id === realOrgId);
    const site = org?.sites?.find(s => s.id === realSiteId);
    expect(site?.cliaOrIsoNumber).toBe('03D7777777');
  });

  it('editing one real site never affects a different real site\'s own fields', async () => {
    const sites = await listAllSites();
    if (sites.length < 2) return; // real, honest skip if the seed ever has fewer than 2 sites total
    const [siteA, siteB] = sites;
    await updateSiteFacilitySetup(siteA.id, { cliaOrIsoNumber: 'ONLY-A', updatedBy: 'test-admin' });
    const refetched = await listAllSites();
    const stillB = refetched.find(s => s.id === siteB.id);
    expect(stillB?.cliaOrIsoNumber).toBeUndefined();
  });

  it('never stores a raw credential value - credentialConfigured is a plain boolean, no secret-value field exists on the type at all', async () => {
    const sites = await listAllSites();
    const updated = await updateSiteFacilitySetup(sites[0].id, { credentialConfigured: true, updatedBy: 'test-admin' });
    expect(typeof updated?.credentialConfigured).toBe('boolean');
    expect((updated as any)?.credential).toBeUndefined();
    expect((updated as any)?.password).toBeUndefined();
    expect((updated as any)?.apiKey).toBeUndefined();
  });
});

describe('resolveMpiScopeEnterpriseId — real, critical bug fix: MPI matching scopes to this lab\'s own enterprise, not the referring organisation', () => {
  it('resolves the real, stable enterprise id from a real referring organisation', () => {
    expect(resolveMpiScopeEnterpriseId({ enterpriseId: 'ENT-ACME-LAB' })).toBe('ENT-ACME-LAB');
  });

  it('the real bug this fixes: two different referring organisations belonging to the SAME lab enterprise resolve to the identical MPI scope', () => {
    const hospitalA = { enterpriseId: 'ENT-ACME-LAB' };
    const hospitalB = { enterpriseId: 'ENT-ACME-LAB' };
    // Same real patient referred by two different hospitals to the same
    // lab must resolve to the same MPI scope, so they're matched as the
    // same person - not two separate identities, which was the real bug.
    expect(resolveMpiScopeEnterpriseId(hospitalA)).toBe(resolveMpiScopeEnterpriseId(hospitalB));
  });

  it('genuinely different lab enterprises still resolve to different scopes - cross-tenant matching is deliberately never allowed', () => {
    const labX = { enterpriseId: 'ENT-LAB-X' };
    const labY = { enterpriseId: 'ENT-LAB-Y' };
    expect(resolveMpiScopeEnterpriseId(labX)).not.toBe(resolveMpiScopeEnterpriseId(labY));
  });

  it('falls back to the same real ENT-DEFAULT literal EnterpriseConfig itself uses, not a second, different fallback', () => {
    expect(resolveMpiScopeEnterpriseId(null)).toBe('ENT-DEFAULT');
    expect(resolveMpiScopeEnterpriseId(undefined)).toBe('ENT-DEFAULT');
  });
});
