// src/services/facilities/IFacilityService.test.ts
import { describe, it, expect } from 'vitest';
import { mockFacilityService } from './mockFacilityService';
import {
  resolveInterfaceEngineConnectionForFacility,
  resolveLisRoutingForFacility,
  resolveIdentifierFormatsForFacility,
  resolveUnionOfEnabledIdentifierFormatIds,
} from './IFacilityService';

describe('resolveInterfaceEngineConnectionForFacility — real, Enterprise-only, never a per-facility override', () => {
  it("resolves the real Enterprise's own connection directly, when the facility itself is the Enterprise", async () => {
    const res = await mockFacilityService.getById('c-trust-fenwick');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const conn = resolveInterfaceEngineConnectionForFacility(res.data, [res.data]);
    expect(conn?.endpoint).toBe('hl7://interface-engine.fenwicknhs.nhs.uk:2575');
  });

  it("resolves a real affiliate's connection from its real Enterprise parent, via a single parentId hop", async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const general = allRes.data.find(f => f.id === 'c-fenwick-general');
    expect(general).toBeTruthy();
    const conn = resolveInterfaceEngineConnectionForFacility(general!, allRes.data);
    expect(conn?.endpoint).toBe('hl7://interface-engine.fenwicknhs.nhs.uk:2575');
  });

  it('resolves undefined for a real facility with no Enterprise parent at all — a real configuration gap, never guessed', async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const metroGeneral = allRes.data.find(f => f.id === 'c1');
    expect(metroGeneral).toBeTruthy();
    const conn = resolveInterfaceEngineConnectionForFacility(metroGeneral!, allRes.data);
    expect(conn).toBeUndefined();
  });

  it('never resolves a connection value directly off a non-Enterprise facility, even if one were set there by mistake', async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const childrens = allRes.data.find(f => f.id === 'c-fenwick-childrens')!;
    // Real, defensive: even a hypothetical direct value on a
    // non-Enterprise facility must never be read - only the real
    // Enterprise parent's own connection is ever valid.
    const mutated = { ...childrens, interfaceEngineConnection: { endpoint: 'hl7://should-never-resolve:1', lisOwnsStatuses: true, allowPathScribePostFinalActions: true } };
    const conn = resolveInterfaceEngineConnectionForFacility(mutated, allRes.data);
    expect(conn?.endpoint).toBe('hl7://interface-engine.fenwicknhs.nhs.uk:2575');
  });
});

describe('resolveLisRoutingForFacility — real, per-facility overridable routing metadata', () => {
  it("resolves a real affiliate's own explicit override when set", async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const childrens = allRes.data.find(f => f.id === 'c-fenwick-childrens');
    expect(childrens).toBeTruthy();
    const routing = resolveLisRoutingForFacility(childrens!, allRes.data);
    expect(routing?.sendingFacilityId).toBe('FENWICK_CHILDRENS');
  });

  it("resolves the real Enterprise parent's own default routing when the facility has no override — real, confirmed inheritance", async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const general = allRes.data.find(f => f.id === 'c-fenwick-general');
    expect(general).toBeTruthy();
    expect(general!.lisRouting).toBeUndefined(); // confirms this is genuinely inherited, not also set directly
    const routing = resolveLisRoutingForFacility(general!, allRes.data);
    expect(routing?.sendingFacilityId).toBe('FENWICK_TRUST');
  });

  it('resolves undefined for a real facility with no override and no Enterprise parent', async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const metroGeneral = allRes.data.find(f => f.id === 'c1');
    expect(metroGeneral).toBeTruthy();
    const routing = resolveLisRoutingForFacility(metroGeneral!, allRes.data);
    expect(routing).toBeUndefined();
  });
});

describe('resolveIdentifierFormatsForFacility — real, Enterprise-default-with-override, same shape as LIS routing', () => {
  it("resolves the real Enterprise's own enabled formats directly, when the facility itself is the Enterprise", async () => {
    const res = await mockFacilityService.getById('c-trust-fenwick');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const selection = resolveIdentifierFormatsForFacility(res.data, [res.data]);
    expect(selection?.enabledFormatIds).toEqual(['accession_generic_uk', 'mrn_nhs']);
  });

  it("resolves a real affiliate's formats from its real Enterprise parent, via a single parentId hop — real, confirmed inheritance", async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const general = allRes.data.find(f => f.id === 'c-fenwick-general');
    expect(general).toBeTruthy();
    expect(general!.identifierFormats).toBeUndefined(); // confirms this is genuinely inherited, not also set directly
    const selection = resolveIdentifierFormatsForFacility(general!, allRes.data);
    expect(selection?.enabledFormatIds).toEqual(['accession_generic_uk', 'mrn_nhs']);
  });

  it('resolves undefined for a real facility with no override and no Enterprise parent', async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const metroGeneral = allRes.data.find(f => f.id === 'c1');
    expect(metroGeneral).toBeTruthy();
    const selection = resolveIdentifierFormatsForFacility(metroGeneral!, allRes.data);
    expect(selection).toBeUndefined();
  });
});

describe('resolveUnionOfEnabledIdentifierFormatIds — real, per direct guidance ("1 is fine"): union across every real Enterprise', () => {
  it("includes the real Fenwick Trust's own enabled formats in the union", async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    const union = resolveUnionOfEnabledIdentifierFormatIds(allRes.data);
    expect(union).toEqual(expect.arrayContaining(['accession_generic_uk', 'mrn_nhs']));
  });

  it('never includes a real, non-Enterprise facility\'s own override — only real Enterprise-level selections count toward the union', async () => {
    const allRes = await mockFacilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;
    // Real, defensive: a hypothetical identifierFormats value set
    // directly on a non-Enterprise facility must never be read by the
    // union - only a real Enterprise's own selection counts.
    const childrens = allRes.data.find(f => f.id === 'c-fenwick-childrens')!;
    const mutated = allRes.data.map(f => f.id === childrens.id
      ? { ...f, identifierFormats: { enabledFormatIds: ['should-never-appear'] } }
      : f);
    const union = resolveUnionOfEnabledIdentifierFormatIds(mutated);
    expect(union).not.toContain('should-never-appear');
  });

  it('returns an empty array, never throws, when no real Enterprise has configured this yet', () => {
    const union = resolveUnionOfEnabledIdentifierFormatIds([]);
    expect(union).toEqual([]);
  });
});
