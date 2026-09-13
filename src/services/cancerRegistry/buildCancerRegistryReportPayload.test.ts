// src/services/cancerRegistry/buildCancerRegistryReportPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildCancerRegistryReportPayload } from './buildCancerRegistryReportPayload';
import type { Case } from '@/types/case/Case';

const baseCase = (over: Partial<Case>): Case => ({
  id: 'S26-1000',
  accession: { accessionNumber: 'S26-1000', fullAccession: 'S26-1000-A' },
  patient: { id: 'p1', mrn: 'MRN-100', firstName: 'Jane', lastName: 'Roe', dateOfBirth: '1980-01-01' },
  diagnostic: { primaryDiagnosis: 'Infiltrating ductal carcinoma, breast', issuedDate: '2026-09-01T00:00:00.000Z' },
  specimens: [],
  ...over,
} as unknown as Case);

describe('buildCancerRegistryReportPayload — real, per the RFP\'s own "structured JSON out" ask', () => {
  it('real, a genuine case with a real, specimen-level ICD-O code produces a correctly-shaped payload', () => {
    const caseData = baseCase({
      specimens: [{ id: 'sp1', coding: { icdO: [{ code: '8500/3', description: 'Infiltrating duct carcinoma NOS' }], icd10: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }] } }] as any,
    });
    const payload = buildCancerRegistryReportPayload(caseData, 'naaccr_us', 'fac-1', 'Fenwick General');
    expect(payload.registryId).toBe('naaccr_us');
    expect(payload.accessionNumber).toBe('S26-1000-A');
    expect(payload.patient.name).toBe('Jane Roe');
    expect(payload.icdOCodes).toHaveLength(1);
    expect(payload.icdOCodes[0].behaviorCode).toBe('3');
    expect(payload.icd10Codes).toEqual(['C50.911']);
  });

  it('real, a case with multiple specimens correctly aggregates ICD-O codes across all of them', () => {
    const caseData = baseCase({
      specimens: [
        { id: 'sp1', coding: { icdO: [{ code: '8500/3', description: 'Duct carcinoma' }] } },
        { id: 'sp2', coding: { icdO: [{ code: '8140/0', description: 'Adenoma, benign' }] } },
      ] as any,
    });
    const payload = buildCancerRegistryReportPayload(caseData, 'cpac_canada', 'fac-1', undefined);
    expect(payload.icdOCodes).toHaveLength(2);
  });

  it('real, a case with no specimens at all still produces a valid, honest payload with empty code arrays', () => {
    const caseData = baseCase({ specimens: [] });
    const payload = buildCancerRegistryReportPayload(caseData, 'aihw_australia', 'fac-1', undefined);
    expect(payload.icdOCodes).toEqual([]);
    expect(payload.icd10Codes).toEqual([]);
  });
});
