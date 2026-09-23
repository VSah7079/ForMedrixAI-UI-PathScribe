// src/services/clinical/dispatchCriticalAlerts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetById = vi.fn();
vi.mock('@/services/physicians/mockPhysicianService', () => ({
  mockPhysicianService: { getById: (...args: any[]) => mockGetById(...args) },
}));

import { dispatchCriticalAlerts } from './dispatchCriticalAlerts';
import { mockCriticalAlertDispatchService } from './mockCriticalAlertDispatchService';

function physician(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    data: {
      id: 'phys-1', givenNames: 'Amanda', familyNames: 'Chen',
      email: 'achen@clinic.org', smsCapablePhone: '', sourceSystem: undefined,
      preferredContact: 'Email',
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockGetById.mockReset();
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('dispatchCriticalAlerts — real orchestration', () => {
  it('resolves to null, honestly, when the case has no ordering physician on file', async () => {
    const result = await dispatchCriticalAlerts({
      caseId: 'case-1', orderingPhysicianId: undefined,
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('resolves to null, honestly, when the referenced physician cannot be found', async () => {
    mockGetById.mockResolvedValue({ ok: false, error: 'not found' });
    const result = await dispatchCriticalAlerts({
      caseId: 'case-1', orderingPhysicianId: 'phys-ghost',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, data: null });
  });

  it('dispatches on every real available channel for a Critical finding and persists a real audit record', async () => {
    mockGetById.mockResolvedValue(physician({ smsCapablePhone: '555-0102', sourceSystem: 'EPIC-MAIN' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-2', orderingPhysicianId: 'phys-1',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'invasive carcinoma identified', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    const record = (result as any).data;
    expect(record.physicianId).toBe('phys-1');
    expect(record.physicianName).toBe('Amanda Chen');
    expect(record.channels.map((c: any) => c.channel).sort()).toEqual(['ehr_push', 'secure_email', 'sms']);
    expect(record.channels.every((c: any) => c.dispatched && c.method === 'stub')).toBe(true);

    const persisted = await mockCriticalAlertDispatchService.getByCaseId('case-2');
    expect(persisted.ok && persisted.data).toHaveLength(1);
  });

  it('dispatches on only the physician\'s preferred channel for an Abnormal finding', async () => {
    mockGetById.mockResolvedValue(physician({ smsCapablePhone: '555-0102', sourceSystem: 'EPIC-MAIN', preferredContact: 'Email' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-3', orderingPhysicianId: 'phys-1',
      findingTerm: 'atypical cells', findingSeverity: 'Abnormal',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    const record = (result as any).data;
    expect(record.channels.map((c: any) => c.channel)).toEqual(['secure_email']);
  });

  it('persists a real, honest record with an empty channels array when the physician has no usable contact data', async () => {
    mockGetById.mockResolvedValue(physician({ email: '', preferredContact: 'Phone' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-4', orderingPhysicianId: 'phys-1',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    const record = (result as any).data;
    expect(record.channels).toEqual([]);
  });
});
