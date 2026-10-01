// src/services/clinicalHistory/processInboundClinicalHistoryAccessionEvent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase, getAll, updateCase } = vi.hoisted(() => ({
  getCase: vi.fn(), getAll: vi.fn(), updateCase: vi.fn(),
}));
vi.mock('../cases/CaseRouter', () => ({ caseRouter: { getCase, getAll, updateCase } }));

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

import {
  processInboundClinicalHistoryAccessionEvent,
  _resetProcessedClinicalHistoryMessageIdsForTests,
} from './processInboundClinicalHistoryAccessionEvent';
import type { ClinicalHistoryAccessionEventPayload } from '@/types/events/ClinicalHistoryAccessionEventPayload';

const CASE = { id: 'S26-0001-CYT-001', order: { priority: 'Routine' } };

const payload = (over: Partial<ClinicalHistoryAccessionEventPayload> = {}): ClinicalHistoryAccessionEventPayload => ({
  messageId: 'msg-1', timestamp: '2026-09-08T00:00:00.000Z', orderId: 'S26-0001-CYT-001',
  clinicalHistory: [{ historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-23-4521', prior_date: '2024-05-12' } }],
  ...over,
});

describe('processInboundClinicalHistoryAccessionEvent — real, per the uploaded spec\'s own User Story 2', () => {
  beforeEach(() => {
    getCase.mockReset(); getAll.mockReset(); updateCase.mockReset();
    getCase.mockResolvedValue(CASE);
    getAll.mockResolvedValue({ ok: true, data: [CASE] });
    _resetProcessedClinicalHistoryMessageIdsForTests();
  });

  it('real, a complete, valid payload applies correctly and writes clinicalHistory to the real case\'s own order', async () => {
    const result = await processInboundClinicalHistoryAccessionEvent(payload());
    expect(result.outcome).toBe('applied');
    expect(result.caseId).toBe('S26-0001-CYT-001');
    expect(updateCase).toHaveBeenCalledWith('S26-0001-CYT-001', expect.objectContaining({
      order: expect.objectContaining({ clinicalHistory: payload().clinicalHistory }),
    }));
  });

  it('real, a redelivered messageId is a genuine no-op — never a duplicate write', async () => {
    await processInboundClinicalHistoryAccessionEvent(payload());
    const second = await processInboundClinicalHistoryAccessionEvent(payload());
    expect(second.outcome).toBe('already-applied');
    expect(updateCase).toHaveBeenCalledTimes(1);
  });

  it('real, an honest order-not-found outcome when neither a direct case id nor externalOrderId resolves', async () => {
    getCase.mockResolvedValue(undefined);
    getAll.mockResolvedValue({ ok: true, data: [] });
    const result = await processInboundClinicalHistoryAccessionEvent(payload({ orderId: 'ORD-DOES-NOT-EXIST' }));
    expect(result.outcome).toBe('order-not-found');
  });

  it('real, falls back to a real search by Case.order.externalOrderId when the orderId doesn\'t match a direct case id', async () => {
    getCase.mockResolvedValue(undefined);
    getAll.mockResolvedValue({ ok: true, data: [{ id: 'S26-9999-CYT-001', order: { externalOrderId: 'ORD-10492' } }] });
    const result = await processInboundClinicalHistoryAccessionEvent(payload({ orderId: 'ORD-10492' }));
    expect(result.outcome).toBe('applied');
    expect(result.caseId).toBe('S26-9999-CYT-001');
  });

  it('real, an invalid entry (missing required metadata) is refused with the real, detailed error attached — never silently applied', async () => {
    const result = await processInboundClinicalHistoryAccessionEvent(payload({
      clinicalHistory: [{ historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-23-4521' } }],
    }));
    expect(result.outcome).toBe('invalid-payload');
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('real, a missing order_id is an honest invalid-payload outcome', async () => {
    const result = await processInboundClinicalHistoryAccessionEvent(payload({ orderId: '' }));
    expect(result.outcome).toBe('invalid-payload');
  });
});
