// src/utils/applyGrossingRefinement.test.ts
import { describe, it, expect } from 'vitest';
import { applyGrossingRefinement, isGrossingReportPristine, markGrossingRefinementFailed } from './applyGrossingRefinement';
import type { GrossingReportInstance } from '@/types/case/Case';
import type { GrossingTemplateAssignment } from '@/services/grossing/IGrossingEvaluationService';

function makeReport(overrides: Partial<GrossingReportInstance> = {}): GrossingReportInstance {
  return {
    instanceId: 'inst-1',
    specimenId: 'sp-1',
    templateId: 'grossing_standard_tissue',
    templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
    status: 'draft',
    answers: {},
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<GrossingTemplateAssignment> = {}): GrossingTemplateAssignment {
  return {
    specimenId: 'sp-1',
    templateId: 'grossing_breast_biopsy',
    templateName: 'Breast Core Needle Biopsy',
    confidence: 92,
    reason: 'Real, specific AI reasoning',
    ...overrides,
  };
}

const fixedNow = () => '2026-08-12T10:05:00.000Z';

describe('isGrossingReportPristine — real, load-bearing safety check', () => {
  it('a real, untouched draft report is pristine', () => {
    expect(isGrossingReportPristine(makeReport())).toBe(true);
  });

  it('a finalized report is never pristine, regardless of answers', () => {
    expect(isGrossingReportPristine(makeReport({ status: 'finalized' }))).toBe(false);
  });

  it('a draft report with at least one real answer is not pristine', () => {
    expect(isGrossingReportPristine(makeReport({ answers: { field1: 'some value' } }))).toBe(false);
  });
});

describe('applyGrossingRefinement — template safety (per direct follow-up: "The AI call can happen in the background")', () => {
  it('refines a genuinely pristine report\'s template when the AI suggests a real, different one', () => {
    const result = applyGrossingRefinement([makeReport()], [makeAssignment()], fixedNow);
    expect(result.anyTemplateChanged).toBe(true);
    expect(result.anyDataChanged).toBe(true);
    expect(result.reports[0]).toMatchObject({
      templateId: 'grossing_breast_biopsy',
      templateName: 'Breast Core Needle Biopsy',
      updatedAt: '2026-08-12T10:05:00.000Z',
    });
  });

  it('never changes a real, already-finalized report\'s template, even when the AI suggests something different', () => {
    const finalized = makeReport({ status: 'finalized' });
    const result = applyGrossingRefinement([finalized], [makeAssignment()], fixedNow);
    expect(result.anyTemplateChanged).toBe(false);
    expect(result.reports[0].templateId).toBe('grossing_standard_tissue'); // unchanged
    expect(result.reports[0].status).toBe('finalized'); // untouched otherwise
  });

  it('never changes a real report\'s template once someone has started answering it, even if still nominally draft', () => {
    const touched = makeReport({ answers: { grossDescription: 'Received in formalin, measuring 2.1 x 1.4 x 0.8 cm.' } });
    const result = applyGrossingRefinement([touched], [makeAssignment()], fixedNow);
    expect(result.anyTemplateChanged).toBe(false);
    expect(result.reports[0].templateId).toBe('grossing_standard_tissue');
    expect(result.reports[0].answers).toEqual(touched.answers); // untouched
  });

  it('a pristine report\'s template is left unchanged when the AI genuinely agrees with the current default', () => {
    const pristine = makeReport();
    const sameAssignment = makeAssignment({ templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A' });
    const result = applyGrossingRefinement([pristine], [sameAssignment], fixedNow);
    expect(result.anyTemplateChanged).toBe(false);
    expect(result.reports[0].templateId).toBe('grossing_standard_tissue');
  });

  it('a report with no real, matching AI assignment at all is returned completely unchanged, same object reference', () => {
    const pristine = makeReport({ specimenId: 'sp-unmatched' });
    const result = applyGrossingRefinement([pristine], [makeAssignment({ specimenId: 'sp-1' })], fixedNow);
    expect(result.anyDataChanged).toBe(false);
    expect(result.reports[0]).toBe(pristine); // genuinely untouched — no real assignment existed for it
  });
});

describe('applyGrossingRefinement — quality-outcome capture (per direct follow-up: "Do we capture failed template association? That might be a good quality measure")', () => {
  it('records a real "ai" outcome with confidence and reason for a genuine, confident AI decision', () => {
    const result = applyGrossingRefinement([makeReport()], [makeAssignment({ confidence: 91, belowThreshold: false })], fixedNow);
    expect(result.reports[0].templateAssignmentOutcome).toEqual({
      outcome: 'ai',
      confidence: 91,
      reason: 'Real, specific AI reasoning',
      evaluatedAt: '2026-08-12T10:05:00.000Z',
    });
  });

  it('records a real "fallback" outcome when the AI ran but confidence was below threshold', () => {
    const result = applyGrossingRefinement(
      [makeReport()],
      [makeAssignment({ belowThreshold: true, confidence: 34, reason: 'Fell back to default Grossing Template — low confidence' })],
      fixedNow,
    );
    expect(result.reports[0].templateAssignmentOutcome).toEqual({
      outcome: 'fallback',
      confidence: 34,
      reason: 'Fell back to default Grossing Template — low confidence',
      evaluatedAt: '2026-08-12T10:05:00.000Z',
    });
  });

  it('records a real "override" outcome for a Pass G0 client-specific override, with no confidence (the AI never ran)', () => {
    const result = applyGrossingRefinement(
      [makeReport()],
      [makeAssignment({ fromOverride: true, reason: 'Pass G0 override' })],
      fixedNow,
    );
    expect(result.reports[0].templateAssignmentOutcome).toEqual({
      outcome: 'override',
      reason: 'Pass G0 override',
      evaluatedAt: '2026-08-12T10:05:00.000Z',
    });
    expect(result.reports[0].templateAssignmentOutcome?.confidence).toBeUndefined();
  });

  it('records the real quality outcome even for an already-touched report whose template is correctly left alone', () => {
    const touched = makeReport({ answers: { field: 'x' } });
    const result = applyGrossingRefinement([touched], [makeAssignment()], fixedNow);
    expect(result.anyTemplateChanged).toBe(false);
    expect(result.anyDataChanged).toBe(true); // the outcome itself is still real, new data worth persisting
    expect(result.reports[0].templateAssignmentOutcome?.outcome).toBe('ai');
    expect(result.reports[0].templateId).toBe('grossing_standard_tissue'); // template itself untouched
  });

  it('a real, mixed set: refines pristine specimens\' templates, records outcomes for all matched specimens, leaves touched ones\' templates alone', () => {
    const pristineOne = makeReport({ specimenId: 'sp-1', instanceId: 'inst-1' });
    const touchedTwo = makeReport({ specimenId: 'sp-2', instanceId: 'inst-2', answers: { field: 'x' } });
    const pristineThree = makeReport({ specimenId: 'sp-3', instanceId: 'inst-3' });

    const assignments = [
      makeAssignment({ specimenId: 'sp-1', templateId: 'grossing_breast_biopsy', templateName: 'Breast Core Needle Biopsy' }),
      makeAssignment({ specimenId: 'sp-2', templateId: 'grossing_should_never_apply', templateName: 'Should Never Apply' }),
      makeAssignment({ specimenId: 'sp-3', templateId: 'grossing_colon_resection', templateName: 'Colon Resection' }),
    ];

    const result = applyGrossingRefinement([pristineOne, touchedTwo, pristineThree], assignments, fixedNow);
    expect(result.anyTemplateChanged).toBe(true);
    expect(result.reports[0].templateId).toBe('grossing_breast_biopsy');
    expect(result.reports[1].templateId).toBe('grossing_standard_tissue'); // untouched template
    expect(result.reports[1].templateAssignmentOutcome?.outcome).toBe('ai'); // but outcome still recorded
    expect(result.reports[2].templateId).toBe('grossing_colon_resection');
  });

  it('an empty reports array produces an empty result with nothing changed', () => {
    const result = applyGrossingRefinement([], [makeAssignment()], fixedNow);
    expect(result.reports).toEqual([]);
    expect(result.anyTemplateChanged).toBe(false);
    expect(result.anyDataChanged).toBe(false);
  });
});

describe('markGrossingRefinementFailed — real, genuine AI/network failure is itself a real quality signal', () => {
  it('records a real "failed" outcome for every specimen, with the real error message', () => {
    const reports = [makeReport({ specimenId: 'sp-1' }), makeReport({ specimenId: 'sp-2', instanceId: 'inst-2' })];
    const result = markGrossingRefinementFailed(reports, 'Real network timeout contacting the AI provider', fixedNow);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.templateAssignmentOutcome).toEqual({
        outcome: 'failed',
        errorMessage: 'Real network timeout contacting the AI provider',
        evaluatedAt: '2026-08-12T10:05:00.000Z',
      });
    }
  });

  it('never touches templateId, templateName, status, or answers — the specimen keeps its safe, immediate default', () => {
    const report = makeReport({ answers: { someField: 'a real, in-progress answer' }, status: 'draft' });
    const [result] = markGrossingRefinementFailed([report], 'error', fixedNow);
    expect(result.templateId).toBe('grossing_standard_tissue');
    expect(result.templateName).toBe(report.templateName);
    expect(result.status).toBe('draft');
    expect(result.answers).toEqual(report.answers);
  });
});
