// src/services/billing/searchBillingAuditLog.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: tests the 6 new Billing Logs filter
// dimensions (Date of Service, Report Sign-out Date, Signing
// Pathologist, Client/Ordering Facility, Billing Type, Status) added
// to close the Billing Logs filtering gaps identified in the Billing
// Capacity Review. Uses controlled, synthetic mocks throughout rather
// than depending on the exact shape of production seed data, which
// could change over time.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchBillingAuditLog } from './searchBillingAuditLog';
import type { PathologyCase } from '@/services/cases/ICaseService';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

const makeCase = (overrides: Partial<PathologyCase> = {}): PathologyCase => ({
  id: 'CASE-1',
  accession: { fullAccession: 'S26-0001' } as any,
  patient: { firstName: 'Grace', lastName: 'Thompson', mrn: '100001', id: 'PAT-1' } as any,
  specimens: [{ id: 'SP-1', receivedAt: '2026-06-01T00:00:00.000Z' } as any],
  order: { clientId: 'CLIENT-1', clientName: 'Metro General Hospital' } as any,
  finalizedBy: 'Dr. Owusu',
  finalizedAt: '2026-06-05T00:00:00.000Z',
  releasedAt: '2026-06-06T00:00:00.000Z',
  ...overrides,
} as PathologyCase);

const makeCharge = (overrides: Partial<ServiceChargeRecord> = {}): ServiceChargeRecord => ({
  id: 'CHG-1',
  caseId: 'CASE-1',
  specimenId: 'SP-1',
  billingCode: '88305',
  cptCode: '88305',
  transactionType: 'charge',
  resolvedAt: '2026-06-05T12:00:00.000Z',
  resolvedBy: 'tech-1',
  billingType: 'Global',
  ruleVersion: 1,
  ...overrides,
} as ServiceChargeRecord);

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { getAll: vi.fn() },
}));
vi.mock('./mockServiceChargeService', async () => {
  const actual = await vi.importActual<any>('./mockServiceChargeService');
  return { ...actual, mockServiceChargeService: { getChargesForCase: vi.fn() } };
});
vi.mock('./mockBillingDeficiencyService', () => ({ mockBillingDeficiencyService: { getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) } }));
vi.mock('./mockCodeReviewPoolService', () => ({ mockCodeReviewPoolService: { getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) } }));
vi.mock('./mockOutboundChargeQueueService', () => ({ mockOutboundChargeQueueService: { getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) } }));
vi.mock('@/services', () => ({
  amendmentService: { getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  auditService: { getAuditLogs: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));

import { caseRouter } from '@/services/cases/CaseRouter';
import { mockServiceChargeService } from './mockServiceChargeService';

describe('searchBillingAuditLog — new filter dimensions', () => {
  beforeEach(() => {
    vi.mocked(caseRouter.getAll).mockResolvedValue({ ok: true, data: [makeCase()] });
    vi.mocked(mockServiceChargeService.getChargesForCase).mockResolvedValue({ ok: true, data: [makeCharge()] });
  });

  it('resolves dateOfService from the real specimen receivedAt, not the event timestamp', async () => {
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].dateOfService).toBe('2026-06-01T00:00:00.000Z');
    expect(res.data.entries[0].timestamp).toBe('2026-06-05T12:00:00.000Z');
  });

  it('resolves signOutDate from Case.releasedAt, falling back to finalizedAt', async () => {
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].signOutDate).toBe('2026-06-06T00:00:00.000Z');
  });

  it('falls back to finalizedAt when releasedAt is not set', async () => {
    vi.mocked(caseRouter.getAll).mockResolvedValue({ ok: true, data: [makeCase({ releasedAt: undefined })] });
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].signOutDate).toBe('2026-06-05T00:00:00.000Z');
  });

  it('resolves signingPathologist from Case.finalizedBy, distinct from staff', async () => {
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].signingPathologist).toBe('Dr. Owusu');
    expect(res.data.entries[0].staff).toBe('tech-1');
  });

  it('resolves clientId/clientName from Case.order', async () => {
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].clientId).toBe('CLIENT-1');
    expect(res.data.entries[0].clientName).toBe('Metro General Hospital');
  });

  it('resolves billingType and approvalStatus for a charge event', async () => {
    vi.mocked(mockServiceChargeService.getChargesForCase).mockResolvedValue({ ok: true, data: [makeCharge({ billingType: 'TC', approvalStatus: 'APPROVED' })] });
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].billingType).toBe('TC');
    expect(res.data.entries[0].approvalStatus).toBe('APPROVED');
  });

  it('a charge with no real approvalStatus set correctly reads as EXPORTED (getEffectiveChargeStatus), never blank', async () => {
    vi.mocked(mockServiceChargeService.getChargesForCase).mockResolvedValue({ ok: true, data: [makeCharge({ approvalStatus: undefined })] });
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries[0].approvalStatus).toBe('EXPORTED');
  });

  it('dateOfServiceFrom/To genuinely filters by DOS, not the event timestamp', async () => {
    const before = await searchBillingAuditLog({ dateOfServiceFrom: '2026-06-02' });
    if (!before.ok) throw new Error('search failed');
    expect(before.data.entries).toHaveLength(0); // DOS (6/1) is before the filter's From (6/2)

    const after = await searchBillingAuditLog({ dateOfServiceFrom: '2026-05-01' });
    if (!after.ok) throw new Error('search failed');
    expect(after.data.entries).toHaveLength(1);
  });

  it('signOutDateFrom/To genuinely filters by the case sign-out date', async () => {
    const res = await searchBillingAuditLog({ signOutDateFrom: '2026-06-07' });
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries).toHaveLength(0); // sign-out (6/6) is before the filter's From (6/7)
  });

  it('signingPathologist filter genuinely narrows by the real signing pathologist, OR semantics across multiple selections', async () => {
    const match = await searchBillingAuditLog({ signingPathologist: ['Dr. Owusu'] });
    if (!match.ok) throw new Error('search failed');
    expect(match.data.entries).toHaveLength(1);

    const noMatch = await searchBillingAuditLog({ signingPathologist: ['Dr. Faulkner'] });
    if (!noMatch.ok) throw new Error('search failed');
    expect(noMatch.data.entries).toHaveLength(0);

    const orMatch = await searchBillingAuditLog({ signingPathologist: ['Dr. Faulkner', 'Dr. Owusu'] });
    if (!orMatch.ok) throw new Error('search failed');
    expect(orMatch.data.entries).toHaveLength(1);
  });

  it('clientIds filter genuinely narrows by the real ordering facility', async () => {
    const match = await searchBillingAuditLog({ clientIds: ['CLIENT-1'] });
    if (!match.ok) throw new Error('search failed');
    expect(match.data.entries).toHaveLength(1);

    const noMatch = await searchBillingAuditLog({ clientIds: ['CLIENT-2'] });
    if (!noMatch.ok) throw new Error('search failed');
    expect(noMatch.data.entries).toHaveLength(0);
  });

  it('billingType filter genuinely narrows by the real component', async () => {
    const res = await searchBillingAuditLog({ billingType: '26' });
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries).toHaveLength(0); // seeded charge is Global, not 26
  });

  it('approvalStatus filter genuinely narrows by the real, effective status', async () => {
    const res = await searchBillingAuditLog({ approvalStatus: 'PENDING_APPROVAL' });
    if (!res.ok) throw new Error('search failed');
    expect(res.data.entries).toHaveLength(0); // seeded charge has no approvalStatus, so effectively EXPORTED
  });

  it('patientNameRange genuinely filters alphabetically by last name', async () => {
    // Thompson falls within S-Z
    const inRange = await searchBillingAuditLog({ patientNameRangeFrom: 'S', patientNameRangeTo: 'Z' });
    if (!inRange.ok) throw new Error('search failed');
    expect(inRange.data.entries).toHaveLength(1);

    // Thompson falls outside A-D
    const outOfRange = await searchBillingAuditLog({ patientNameRangeFrom: 'A', patientNameRangeTo: 'D' });
    if (!outOfRange.ok) throw new Error('search failed');
    expect(outOfRange.data.entries).toHaveLength(0);
  });

  it('a non-charge event kind never has dateOfService/billingType/approvalStatus fabricated', async () => {
    vi.mocked(mockServiceChargeService.getChargesForCase).mockResolvedValue({ ok: true, data: [] });
    const { mockBillingDeficiencyService } = await import('./mockBillingDeficiencyService');
    vi.mocked(mockBillingDeficiencyService.getByCaseId).mockResolvedValue({
      ok: true,
      data: [{ id: 'DEF-1', caseId: 'CASE-1', deficiencyType: 'UNSUPPORTED_CPT_LEVEL', severity: 'COMPLIANCE_WARNING', createdAt: '2026-06-05T00:00:00.000Z', createdBy: 'auditor-1', raisedByTrigger: 'sign_out', status: 'OPEN' } as any],
    });
    const res = await searchBillingAuditLog({});
    if (!res.ok) throw new Error('search failed');
    const deficiencyEvent = res.data.entries.find(e => e.kind === 'deficiency');
    expect(deficiencyEvent?.dateOfService).toBeUndefined();
    expect(deficiencyEvent?.billingType).toBeUndefined();
    expect(deficiencyEvent?.approvalStatus).toBeUndefined();
    // But the real, case-level fields are still stamped, same as caseNumber/patientName.
    expect(deficiencyEvent?.signOutDate).toBe('2026-06-06T00:00:00.000Z');
    expect(deficiencyEvent?.clientName).toBe('Metro General Hospital');
  });
});
