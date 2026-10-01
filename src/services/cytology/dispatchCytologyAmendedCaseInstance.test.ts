// src/services/cytology/dispatchCytologyAmendedCaseInstance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../patients/mockPatientIndexService', () => ({
  mockPatientIndexService: { getById: vi.fn() },
}));
vi.mock('./mockCytologySignOutRecordService', () => ({
  mockCytologySignOutRecordService: { getByCaseId: vi.fn() },
}));
vi.mock('./mockCytologyOutboundResultQueueService', () => ({
  mockCytologyOutboundResultQueueService: { enqueue: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() },
}));
vi.mock('./buildCytologyOruR01Payload', () => ({
  buildCytologyOruR01Payload: vi.fn().mockReturnValue({ messageId: 'msg-1' }),
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { mockCytologyOutboundResultQueueService } from './mockCytologyOutboundResultQueueService';
import { buildCytologyOruR01Payload } from './buildCytologyOruR01Payload';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchCytologyAmendedCaseInstance } from './dispatchCytologyAmendedCaseInstance';

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(caseRouter.getCase).mockResolvedValue({ id: 'CASE-1', patient: { id: 'PT-1' } } as any);
  vi.mocked(mockPatientIndexService.getById).mockReset();
  vi.mocked(mockPatientIndexService.getById).mockResolvedValue({ organisationId: 'ORG-1' } as any);
  vi.mocked(mockCytologySignOutRecordService.getByCaseId).mockReset();
  vi.mocked(mockCytologySignOutRecordService.getByCaseId).mockResolvedValue({ ok: true, data: [{ id: 'REC-1' }, { id: 'REC-2' }] } as any);
  vi.mocked(mockCytologyOutboundResultQueueService.enqueue).mockReset();
  vi.mocked(mockCytologyOutboundResultQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'q-1' } } as any);
  vi.mocked(mockCytologyOutboundResultQueueService.markSent).mockReset();
  vi.mocked(mockCytologyOutboundResultQueueService.markFailed).mockReset();
  vi.mocked(buildCytologyOruR01Payload).mockClear();
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true } as any);
});

describe('dispatchCytologyAmendedCaseInstance', () => {
  it('a real, unknown case is a real, honest no-op, never throws', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    await expect(dispatchCytologyAmendedCaseInstance('CASE-X', 'REC-1', 'CORRECTED')).resolves.toBeUndefined();
    expect(buildCytologyOruR01Payload).not.toHaveBeenCalled();
  });

  it('no real patient record is a real, honest, non-blocking skip', async () => {
    vi.mocked(mockPatientIndexService.getById).mockResolvedValue(null);
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'CORRECTED');
    expect(mockCytologyOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('a real, genuinely nonexistent signOutRecordId is a real, honest no-op \u2014 never dispatches the wrong record', async () => {
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-DOES-NOT-EXIST', 'CORRECTED');
    expect(buildCytologyOruR01Payload).not.toHaveBeenCalled();
    expect(mockCytologyOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('dispatches the real, specific record named \u2014 never the wrong one, even when multiple records exist for the case', async () => {
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-2', 'CORRECTED');
    expect(buildCytologyOruR01Payload).toHaveBeenCalledWith({ id: 'REC-2' }, 'CORRECTED', undefined);
    expect(mockCytologyOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ signOutRecordId: 'REC-2', resultState: 'CORRECTED' }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith('q-1', 'ORU_R01', expect.objectContaining({ messageId: 'msg-1' }));
    expect(mockCytologyOutboundResultQueueService.markSent).toHaveBeenCalledWith('q-1');
  });

  it('a real, verbatim previouslyReportedAs value is forwarded through, untouched, to the real payload builder', async () => {
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'CORRECTED', 'NILM.');
    expect(buildCytologyOruR01Payload).toHaveBeenCalledWith({ id: 'REC-1' }, 'CORRECTED', 'NILM.');
  });

  it('a real ADDENDUM dispatch, per direct correction ("Cytology cases can have addendums") \u2014 resultState forwarded correctly, never hardcoded to CORRECTED', async () => {
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'ADDENDUM');
    expect(buildCytologyOruR01Payload).toHaveBeenCalledWith({ id: 'REC-1' }, 'ADDENDUM', undefined);
    expect(mockCytologyOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ resultState: 'ADDENDUM' }));
  });

  it('a real dispatch failure marks the real queue entry failed, never throws', async () => {
    vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'unreachable', errorCode: 'TIMEOUT' } as any);
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'CORRECTED');
    expect(mockCytologyOutboundResultQueueService.markFailed).toHaveBeenCalledWith('q-1', expect.objectContaining({ errorCode: 'TIMEOUT', errorMessage: 'unreachable' }));
  });

  it('never dedups \u2014 dispatching the same record twice sends twice, per direct guidance that a case can be corrected/added to more than once', async () => {
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'CORRECTED');
    await dispatchCytologyAmendedCaseInstance('CASE-1', 'REC-1', 'CORRECTED');
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(2);
  });
});
