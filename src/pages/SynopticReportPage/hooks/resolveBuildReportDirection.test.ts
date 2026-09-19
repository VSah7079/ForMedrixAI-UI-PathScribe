import { describe, it, expect } from 'vitest';
import { resolveBuildReportAvailability } from './resolveBuildReportDirection';

const emptyText = { gross: '', microscopic: '', ancillary: '' };

describe('resolveBuildReportAvailability', () => {
  it('a real, filled-in narrative with no real synoptic answers enables only Suggest Synoptic', () => {
    const result = resolveBuildReportAvailability({
      caseText: { ...emptyText, gross: 'The specimen measures 2.3 cm.' },
      synopticAnswers: {},
    });
    expect(result).toEqual({ canSuggestSynopticFromNarrative: true, canGenerateNarrativeFromSynoptic: false });
  });

  it('real, filled-in synoptic answers with no real narrative text enables only Generate Narrative', () => {
    const result = resolveBuildReportAvailability({
      caseText: emptyText,
      synopticAnswers: { field_1: 'Positive' },
    });
    expect(result).toEqual({ canSuggestSynopticFromNarrative: false, canGenerateNarrativeFromSynoptic: true });
  });

  it('real content on BOTH sides at once enables BOTH real actions independently \u2014 never forces a choice between them', () => {
    const result = resolveBuildReportAvailability({
      caseText: { ...emptyText, gross: 'The specimen measures 2.3 cm.' },
      synopticAnswers: { field_1: 'Positive' },
    });
    expect(result).toEqual({ canSuggestSynopticFromNarrative: true, canGenerateNarrativeFromSynoptic: true });
  });

  it('real, completely empty narrative and synoptic disables both real actions', () => {
    const result = resolveBuildReportAvailability({ caseText: emptyText, synopticAnswers: {} });
    expect(result).toEqual({ canSuggestSynopticFromNarrative: false, canGenerateNarrativeFromSynoptic: false });
  });

  it('a real, whitespace-only narrative is treated as genuinely empty, never enabling Suggest Synoptic', () => {
    const result = resolveBuildReportAvailability({
      caseText: { ...emptyText, gross: '   \n  ' },
      synopticAnswers: {},
    });
    expect(result.canSuggestSynopticFromNarrative).toBe(false);
  });

  it('a real synoptic answer that is falsy but genuinely present (e.g. an empty string explicitly answered) still enables Generate Narrative', () => {
    const result = resolveBuildReportAvailability({ caseText: emptyText, synopticAnswers: { field_1: '' } });
    expect(result.canGenerateNarrativeFromSynoptic).toBe(true);
  });

  it('microscopic or ancillary text alone (without gross) still enables Suggest Synoptic', () => {
    expect(resolveBuildReportAvailability({ caseText: { ...emptyText, microscopic: 'Sections show...' }, synopticAnswers: {} }).canSuggestSynopticFromNarrative).toBe(true);
    expect(resolveBuildReportAvailability({ caseText: { ...emptyText, ancillary: 'IHC pending.' }, synopticAnswers: {} }).canSuggestSynopticFromNarrative).toBe(true);
  });
});
