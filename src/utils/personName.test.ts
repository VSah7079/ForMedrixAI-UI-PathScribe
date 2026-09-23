import { describe, it, expect } from 'vitest';
import { resolvePatientFullDisplayName } from './personName';
import type { Patient } from '@/types/case/Patient';

function buildPatient(overrides: Partial<Patient>): Patient {
  return { id: 'p1', ...overrides } as Patient;
}

describe('resolvePatientFullDisplayName', () => {
  it('a missing patient honestly resolves to null, not a fabricated placeholder', () => {
    expect(resolvePatientFullDisplayName(undefined)).toBeNull();
    expect(resolvePatientFullDisplayName(null)).toBeNull();
  });

  it('prefers real givenNames/familyNames when both are present', () => {
    const patient = buildPatient({ givenNames: 'David', familyNames: 'Martinez', firstName: 'Dave', lastName: 'M' });
    expect(resolvePatientFullDisplayName(patient)).toBe('David Martinez');
  });

  it('falls back to the legacy firstName/lastName bridge when givenNames/familyNames are absent', () => {
    const patient = buildPatient({ firstName: 'Grace', lastName: 'Thompson' });
    expect(resolvePatientFullDisplayName(patient)).toBe('Grace Thompson');
  });
});
