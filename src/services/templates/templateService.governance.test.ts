// PS-63 (Batch 328): templateService enforces the review rules end to end.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const store: Record<string, string> = {};
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

const signIn = (id: string, role = 'admin') =>
  localStorage.setItem('pathscribe-user', JSON.stringify({ id, role, firstName: id, lastName: 'Test' }));

/** Gives seeded staff records the roles a test needs. Roles are read live
 *  from the staff record and the built-in role catalog (Batch 329). */
async function giveRoles(id: string, roles: string[]) {
  const { mockUserService } = await import('../users/mockUserService');
  await mockUserService.update(id, { roles });
}

const coded = (n: number, of: number) => [{
  id: 's1', title: 'S',
  fields: Array.from({ length: of }, (_, i) => ({ id: `f${i}`, label: `F${i}`, type: 'text', required: false, options: [], icd: '', snomed: i < n ? `sct${i}` : '' })),
}] as never;

async function draft(id: string, sections: never, author = 'author-1') {
  const svc = await import('./templateService');
  signIn(author);
  await svc.saveDraft({ id, name: `Governance ${id}`, source: 'Custom', version: '1.0.0', category: 'BREAST', sections });
  await svc.submitForReview(id);
  return svc;
}

describe('templateService review governance (PS-63)', () => {
  it('records who edited a template and refuses to let them approve it', async () => {
    const svc = await draft('gov-self', coded(5, 5));
    const { PROTOCOL_REGISTRY } = await import('@/components/Config/Protocols/protocolShared');
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-self')!.editorIds).toEqual(['author-1']);
    await expect(svc.approveTemplate('gov-self', undefined, 'Author')).rejects.toMatchObject({ code: 'SELF_APPROVAL' });
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-self')!.status).toBe('in_review');
  });

  it('refuses a user without an approver role, and accepts the built-in approver roles by id', async () => {
    const svc = await draft('gov-role', coded(5, 5));
    await giveRoles('4', ['Pathologist']);
    signIn('4', 'pathologist');
    await expect(svc.approveTemplate('gov-role')).rejects.toMatchObject({ code: 'NOT_APPROVER' });
    await giveRoles('5', ['Lab Director']);
    signIn('5', 'pathologist');
    await expect(svc.approveTemplate('gov-role')).resolves.toMatchObject({ status: 'approved', approvalCount: 1 });
  });

  it('limits drafting to Template Author, with Admin inheriting it (Batch 329)', async () => {
    const svc = await import('./templateService');
    const tpl = { id: 'gov-draft', name: 'Governance draft', source: 'Custom', version: '1.0.0', category: 'BREAST', sections: coded(5, 5) };
    await giveRoles('2', ['Template Approver']);
    signIn('2', 'pathologist');
    await expect(svc.saveDraft(tpl)).rejects.toMatchObject({ code: 'NOT_TEMPLATE_AUTHOR' });
    expect(await svc.canCurrentUserDraftTemplates()).toBe(false);
    await giveRoles('1', ['Pathologist', 'Template Author']);
    signIn('1', 'pathologist');
    expect(await svc.canCurrentUserDraftTemplates()).toBe(true);
    await expect(svc.saveDraft(tpl)).resolves.toMatchObject({ status: 'draft' });
    await expect(svc.submitForReview('gov-draft')).resolves.toMatchObject({ status: 'in_review' });
    // the Template Author can't approve their own work, or anyone's
    await expect(svc.approveTemplate('gov-draft')).rejects.toMatchObject({ code: 'NOT_APPROVER' });
    // the Template Approver can
    signIn('2', 'pathologist');
    await expect(svc.approveTemplate('gov-draft')).resolves.toMatchObject({ status: 'approved' });
  });

  it('keeps working after a built-in role is renamed', async () => {
    const { mockRoleService } = await import('../roles/mockRoleService');
    const { mockUserService } = await import('../users/mockUserService');
    await giveRoles('5', ['Lab Director']);
    const renamed = await mockRoleService.update('lab-director', { name: 'Laboratory Director' });
    expect(renamed).toMatchObject({ ok: true, data: { id: 'lab-director', name: 'Laboratory Director' } });
    const staff = await mockUserService.getById('5');
    expect(staff.ok && staff.data.roles).toEqual(['Laboratory Director']);
    const svc = await draft('gov-rename', coded(5, 5));
    signIn('5', 'pathologist');
    await expect(svc.approveTemplate('gov-rename')).resolves.toMatchObject({ status: 'approved' });
    await mockRoleService.update('lab-director', { name: 'Lab Director' });
  });

  it('blocks publishing below 80% SNOMED coverage', async () => {
    const svc = await draft('gov-snomed', coded(3, 5));
    signIn('reviewer-1');
    await svc.approveTemplate('gov-snomed');
    await expect(svc.publishTemplate('gov-snomed')).rejects.toMatchObject({ code: 'SNOMED_BELOW_THRESHOLD', coverage: 60 });
  });

  it('publishes after an independent approval, and records the publisher', async () => {
    const svc = await draft('gov-ok', coded(4, 5));
    signIn('reviewer-1');
    await svc.approveTemplate('gov-ok', undefined, 'Reviewer One');
    await expect(svc.publishTemplate('gov-ok')).resolves.toMatchObject({ status: 'published' });
    const { PROTOCOL_REGISTRY } = await import('@/components/Config/Protocols/protocolShared');
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-ok')).toMatchObject({ status: 'published', publishedById: 'reviewer-1' });
  });

  it('follows the site settings: two reviewers, then self-approval allowed', async () => {
    const { setTemplateGovernanceSettings } = await import('./templateGovernanceSettings');
    setTemplateGovernanceSettings({ requiredReviewers: 2 });
    const svc = await draft('gov-two', coded(5, 5));
    signIn('reviewer-1');
    await expect(svc.approveTemplate('gov-two')).resolves.toMatchObject({ status: 'in_review', approvalCount: 1 });
    await expect(svc.publishTemplate('gov-two')).rejects.toMatchObject({ code: 'NOT_ENOUGH_APPROVALS' });
    signIn('reviewer-2');
    await expect(svc.approveTemplate('gov-two')).resolves.toMatchObject({ status: 'approved', approvalCount: 2 });

    setTemplateGovernanceSettings({ requiredReviewers: 1, allowSelfApproval: true });
    const svc2 = await draft('gov-solo', coded(5, 5), 'solo-1');
    await expect(svc2.approveTemplate('gov-solo')).resolves.toMatchObject({ status: 'approved' });
    await expect(svc2.publishTemplate('gov-solo')).resolves.toMatchObject({ status: 'published' });
  });

  it('an edit starts a new review round, and Reset now moves the registry back to draft', async () => {
    const svc = await draft('gov-round', coded(5, 5));
    const { PROTOCOL_REGISTRY } = await import('@/components/Config/Protocols/protocolShared');
    signIn('reviewer-1');
    await svc.approveTemplate('gov-round');
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-round')!.approvals).toHaveLength(1);
    await svc.requestChanges('gov-round', 'fix');
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-round')!.approvals).toEqual([]);
    await svc.resubmitForReview('gov-round');
    await svc.transitionTemplate('gov-round', 'draft');
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'gov-round')).toMatchObject({ status: 'draft', approvals: [] });
  });
});

describe('template review settings', () => {
  it('saves normalized settings and audits only real changes', async () => {
    const { saveTemplateGovernanceWithAudit, getTemplateGovernanceSettings } = await import('./templateGovernanceSettings');
    expect(getTemplateGovernanceSettings()).toEqual({ allowSelfApproval: false, requiredReviewers: 1 });
    const logged: { detail: string; user: string }[] = [];
    const auditService = { logEvent: async (e: { detail: string; user: string }) => { logged.push(e); } };
    await saveTemplateGovernanceWithAudit({ allowSelfApproval: true, requiredReviewers: 7 }, { auditService, userName: 'Admin' });
    expect(getTemplateGovernanceSettings()).toEqual({ allowSelfApproval: true, requiredReviewers: 3 });
    await saveTemplateGovernanceWithAudit({ allowSelfApproval: true }, { auditService, userName: 'Admin' });
    expect(logged).toEqual([expect.objectContaining({
      user: 'Admin',
      detail: 'Allow Template Self-Approval: Disabled → Enabled; Required Reviewers: 1 → 3',
    })]);
  });
});
