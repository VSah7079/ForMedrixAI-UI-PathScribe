import { describe, it, expect, vi, beforeEach } from 'vitest';

const { transitionDeficiency, logIntegrationError } = vi.hoisted(() => ({
  transitionDeficiency: vi.fn(),
  logIntegrationError: vi.fn(),
}));

vi.mock('./_lib/transitionDeficiency', () => ({ transitionDeficiency }));
vi.mock('../../webhooks/engine/_lib/logIntegrationError', () => ({ logIntegrationError }));

import handler from './contain';

const validBody = { deficiencyId: 'def-1', resolutionTypeId: 'res-1', resolutionComment: 'Recounted, matched.', resolvedBy: 'PATH-001' };

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/qa/deficiencies/contain', {
    method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('qa/deficiencies/contain handler', () => {
  beforeEach(() => {
    transitionDeficiency.mockReset();
    logIntegrationError.mockReset();
    transitionDeficiency.mockResolvedValue({ outcome: 'applied' });
  });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await handler(makeRequest({ deficiencyId: 'def-1' }));
    expect(res.status).toBe(400);
    expect(logIntegrationError).toHaveBeenCalledWith(expect.objectContaining({ category: 'PAYLOAD_VALIDATION_FAILED', source: 'PathScribeQA', eventType: 'qa-deficiencies-contain' }));
  });

  it('transitions open -> closed with the real resolution fields on success', async () => {
    const res = await handler(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(transitionDeficiency).toHaveBeenCalledWith('def-1', ['open'], expect.any(Function));
    const computeUpdates = transitionDeficiency.mock.calls[0][2];
    const updates = computeUpdates({});
    expect(updates.status).toBe('closed');
    expect(updates.resolvedBy).toBe('PATH-001');
  });

  it('returns 404 when the deficiency is not found', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'not-found' });
    expect((await handler(makeRequest(validBody))).status).toBe(404);
  });

  it('returns 409 when the deficiency is not in a real, expected starting status', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'wrong-status', actualStatus: 'closed' });
    const res = await handler(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('closed');
  });

  it('returns 500 on an unexpected internal error', async () => {
    transitionDeficiency.mockRejectedValue(new Error('Firestore is down'));
    expect((await handler(makeRequest(validBody))).status).toBe(500);
  });
});
