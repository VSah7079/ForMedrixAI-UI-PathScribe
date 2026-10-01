import { describe, it, expect, vi, beforeEach } from 'vitest';

const { txGet, txSet, runTransaction } = vi.hoisted(() => {
  const txGet = vi.fn();
  const txSet = vi.fn();
  const runTransaction = vi.fn(async (cb: any) => cb({ get: txGet, set: txSet }));
  return { txGet, txSet, runTransaction };
});

vi.mock('./firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({ doc: () => ({}) }),
    runTransaction,
  }),
}));

import { upsertEngraverStatus } from './upsertEngraverStatus';

const baseInput = {
  deviceId: 'ENG-NY-04', organisationId: 'ORG-MFT', status: 'warning' as const,
  sourceSystem: 'CASSETTE_ENGINE', timestamp: '2026-01-01T12:00:00Z',
};

describe('upsertEngraverStatus', () => {
  beforeEach(() => {
    txGet.mockReset();
    txSet.mockReset();
  });

  it('applies the update when no prior state exists for this device', async () => {
    txGet.mockResolvedValue({ exists: false, data: () => undefined });
    const outcome = await upsertEngraverStatus(baseInput);
    expect(outcome).toBe('applied');
    expect(txSet).toHaveBeenCalledTimes(1);
  });

  it('applies the update when the new event is genuinely newer than current state', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ lastReportedAt: '2026-01-01T11:00:00Z' }) });
    const outcome = await upsertEngraverStatus(baseInput);
    expect(outcome).toBe('applied');
    expect(txSet).toHaveBeenCalledTimes(1);
  });

  it('ignores an out-of-order event older than the currently stored status, never writing', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ lastReportedAt: '2026-01-01T13:00:00Z' }) });
    const outcome = await upsertEngraverStatus(baseInput);
    expect(outcome).toBe('stale-ignored');
    expect(txSet).not.toHaveBeenCalled();
  });

  it('ignores an event with the exact same timestamp as current state (real, exact redelivery)', async () => {
    txGet.mockResolvedValue({ exists: true, data: () => ({ lastReportedAt: baseInput.timestamp }) });
    const outcome = await upsertEngraverStatus(baseInput);
    expect(outcome).toBe('stale-ignored');
    expect(txSet).not.toHaveBeenCalled();
  });
});
