import { describe, it, expect, vi, beforeEach } from 'vitest';

const { transitionDeficiency, logIntegrationError } = vi.hoisted(() => ({
  transitionDeficiency: vi.fn(),
  logIntegrationError: vi.fn(),
}));

vi.mock('./_lib/transitionDeficiency', () => ({ transitionDeficiency }));
vi.mock('../../webhooks/engine/_lib/logIntegrationError', () => ({ logIntegrationError }));

import handler from './verify';

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/qa/deficiencies/verify', {
    method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('qa/deficiencies/verify handler', () => {
  beforeEach(() => {
    transitionDeficiency.mockReset();
    logIntegrationError.mockReset();
    transitionDeficiency.mockResolvedValue({ outcome: 'applied' });
  });

  it('rejects a non-POST method with 405', async () => {
    expect((await handler(makeRequest(null, 'GET'))).status).toBe(405);
  });

  it('rejects an outcome value that is not effective or recurred with 400', async () => {
    const res = await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'maybe', verifiedBy: 'PATH-001' }));
    expect(res.status).toBe(400);
  });

  it('transitions pending-verification -> closed for an effective outcome', async () => {
    await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'effective', verifiedBy: 'PATH-001' }));
    expect(transitionDeficiency).toHaveBeenCalledWith('def-1', ['pending-verification'], expect.any(Function));
    const updates = transitionDeficiency.mock.calls[0][2]({ reopenCount: 0 });
    expect(updates.status).toBe('closed');
    expect(updates.reopenCount).toBeUndefined(); // never touched on an effective outcome
  });

  it('transitions pending-verification -> open and increments the real reopenCount for a recurred outcome', async () => {
    await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'recurred', verifiedBy: 'PATH-001', comment: 'Same issue again.' }));
    const updates = transitionDeficiency.mock.calls[0][2]({ reopenCount: 1 });
    expect(updates.status).toBe('open');
    expect(updates.reopenCount).toBe(2);
  });

  it('defaults reopenCount to 0 -> 1 when the current document has never been reopened', async () => {
    await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'recurred', verifiedBy: 'PATH-001' }));
    const updates = transitionDeficiency.mock.calls[0][2]({});
    expect(updates.reopenCount).toBe(1);
  });

  it('returns 404 when the deficiency is not found', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'not-found' });
    expect((await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'effective', verifiedBy: 'PATH-001' }))).status).toBe(404);
  });

  it('returns 409 when the deficiency is not pending-verification', async () => {
    transitionDeficiency.mockResolvedValue({ outcome: 'wrong-status', actualStatus: 'open' });
    expect((await handler(makeRequest({ deficiencyId: 'def-1', outcome: 'effective', verifiedBy: 'PATH-001' }))).status).toBe(409);
  });
});
