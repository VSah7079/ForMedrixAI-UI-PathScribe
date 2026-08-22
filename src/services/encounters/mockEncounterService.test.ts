// src/services/encounters/mockEncounterService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockEncounterService } from './mockEncounterService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockEncounterService — real fix: the second genuinely missing piece of Phase 0', () => {
  it('resolveOrCreateEncounter creates a real, new encounter with the given fields', async () => {
    const res = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A',
      patientId: 'MPI-1',
      encounterNumber: 'FIN-001',
      encounterClass: 'Inpatient',
      facility: 'Main Campus',
      department: 'Oncology',
    });
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.encounterNumber).toBe('FIN-001');
    expect(res.data.status).toBe('Planned'); // real, honest default
    expect(res.data.facility).toBe('Main Campus');
  });

  it('a repeat call for the SAME (organisationId, encounterNumber) pair never creates a silent duplicate - resolves to the one, real, existing encounter', async () => {
    const first = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Inpatient',
    });
    const second = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Inpatient',
    });
    if (!first.ok || !second.ok) throw new Error('setup failed');
    expect(second.data.id).toBe(first.data.id);

    const all = await mockEncounterService.listForPatient('MPI-1');
    if (!all.ok) throw new Error('setup failed');
    expect(all.data).toHaveLength(1);
  });

  it('the same real encounterNumber at a genuinely different organisation is a real, separate encounter', async () => {
    const orgA = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Inpatient',
    });
    const orgB = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-B', patientId: 'MPI-2', encounterNumber: 'FIN-001', encounterClass: 'Outpatient',
    });
    if (!orgA.ok || !orgB.ok) throw new Error('setup failed');
    expect(orgA.data.id).not.toBe(orgB.data.id);
  });

  it('getByEncounterNumber finds the real, existing encounter by its external identifier', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Emergency',
    });
    if (!created.ok) throw new Error('setup failed');
    const found = await mockEncounterService.getByEncounterNumber('ORG-A', 'FIN-001');
    if (!found.ok) throw new Error('lookup failed');
    expect(found.data?.id).toBe(created.data.id);
  });

  it('getByEncounterNumber returns null, never a guess, for one that has never been seen', async () => {
    const result = await mockEncounterService.getByEncounterNumber('ORG-A', 'NEVER-SEEN');
    if (!result.ok) throw new Error('lookup failed');
    expect(result.data).toBeNull();
  });

  it('listForPatient returns only real encounters genuinely belonging to that patient, most-recent-first', async () => {
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Inpatient', admitTime: '2026-01-01T00:00:00.000Z',
    });
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-002', encounterClass: 'Outpatient', admitTime: '2026-03-01T00:00:00.000Z',
    });
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-OTHER', encounterNumber: 'FIN-003', encounterClass: 'Inpatient',
    });

    const results = await mockEncounterService.listForPatient('MPI-1');
    if (!results.ok) throw new Error('setup failed');
    expect(results.data).toHaveLength(2);
    expect(results.data[0].encounterNumber).toBe('FIN-002'); // later admitTime first
  });

  it('updateStatus transitions a real encounter and records a real dischargeTime', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-1', encounterNumber: 'FIN-001', encounterClass: 'Inpatient', status: 'In-Progress',
    });
    if (!created.ok) throw new Error('setup failed');
    const updated = await mockEncounterService.updateStatus(created.data.id, 'Discharged', '2026-06-01T12:00:00.000Z', '2026-06-01T12:00:00.000Z');
    if (!updated.ok) throw new Error('update failed');
    expect(updated.data.applied).toBe(true);
    expect(updated.data.encounter.status).toBe('Discharged');
    expect(updated.data.encounter.dischargeTime).toBe('2026-06-01T12:00:00.000Z');
  });

  it('updateStatus on a real, nonexistent encounter id fails honestly rather than silently succeeding', async () => {
    const result = await mockEncounterService.updateStatus('ENC-does-not-exist', 'Cancelled', '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
  });

  it('real fix, Phase 4: a genuinely stale status event is honestly rejected, never silently applied over newer state', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-2', encounterNumber: 'FIN-002', encounterClass: 'Inpatient', status: 'Planned',
    });
    if (!created.ok) throw new Error('setup failed');

    await mockEncounterService.updateStatus(created.data.id, 'Discharged', '2026-06-02T09:00:00.000Z', '2026-06-02T09:00:00.000Z');

    // A real, genuinely older event arrives late - must never revert
    // the already-applied, newer discharge.
    const stale = await mockEncounterService.updateStatus(created.data.id, 'In-Progress', '2026-06-01T08:00:00.000Z');
    if (!stale.ok) throw new Error('update failed');
    expect(stale.data.applied).toBe(false);
    expect(stale.data.encounter.status).toBe('Discharged'); // unchanged - the stale event never landed
  });

  // Real feature, per direct, detailed correction: DG1 is its own,
  // dedicated segment, legitimately riding with A01/A04/A05 (creation,
  // via resolveOrCreateEncounter's own diagnoses param) and A08
  // (update, via this real, narrow updateDiagnoses method).
  it('resolveOrCreateEncounter records real diagnoses supplied at creation', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-3', encounterNumber: 'FIN-DX-001', encounterClass: 'Inpatient',
      diagnoses: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', codingSystem: 'I10', diagnosisType: 'A' }],
    });
    if (!created.ok) throw new Error('setup failed');
    expect(created.data.diagnoses).toEqual([
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', codingSystem: 'I10', diagnosisType: 'A' },
    ]);
  });

  it('a real encounter created with no diagnoses genuinely has none — undefined, not an empty array fabricated by the service', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-3', encounterNumber: 'FIN-DX-002', encounterClass: 'Inpatient',
    });
    if (!created.ok) throw new Error('setup failed');
    expect(created.data.diagnoses).toBeUndefined();
  });

  it('updateDiagnoses applies a real, later diagnosis update (e.g. an A08 correcting/adding to an A01\'s own DG1)', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-4', encounterNumber: 'FIN-DX-003', encounterClass: 'Inpatient',
      diagnoses: [{ code: 'E11.9', codingSystem: 'I10', diagnosisType: 'A' }],
      eventTimestamp: '2026-06-01T08:00:00.000Z',
    });
    if (!created.ok) throw new Error('setup failed');

    const updated = await mockEncounterService.updateDiagnoses(
      created.data.id,
      [{ code: 'E11.9', codingSystem: 'I10', diagnosisType: 'F' }, { code: 'I10', codingSystem: 'I10', diagnosisType: 'W' }],
      '2026-06-01T09:00:00.000Z'
    );
    if (!updated.ok) throw new Error('update failed');
    expect(updated.data.applied).toBe(true);
    expect(updated.data.encounter.diagnoses).toEqual([
      { code: 'E11.9', codingSystem: 'I10', diagnosisType: 'F' },
      { code: 'I10', codingSystem: 'I10', diagnosisType: 'W' },
    ]);
  });

  it('updateDiagnoses replaces the full list rather than merging — real DG1 sets are sent complete, not as an incremental diff', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-5', encounterNumber: 'FIN-DX-004', encounterClass: 'Inpatient',
      diagnoses: [{ code: 'E11.9', codingSystem: 'I10' }, { code: 'I10', codingSystem: 'I10' }],
      eventTimestamp: '2026-06-01T08:00:00.000Z',
    });
    if (!created.ok) throw new Error('setup failed');

    // A later A08 carries only ONE real diagnosis now — the real,
    // complete replacement (not a merge that would incorrectly keep
    // the old second diagnosis around).
    const updated = await mockEncounterService.updateDiagnoses(
      created.data.id,
      [{ code: 'J45.909', codingSystem: 'I10' }],
      '2026-06-01T09:00:00.000Z'
    );
    if (!updated.ok) throw new Error('update failed');
    expect(updated.data.encounter.diagnoses).toEqual([{ code: 'J45.909', codingSystem: 'I10' }]);
  });

  it('updateDiagnoses on a real, nonexistent encounter id fails honestly rather than silently succeeding', async () => {
    const result = await mockEncounterService.updateDiagnoses('ENC-does-not-exist', [{ code: 'E11.9' }], '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
  });

  it('updateDiagnoses honestly rejects a genuinely stale/out-of-order event, never silently applying it over newer state — same real discipline as updateStatus', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-6', encounterNumber: 'FIN-DX-005', encounterClass: 'Inpatient',
      diagnoses: [{ code: 'E11.9', codingSystem: 'I10' }],
      eventTimestamp: '2026-06-01T08:00:00.000Z',
    });
    if (!created.ok) throw new Error('setup failed');

    await mockEncounterService.updateDiagnoses(created.data.id, [{ code: 'I10', codingSystem: 'I10' }], '2026-06-01T10:00:00.000Z');

    // A real, genuinely older event arrives late.
    const stale = await mockEncounterService.updateDiagnoses(created.data.id, [{ code: 'J45.909', codingSystem: 'I10' }], '2026-06-01T09:00:00.000Z');
    if (!stale.ok) throw new Error('update failed');
    expect(stale.data.applied).toBe(false);
    expect(stale.data.encounter.diagnoses).toEqual([{ code: 'I10', codingSystem: 'I10' }]); // unchanged
  });
});
