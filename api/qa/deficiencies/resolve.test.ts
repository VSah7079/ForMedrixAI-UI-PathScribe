import { describe, it, expect, vi, beforeEach } from 'vitest';

const { transitionDeficiency, logIntegrationError } = vi.hoisted(() => ({
  transitionDeficiency: vi.fn(),
  logIntegrationError: vi.fn(),
}));

vi.mock('./_lib/transitionDeficiency', () => ({ transitionDeficiency }));
vi.mock('../../webhooks/engine/_lib/logIntegrationError', () => ({ logIntegrationError }));

import handler from './resolve';

const validBody = {
  deficiencyId: 'def-1', resolutionTypeId: 'res-1', correctiveAction: 'Re-sectioned block.',
  rootCause: 'Fixation time not documented at grossing.', resolvedBy: 'PATH-001',
};

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/qa/deficiencies/resolve', {
    method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('qa/deficiencies/resolve handler', () => {
  beforeEach(() => {
    transitionDeficiency.mockReset();
    logIntegrationError.mockReset();
    transitionDeficiency.mockResolvedValue({ outcome: 'applied' });
  });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects a payload missing rootCause with 400', async () => {
    const { rootCause, ...rest } = validBody;
    const res = await handler(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('transitions open -> pending-verification (never "resolved") on success', async () => {
    const res = await handler(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(transitionDeficiency).toHaveBeenCalledWith('def-1', ['open'], expect.any(Function));
    const updates = transitionDeficiency.mock.calls[0][2]({});
    expect(updates.status).toBe('pending-verification');
    expect(updates.rootCause).toBe(validBody.rootCause);
  });

  it('accepts an optional preventiveAction and verificationDueDate', async () => {
    await handler(makeRequest({ ...validBody, preventiveAction: 'Add checklist step.', verificationDueDate: '2026-02-01T00:00:00Z' }));
    const updates = transitionDeficiency.mock.calls[0][2]({});
    expect(updates.preventiveAction).toBe('Add checklist step.');
    expect(updates.verificationDueDate).toBe('2026-02-01T00:00:00Z');
  });

  it('returns 404 when the deficiency is not found', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'not-found' });
    expect((await handler(makeRequest(validBody))).status).toBe(404);
  });

  it('returns 409 when the deficiency is not open', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'wrong-status', actualStatus: 'pending-verification' });
    expect((await handler(makeRequest(validBody))).status).toBe(409);
  });
});
