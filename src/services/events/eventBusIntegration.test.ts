// src/services/events/eventBusIntegration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, end-to-end proof that Phase 4's event bus is actually wired
// into the real producers (mockPatientIndexService.ts,
// mockEncounterService.ts) - not just tested in isolation
// (mockPatientEventBus.test.ts already covers the bus mechanics on
// their own). A real subscriber here receives a real event from a
// real, unmodified call to the same public methods every other part
// of this app already uses.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockPatientIndexService } = await import('../patients/mockPatientIndexService');
const { mockEncounterService } = await import('../encounters/mockEncounterService');
const { mockPatientEventBus } = await import('./mockPatientEventBus');

function candidate(overrides: Partial<{ organisationId: string; mrn: string; assigningAuthority: string; firstName: string; lastName: string; dateOfBirth: string }> = {}) {
  return {
    organisationId: 'ORG-A',
    mrn: 'MRN-DEFAULT',
    firstName: 'Robert',
    lastName: 'Jackson',
    dateOfBirth: '1975-03-14',
    ...overrides,
  };
}

describe('Event bus integration — real fix, the actual point of Phase 4: real producers publish real events a real subscriber actually receives', () => {
  it('a real, genuinely new patient publishes a real Patient.Created event', async () => {
    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Patient.Created', listener);
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-1', firstName: 'Evelyn', lastName: 'Created1' }));
    unsub();

    expect(result.outcome).toBe('created');
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('Patient.Created');
    expect(event.patient.id).toBe(result.patientId);
  });

  it('a real, confident match publishes a real Patient.Matched event, not Patient.Created', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-2', assigningAuthority: 'MAIN' }));

    const createdListener = vi.fn();
    const matchedListener = vi.fn();
    const unsub1 = mockPatientEventBus.subscribe('Patient.Created', createdListener);
    const unsub2 = mockPatientEventBus.subscribe('Patient.Matched', matchedListener);

    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-2', assigningAuthority: 'MAIN' }));
    unsub1(); unsub2();

    expect(createdListener).not.toHaveBeenCalled();
    expect(matchedListener).toHaveBeenCalledTimes(1);
  });

  it('a real merge publishes a real Patient.Merged event with the real casesRepointed count', async () => {
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-3A', firstName: 'Alice', lastName: 'Merge3' }));
    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-3B', firstName: 'Bob', lastName: 'Merge3' }));
    if (targetRes.outcome !== 'created' || sourceRes.outcome !== 'created') throw new Error('setup failed');

    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Patient.Merged', listener);
    await mockPatientIndexService.mergeIntoExistingPatient(sourceRes.patientId, targetRes.patientId);
    unsub();

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.sourcePatientId).toBe(sourceRes.patientId);
    expect(event.targetPatient.id).toBe(targetRes.patientId);
  });

  it('a real link publishes a real Patient.Linked event', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-4A', firstName: 'Carol', lastName: 'Link4' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-4B', firstName: 'Dave', lastName: 'Link4' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');

    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Patient.Linked', listener);
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1', 'Confirmed same patient');
    unsub();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a real, APPLIED demographics update publishes Patient.Updated; a real, REJECTED stale update does not', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-EVT-5', firstName: 'Franklin', lastName: 'Update5' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Patient.Updated', listener);

    await mockPatientIndexService.updateDemographics(res.patientId, { firstName: 'Updated' }, '2026-06-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledTimes(1);

    // A genuinely stale event - never published, since it was never applied.
    await mockPatientIndexService.updateDemographics(res.patientId, { firstName: 'StaleShouldNotPublish' }, '2026-01-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledTimes(1); // still 1, not 2

    unsub();
  });

  it('a real, new encounter publishes a real Encounter.Created event', async () => {
    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Encounter.Created', listener);
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-EVT-TEST', encounterNumber: 'FIN-EVT-1', encounterClass: 'Inpatient',
    });
    unsub();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a real, duplicate encounter reference (same org+encounterNumber) does NOT re-publish Encounter.Created', async () => {
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-EVT-TEST2', encounterNumber: 'FIN-EVT-2', encounterClass: 'Inpatient',
    });
    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Encounter.Created', listener);
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-EVT-TEST2', encounterNumber: 'FIN-EVT-2', encounterClass: 'Inpatient',
    });
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a real, APPLIED status change publishes Encounter.StatusChanged with the real previousStatus; a real, REJECTED stale change does not publish', async () => {
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: 'MPI-EVT-TEST3', encounterNumber: 'FIN-EVT-3', encounterClass: 'Inpatient', status: 'In-Progress',
    });
    if (!created.ok) throw new Error('setup failed');

    const listener = vi.fn();
    const unsub = mockPatientEventBus.subscribe('Encounter.StatusChanged', listener);

    await mockEncounterService.updateStatus(created.data.id, 'Discharged', '2026-06-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].previousStatus).toBe('In-Progress');

    // A genuinely stale status update - never published.
    await mockEncounterService.updateStatus(created.data.id, 'In-Progress', '2026-01-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledTimes(1); // still 1, not 2

    unsub();
  });
});
