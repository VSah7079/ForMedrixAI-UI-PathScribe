// src/services/reports/mockReportVersionService.test.ts
import { describe, it, expect, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockReportVersionService } = await import('./mockReportVersionService');
const { caseRouter } = await import('../cases/CaseRouter');
const { mockPatientIndexService } = await import('../patients/mockPatientIndexService');
const { mockEncounterService } = await import('../encounters/mockEncounterService');

describe('mockReportVersionService — real fix, Phase 5: the actual point - a real, immutable patient/encounter snapshot captured at the moment of sign-out', () => {
  it('a real version captures a real, complete patient+encounter snapshot when both exist', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-SNAP-1', firstName: 'Maria', lastName: 'Garcia', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');

    const encounterRes = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: patientRes.patientId, encounterNumber: 'FIN-SNAP-1', encounterClass: 'Inpatient',
      facility: 'Main Campus', ward: 'ICU', room: '301', bed: 'A', attendingProvider: { lastName: 'WILLIAMS', firstName: 'CAROL' },
    });
    if (!encounterRes.ok) throw new Error('setup failed');

    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({
      patient: { id: patientRes.patientId },
      encounterId: encounterRes.data.id,
    } as any);

    const result = await mockReportVersionService.create({
      caseId: 'CASE-SNAP-1', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.data.patientEncounterSnapshot;
    expect(snapshot?.patientId).toBe(patientRes.patientId);
    expect(snapshot?.mrn).toBe('MRN-SNAP-1');
    expect(snapshot?.firstName).toBe('Maria');
    expect(snapshot?.encounterId).toBe(encounterRes.data.id);
    expect(snapshot?.encounterNumber).toBe('FIN-SNAP-1');
    expect(snapshot?.ward).toBe('ICU');

    vi.restoreAllMocks();
  });

  it('real, critical fix: the snapshot is genuinely immutable - a later real demographic correction never rewrites an already-created version\'s snapshot', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-SNAP-2', firstName: 'Original', lastName: 'Name', dateOfBirth: '1990-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');

    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    const result = await mockReportVersionService.create({
      caseId: 'CASE-SNAP-2', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    if (!result.ok) throw new Error('create failed');
    const originalSnapshotName = result.data.patientEncounterSnapshot?.firstName;

    // A real, later demographic correction via the real, live MPI.
    await mockPatientIndexService.updateDemographics(patientRes.patientId, { firstName: 'CorrectedLater' }, '2026-06-01T00:00:00.000Z');

    // Re-fetch the SAME, already-created version - its snapshot must
    // remain exactly what it was at sign-out, never re-resolved.
    const versions = await mockReportVersionService.getByCaseId('CASE-SNAP-2');
    expect(versions.ok).toBe(true);
    if (!versions.ok) return;
    expect(versions.data[0].patientEncounterSnapshot?.firstName).toBe(originalSnapshotName);
    expect(versions.data[0].patientEncounterSnapshot?.firstName).toBe('Original');
    expect(versions.data[0].patientEncounterSnapshot?.firstName).not.toBe('CorrectedLater');

    vi.restoreAllMocks();
  });

  it('real, defensive fix: a genuinely absent case (lookup fails) never blocks the real version from being created - just an absent snapshot', async () => {
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue(undefined);

    const result = await mockReportVersionService.create({
      caseId: 'CASE-NO-CASE', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patientEncounterSnapshot).toBeUndefined();
    expect(result.data.id).toBeTruthy(); // the real version record itself still exists

    vi.restoreAllMocks();
  });

  it('real, defensive fix: a genuinely thrown error during lookup never propagates - the real sign-out must never be blocked by this', async () => {
    vi.spyOn(caseRouter, 'getCase').mockRejectedValue(new Error('a real, unrelated database error'));

    await expect(
      mockReportVersionService.create({
        caseId: 'CASE-THROWS', mode: 'orchestration', trigger: 'initial_signout',
        createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
      })
    ).resolves.toMatchObject({ ok: true });

    vi.restoreAllMocks();
  });

  it('a real case with no encounter genuinely has no encounter fields on the snapshot, but still has real patient fields', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-SNAP-3', firstName: 'NoEncounter', lastName: 'Person', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');

    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any); // no real encounterId

    const result = await mockReportVersionService.create({
      caseId: 'CASE-SNAP-3', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    if (!result.ok) throw new Error('create failed');
    expect(result.data.patientEncounterSnapshot?.patientId).toBe(patientRes.patientId);
    expect(result.data.patientEncounterSnapshot?.encounterId).toBeUndefined();

    vi.restoreAllMocks();
  });

  it('a real version captures the real, current station at the moment of creation, per direct follow-up: "Stamp every saved draft... with... station_id captured at the exact moment of saving"', async () => {
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: undefined } as any);
    localStorage.setItem('pathscribe_current_scan_station_id', 'station-stain-2');

    const result = await mockReportVersionService.create({
      caseId: 'CASE-STATION-1', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    if (!result.ok) throw new Error('create failed');
    expect(result.data.createdFromStation).toBe('station-stain-2');

    localStorage.removeItem('pathscribe_current_scan_station_id');
    vi.restoreAllMocks();
  });

  it('a real version genuinely has no station when none is known — never a guessed/default value', async () => {
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: undefined } as any);
    localStorage.removeItem('pathscribe_current_scan_station_id');
    localStorage.removeItem('pathscribe-user');

    const result = await mockReportVersionService.create({
      caseId: 'CASE-STATION-2', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    if (!result.ok) throw new Error('create failed');
    expect(result.data.createdFromStation).toBeNull();

    vi.restoreAllMocks();
  });
});

describe('mockReportVersionService.create — real, per direct guidance: the ORU^R01 outbound queue hook, and the confirmed FINAL/CORRECTED/ADDENDUM inference', () => {
  it('trigger "initial_signout" with a real instanceId enqueues a real FINAL entry', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-1', firstName: 'Test', lastName: 'PatientOru1', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    await mockReportVersionService.create({
      caseId: 'CASE-ORU-FINAL', mode: 'orchestration', trigger: 'initial_signout', instanceId: 'inst-final-1',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    // Real, non-blocking enqueue — genuinely async, same fire-and-forget
    // posture as every other real enqueue in this app.
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-FINAL');
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;
    expect(queueRes.data).toHaveLength(1);
    expect(queueRes.data[0].resultState).toBe('FINAL');
    expect(queueRes.data[0].instanceId).toBe('inst-final-1');

    vi.restoreAllMocks();
  });

  it('trigger "amendment" with a prior version already existing for the SAME instanceId enqueues CORRECTED, per the confirmed real HL7 intent', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-2', firstName: 'Test', lastName: 'PatientOru2', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    // Real, first version for this instance.
    await mockReportVersionService.create({
      caseId: 'CASE-ORU-CORRECTED', mode: 'orchestration', trigger: 'initial_signout', instanceId: 'inst-a',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    // Real, second version for the SAME instance — a genuine correction.
    await mockReportVersionService.create({
      caseId: 'CASE-ORU-CORRECTED', mode: 'orchestration', trigger: 'amendment', instanceId: 'inst-a',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-CORRECTED');
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;
    expect(queueRes.data.map(e => e.resultState)).toEqual(['FINAL', 'CORRECTED']);

    vi.restoreAllMocks();
  });

  it('trigger "amendment" for a genuinely NEW instanceId, on a case with other real prior versions, enqueues ADDENDUM, per the confirmed real HL7 intent', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-3', firstName: 'Test', lastName: 'PatientOru3', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    // Real, first instance already finalized on this case.
    await mockReportVersionService.create({
      caseId: 'CASE-ORU-ADDENDUM', mode: 'orchestration', trigger: 'initial_signout', instanceId: 'inst-b',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    // Real, genuinely NEW second instance, finalized afterward — a real addendum.
    await mockReportVersionService.create({
      caseId: 'CASE-ORU-ADDENDUM', mode: 'orchestration', trigger: 'amendment', instanceId: 'inst-c',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-ADDENDUM');
    expect(queueRes.ok).toBe(true);
    if (!queueRes.ok) return;
    const byInstance = Object.fromEntries(queueRes.data.map(e => [e.instanceId, e.resultState]));
    expect(byInstance['inst-b']).toBe('FINAL');
    expect(byInstance['inst-c']).toBe('ADDENDUM');

    vi.restoreAllMocks();
  });

  it('real, confirmed scope: mode "assist" is never enqueued — an external LIS owns that report, not PathScribe', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-4', firstName: 'Test', lastName: 'PatientOru4', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    await mockReportVersionService.create({
      caseId: 'CASE-ORU-ASSIST', mode: 'assist', trigger: 'initial_signout', instanceId: 'inst-assist-1',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-ASSIST');
    expect(queueRes.ok).toBe(true);
    if (queueRes.ok) expect(queueRes.data).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it('real, confirmed scope: a case-level record with no instanceId (the whole-case PDF snapshot) is never enqueued — a composite summary isn\'t a discrete OBR/OBX observation', async () => {
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-5', firstName: 'Test', lastName: 'PatientOru5', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    await mockReportVersionService.create({
      caseId: 'CASE-ORU-NOINSTANCE', mode: 'orchestration', trigger: 'initial_signout',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-NOINSTANCE');
    expect(queueRes.ok).toBe(true);
    if (queueRes.ok) expect(queueRes.data).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it('real, per direct follow-up ("We are logging interface errors with human readable error messaging?"): markFailed itself now leaves a real, permanent audit record the moment a real failure happens, not just when it\'s later retried', async () => {
    const { mockOutboundResultQueueService } = await import('./mockOutboundResultQueueService');
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-ORU-AUDIT', firstName: 'Test', lastName: 'PatientOruAudit', dateOfBirth: '1980-01-01T00:00:00.000Z',
    });
    if (patientRes.outcome !== 'created') throw new Error('setup failed');
    vi.spyOn(caseRouter, 'getCase').mockResolvedValue({ patient: { id: patientRes.patientId } } as any);

    await mockReportVersionService.create({
      caseId: 'CASE-ORU-AUDIT-FAIL', mode: 'orchestration', trigger: 'initial_signout', instanceId: 'inst-audit-fail',
      createdBy: { userId: 'user-1', userName: 'Dr. Smith' },
    });
    await new Promise(r => setTimeout(r, 150)); // real, needed: mockOutboundResultQueueService's own internal delay() is 80ms

    const queueRes = await mockOutboundResultQueueService.getByCaseId('CASE-ORU-AUDIT-FAIL');
    if (!queueRes.ok || queueRes.data.length === 0) throw new Error('setup failed');
    const entryId = queueRes.data[0].id;

    // Real, deliberate: never retried — proving the FIRST failure alone
    // leaves a real, permanent audit record, not just the live queue
    // entry's own errorCode/errorMessage.
    await mockOutboundResultQueueService.markFailed(entryId, {
      errorCode: 'DISPATCH_REJECTED',
      errorMessage: 'The interface engine rejected this message: Unknown transactionType',
      maxRetriesExceeded: false,
    });

    const logsRes = await mockAuditService.getAuditLogs({ search: 'dispatch failed' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entry = logsRes.data.find(l => l.detail.includes(entryId));
    expect(entry).toBeTruthy();
    expect(entry?.detail).toContain('DISPATCH_REJECTED');
    expect(entry?.detail).toContain('Unknown transactionType');

    vi.restoreAllMocks();
  });
});
