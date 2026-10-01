// src/services/events/mockPatientEventBus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mockPatientEventBus } from './mockPatientEventBus';
import type { PatientEvent } from './IPatientEventBus';

const samplePatient = {
  id: 'MPI-1', organisationId: 'ORG-A', mrn: 'MRN-1', firstName: 'John', lastName: 'Doe',
  dateOfBirth: '1990-01-01', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  establishedVia: 'created' as const,
};

describe('mockPatientEventBus — real fix, Phase 4: the actual real-time broadcasting mechanism', () => {
  it('a real, typed subscriber receives a real event of its own type', () => {
    const listener = vi.fn();
    const unsubscribe = mockPatientEventBus.subscribe('Patient.Created', listener);
    const event: PatientEvent = { type: 'Patient.Created', patient: samplePatient };
    mockPatientEventBus.publish(event);
    expect(listener).toHaveBeenCalledWith(event);
    unsubscribe();
  });

  it('a real, typed subscriber never receives a real event of a DIFFERENT type', () => {
    const listener = vi.fn();
    const unsubscribe = mockPatientEventBus.subscribe('Patient.Created', listener);
    mockPatientEventBus.publish({ type: 'Patient.Updated', patient: samplePatient });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('unsubscribe genuinely stops delivery - a real, closed subscriber never leaks', () => {
    const listener = vi.fn();
    const unsubscribe = mockPatientEventBus.subscribe('Patient.Created', listener);
    unsubscribe();
    mockPatientEventBus.publish({ type: 'Patient.Created', patient: samplePatient });
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribeAll receives every real event, regardless of type', () => {
    const listener = vi.fn();
    const unsubscribe = mockPatientEventBus.subscribeAll(listener);
    mockPatientEventBus.publish({ type: 'Patient.Created', patient: samplePatient });
    mockPatientEventBus.publish({ type: 'Patient.Updated', patient: samplePatient });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('multiple real subscribers to the same event type all receive it', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = mockPatientEventBus.subscribe('Patient.Merged', listenerA);
    const unsubB = mockPatientEventBus.subscribe('Patient.Merged', listenerB);
    mockPatientEventBus.publish({ type: 'Patient.Merged', sourcePatientId: 'MPI-2', targetPatient: samplePatient, casesRepointed: 3 });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubA(); unsubB();
  });

  it('real fix: a genuinely misbehaving subscriber (throws) never breaks delivery to OTHER real subscribers', () => {
    const throwing = vi.fn(() => { throw new Error('a real subscriber bug'); });
    const healthy = vi.fn();
    const unsub1 = mockPatientEventBus.subscribe('Patient.Created', throwing);
    const unsub2 = mockPatientEventBus.subscribe('Patient.Created', healthy);
    expect(() => mockPatientEventBus.publish({ type: 'Patient.Created', patient: samplePatient })).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    unsub1(); unsub2();
  });
});
