// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPatientIndexService } from './mockPatientIndexService';
import { mockOutboundPatientAdtQueueService } from './mockOutboundPatientAdtQueueService';
import { buildAdt08Payload, buildAdt40Payload, buildAdt47Payload } from './buildPatientAdtPayload';

const ORG_A = 'ORG-A';

function candidate(overrides: Partial<{ mrn: string; firstName: string; lastName: string; dateOfBirth: string }> = {}) {
  return {
    organisationId: ORG_A,
    mrn: overrides.mrn ?? '900001',
    assigningAuthority: 'TEST-EMR',
    firstName: overrides.firstName ?? 'Jane',
    lastName: overrides.lastName ?? 'TestPatient',
    dateOfBirth: overrides.dateOfBirth ?? '1985-04-12',
    sourceAccession: 'S26-ADT-TEST',
  };
}

describe('mockOutboundPatientAdtQueueService — real, per direct guidance ("we trigger the json packages and the interface engine generates the formatted messages")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('real, per Pathology HL7 Outbound Feature Spec §4: mergeIntoExistingPatient enqueues a real A40_MERGE_PATIENT entry', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-A40-1' }));
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-A40-1', dateOfBirth: '1990-01-01' }));
    if (first.outcome !== 'created' || ambiguous.outcome !== 'ambiguous') throw new Error('setup failed');

    await mockPatientIndexService.mergeIntoExistingPatient(ambiguous.patientId, first.patientId);

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(ambiguous.patientId);
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;
    const a40Entries = queueRes.data.filter(e => e.eventType === 'A40_MERGE_PATIENT');
    expect(a40Entries).toHaveLength(1);
    expect(a40Entries[0].sourcePatientId).toBe(ambiguous.patientId);
    expect(a40Entries[0].targetPatientId).toBe(first.patientId);
    expect(a40Entries[0].status).toBe('QUEUED');
    expect(a40Entries[0].sourceOperation).toBe('mergeIntoExistingPatient');
  });

  it('real, load-bearing fix: breakGlassRebind enqueues its own A47_CHANGE_IDENTIFIER entry, never a duplicate A40 from the merge it wraps internally', async () => {
    const confirmed = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-A47-CONFIRMED' }));
    if (confirmed.outcome !== 'created') throw new Error('setup failed');

    const downtimeResult = await mockPatientIndexService.resolveOrCreatePatient({
      ...candidate({ mrn: 'AUTO-DOWNTIME-1', dateOfBirth: '1970-01-01' }),
      isDowntimeRecord: true,
      downtimeReasonCode: 'UNIDENTIFIED_TRAUMA',
    });
    if (downtimeResult.outcome === 'ambiguous') throw new Error('setup failed');
    const downtimePatientId = downtimeResult.patientId;

    const rebindResult = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId,
      confirmedPatientId: confirmed.patientId,
      reasonCode: 'UNIDENTIFIED_TRAUMA',
      notes: 'Real identity confirmed via family member at bedside, per real hospital protocol.',
      performedBy: 'test-admin',
    });
    expect(rebindResult.rebound).toBe(true);

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(downtimePatientId);
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;

    // The real, load-bearing assertion: exactly one real entry, A47 —
    // never an A40 too, even though breakGlassRebind wraps
    // mergeIntoExistingPatient() internally.
    expect(queueRes.data).toHaveLength(1);
    expect(queueRes.data[0].eventType).toBe('A47_CHANGE_IDENTIFIER');
    expect(queueRes.data[0].sourceOperation).toBe('breakGlassRebind');
    const a40Entries = queueRes.data.filter(e => e.eventType === 'A40_MERGE_PATIENT');
    expect(a40Entries).toHaveLength(0);
  });

  it('real, per Pathology HL7 Outbound Feature Spec §4: updateDemographics enqueues a real A08_DEMOGRAPHIC_UPDATE entry only when the change is actually applied', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-A08-1' }));
    if (created.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'UpdatedRealSurname' }, new Date().toISOString());
    expect(result.applied).toBe(true);

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(created.patientId);
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;
    expect(queueRes.data).toHaveLength(1);
    expect(queueRes.data[0].eventType).toBe('A08_DEMOGRAPHIC_UPDATE');
    expect(queueRes.data[0].targetPatientId).toBeUndefined();
  });

  it('a real, genuinely stale ADT event that updateDemographics correctly rejects never enqueues a false A08 entry', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-A08-STALE' }));
    if (created.outcome !== 'created') throw new Error('setup failed');

    await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'FirstRealUpdate' }, '2026-06-01T00:00:00Z');
    // A genuinely older/stale event, correctly rejected.
    const staleResult = await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'StaleShouldNotApply' }, '2026-01-01T00:00:00Z');
    expect(staleResult.applied).toBe(false);

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(created.patientId);
    expect(queueRes.ok).toBe(true);
    // Exactly one real entry — from the first, genuinely applied
    // update, never a second one for the rejected, stale event.
    if (queueRes.ok) expect(queueRes.data).toHaveLength(1);
  });

  it('real retryDispatch cycle, same proven pattern as the billing queue', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-RETRY' }));
    if (created.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'RetryTest' }, new Date().toISOString());

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(created.patientId);
    if (!queueRes.ok || queueRes.data.length === 0) throw new Error('setup failed');
    const entryId = queueRes.data[0].id;

    const failed = await mockOutboundPatientAdtQueueService.markFailed(entryId, {
      errorCode: 'DISPATCH_TIMEOUT', errorMessage: 'Real, simulated timeout — no real transport exists yet.', maxRetriesExceeded: false,
    });
    expect(failed.ok && failed.data.status).toBe('FAILED');

    const retried = await mockOutboundPatientAdtQueueService.retryDispatch(entryId);
    expect(retried.ok && retried.data.status).toBe('QUEUED');
    expect(retried.ok && retried.data.retryCount).toBe(1);
  });

  it('real, per direct follow-up ("We are logging interface errors with human readable error messaging?"): markFailed itself now leaves a real, permanent audit record the moment a real failure happens, not just when it\'s later retried', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    const created = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ADT-AUDIT' }));
    if (created.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'AuditFailTest' }, new Date().toISOString());

    const queueRes = await mockOutboundPatientAdtQueueService.getByPatientId(created.patientId);
    if (!queueRes.ok || queueRes.data.length === 0) throw new Error('setup failed');
    const entryId = queueRes.data[0].id;

    // Real, deliberate: never retried — proving the FIRST failure alone
    // leaves a real, permanent audit record, not just the live queue
    // entry's own errorCode/errorMessage.
    await mockOutboundPatientAdtQueueService.markFailed(entryId, {
      errorCode: 'DISPATCH_UNREACHABLE',
      errorMessage: 'Could not reach the interface engine — check that it\'s running and reachable at the configured endpoint. (Failed to fetch)',
      maxRetriesExceeded: false,
    });

    const logsRes = await mockAuditService.getAuditLogs({ search: 'dispatch failed' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entry = logsRes.data.find(l => l.detail.includes(entryId));
    expect(entry).toBeTruthy();
    expect(entry?.detail).toContain('DISPATCH_UNREACHABLE');
    expect(entry?.detail).toContain('Could not reach the interface engine');
  });
});

describe('buildPatientAdtPayload — real, per direct guidance: the actual JSON packages, never an HL7 string PathScribe itself constructs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('buildAdt40Payload carries full real identity for both the prior (merged-away) and surviving patient, plus every real crosswalk identifier', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-PAYLOAD-A40-1' }));
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-PAYLOAD-A40-1', dateOfBirth: '1990-01-01' }));
    if (first.outcome !== 'created' || ambiguous.outcome !== 'ambiguous') throw new Error('setup failed');
    await mockPatientIndexService.mergeIntoExistingPatient(ambiguous.patientId, first.patientId);

    const payload = await buildAdt40Payload(ambiguous.patientId, first.patientId, ORG_A, 0, 0);
    expect(payload?.eventType).toBe('A40_MERGE_PATIENT');
    expect(payload?.priorPatient.patientId).toBe(ambiguous.patientId);
    expect(payload?.survivingPatient.patientId).toBe(first.patientId);
    expect(payload?.priorPatient.identifiers.length).toBeGreaterThan(0);
  });

  it('buildAdt47Payload carries the real reason code and notes alongside both identities', async () => {
    const confirmed = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-PAYLOAD-A47-CONFIRMED' }));
    if (confirmed.outcome !== 'created') throw new Error('setup failed');
    const downtimeResult = await mockPatientIndexService.resolveOrCreatePatient({
      ...candidate({ mrn: 'AUTO-DOWNTIME-PAYLOAD', dateOfBirth: '1970-01-01' }),
      isDowntimeRecord: true,
      downtimeReasonCode: 'UNIDENTIFIED_TRAUMA',
    });
    if (downtimeResult.outcome === 'ambiguous') throw new Error('setup failed');

    const payload = await buildAdt47Payload(downtimeResult.patientId, confirmed.patientId, ORG_A, 'UNIDENTIFIED_TRAUMA', 'Real test notes.', 1);
    expect(payload?.eventType).toBe('A47_CHANGE_IDENTIFIER');
    expect(payload?.reasonCode).toBe('UNIDENTIFIED_TRAUMA');
    expect(payload?.priorIdentity.patientId).toBe(downtimeResult.patientId);
    expect(payload?.confirmedIdentity.patientId).toBe(confirmed.patientId);
  });

  it('buildAdt08Payload carries the real, current (already-updated) demographic snapshot', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-PAYLOAD-A08' }));
    if (created.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.updateDemographics(created.patientId, { lastName: 'RealUpdatedSurname' }, new Date().toISOString());

    const payload = await buildAdt08Payload(created.patientId, ORG_A);
    expect(payload?.patient.lastName).toBe('RealUpdatedSurname');
  });

  it('a genuinely nonexistent patient id resolves to null, never a fabricated payload', async () => {
    const payload = await buildAdt40Payload('does-not-exist-a', 'does-not-exist-b', ORG_A, 0, 0);
    expect(payload).toBeNull();
  });
});
