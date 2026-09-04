// src/services/cytology/buildCytologyRegistryReportPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildCytologyRegistryReportPayload } from './buildCytologyRegistryReportPayload';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

const SIGN_OUT_RECORD: CytologySignOutRecord = {
  id: 'cyto-signout-kr001', caseId: 'S26-7001-CYT-001', specimenId: 'S26-7001-SP-1', reviewRecordId: 'cyto-review-kr001-primary',
  reportContent: {
    patientName: 'Ji-woo Kim', patientMrn: '300701', accessionNumber: 'S26-7001-CYT-001',
    specimenTypeDescription: 'Cervical/Vaginal Pap Smear, liquid-based', specimenCollectedAt: '2026-09-01T00:00:00.000Z',
    specimenAdequacy: ['Satisfactory for evaluation.'],
    primaryInterpretation: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
    additionalInterpretations: [], recommendations: ['Repeat cytology in 12 months.'],
    hpvResult: 'Negative',
    signedBy: { name: 'Dr. Park', isPathologist: true }, signedAt: '2026-09-04T10:00:00.000Z',
  },
  signedBy: { userId: 'PATH-KR-001', userName: 'Dr. Park', isPathologist: true },
  signedAt: '2026-09-04T10:00:00.000Z',
};

describe('buildCytologyRegistryReportPayload — real, generic centralized-registry payload', () => {
  it('assembles the real, structured payload with the correct real registry and facility identifiers', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', 'Seoul General Screening Center');
    expect(payload.registryId).toBe('kncsp_kccr_korea');
    expect(payload.facilityId).toBe('c-kr-seoul-general');
    expect(payload.facilityName).toBe('Seoul General Screening Center');
    expect(payload.accessionNumber).toBe('S26-7001-CYT-001');
  });

  it('the real patient block uses MRN as the real, available identifier — the honest gap this file\'s own header documents', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', undefined);
    expect(payload.patient).toEqual({ mrn: '300701', name: 'Ji-woo Kim', dateOfBirth: undefined });
  });

  it('the real screening result content mirrors the real report content faithfully', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', undefined);
    expect(payload.specimenAdequacy).toEqual(['Satisfactory for evaluation.']);
    expect(payload.primaryInterpretation).toBe('Negative for Intraepithelial Lesion or Malignancy (NILM).');
    expect(payload.hpvResult).toBe('Negative');
    expect(payload.recommendations).toEqual(['Repeat cytology in 12 months.']);
  });

  it('every real payload gets its own, genuinely unique messageId', () => {
    const first = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', undefined);
    const second = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', undefined);
    expect(first.messageId).not.toBe(second.messageId);
  });
});
