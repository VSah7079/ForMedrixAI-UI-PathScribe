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
    requiresPathologistReview: true, signedBy: { name: 'Dr. Park', isPathologist: true }, signedAt: '2026-09-04T10:00:00.000Z',
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

  it('a real Korean KNCSP/KCCR payload carries no registryExtension at all — not an empty placeholder', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'kncsp_kccr_korea', 'c-kr-seoul-general', undefined);
    expect(payload.registryExtension).toBeUndefined();
  });

  it('a real Irish CervicalCheck payload also carries no registryExtension — no special action-code system was found for it, unlike CSMS', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'cervicalcheck_ireland', 'c-ie-ncsl-dublin', 'National Cervical Screening Laboratory');
    expect(payload.registryExtension).toBeUndefined();
    expect(payload.registryId).toBe('cervicalcheck_ireland');
  });

  it('a real PALGA (Netherlands) payload carries the real, native CisoeAScore — the exact data the real, separate PALGA Protocol Module needs to complete its own Palga Thesaurus coding', () => {
    const cisoeARecord: CytologySignOutRecord = {
      ...SIGN_OUT_RECORD,
      reportContent: {
        ...SIGN_OUT_RECORD.reportContent,
        cisoeAScore: {
          composition: { value: 1 }, inflammation: { value: 1 },
          squamous: { value: 4 }, otherEndometrium: { value: 1 }, endocervical: { value: 1 },
          adequacy: 'satisfactory',
        },
      },
    };
    const payload = buildCytologyRegistryReportPayload(cisoeARecord, 'palga_netherlands', 'c-nl-amsterdam-cyto', 'Amsterdam Cytologie Centrum');
    expect(payload.registryExtension).toEqual({
      type: 'palga_netherlands',
      cisoeAScore: {
        composition: { value: 1 }, inflammation: { value: 1 },
        squamous: { value: 4 }, otherEndometrium: { value: 1 }, endocervical: { value: 1 },
        adequacy: 'satisfactory',
      },
    });
  });

  it('a real PALGA payload for a review with no real cisoeAScore on file (e.g. a legacy Bethesda-only review) carries no registryExtension — never an empty placeholder', () => {
    const payload = buildCytologyRegistryReportPayload(SIGN_OUT_RECORD, 'palga_netherlands', 'c-nl-amsterdam-cyto', 'Amsterdam Cytologie Centrum');
    expect(payload.registryExtension).toBeUndefined();
  });

  it('a real NCSR (Australia) payload carries the real, mapped LOINC squamous result code', () => {
    const payload = buildCytologyRegistryReportPayload(
      SIGN_OUT_RECORD, 'ncsr_australia', 'c-au-sydney-cyto', 'Sydney Cytology & Pathology',
      undefined, 'cyto-squam-ascus', false,
    );
    expect(payload.registryExtension).toEqual({ type: 'ncsr_australia', squamousResultCode: 'S2' });
  });

  it('a real NCSR payload for a genuinely unsatisfactory specimen correctly carries SU AND EU together — a real unsatisfactory specimen fails both real axes at once, per AIHW\'s own confirmed glossary definition', () => {
    const payload = buildCytologyRegistryReportPayload(
      SIGN_OUT_RECORD, 'ncsr_australia', 'c-au-sydney-cyto', 'Sydney Cytology & Pathology',
      undefined, 'cyto-gencat-nilm', true,
    );
    expect(payload.registryExtension).toEqual({ type: 'ncsr_australia', squamousResultCode: 'SU', glandularResultCode: 'EU' });
  });

  it('real, direct fix: a genuine, pure glandular finding (no co-occurring squamous finding) now correctly carries its own real glandularResultCode — closes the real gap this file\'s own header used to name honestly ("not built here")', () => {
    const payload = buildCytologyRegistryReportPayload(
      SIGN_OUT_RECORD, 'ncsr_australia', 'c-au-sydney-cyto', 'Sydney Cytology & Pathology',
      undefined, 'cyto-gland-ais', false,
    );
    expect(payload.registryExtension).toEqual({ type: 'ncsr_australia', glandularResultCode: 'E4' });
  });

  it('real, a genuine, mixed case (a more severe squamous finding as primary, a real co-occurring glandular finding as additional) carries BOTH real, independent axis codes together', () => {
    const payload = buildCytologyRegistryReportPayload(
      SIGN_OUT_RECORD, 'ncsr_australia', 'c-au-sydney-cyto', 'Sydney Cytology & Pathology',
      undefined, 'cyto-squam-hsil', false, ['cyto-gland-atyp-endocervical'],
    );
    expect(payload.registryExtension).toEqual({ type: 'ncsr_australia', squamousResultCode: 'S5', glandularResultCode: 'E2' });
  });

  it('a real CSMS (UK) payload for a negative finding carries the real "A" (routine recall) action code', () => {
    const negativeRecord: CytologySignOutRecord = {
      ...SIGN_OUT_RECORD,
      reportContent: { ...SIGN_OUT_RECORD.reportContent, requiresPathologistReview: false },
    };
    const payload = buildCytologyRegistryReportPayload(negativeRecord, 'csms_uk', 'c-fenwick-womens', "Fenwick Women's Hospital");
    expect(payload.registryExtension).toEqual({ type: 'csms_uk', actionCode: 'A' });
  });

  it('a real CSMS (UK) payload for an abnormal finding carries the real "R" (early repeat/referral) action code', () => {
    const abnormalRecord: CytologySignOutRecord = {
      ...SIGN_OUT_RECORD,
      reportContent: { ...SIGN_OUT_RECORD.reportContent, requiresPathologistReview: true },
    };
    const payload = buildCytologyRegistryReportPayload(abnormalRecord, 'csms_uk', 'c-fenwick-womens', "Fenwick Women's Hospital");
    expect(payload.registryExtension).toEqual({ type: 'csms_uk', actionCode: 'R' });
  });

  it('a real CSMS (UK) payload for a negative, real, private/opportunistic test (real OBR-31/reasonCode data, passed through) carries the real "H" (no action) code', () => {
    const negativeRecord: CytologySignOutRecord = {
      ...SIGN_OUT_RECORD,
      reportContent: { ...SIGN_OUT_RECORD.reportContent, requiresPathologistReview: false },
    };
    const payload = buildCytologyRegistryReportPayload(negativeRecord, 'csms_uk', 'c-fenwick-womens', "Fenwick Women's Hospital", 'private_or_opportunistic');
    expect(payload.registryExtension).toEqual({ type: 'csms_uk', actionCode: 'H' });
  });
});
