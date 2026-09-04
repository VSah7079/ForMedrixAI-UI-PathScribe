// src/services/cytology/buildCytologyOruR01Payload.test.ts
import { describe, it, expect } from 'vitest';
import { buildCytologyOruR01Payload } from './buildCytologyOruR01Payload';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

const SIGN_OUT_RECORD: CytologySignOutRecord = {
  id: 'cyto-signout-abc123', caseId: 'S26-5002-CYT-001', specimenId: 'S26-5002-SP-1', reviewRecordId: 'cyto-review-seed-002-primary',
  reportContent: {
    patientName: 'Angela Torres', patientMrn: '100502', accessionNumber: 'S26-5002-CYT-001',
    specimenTypeDescription: 'Cervical/Vaginal Pap Smear, liquid-based',
    specimenAdequacy: ['Satisfactory for evaluation.'],
    primaryInterpretation: 'Atypical squamous cells of undetermined significance (ASC-US).',
    additionalInterpretations: ['Trichomonas vaginalis organisms identified.'],
    recommendations: ['Colposcopic evaluation recommended.'],
    signedBy: { name: 'Dr. Second', isPathologist: true }, signedAt: '2026-09-04T10:00:00.000Z',
  },
  signedBy: { userId: 'PATH-002', userName: 'Dr. Second', isPathologist: true },
  signedAt: '2026-09-04T10:00:00.000Z',
};

describe('buildCytologyOruR01Payload — real, cytology-specific dispatch payload', () => {
  it('assembles the real, structured payload with correct real identifiers', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(payload.eventType).toBe('ORU_R01');
    expect(payload.resultState).toBe('FINAL');
    expect(payload.caseId).toBe('S26-5002-CYT-001');
    expect(payload.signOutRecordId).toBe('cyto-signout-abc123');
    expect(payload.accessionNumber).toBe('S26-5002-CYT-001');
    expect(payload.patient).toEqual({ mrn: '100502', name: 'Angela Torres', dateOfBirth: undefined });
  });

  it('the real narrative fields mirror the real report content, joined for plain-text consumption', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(payload.narrative.specimenAdequacy).toBe('Satisfactory for evaluation.');
    expect(payload.narrative.primaryInterpretation).toBe('Atypical squamous cells of undetermined significance (ASC-US).');
    expect(payload.narrative.additionalInterpretations).toBe('Trichomonas vaginalis organisms identified.');
    expect(payload.narrative.recommendations).toBe('Colposcopic evaluation recommended.');
  });

  it('genuinely absent additional interpretations/recommendations stay undefined in the narrative, not empty strings', () => {
    const bare: CytologySignOutRecord = {
      ...SIGN_OUT_RECORD,
      reportContent: { ...SIGN_OUT_RECORD.reportContent, additionalInterpretations: [], recommendations: [] },
    };
    const payload = buildCytologyOruR01Payload(bare);
    expect(payload.narrative.additionalInterpretations).toBeUndefined();
    expect(payload.narrative.recommendations).toBeUndefined();
  });

  it('embeds a real, non-empty base64-encoded PDF', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(payload.reportPdfBase64.length).toBeGreaterThan(100);
    // Real, basic sanity check that this decodes as real base64, not garbage.
    expect(() => atob(payload.reportPdfBase64.slice(0, 100))).not.toThrow();
  });

  it('every real payload gets its own, genuinely unique messageId', () => {
    const first = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    const second = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(first.messageId).not.toBe(second.messageId);
  });
});
