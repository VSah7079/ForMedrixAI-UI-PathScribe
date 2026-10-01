// src/types/labels/LabelData.test.ts
import { describe, it, expect } from 'vitest';
import { barcodePayloadForRequisition, barcodePayloadForContainer, cassetteIdentifier } from './LabelData';
import type { RequisitionLabelData, ContainerLabelData } from './LabelData';

const baseRequisition: RequisitionLabelData = {
  fullAccession: 'DVMC26-0001',
  patientName: 'Maria Garcia',
  dateOfBirth: '1958-03-14',
  mrn: 'AUTO-0031',
  submittingFacility: 'Metro General Hospital',
  printedAt: '2026-08-12T20:30:00.000Z',
};

describe('barcodePayloadForRequisition — real, deterministic barcode payload', () => {
  it('encodes just the real, human-facing accession number', () => {
    expect(barcodePayloadForRequisition(baseRequisition)).toBe('DVMC26-0001');
  });
});

describe('barcodePayloadForContainer — real "case + specimen letter" pattern, matching block/cassette IDs elsewhere', () => {
  it('encodes fullAccession joined with the specimen label', () => {
    const container: ContainerLabelData = { ...baseRequisition, specimenLabel: 'A', specimenDesc: 'Skin punch biopsy' };
    expect(barcodePayloadForContainer(container)).toBe('DVMC26-0001-A');
  });

  it('two different specimens on the same case produce genuinely distinct barcode payloads', () => {
    const a: ContainerLabelData = { ...baseRequisition, specimenLabel: 'A', specimenDesc: 'x' };
    const b: ContainerLabelData = { ...baseRequisition, specimenLabel: 'B', specimenDesc: 'y' };
    expect(barcodePayloadForContainer(a)).not.toBe(barcodePayloadForContainer(b));
  });
});

describe('cassetteIdentifier — real, human-facing cassette identifier, per direct follow-up on Step 4 (scan verification)', () => {
  it('joins accession, specimen label, and block label with no separator between specimen and block', () => {
    expect(cassetteIdentifier('DVMC26-0001', 'A', '1')).toBe('DVMC26-0001-A1');
  });

  it('two different blocks on the same specimen produce genuinely distinct cassette identifiers', () => {
    const first = cassetteIdentifier('DVMC26-0001', 'A', '1');
    const second = cassetteIdentifier('DVMC26-0001', 'A', '2');
    expect(first).not.toBe(second);
  });
});
