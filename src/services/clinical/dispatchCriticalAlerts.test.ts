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
      caseId: 'case-1', accessionNumber: 'S26-1001', orderingPhysicianId: undefined,
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('resolves to null, honestly, when the referenced physician cannot be found', async () => {
    mockGetById.mockResolvedValue({ ok: false, error: 'not found' });
    const result = await dispatchCriticalAlerts({
      caseId: 'case-1', accessionNumber: 'S26-1001', orderingPhysicianId: 'phys-ghost',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, data: null });
  });

  it('dispatches on every real available channel for a Critical finding and persists a real audit record', async () => {
    mockGetById.mockResolvedValue(physician({ smsCapablePhone: '555-0102', sourceSystem: 'EPIC-MAIN' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-2', accessionNumber: 'S26-2002', orderingPhysicianId: 'phys-1',
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
    // Real, per direct guidance's own engineering brief: the dispatch
    // record's own id must be the SAME id the reference token linked
    // back to at issuance time, not a second, unrelated generated id.
    expect(persisted.ok && persisted.data[0].id).toBe(record.id);
  });

  it('dispatches on only the physician\'s preferred channel for an Abnormal finding', async () => {
    mockGetById.mockResolvedValue(physician({ smsCapablePhone: '555-0102', sourceSystem: 'EPIC-MAIN', preferredContact: 'Email' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-3', accessionNumber: 'S26-3003', orderingPhysicianId: 'phys-1',
      findingTerm: 'atypical cells', findingSeverity: 'Abnormal',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    const record = (result as any).data;
    expect(record.channels.map((c: any) => c.channel)).toEqual(['secure_email']);
  });

  it('persists a real, honest record with an empty channels array when the physician has no usable contact data', async () => {
    mockGetById.mockResolvedValue(physician({ email: '', preferredContact: 'Phone' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-4', accessionNumber: 'S26-4004', orderingPhysicianId: 'phys-1',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'x', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    const record = (result as any).data;
    expect(record.channels).toEqual([]);
  });

  it('issues a real, shared reference token and threads its url into sms/secure_email only, never ehr_push, and never leaks findingTerm into either body', async () => {
    mockGetById.mockResolvedValue(physician({ smsCapablePhone: '555-0102', sourceSystem: 'EPIC-MAIN' }));
    const result = await dispatchCriticalAlerts({
      caseId: 'case-5', accessionNumber: 'S26-5005', orderingPhysicianId: 'phys-1',
      findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
      sourceQuote: 'invasive carcinoma identified', confirmedAt: '2026-09-19T00:00:00.000Z',
    });
    const record = (result as any).data;
    const sms = record.channels.find((c: any) => c.channel === 'sms');
    const email = record.channels.find((c: any) => c.channel === 'secure_email');
    const ehr = record.channels.find((c: any) => c.channel === 'ehr_push');

    expect(sms.detail).toContain('/critical-alert/');
    expect(email.detail).toContain('/critical-alert/');
    expect(sms.detail).not.toContain('invasive carcinoma');
    expect(email.detail).not.toContain('invasive carcinoma');
    // ehr_push is the one channel still allowed real clinical detail —
    // it never gets (or needs) a reference link.
    expect(ehr.detail).not.toContain('/critical-alert/');
    expect(ehr.detail).toContain('invasive carcinoma');
  });
});
