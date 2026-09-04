// src/types/cytology/CytologyReviewRecord.test.ts
import { describe, it, expect } from 'vitest';
import { allCytologyInterpretationIds } from './CytologyReviewRecord';

describe('allCytologyInterpretationIds', () => {
  it('combines primaryInterpretationId with additionalInterpretations\' own categoryIds, primary first', () => {
    expect(allCytologyInterpretationIds({
      primaryInterpretationId: 'cyto-squam-ascus',
      additionalInterpretations: [{ categoryId: 'cyto-org-trichomonas' }, { categoryId: 'cyto-nonneo-atrophy', comment: 'mild' }],
    })).toEqual(['cyto-squam-ascus', 'cyto-org-trichomonas', 'cyto-nonneo-atrophy']);
  });

  it('with no additionalInterpretations, returns just the primary in a real array', () => {
    expect(allCytologyInterpretationIds({
      primaryInterpretationId: 'cyto-gencat-nilm',
      additionalInterpretations: undefined,
    })).toEqual(['cyto-gencat-nilm']);
  });

  it('an empty additionalInterpretations array behaves the same as undefined', () => {
    expect(allCytologyInterpretationIds({
      primaryInterpretationId: 'cyto-gencat-nilm',
      additionalInterpretations: [],
    })).toEqual(['cyto-gencat-nilm']);
  });
});
