import { describe, it, expect } from 'vitest';
import { autoPatientId, resolveSubmittedPatientId } from './patientIdGeneration';
import { missingRequiredFields, resolveFieldRequirements } from '../fieldRequirements/fieldRequirementRules';

describe('Accession Patient ID generation (Batch 377)', () => {
  it('generates AUTO-<case id without its prefix>', () => {
    expect(autoPatientId('O26-1234')).toBe('AUTO-1234');
    expect(autoPatientId('O26-')).toBeNull();
    expect(autoPatientId(undefined)).toBeNull();
  });
  it('what was entered wins; a blank one is generated; failure stops the save only when required', () => {
    expect(resolveSubmittedPatientId(' MRN9 ', 'O26-1', true)).toEqual({ ok: true, value: 'MRN9', generated: false });
    expect(resolveSubmittedPatientId('', 'O26-1', true)).toEqual({ ok: true, value: 'AUTO-1', generated: true });
    expect(resolveSubmittedPatientId('', '', true)).toEqual({ ok: false });
    expect(resolveSubmittedPatientId('', '', false)).toEqual({ ok: true, value: '', generated: false });
  });
  it('a required Patient ID left blank is not listed as missing: it will be generated', () => {
    const req = resolveFieldRequirements('accession', { mrn: true });
    expect(missingRequiredFields(req, { givenNames: 'A', familyNames: 'B', dateOfBirth: 'x', client: 'c', requestingProvider: 'p', mrn: '', specimenDescription: ['s'] })).toEqual([]);
  });
});
