// src/services/cytology/dispatchCytologyCaseInstances.test.ts
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
  mockCytologyOutboundResultQueueService: { getBySignOutRecordId: vi.fn(), enqueue: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() },
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
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchCytologyCaseInstances } from './dispatchCytologyCaseInstances';

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(caseRouter.getCase).mockResolvedValue({ id: 'CASE-1', patient: { id: 'PT-1' } } as any);
  vi.mocked(mockPatientIndexService.getById).mockReset();
  vi.mocked(mockPatientIndexService.getById).mockResolvedValue({ organisationId: 'ORG-1' } as any);
  vi.mocked(mockCytologySignOutRecordService.getByCaseId).mockReset();
  vi.mocked(mockCytologySignOutRecordService.getByCaseId).mockResolvedValue({ ok: true, data: [{ id: 'REC-1' }] } as any);
  vi.mocked(mockCytologyOutboundResultQueueService.getBySignOutRecordId).mockReset();
  vi.mocked(mockCytologyOutboundResultQueueService.getBySignOutRecordId).mockResolvedValue({ ok: true, data: [] } as any);
  vi.mocked(mockCytologyOutboundResultQueueService.enqueue).mockReset();
  vi.mocked(mockCytologyOutboundResultQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'q-1' } } as any);
  vi.mocked(mockCytologyOutboundResultQueueService.markSent).mockReset();
  vi.mocked(mockCytologyOutboundResultQueueService.markFailed).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true } as any);
});

describe('dispatchCytologyCaseInstances', () => {
  it('a real, unknown case is a real, honest no-op, never throws', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    await expect(dispatchCytologyCaseInstances('CASE-X')).resolves.toBeUndefined();
    expect(mockCytologySignOutRecordService.getByCaseId).not.toHaveBeenCalled();
  });

  it('no real patient record (no organisationId to enqueue against) is a real, honest, non-blocking skip', async () => {
    vi.mocked(mockPatientIndexService.getById).mockResolvedValue(null);
    await dispatchCytologyCaseInstances('CASE-1');
    expect(mockCytologyOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('dispatches a real ORU_R01 message for a real sign-out record and marks it sent on real success', async () => {
    await dispatchCytologyCaseInstances('CASE-1');
    expect(mockCytologyOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'CASE-1', signOutRecordId: 'REC-1', resultState: 'FINAL' }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith('q-1', 'ORU_R01', expect.objectContaining({ messageId: 'msg-1' }));
    expect(mockCytologyOutboundResultQueueService.markSent).toHaveBeenCalledWith('q-1');
  });

  it('a real dispatch failure marks the real queue entry failed, never throws', async () => {
    vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'unreachable' } as any);
    await dispatchCytologyCaseInstances('CASE-1');
    expect(mockCytologyOutboundResultQueueService.markFailed).toHaveBeenCalledWith('q-1', expect.objectContaining({ errorMessage: 'unreachable' }));
  });

  it('dispatches one real message per real sign-out record on a multi-specimen case', async () => {
    vi.mocked(mockCytologySignOutRecordService.getByCaseId).mockResolvedValue({ ok: true, data: [{ id: 'REC-1' }, { id: 'REC-2' }] } as any);
    await dispatchCytologyCaseInstances('CASE-1');
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(2);
  });

  it('a real, already-dispatched FINAL record for this same sign-out record is not re-enqueued \u2014 real, idempotent dedup', async () => {
    vi.mocked(mockCytologyOutboundResultQueueService.getBySignOutRecordId).mockResolvedValue({ ok: true, data: [{ resultState: 'FINAL' }] } as any);
    await dispatchCytologyCaseInstances('CASE-1');
    expect(mockCytologyOutboundResultQueueService.enqueue).not.toHaveBeenCalled();
  });
});
