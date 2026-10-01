// src/services/reports/buildOruR01Payload.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../templates/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue({ template: { sections: [] } }),
}));
vi.mock('../reportTemplates/resolveFinalDiagnosisText', () => ({
  resolveFinalDiagnosisText: vi.fn(),
}));

import { caseRouter } from '../cases/CaseRouter';
import { resolveFinalDiagnosisText } from '../reportTemplates/resolveFinalDiagnosisText';
import { buildOruR01Payload } from './buildOruR01Payload';

function makeCase(overrides: any = {}) {
  return {
    id: 'CASE-1',
    reportingMode: 'orchestrator',
    patient: { mrn: 'MRN-1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1980-01-01' },
    synopticReports: [{ instanceId: 'INST-1', specimenId: 'SPEC-1', templateId: 'tpl-1', templateName: 'Template', status: 'finalized', answers: {} }],
    ...overrides,
  };
}

describe('buildOruR01Payload — abnormalFlags (PS-135, corrected scope: raw structured material only, no HL7 codes)', () => {
  it('carries real, structured abnormalFlags data for a case with a real, pathologist-confirmed status', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({
      abnormalDetectionStatus: { severity: 'Malignant', confirmedAt: '2026-09-02T10:00:00.000Z' },
    }) as any);

    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.abnormalFlags).toEqual({ severity: 'Malignant', confirmedAt: '2026-09-02T10:00:00.000Z' });
  });

  it('carries no abnormalFlags at all for a case with no confirmed status — genuinely absent, never a fabricated "normal" value', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);

    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.abnormalFlags).toBeUndefined();
  });

  it('carries no abnormalFlags for a case whose status is explicitly null (never yet confirmed)', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({ abnormalDetectionStatus: null }) as any);

    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.abnormalFlags).toBeUndefined();
  });

  it('never includes any HL7-specific code or table value — structured JSON only, same boundary as every other field in this payload', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({
      abnormalDetectionStatus: { severity: 'Critical', confirmedAt: '2026-09-02T10:00:00.000Z' },
    }) as any);

    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    // Real, direct check: only the two real, structured keys this
    // field is documented to carry — never a raw HL7 table 0078 code
    // like 'A'/'AA' sitting alongside or instead of the real severity.
    expect(Object.keys(payload?.abnormalFlags ?? {}).sort()).toEqual(['confirmedAt', 'severity']);
    expect(['Abnormal', 'Critical', 'Malignant']).toContain(payload?.abnormalFlags?.severity);
  });
});

describe('buildOruR01Payload — narrative.autopsySections, per direct follow-up ("wire in Autopsy")', () => {
  const fadSnapshot = { frozenPayload: { scope: 'Full', jurisdiction: 'US-AZ', sections: [{ id: 's1', label: 'Gross Findings', text: 'Real gross findings text.' }] } };
  const padSnapshot = { frozenPayload: { scope: 'Full', jurisdiction: 'US-AZ', sections: [{ id: 's1', label: 'Preliminary Findings', text: 'Real preliminary findings text.' }] } };

  it("a real FINAL dispatch for a real autopsy case reads FAD's own real, frozen sections", async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({ autopsy: { fadSnapshot } }) as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.narrative.autopsySections).toEqual([{ label: 'Gross Findings', text: 'Real gross findings text.' }]);
  });

  it("a real PRELIMINARY dispatch for a real autopsy case reads PAD's own real, frozen sections — never FAD's, even when both exist", async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({ autopsy: { padSnapshot, fadSnapshot } }) as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'PRELIMINARY');
    expect(payload?.narrative.autopsySections).toEqual([{ label: 'Preliminary Findings', text: 'Real preliminary findings text.' }]);
  });

  it('a real PRELIMINARY dispatch for a real autopsy case with no PAD signed yet has genuinely no sections — never falls back to FAD', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({ autopsy: { fadSnapshot } }) as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'PRELIMINARY');
    expect(payload?.narrative.autopsySections).toBeUndefined();
  });

  it('a real, non-autopsy case never has this field at all', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.narrative.autopsySections).toBeUndefined();
  });
});

describe('buildOruR01Payload — narrative.previouslyReportedAs, per direct correction ("the system shouldn\'t be constructing anything")', () => {
  it('a real CORRECTED dispatch carries the real, verbatim previouslyReportedAs text the caller supplied, unchanged', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'CORRECTED', undefined, undefined, 'Benign fibroadenoma.');
    expect(payload?.narrative.previouslyReportedAs).toBe('Benign fibroadenoma.');
  });

  it('a real CORRECTED dispatch with no previouslyReportedAs supplied at all carries none \u2014 never a fabricated placeholder', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'CORRECTED');
    expect(payload?.narrative.previouslyReportedAs).toBeUndefined();
  });

  it('a real FINAL dispatch never carries this field, even if a caller mistakenly supplied one \u2014 only a genuine correction ever replaces prior text', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL', undefined, undefined, 'Some prior text.');
    expect(payload?.narrative.previouslyReportedAs).toBeUndefined();
  });

  it('a real ADDENDUM dispatch never carries this field either \u2014 an addendum adds supplemental content, it never replaces prior text', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'ADDENDUM', undefined, undefined, 'Some prior text.');
    expect(payload?.narrative.previouslyReportedAs).toBeUndefined();
  });
});

describe('buildOruR01Payload — narrative.diagnosisComment, per direct correction ("a text field on the report should be declared as the final diagnosis")', () => {
  it('resolves diagnosisComment through the real, designated-field resolver \u2014 never instance.comment directly', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase() as any);
    vi.mocked(resolveFinalDiagnosisText).mockReset();
    vi.mocked(resolveFinalDiagnosisText).mockResolvedValue('Invasive ductal carcinoma.');
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(resolveFinalDiagnosisText).toHaveBeenCalledWith('tpl-1', {});
    expect(payload?.narrative.diagnosisComment).toBe('Invasive ductal carcinoma.');
  });

  it('a real instance.comment value present on the instance is never used, even when the real resolver finds nothing designated', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValueOnce(makeCase({
      synopticReports: [{ instanceId: 'INST-1', specimenId: 'SPEC-1', templateId: 'tpl-1', templateName: 'Template', status: 'finalized', answers: {}, comment: '<p>Some legacy comment text.</p>' }],
    }) as any);
    vi.mocked(resolveFinalDiagnosisText).mockReset();
    vi.mocked(resolveFinalDiagnosisText).mockResolvedValue(undefined);
    const payload = await buildOruR01Payload('CASE-1', 'INST-1', 'FINAL');
    expect(payload?.narrative.diagnosisComment).toBeUndefined();
  });
});
