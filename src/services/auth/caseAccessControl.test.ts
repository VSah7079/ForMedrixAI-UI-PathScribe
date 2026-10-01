// src/services/auth/caseAccessControl.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseAccess, canFinalizeCase, deriveEligibleFinalizerIds, resolveFinalizeEligibleTypeIds, resolveCountersignRequiredTypeIds, resolvePediatricAccess, resolveOrchestrationAccess, type SessionUser, type CaseAccessSubspecialty, type CaseFinalizeParticipant, type CaseAccessFacility } from './caseAccessControl';
import type { Facility } from '../facilities/IFacilityService';
import type { ParticipationTypeRecord } from '../participationTypes/IParticipationTypeService';

const ORG_A = 'ORG-DVMC'; // real seeded org id, resolvable via resolveTenantFacility against ENTERPRISES below
const HOSP_A = 'HOSP-001'; // its real seeded originHospitalId — same real tenant, different legacy string

// Real, minimal Enterprise Facility fixture — same real shape
// resolveCaseAccess's own 4th parameter expects (Phase 1 of the
// Organisation/Site -> Facility migration). Deliberately self-
// contained here rather than importing mockFacilityService's own real
// seed data, so this test stays independent of that file's own
// content and doesn't silently start failing if that seed data
// changes for unrelated reasons.
const ENTERPRISES: Facility[] = [
  { id: 'fac-dvmc', name: 'Desert Valley Medical Center', assigningAuthority: 'DVMC', address: '', phone: '', fax: '', email: '', roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'US', reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false }, legacyTenantIds: [ORG_A, HOSP_A], status: 'Active' } as Facility,
];

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return { id: 'user-1', role: 'pathologist', organisationId: ORG_A, ...overrides };
}

describe('resolveCaseAccess — dimension 1 (tenant) unchanged from canAccessCase', () => {
  it('denies with no session', () => {
    const result = resolveCaseAccess(null, { originHospitalId: HOSP_A }, null, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('no-session');
  });

  it('denies with no case record', () => {
    const result = resolveCaseAccess(session(), null, null, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('no-case');
  });

  it('grants superadmin regardless of organisation', () => {
    const result = resolveCaseAccess(session({ role: 'superadmin', organisationId: undefined }), { originHospitalId: HOSP_A }, null, ENTERPRISES);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('superadmin');
  });

  it('denies a session with no organisationId resolved', () => {
    const result = resolveCaseAccess(session({ organisationId: undefined }), { originHospitalId: HOSP_A }, null, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('no-org');
  });

  it('denies a case whose organisation does not match the session', () => {
    const result = resolveCaseAccess(session({ organisationId: 'ORG-SOME-OTHER' }), { originHospitalId: HOSP_A }, null, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('tenant-mismatch');
  });

  it('grants a case in the same organisation, no subspecialty involved', () => {
    const result = resolveCaseAccess(session(), { originHospitalId: HOSP_A }, null, ENTERPRISES);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('pool-open');
  });
});

describe('resolveCaseAccess — dimension 3 (pool/subspecialty), the real new enforcement', () => {
  const restrictedSub: CaseAccessSubspecialty = { id: 'derm', userIds: ['member-1', 'member-2'], isWorkgroup: true, isWorkgroupEnabled: true };
  const disabledSub: CaseAccessSubspecialty = { id: 'derm', userIds: ['member-1'], isWorkgroup: true, isWorkgroupEnabled: false };
  const nonWorkgroupSub: CaseAccessSubspecialty = { id: 'gi', userIds: [], isWorkgroup: false, isWorkgroupEnabled: false };

  it('a non-member is denied when the pool has workgroup enforcement enabled', () => {
    const result = resolveCaseAccess(session({ id: 'outsider' }), { originHospitalId: HOSP_A, subspecialtyId: 'derm' }, restrictedSub, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('pool-restricted');
  });

  it('a real member is granted access to an enforced pool', () => {
    const result = resolveCaseAccess(session({ id: 'member-1' }), { originHospitalId: HOSP_A, subspecialtyId: 'derm' }, restrictedSub, ENTERPRISES);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('pool-member');
  });

  it('the real safety property: isWorkgroupEnabled=false means NO restriction, matching every currently seeded subspecialty — a non-member still gets access', () => {
    const result = resolveCaseAccess(session({ id: 'outsider' }), { originHospitalId: HOSP_A, subspecialtyId: 'derm' }, disabledSub, ENTERPRISES);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('pool-open');
  });

  it('a standard (non-workgroup) subspecialty never restricts, regardless of membership', () => {
    const result = resolveCaseAccess(session({ id: 'outsider' }), { originHospitalId: HOSP_A, subspecialtyId: 'gi' }, nonWorkgroupSub, ENTERPRISES);
    expect(result.granted).toBe(true);
  });

  it('superadmin bypasses pool restriction too', () => {
    const result = resolveCaseAccess(session({ role: 'superadmin' }), { originHospitalId: HOSP_A, subspecialtyId: 'derm' }, restrictedSub, ENTERPRISES);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('superadmin');
  });

  it('tenant boundary is still checked BEFORE pool membership — wrong org, right pool member, still denied', () => {
    const result = resolveCaseAccess(session({ id: 'member-1', organisationId: 'ORG-SOME-OTHER' }), { originHospitalId: HOSP_A, subspecialtyId: 'derm' }, restrictedSub, ENTERPRISES);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('tenant-mismatch');
  });
});

describe('canFinalizeCase — dimension 4 (case relationship) as a real write guard', () => {
  const primary: CaseFinalizeParticipant = { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] };
  const attending: CaseFinalizeParticipant = { staffId: 'attending-1', status: 'active', participationTypeIds: ['attending'] };
  const resident: CaseFinalizeParticipant = { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] };
  const removedPrimary: CaseFinalizeParticipant = { staffId: 'was-primary', status: 'removed', participationTypeIds: ['primary'] };

  it('denies with no session', () => {
    const result = canFinalizeCase(null, [primary]);
    expect(result.granted).toBe(false);
  });

  it('grants the assigned primary', () => {
    const result = canFinalizeCase(session({ id: 'primary-1' }), [primary, resident]);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('assigned-participant');
  });

  it('grants the assigned attending', () => {
    const result = canFinalizeCase(session({ id: 'attending-1' }), [attending]);
    expect(result.granted).toBe(true);
  });

  it('denies a resident who is on the case but not primary/attending — the real gap this closes', () => {
    const result = canFinalizeCase(session({ id: 'resident-1' }), [resident]);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('not-a-participant');
  });

  it('denies someone with no relationship to the case at all, even though they could VIEW it via resolveCaseAccess', () => {
    const result = canFinalizeCase(session({ id: 'random-viewer' }), [primary]);
    expect(result.granted).toBe(false);
  });

  it('denies a REMOVED primary — status must be active, not just a historical participation record', () => {
    const result = canFinalizeCase(session({ id: 'was-primary' }), [removedPrimary]);
    expect(result.granted).toBe(false);
  });

  it('grants an admin/pathologist-admin/superadmin regardless of case participation — the real supervisor override', () => {
    for (const role of ['admin', 'pathologist-admin', 'superadmin'] as const) {
      const result = canFinalizeCase(session({ id: 'someone-else', role }), [primary]);
      expect(result.granted).toBe(true);
      if (result.granted) expect(result.dimension).toBe('admin-override');
    }
  });

  it('denies a plain pathologist with no participant record at all (empty/undefined participants)', () => {
    expect(canFinalizeCase(session({ id: 'nobody' }), []).granted).toBe(false);
    expect(canFinalizeCase(session({ id: 'nobody' }), undefined).granted).toBe(false);
  });
});

// Real, per direct guidance ("Yes, complete the work" — wiring real
// enforcement for canFinalizeCase/deriveEligibleFinalizerIds to the
// ParticipationTypeRecord.canFinalize data model added in the prior
// pass). Deliberately mirrors mockParticipationTypeService.ts's own real
// SEED shape/values for 'primary'/'attending'/'resident' — the whole
// point of this suite is proving the real, data-driven lookup produces
// IDENTICAL default behavior to the old hardcoded literal, not a
// hand-picked fixture that happens to pass.
const PRIMARY_TYPE: ParticipationTypeRecord = {
  id: 'primary', label: 'Attending / Primary Pathologist', description: '', color: '#8AB4F8',
  allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 1,
  canFinalize: true, requiresCountersign: false,
};
const ATTENDING_TYPE: ParticipationTypeRecord = {
  id: 'attending', label: 'Co-Signer / Supervisor', description: '', color: '#818cf8',
  allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 3,
  canFinalize: true, requiresCountersign: false,
};
const RESIDENT_TYPE: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident / Fellow', description: '', color: '#60a5fa',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true,
};
const REAL_TYPES = [PRIMARY_TYPE, ATTENDING_TYPE, RESIDENT_TYPE];
const LAB_A = 'fac-lab-a';
const LAB_B = 'fac-lab-b';

describe('resolveFinalizeEligibleTypeIds — the real data-driven lookup replacing the old hardcoded literal', () => {
  it('falls back to the historic primary/attending default when no participationTypes are supplied at all', () => {
    expect(resolveFinalizeEligibleTypeIds(undefined)).toEqual(['primary', 'attending']);
    expect(resolveFinalizeEligibleTypeIds(null)).toEqual(['primary', 'attending']);
    expect(resolveFinalizeEligibleTypeIds([])).toEqual(['primary', 'attending']);
  });

  it('real, seeded data reproduces the exact same default — proves this is a genuine no-op upgrade for every existing customer', () => {
    expect(resolveFinalizeEligibleTypeIds(REAL_TYPES).sort()).toEqual(['attending', 'primary']);
  });

  it('a lab override that revokes canFinalize for a normally-eligible type excludes it, only for that lab', () => {
    const overridden: ParticipationTypeRecord = { ...PRIMARY_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: false } } };
    const types = [overridden, ATTENDING_TYPE, RESIDENT_TYPE];
    expect(resolveFinalizeEligibleTypeIds(types, LAB_A)).not.toContain('primary');
    expect(resolveFinalizeEligibleTypeIds(types, LAB_B)).toContain('primary');
    expect(resolveFinalizeEligibleTypeIds(types)).toContain('primary'); // no lab given → platform default
  });

  it('a lab override that GRANTS canFinalize to a normally-ineligible type includes it, only for that lab — the real feature this closes the loop on', () => {
    const overridden: ParticipationTypeRecord = { ...RESIDENT_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: true } } };
    const types = [PRIMARY_TYPE, ATTENDING_TYPE, overridden];
    expect(resolveFinalizeEligibleTypeIds(types, LAB_A)).toContain('resident');
    expect(resolveFinalizeEligibleTypeIds(types, LAB_B)).not.toContain('resident');
  });
});

describe('resolveCountersignRequiredTypeIds — PS-327, the requiresCountersign counterpart to resolveFinalizeEligibleTypeIds above', () => {
  it('resolves to an empty list when no participationTypes are supplied at all — no fallback list, unlike resolveFinalizeEligibleTypeIds (there is no pre-existing hardcoded literal this replaces)', () => {
    expect(resolveCountersignRequiredTypeIds(undefined)).toEqual([]);
    expect(resolveCountersignRequiredTypeIds(null)).toEqual([]);
    expect(resolveCountersignRequiredTypeIds([])).toEqual([]);
  });

  it('real, seeded data resolves exactly the one built-in type with requiresCountersign:true (resident) — primary/attending are excluded', () => {
    expect(resolveCountersignRequiredTypeIds(REAL_TYPES)).toEqual(['resident']);
  });

  it('a lab override that revokes requiresCountersign for a normally-required type excludes it, only for that lab', () => {
    const overridden: ParticipationTypeRecord = { ...RESIDENT_TYPE, authorityOverrides: { [LAB_A]: { requiresCountersign: false } } };
    const types = [PRIMARY_TYPE, ATTENDING_TYPE, overridden];
    expect(resolveCountersignRequiredTypeIds(types, LAB_A)).not.toContain('resident');
    expect(resolveCountersignRequiredTypeIds(types, LAB_B)).toContain('resident');
    expect(resolveCountersignRequiredTypeIds(types)).toContain('resident'); // no lab given → platform default
  });

  it('a lab override that IMPOSES requiresCountersign on a normally-unrestricted type includes it, only for that lab — the real feature PS-327 closes the loop on', () => {
    const overridden: ParticipationTypeRecord = { ...ATTENDING_TYPE, authorityOverrides: { [LAB_A]: { requiresCountersign: true } } };
    const types = [PRIMARY_TYPE, overridden, RESIDENT_TYPE];
    expect(resolveCountersignRequiredTypeIds(types, LAB_A)).toContain('attending');
    expect(resolveCountersignRequiredTypeIds(types, LAB_B)).not.toContain('attending');
  });

  it('a brand-new, admin-defined participation type (not one of the three built-ins) with requiresCountersign:true resolves into the list — this is the real gap this ticket closes: previously nothing outside a display badge ever consulted this flag', () => {
    const juniorRegistrar: ParticipationTypeRecord = {
      id: 'junior_registrar', label: 'Junior Registrar', description: '', color: '#f59e0b',
      allowsMultiple: true, requiresNote: false, active: true, isSystem: false, sortOrder: 9,
      canFinalize: false, requiresCountersign: true,
    };
    expect(resolveCountersignRequiredTypeIds([...REAL_TYPES, juniorRegistrar])).toEqual(['resident', 'junior_registrar']);
  });
});

describe('jurisdiction-bound authority — end-to-end through the real sign-out gate', () => {
  it('a country profile granting canFinalize lets that country\'s participant sign out, and only there', () => {
    const t: ParticipationTypeRecord = { ...RESIDENT_TYPE, jurisdictionProfiles: { AU: { canFinalize: true } } };
    const resident: CaseFinalizeParticipant = { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] };
    expect(canFinalizeCase(session({ id: 'resident-1' }), [resident], [PRIMARY_TYPE, ATTENDING_TYPE, t], LAB_A, 'AU').granted).toBe(true);
    expect(canFinalizeCase(session({ id: 'resident-1' }), [resident], [PRIMARY_TYPE, ATTENDING_TYPE, t], LAB_A, 'NZ').granted).toBe(false);
  });

  it('a lab-level exception still beats its own country\'s profile at the gate', () => {
    const t: ParticipationTypeRecord = {
      ...PRIMARY_TYPE,
      jurisdictionProfiles: { GB_EW: { canFinalize: true } },
      authorityOverrides: { [LAB_A]: { canFinalize: false } },
    };
    const primary: CaseFinalizeParticipant = { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] };
    expect(canFinalizeCase(session({ id: 'primary-1' }), [primary], [t, ATTENDING_TYPE, RESIDENT_TYPE], LAB_A, 'GB_EW').granted).toBe(false);
    expect(canFinalizeCase(session({ id: 'primary-1' }), [primary], [t, ATTENDING_TYPE, RESIDENT_TYPE], LAB_B, 'GB_EW').granted).toBe(true);
  });

  it('resolveCountersignRequiredTypeIds honors a country profile imposing countersign, only in that country', () => {
    const t: ParticipationTypeRecord = { ...ATTENDING_TYPE, jurisdictionProfiles: { KR: { requiresCountersign: true } } };
    expect(resolveCountersignRequiredTypeIds([PRIMARY_TYPE, t, RESIDENT_TYPE], undefined, 'KR')).toContain('attending');
    expect(resolveCountersignRequiredTypeIds([PRIMARY_TYPE, t, RESIDENT_TYPE], undefined, 'CA')).not.toContain('attending');
  });

  it('omitting jurisdiction reproduces the pre-existing lab-only behavior exactly', () => {
    const t: ParticipationTypeRecord = { ...RESIDENT_TYPE, jurisdictionProfiles: { AU: { canFinalize: true } } };
    expect(resolveFinalizeEligibleTypeIds([PRIMARY_TYPE, ATTENDING_TYPE, t], LAB_A)).toEqual(resolveFinalizeEligibleTypeIds(REAL_TYPES, LAB_A));
  });
});

describe('canFinalizeCase — end-to-end with real ParticipationTypeRecord data (lab-scoped authority actually governs sign-out)', () => {
  it('a resident is denied by default, even with real participationTypes supplied — same outcome as the hardcoded-fallback tests above', () => {
    const resident: CaseFinalizeParticipant = { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] };
    const result = canFinalizeCase(session({ id: 'resident-1' }), [resident], REAL_TYPES, LAB_A);
    expect(result.granted).toBe(false);
  });

  it('a resident IS granted at the one lab that overrode canFinalize:true for residents — the real, live effect of the admin screen this pass wires up', () => {
    const overriddenResident: ParticipationTypeRecord = { ...RESIDENT_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: true } } };
    const types = [PRIMARY_TYPE, ATTENDING_TYPE, overriddenResident];
    const resident: CaseFinalizeParticipant = { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] };
    expect(canFinalizeCase(session({ id: 'resident-1' }), [resident], types, LAB_A).granted).toBe(true);
    expect(canFinalizeCase(session({ id: 'resident-1' }), [resident], types, LAB_B).granted).toBe(false);
  });

  it('a primary IS denied at the one lab that revoked canFinalize for primaries, but still granted everywhere else', () => {
    const overriddenPrimary: ParticipationTypeRecord = { ...PRIMARY_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: false } } };
    const types = [overriddenPrimary, ATTENDING_TYPE, RESIDENT_TYPE];
    const primary: CaseFinalizeParticipant = { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] };
    expect(canFinalizeCase(session({ id: 'primary-1' }), [primary], types, LAB_A).granted).toBe(false);
    expect(canFinalizeCase(session({ id: 'primary-1' }), [primary], types, LAB_B).granted).toBe(true);
  });

  it('an admin/supervisor override still bypasses everything, lab-scoped authority included', () => {
    const overriddenPrimary: ParticipationTypeRecord = { ...PRIMARY_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: false } } };
    const primary: CaseFinalizeParticipant = { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] };
    const result = canFinalizeCase(session({ id: 'someone-else', role: 'admin' }), [primary], [overriddenPrimary], LAB_A);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('admin-override');
  });
});

describe('deriveEligibleFinalizerIds — the real denormalization dimension 4 server-side enforcement depends on', () => {
  it('includes an active primary participant', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] },
    ]);
    expect(ids).toContain('primary-1');
  });

  it('includes an active attending participant', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'attending-1', status: 'active', participationTypeIds: ['attending'] },
    ]);
    expect(ids).toContain('attending-1');
  });

  it('excludes a resident — same eligibility rule as canFinalizeCase, not a separate definition that could drift', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] },
    ]);
    expect(ids).not.toContain('resident-1');
  });

  it('excludes a REMOVED primary — a stale historical record must not remain eligible', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'was-primary', status: 'removed', participationTypeIds: ['primary'] },
    ]);
    expect(ids).not.toContain('was-primary');
  });

  it('handles null/undefined participants without throwing, returning an empty array', () => {
    expect(deriveEligibleFinalizerIds(null)).toEqual([]);
    expect(deriveEligibleFinalizerIds(undefined)).toEqual([]);
  });

  it('a participant with multiple roles including one eligible one is still included', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'multi-1', status: 'active', participationTypeIds: ['resident', 'attending'] },
    ]);
    expect(ids).toContain('multi-1');
  });

  it('with real participationTypes supplied, still reproduces the exact same default set — a genuine no-op upgrade', () => {
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] },
      { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] },
      { staffId: 'attending-1', status: 'active', participationTypeIds: ['attending'] },
    ], REAL_TYPES);
    expect(ids.sort()).toEqual(['attending-1', 'primary-1']);
  });

  it('a per-lab authorityOverride does NOT affect this chokepoint — deliberately platform-default only, per its own doc comment (no performingLabFacilityId parameter exists here)', () => {
    const overriddenResident: ParticipationTypeRecord = { ...RESIDENT_TYPE, authorityOverrides: { [LAB_A]: { canFinalize: true } } };
    const ids = deriveEligibleFinalizerIds([
      { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] },
    ], [PRIMARY_TYPE, ATTENDING_TYPE, overriddenResident]);
    expect(ids).not.toContain('resident-1');
  });

  it('real, end-to-end agreement: canFinalizeCase grants exactly the people deriveEligibleFinalizerIds includes', () => {
    const participants: CaseFinalizeParticipant[] = [
      { staffId: 'primary-1', status: 'active', participationTypeIds: ['primary'] },
      { staffId: 'resident-1', status: 'active', participationTypeIds: ['resident'] },
      { staffId: 'was-attending', status: 'removed', participationTypeIds: ['attending'] },
    ];
    const eligibleIds = deriveEligibleFinalizerIds(participants);
    for (const p of participants) {
      const decision = canFinalizeCase(session({ id: p.staffId }), participants);
      expect(decision.granted).toBe(eligibleIds.includes(p.staffId));
    }
  });
});

// Real, per direct investigation: pediatricAgeThreshold/patient.dateOfBirth
// are always resolved as a live age-at-evaluation-time calculation, not a
// stored age — these helpers build a dateOfBirth string for a patient of a
// given age *right now*, so the tests stay correct regardless of what date
// they actually run on, matching how the real functions themselves compute
// age from Date.now().
function dobForAge(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 1); // safely past the birthday, avoids an off-by-one at the exact boundary
  return d.toISOString();
}

const PED_FACILITY: CaseAccessFacility = {
  id: 'fac-peds',
  pediatricAgeThreshold: 18,
  authorizedPediatricPathologistIds: ['authorized-1'],
};

const NO_POLICY_FACILITY: CaseAccessFacility = {
  id: 'fac-no-policy',
  pediatricAgeThreshold: null,
  authorizedPediatricPathologistIds: [],
};

describe('resolvePediatricAccess — the real, unified pediatric gate (closes the isPedRestricted/canViewCase drift)', () => {
  it('denies with no session', () => {
    const result = resolvePediatricAccess(null, { patient: { dateOfBirth: dobForAge(10) } }, PED_FACILITY);
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('no-session');
  });

  it('grants when the facility has no pediatric policy configured (threshold null), regardless of patient age', () => {
    const result = resolvePediatricAccess(session(), { patient: { dateOfBirth: dobForAge(5) } }, NO_POLICY_FACILITY);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('no-restriction');
  });

  it('grants when facility is null/undefined entirely — no resolvable facility means no restriction, matching prior behavior', () => {
    expect(resolvePediatricAccess(session(), { patient: { dateOfBirth: dobForAge(5) } }, null).granted).toBe(true);
    expect(resolvePediatricAccess(session(), { patient: { dateOfBirth: dobForAge(5) } }, undefined).granted).toBe(true);
  });

  it('grants when the patient has no dateOfBirth at all — can\'t evaluate a threshold against an unknown age', () => {
    const result = resolvePediatricAccess(session(), { patient: {} }, PED_FACILITY);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('no-restriction');
  });

  it('grants a patient at or above the threshold — not a pediatric case', () => {
    const result = resolvePediatricAccess(session(), { patient: { dateOfBirth: dobForAge(18) } }, PED_FACILITY);
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('not-pediatric');
  });

  it('the real bug isPedRestricted had: a user with canViewPediatric but NOT on this facility\'s authorized list must still be denied', () => {
    const result = resolvePediatricAccess(
      session({ id: 'unlisted-user', canViewPediatric: true }),
      { patient: { dateOfBirth: dobForAge(10) } },
      PED_FACILITY
    );
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('pediatric-restricted');
  });

  it('the real bug canViewCase had (OR instead of AND): a user on the authorized list but WITHOUT canViewPediatric must still be denied', () => {
    const result = resolvePediatricAccess(
      session({ id: 'authorized-1', canViewPediatric: false }),
      { patient: { dateOfBirth: dobForAge(10) } },
      PED_FACILITY
    );
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('pediatric-restricted');
  });

  it('denies a user with neither condition met', () => {
    const result = resolvePediatricAccess(
      session({ id: 'nobody', canViewPediatric: false }),
      { patient: { dateOfBirth: dobForAge(10) } },
      PED_FACILITY
    );
    expect(result.granted).toBe(false);
  });

  it('grants only when BOTH canViewPediatric AND being on the authorized list are true — the real Option C dual gate', () => {
    const result = resolvePediatricAccess(
      session({ id: 'authorized-1', canViewPediatric: true }),
      { patient: { dateOfBirth: dobForAge(10) } },
      PED_FACILITY
    );
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('pediatric-authorized');
  });

  it('a facility with a different authorized list correctly denies a user authorized only at another facility', () => {
    const otherFacility: CaseAccessFacility = { id: 'fac-other', pediatricAgeThreshold: 18, authorizedPediatricPathologistIds: ['someone-else'] };
    const result = resolvePediatricAccess(
      session({ id: 'authorized-1', canViewPediatric: true }),
      { patient: { dateOfBirth: dobForAge(10) } },
      otherFacility
    );
    expect(result.granted).toBe(false);
  });
});

describe('resolveOrchestrationAccess — the real, unified Orchestration/Outreach gate', () => {
  it('denies with no session', () => {
    const result = resolveOrchestrationAccess(null, { reportingMode: 'orchestrator' });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('no-session');
  });

  it('grants a non-Orchestration case regardless of the canViewOrchestration flag', () => {
    const result = resolveOrchestrationAccess(session({ canViewOrchestration: false }), { reportingMode: 'assist' });
    expect(result.granted).toBe(true);
    if (result.granted) expect(result.dimension).toBe('no-restriction');
  });

  it('denies an Orchestration case for a user without canViewOrchestration', () => {
    const result = resolveOrchestrationAccess(session({ canViewOrchestration: false }), { reportingMode: 'orchestrator' });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.dimension).toBe('orchestration-restricted');
  });

  it('grants an Orchestration case for a user with canViewOrchestration', () => {
    const result = resolveOrchestrationAccess(session({ canViewOrchestration: true }), { reportingMode: 'orchestrator' });
    expect(result.granted).toBe(true);
  });

  it('denies by default when canViewOrchestration is simply absent (undefined), not just explicitly false', () => {
    const result = resolveOrchestrationAccess(session({}), { reportingMode: 'orchestrator' });
    expect(result.granted).toBe(false);
  });
});

describe('isCrossTenantSupportAccess (Batch 371)', async () => {
  const { isCrossTenantSupportAccess } = await import('./caseAccessControl');
  it('is true only for a superadmin session opening another organisation\'s case', () => {
    expect(isCrossTenantSupportAccess(session({ role: 'superadmin' }), { originHospitalId: 'HOSP-OTHER' }, ENTERPRISES)).toBe(true);
    expect(isCrossTenantSupportAccess(session({ role: 'superadmin', organisationId: undefined }), { originHospitalId: HOSP_A }, ENTERPRISES)).toBe(true);
    expect(isCrossTenantSupportAccess(session({ role: 'superadmin' }), { originHospitalId: HOSP_A }, ENTERPRISES)).toBe(false);
    expect(isCrossTenantSupportAccess(session(), { originHospitalId: 'HOSP-OTHER' }, ENTERPRISES)).toBe(false);
    expect(isCrossTenantSupportAccess(null, { originHospitalId: HOSP_A }, ENTERPRISES)).toBe(false);
  });
});
