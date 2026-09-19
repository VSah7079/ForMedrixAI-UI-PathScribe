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
    requiresPathologistReview: true, signedBy: { name: 'Dr. Second', isPathologist: true }, signedAt: '2026-09-04T10:00:00.000Z',
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

  it('a real Bethesda review (no cisoeAScore on the report content) carries no geographyExtension at all — not an empty placeholder', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(payload.geographyExtension).toBeUndefined();
  });

  it('a real CISOE-A review carries its own, real, native score as a geographyExtension, alongside the universal Bethesda-translated narrative — never instead of it', () => {
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
    const payload = buildCytologyOruR01Payload(cisoeARecord);
    expect(payload.geographyExtension).toEqual({
      type: 'cisoe_a',
      score: {
        composition: { value: 1 }, inflammation: { value: 1 },
        squamous: { value: 4 }, otherEndometrium: { value: 1 }, endocervical: { value: 1 },
        adequacy: 'satisfactory',
      },
    });
    // Real, deliberate: the universal, Bethesda-translated narrative is
    // still present and unchanged — the extension is additive, never a
    // replacement for what every other real destination already gets.
    expect(payload.narrative.primaryInterpretation).toBe('Atypical squamous cells of undetermined significance (ASC-US).');
  });
});

describe('buildCytologyOruR01Payload — resultState/previouslyReportedAs, per direct follow-up ("Cytology has no amendment mechanism at all")', () => {
  it('defaults to FINAL when no resultState is passed, preserving every existing real caller\u2019s behavior unchanged', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD);
    expect(payload.resultState).toBe('FINAL');
    expect(payload.narrative.previouslyReportedAs).toBeUndefined();
  });

  it('a real CORRECTED dispatch carries the real, verbatim previouslyReportedAs text the caller supplied', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'CORRECTED', 'Negative for intraepithelial lesion or malignancy (NILM).');
    expect(payload.resultState).toBe('CORRECTED');
    expect(payload.narrative.previouslyReportedAs).toBe('Negative for intraepithelial lesion or malignancy (NILM).');
  });

  it('a real CORRECTED dispatch with no previouslyReportedAs supplied carries none \u2014 never a fabricated placeholder', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'CORRECTED');
    expect(payload.narrative.previouslyReportedAs).toBeUndefined();
  });

  it('a real FINAL dispatch never carries this field, even if a caller mistakenly supplied one', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'FINAL', 'Some prior text.');
    expect(payload.narrative.previouslyReportedAs).toBeUndefined();
  });
});

describe('buildCytologyOruR01Payload — ADDENDUM support, per direct correction ("Cytology cases can have addendums")', () => {
  it('a real ADDENDUM dispatch carries the real, verbatim addendumText from the record\u2019s own report content', () => {
    const record = { ...SIGN_OUT_RECORD, reportContent: { ...SIGN_OUT_RECORD.reportContent, addendumText: 'HPV co-testing: positive for HPV 16.' } };
    const payload = buildCytologyOruR01Payload(record, 'ADDENDUM');
    expect(payload.resultState).toBe('ADDENDUM');
    expect(payload.narrative.addendumText).toBe('HPV co-testing: positive for HPV 16.');
  });

  it('a real ADDENDUM dispatch with no addendumText set on the record carries none \u2014 never a fabricated placeholder', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'ADDENDUM');
    expect(payload.narrative.addendumText).toBeUndefined();
  });

  it('a real ADDENDUM dispatch never carries previouslyReportedAs \u2014 an addendum leaves the original diagnosis intact, it never replaces it', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'ADDENDUM', 'Some prior text.');
    expect(payload.narrative.previouslyReportedAs).toBeUndefined();
  });

  it('a real CORRECTED dispatch never carries addendumText, even if the record happens to have one set', () => {
    const record = { ...SIGN_OUT_RECORD, reportContent: { ...SIGN_OUT_RECORD.reportContent, addendumText: 'Some addendum text.' } };
    const payload = buildCytologyOruR01Payload(record, 'CORRECTED');
    expect(payload.narrative.addendumText).toBeUndefined();
  });

  it('a real FINAL dispatch never carries addendumText either', () => {
    const record = { ...SIGN_OUT_RECORD, reportContent: { ...SIGN_OUT_RECORD.reportContent, addendumText: 'Some addendum text.' } };
    const payload = buildCytologyOruR01Payload(record, 'FINAL');
    expect(payload.narrative.addendumText).toBeUndefined();
  });

  it('an addendum\u2019s own primaryInterpretation is whatever the record\u2019s own report content says \u2014 this function never alters it, matching the real "leaves the original diagnosis intact" posture', () => {
    const payload = buildCytologyOruR01Payload(SIGN_OUT_RECORD, 'ADDENDUM');
    expect(payload.narrative.primaryInterpretation).toBe('Atypical squamous cells of undetermined significance (ASC-US).');
  });
});
