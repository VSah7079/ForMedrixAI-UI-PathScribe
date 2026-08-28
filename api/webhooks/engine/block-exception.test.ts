import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyEngineAuth, claimMessageId, applyEngineCaseUpdate, docCreate, logIntegrationError, raiseSpecimenDeficiency } = vi.hoisted(() => ({
  verifyEngineAuth: vi.fn(),
  claimMessageId: vi.fn(),
  applyEngineCaseUpdate: vi.fn(),
  docCreate: vi.fn(),
  logIntegrationError: vi.fn(),
  raiseSpecimenDeficiency: vi.fn(),
}));

vi.mock('./_lib/verifyEngineAuth', () => ({ verifyEngineAuth }));
vi.mock('./_lib/idempotency', () => ({ claimMessageId }));
vi.mock('./_lib/applyEngineCaseUpdate', () => ({ applyEngineCaseUpdate }));
vi.mock('./_lib/logIntegrationError', () => ({ logIntegrationError }));
vi.mock('./_lib/raiseSpecimenDeficiency', () => ({ raiseSpecimenDeficiency }));
vi.mock('./_lib/firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ create: docCreate }) }) }),
}));

import handler from './block-exception';

const validPayload = {
  messageId: 'msg-1', accessionNumber: 'S26-4403', specimenLetter: 'A', blockNumber: '1',
  status: 'Lost', timestamp: '2026-01-01T00:00:00Z', sourceSystem: 'CEREBRO', organisationId: 'ORG-TEST',
};

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/webhooks/engine/block-exception', {
    method, headers: { 'x-api-key': 'real-secret' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('block-exception webhook handler', () => {
  beforeEach(() => {
    verifyEngineAuth.mockReset();
    claimMessageId.mockReset();
    applyEngineCaseUpdate.mockReset();
    docCreate.mockReset();
    logIntegrationError.mockReset();
    raiseSpecimenDeficiency.mockReset();
    verifyEngineAuth.mockReturnValue({ ok: true });
    claimMessageId.mockResolvedValue({ alreadyProcessed: false });
    applyEngineCaseUpdate.mockResolvedValue({ outcome: 'applied', caseId: 'S26-4403' });
    docCreate.mockResolvedValue(undefined);
    raiseSpecimenDeficiency.mockResolvedValue('def-new-id');
  });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects a failed auth check with 401', async () => {
    verifyEngineAuth.mockReturnValue({ ok: false, reason: 'bad secret' });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(401);
    expect(applyEngineCaseUpdate).not.toHaveBeenCalled();
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await handler(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(400);
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ category: 'PAYLOAD_VALIDATION_FAILED', httpStatus: 400, eventType: 'block-exception' }));
  });

  it('rejects an invalid status value with 400', async () => {
    expect((await handler(makeRequest({ ...validPayload, status: 'Misplaced' }))).status).toBe(400);
  });

  it('includes accessionNumber in the audit log entry when present on an otherwise-invalid payload', async () => {
    await handler(makeRequest({ accessionNumber: 'S26-4403', messageId: 'msg-1' }));
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ accessionNumber: 'S26-4403' }));
  });

  it('returns 200 already-processed on a redelivered messageId, without calling applyEngineCaseUpdate', async () => {
    claimMessageId.mockResolvedValue({ alreadyProcessed: true });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('already-processed');
    expect(applyEngineCaseUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the case is not found', async () => {
    applyEngineCaseUpdate.mockResolvedValue({ outcome: 'case-not-found', caseId: 'S26-4403' });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(404);
    expect(docCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when the block is not found on a real case', async () => {
    applyEngineCaseUpdate.mockResolvedValue({ outcome: 'target-not-found', caseId: 'S26-4403' });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(404);
  });

  it('applies the mutation, writes a real notification, and returns 200 on success', async () => {
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect(applyEngineCaseUpdate).toHaveBeenCalledTimes(1);
    expect(docCreate).toHaveBeenCalledTimes(1);
    const written = docCreate.mock.calls[0][0];
    expect(written.eventType).toBe('block-exception');
    expect(written.payload.status).toBe('Lost');
  });

  it('raises a real, open def-block-lost CAPA record for a Lost status', async () => {
    await handler(makeRequest(validPayload));
    expect(raiseSpecimenDeficiency).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'S26-4403', deficiencyTypeId: 'def-block-lost', organisationId: 'ORG-TEST', raisedBy: 'system',
    }));
  });

  it('raises a real, open def-block-damaged CAPA record for a Damaged status', async () => {
    await handler(makeRequest({ ...validPayload, status: 'Damaged' }));
    expect(raiseSpecimenDeficiency).toHaveBeenCalledWith(expect.objectContaining({ deficiencyTypeId: 'def-block-damaged' }));
  });

  it('still returns 200 even when raising the CAPA record itself fails — never masks a real, successful mutation', async () => {
    raiseSpecimenDeficiency.mockRejectedValue(new Error('Firestore is down'));
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
  });

  it('uses internalCaseId over accessionNumber when both are present', async () => {
    await handler(makeRequest({ ...validPayload, internalCaseId: 'O26-0029' }));
    expect(applyEngineCaseUpdate).toHaveBeenCalledWith('O26-0029', expect.any(Function));
  });

  it('returns 500 on an unexpected internal error', async () => {
    applyEngineCaseUpdate.mockRejectedValue(new Error('Firestore is down'));
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(500);
  });
});
