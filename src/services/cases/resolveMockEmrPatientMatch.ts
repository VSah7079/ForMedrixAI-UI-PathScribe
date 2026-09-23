// src/services/cases/resolveMockEmrPatientMatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// File-by-file cleanup sweep: pulls MockEMRPage.tsx's own patient-lookup and
// name/DOB derivation out of the page component into a plain, testable
// function. Per the real fix this page already carries (a wrong patient is
// worse than showing nothing): an unmatched patientId, or a matched patient
// missing a real display name, honestly resolves to null — never a fabricated
// or leftover guess. Gender is returned as the real, raw Patient.sex code,
// not a hardcoded English label — the page translates it via useTranslation().
// ─────────────────────────────────────────────────────────────────────────────
import type { Case } from '@/types/case/Case';
import { fromLegacyName, formatIdentificationName } from '@/utils/personName';

export interface MockEmrPatientMatch {
  patientName: string | null;
  dob: string | null;
  sex: 'M' | 'F' | 'U' | undefined;
}

export function resolveMockEmrPatientMatch(cases: Case[], patientId: string): MockEmrPatientMatch | null {
  if (!patientId) return null;
  const match = cases.find(c => c?.patient?.mrn === patientId);
  if (!match?.patient) return null;

  const p = match.patient;
  const name = p.givenNames && p.familyNames
    ? formatIdentificationName({ givenNames: p.givenNames, familyNames: p.familyNames })
    : formatIdentificationName(fromLegacyName(p.firstName ?? '', p.lastName ?? ''));

  return {
    patientName: name || null,
    dob: p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-GB') : null,
    sex: p.sex,
  };
}
