// src/services/cytology/resolveCytologyRegistryTransmissionAuditReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyRegistryTransmissionAuditReport } from './resolveCytologyRegistryTransmissionAuditReport';
import type { CytologyRegistryOutboundQueueEntry } from '@/types/case/CytologyRegistryOutboundQueueEntry';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

const entry = (overrides: Partial<CytologyRegistryOutboundQueueEntry>): CytologyRegistryOutboundQueueEntry => ({
  id: 'q1', caseId: 'C1', signOutRecordId: 'so1', registryId: 'ncsr_australia',
  status: 'SENT', queuedAt: '2026-09-01T00:00:00.000Z', retryCount: 0, maxRetriesExceeded: false,
  ...overrides,
});

const signOut = (overrides: Partial<CytologySignOutRecord['reportContent']>): CytologySignOutRecord => ({
  id: 'so1', caseId: 'C1', specimenId: 'SP1', reviewRecordId: 'r1',
  signedBy: { userId: 'u1', userName: 'Dr. Test', isPathologist: true }, signedAt: '2026-09-01T00:00:00.000Z',
  reportContent: {
    patientName: 'Test Patient', accessionNumber: 'S26-1001', specimenAdequacy: [], additionalInterpretations: [],
    recommendations: [], primaryInterpretation: 'Negative (NILM)', requiresPathologistReview: false,
    ...overrides,
  } as CytologySignOutRecord['reportContent'],
});

describe('resolveCytologyRegistryTransmissionAuditReport — real, per direct guidance\'s ANZ-QA-01 specification', () => {
  it('filters to only the real, requested registry — other registries\' own dispatches never leak in', () => {
    const rows = resolveCytologyRegistryTransmissionAuditReport(
      [entry({ registryId: 'ncsr_australia' }), entry({ id: 'q2', registryId: 'csms_uk' })],
      { C1: [signOut({})] },
      'ncsr_australia',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].caseId).toBe('C1');
  });

  it('a real, successfully sent dispatch carries the real accession number, HPV result, and cytology result from its own sign-out record', () => {
    const rows = resolveCytologyRegistryTransmissionAuditReport(
      [entry({})],
      { C1: [signOut({ hpvResult: 'Positive', primaryInterpretation: 'ASC-US' })] },
      'ncsr_australia',
    );
    expect(rows[0].accessionNumber).toBe('S26-1001');
    expect(rows[0].hpvResultCode).toBe('Positive');
    expect(rows[0].cytologyResultCode).toBe('ASC-US');
    expect(rows[0].transmissionStatus).toBe('SENT');
  });

  it('a real, failed dispatch carries its own real error reason code', () => {
    const rows = resolveCytologyRegistryTransmissionAuditReport(
      [entry({ status: 'FAILED', errorCode: 'DISPATCH_TIMEOUT', lastAttemptAt: '2026-09-02T00:00:00.000Z' })],
      { C1: [signOut({})] },
      'ncsr_australia',
    );
    expect(rows[0].transmissionStatus).toBe('FAILED');
    expect(rows[0].errorReasonCode).toBe('DISPATCH_TIMEOUT');
    expect(rows[0].transmissionTimestamp).toBe('2026-09-02T00:00:00.000Z');
  });

  it('never fabricates a national ID — a real, honest MRN fallback only, per this module\'s own established gap posture', () => {
    const rows = resolveCytologyRegistryTransmissionAuditReport(
      [entry({})],
      { C1: [signOut({ patientMrn: '600601' })] },
      'ncsr_australia',
    );
    expect(rows[0].patientMrn).toBe('600601');
  });

  it('a real dispatch whose own sign-out record cannot be found (a genuine data-integrity edge case) still produces a real row, never crashes — falling back to the real caseId', () => {
    const rows = resolveCytologyRegistryTransmissionAuditReport([entry({})], {}, 'ncsr_australia');
    expect(rows).toHaveLength(1);
    expect(rows[0].accessionNumber).toBe('C1');
    expect(rows[0].cytologyResultCode).toBe('—');
  });
});
