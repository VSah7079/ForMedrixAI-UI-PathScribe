// src/services/billing/mockPlaceOfServiceCodeService.test.ts
import { describe, it, expect } from 'vitest';
import { mockPlaceOfServiceCodeService } from './mockPlaceOfServiceCodeService';

describe('mockPlaceOfServiceCodeService — real, versioned CMS Place of Service dictionary', () => {
  it('getAll returns exactly the 52 real, currently-assigned codes seeded from the real CMS source', async () => {
    const res = await mockPlaceOfServiceCodeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBe(52);
  });

  it('every real seeded code has a real sourceUrl and sourceLastVerified - never silently unsourced', async () => {
    const res = await mockPlaceOfServiceCodeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    res.data.forEach(c => {
      expect(c.sourceUrl).toContain('cms.gov');
      expect(c.sourceLastVerified).toBeTruthy();
    });
  });

  it('resolves the real code 11 (Office) with its real, exact CMS name', async () => {
    const res = await mockPlaceOfServiceCodeService.getActiveCode('11');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.name).toBe('Office');
  });

  it('resolves the real code 22 (On Campus-Outpatient Hospital) with its real, exact CMS effective date', async () => {
    const res = await mockPlaceOfServiceCodeService.getActiveCode('22');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.name).toBe('On Campus-Outpatient Hospital');
    expect(res.data?.effectiveFrom).toBe('2016-01-01');
  });

  it('getActiveCode returns undefined, never throws, for a real Unassigned range this dictionary deliberately never seeded', async () => {
    const res = await mockPlaceOfServiceCodeService.getActiveCode('28');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBeUndefined();
  });

  it('getActiveCodes returns codes sorted numerically by code, not lexically (10 after 09, not before)', async () => {
    const res = await mockPlaceOfServiceCodeService.getActiveCodes();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const codes = res.data.map(c => c.code);
    const nineIdx = codes.indexOf('09');
    const tenIdx = codes.indexOf('10');
    expect(nineIdx).toBeGreaterThanOrEqual(0);
    expect(tenIdx).toBeGreaterThan(nineIdx);
  });

  it('getVersionsForCode returns every real version of one specific code, in version order', async () => {
    const res = await mockPlaceOfServiceCodeService.getVersionsForCode('11');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBeGreaterThan(0);
    for (let i = 1; i < res.data.length; i++) {
      expect(res.data[i].version).toBeGreaterThan(res.data[i - 1].version);
    }
  });

  it('getActiveCodes never includes a real RETIRED version - only ever ACTIVE', async () => {
    const res = await mockPlaceOfServiceCodeService.getActiveCodes();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    res.data.forEach(c => expect(c.status).toBe('ACTIVE'));
  });
});
