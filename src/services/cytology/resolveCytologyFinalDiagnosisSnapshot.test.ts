// src/services/cytology/resolveCytologyFinalDiagnosisSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyFinalDiagnosisSnapshot } from './resolveCytologyFinalDiagnosisSnapshot';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const REVIEW: CytologyReviewRecord = {
  id: 'cyto-review-abc123',
  specimenId: 'SPEC-1',
  caseId: 'CASE-1',
  role: 'pathologist_review',
  adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
  generalCategorizationId: 'cyto-gencat-epithelial-squamous',
  primaryInterpretationId: 'cyto-squam-hsil',
  primaryInterpretationComment: 'classic features',
  additionalInterpretations: [{ categoryId: 'cyto-org-trichomonas' }],
  recommendations: [{ categoryId: 'cyto-rec-colposcopy' }],
  requiresPathologistReview: true,
  recordedAt: '2026-09-03T00:00:00.000Z',
  recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
};

describe('resolveCytologyFinalDiagnosisSnapshot', () => {
  it('builds a real, complete snapshot from the chosen review record', () => {
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(REVIEW);
    expect(snapshot).toEqual({
      reviewRecordId: 'cyto-review-abc123',
      primaryInterpretationId: 'cyto-squam-hsil',
      primaryInterpretationComment: 'classic features',
      additionalInterpretations: [{ categoryId: 'cyto-org-trichomonas' }],
      recommendations: [{ categoryId: 'cyto-rec-colposcopy' }],
      adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
      generalCategorizationId: 'cyto-gencat-epithelial-squamous',
    });
  });

  it('a review with no additional interpretations or recommendations still snapshots correctly, with those fields genuinely undefined', () => {
    const bare: CytologyReviewRecord = {
      id: 'cyto-review-bare', specimenId: 'SPEC-2', caseId: 'CASE-2', role: 'primary_screen',
      primaryInterpretationId: 'cyto-gencat-nilm', requiresPathologistReview: false,
      recordedAt: '2026-09-03T00:00:00.000Z', recordedBy: { userId: 'CT-001', userName: 'Jane CT' },
    };
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(bare);
    expect(snapshot.primaryInterpretationId).toBe('cyto-gencat-nilm');
    expect(snapshot.additionalInterpretations).toBeUndefined();
    expect(snapshot.recommendations).toBeUndefined();
  });

  it('never includes selectedBy/selectedByName/selectedAt — this pure function has no way to know who is selecting', () => {
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(REVIEW);
    expect('selectedBy' in snapshot).toBe(false);
    expect('selectedByName' in snapshot).toBe(false);
    expect('selectedAt' in snapshot).toBe(false);
  });

  it('correctly resolves from a real secondary screening review the same way as a primary or pathologist review — the function is agnostic to role', () => {
    const secondary: CytologyReviewRecord = {
      ...REVIEW, id: 'cyto-review-secondary', role: 'qc_random_selection',
    };
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(secondary);
    expect(snapshot.reviewRecordId).toBe('cyto-review-secondary');
    expect(snapshot.primaryInterpretationId).toBe(REVIEW.primaryInterpretationId);
  });
});
