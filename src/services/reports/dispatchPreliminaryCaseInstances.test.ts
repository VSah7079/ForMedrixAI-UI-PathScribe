// src/services/reports/dispatchPreliminaryCaseInstances.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('./buildOruR01Payload', () => ({
  buildOruR01Payload: vi.fn(),
}));
vi.mock('./mockOutboundResultQueueService', () => ({
  mockOutboundResultQueueService: { enqueue: vi.fn() },
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

import { caseRouter } from '../cases/CaseRouter';
import { buildOruR01Payload } from './buildOruR01Payload';
import { mockOutboundResultQueueService } from './mockOutboundResultQueueService';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchPreliminaryCaseInstances } from './dispatchPreliminaryCaseInstances';

function makeCase(overrides: any = {}) {
  return {
    id: 'CASE-1',
    patient: { organisationId: 'ORG-1' },
    synopticReports: [{ instanceId: 'INST-1', specimenId: 'SPEC-1', templateId: 'tpl-1', templateName: 'A', status: 'in-progress', answers: {} }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(buildOruR01Payload).mockReset();
  vi.mocked(buildOruR01Payload).mockResolvedValue({ messageId: 'msg-1' } as any);
  vi.mocked(mockOutboundResultQueueService.enqueue).mockReset();
  vi.mocked(mockOutboundResultQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'q-1' } } as any);
  vi.mocked(dispatchInterfaceMessage).mockClear();
});

describe('dispatchPreliminaryCaseInstances', () => {
  it('a real, unknown case returns a real, honest 0, never throws', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    const count = await dispatchPreliminaryCaseInstances('CASE-X');
    expect(count).toBe(0);
  });

  it('dispatches exactly one real PRELIMINARY message for one real instance', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    const count = await dispatchPreliminaryCaseInstances('CASE-1');
    expect(count).toBe(1);
    expect(buildOruR01Payload).toHaveBeenCalledWith('CASE-1', 'INST-1', 'PRELIMINARY');
    expect(mockOutboundResultQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ resultState: 'PRELIMINARY' }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(1);
  });

  it('dispatches one real message per real instance on a multi-specimen case', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({
      synopticReports: [
        { instanceId: 'INST-1', specimenId: 'SPEC-1', templateId: 'tpl-1', templateName: 'A', status: 'in-progress', answers: {} },
        { instanceId: 'INST-2', specimenId: 'SPEC-2', templateId: 'tpl-1', templateName: 'B', status: 'in-progress', answers: {} },
      ],
    }) as any);
    const count = await dispatchPreliminaryCaseInstances('CASE-1');
    expect(count).toBe(2);
  });

  it('never dedups — calling it twice for the same case dispatches twice, unlike FINAL', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    await dispatchPreliminaryCaseInstances('CASE-1');
    await dispatchPreliminaryCaseInstances('CASE-1');
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(2);
  });

  it('a real instance whose payload genuinely fails to build is skipped, not counted, never throws for the whole case', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    vi.mocked(buildOruR01Payload).mockResolvedValue(null);
    const count = await dispatchPreliminaryCaseInstances('CASE-1');
    expect(count).toBe(0);
    expect(dispatchInterfaceMessage).not.toHaveBeenCalled();
  });
});
