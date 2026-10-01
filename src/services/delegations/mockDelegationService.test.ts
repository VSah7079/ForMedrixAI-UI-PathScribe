// @vitest-environment happy-dom
// Batch 353: the delegation service (was functions inside the demo case service).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cases/mockCaseService', () => ({
  delegateCase: vi.fn(async (p: { caseId: string }) => ({ id: 'new', caseId: p.caseId, fromUserId: 'A', delegationType: 'POOL', timestamp: 't', status: 'pending' })),
  assignSynoptic: vi.fn(async () => null),
}));

const { allowed } = vi.hoisted(() => ({ allowed: { current: true } }));
vi.mock('../authorization/defaultAuthorizationService', () => ({
  authorizationService: { enforce: vi.fn(async (capability: string) => ({ capability, allowed: allowed.current, grantedBy: [], missingRequirements: [], context: {} })) },
}));

import { mockDelegationService } from './mockDelegationService';
import { DELEGATION_STORE_KEY, appendDelegation, markPendingDelegationAccepted, loadDelegations } from './delegationStore';
import { assignSynoptic, delegateCase } from '../cases/mockCaseService';

describe('mockDelegationService', () => {
  beforeEach(() => { localStorage.removeItem(DELEGATION_STORE_KEY); vi.clearAllMocks(); allowed.current = true; });

  it('Batch 381: delegating needs case:delegation:create; without it nothing changes', async () => {
    allowed.current = false;
    const res = await mockDelegationService.delegate({ caseId: 'C1', requestorId: 'A', delegationType: 'POOL', recipient: { kind: 'pool', id: 'P1', name: 'GI' } });
    expect(res).toEqual({ ok: false, error: 'notPermitted' });
    expect(delegateCase).not.toHaveBeenCalled();
  });

  it('lists the seeded demo delegations, all or one case', async () => {
    const all = await mockDelegationService.list();
    expect(all.ok && all.data.length).toBe(5);
    const one = await mockDelegationService.list({ caseId: 'S26-4404' });
    expect(one.ok && one.data.map(d => d.id)).toEqual(['deleg-seed-2']);
  });

  it('completes a delegation once, with the time; again is a no-op success', async () => {
    const first = await mockDelegationService.complete('deleg-seed-4');
    expect(first.ok && first.data.status).toBe('completed');
    const at = first.ok ? first.data.completedAt : undefined;
    expect(at).toBeTruthy();
    const again = await mockDelegationService.complete('deleg-seed-4');
    expect(again.ok && again.data.completedAt).toBe(at);
    expect(await mockDelegationService.complete('nope')).toEqual({ ok: false, error: 'notFound' });
  });

  it('delegate() routes through the case service by plan', async () => {
    await mockDelegationService.delegate({ caseId: 'C1', requestorId: 'A', delegationType: 'POOL', recipient: { kind: 'pool', id: 'P1', name: 'GI' } });
    expect(delegateCase).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'C1', targetPoolId: 'P1', targetPoolName: 'GI' }));
    const res = await mockDelegationService.delegate({ caseId: 'C1', requestorId: 'A', delegationType: 'SYNOPTIC_ASSIGN', recipient: { kind: 'user', id: 'U2' }, synopticInstanceId: 'I1' });
    expect(assignSynoptic).toHaveBeenCalledWith('C1', 'I1', 'U2', '', 'A', true, undefined);
    expect(res).toEqual({ ok: false, error: 'caseNotFound' });
  });

  it('store: records a delegation, and accepting a pool case accepts its first pending delegation', () => {
    appendDelegation({ id: 'x', caseId: 'C9', fromUserId: 'A', delegationType: 'POOL', timestamp: 't', status: 'pending' });
    markPendingDelegationAccepted('C9');
    expect(loadDelegations().find(d => d.id === 'x')?.status).toBe('accepted');
  });
});
