// @vitest-environment happy-dom
//
// src/services/reports/mockInformalReviewService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockInformalReviewService as svc } from './mockInformalReviewService';

beforeEach(() => {
  localStorage.clear();
});

describe('mockInformalReviewService — real feature, per direct follow-up: "handled differently than delegations types... queue these informal requests on the worklist"', () => {
  it('creates a real, pending request', async () => {
    const res = await svc.create({
      caseId: 'S26-1', caseLabel: 'Test Case',
      fromUserId: 'u1', fromUserName: 'Dr. One',
      toUserId: 'u2', toUserName: 'Dr. Two',
      note: 'Second set of eyes on the margin?',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('pending');
      expect(res.data.id).toBeTruthy();
      expect(res.data.requestedAt).toBeTruthy();
    }
  });

  it('a real, pending request shows up for the real reviewer it was sent to', async () => {
    await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    const res = await svc.getPendingForReviewer('u2');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });

  it('never shows up for a different user - only the real, intended reviewer', async () => {
    await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    const res = await svc.getPendingForReviewer('u3');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(0);
  });

  it('publish moves a real request from pending to published, linking the real note id', async () => {
    const created = await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    if (!created.ok) throw new Error('setup failed');
    const published = await svc.publish(created.data.id, 'note-123');
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.data.status).toBe('published');
      expect(published.data.publishedNoteId).toBe('note-123');
      expect(published.data.publishedAt).toBeTruthy();
    }
  });

  it('a published request genuinely leaves the reviewer pending list', async () => {
    const created = await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    if (!created.ok) throw new Error('setup failed');
    await svc.publish(created.data.id, 'note-123');
    const pending = await svc.getPendingForReviewer('u2');
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.data).toHaveLength(0);
  });

  it('a published-but-unseen request shows up for the real original requester', async () => {
    const created = await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    if (!created.ok) throw new Error('setup failed');
    await svc.publish(created.data.id, 'note-123');
    const sent = await svc.getSentByRequester('u1');
    expect(sent.ok).toBe(true);
    if (sent.ok) {
      expect(sent.data).toHaveLength(1);
      expect(sent.data[0].status).toBe('published');
      expect(sent.data[0].seenByRequesterAt).toBeUndefined();
    }
  });

  it('markSeenByRequester moves a real request from published to closed', async () => {
    const created = await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    if (!created.ok) throw new Error('setup failed');
    await svc.publish(created.data.id, 'note-123');
    const closed = await svc.markSeenByRequester(created.data.id);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.data.status).toBe('closed');
      expect(closed.data.seenByRequesterAt).toBeTruthy();
    }
  });

  it('getForCase returns every real request for that case, regardless of who is asking', async () => {
    await svc.create({ caseId: 'S26-1', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    await svc.create({ caseId: 'S26-1', fromUserId: 'u3', fromUserName: 'Dr. Three', toUserId: 'u4', toUserName: 'Dr. Four' });
    await svc.create({ caseId: 'S26-2', fromUserId: 'u1', fromUserName: 'Dr. One', toUserId: 'u2', toUserName: 'Dr. Two' });
    const res = await svc.getForCase('S26-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });

  it('a genuinely empty store returns an empty list, never throws', async () => {
    const res = await svc.getPendingForReviewer('nobody');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it('publishing a real, non-existent request id returns a real error, not a silent no-op', async () => {
    const res = await svc.publish('does-not-exist', 'note-1');
    expect(res.ok).toBe(false);
  });
});
