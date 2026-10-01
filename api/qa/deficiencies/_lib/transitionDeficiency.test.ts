import { describe, it, expect, vi, beforeEach } from 'vitest';

const { txGet, txUpdate, runTransaction } = vi.hoisted(() => {
  const txGet = vi.fn();
  const txUpdate = vi.fn();
  const runTransaction = vi.fn(async (cb: any) => cb({ get: txGet, update: txUpdate }));
  return { txGet, txUpdate, runTransaction };
});

vi.mock('../../../webhooks/engine/_lib/firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({}) }), runTransaction }),
}));

import { transitionDeficiency } from './transitionDeficiency';

describe('transitionDeficiency', () => {
  beforeEach(() => { txGet.mockReset(); txUpdate.mockReset(); });

  it('applies the update when the document is in a real, expected starting status', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ status: 'open' }) });
    const result = await transitionDeficiency('def-1', ['open'], () => ({ status: 'closed' }));
    expect(result.outcome).toBe('applied');
    expect(txUpdate).toHaveBeenCalledWith({}, { status: 'closed' });
  });

  it('returns not-found and never writes when the document does not exist', async () => {
    txGet.mockResolvedValue({ exists: false });
    const result = await transitionDeficiency('def-missing', ['open'], () => ({ status: 'closed' }));
    expect(result.outcome).toBe('not-found');
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('returns wrong-status with the real actual status, and never writes, when the document is not in an expected state', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ status: 'closed' }) });
    const result = await transitionDeficiency('def-1', ['open'], () => ({ status: 'pending-verification' }));
    expect(result.outcome).toBe('wrong-status');
    expect(result.actualStatus).toBe('closed');
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('accepts multiple real expected starting statuses', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ status: 'pending-verification' }) });
    const result = await transitionDeficiency('def-1', ['open', 'pending-verification'], () => ({ status: 'closed' }));
    expect(result.outcome).toBe('applied');
  });

  it('passes the real, current document data into computeUpdates — needed for a real reopenCount increment', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ status: 'pending-verification', reopenCount: 2 }) });
    const computeUpdates = vi.fn((current: any) => ({ reopenCount: current.reopenCount + 1 }));
    await transitionDeficiency('def-1', ['pending-verification'], computeUpdates);
    expect(computeUpdates).toHaveBeenCalledWith({ status: 'pending-verification', reopenCount: 2 });
    expect(txUpdate).toHaveBeenCalledWith({}, { reopenCount: 3 });
  });
});
