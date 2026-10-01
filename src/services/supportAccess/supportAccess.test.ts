import { describe, it, expect } from 'vitest';
import {
  SUPPORT_AUDIT_GENESIS, activeGrant, decisionProblem, expireRequests, normaliseSupportSettings, requestProblem,
  supportAccessDecision, supportAuditRows, verifySupportAuditChain, supportRequestQueues, supportWindowParts, isLiveGrant,
  type SupportAccessRequest,
} from './supportAccessRules';
import { createSupportAccessService, sha256Hex } from './supportAccessService';
import { gateCaseList, gateCaseOpen } from './supportAccessGate';
import { usedCriteria } from '../caseSearch/createCaseSearchService';

const T0 = new Date('2026-09-28T10:00:00Z');
const req = (over: Partial<SupportAccessRequest> = {}): SupportAccessRequest => ({
  id: 'r1', tenantId: 'fac-mft', agentId: 'SUP', agentName: 'Support A', ticketId: 'TK-1', reason: 'Investigating a report render fault',
  requestedAt: T0.toISOString(), status: 'pending', ...over,
});

describe('support access rules (Batch 372)', () => {
  it('disabled refuses; always-allowed allows; approval-required needs an unexpired approval', () => {
    expect(supportAccessDecision('disabled', [req({ status: 'approved', expiresAt: '2026-09-28T12:00:00Z' })], 'fac-mft', 'SUP', T0)).toEqual({ allowed: false, reason: 'policyDisabled' });
    expect(supportAccessDecision('alwaysAllowed', [], 'fac-mft', 'SUP', T0)).toEqual({ allowed: true, ticketId: null, requestId: null });
    expect(supportAccessDecision('approvalRequired', [], 'fac-mft', 'SUP', T0)).toEqual({ allowed: false, reason: 'noApproval' });
    const approved = req({ status: 'approved', expiresAt: '2026-09-28T12:00:00Z' });
    expect(supportAccessDecision('approvalRequired', [approved], 'fac-mft', 'SUP', T0)).toEqual({ allowed: true, ticketId: 'TK-1', requestId: 'r1' });
    // Another agent, another organisation, or past the window: no.
    expect(activeGrant([approved], 'fac-mft', 'OTHER', T0)).toBeNull();
    expect(activeGrant([approved], 'fac-dvmc', 'SUP', T0)).toBeNull();
    expect(activeGrant([approved], 'fac-mft', 'SUP', new Date('2026-09-28T12:00:00Z'))).toBeNull();
  });
  it('an approval runs out and is marked expired', () => {
    const list = [req({ status: 'approved', expiresAt: '2026-09-28T10:30:00Z' }), req({ id: 'r2' })];
    expect(expireRequests(list, new Date('2026-09-28T10:31:00Z')).map(r => r.id)).toEqual(['r1']);
    expect(list.map(r => r.status)).toEqual(['expired', 'pending']);
  });
  it('a request needs a ticket and a real reason, and only when the policy calls for one', () => {
    const ok = { ticketId: 'TK-9', reason: 'Report render fault on case S26-1' };
    expect(requestProblem({ ticketId: ' ', reason: ok.reason }, 'approvalRequired', [], 't', 'a', T0)).toBe('ticketRequired');
    expect(requestProblem({ ticketId: 'TK', reason: 'fix' }, 'approvalRequired', [], 't', 'a', T0)).toBe('reasonRequired');
    expect(requestProblem(ok, 'disabled', [], 't', 'a', T0)).toBe('policyDisabled');
    expect(requestProblem(ok, 'alwaysAllowed', [], 't', 'a', T0)).toBe('notNeeded');
    expect(requestProblem(ok, 'approvalRequired', [req({ tenantId: 't', agentId: 'a' })], 't', 'a', T0)).toBe('alreadyPending');
    expect(requestProblem(ok, 'approvalRequired', [], 't', 'a', T0)).toBeNull();
  });
  it('only a member of that organisation, and never the requester, decides', () => {
    expect(decisionProblem(undefined, { id: 'H', tenantId: 'fac-mft' })).toBe('notFound');
    expect(decisionProblem(req({ status: 'approved' }), { id: 'H', tenantId: 'fac-mft' })).toBe('notPending');
    expect(decisionProblem(req(), { id: 'H', tenantId: 'fac-dvmc' })).toBe('otherOrganisation');
    expect(decisionProblem(req(), { id: 'SUP', tenantId: 'fac-mft' })).toBe('ownRequest');
    expect(decisionProblem(req(), { id: 'H', tenantId: 'fac-mft' })).toBeNull();
  });
  it('settings fall back to Approval Required and a 2-hour window', () => {
    expect(normaliseSupportSettings(undefined)).toEqual({ policy: 'approvalRequired', windowMinutes: 120 });
    expect(normaliseSupportSettings({ policy: 'alwaysAllowed', windowMinutes: 240 })).toEqual({ policy: 'alwaysAllowed', windowMinutes: 240 });
    expect(normaliseSupportSettings({ policy: 'x' as any, windowMinutes: 7 })).toEqual({ policy: 'approvalRequired', windowMinutes: 120 });
  });
  it('the hospital\'s queues: waiting requests, and approvals still in force', () => {
    const live = req({ id: 'a', status: 'approved', expiresAt: new Date(T0.getTime() + 60_000).toISOString() });
    const lapsed = req({ id: 'b', status: 'approved', expiresAt: T0.toISOString() });
    const q = supportRequestQueues([req(), live, lapsed, req({ id: 'c', status: 'rejected' })], T0);
    expect(q.pending.map(r => r.id)).toEqual(['r1']);
    expect(q.active.map(r => r.id)).toEqual(['a']);
    expect(isLiveGrant(lapsed, T0)).toBe(false);
  });
  it('window options show as hours where they divide, minutes otherwise', () => {
    expect(supportWindowParts(30)).toEqual({ unit: 'minutes', count: 30 });
    expect(supportWindowParts(120)).toEqual({ unit: 'hours', count: 2 });
    expect(supportWindowParts(90)).toEqual({ unit: 'minutes', count: 90 });
  });
  it('search auditing records criteria names, never values', () => {
    expect(usedCriteria({ patientName: 'Jane Doe', mrn: '', statuses: [], accession: 'S26-1', stat: false })).toEqual(['accession', 'patientName']);
  });
});

// ── The service, with an in-memory store and a controllable clock ────────────

function harness(opts: { sessionRole?: string; sessionId?: string; org?: string; granted?: string[]; seed?: Record<string, any> } = {}) {
  const mem = new Map<string, unknown>();
  let clock = T0;
  let session = { id: opts.sessionId ?? 'H1', name: 'Hospital Admin', role: opts.sessionRole ?? 'admin', organisationId: opts.org ?? 'ORG-MFT' };
  const granted = new Set(opts.granted ?? ['config:support-access:policy', 'config:support-access:approve', 'config:support-audit:view']);
  const notified: string[] = [];
  const facilities = [
    { id: 'fac-mft', name: 'Manchester', isEnterprise: true, legacyTenantIds: ['ORG-MFT', 'HOSP-MFT'] },
    { id: 'fac-dvmc', name: 'Desert Valley', isEnterprise: true, legacyTenantIds: ['ORG-DVMC', 'HOSP-001'] },
  ] as any[];
  const decide = (c: string) => ({ capability: c, allowed: granted.has(c), grantedBy: [], missingRequirements: [], context: {} });
  let n = 0;
  const svc = createSupportAccessService({
    authorization: { enforce: async c => decide(c), evaluate: async c => decide(c) },
    session: () => session,
    enterpriseFacilities: async () => facilities,
    staff: async () => [
      { id: 'H1', firstName: 'Hospital', lastName: 'Admin', email: 'h@x', roles: ['Admin'], status: 'Active', organisationId: 'ORG-MFT' },
      { id: 'H2', firstName: 'Other', lastName: 'Path', email: 'p@x', roles: ['Pathologist'], status: 'Active', organisationId: 'ORG-MFT' },
    ] as any,
    roles: async () => [{ id: 'admin', name: 'Admin', capabilities: ['config:support-access:approve'] }, { id: 'pathologist', name: 'Pathologist', capabilities: [] }] as any,
    notify: async m => { notified.push(m.recipientId); },
    store: { get: (k, f) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : f), set: (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } },
    now: () => clock,
    newId: () => `id${++n}`,
    seedSettings: opts.seed,
  });
  return {
    svc, notified, mem,
    as: (s: Partial<typeof session>) => { session = { ...session, ...s }; },
    tick: (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); },
  };
}

describe('support access service (Batch 372)', () => {
  it('seeded settings apply until the organisation saves its own', async () => {
    const h = harness({ seed: { 'fac-mft': { policy: 'alwaysAllowed' } } });
    expect(await h.svc.getSettings('fac-mft')).toEqual({ policy: 'alwaysAllowed', windowMinutes: 120 });
    expect(await h.svc.getSettings('fac-dvmc')).toEqual({ policy: 'approvalRequired', windowMinutes: 120 });
    expect((await h.svc.decisionFor('fac-mft', 'SUP')).allowed).toBe(true);
    await h.svc.setSettings('fac-mft', { policy: 'disabled', windowMinutes: 60 });
    expect(await h.svc.getSettings('fac-mft')).toEqual({ policy: 'disabled', windowMinutes: 60 });
  });
  it('the full approval flow: request, notify approvers, approve for the window, reach, expire', async () => {
    const h = harness();
    await h.svc.setSettings('fac-mft', { policy: 'approvalRequired', windowMinutes: 60 });
    h.as({ id: 'SUP', name: 'Support A', role: 'superadmin', organisationId: 'ORG-DVMC' });
    const r = await h.svc.requestAccess({ tenantId: 'fac-mft', ticketId: 'TK-7', reason: 'Report render fault, ticket TK-7' });
    expect(r.ok).toBe(true);
    expect(h.notified).toEqual(['H1']);                       // the approver, not the pathologist
    expect(await h.svc.decisionFor('fac-mft', 'SUP')).toEqual({ allowed: false, reason: 'noApproval' });
    // Support can't approve its own request, even holding every capability.
    expect(await h.svc.decide(r.ok ? r.request.id : '', 'approve')).toEqual({ ok: false, reason: 'otherOrganisation' });
    h.as({ id: 'H1', name: 'Hospital Admin', role: 'admin', organisationId: 'ORG-MFT' });
    const d = await h.svc.decide(r.ok ? r.request.id : '', 'approve');
    expect(d.ok && d.request).toMatchObject({ status: 'approved', windowMinutes: 60, expiresAt: '2026-09-28T11:00:00.000Z' });
    expect(await h.svc.decisionFor('fac-mft', 'SUP')).toMatchObject({ allowed: true, ticketId: 'TK-7' });
    h.tick(61);
    expect(await h.svc.decisionFor('fac-mft', 'SUP')).toEqual({ allowed: false, reason: 'noApproval' });
    const audit = await h.svc.listAudit('fac-mft');
    expect(audit.ok && audit.entries.map(e => e.action)).toEqual(['accessExpired', 'accessApproved', 'accessRequested', 'policyChanged']);
    expect(await h.svc.verifyAudit('fac-mft')).toEqual({ intact: true, entries: 4 });
  });

  it('the hospital can revoke; support can end its own access; disabled refuses requests', async () => {
    const h = harness();
    h.as({ id: 'SUP', name: 'Support A', role: 'superadmin', organisationId: 'ORG-DVMC' });
    const r = await h.svc.requestAccess({ tenantId: 'fac-mft', ticketId: 'TK-8', reason: 'Checking an interface error' });
    h.as({ id: 'H1', role: 'admin', organisationId: 'ORG-MFT' });
    await h.svc.decide(r.ok ? r.request.id : '', 'approve');
    expect(await h.svc.revoke(r.ok ? r.request.id : '')).toEqual({ ok: true });
    expect((await h.svc.decisionFor('fac-mft', 'SUP')).allowed).toBe(false);
    await h.svc.setSettings('fac-mft', { policy: 'disabled', windowMinutes: 120 });
    h.as({ id: 'SUP', role: 'superadmin', organisationId: 'ORG-DVMC' });
    expect(await h.svc.requestAccess({ tenantId: 'fac-mft', ticketId: 'TK-9', reason: 'Another look please' })).toEqual({ ok: false, reason: 'policyDisabled' });
  });

  it('only the organisation\'s own members set its policy, approve, or read its audit', async () => {
    const h = harness({ org: 'ORG-DVMC' });
    expect(await h.svc.setSettings('fac-mft', { policy: 'alwaysAllowed', windowMinutes: 120 })).toEqual({ ok: false, reason: 'otherOrganisation' });
    expect(await h.svc.listAudit('fac-mft')).toEqual({ ok: false, reason: 'otherOrganisation' });
    const noCap = harness({ granted: [] });
    expect(await noCap.svc.setSettings('fac-mft', { policy: 'alwaysAllowed', windowMinutes: 120 })).toEqual({ ok: false, reason: 'notPermitted' });
    expect(await noCap.svc.exportAudit('fac-mft', 'csv')).toEqual({ ok: false, reason: 'notPermitted' });
  });

  it('a changed or removed entry breaks the chain, and the export says so', async () => {
    const h = harness();
    await h.svc.setSettings('fac-mft', { policy: 'alwaysAllowed', windowMinutes: 120 });
    await h.svc.setSettings('fac-mft', { policy: 'approvalRequired', windowMinutes: 120 });
    const all = h.mem.get('pathscribe_support_audit') as Record<string, any[]>;
    all['fac-mft'][0].detail = 'nothing happened';
    h.mem.set('pathscribe_support_audit', all);
    expect(await h.svc.verifyAudit('fac-mft')).toEqual({ intact: false, brokenAt: 1, entries: 2 });
    const exp = await h.svc.exportAudit('fac-mft', 'json');
    expect(exp.ok && JSON.parse(exp.content).chain).toEqual({ intact: false, brokenAt: 1, entries: 2 });
  });

  it('the chain check itself: genesis, links and sequence', async () => {
    expect(await verifySupportAuditChain([], sha256Hex)).toEqual({ intact: true, entries: 0 });
    expect(SUPPORT_AUDIT_GENESIS).toHaveLength(64);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('the CSV export has the compliance columns, with IP and country left for the server', async () => {
    const h = harness();
    await h.svc.setSettings('fac-mft', { policy: 'alwaysAllowed', windowMinutes: 120 });
    const exp = await h.svc.exportAudit('fac-mft', 'csv');
    expect(exp.ok && exp.content.split('\r\n')[0]).toBe('timestamp,agent,originIp,originCountry,ticketId,action,caseIds,detail');
    expect(supportAuditRows([{ seq: 1, at: 't', actorName: '=cmd', ticketId: null, action: 'policyChanged', caseIds: [], detail: 'd', originIp: null, originCountry: null } as any])[0].agent).toBe("'=cmd");
  });
});

describe('the case-data gate (Batch 372)', () => {
  const facilities = [
    { id: 'fac-mft', isEnterprise: true, legacyTenantIds: ['HOSP-MFT'] },
    { id: 'fac-dvmc', isEnterprise: true, legacyTenantIds: ['ORG-DVMC', 'HOSP-001'] },
  ] as any[];
  const support = (allowedTenants: string[]) => {
    const recorded: { tenantId: string; action: string; caseIds?: string[] }[] = [];
    return {
      recorded,
      svc: {
        decisionFor: async (t: string) => (allowedTenants.includes(t) ? { allowed: true as const, ticketId: 'TK', requestId: 'r' } : { allowed: false as const, reason: 'noApproval' as const }),
        record: async (e: any) => { recorded.push(e); return e; },
      },
    };
  };
  const agent = { id: 'SUP', role: 'superadmin' as const, organisationId: 'ORG-DVMC', name: 'Support A' };
  const cases = [{ id: 'OWN', originHospitalId: 'HOSP-001' }, { id: 'MFT1', originHospitalId: 'HOSP-MFT' }, { id: 'MFT2', originHospitalId: 'HOSP-MFT' }];

  it('lists: other organisations\' cases only with access, and what was shown is recorded there', async () => {
    const blocked = support([]);
    expect((await gateCaseList(agent, cases, facilities, blocked.svc)).map(c => c.id)).toEqual(['OWN']);
    expect(blocked.recorded).toEqual([]);
    const open = support(['fac-mft']);
    expect((await gateCaseList(agent, cases, facilities, open.svc)).map(c => c.id)).toEqual(['OWN', 'MFT1', 'MFT2']);
    expect(open.recorded).toEqual([expect.objectContaining({ tenantId: 'fac-mft', action: 'casesListed', caseIds: ['MFT1', 'MFT2'] })]);
  });
  it('opens: refused and recorded without access; recorded with the ticket when allowed', async () => {
    const blocked = support([]);
    expect(await gateCaseOpen(agent, cases[1], facilities, 'open', blocked.svc)).toEqual({ allowed: false, ticketId: null });
    expect(blocked.recorded[0]).toMatchObject({ action: 'accessRefused', caseIds: ['MFT1'] });
    const open = support(['fac-mft']);
    expect(await gateCaseOpen(agent, cases[1], facilities, 'edit', open.svc)).toEqual({ allowed: true, ticketId: 'TK' });
    expect(open.recorded[0]).toMatchObject({ action: 'caseEdited', ticketId: 'TK' });
  });
  it('hospital users and support in its own organisation are untouched', async () => {
    const s = support([]);
    const staff = { id: 'U', role: 'pathologist' as const, organisationId: 'ORG-DVMC' };
    expect(await gateCaseList(staff, cases, facilities, s.svc)).toHaveLength(3);
    expect(await gateCaseOpen(agent, cases[0], facilities, 'open', s.svc)).toEqual({ allowed: true, ticketId: null });
    expect(s.recorded).toEqual([]);
  });
  it('a case no organisation can be resolved for has no policy to apply: it passes, unrecorded (the Batch 371 capability check still audits it)', async () => {
    const s = support([]);
    const unowned = { id: 'X1', originHospitalId: 'c-unmapped' };
    expect(await gateCaseOpen(agent, unowned, facilities, 'open', s.svc)).toEqual({ allowed: true, ticketId: null });
    expect((await gateCaseList(agent, [unowned, cases[1]], facilities, s.svc)).map(c => c.id)).toEqual(['X1']);
    expect(s.recorded).toEqual([]);
  });
});

