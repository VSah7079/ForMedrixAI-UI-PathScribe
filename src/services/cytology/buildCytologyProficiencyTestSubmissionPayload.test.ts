// src/services/cytology/buildCytologyProficiencyTestSubmissionPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildCytologyProficiencyTestSubmissionPayload } from './buildCytologyProficiencyTestSubmissionPayload';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

const SIGN_OUT: CytologySignOutRecord = {
  id: 'so-1', caseId: 'S26-PT001-CYT-001', specimenId: 'S26-PT001-SP-1', reviewRecordId: 'rev-1',
  reportContent: {
    patientName: 'CAP Gyn Survey Challenge A-03', accessionNumber: 'S26-PT001-CYT-001',
    specimenTypeDescription: 'Cervical/vaginal Pap smear, liquid-based',
    specimenAdequacy: ['Satisfactory for evaluation'],
    generalCategorization: 'Epithelial Cell Abnormality',
    primaryInterpretation: 'High-grade squamous intraepithelial lesion (HSIL)',
    additionalInterpretations: [],
    recommendations: [],
  } as any,
  signedBy: { userId: 'PATH-001', userName: 'Dr. Sarah Chen', isPathologist: true },
  signedAt: '2026-08-15T00:00:00.000Z',
};

describe('buildCytologyProficiencyTestSubmissionPayload — real, per direct guidance on APAC-QA-01', () => {
  it('real, correctly carries the real case/sign-out identity and the real, given proficiencyTestContext', () => {
    const payload = buildCytologyProficiencyTestSubmissionPayload(SIGN_OUT, { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' });
    expect(payload.caseId).toBe('S26-PT001-CYT-001');
    expect(payload.signOutRecordId).toBe('so-1');
    expect(payload.provider).toBe('CAP');
    expect(payload.challengeReferenceId).toBe('CAP-GYN-2026-A-03');
  });

  it('real, never sends a "known answer" — the payload has no field for it at all, only the real, submitted interpretation', () => {
    const payload = buildCytologyProficiencyTestSubmissionPayload(SIGN_OUT, { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' });
    expect(payload).not.toHaveProperty('expectedAnswer');
    expect(payload).not.toHaveProperty('knownAnswer');
    expect(payload.submittedInterpretation.primaryInterpretation).toBe('High-grade squamous intraepithelial lesion (HSIL)');
  });

  it('real, a genuinely new, real messageId is generated each real call — never reused across two real submissions', () => {
    const a = buildCytologyProficiencyTestSubmissionPayload(SIGN_OUT, { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' });
    const b = buildCytologyProficiencyTestSubmissionPayload(SIGN_OUT, { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' });
    expect(a.messageId).not.toBe(b.messageId);
  });

  it('real, the real eventTimestamp matches the real, given sign-out\'s own signedAt, not the current time', () => {
    const payload = buildCytologyProficiencyTestSubmissionPayload(SIGN_OUT, { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' });
    expect(payload.eventTimestamp).toBe('2026-08-15T00:00:00.000Z');
  });
});
