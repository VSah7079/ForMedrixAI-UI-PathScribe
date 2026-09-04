// src/services/cytology/cloneCytologyReviewAsDraft.test.ts
import { describe, it, expect } from 'vitest';
import { cloneCytologyReviewAsDraft } from './cloneCytologyReviewAsDraft';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const SOURCE: CytologyReviewRecord = {
  id: 'cyto-review-source', specimenId: 'SPEC-1', caseId: 'CASE-1', role: 'primary_screen',
  adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory', comment: 'endocervical component present' }],
  generalCategorizationId: 'cyto-gencat-epithelial-squamous',
  primaryInterpretationId: 'cyto-squam-ascus',
  primaryInterpretationComment: 'borderline changes',
  additionalInterpretations: [{ categoryId: 'cyto-org-trichomonas', comment: 'scant' }],
  recommendations: [{ categoryId: 'cyto-rec-repeat-12mo' }],
  requiresPathologistReview: true,
  notes: 'A note written by the original screener.',
  recordedAt: '2026-09-03T00:00:00.000Z',
  recordedBy: { userId: 'CT-001', userName: 'Jane CT' },
};

describe('cloneCytologyReviewAsDraft', () => {
  it('copies the real diagnostic content — adequacy, general categorization, interpretations, recommendations', () => {
    const draft = cloneCytologyReviewAsDraft(SOURCE, { userId: 'PATH-002', userName: 'Dr. Second' }, 'pathologist_review');
    expect(draft.adequacySelections).toEqual([{ categoryId: 'cyto-adeq-satisfactory' }]);
    expect(draft.generalCategorizationId).toBe('cyto-gencat-epithelial-squamous');
    expect(draft.primaryInterpretationId).toBe('cyto-squam-ascus');
    expect(draft.additionalInterpretations).toEqual([{ categoryId: 'cyto-org-trichomonas' }]);
    expect(draft.recommendations).toEqual([{ categoryId: 'cyto-rec-repeat-12mo' }]);
  });

  it('attributes the draft to the NEW reviewer, in the NEW role — never the source\'s own identity', () => {
    const draft = cloneCytologyReviewAsDraft(SOURCE, { userId: 'PATH-002', userName: 'Dr. Second' }, 'pathologist_review');
    expect(draft.recordedBy).toEqual({ userId: 'PATH-002', userName: 'Dr. Second' });
    expect(draft.role).toBe('pathologist_review');
    expect(draft.recordedBy.userId).not.toBe(SOURCE.recordedBy.userId);
  });

  it('deliberately does NOT copy notes or any per-selection comment — the source reviewer\'s own commentary is never misattributed to the new reviewer', () => {
    const draft = cloneCytologyReviewAsDraft(SOURCE, { userId: 'PATH-002', userName: 'Dr. Second' }, 'pathologist_review');
    expect(draft.notes).toBeUndefined();
    expect(draft.primaryInterpretationComment).toBeUndefined();
    expect(draft.adequacySelections?.[0].comment).toBeUndefined();
    expect(draft.additionalInterpretations?.[0].comment).toBeUndefined();
  });

  it('preserves the same real specimenId/caseId — the clone is still about the same specimen', () => {
    const draft = cloneCytologyReviewAsDraft(SOURCE, { userId: 'CT-003', userName: 'Second CT' }, 'secondary_reviewer');
    expect(draft.specimenId).toBe('SPEC-1');
    expect(draft.caseId).toBe('CASE-1');
  });

  it('works for a Cytotech cloning into a Secondary Reviewer role, not just a Pathologist cloning', () => {
    const draft = cloneCytologyReviewAsDraft(SOURCE, { userId: 'CT-003', userName: 'Senior CT' }, 'secondary_reviewer');
    expect(draft.role).toBe('secondary_reviewer');
    expect(draft.primaryInterpretationId).toBe('cyto-squam-ascus');
  });

  it('a source with no adequacy/additional selections at all clones cleanly, without fabricating empty arrays', () => {
    const bare: CytologyReviewRecord = { ...SOURCE, adequacySelections: undefined, additionalInterpretations: undefined, recommendations: undefined };
    const draft = cloneCytologyReviewAsDraft(bare, { userId: 'CT-003', userName: 'Second CT' }, 'secondary_reviewer');
    expect(draft.adequacySelections).toBeUndefined();
    expect(draft.additionalInterpretations).toBeUndefined();
    expect(draft.recommendations).toBeUndefined();
  });
});
