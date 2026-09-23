import { describe, it, expect } from 'vitest';
import { validateQaReviewSubmission, type QaReviewSubmissionDraft } from './validateQaReviewSubmission';
import type { QaActivityType } from '@/types/quality/QaActivityType';

function makeActivityType(overrides: Partial<QaActivityType> = {}): QaActivityType {
  return {
    id: 'qa-activity-test',
    name: 'Test Activity',
    tabScope: 'custom',
    fields: [
      { id: 'frozenCategory', label: 'Frozen Category', type: 'dropdown', required: true, options: [{ id: 'benign', label: 'Benign' }] },
      { id: 'finalDx', label: 'Final Diagnosis', type: 'longtext', required: true, options: [] },
      { id: 'notes', label: 'Notes', type: 'text', required: false, options: [] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    ...overrides,
  };
}

function makeDraft(overrides: Partial<QaReviewSubmissionDraft> = {}): QaReviewSubmissionDraft {
  return {
    fieldValues: { frozenCategory: 'benign', finalDx: 'Benign, no atypia' },
    outcome: 'concordant',
    ...overrides,
  };
}

describe('validateQaReviewSubmission - activity-specific required fields', () => {
  it('is valid when every required field has a real, non-empty value', () => {
    expect(validateQaReviewSubmission(makeActivityType(), makeDraft()).valid).toBe(true);
  });

  it('flags a missing required text field', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft({ fieldValues: { frozenCategory: 'benign' } }));
    expect(result.valid).toBe(false);
    expect(result.errors.finalDx).toBeDefined();
  });

  it('never flags an optional field left empty', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft());
    expect(result.errors.notes).toBeUndefined();
  });

  it('treats a whitespace-only string as empty for a required field', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft({ fieldValues: { frozenCategory: 'benign', finalDx: '   ' } }));
    expect(result.valid).toBe(false);
    expect(result.errors.finalDx).toBeDefined();
  });

  it('treats an empty array as empty for a required checkboxes field', () => {
    const type = makeActivityType({ fields: [{ id: 'markers', label: 'Markers', type: 'checkboxes', required: true, options: [] }] });
    const result = validateQaReviewSubmission(type, makeDraft({ fieldValues: { markers: [] } }));
    expect(result.valid).toBe(false);
    expect(result.errors.markers).toBeDefined();
  });

  it('reports every violation at once, not just the first', () => {
    const type = makeActivityType();
    const result = validateQaReviewSubmission(type, makeDraft({ fieldValues: {} }));
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(['frozenCategory', 'finalDx']));
  });
});

describe("validateQaReviewSubmission - generic outcome section, mirroring Discordance's own real requirement exactly", () => {
  it('requires an outcome to be chosen at all', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft({ outcome: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.outcome).toBeDefined();
  });

  it('a concordant outcome needs nothing beyond the activity-specific fields', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft({ outcome: 'concordant' }));
    expect(result.valid).toBe(true);
  });

  it('a discordant outcome requires delta, severity, rootCause, and a non-empty comment', () => {
    const result = validateQaReviewSubmission(makeActivityType(), makeDraft({ outcome: 'discordant' }));
    expect(result.valid).toBe(false);
    expect(result.errors.delta).toBeDefined();
    expect(result.errors.severity).toBeDefined();
    expect(result.errors.rootCause).toBeDefined();
    expect(result.errors.comments).toBeDefined();
  });

  it('a discordant outcome with delta/severity/rootCause/comments but no rootCauseNote is valid when rootCause is not "other"', () => {
    const result = validateQaReviewSubmission(
      makeActivityType(),
      makeDraft({ outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error', comments: 'Explained in detail.' }),
    );
    expect(result.valid).toBe(true);
  });

  it('the mandatory-narrative fix holds: comments is required even when rootCause is not "other"', () => {
    const result = validateQaReviewSubmission(
      makeActivityType(),
      makeDraft({ outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error', comments: '   ' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.comments).toBeDefined();
  });

  it('requires rootCauseNote when rootCause is "other", even with comments present', () => {
    const result = validateQaReviewSubmission(
      makeActivityType(),
      makeDraft({ outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'other', comments: 'See note.', rootCauseNote: '' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.rootCauseNote).toBeDefined();
  });

  it('is valid when rootCause is "other" and rootCauseNote is provided', () => {
    const result = validateQaReviewSubmission(
      makeActivityType(),
      makeDraft({ outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'other', comments: 'See note.', rootCauseNote: 'Freezer malfunction.' }),
    );
    expect(result.valid).toBe(true);
  });
});
