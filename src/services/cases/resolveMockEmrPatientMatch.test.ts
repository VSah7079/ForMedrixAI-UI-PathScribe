import { describe, it, expect } from 'vitest';
import { resolveMockEmrPatientMatch } from './resolveMockEmrPatientMatch';
import type { Case } from '@/types/case/Case';

function buildCase(overrides: Record<string, unknown>): Case {
  return overrides as any as Case;
}

describe('resolveMockEmrPatientMatch', () => {
  it('an empty patientId honestly resolves to null, never a guessed default', () => {
    expect(resolveMockEmrPatientMatch([], '')).toBeNull();
  });

  it('no matching case honestly resolves to null rather than a leftover/wrong patient', () => {
    const cases = [buildCase({ patient: { mrn: '999999', firstName: 'A', lastName: 'B' } })];
    expect(resolveMockEmrPatientMatch(cases, '100004')).toBeNull();
  });

  it('resolves the real matched patient name, formatted DOB, and raw sex code', () => {
    const cases = [buildCase({
      patient: { mrn: '100004', firstName: 'David', lastName: 'Martinez', dateOfBirth: '1985-01-15', sex: 'M' },
    })];
    const result = resolveMockEmrPatientMatch(cases, '100004');
    expect(result?.patientName?.toUpperCase()).toContain('MARTINEZ');
    expect(result?.patientName).toContain('David');
    expect(result?.dob).toBe(new Date('1985-01-15').toLocaleDateString('en-GB'));
    expect(result?.sex).toBe('M');
  });

  it('prefers real givenNames/familyNames over the legacy firstName/lastName fields when both are present', () => {
    const cases = [buildCase({
      patient: { mrn: '100005', givenNames: 'Jonathan Paul', familyNames: 'O\'Neil-Smith', firstName: 'Jon', lastName: 'Smith' },
    })];
    const result = resolveMockEmrPatientMatch(cases, '100005');
    expect(result?.patientName?.toUpperCase()).toContain('O\'NEIL-SMITH');
    expect(result?.patientName).toContain('Jonathan Paul');
  });

  it('a matched patient with no real name material honestly resolves patientName to null', () => {
    const cases = [buildCase({ patient: { mrn: '100006' } })];
    const result = resolveMockEmrPatientMatch(cases, '100006');
    expect(result?.patientName).toBeNull();
  });
});
