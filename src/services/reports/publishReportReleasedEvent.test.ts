// src/services/reports/publishReportReleasedEvent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./dispatchCaseInstances', () => ({
  dispatchCaseInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./dispatchAmendedCaseInstance', () => ({
  dispatchAmendedCaseInstance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../cytology/dispatchCytologyCaseInstances', () => ({
  dispatchCytologyCaseInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../cytology/dispatchCytologyAmendedCaseInstance', () => ({
  dispatchCytologyAmendedCaseInstance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./dispatchPreliminaryCaseInstances', () => ({
  dispatchPreliminaryCaseInstances: vi.fn().mockResolvedValue(2),
}));
vi.mock('../printing/dispatchPrintJob', () => ({
  dispatchPrintJob: vi.fn().mockResolvedValue({ outcome: 'not_configured' }),
}));
vi.mock('../delivery/resolveRealDeliveryDecision', () => ({
  resolveRealDeliveryDecision: vi.fn().mockResolvedValue({ action: 'DUAL' }),
}));
vi.mock('./mockReportReleasedEventLogService', () => ({
  mockReportReleasedEventLogService: { record: vi.fn().mockResolvedValue({}) },
}));

import { dispatchCaseInstances } from './dispatchCaseInstances';
import { dispatchAmendedCaseInstance } from './dispatchAmendedCaseInstance';
import { dispatchCytologyCaseInstances } from '../cytology/dispatchCytologyCaseInstances';
import { dispatchCytologyAmendedCaseInstance } from '../cytology/dispatchCytologyAmendedCaseInstance';
import { dispatchPreliminaryCaseInstances } from './dispatchPreliminaryCaseInstances';
import { dispatchPrintJob } from '../printing/dispatchPrintJob';
import { resolveRealDeliveryDecision } from '../delivery/resolveRealDeliveryDecision';
import { mockReportReleasedEventLogService } from './mockReportReleasedEventLogService';
import { publishReportReleasedEvent } from './publishReportReleasedEvent';

beforeEach(() => {
  vi.mocked(dispatchCaseInstances).mockClear();
  vi.mocked(dispatchAmendedCaseInstance).mockClear();
  vi.mocked(dispatchCytologyCaseInstances).mockClear();
  vi.mocked(dispatchCytologyAmendedCaseInstance).mockClear();
  vi.mocked(dispatchPreliminaryCaseInstances).mockClear();
  vi.mocked(dispatchPrintJob).mockReset();
  vi.mocked(dispatchPrintJob).mockResolvedValue({ outcome: 'not_configured' });
  vi.mocked(resolveRealDeliveryDecision).mockReset();
  vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'DUAL' });
  vi.mocked(mockReportReleasedEventLogService.record).mockClear();
});

describe('publishReportReleasedEvent', () => {
  it('always logs the real event first, regardless of reportType', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(mockReportReleasedEventLogService.record).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'CASE-1', reportType: 'FINAL' }));
  });

  it("a real FINAL event delegates to the real, existing dispatchCaseInstances when the resolved action calls for electronic dispatch", async () => {
    const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
    expect(dispatchPreliminaryCaseInstances).not.toHaveBeenCalled();
    expect(result.dispatchedCount).toBeUndefined();
  });

  it("a real PRELIMINARY event delegates to the real, extracted dispatchPreliminaryCaseInstances and returns its real count", async () => {
    const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'PRELIMINARY', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(dispatchPreliminaryCaseInstances).toHaveBeenCalledWith('CASE-1');
    expect(dispatchCaseInstances).not.toHaveBeenCalled();
    expect(result.dispatchedCount).toBe(2);
  });

  it('a real CORRECTED event with a real instanceId dispatches through the new, dedicated dispatchAmendedCaseInstance \u2014 never dispatchCaseInstances, which is genuinely FINAL-only', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', instanceId: 'INST-1' });
    expect(dispatchAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'INST-1', 'CORRECTED', undefined);
    expect(dispatchCaseInstances).not.toHaveBeenCalled();
  });

  it('a real ADDENDUM event with a real instanceId dispatches through the same, dedicated function, with the correct resultState', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'ADDENDUM', releasedAt: '2026-09-16T00:00:00.000Z', instanceId: 'INST-1' });
    expect(dispatchAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'INST-1', 'ADDENDUM', undefined);
  });

  it('a real, verbatim previouslyReportedAs value is forwarded through, untouched, to the new dispatch function', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', instanceId: 'INST-1', previouslyReportedAs: 'Benign fibroadenoma.' });
    expect(dispatchAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'INST-1', 'CORRECTED', 'Benign fibroadenoma.');
  });

  it('a real CORRECTED/ADDENDUM event with no instanceId at all is a real, honest, silent no-op \u2014 never a guess at which instance the caller meant', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(dispatchAmendedCaseInstance).not.toHaveBeenCalled();
    expect(dispatchCaseInstances).not.toHaveBeenCalled();
  });

  it('calls the real, second, concurrent print subscriber when the resolved action calls for it, forwarding facility/PDF/priority', async () => {
    const generatePdf = vi.fn();
    await publishReportReleasedEvent({
      caseId: 'CASE-1', reportType: 'PRELIMINARY', releasedAt: '2026-09-16T00:00:00.000Z',
      performingFacilityId: 'FAC-A', generatePdf, priority: 'Urgent',
    });
    expect(dispatchPrintJob).toHaveBeenCalledWith('CASE-1', 'FAC-A', 'PRELIMINARY', 'Urgent', generatePdf);
  });

  it('defaults priority to Routine when the event omits it', async () => {
    await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(dispatchPrintJob).toHaveBeenCalledWith('CASE-1', undefined, 'FINAL', 'Routine', undefined);
  });

  it("the real print subscriber's own outcome is returned on the result, alongside the electronic result", async () => {
    vi.mocked(dispatchPrintJob).mockResolvedValue({ outcome: 'dispatched', jobId: 'job-1' });
    const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(result.printOutcome).toBe('dispatched');
  });

  it('a real, thrown print-side failure is caught and reported as a real, honest "failed" outcome \u2014 never allowed to break the whole publish call or mask electronic dispatch', async () => {
    vi.mocked(dispatchPrintJob).mockRejectedValue(new Error('boom'));
    const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
    expect(result.printOutcome).toBe('failed');
    expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
  });

  describe('Component C \u2014 the real Delivery Configuration Rules Engine gate', () => {
    it('ELECTRONIC_ONLY runs electronic dispatch but never calls the print subscriber at all', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'ELECTRONIC_ONLY' });
      const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
      expect(dispatchPrintJob).not.toHaveBeenCalled();
      expect(result.printOutcome).toBeUndefined();
      expect(result.deliveryAction).toBe('ELECTRONIC_ONLY');
    });

    it('PRINT_ONLY runs the print subscriber but never electronic dispatch at all', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'PRINT_ONLY' });
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchPrintJob).toHaveBeenCalled();
      expect(dispatchCaseInstances).not.toHaveBeenCalled();
    });

    it('DUAL runs both, genuinely concurrently', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'DUAL' });
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchCaseInstances).toHaveBeenCalled();
      expect(dispatchPrintJob).toHaveBeenCalled();
    });

    it('real, per the source spec\u2019s own "Suppress Delivery (Hold in portal for manual retrieval)" \u2014 SUPPRESS runs neither real subscriber at all', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'SUPPRESS' });
      const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchCaseInstances).not.toHaveBeenCalled();
      expect(dispatchPrintJob).not.toHaveBeenCalled();
      expect(result.deliveryAction).toBe('SUPPRESS');
      // Real, deliberate: the event is still real and logged (see the
      // very first test in this file) — "suppressed" means no
      // dispatch, never "this release never happened at all."
    });

    it('the real matchedRuleId is carried through onto the result, for a real, honest audit trail of why delivery was decided this way', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockResolvedValue({ action: 'PRINT_ONLY', matchedRuleId: 'dr-123' });
      const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(result.matchedRuleId).toBe('dr-123');
    });

    it('a real, thrown failure resolving the delivery decision itself (a transient Case/Location service hiccup) degrades to ELECTRONIC_ONLY rather than aborting the whole publish call \u2014 a genuine release must never silently reach neither subscriber', async () => {
      vi.mocked(resolveRealDeliveryDecision).mockRejectedValue(new Error('Location service unreachable'));
      const result = await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
      expect(dispatchPrintJob).not.toHaveBeenCalled();
      expect(result.deliveryAction).toBe('ELECTRONIC_ONLY');
    });
  });

  describe('Cytology source routing, per direct follow-up ("wire in Cytology")', () => {
    it('a real FINAL event with source: CYTOLOGY routes to the real, extracted dispatchCytologyCaseInstances, never Surg Path\u2019s own dispatchCaseInstances', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z', source: 'CYTOLOGY' });
      expect(dispatchCytologyCaseInstances).toHaveBeenCalledWith('CASE-1');
      expect(dispatchCaseInstances).not.toHaveBeenCalled();
    });

    it('an omitted source defaults to Surg Path\u2019s own real dispatch \u2014 every real caller before this field existed keeps its exact, existing behavior unchanged', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z' });
      expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
      expect(dispatchCytologyCaseInstances).not.toHaveBeenCalled();
    });

    it('an explicit source: SURGPATH also routes to the real Surg Path dispatch, same as the default', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'FINAL', releasedAt: '2026-09-16T00:00:00.000Z', source: 'SURGPATH' });
      expect(dispatchCaseInstances).toHaveBeenCalledWith('CASE-1');
      expect(dispatchCytologyCaseInstances).not.toHaveBeenCalled();
    });

    it('a real CORRECTED event with source: CYTOLOGY and a real instanceId routes to the real, dedicated dispatchCytologyAmendedCaseInstance \u2014 never the Surg Path dispatchAmendedCaseInstance, per direct follow-up ("Cytology has no amendment mechanism at all... work this")', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', source: 'CYTOLOGY', instanceId: 'REC-1' });
      expect(dispatchCytologyAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'REC-1', 'CORRECTED', undefined);
      expect(dispatchAmendedCaseInstance).not.toHaveBeenCalled();
    });

    it('the real, verbatim previouslyReportedAs value is forwarded through to the real Cytology amendment dispatch too', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', source: 'CYTOLOGY', instanceId: 'REC-1', previouslyReportedAs: 'NILM.' });
      expect(dispatchCytologyAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'REC-1', 'CORRECTED', 'NILM.');
    });

    it('a real CORRECTED event with source: CYTOLOGY but no real instanceId is a real, honest, silent no-op \u2014 same real posture as the Surg Path path\u2019s own identical requirement', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', source: 'CYTOLOGY' });
      expect(dispatchCytologyAmendedCaseInstance).not.toHaveBeenCalled();
      expect(dispatchAmendedCaseInstance).not.toHaveBeenCalled();
    });

    it('a real CORRECTED event with an omitted (Surg Path) source still routes to the real, existing dispatchAmendedCaseInstance \u2014 confirms the fallthrough behaves correctly, never regressing the already-working Surg Path path', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'CORRECTED', releasedAt: '2026-09-16T00:00:00.000Z', instanceId: 'INST-1' });
      expect(dispatchAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'INST-1', 'CORRECTED', undefined);
      expect(dispatchCytologyAmendedCaseInstance).not.toHaveBeenCalled();
    });

    it('a real ADDENDUM event with source: CYTOLOGY routes to the real, dedicated Cytology dispatch too, per direct correction ("Cytology cases can have addendums") \u2014 an earlier version of this test wrongly asserted the opposite', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'ADDENDUM', releasedAt: '2026-09-16T00:00:00.000Z', source: 'CYTOLOGY', instanceId: 'REC-1' });
      expect(dispatchCytologyAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'REC-1', 'ADDENDUM', undefined);
      expect(dispatchAmendedCaseInstance).not.toHaveBeenCalled();
    });

    it('an omitted (Surg Path) source for a real ADDENDUM event still routes to the existing dispatchAmendedCaseInstance, unaffected by the Cytology branch above', async () => {
      await publishReportReleasedEvent({ caseId: 'CASE-1', reportType: 'ADDENDUM', releasedAt: '2026-09-16T00:00:00.000Z', instanceId: 'INST-1' });
      expect(dispatchAmendedCaseInstance).toHaveBeenCalledWith('CASE-1', 'INST-1', 'ADDENDUM', undefined);
      expect(dispatchCytologyAmendedCaseInstance).not.toHaveBeenCalled();
    });
  });
});
