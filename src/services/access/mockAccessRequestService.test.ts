// @vitest-environment happy-dom
//
// src/services/access/mockAccessRequestService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockAccessRequestService as svc } from './mockAccessRequestService';

beforeEach(() => {
  localStorage.clear();
});

describe('mockAccessRequestService — real feature, per direct follow-up: "Do we Track the request to gain access? ... Do we generate a ticket system that has its own status"', () => {
  it('creates a real, pending pediatric request', async () => {
    const res = await svc.create({
      type: 'pediatric', requestingUserId: 'u1', requestingUserName: 'Dr. One',
      caseId: 'S26-1', clientId: 'client-1', clientName: 'Metro General',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('pending');
      expect(res.data.type).toBe('pediatric');
      expect(res.data.id).toBeTruthy();
    }
  });

  it('creates a real, pending pool request', async () => {
    const res = await svc.create({
      type: 'pool', requestingUserId: 'u1', requestingUserName: 'Dr. One',
      caseId: 'S26-1', poolId: 'gi', poolName: 'Gastrointestinal',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.type).toBe('pool');
  });

  it('a real, pending request shows up in the admin queue', async () => {
    await svc.create({ type: 'pediatric', requestingUserId: 'u1', requestingUserName: 'Dr. One', clientId: 'client-1' });
    const res = await svc.getPending();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });

  it('grant moves a real request from pending to granted, recording the real resolver', async () => {
    const created = await svc.create({ type: 'pool', requestingUserId: 'u1', requestingUserName: 'Dr. One', poolId: 'gi' });
    if (!created.ok) throw new Error('setup failed');
    const granted = await svc.grant(created.data.id, 'admin-1', 'Admin Smith');
    expect(granted.ok).toBe(true);
    if (granted.ok) {
      expect(granted.data.status).toBe('granted');
      expect(granted.data.resolvedByUserId).toBe('admin-1');
      expect(granted.data.resolvedByUserName).toBe('Admin Smith');
      expect(granted.data.resolvedAt).toBeTruthy();
    }
  });

  it('deny moves a real request from pending to denied', async () => {
    const created = await svc.create({ type: 'pediatric', requestingUserId: 'u1', requestingUserName: 'Dr. One', clientId: 'client-1' });
    if (!created.ok) throw new Error('setup failed');
    const denied = await svc.deny(created.data.id, 'admin-1', 'Admin Smith');
    expect(denied.ok).toBe(true);
    if (denied.ok) expect(denied.data.status).toBe('denied');
  });

  it('a resolved request genuinely leaves the pending admin queue', async () => {
    const created = await svc.create({ type: 'pool', requestingUserId: 'u1', requestingUserName: 'Dr. One', poolId: 'gi' });
    if (!created.ok) throw new Error('setup failed');
    await svc.grant(created.data.id, 'admin-1', 'Admin Smith');
    const pending = await svc.getPending();
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.data).toHaveLength(0);
  });

  it('getAllForUser returns every real request for that user, any status', async () => {
    await svc.create({ type: 'pediatric', requestingUserId: 'u1', requestingUserName: 'Dr. One', clientId: 'client-1' });
    const created2 = await svc.create({ type: 'pool', requestingUserId: 'u1', requestingUserName: 'Dr. One', poolId: 'gi' });
    if (created2.ok) await svc.grant(created2.data.id, 'admin-1', 'Admin Smith');
    await svc.create({ type: 'pool', requestingUserId: 'u2', requestingUserName: 'Dr. Two', poolId: 'derm' });

    const res = await svc.getAllForUser('u1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });

  it('getAll returns every real request regardless of user or status - for the real turnaround-time metric', async () => {
    const c1 = await svc.create({ type: 'pediatric', requestingUserId: 'u1', requestingUserName: 'Dr. One', clientId: 'client-1' });
    if (c1.ok) await svc.grant(c1.data.id, 'admin-1', 'Admin Smith');
    await svc.create({ type: 'pool', requestingUserId: 'u2', requestingUserName: 'Dr. Two', poolId: 'derm' });
    const res = await svc.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });

  it('resolving a real, non-existent request id returns a real error, not a silent no-op', async () => {
    const res = await svc.grant('does-not-exist', 'admin-1', 'Admin Smith');
    expect(res.ok).toBe(false);
  });

  it('a genuinely empty store returns an empty queue, never throws', async () => {
    const res = await svc.getPending();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });
});
