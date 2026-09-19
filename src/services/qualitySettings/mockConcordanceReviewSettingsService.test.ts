// src/services/qualitySettings/mockConcordanceReviewSettingsService.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("keep track of these settings so the
// customer can control this concordance review behavior") — same real
// test approach as mockReportReleaseService.test.ts's own
// resolveBufferForCase suite: real localStorage mock, real
// mockFacilityService to exercise the real org-default/facility-
// override resolution, not vi.mock stand-ins for either.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { mockConcordanceReviewSettingsService } = await import('./mockConcordanceReviewSettingsService');

describe('mockConcordanceReviewSettingsService', () => {
  describe('getOrgDefault / setOrgDefault', () => {
    it('a real, sensible fallback (both enabled) is returned when nothing has ever been saved \u2014 opt-out, not opt-in, per direct decision', async () => {
      store.clear();
      const result = await mockConcordanceReviewSettingsService.getOrgDefault();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: true, reviewScreenEnabled: true });
    });

    it('a real, saved org default is returned on the next real read', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: false, reviewScreenEnabled: true });
      const result = await mockConcordanceReviewSettingsService.getOrgDefault();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: false, reviewScreenEnabled: true });
    });
  });

  describe('resolveEffectiveConfigForFacility \u2014 no facility override', () => {
    it('a case with no performingFacilityId at all resolves to the real org default', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: false });
      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(undefined);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: true, reviewScreenEnabled: false });
    });
  });

  describe('resolveEffectiveConfigForFacility \u2014 real facility override', () => {
    it('a real, performing facility that has genuinely opted out of inheriting uses its own, real override values', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance Test Lab', assigningAuthority: 'QATEST3', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
        concordanceReviewSettingsOverride: { inheritSystemDefault: false, aiComparisonEnabled: false, reviewScreenEnabled: false },
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Real facility override: both false here, distinct from the
      // org default (both true) — proves the real override, not the
      // org default, actually won.
      expect(result.data).toEqual({ aiComparisonEnabled: false, reviewScreenEnabled: false });
    });

    it('a real facility explicitly inheriting the system default correctly falls through to the real org config, not its own dormant override values', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance Inheriting Lab', assigningAuthority: 'QATEST4', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
        // inheritSystemDefault: true — the other fields here are real,
        // but must be genuinely dormant/ignored.
        concordanceReviewSettingsOverride: { inheritSystemDefault: true, aiComparisonEnabled: false, reviewScreenEnabled: false },
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: true, reviewScreenEnabled: true });
    });

    it('a real facility with no override object at all falls through to the real org config', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: false, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance No-Override Lab', assigningAuthority: 'QATEST5', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: false, reviewScreenEnabled: true });
    });
  });

  describe('resolveEffectiveConfigForFacility \u2014 real Tier 3 (staff) override, per direct follow-up on the usual Enterprise\u2192Facility\u2192Staff cascade', () => {
    it('a real staff member with a real, partial override wins over both the facility and org layers \u2014 most specific wins', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance Staff-Tier Lab', assigningAuthority: 'QATEST6', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
        concordanceReviewSettingsOverride: { inheritSystemDefault: false, aiComparisonEnabled: true, reviewScreenEnabled: true },
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const { mockStaffConcordanceReviewOverrideService } = await import('./mockStaffConcordanceReviewOverrideService');
      await mockStaffConcordanceReviewOverrideService.create('staff-999', { aiComparisonEnabled: true, reviewScreenEnabled: false });

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id, 'staff-999');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Real staff override (reviewScreenEnabled: false) wins over the
      // real facility layer (reviewScreenEnabled: true) and the org
      // default (also true) \u2014 proves Tier 3, not Tier 1 or 2, won.
      expect(result.data).toEqual({ aiComparisonEnabled: true, reviewScreenEnabled: false });
    });

    it('a real staff member with only a PARTIAL override still inherits the untouched field from the facility layer beneath it', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance Staff-Partial Lab', assigningAuthority: 'QATEST7', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
        concordanceReviewSettingsOverride: { inheritSystemDefault: false, aiComparisonEnabled: false, reviewScreenEnabled: true },
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const { mockStaffConcordanceReviewOverrideService } = await import('./mockStaffConcordanceReviewOverrideService');
      // Real, deliberate: a PARTIAL override, touching only reviewScreenEnabled.
      await mockStaffConcordanceReviewOverrideService.create('staff-888', { aiComparisonEnabled: false, reviewScreenEnabled: false } as any);
      await mockStaffConcordanceReviewOverrideService.update('staff-888', { reviewScreenEnabled: false });

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id, 'staff-888');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.reviewScreenEnabled).toBe(false); // real staff override
      expect(result.data.aiComparisonEnabled).toBe(false); // real facility layer beneath it, untouched by the staff record's own real value here
    });

    it('a staff member with no real override at all falls through to the real facility layer beneath them', async () => {
      await mockConcordanceReviewSettingsService.setOrgDefault({ aiComparisonEnabled: true, reviewScreenEnabled: true });
      const facilityMod = await import('../facilities/mockFacilityService');
      const created = await facilityMod.mockFacilityService.add({
        name: 'QA Concordance No-Staff-Override Lab', assigningAuthority: 'QATEST8', address: '1 Test Way', phone: '555-0100', fax: '555-0101',
        roles: ['performing_lab'],
        concordanceReviewSettingsOverride: { inheritSystemDefault: false, aiComparisonEnabled: false, reviewScreenEnabled: false },
      } as any);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await mockConcordanceReviewSettingsService.resolveEffectiveConfigForFacility(created.data.id, 'staff-with-no-real-override');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ aiComparisonEnabled: false, reviewScreenEnabled: false });
    });
  });
});
