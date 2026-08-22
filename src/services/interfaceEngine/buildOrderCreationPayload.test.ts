// src/services/interfaceEngine/buildOrderCreationPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildOrderCreationPayload, patientDataScopeFor } from './buildOrderCreationPayload';
import type { Case } from '@/types/case/Case';

function makeCase(overrides: Record<string, unknown> = {}): Case {
  return {
    id: 'C-TEST-001',
    originEnterpriseId: 'ENT-DEFAULT',
    originHospitalId: 'HOSP-001',
    accession: { fullAccession: 'S26-4402-TEST' },
    patient: {
      mrn: 'MRN-TEST-001',
      givenNames: 'Maria',
      familyNames: 'Garcia',
      dateOfBirth: '1958-03-14T00:00:00.000Z',
      sex: 'F',
    },
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Sarah Chen',
      clinicalIndication: 'Evaluation of skin lesion, rule out melanoma.',
      icd10Codes: [
        { code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin' },
        { code: 'L57.0', description: 'Actinic keratosis' },
      ],
    },
    specimens: [
      {
        label: 'A',
        description: 'Single punch biopsy specimen measuring 0.6 cm in diameter.',
        collection: { bodySite: 'Left Upper Back', method: 'Punch Biopsy', collectedAt: '2026-08-12T07:15:00.000Z' },
        processing: { fixative: '10% Neutral Buffered Formalin' },
      },
    ],
    ...overrides,
  } as unknown as Case;
}

describe('patientDataScopeFor — real mapping, per the formal spec\'s own §2.6', () => {
  it('maps a real, matched MPI outcome to reference scope', () => {
    expect(patientDataScopeFor('matched')).toBe('reference');
  });

  it('maps a real, newly-created (scratch) MPI outcome to full scope', () => {
    expect(patientDataScopeFor('created')).toBe('full');
  });

  it('maps a real, ambiguous MPI outcome to full scope — the safer of the two mistakes', () => {
    expect(patientDataScopeFor('ambiguous')).toBe('full');
  });
});

describe('buildOrderCreationPayload — real feature, per direct follow-up: the actual trigger for a Category E OrderCreated event', () => {
  it('produces a real, stable, deterministic messageId from the Case id — same event, same id, every time', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.messageId).toBe('evt-order-C-TEST-001');
  });

  it('sets eventType, organisationId, facilityId, and eventTimestamp correctly', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.eventType).toBe('OrderCreated');
    expect(payload.organisationId).toBe('ENT-DEFAULT');
    expect(payload.facilityId).toBe('HOSP-001');
    expect(payload.eventTimestamp).toBe('2026-08-12T07:30:00.000Z');
  });

  it('a matched patient carries only reference-scope data — no demographics, per §2.6', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'matched', '2026-08-12T07:30:00.000Z');
    expect(payload.patient).toEqual({
      patientDataScope: 'reference',
      identifier: 'MRN-TEST-001',
    });
  });

  it('a scratch (created) patient carries full demographics, per §2.6', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.patient).toEqual({
      patientDataScope: 'full',
      identifier: 'MRN-TEST-001',
      firstName: 'Maria',
      lastName: 'Garcia',
      dateOfBirth: '1958-03-14T00:00:00.000Z',
      sex: 'F',
    });
  });

  it('never sends SSN — not present anywhere in the output, matching the formal spec\'s own §2.6 decision', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(JSON.stringify(payload)).not.toContain('ssn');
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('ssn');
  });

  it('maps order.priority directly — real fix: \'Rush\', not the spec\'s original, incorrect \'ASAP\'', () => {
    const rushCase = makeCase({ order: { priority: 'Rush', clinicalIndication: 'x' } });
    const payload = buildOrderCreationPayload(rushCase, 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.order.priority).toBe('Rush');
  });

  it('maps placerOrderNumber from the real, human-readable accession number, not the internal case id', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.order.placerOrderNumber).toBe('S26-4402-TEST');
  });

  it('carries the requesting provider as a real, honest rawName — this app stores it as free text, never split into structured name parts', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.order.orderingProvider).toEqual({ rawName: 'Dr. Sarah Chen' });
  });

  it('orderingProvider is genuinely absent when no requesting provider was ever entered', () => {
    const noProvider = makeCase({ order: { priority: 'Routine', requestingProvider: undefined } });
    const payload = buildOrderCreationPayload(noProvider, 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.order.orderingProvider).toBeUndefined();
  });

  it('marks only the first real ICD-10 code as principal — same convention as dftBuilder.ts\'s own DG1 stack', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.diagnoses).toEqual([
      { code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin', isPrincipal: true },
      { code: 'L57.0', description: 'Actinic keratosis', isPrincipal: false },
    ]);
  });

  it('diagnoses is genuinely undefined, not an empty array, when the case has no real ICD-10 codes', () => {
    const noDx = makeCase({ order: { priority: 'Routine', icd10Codes: undefined } });
    const payload = buildOrderCreationPayload(noDx, 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.diagnoses).toBeUndefined();
  });

  it('maps every real specimen field from its actual, nested collection/processing sub-objects', () => {
    const payload = buildOrderCreationPayload(makeCase(), 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.specimens).toEqual([
      {
        label: 'A',
        bodySite: 'Left Upper Back',
        collectionMethod: 'Punch Biopsy',
        collectionDateTime: '2026-08-12T07:15:00.000Z',
        fixative: '10% Neutral Buffered Formalin',
        grossDescriptionNote: 'Single punch biopsy specimen measuring 0.6 cm in diameter.',
      },
    ]);
  });

  it('maps multiple real specimens, preserving order', () => {
    const twoSpecimens = makeCase({
      specimens: [
        { label: 'A', description: 'First' },
        { label: 'B', description: 'Second' },
      ],
    });
    const payload = buildOrderCreationPayload(twoSpecimens, 'created', '2026-08-12T07:30:00.000Z');
    expect(payload.specimens.map(s => s.label)).toEqual(['A', 'B']);
  });
});
