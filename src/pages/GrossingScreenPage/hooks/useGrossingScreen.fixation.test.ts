// @vitest-environment happy-dom
//
// src/pages/GrossingScreenPage/hooks/useGrossingScreen.fixation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { updateCase: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services', () => ({
  specimenDeficiencyService: {
    getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    raise: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  },
}));

import { caseRouter } from '@/services/cases/CaseRouter';
import { specimenDeficiencyService } from '@/services';
import { useGrossingScreen } from './useGrossingScreen';

function baseParams(overrides: any = {}) {
  const caseData = {
    id: 'CASE-1',
    specimens: [{ id: 'SP-1', label: 'A', blocks: [], processing: {} }],
    ...overrides.caseData,
  };
  const { caseData: _omit, ...restOverrides } = overrides;
  return {
    caseData,
    setCaseData: vi.fn(),
    signingUser: { id: 'USER-1', name: 'Dr. Reed' },
    knownVersionRef: { current: 1 },
    setConcurrencyConflict: vi.fn(),
    ...restOverrides,
  };
}

beforeEach(() => {
  vi.mocked(caseRouter.updateCase).mockClear();
  vi.mocked(specimenDeficiencyService.raise).mockClear();
  vi.mocked(specimenDeficiencyService.getByCaseId).mockClear();
  vi.mocked(specimenDeficiencyService.getByCaseId).mockResolvedValue({ ok: true, data: [] } as any);
});

describe('useGrossingScreen \u2014 handleRecordFixationEnded, per direct request (ISO 15189 traceability)', () => {
  it('a real call records the real, current timestamp as fixationEndedAt, preserving every other real processing field', async () => {
    const params = baseParams({ caseData: { specimens: [{ id: 'SP-1', label: 'A', blocks: [], processing: { processedAt: '2026-09-01T00:00:00.000Z' } }] } });
    const { result } = renderHook(() => useGrossingScreen(params as any));

    await act(async () => { await result.current.handleRecordFixationEnded('SP-1'); });

    const call = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const updatedSpecimen = call[1].specimens.find((s: any) => s.id === 'SP-1');
    expect(updatedSpecimen.processing.fixationEndedAt).toBeTruthy();
    expect(updatedSpecimen.processing.processedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('a real, genuinely nonexistent specimen id is a real, honest no-op, never throws', async () => {
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));
    await expect(result.current.handleRecordFixationEnded('SP-DOES-NOT-EXIST')).resolves.toBeUndefined();
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });
});

describe('useGrossingScreen \u2014 handleConfirmFixativeRatio, per direct guidance\u2019s own follow-up ("timestamp and user ID... to satisfy laboratory accreditation traceability requirements")', () => {
  it('a real call records the real, current signing user\u2019s id/name and a real timestamp \u2014 never a bare boolean', async () => {
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));

    await act(async () => { await result.current.handleConfirmFixativeRatio('SP-1'); });

    const call = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const updatedSpecimen = call[1].specimens.find((s: any) => s.id === 'SP-1');
    expect(updatedSpecimen.processing.fixativeToTissueRatioConfirmation).toEqual(
      expect.objectContaining({ userId: 'USER-1', userName: 'Dr. Reed' }),
    );
    expect(updatedSpecimen.processing.fixativeToTissueRatioConfirmation.confirmedAt).toBeTruthy();
  });

  it('with no real signing user at all, this is a real, honest no-op \u2014 never records an audit entry with no real, attributable user', async () => {
    const params = baseParams({ signingUser: {} });
    const { result } = renderHook(() => useGrossingScreen(params as any));
    await result.current.handleConfirmFixativeRatio('SP-1');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('falls back to the real user id as the display name when no real name is set on the signing user', async () => {
    const params = baseParams({ signingUser: { id: 'USER-2' } });
    const { result } = renderHook(() => useGrossingScreen(params as any));
    await act(async () => { await result.current.handleConfirmFixativeRatio('SP-1'); });
    const call = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const updatedSpecimen = call[1].specimens.find((s: any) => s.id === 'SP-1');
    expect(updatedSpecimen.processing.fixativeToTissueRatioConfirmation.userName).toBe('USER-2');
  });
});

describe('useGrossingScreen \u2014 handleRaiseFixationDeficiency, per direct decision ("should be raised to a CAPA by a human")', () => {
  it('a real call raises a real, open def-missing-fixation-completion deficiency against the real case and specimen, attributed to the real signing user', async () => {
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));

    await act(async () => { await result.current.handleRaiseFixationDeficiency('SP-1'); });

    expect(specimenDeficiencyService.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'CASE-1', specimenId: 'SP-1', specimenLabel: 'A',
        deficiencyTypeId: 'def-missing-fixation-completion', raisedBy: 'USER-1',
      }),
    );
  });

  it('with no real signing user at all, this is a real, honest no-op \u2014 never raises a deficiency with no real, attributable human behind it', async () => {
    const params = baseParams({ signingUser: {} });
    const { result } = renderHook(() => useGrossingScreen(params as any));
    await result.current.handleRaiseFixationDeficiency('SP-1');
    expect(specimenDeficiencyService.raise).not.toHaveBeenCalled();
  });

  it('a real, successful raise marks the specimen as having an open deficiency in the hook\u2019s own real, returned state', async () => {
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));
    expect(result.current.specimensWithOpenFixationDeficiency.has('SP-1')).toBe(false);

    await act(async () => { await result.current.handleRaiseFixationDeficiency('SP-1'); });

    expect(result.current.specimensWithOpenFixationDeficiency.has('SP-1')).toBe(true);
  });

  it('a real, pre-existing open deficiency is reflected in the hook\u2019s own state as soon as the case loads, without waiting for a new raise', async () => {
    vi.mocked(specimenDeficiencyService.getByCaseId).mockResolvedValue({
      ok: true,
      data: [{ id: 'D-1', caseId: 'CASE-1', specimenId: 'SP-1', deficiencyTypeId: 'def-missing-fixation-completion', status: 'open', raisedBy: 'USER-1', raisedAt: '2026-09-01T00:00:00.000Z' }],
    } as any);
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));

    await waitFor(() => expect(result.current.specimensWithOpenFixationDeficiency.has('SP-1')).toBe(true));
  });

  it('a real, already-closed deficiency of this same type is never counted as a real, currently-open one', async () => {
    vi.mocked(specimenDeficiencyService.getByCaseId).mockResolvedValue({
      ok: true,
      data: [{ id: 'D-1', caseId: 'CASE-1', specimenId: 'SP-1', deficiencyTypeId: 'def-missing-fixation-completion', status: 'closed', raisedBy: 'USER-1', raisedAt: '2026-09-01T00:00:00.000Z' }],
    } as any);
    const params = baseParams();
    const { result } = renderHook(() => useGrossingScreen(params as any));

    await waitFor(() => expect(specimenDeficiencyService.getByCaseId).toHaveBeenCalled());
    expect(result.current.specimensWithOpenFixationDeficiency.has('SP-1')).toBe(false);
  });
});
