// src/utils/labels/buildDecantContainerLabelData.test.ts
import { describe, it, expect } from 'vitest';
import { buildDecantContainerLabelData } from './buildDecantContainerLabelData';
import { barcodePayloadForDecantContainer } from '@/types/labels/LabelData';
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
      clientName: 'Metro General Hospital',
    },
    ...overrides,
  } as unknown as Case;
}

const fixedNow = () => '2026-08-12T20:30:00.000Z';

describe('buildDecantContainerLabelData — reuses buildRequisitionLabelData for shared fields, never duplicates the mapping', () => {
  it('carries every requisition field through unchanged', () => {
    const data = buildDecantContainerLabelData(makeCase(), 'B', 'Pleural fluid', { label: 'D1', decantType: 'cell_block' }, fixedNow);
    expect(data.fullAccession).toBe('DVMC26-0001');
    expect(data.patientName).toBe('Maria Garcia');
    expect(data.mrn).toBe('AUTO-0031');
    expect(data.submittingFacility).toBe('Metro General Hospital');
  });

  it('adds the real specimen label/description and decant label/type', () => {
    const data = buildDecantContainerLabelData(makeCase(), 'B', 'Pleural fluid', { label: 'D1', decantType: 'cell_block' }, fixedNow);
    expect(data.specimenLabel).toBe('B');
    expect(data.specimenDesc).toBe('Pleural fluid');
    expect(data.decantLabel).toBe('D1');
    expect(data.decantTypeLabel).toBe('Cell Block');
  });

  it('resolves the real, human-readable label for residual_fluid, not just cell_block', () => {
    const data = buildDecantContainerLabelData(makeCase(), 'B', 'Pleural fluid', { label: 'D2', decantType: 'residual_fluid' }, fixedNow);
    expect(data.decantTypeLabel).toBe('Residual Fluid');
  });

  it('two different decants on the same specimen produce correctly distinct labels', () => {
    const caseData = makeCase();
    const labelD1 = buildDecantContainerLabelData(caseData, 'B', 'Pleural fluid', { label: 'D1', decantType: 'cell_block' }, fixedNow);
    const labelD2 = buildDecantContainerLabelData(caseData, 'B', 'Pleural fluid', { label: 'D2', decantType: 'residual_fluid' }, fixedNow);
    expect(labelD1.decantLabel).toBe('D1');
    expect(labelD2.decantLabel).toBe('D2');
    expect(labelD1.fullAccession).toBe(labelD2.fullAccession); // same real case
  });
});

describe('barcodePayloadForDecantContainer — real, deterministic scheme matching resolveMaterialFromScan.ts\'s own decantIdentifier', () => {
  it('produces fullAccession + specimenLabel + decantLabel, matching this app\'s own decantIdentifier() scheme exactly', async () => {
    const data = buildDecantContainerLabelData(makeCase(), 'B', 'Pleural fluid', { label: 'D1', decantType: 'cell_block' }, fixedNow);
    const { decantIdentifier } = await import('@/types/labels/LabelData');
    expect(barcodePayloadForDecantContainer(data)).toBe(decantIdentifier('DVMC26-0001', 'B', 'D1'));
    expect(barcodePayloadForDecantContainer(data)).toBe('DVMC26-0001-BD1');
  });
});
