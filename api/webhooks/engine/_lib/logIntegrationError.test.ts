import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docAdd } = vi.hoisted(() => ({ docAdd: vi.fn() }));

vi.mock('./firebaseAdmin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ add: docAdd }) }),
}));

import { logIntegrationError } from './logIntegrationError';

describe('logIntegrationError', () => {
  beforeEach(() => { docAdd.mockReset(); docAdd.mockResolvedValue(undefined); });

  it('writes a real, structured entry with a real loggedAt timestamp', async () => {
    await logIntegrationError({
      category: 'PAYLOAD_VALIDATION_FAILED', source: 'CassetteEngine', httpStatus: 400,
      details: 'Missing field: caseId', eventType: 'cassette-dispatch-outcome', caseId: 'CASE-1',
    });
    expect(docAdd).toHaveBeenCalledTimes(1);
    const written = docAdd.mock.calls[0][0];
    expect(written.category).toBe('PAYLOAD_VALIDATION_FAILED');
    expect(written.httpStatus).toBe(400);
    expect(written.caseId).toBe('CASE-1');
    expect(typeof written.loggedAt).toBe('string');
  });

  it('never throws when the underlying Firestore write fails — never masks the real response', async () => {
    docAdd.mockRejectedValue(new Error('Firestore is down'));
    await expect(logIntegrationError({
      category: 'PAYLOAD_VALIDATION_FAILED', source: 'CassetteEngine', httpStatus: 400,
      details: 'x', eventType: 'block-exception',
    })).resolves.toBeUndefined();
  });
});
