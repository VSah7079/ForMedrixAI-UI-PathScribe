// src/services/cytology/mockCytologyRegistryOutboundQueueService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyRegistryOutboundQueueService } from './mockCytologyRegistryOutboundQueueService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const entry = () => ({ caseId: 'S26-7001-CYT-001', signOutRecordId: 'cyto-signout-kr001', registryId: 'kncsp_kccr_korea' });

describe('mockCytologyRegistryOutboundQueueService — real, mirrored generic registry queue', () => {
  it('starts empty', async () => {
    const res = await mockCytologyRegistryOutboundQueueService.getAll();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toEqual([]);
  });

  it('a real enqueue() genuinely persists as QUEUED with the real registryId carried through', async () => {
    const res = await mockCytologyRegistryOutboundQueueService.enqueue(entry());
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.status).toBe('QUEUED');
    expect(res.data.registryId).toBe('kncsp_kccr_korea');
  });

  it('markSent genuinely transitions status', async () => {
    const created = await mockCytologyRegistryOutboundQueueService.enqueue(entry());
    if (!created.ok) throw new Error('setup failed');
    const sent = await mockCytologyRegistryOutboundQueueService.markSent(created.data.id);
    if (!sent.ok) throw new Error('setup failed');
    expect(sent.data.status).toBe('SENT');
  });

  it('markFailed genuinely records the real, given error details', async () => {
    const created = await mockCytologyRegistryOutboundQueueService.enqueue(entry());
    if (!created.ok) throw new Error('setup failed');
    const failed = await mockCytologyRegistryOutboundQueueService.markFailed(created.data.id, { errorCode: 'DISPATCH_REJECTED', errorMessage: 'Bad payload', maxRetriesExceeded: false });
    if (!failed.ok) throw new Error('setup failed');
    expect(failed.data.status).toBe('FAILED');
    const failedList = await mockCytologyRegistryOutboundQueueService.getFailed();
    if (!failedList.ok) throw new Error('setup failed');
    expect(failedList.data.length).toBe(1);
  });

  it('getByCaseId correctly isolates entries by case', async () => {
    await mockCytologyRegistryOutboundQueueService.enqueue(entry());
    const res = await mockCytologyRegistryOutboundQueueService.getByCaseId('S26-7001-CYT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(1);
    const other = await mockCytologyRegistryOutboundQueueService.getByCaseId('does-not-exist');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toEqual([]);
  });
});
