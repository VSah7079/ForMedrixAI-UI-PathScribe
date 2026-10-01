import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docSet, docId } = vi.hoisted(() => ({ docSet: vi.fn(), docId: vi.fn(() => 'new-doc-id') }));

vi.mock('./firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({ get id() { return docId(); }, set: docSet }),
    }),
  }),
}));

import { raiseSpecimenDeficiency } from './raiseSpecimenDeficiency';

describe('raiseSpecimenDeficiency', () => {
  beforeEach(() => { docSet.mockReset(); docSet.mockResolvedValue(undefined); });

  it('writes a real, open deficiency with a real raisedAt timestamp', async () => {
    await raiseSpecimenDeficiency({
      caseId: 'CASE-1', organisationId: 'ORG-TEST', siteId: 'SITE-1',
      specimenLabel: 'A1', deficiencyTypeId: 'def-block-lost',
      comment: 'Reported Lost by the Cassette Engine.', raisedBy: 'system',
    });
    expect(docSet).toHaveBeenCalledTimes(1);
    const written = docSet.mock.calls[0][0];
    expect(written.status).toBe('open');
    expect(written.caseId).toBe('CASE-1');
    expect(written.deficiencyTypeId).toBe('def-block-lost');
    expect(typeof written.raisedAt).toBe('string');
  });

  it('never sets any resolution-lifecycle field — this is raise() only, not raiseAndResolve()', async () => {
    await raiseSpecimenDeficiency({
      caseId: 'CASE-1', deficiencyTypeId: 'def-block-damaged', raisedBy: 'system',
    });
    const written = docSet.mock.calls[0][0];
    expect(written.resolvedBy).toBeUndefined();
    expect(written.resolutionTypeId).toBeUndefined();
  });

  it('returns the new document\'s real id', async () => {
    const id = await raiseSpecimenDeficiency({ caseId: 'CASE-1', deficiencyTypeId: 'def-block-lost', raisedBy: 'system' });
    expect(id).toBe('new-doc-id');
  });
});
