// src/utils/labels/buildContainerLabelData.test.ts
import { describe, it, expect } from 'vitest';
import { buildContainerLabelData } from './buildContainerLabelData';
import type { Case } from '@/types/case/Case';

function makeCase(overrides: Record<string, unknown> = {}): Case {
  return {
    id: 'O26-0031',
    accession: { fullAccession: 'DVMC26-0001' },
    patient: {
      givenNames: 'Maria',
      familyNames: 'Garcia',
      dateOfBirth: '1958-03-14T00:00:00.000Z',
      mrn: 'AUTO-0031',
    },
    order: {
      requestingProvider: 'Dr. Sarah Chen',
      facilityName: 'Metro General Hospital',
    },
    ...overrides,
  } as unknown as Case;
}

const fixedNow = () => '2026-08-12T20:30:00.000Z';

describe('buildContainerLabelData — reuses buildRequisitionLabelData for shared fields, never duplicates the mapping', () => {
  it('carries every requisition field through unchanged', () => {
    const data = buildContainerLabelData(makeCase(), { label: 'A', description: 'Left breast core biopsy' }, fixedNow);
    expect(data.fullAccession).toBe('DVMC26-0001');
    expect(data.patientName).toBe('Maria Garcia');
    expect(data.mrn).toBe('AUTO-0031');
    expect(data.submittingFacility).toBe('Metro General Hospital');
  });

  it('adds the real specimen label and description', () => {
    const data = buildContainerLabelData(makeCase(), { label: 'B', description: 'Right axillary lymph node' }, fixedNow);
    expect(data.specimenLabel).toBe('B');
    expect(data.specimenDesc).toBe('Right axillary lymph node');
  });

  it('two different specimens on the same case produce correctly distinct container labels', () => {
    const caseData = makeCase();
    const labelA = buildContainerLabelData(caseData, { label: 'A', description: 'Skin punch biopsy' }, fixedNow);
    const labelB = buildContainerLabelData(caseData, { label: 'B', description: 'Fingernail clipping' }, fixedNow);
    expect(labelA.specimenLabel).toBe('A');
    expect(labelB.specimenLabel).toBe('B');
    expect(labelA.fullAccession).toBe(labelB.fullAccession); // same real case
  });
});
