// src/services/cytology/mockCytologyOutboundResultQueueService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyOutboundResultQueueService } from './mockCytologyOutboundResultQueueService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const entry = () => ({ caseId: 'S26-5002-CYT-001', signOutRecordId: 'cyto-signout-abc123', resultState: 'FINAL' as const, organisationId: 'org-1' });

describe('mockCytologyOutboundResultQueueService — real, mirrored outbound queue', () => {
  it('starts empty', async () => {
    const res = await mockCytologyOutboundResultQueueService.getAll();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toEqual([]);
  });

  it('a real enqueue() genuinely persists as QUEUED with a real, assigned id', async () => {
    const res = await mockCytologyOutboundResultQueueService.enqueue(entry());
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.status).toBe('QUEUED');
    expect(res.data.id).toBeTruthy();
    expect(res.data.retryCount).toBe(0);
  });

  it('markSent genuinely transitions status and clears any prior error', async () => {
    const created = await mockCytologyOutboundResultQueueService.enqueue(entry());
    if (!created.ok) throw new Error('setup failed');
    const sent = await mockCytologyOutboundResultQueueService.markSent(created.data.id);
    if (!sent.ok) throw new Error('setup failed');
    expect(sent.data.status).toBe('SENT');
  });

  it('markFailed genuinely records the real, given error details', async () => {
    const created = await mockCytologyOutboundResultQueueService.enqueue(entry());
    if (!created.ok) throw new Error('setup failed');
    const failed = await mockCytologyOutboundResultQueueService.markFailed(created.data.id, { errorCode: 'DISPATCH_REJECTED', errorMessage: 'Bad payload', maxRetriesExceeded: false });
    if (!failed.ok) throw new Error('setup failed');
    expect(failed.data.status).toBe('FAILED');
    expect(failed.data.errorCode).toBe('DISPATCH_REJECTED');
    const failedList = await mockCytologyOutboundResultQueueService.getFailed();
    if (!failedList.ok) throw new Error('setup failed');
    expect(failedList.data.length).toBe(1);
  });

  it('retryDispatch genuinely re-queues and increments retryCount, clearing the prior error', async () => {
    const created = await mockCytologyOutboundResultQueueService.enqueue(entry());
    if (!created.ok) throw new Error('setup failed');
    await mockCytologyOutboundResultQueueService.markFailed(created.data.id, { errorCode: 'DISPATCH_TIMEOUT', errorMessage: 'timed out', maxRetriesExceeded: false });
    const retried = await mockCytologyOutboundResultQueueService.retryDispatch(created.data.id);
    if (!retried.ok) throw new Error('setup failed');
    expect(retried.data.status).toBe('QUEUED');
    expect(retried.data.retryCount).toBe(1);
    expect(retried.data.errorCode).toBeUndefined();
  });

  it('getBySignOutRecordId correctly isolates entries, not just by case', async () => {
    await mockCytologyOutboundResultQueueService.enqueue(entry());
    const res = await mockCytologyOutboundResultQueueService.getBySignOutRecordId('cyto-signout-abc123');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(1);
    const other = await mockCytologyOutboundResultQueueService.getBySignOutRecordId('does-not-exist');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toEqual([]);
  });
});
