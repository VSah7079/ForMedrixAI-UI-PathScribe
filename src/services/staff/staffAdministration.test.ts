import { describe, it, expect } from 'vitest';
import { saveStaffMember, staffAccessChangeDetail, staffAccessChanges } from './staffAdministration';
import type { StaffUser } from '../users/IUserService';

const base: StaffUser = {
  id: 'U1', firstName: 'Ann', lastName: 'Lee', email: 'a@x', roles: ['Pathologist'], npi: '', license: '', phone: '', status: 'Active',
};
const { id: _id, ...draftOf } = base;

function setup(granted: string[]) {
  const checks: string[] = [];
  const writes: string[] = [];
  const logged: { event: string; detail: string }[] = [];
  const deps = {
    userService: {
      add: async (u: any) => { writes.push('add'); return { ok: true as const, data: { ...u, id: 'NEW' } }; },
      update: async (id: string, u: any) => { writes.push(`update ${id}`); return { ok: true as const, data: { ...base, ...u } }; },
    },
    authorization: { enforce: async (c: string) => { checks.push(c); return { capability: c, allowed: granted.includes(c), grantedBy: [], missingRequirements: [], context: {} }; } },
    auditService: { logEvent: async (e: any) => { logged.push(e); return { ok: true as const, data: e }; } },
    actorName: 'Admin A',
  };
  return { deps, checks, writes, logged };
}

describe('saveStaffMember (PS-356): editing a record vs assigning access', () => {
  it('a contact-detail change needs only config:staff:edit', async () => {
    const { deps, checks, writes, logged } = setup(['config:staff:edit']);
    const res = await saveStaffMember({ mode: 'edit', before: base, draft: { ...draftOf, phone: '555' } }, deps as any);
    expect(res.ok).toBe(true);
    expect(checks).toEqual(['config:staff:edit']);
    expect(writes).toEqual(['update U1']);
    expect(logged).toEqual([]);
  });
  it('a role change also needs config:staff-access:assign; without it nothing is written', async () => {
    const { deps, checks, writes } = setup(['config:staff:edit']);
    const res = await saveStaffMember({ mode: 'edit', before: base, draft: { ...draftOf, roles: ['Pathologist', 'QA Reviewer'] } }, deps as any);
    expect(res).toEqual({ ok: false, reason: 'notPermitted', capability: 'config:staff-access:assign' });
    expect(checks).toEqual(['config:staff:edit', 'config:staff-access:assign']);
    expect(writes).toEqual([]);
  });
  it('without config:staff:edit, nothing at all', async () => {
    const { deps, writes } = setup(['config:staff-access:assign']);
    expect(await saveStaffMember({ mode: 'edit', before: base, draft: { ...draftOf, phone: '1' } }, deps as any)).toMatchObject({ ok: false, capability: 'config:staff:edit' });
    expect(writes).toEqual([]);
  });
  it('an access change with both is saved and audited', async () => {
    const { deps, logged } = setup(['config:staff:edit', 'config:staff-access:assign']);
    const res = await saveStaffMember({ mode: 'edit', before: base, draft: { ...draftOf, roles: ['Pathologist', 'QA Reviewer'], facilityIds: ['c1'], canViewPediatric: true } }, deps as any);
    expect(res.ok).toBe(true);
    expect(logged).toEqual([expect.objectContaining({
      event: 'Staff access changed', user: 'Admin A',
      detail: 'Staff "Ann Lee": roles Pathologist → Pathologist, QA Reviewer; facilities all → c1; pediatric access off → on.',
    })]);
  });
  it('adding someone with a role is an access change', async () => {
    const { deps, checks } = setup(['config:staff:edit']);
    expect(await saveStaffMember({ mode: 'add', draft: draftOf }, deps as any)).toMatchObject({ ok: false, capability: 'config:staff-access:assign' });
    expect(checks).toEqual(['config:staff:edit', 'config:staff-access:assign']);
  });
  it('role order and spacing are not a change; an unset flag equals false', () => {
    expect(staffAccessChanges({ ...base, roles: ['A', 'B'] }, { ...base, roles: [' B', 'A'], canViewPediatric: false })).toEqual([]);
    expect(staffAccessChangeDetail('X', base, { ...base, facilityIds: [] })).toBeNull();
  });
});
