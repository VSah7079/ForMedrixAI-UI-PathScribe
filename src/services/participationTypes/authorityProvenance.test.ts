// src/services/participationTypes/authorityProvenance.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveAuthorityWithSource,
  resolveInheritedAuthority,
  stampFacilityOverrideChanges,
  buildFacilityOverrideAuditEntry,
} from './authorityProvenance';
import {
  AUTHORITY_FLAGS,
  resolveParticipationTypeAuthority,
  type ParticipationTypeRecord,
  type FacilityAuthorityOverride,
} from './IParticipationTypeService';
import type { Jurisdiction } from '../../types/systemConfig';

const type: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident / Fellow', description: '', color: '#000',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
  jurisdictionProfiles: {
    GB_EW: { requiresCountersign: true, canViewWholeCase: false, regulatoryNote: 'RCPath guidelines' },
  },
  authorityOverrides: {
    'lab-uk': {
      canFinalize: true,
      overriddenBy: { userId: 'u1', userName: 'Dr. Admin' },
      overriddenAt: '2026-09-01T10:00:00.000Z',
      justification: 'MD approval ref 14',
    },
  },
};

const actor = { userId: 'u2', userName: 'Jane Admin' };
const NOW = '2026-09-24T21:00:00.000Z';

describe('resolveAuthorityWithSource — transparent inheritance', () => {
  it('reports each flag\'s active value AND its source of truth, per tier', () => {
    const r = resolveAuthorityWithSource(type, 'lab-uk', 'GB_EW');
    expect(r.canFinalize).toMatchObject({ value: true, source: 'facility', overriddenBy: { userName: 'Dr. Admin' }, overriddenAt: '2026-09-01T10:00:00.000Z', justification: 'MD approval ref 14' });
    expect(r.requiresCountersign).toMatchObject({ value: true, source: 'jurisdiction', jurisdiction: 'GB_EW', regulatoryNote: 'RCPath guidelines' });
    expect(r.canViewWholeCase).toMatchObject({ value: false, source: 'jurisdiction' });
  });

  it('a lab in a jurisdiction with no profile, with no override, is entirely platform-default', () => {
    const r = resolveAuthorityWithSource(type, 'lab-us', 'US');
    for (const flag of AUTHORITY_FLAGS) expect(r[flag].source).toBe('platform');
  });

  it('ALWAYS agrees with resolveParticipationTypeAuthority() — what the admin sees is what the sign-out gate enforces', () => {
    const labs = [undefined, 'lab-uk', 'lab-other'];
    const jurisdictions: (Jurisdiction | undefined)[] = [undefined, 'GB_EW', 'US', 'AU'];
    for (const lab of labs) for (const j of jurisdictions) {
      const withSource = resolveAuthorityWithSource(type, lab, j);
      const enforced = resolveParticipationTypeAuthority(type, lab, j);
      for (const flag of AUTHORITY_FLAGS) expect(withSource[flag].value, `${lab}/${j}/${flag}`).toBe(enforced[flag]);
    }
  });
});

describe('resolveInheritedAuthority — what a new facility override is seeded from', () => {
  it('uses the jurisdiction default, NOT the raw platform default, so enabling an override changes nothing', () => {
    expect(resolveInheritedAuthority(type, 'GB_EW')).toEqual({ canFinalize: false, requiresCountersign: true, canViewWholeCase: false });
    // the old behavior would have seeded canViewWholeCase: true (platform) — a silent behavior change at a UK lab
    expect(type.canViewWholeCase).toBe(true);
  });

  it('ignores any existing facility override (it is the value the facility would have WITHOUT one)', () => {
    expect(resolveInheritedAuthority(type, 'GB_EW').canFinalize).toBe(false);
  });
});

describe('stampFacilityOverrideChanges — compliance audit trail', () => {
  const before = type.authorityOverrides!;

  it('an untouched override keeps its original provenance exactly — re-saving never looks like a re-approval', () => {
    const { overrides, changes } = stampFacilityOverrideChanges(before, { ...before }, {}, actor, NOW);
    expect(changes).toEqual([]);
    expect(overrides!['lab-uk']).toMatchObject({ overriddenBy: { userName: 'Dr. Admin' }, overriddenAt: '2026-09-01T10:00:00.000Z', justification: 'MD approval ref 14' });
  });

  it('an added override is stamped with who/when/why and reported with every flag', () => {
    const after = { ...before, 'lab-au': { canFinalize: false, requiresCountersign: true, canViewWholeCase: true } };
    const { overrides, changes } = stampFacilityOverrideChanges(before, after, { 'lab-au': '  Local credentialing scheme  ' }, actor, NOW);
    expect(overrides!['lab-au']).toMatchObject({ overriddenBy: actor, overriddenAt: NOW, justification: 'Local credentialing scheme' });
    expect(changes).toEqual([{
      facilityId: 'lab-au', kind: 'added', justification: 'Local credentialing scheme',
      flagChanges: [
        { flag: 'canFinalize', from: undefined, to: false },
        { flag: 'requiresCountersign', from: undefined, to: true },
        { flag: 'canViewWholeCase', from: undefined, to: true },
      ],
    }]);
  });

  it('a changed flag re-stamps provenance and reports only the flags that actually changed', () => {
    const after = { 'lab-uk': { ...before['lab-uk'], canFinalize: false } };
    const { overrides, changes } = stampFacilityOverrideChanges(before, after, { 'lab-uk': 'Credential lapsed' }, actor, NOW);
    expect(overrides!['lab-uk']).toMatchObject({ canFinalize: false, overriddenBy: actor, overriddenAt: NOW, justification: 'Credential lapsed' });
    expect(changes).toEqual([{ facilityId: 'lab-uk', kind: 'changed', justification: 'Credential lapsed', flagChanges: [{ flag: 'canFinalize', from: true, to: false }] }]);
  });

  it('a removed override (revert to inherited default) is still audited, with its justification', () => {
    const { overrides, changes } = stampFacilityOverrideChanges(before, undefined, { 'lab-uk': 'Exemption expired' }, actor, NOW);
    expect(overrides).toBeUndefined();
    expect(changes).toEqual([{
      facilityId: 'lab-uk', kind: 'removed', justification: 'Exemption expired',
      flagChanges: [
        { flag: 'canFinalize', from: true, to: undefined },
        { flag: 'requiresCountersign', from: undefined, to: undefined },
        { flag: 'canViewWholeCase', from: undefined, to: undefined },
      ],
    }]);
  });

  it('editing ONLY the justification is its own audited change', () => {
    const { overrides, changes } = stampFacilityOverrideChanges(before, { ...before }, { 'lab-uk': 'MD approval ref 14 (renewed 2026)' }, actor, NOW);
    expect(changes).toEqual([{ facilityId: 'lab-uk', kind: 'justification-updated', justification: 'MD approval ref 14 (renewed 2026)', flagChanges: [] }]);
    expect(overrides!['lab-uk']).toMatchObject({ overriddenBy: actor, overriddenAt: NOW });
  });

  it('a blank justification is recorded as none, never an empty string', () => {
    const after = { 'lab-x': { canFinalize: true } };
    const { overrides, changes } = stampFacilityOverrideChanges(undefined, after, { 'lab-x': '   ' }, actor, NOW);
    expect(overrides!['lab-x'].justification).toBeUndefined();
    expect(changes[0].justification).toBeUndefined();
  });

  it('never carries stale stored provenance fields onto a re-stamped entry', () => {
    const after: Record<string, FacilityAuthorityOverride> = { 'lab-uk': { ...before['lab-uk'], canFinalize: false } };
    const { overrides } = stampFacilityOverrideChanges(before, after, {}, actor, NOW);
    expect(overrides!['lab-uk'].overriddenBy).toEqual(actor);
  });
});

describe('buildFacilityOverrideAuditEntry', () => {
  it('records who, what changed (from → to), where, and why', () => {
    const e = buildFacilityOverrideAuditEntry(
      { facilityId: 'lab-uk', kind: 'changed', justification: 'Credential lapsed', flagChanges: [{ flag: 'canFinalize', from: true, to: false }] },
      'Resident / Fellow', 'Manchester Royal Infirmary', 'Jane Admin',
    );
    expect(e).toEqual({
      type: 'user',
      event: 'Signing-authority facility override changed',
      detail: 'Participation type "Resident / Fellow" at Manchester Royal Infirmary — canFinalize: true → false. Justification: "Credential lapsed"',
      user: 'Jane Admin',
      caseId: null,
      confidence: null,
      facilityId: 'lab-uk',
    });
  });

  it('says explicitly when no justification was given, so an auditor can tell omission from a logging gap', () => {
    const e = buildFacilityOverrideAuditEntry(
      { facilityId: 'lab-uk', kind: 'removed', flagChanges: [{ flag: 'canFinalize', from: true, to: undefined }] },
      'Resident', 'Lab', 'Jane',
    );
    expect(e.event).toBe('Signing-authority facility override removed (reverted to inherited default)');
    expect(e.detail).toContain('canFinalize: true → inherited');
    expect(e.detail).toContain('Justification: none given');
  });
});
