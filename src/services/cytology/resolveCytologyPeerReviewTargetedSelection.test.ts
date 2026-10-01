// src/services/cytology/resolveCytologyPeerReviewTargetedSelection.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyPeerReviewTargetedSelection } from './resolveCytologyPeerReviewTargetedSelection';

describe('resolveCytologyPeerReviewTargetedSelection — real, per direct guidance ("CAP mandates secondary review for... initial cancer diagnoses")', () => {
  it('does not select when the signed-out diagnosis is below the real HSIL/AIS/malignancy threshold (rank 4)', () => {
    expect(resolveCytologyPeerReviewTargetedSelection(3)).toBe(false);
    expect(resolveCytologyPeerReviewTargetedSelection(2)).toBe(false);
    expect(resolveCytologyPeerReviewTargetedSelection(0)).toBe(false);
  });

  it('does not select when the diagnostic rank is genuinely unresolvable', () => {
    expect(resolveCytologyPeerReviewTargetedSelection(undefined)).toBe(false);
  });

  it('a real HSIL/AIS-tier signed-out diagnosis (rank 4) correctly selects for targeted peer review', () => {
    expect(resolveCytologyPeerReviewTargetedSelection(4)).toBe(true);
  });

  it('a real malignancy diagnosis (rank 5) also correctly selects', () => {
    expect(resolveCytologyPeerReviewTargetedSelection(5)).toBe(true);
  });
});
