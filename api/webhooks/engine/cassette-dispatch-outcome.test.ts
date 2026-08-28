import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyEngineAuth, claimMessageId, docCreate, logIntegrationError, raiseSpecimenDeficiency } = vi.hoisted(() => ({
  verifyEngineAuth: vi.fn(),
  claimMessageId: vi.fn(),
  docCreate: vi.fn(),
  logIntegrationError: vi.fn(),
  raiseSpecimenDeficiency: vi.fn(),
}));

vi.mock('./_lib/verifyEngineAuth', () => ({ verifyEngineAuth }));
vi.mock('./_lib/idempotency', () => ({ claimMessageId }));
vi.mock('./_lib/logIntegrationError', () => ({ logIntegrationError }));
vi.mock('./_lib/raiseSpecimenDeficiency', () => ({ raiseSpecimenDeficiency }));
vi.mock('./_lib/firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ create: docCreate }) }) }),
}));

import handler from './cassette-dispatch-outcome';

const validPayload = {
  messageId: 'msg-1', caseId: 'CASE-1', requestedColorKey: 'COLOR_CELLBLOCK',
  actualColorKey: 'COLOR_WHITE', outcome: 'fallback_used', message: 'Hopper 3 empty', reportedAt: '2026-01-01T00:00:00Z',
};

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/webhooks/engine/cassette-dispatch-outcome', {
    method, headers: { 'x-api-key': 'real-secret' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('cassette-dispatch-outcome webhook handler', () => {
  beforeEach(() => {
    verifyEngineAuth.mockReset();
    claimMessageId.mockReset();
    docCreate.mockReset();
    logIntegrationError.mockReset();
    raiseSpecimenDeficiency.mockReset();
    raiseSpecimenDeficiency.mockResolvedValue('def-new-id');
    verifyEngineAuth.mockReturnValue({ ok: true });
    claimMessageId.mockResolvedValue({ alreadyProcessed: false });
    docCreate.mockResolvedValue(undefined);
  });

  it('rejects a non-POST method with 405', async () => {
    const res = await handler(makeRequest(null, 'GET'));
    expect(res.status).toBe(405);
  });

  it('rejects a failed auth check with 401, never reaching payload validation', async () => {
    verifyEngineAuth.mockReturnValue({ ok: false, reason: 'bad secret' });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(401);
    expect(claimMessageId).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400', async () => {
    const req = new Request('https://x', { method: 'POST', headers: { 'x-api-key': 'k' }, body: '{not json' });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await handler(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(400);
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ category: 'PAYLOAD_VALIDATION_FAILED', httpStatus: 400, eventType: 'cassette-dispatch-outcome' }));
  });

  it('rejects an invalid outcome value with 400', async () => {
    const res = await handler(makeRequest({ ...validPayload, outcome: 'not-a-real-outcome' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with status already-processed on a redelivered messageId, and never writes a notification', async () => {
    claimMessageId.mockResolvedValue({ alreadyProcessed: true });
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('already-processed');
    expect(docCreate).not.toHaveBeenCalled();
  });

  it('writes a real record for a non-routine outcome and returns 200', async () => {
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect(docCreate).toHaveBeenCalledTimes(1);
    const written = docCreate.mock.calls[0][0];
    expect(written.eventType).toBe('cassette-dispatch-outcome');
    expect(written.caseId).toBe('CASE-1');
  });

  it('also persists a routine "dispatched" outcome, per the real clinical-audit-trail requirement — a complete history needs successes recorded, not just problems', async () => {
    const res = await handler(makeRequest({ ...validPayload, outcome: 'dispatched' }));
    expect(res.status).toBe(200);
    expect(docCreate).toHaveBeenCalledTimes(1);
    const written = docCreate.mock.calls[0][0];
    expect(written.payload.outcome).toBe('dispatched');
  });

  it('raises a real, open def-cassette-dispatch-failure CAPA record for a real error outcome', async () => {
    await handler(makeRequest({ ...validPayload, outcome: 'error' }));
    expect(raiseSpecimenDeficiency).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', deficiencyTypeId: 'def-cassette-dispatch-failure', raisedBy: 'system',
    }));
  });

  it('never raises a CAPA record for a routine fallback_used or dispatched outcome — history-only, per the explicit decision not to CAPA a mere color substitution', async () => {
    await handler(makeRequest({ ...validPayload, outcome: 'fallback_used' }));
    await handler(makeRequest({ ...validPayload, messageId: 'msg-2', outcome: 'dispatched' }));
    expect(raiseSpecimenDeficiency).not.toHaveBeenCalled();
  });

  it('still returns 200 even when raising the CAPA record itself fails — never masks the real, already-persisted history entry', async () => {
    raiseSpecimenDeficiency.mockRejectedValue(new Error('Firestore is down'));
    const res = await handler(makeRequest({ ...validPayload, outcome: 'error' }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on an unexpected internal error, never leaking the raw error to the caller', async () => {
    claimMessageId.mockRejectedValue(new Error('Firestore is down'));
    const res = await handler(makeRequest(validPayload));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('Firestore is down');
  });
});
