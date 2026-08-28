import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyEngineAuth, claimMessageId, applyEngineCaseUpdate, docCreate, logIntegrationError } = vi.hoisted(() => ({
  verifyEngineAuth: vi.fn(),
  claimMessageId: vi.fn(),
  applyEngineCaseUpdate: vi.fn(),
  docCreate: vi.fn(),
  logIntegrationError: vi.fn(),
}));

vi.mock('./_lib/verifyEngineAuth', () => ({ verifyEngineAuth }));
vi.mock('./_lib/idempotency', () => ({ claimMessageId }));
vi.mock('./_lib/applyEngineCaseUpdate', () => ({ applyEngineCaseUpdate }));
vi.mock('./_lib/logIntegrationError', () => ({ logIntegrationError }));
vi.mock('./_lib/firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ create: docCreate }) }) }),
}));

import handler from './material-location';

const validPayload = {
  messageId: 'msg-1', accessionNumber: 'S26-4403', specimenLetter: 'A',
  target: { level: 'block', blockNumber: '1' },
  location: 'Grossing Station 2', timestamp: '2026-01-01T00:00:00Z', sourceSystem: 'CEREBRO',
};

const matrixPayload = {
  messageId: 'msg-2', accessionNumber: 'S26-4403',
  target: { level: 'matrix_block', matrixBlockId: 'MB-1' },
  location: 'Sectioning', timestamp: '2026-01-01T00:00:00Z', sourceSystem: 'CEREBRO',
};

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/webhooks/engine/material-location', {
    method, headers: { 'x-api-key': 'real-secret' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

// Real, deliberate default: since applyEngineCaseUpdate is mocked, the
// real mutate() callback the handler passes in never actually runs
// against real data. Simulate a real "applied" outcome by invoking
// the callback the handler passed in — the same real way the real
// function would — so targetDescription genuinely gets set.
function mockApplied() {
  applyEngineCaseUpdate.mockImplementation(async (_caseId: string, mutate: any) => {
    mutate(
      [{ id: 'SP-1', label: 'A', blocks: [{ id: 'BLK-1', label: '1', locationHistory: [] }] }],
      [{ id: 'MB-1', label: 'MX1', locationHistory: [] }],
    );
    return { outcome: 'applied', caseId: 'S26-4403' };
  });
}

describe('material-location webhook handler', () => {
  beforeEach(() => {
    verifyEngineAuth.mockReset();
    claimMessageId.mockReset();
    applyEngineCaseUpdate.mockReset();
    docCreate.mockReset();
    logIntegrationError.mockReset();
    verifyEngineAuth.mockReturnValue({ ok: true });
    claimMessageId.mockResolvedValue({ alreadyProcessed: false });
    docCreate.mockResolvedValue(undefined);
    mockApplied();
  });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects a failed auth check with 401', async () => {
    verifyEngineAuth.mockReturnValue({ ok: false, reason: 'bad secret' });
    expect((await handler(makeRequest(validPayload))).status).toBe(401);
  });

  it('rejects a non-matrix payload missing specimenLetter with 400', async () => {
    const { specimenLetter, ...rest } = validPayload as any;
    const res = await handler(makeRequest(rest));
    expect(res.status).toBe(400);
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ category: 'PAYLOAD_VALIDATION_FAILED', httpStatus: 400, eventType: 'material-location', accessionNumber: 'S26-4403' }));
  });

  it('accepts a matrix_block payload with no specimenLetter at all', async () => {
    const res = await handler(makeRequest(matrixPayload));
    expect(res.status).toBe(200);
  });

  it('returns 200 already-processed on a redelivered messageId', async () => {
    claimMessageId.mockResolvedValue({ alreadyProcessed: true });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('already-processed');
  });

  it('returns 404 when the case is not found', async () => {
    applyEngineCaseUpdate.mockResolvedValue({ outcome: 'case-not-found', caseId: 'S26-4403' });
    expect((await handler(makeRequest(validPayload))).status).toBe(404);
  });

  it('returns 404 when the real target is not found', async () => {
    applyEngineCaseUpdate.mockResolvedValue({ outcome: 'target-not-found', caseId: 'S26-4403' });
    expect((await handler(makeRequest(validPayload))).status).toBe(404);
  });

  it('writes a real notification including the resolved targetDescription on success', async () => {
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect(docCreate).toHaveBeenCalledTimes(1);
    const written = docCreate.mock.calls[0][0];
    expect(written.eventType).toBe('material-location');
    expect(written.payload.targetDescription).toBe('A1');
  });

  it('returns 500 on an unexpected internal error', async () => {
    applyEngineCaseUpdate.mockRejectedValue(new Error('Firestore is down'));
    expect((await handler(makeRequest(validPayload))).status).toBe(500);
  });
});
