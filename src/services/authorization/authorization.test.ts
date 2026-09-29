import { describe, it, expect } from 'vitest';
import {
  ALL_CAPABILITY_KEYS, CAPABILITY_CATALOG, CAPABILITY_GROUPS, capabilitiesByGroup, catalogProblems,
  type CapabilityDefinition,
} from './capabilityCatalog';
import { dependentsOf, planGrant, planRevoke, requirementsOf, unknownCapabilities, unmetRequirements } from './capabilityDependencies';
import { capabilityAuditEntry, evaluateCapability, grantedCapabilities, heldRoles, type AuthzRole, type AuthzSubject } from './evaluateCapability';
import { applyCapabilitySeeds, CAPABILITY_SEEDS, customRoleScreenSeed, type SeedableRole } from './capabilitySeeds';
import { roleCapabilityProblem } from './roleCapabilityRules';
import { createAuthorizationService } from './authorizationService';

// A small catalog with a chain: c needs b, b needs a; d is on its own.
const T: CapabilityDefinition[] = [
  { key: 'x:a:export', labelId: 'a', group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'x:b:export', labelId: 'b', group: 'qaOperations', risk: 'high', requires: ['x:a:export'] },
  { key: 'x:c:export', labelId: 'c', group: 'qaCapa', risk: 'high', requires: ['x:b:export'] },
  { key: 'x:d:view', labelId: 'd', group: 'qaCapa', risk: 'standard', requires: [] },
];

describe('capability catalog', () => {
  it('is sound: domain:object:verb keys, unique, known groups, known requirements, no cycles', () => {
    expect(catalogProblems(CAPABILITY_CATALOG)).toEqual([]);
  });
  it('has one capability per QA report export, plus the change-history export', () => {
    const qa = ALL_CAPABILITY_KEYS.filter(k => k.startsWith('qa:') && k.endsWith(':export'));
    expect(qa).toHaveLength(14);
    expect(ALL_CAPABILITY_KEYS).toContain('report:change-history:export');
  });
  it('the evidence binder requires the dashboard it lists the records of', () => {
    expect(requirementsOf('qa:inspection-evidence:export')).toEqual(['qa:activity-dashboard:export']);
  });
  it('groups for display in the set order, leaving empty groups out', () => {
    const groups = capabilitiesByGroup().map(g => g.group);
    expect(groups).toEqual(CAPABILITY_GROUPS.filter(g => groups.includes(g)));
    expect(capabilitiesByGroup().flatMap(g => g.capabilities)).toHaveLength(CAPABILITY_CATALOG.length);
  });
  it('reports a bad key, a duplicate, an unknown requirement and a cycle', () => {
    const problems = catalogProblems([
      { key: 'Bad Key', labelId: 'p', group: 'qaCapa', risk: 'high', requires: [] },
      { key: 'x:a:export', labelId: 'q', group: 'qaCapa', risk: 'high', requires: ['x:b:export'] },
      { key: 'x:b:export', labelId: 'r', group: 'qaCapa', risk: 'high', requires: ['x:a:export', 'x:zz:export'] },
    ]).concat(catalogProblems([
      { key: 'x:e:export', labelId: 's', group: 'qaCapa', risk: 'high', requires: [] },
      { key: 'x:e:export', labelId: 't', group: 'qaCapa', risk: 'high', requires: [] },
    ]));
    expect(problems.some(p => p.includes('Bad Key'))).toBe(true);
    expect(problems.some(p => p.includes('duplicate key'))).toBe(true);
    expect(problems.some(p => p.includes('requires unknown x:zz:export'))).toBe(true);
    expect(problems.some(p => p.includes('cycle'))).toBe(true);
  });
});

describe('capability dependencies', () => {
  it('follows requirements and dependents through the chain', () => {
    expect(requirementsOf('x:c:export', T)).toEqual(['x:a:export', 'x:b:export']);
    expect(dependentsOf('x:a:export', T)).toEqual(['x:b:export', 'x:c:export']);
    expect(dependentsOf('x:d:view', T)).toEqual([]);
  });
  it('turning on c offers the missing requirements, not the ones already granted', () => {
    expect(planGrant([], ['x:c:export'], T)).toEqual({
      requested: ['x:c:export'], missingRequirements: ['x:a:export', 'x:b:export'], withRequirements: ['x:a:export', 'x:b:export', 'x:c:export'],
    });
    expect(planGrant(['x:a:export'], ['x:c:export'], T).missingRequirements).toEqual(['x:b:export']);
    expect(planGrant([], ['x:d:view'], T).missingRequirements).toEqual([]);
  });
  it('turning on a group that contains the requirement needs nothing more', () => {
    expect(planGrant([], ['x:a:export', 'x:b:export'], T).missingRequirements).toEqual([]);
  });
  it('turning off a warns about granted dependents only', () => {
    expect(planRevoke(['x:a:export', 'x:b:export', 'x:d:view'], ['x:a:export'], T)).toEqual({
      requested: ['x:a:export'], affectedDependents: ['x:b:export'], withDependents: ['x:d:view'],
    });
    expect(planRevoke(['x:a:export', 'x:b:export', 'x:c:export'], ['x:b:export', 'x:c:export'], T).affectedDependents).toEqual([]);
  });
  it('finds broken pairs and unknown keys', () => {
    expect(unmetRequirements(['x:c:export', 'x:a:export'], T)).toEqual([{ capability: 'x:c:export', missing: ['x:b:export'] }]);
    expect(unmetRequirements(['x:a:export', 'x:b:export'], T)).toEqual([]);
    expect(unknownCapabilities(['x:a:export', 'nope'], T)).toEqual(['nope']);
  });
  it('the role service refuses a role holding a capability without its requirement, or an unknown key', () => {
    expect(roleCapabilityProblem(['qa:inspection-evidence:export'])).toContain('requires qa:activity-dashboard:export');
    expect(roleCapabilityProblem(['qa:inspection-evidence:export', 'qa:activity-dashboard:export'])).toBeNull();
    expect(roleCapabilityProblem(['qa:everything:export'])).toContain('Unknown capability');
  });
});

describe('evaluateCapability', () => {
  const roles: AuthzRole[] = [
    { id: 'pathologist', name: 'Pathologist', capabilities: [] },
    { id: 'qa-reviewer', name: 'QA Reviewer', capabilities: ['x:a:export', 'x:b:export'] },
    { id: 'half', name: 'Half', capabilities: ['x:c:export'] },
    { id: 'superadmin', name: 'Superadmin', capabilities: ['x:a:export', 'x:b:export', 'x:c:export', 'x:d:view'], assignable: false },
  ];
  const who = (staffRoles: string[], sessionRole = 'pathologist'): AuthzSubject => ({ userId: 'U1', userName: 'Dr A', sessionRole, staffRoles });

  it('allows what a held role grants, naming the role', () => {
    const d = evaluateCapability(who(['Pathologist', 'QA Reviewer']), 'x:b:export', roles, { caseId: 'S1' }, T);
    expect(d).toMatchObject({ allowed: true, grantedBy: [{ id: 'qa-reviewer', name: 'QA Reviewer' }], context: { caseId: 'S1' } });
  });
  it('matches staff role names without regard to case or spaces, or by id', () => {
    expect(evaluateCapability(who([' qa reviewer ']), 'x:a:export', roles, {}, T).allowed).toBe(true);
    expect(evaluateCapability(who(['qa-reviewer']), 'x:a:export', roles, {}, T).allowed).toBe(true);
  });
  it('refuses what no held role grants: Pathologist gets nothing by default', () => {
    expect(evaluateCapability(who(['Pathologist']), 'x:a:export', roles, {}, T)).toMatchObject({ allowed: false, reason: 'notGranted', grantedBy: [] });
  });
  it('refuses a granted capability whose requirement no held role grants', () => {
    const d = evaluateCapability(who(['Half']), 'x:c:export', roles, {}, T);
    expect(d).toMatchObject({ allowed: false, reason: 'requirementNotGranted', missingRequirements: ['x:a:export', 'x:b:export'] });
    // …but requirements may come from another held role.
    expect(evaluateCapability(who(['Half', 'QA Reviewer']), 'x:c:export', roles, {}, T).allowed).toBe(true);
  });
  it('refuses unknown capabilities and no user', () => {
    expect(evaluateCapability(who(['QA Reviewer']), 'x:zz:export', roles, {}, T).reason).toBe('unknownCapability');
    expect(evaluateCapability(null, 'x:a:export', roles, {}, T).reason).toBe('noUser');
  });
  it('superadmin has no bypass: only what the Superadmin role grants', () => {
    const sa = who([], 'superadmin');
    expect(evaluateCapability(sa, 'x:d:view', roles, {}, T)).toMatchObject({ allowed: true, grantedBy: [{ id: 'superadmin', name: 'Superadmin' }] });
    const trimmed = roles.map(r => r.id === 'superadmin' ? { ...r, capabilities: ['x:a:export'] } : r);
    expect(evaluateCapability(sa, 'x:d:view', trimmed, {}, T)).toMatchObject({ allowed: false, reason: 'notGranted' });
    // No Superadmin role in the catalog at all: nothing.
    expect(evaluateCapability(sa, 'x:a:export', roles.filter(r => r.id !== 'superadmin'), {}, T).allowed).toBe(false);
  });
  it('a staff record naming the Superadmin role gets nothing from it', () => {
    expect(heldRoles(who(['Superadmin']), roles)).toEqual([]);
    expect(evaluateCapability(who(['Superadmin']), 'x:d:view', roles, {}, T).allowed).toBe(false);
  });
  it('lists everything a user holds', () => {
    expect([...grantedCapabilities(who(['QA Reviewer']), roles, T)]).toEqual(['x:a:export', 'x:b:export']);
    expect(grantedCapabilities(null, roles, T).size).toBe(0);
  });
  it('the audit entry names the capability and the role that allowed it, or why it was refused', () => {
    const s = who(['QA Reviewer']);
    const allowed = capabilityAuditEntry(s, evaluateCapability(s, 'x:a:export', roles, { caseId: 'S1', facilityId: 'F1' }, T));
    expect(allowed).toMatchObject({ event: 'Capability allowed', user: 'Dr A', caseId: 'S1', facilityId: 'F1' });
    expect(allowed.detail).toBe('x:a:export allowed by role "QA Reviewer" (qa-reviewer). Session role: pathologist. Facility: F1.');
    const refused = capabilityAuditEntry(s, evaluateCapability(s, 'x:d:view', roles, {}, T));
    expect(refused).toMatchObject({ event: 'Capability refused', caseId: null });
    expect(refused.detail).toContain('refused: no role held grants it');
  });
});

describe('capability seeds', () => {
  const seeds = { admin: ['x:a:export', 'x:b:export'] };
  it('gives built-in roles their seeds once, and leaves custom roles alone', () => {
    const { roles, changed } = applyCapabilitySeeds([
      { id: 'admin', builtIn: true },
      { id: 'mine', builtIn: false },
      { id: 'pathologist', builtIn: true },
    ], seeds);
    expect(changed).toBe(true);
    expect(roles[0]).toEqual({ id: 'admin', builtIn: true, capabilities: ['x:a:export', 'x:b:export'], seededCapabilities: ['x:a:export', 'x:b:export'] });
    expect(roles[1]).toEqual({ id: 'mine', builtIn: false });
    expect(roles[2]).toEqual({ id: 'pathologist', builtIn: true });
    expect(applyCapabilitySeeds(roles, seeds).changed).toBe(false);
  });
  it('a hospital\'s own role is offered the screens its access implies, once (Batch 374)', () => {
    const custom: SeedableRole[] = [
      { id: 'histo', builtIn: false, caseAccess: true, configAccess: false },
      { id: 'it', builtIn: false, caseAccess: false, configAccess: true },
    ];
    const { roles } = applyCapabilitySeeds(custom);
    expect(roles[0].capabilities).toContain('screen:microtomy:open');
    expect(roles[0].capabilities).not.toContain('screen:configuration:open');
    expect(roles[1].capabilities).toEqual(['billing:applied-code:correct', 'screen:configuration:open', 'screen:audit-log:open', 'screen:quality-assurance:open']);
    const trimmed = [{ ...roles[1], capabilities: [] }];
    expect(applyCapabilitySeeds(trimmed).changed).toBe(false);
  });
  it('built-in roles open the screens Pete chose (Batch 374)', () => {
    const open = (role: string) => CAPABILITY_SEEDS[role].filter(k => k.startsWith('screen:')).map(k => k.split(':')[1]).sort();
    expect(open('pathologist')).toEqual(['add-on-orders', 'cytology-qc-queue', 'cytology-workspace', 'intraop-queue', 'my-contributions', 'search', 'surgical-qa-worklist', 'worklist']);
    expect(open('fellow')).toEqual(open('pathologist'));
    expect(open('resident')).toEqual(['add-on-orders', 'cytology-workspace', 'intraop-queue', 'my-contributions', 'search', 'worklist']);
    expect(open('pa')).toEqual(['accession', 'embedding', 'intraop-queue', 'my-contributions', 'search', 'worklist']);
    expect(open('accessioner')).toEqual(['accession', 'search', 'worklist']);
    expect(open('histotechnologist')).toEqual(['batch-management', 'embedding', 'microtomy', 'search', 'slide-distribution']);
    expect(open('cytotechnologist')).toEqual(['batch-management', 'cytology-workspace', 'search']);
    expect(open('molecular-technologist')).toEqual(['batch-management', 'molecular', 'search']);
    expect(open('admin')).toEqual(['audit-log', 'configuration', 'quality-assurance']);
    expect(open('template-author')).toEqual(['configuration']);
    expect(open('template-approver')).toEqual(['configuration']);
    expect(open('lab-director')).toEqual(['audit-log', 'configuration', 'my-contributions', 'quality-assurance', 'search']);
    expect(open('qa-reviewer')).toEqual(['audit-log', 'quality-assurance']);
    expect(CAPABILITY_SEEDS.physician).toBeUndefined();
    expect(CAPABILITY_SEEDS['or-staff']).toBeUndefined();
  });
  it('an administrator\'s removal sticks; a new seed still arrives', () => {
    const removed = [{ id: 'admin', builtIn: true, capabilities: [], seededCapabilities: ['x:a:export', 'x:b:export'] }];
    expect(applyCapabilitySeeds(removed, seeds).changed).toBe(false);
    const grown = applyCapabilitySeeds(removed, { admin: ['x:a:export', 'x:b:export', 'x:d:view'] }).roles[0];
    expect(grown.capabilities).toEqual(['x:d:view']);
  });
  it('day-one grants: Superadmin everything; Admin every export, administration, support access and its screens; QA Reviewer the exports and its screens', () => {
    expect(CAPABILITY_SEEDS.superadmin).toEqual(ALL_CAPABILITY_KEYS);
    const exports = ALL_CAPABILITY_KEYS.filter(k => k.endsWith(':export'));
    expect(CAPABILITY_SEEDS['qa-reviewer']).toEqual([...exports, 'screen:audit-log:open', 'screen:quality-assurance:open', 'billing:applied-code:correct']);
    expect(CAPABILITY_SEEDS.admin).toEqual([...exports, 'config:roles:manage', 'config:staff:edit', 'config:staff-access:assign', 'config:demo-data:reset', 'config:field-requirements:manage',
      'config:support-access:policy', 'config:support-access:approve', 'config:support-audit:view',
      'screen:configuration:open', 'screen:audit-log:open', 'screen:quality-assurance:open', 'billing:applied-code:correct']);
    expect(CAPABILITY_SEEDS.admin.filter(k => k.startsWith('qa:'))).toHaveLength(14);
    // Batch 374: every built-in role with app access now has a seed (its screens).
    expect(Object.keys(CAPABILITY_SEEDS).sort()).toEqual(['accessioner', 'admin', 'cytotechnologist', 'fellow', 'histotechnologist', 'lab-director', 'molecular-technologist', 'pa', 'pathologist', 'qa-reviewer', 'resident', 'superadmin', 'template-approver', 'template-author']);
    // Batch 378: those who gross can also complete grossing. Batch 381: every
    // role with case access can place/release holds and delegate (Pete: keep
    // today's users).
    const caseReport = ['case:hold:place', 'case:hold:release', 'case:retention-hold:place', 'case:retention-hold:release', 'case:delegation:create'];
    const caseAccess = ['pathologist', 'fellow', 'resident', 'pa', 'accessioner', 'histotechnologist', 'cytotechnologist', 'molecular-technologist'];
    for (const [role, set] of Object.entries(CAPABILITY_SEEDS)) if (role !== 'superadmin' && role !== 'admin' && role !== 'qa-reviewer') expect(set.filter(k => !k.startsWith('screen:')), role).toEqual([
      ...(['pathologist', 'fellow', 'resident', 'pa'].includes(role) ? ['case:grossing:complete'] : []),
      ...(caseAccess.includes(role) ? caseReport : []),
      // Batch 382: correcting an applied billing code is its own permission, for the roles that could before.
      ...(caseAccess.includes(role) || role === 'lab-director' ? ['billing:applied-code:correct'] : []),
    ]);
    // A hospital's own role with case access is offered them too.
    expect(customRoleScreenSeed({ caseAccess: true })).toEqual(expect.arrayContaining(caseReport));
    expect(customRoleScreenSeed({ configAccess: true })).not.toContain('case:hold:place');
    // Batch 382: correcting an applied billing code is offered to a role with case or configuration access, apart from the case report actions.
    expect(customRoleScreenSeed({ caseAccess: true })).toContain('billing:applied-code:correct');
    expect(customRoleScreenSeed({ configAccess: true })).toContain('billing:applied-code:correct');
    expect(customRoleScreenSeed({})).not.toContain('billing:applied-code:correct');
    expect(caseReport).not.toContain('billing:applied-code:correct');
    for (const set of Object.values(CAPABILITY_SEEDS)) expect(unmetRequirements(set)).toEqual([]);
  });
});

describe('authorization service', () => {
  const roles = [
    { id: 'qa-reviewer', name: 'QA Reviewer', capabilities: ['qa:fppe-tracking:export'] },
    { id: 'superadmin', name: 'Superadmin', capabilities: [...ALL_CAPABILITY_KEYS], assignable: false },
  ];
  const build = (session: { id: string; name: string; role: 'pathologist' | 'superadmin' } | null, staffRoles: string[] | null) => {
    const logged: { event: string; detail: string }[] = [];
    const svc = createAuthorizationService({
      roleService: { getAll: async () => ({ ok: true, data: roles as any }) },
      userService: { getById: async () => (staffRoles ? { ok: true, data: { roles: staffRoles } as any } : { ok: false, error: 'not found' }) as any },
      auditService: { logEvent: async e => { logged.push(e); return { ok: true, data: e as any }; } },
      session: () => session,
    });
    return { svc, logged };
  };

  it('enforce audits a high-risk check, allowed or refused', async () => {
    const { svc, logged } = build({ id: 'U1', name: 'Dr A', role: 'pathologist' }, ['QA Reviewer']);
    expect((await svc.enforce('qa:fppe-tracking:export')).allowed).toBe(true);
    expect((await svc.enforce('qa:drift-correction:export')).allowed).toBe(false);
    expect(logged.map(l => l.event)).toEqual(['Capability allowed', 'Capability refused']);
    expect(logged[0].detail).toContain('allowed by role "QA Reviewer"');
  });
  it('evaluate writes nothing', async () => {
    const { svc, logged } = build({ id: 'U1', name: 'Dr A', role: 'pathologist' }, ['QA Reviewer']);
    expect((await svc.evaluate('qa:fppe-tracking:export')).allowed).toBe(true);
    expect(logged).toEqual([]);
  });
  it('no staff record: only what the session brings; no session: nothing', async () => {
    expect((await build({ id: 'U9', name: 'Support', role: 'superadmin' }, null).svc.grantedCapabilities()).size).toBe(ALL_CAPABILITY_KEYS.length);
    expect((await build({ id: 'U9', name: 'Dr Z', role: 'pathologist' }, null).svc.grantedCapabilities()).size).toBe(0);
    const none = build(null, ['QA Reviewer']);
    expect(await none.svc.enforce('qa:fppe-tracking:export')).toMatchObject({ allowed: false, reason: 'noUser' });
    expect(none.logged[0].event).toBe('Capability refused');
  });
});

describe('facility scope (PS-356)', async () => {
  const { facilityScopeProblem } = await import('./evaluateCapability');
  const { qaScopeContext } = await import('../qualityAssurance/qaExport');
  const roles: AuthzRole[] = [{ id: 'qa-reviewer', name: 'QA Reviewer', capabilities: ['x:a:export'] }];
  const limited: AuthzSubject = { userId: 'U1', userName: 'Dr A', sessionRole: 'pathologist', staffRoles: ['QA Reviewer'], facilityIds: ['F1', 'F2'] };
  const everywhere: AuthzSubject = { ...limited, facilityIds: [] };

  it('an unrestricted assignment is never the reason for a refusal', () => {
    for (const ctx of [{ allFacilities: true }, { facilityId: 'F9' }, { caseId: 'S1' }, {}]) {
      expect(evaluateCapability(everywhere, 'x:a:export', roles, ctx, T).allowed).toBe(true);
    }
  });
  it('a limited assignment allows its own facilities and refuses others, naming them', () => {
    expect(evaluateCapability(limited, 'x:a:export', roles, { facilityId: 'F1' }, T).allowed).toBe(true);
    expect(evaluateCapability(limited, 'x:a:export', roles, { facilityIds: ['F1', 'F2'] }, T).allowed).toBe(true);
    expect(evaluateCapability(limited, 'x:a:export', roles, { facilityIds: ['F1', 'F3'] }, T)).toMatchObject({ allowed: false, reason: 'outOfScope', outsideFacilities: ['F3'], grantedBy: [{ id: 'qa-reviewer' }] });
  });
  it('a limited assignment refuses all-facility actions, and case actions on a case with no facility', () => {
    expect(evaluateCapability(limited, 'x:a:export', roles, { allFacilities: true }, T)).toMatchObject({ allowed: false, reason: 'outOfScope', outsideFacilities: ['all'] });
    expect(evaluateCapability(limited, 'x:a:export', roles, { caseId: 'S1' }, T)).toMatchObject({ allowed: false, reason: 'facilityUnknown' });
    expect(evaluateCapability(limited, 'x:a:export', roles, { caseId: 'S1', facilityId: 'F2' }, T).allowed).toBe(true);
  });
  it('actions with no facility dimension are not affected', () => {
    expect(facilityScopeProblem(['F1'], {})).toBeNull();
  });
  it('scope never grants: a role that does not grant it still refuses as notGranted', () => {
    expect(evaluateCapability(limited, 'x:d:view', roles, { facilityId: 'F1' }, T).reason).toBe('notGranted');
  });
  it('the audit entry says why scope refused', () => {
    const d = evaluateCapability(limited, 'x:a:export', roles, { allFacilities: true }, T);
    expect(capabilityAuditEntry(limited, d).detail).toContain("outside the user's facility assignment (the action spans all facilities)");
    const one = capabilityAuditEntry(limited, evaluateCapability(limited, 'x:a:export', roles, { facilityIds: ['F1'] }, T));
    expect(one.facilityId).toBe('F1');
  });
  it('QA scopes map to facility context: a client is one facility; anything wider is all facilities', () => {
    expect(qaScopeContext({ level: 'client', clientId: 'c1' })).toEqual({ facilityIds: ['c1'] });
    expect(qaScopeContext({ level: 'organisation', organisationId: 'ORG-1' })).toEqual({ allFacilities: true });
    expect(qaScopeContext({ level: 'enterprise' })).toEqual({ allFacilities: true });
    expect(qaScopeContext()).toEqual({ allFacilities: true });
  });
});

describe('ForMedrixAI platform capabilities (Batch 371)', async () => {
  const { lockPlatformRoles } = await import('./capabilitySeeds');
  const P: CapabilityDefinition[] = [...T, { key: 'x:p:view', labelId: 'p', group: 'platform', risk: 'high', requires: [], platformOnly: true }];
  const roles: AuthzRole[] = [
    { id: 'admin', name: 'Admin', capabilities: ['x:p:view', 'x:a:export'] },
    { id: 'superadmin', name: 'Superadmin', capabilities: ['x:p:view'], assignable: false },
  ];
  it('a platform capability counts only from the non-assignable Superadmin role', () => {
    const admin: AuthzSubject = { userId: 'U', userName: 'A', sessionRole: 'admin', staffRoles: ['Admin'] };
    expect(evaluateCapability(admin, 'x:p:view', roles, {}, P)).toMatchObject({ allowed: false, reason: 'notGranted' });
    expect(evaluateCapability(admin, 'x:a:export', roles, {}, P).allowed).toBe(true);
    const support: AuthzSubject = { userId: 'S', userName: 'Support', sessionRole: 'superadmin', staffRoles: [] };
    expect(evaluateCapability(support, 'x:p:view', roles, {}, P)).toMatchObject({ allowed: true, grantedBy: [{ id: 'superadmin' }] });
  });
  it('a hospital role can never be saved with a platform capability; the platform role can', () => {
    expect(roleCapabilityProblem(['platform:governing-bodies:manage'])).toContain('Platform-only capability on a hospital role');
    expect(roleCapabilityProblem(['platform:governing-bodies:manage'], { assignable: false })).toBeNull();
  });
  it('the Superadmin role is always put back to the whole catalog, whatever was stored', () => {
    const { roles: out, changed } = lockPlatformRoles([{ id: 'superadmin', builtIn: true, capabilities: ['qa:fppe-tracking:export'] }, { id: 'admin', builtIn: true, capabilities: [] }]);
    expect(changed).toBe(true);
    expect(out[0].capabilities).toEqual([...ALL_CAPABILITY_KEYS]);
    expect(out[1].capabilities).toEqual([]);
    expect(lockPlatformRoles(out).changed).toBe(false);
  });
  it('the hospital seeds hold no platform capability', () => {
    for (const id of ['admin', 'qa-reviewer']) expect(CAPABILITY_SEEDS[id].filter(k => k.startsWith('platform:'))).toEqual([]);
    expect(CAPABILITY_SEEDS.superadmin).toContain('platform:cross-tenant-cases:view');
  });
});
