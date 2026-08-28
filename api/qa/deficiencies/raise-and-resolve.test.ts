import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docSet, docId, logIntegrationError } = vi.hoisted(() => ({
  docSet: vi.fn(), docId: vi.fn(() => 'new-def-id'), logIntegrationError: vi.fn(),
}));

vi.mock('../../webhooks/engine/_lib/firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ get id() { return docId(); }, set: docSet }) }) }),
}));
vi.mock('../../webhooks/engine/_lib/logIntegrationError', () => ({ logIntegrationError }));

import handler from './raise-and-resolve';

const validBody = {
  caseId: 'CASE-1', deficiencyTypeId: 'def-no-dict-match', raisedBy: 'PATH-001',
  resolutionTypeId: 'res-1', resolvedBy: 'PATH-001',
};

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/qa/deficiencies/raise-and-resolve', {
    method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('qa/deficiencies/raise-and-resolve handler', () => {
  beforeEach(() => { docSet.mockReset(); docSet.mockResolvedValue(undefined); logIntegrationError.mockReset(); });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await handler(makeRequest({ caseId: 'CASE-1' }));
    expect(res.status).toBe(400);
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'qa-deficiencies-raise-and-resolve' }));
  });

  it('creates a real, new document directly at status closed, never pending-verification', async () => {
    const res = await handler(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(docSet).toHaveBeenCalledTimes(1);
    const written = docSet.mock.calls[0][0];
    expect(written.status).toBe('closed');
    expect(written.caseId).toBe('CASE-1');
    expect(written.resolvedBy).toBe('PATH-001');
    expect(typeof written.raisedAt).toBe('string');
    expect(typeof written.resolvedAt).toBe('string');
  });

  it('returns the real new document id', async () => {
    const res = await handler(makeRequest(validBody));
    const body = await res.json();
    expect(body.deficiencyId).toBe('new-def-id');
  });

  it('returns 500 on an unexpected internal error', async () => {
    docSet.mockRejectedValue(new Error('Firestore is down'));
    expect((await handler(makeRequest(validBody))).status).toBe(500);
  });
});
