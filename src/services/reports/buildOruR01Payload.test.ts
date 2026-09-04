// src/services/reports/buildOruR01Payload.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../templates/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue({ template: { sections: [] } }),
}));

import { caseRouter } from '../cases/CaseRouter';
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
