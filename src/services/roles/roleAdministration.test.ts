import { describe, it, expect } from 'vitest';
import { keepsARoleManager, saveRole } from './roleAdministration';
import { withoutRetiredRoleFields } from './systemRoles';
import type { Role } from './IRoleService';

const role = (id: string, capabilities: string[], extra: Partial<Role> = {}): Role => ({
  id, name: id, description: '', color: '#000', caseAccess: false, configAccess: true, permissions: {}, builtIn: true, capabilities, ...extra,
});

function setup(allowed: boolean, roles: Role[]) {
  const logged: { event: string; detail: string }[] = [];
  const writes: string[] = [];
  const checks: string[] = [];
  const deps = {
    roleService: {
      getAll: async () => ({ ok: true as const, data: roles }),
      add: async (r: Omit<Role, 'id'>) => { writes.push(`add ${r.name}`); return { ok: true as const, data: { ...r, id: 'new' } as Role }; },
      update: async (id: string, c: Partial<Role>) => { writes.push(`update ${id}`); return { ok: true as const, data: { ...roles.find(r => r.id === id)!, ...c } }; },
    },
    authorization: { enforce: async (c: string) => { checks.push(c); return { capability: c, allowed, grantedBy: [], missingRequirements: [], context: {} }; } },
    auditService: { logEvent: async (e: any) => { logged.push(e); return { ok: true as const, data: e }; } },
    actorName: 'Admin A',
  };
  return { deps, logged, writes, checks };
}

describe('saveRole (PS-356): the self-escalation path is closed', () => {
  const catalog = [role('admin', ['config:roles:manage']), role('pathologist', [])];

  it('refuses without config:roles:manage and writes nothing', async () => {
    const { deps, writes, checks } = setup(false, catalog);
    const res = await saveRole({ mode: 'edit', id: 'pathologist', draft: { ...catalog[1], capabilities: ['qa:fppe-tracking:export'] } }, deps as any);
    expect(res).toEqual({ ok: false, reason: 'notPermitted' });
    expect(checks).toEqual(['config:roles:manage']);
    expect(writes).toEqual([]);
  });
  it('saves with it, and audits the capability change with who made it', async () => {
    const { deps, writes, logged } = setup(true, catalog);
    const res = await saveRole({ mode: 'edit', id: 'pathologist', draft: { ...catalog[1], capabilities: ['qa:fppe-tracking:export'] } }, deps as any);
    expect(res.ok).toBe(true);
    expect(writes).toEqual(['update pathologist']);
    expect(logged).toEqual([expect.objectContaining({ event: 'Role capabilities changed', user: 'Admin A', detail: 'Role "pathologist": granted qa:fppe-tracking:export.' })]);
  });
  it('refuses an inconsistent capability list', async () => {
    const { deps } = setup(true, catalog);
    const res = await saveRole({ mode: 'edit', id: 'pathologist', draft: { ...catalog[1], capabilities: ['qa:inspection-evidence:export'] } }, deps as any);
    expect(res).toMatchObject({ ok: false, reason: 'invalidCapabilities' });
  });
  it('refuses a save that leaves no assignable role able to manage roles (Superadmin does not count)', async () => {
    const withSa = [...catalog, role('superadmin', ['config:roles:manage'], { assignable: false })];
    const { deps, writes } = setup(true, withSa);
    const res = await saveRole({ mode: 'edit', id: 'admin', draft: { ...withSa[0], capabilities: [] } }, deps as any);
    expect(res).toEqual({ ok: false, reason: 'lastRoleManager' });
    expect(writes).toEqual([]);
    expect(keepsARoleManager(withSa)).toBe(true);
  });
  it('a new role is always an ordinary custom role', async () => {
    const { deps, writes } = setup(true, catalog);
    const res = await saveRole({ mode: 'add', draft: { ...role('x', []), builtIn: true, assignable: false } }, deps as any);
    expect(res.ok && res.role).toMatchObject({ builtIn: false, assignable: undefined });
    expect(writes).toEqual(['add x']);
  });
});

describe('withoutRetiredRoleFields (PS-356)', () => {
  it('drops the role switches that were never enforced, and says whether it changed anything', () => {
    const { roles, stripped } = withoutRetiredRoleFields([{ id: 'a', canViewPediatric: true, facilityIds: ['F1'] }, { id: 'b' }]);
    expect(stripped).toBe(true);
    expect(roles).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(withoutRetiredRoleFields([{ id: 'b' }]).stripped).toBe(false);
  });
});

describe('the Superadmin role is not a hospital\'s to change (Batch 371)', () => {
  it('saveRole refuses any edit to it, even with config:roles:manage', async () => {
    const withSa = [role('admin', ['config:roles:manage']), role('superadmin', ['config:roles:manage'], { assignable: false })];
    const { deps, writes } = setup(true, withSa);
    const res = await saveRole({ mode: 'edit', id: 'superadmin', draft: { ...withSa[1], capabilities: [] } }, deps as any);
    expect(res).toEqual({ ok: false, reason: 'platformRole' });
    expect(writes).toEqual([]);
  });
  it('a hospital role saved with a platform capability is refused', async () => {
    const { deps } = setup(true, [role('admin', ['config:roles:manage'])]);
    const res = await saveRole({ mode: 'add', draft: role('mine', ['platform:governing-bodies:manage']) }, deps as any);
    expect(res).toMatchObject({ ok: false, reason: 'invalidCapabilities' });
  });
});
