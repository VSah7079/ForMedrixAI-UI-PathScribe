// src/services/reports/dispatchAmendedCaseInstance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../patients/mockPatientIndexService', () => ({
  mockPatientIndexService: { getById: vi.fn() },
}));
vi.mock('./buildOruR01Payload', () => ({
  buildOruR01Payload: vi.fn(),
}));
vi.mock('./mockOutboundResultQueueService', () => ({
  mockOutboundResultQueueService: { enqueue: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() },
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { buildOruR01Payload } from './buildOruR01Payload';
import { mockOutboundResultQueueService } from './mockOutboundResultQueueService';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchAmendedCaseInstance } from './dispatchAmendedCaseInstance';

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(caseRouter.getCase).mockResolvedValue({ id: 'CASE-1', patient: { id: 'PT-1' } } as any);
  vi.mocked(mockPatientIndexService.getById).mockReset();
  vi.mocked(mockPatientIndexService.getById).mockResolvedValue({ organisationId: 'ORG-1' } as any);
  vi.mocked(buildOruR01Payload).mockReset();
  vi.mocked(buildOruR01Payload).mockResolvedValue({ messageId: 'msg-1' } as any);
  vi.mocked(mockOutboundResultQueueService.enqueue).mockReset();
  vi.mocked(mockOutboundResultQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'q-1' } } as any);
  vi.mocked(mockOutboundResultQueueService.markSent).mockReset();
  vi.mocked(mockOutboundResultQueueService.markFailed).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true } as any);
});

describe('dispatchAmendedCaseInstance', () => {
  it('a real, unknown case is a real, honest no-op, never throws', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    await expect(dispatchAmendedCaseInstance('CASE-X', 'INST-1', 'CORRECTED')).resolves.toBeUndefined();
    expect(buildOruR01Payload).not.toHaveBeenCalled();
  });

  it('no real patient record is a real, honest, non-blocking skip', async () => {
    vi.mocked(mockPatientIndexService.getById).mockResolvedValue(null);
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    expect(mockOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('dispatches a real CORRECTED message for the specific real instance and marks it sent on real success', async () => {
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    expect(buildOruR01Payload).toHaveBeenCalledWith('CASE-1', 'INST-1', 'CORRECTED', undefined, undefined, undefined);
    expect(mockOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'INST-1', resultState: 'CORRECTED' }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith('q-1', 'ORU_R01', expect.objectContaining({ messageId: 'msg-1' }));
    expect(mockOutboundResultQueueService.markSent).toHaveBeenCalledWith('q-1');
  });

  it('dispatches a real ADDENDUM message with the correct resultState', async () => {
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'ADDENDUM');
    expect(buildOruR01Payload).toHaveBeenCalledWith('CASE-1', 'INST-1', 'ADDENDUM', undefined, undefined, undefined);
    expect(mockOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ resultState: 'ADDENDUM' }));
  });

  it('a real, verbatim previouslyReportedAs value is forwarded through, untouched, to buildOruR01Payload', async () => {
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED', 'Benign fibroadenoma.');
    expect(buildOruR01Payload).toHaveBeenCalledWith('CASE-1', 'INST-1', 'CORRECTED', undefined, undefined, 'Benign fibroadenoma.');
  });

  it('a real dispatch failure marks the real queue entry failed, never throws', async () => {
    vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'unreachable', errorCode: 'TIMEOUT' } as any);
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    expect(mockOutboundResultQueueService.markFailed).toHaveBeenCalledWith('q-1', expect.objectContaining({ errorCode: 'TIMEOUT', errorMessage: 'unreachable' }));
  });

  it('a real, genuinely nonexistent instance (buildOruR01Payload returns null) is skipped honestly, never enqueued with a fabricated payload', async () => {
    vi.mocked(buildOruR01Payload).mockResolvedValue(null);
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    expect(mockOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('never dedups \u2014 two real, separate corrections to the same instance both dispatch, unlike FINAL\u2019s own strict one-time dispatch', async () => {
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    await dispatchAmendedCaseInstance('CASE-1', 'INST-1', 'CORRECTED');
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(2);
  });
});
