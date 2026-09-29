// src/services/participationTypes/facilityAuthorityEditor.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildFacilityAuthorityRows,
  toggleFacilityOverride,
  setFacilityOverrideFlag,
  initialJustifications,
} from './facilityAuthorityEditor';
import type { ParticipationTypeRecord } from './IParticipationTypeService';
import type { Facility } from '../facilities/IFacilityService';

const UK = { id: 'lab-uk', name: 'Manchester', jurisdiction: 'GB_EW', roles: ['performing_lab'] } as unknown as Facility;
const US = { id: 'lab-us', name: 'Tucson', jurisdiction: 'US', roles: ['performing_lab'] } as unknown as Facility;

const stored: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident', description: '', color: '#000',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
  jurisdictionProfiles: { GB_EW: { canViewWholeCase: false, regulatoryNote: 'RCPath' } },
};
const draftOf = (t: ParticipationTypeRecord) => ({
  canFinalize: t.canFinalize, requiresCountersign: t.requiresCountersign, canViewWholeCase: t.canViewWholeCase,
  authorityOverrides: t.authorityOverrides, scopedJurisdictions: t.scopedJurisdictions,
});

describe('buildFacilityAuthorityRows', () => {
  it('one row per lab, with the resolved source and the jurisdiction\'s regulatory note', () => {
    const rows = buildFacilityAuthorityRows(stored, draftOf(stored), [UK, US]);
    expect(rows.map(r => r.facility.id)).toEqual(['lab-uk', 'lab-us']);
    expect(rows[0].resolved.canViewWholeCase).toMatchObject({ value: false, source: 'jurisdiction' });
    expect(rows[0].regulatoryNote).toBe('RCPath');
    expect(rows[1].resolved.canViewWholeCase).toMatchObject({ value: true, source: 'platform' });
    expect(rows[1].regulatoryNote).toBeUndefined();
  });

  it('resolves against the live draft — an unsaved edit to a platform flag is previewed', () => {
    const rows = buildFacilityAuthorityRows(stored, { ...draftOf(stored), canFinalize: true }, [US]);
    expect(rows[0].resolved.canFinalize.value).toBe(true);
  });

  it('a country-scoped type shows only its own jurisdictions\' labs — unless a lab already has an override', () => {
    const scoped = { ...stored, scopedJurisdictions: ['GB_EW' as const] };
    expect(buildFacilityAuthorityRows(scoped, draftOf(scoped), [UK, US]).map(r => r.facility.id)).toEqual(['lab-uk']);
    const withUsOverride = { ...scoped, authorityOverrides: { 'lab-us': { canFinalize: false } } };
    expect(buildFacilityAuthorityRows(withUsOverride, draftOf(withUsOverride), [UK, US]).map(r => r.facility.id)).toEqual(['lab-uk', 'lab-us']);
  });

  it('flags a new override, an edited override, and a reverted one correctly', () => {
    const withOverride = { ...stored, authorityOverrides: { 'lab-uk': { canFinalize: true } } };
    const base = draftOf(withOverride);
    expect(buildFacilityAuthorityRows(withOverride, base, [UK])[0]).toMatchObject({ enabled: true, unsaved: false, pendingRemoval: false });
    expect(buildFacilityAuthorityRows(withOverride, { ...base, authorityOverrides: { 'lab-uk': { canFinalize: false } } }, [UK])[0]).toMatchObject({ enabled: true, unsaved: true });
    expect(buildFacilityAuthorityRows(withOverride, { ...base, authorityOverrides: undefined }, [UK])[0]).toMatchObject({ enabled: false, pendingRemoval: true });
    expect(buildFacilityAuthorityRows(stored, { ...draftOf(stored), authorityOverrides: { 'lab-us': { canFinalize: false } } }, [US])[0]).toMatchObject({ enabled: true, unsaved: true, pendingRemoval: false });
  });
});

describe('toggleFacilityOverride', () => {
  it('a new override seeds from the INHERITED values (jurisdiction default), not the platform default', () => {
    expect(toggleFacilityOverride(stored, draftOf(stored), UK, true)).toEqual({
      'lab-uk': { canFinalize: false, requiresCountersign: true, canViewWholeCase: false },
    });
  });

  it('re-enabling a just-reverted override restores its stored values and provenance', () => {
    const prov = { canFinalize: true, overriddenBy: { userId: 'u', userName: 'Dr. A' }, overriddenAt: '2026-09-01T00:00:00Z', justification: 'MD ref' };
    const withOverride = { ...stored, authorityOverrides: { 'lab-uk': prov } };
    expect(toggleFacilityOverride(withOverride, { ...draftOf(withOverride), authorityOverrides: undefined }, UK, true)).toEqual({ 'lab-uk': prov });
  });

  it('switching off removes the entry; an empty map collapses to undefined', () => {
    const withOverride = { ...stored, authorityOverrides: { 'lab-uk': { canFinalize: true } } };
    expect(toggleFacilityOverride(withOverride, draftOf(withOverride), UK, false)).toBeUndefined();
  });
});

describe('setFacilityOverrideFlag / initialJustifications', () => {
  it('sets one flag without disturbing the rest of the entry or other facilities', () => {
    const before = { 'lab-uk': { canFinalize: false, requiresCountersign: true, justification: 'x' }, 'lab-au': { canFinalize: true } };
    expect(setFacilityOverrideFlag(before, 'lab-uk', 'canFinalize', true)).toEqual({
      'lab-uk': { canFinalize: true, requiresCountersign: true, justification: 'x' },
      'lab-au': { canFinalize: true },
    });
  });

  it('starts each stored override\'s justification field with its stored text', () => {
    expect(initialJustifications({ ...stored, authorityOverrides: { a: { justification: 'why' }, b: {} } })).toEqual({ a: 'why', b: '' });
    expect(initialJustifications(undefined)).toEqual({});
  });
});
