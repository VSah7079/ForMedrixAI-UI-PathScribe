// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockAmendmentService } from './mockAmendmentService';

const authoringPathologist = { userId: 'user-1', userName: 'Dr. Test' };

describe('mockAmendmentService - real reasonId gating, per the detailed post-sign-out revision taxonomy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('captureFields (amendment/correction, Stage 1)', () => {
    it('rejects an amendment with no reasonId, even with a real explanation and notification', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-1', type: 'amendment', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.captureFields(draft.data.id, {
        explanationOfChange: 'Margin status revised.',
        notification: { clinicianName: 'Dr. Referring', method: 'verbal_phone', notifiedAt: new Date().toISOString() },
        originalReportSnapshot: {},
        reasonId: '',
      });
      expect(res.ok).toBe(false);
    });

    it('rejects a correction with no reasonId', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-2', type: 'correction', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.captureFields(draft.data.id, {
        explanationOfChange: 'Fixed a typo.',
        originalReportSnapshot: {},
        reasonId: '',
      });
      expect(res.ok).toBe(false);
    });

    it('accepts a real amendment with a real reasonId, explanation, and notification, and persists reasonId', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-3', type: 'amendment', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.captureFields(draft.data.id, {
        explanationOfChange: 'Margin status revised from negative to focally positive.',
        notification: { clinicianName: 'Dr. Referring', method: 'verbal_phone', notifiedAt: new Date().toISOString() },
        originalReportSnapshot: {},
        reasonId: 'AMEND_MARGIN',
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.reasonId).toBe('AMEND_MARGIN');
    });
  });

  describe('release (addendum single-stage, and the amendment/correction fallback gate)', () => {
    it('rejects an addendum released with no reasonId', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-4', type: 'addendum', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.release(draft.data.id, {
        addendumTitle: 'Addendum: Molecular Results',
        body: 'HER2 FISH results received and appended.',
      });
      expect(res.ok).toBe(false);
    });

    it('accepts a real addendum with a real reasonId and persists it', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-5', type: 'addendum', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.release(draft.data.id, {
        addendumTitle: 'Addendum: Molecular Results',
        body: 'HER2 FISH results received and appended.',
        reasonId: 'ADD_MOLECULAR',
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.reasonId).toBe('ADD_MOLECULAR');
    });

    it('rejects a direct-release amendment/correction call (skipping captureFields) with no reasonId', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-6', type: 'correction', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const res = await mockAmendmentService.release(draft.data.id, {
        explanationOfChange: 'Corrected specimen label.',
        body: 'Corrected specimen label from left to right.',
      });
      expect(res.ok).toBe(false);
    });

    it('does not re-require reasonId at release when captureFields already captured it', async () => {
      const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-7', type: 'correction', authoringPathologist });
      if (!draft.ok) throw new Error('draft failed');
      const captured = await mockAmendmentService.captureFields(draft.data.id, {
        explanationOfChange: 'Corrected specimen label.',
        originalReportSnapshot: {},
        reasonId: 'CORR_SPEC',
      });
      expect(captured.ok).toBe(true);
      const released = await mockAmendmentService.release(draft.data.id, {
        body: 'Corrected specimen label from left to right per accession record.',
      });
      expect(released.ok).toBe(true);
      if (released.ok) expect(released.data.reasonId).toBe('CORR_SPEC');
    });
  });
});

describe('mockAmendmentService - real reportInstanceId/specimenId structured linkage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('startDraft persists the real reportInstanceId/specimenId when given', async () => {
    const res = await mockAmendmentService.startDraft({
      caseId: 'CASE-LINK-1', type: 'addendum', authoringPathologist,
      reportInstanceId: 'sri-42', specimenId: 'sp-A',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.reportInstanceId).toBe('sri-42');
      expect(res.data.specimenId).toBe('sp-A');
    }
  });

  it('a real, case-level amendment (no single report instance) leaves both genuinely undefined, never fabricated', async () => {
    const res = await mockAmendmentService.startDraft({ caseId: 'CASE-LINK-2', type: 'addendum', authoringPathologist });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.reportInstanceId).toBeUndefined();
      expect(res.data.specimenId).toBeUndefined();
    }
  });
});

describe('changeDraftType (Batch 380)', () => {
  beforeEach(() => { localStorage.clear(); });
  it('a new draft follows the modal to a minor amendment or an addendum, renumbered for that type', async () => {
    const prior = await mockAmendmentService.startDraft({ caseId: 'CASE-T', type: 'addendum', authoringPathologist });
    await mockAmendmentService.release(prior.ok ? prior.data.id : '', { body: 'IHC', addendumTitle: 'IHC', reasonId: 'r1' });
    const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-T', type: 'amendment', authoringPathologist });
    if (!draft.ok) throw new Error('no draft');
    const minor = await mockAmendmentService.changeDraftType(draft.data.id, 'correction');
    expect(minor.ok && [minor.data.type, minor.data.sequenceNumber]).toEqual(['correction', 1]);
    // Saved as a minor amendment, it no longer needs the clinician notification.
    expect((await mockAmendmentService.captureFields(draft.data.id, { explanationOfChange: 'Typo', reasonId: 'r1', originalReportSnapshot: null })).ok).toBe(true);
    const add = await mockAmendmentService.startDraft({ caseId: 'CASE-T', type: 'amendment', authoringPathologist });
    if (!add.ok) throw new Error('no draft');
    const addendum = await mockAmendmentService.changeDraftType(add.data.id, 'addendum');
    expect(addendum.ok && [addendum.data.type, addendum.data.sequenceNumber]).toEqual(['addendum', 2]);
  });
  it('a draft whose fields were already captured keeps its type; the same type is a no-op', async () => {
    const draft = await mockAmendmentService.startDraft({ caseId: 'CASE-U', type: 'correction', authoringPathologist });
    if (!draft.ok) throw new Error('no draft');
    await mockAmendmentService.captureFields(draft.data.id, { explanationOfChange: 'Typo', reasonId: 'r1', originalReportSnapshot: null });
    expect((await mockAmendmentService.changeDraftType(draft.data.id, 'correction')).ok).toBe(true);
    expect((await mockAmendmentService.changeDraftType(draft.data.id, 'addendum')).ok).toBe(false);
  });
});
