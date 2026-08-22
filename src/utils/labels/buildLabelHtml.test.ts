// src/utils/labels/buildLabelHtml.test.ts
import { describe, it, expect } from 'vitest';
import { buildRequisitionLabelHtml, buildContainerLabelHtml } from './buildLabelHtml';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';
import type { RequisitionLabelData, ContainerLabelData } from '@/types/labels/LabelData';

const requisitionData: RequisitionLabelData = {
  fullAccession: 'DVMC26-0001',
  patientName: 'Maria Garcia',
  dateOfBirth: '1958-03-14T00:00:00.000Z',
  mrn: 'AUTO-0031',
  requestingProvider: 'Dr. Sarah Chen',
  submittingFacility: 'Metro General Hospital',
  printedAt: '2026-08-12T20:30:00.000Z',
};

const containerData: ContainerLabelData = {
  ...requisitionData,
  specimenLabel: 'A',
  specimenDesc: 'Skin punch biopsy',
};

const preset = getLabelSizePreset('clsi_standard_specimen')!;
const fullPagePreset = getLabelSizePreset('requisition_full_page_letter')!;

describe('buildRequisitionLabelHtml — real, self-contained HTML fragment', () => {
  it('includes the real accession number and every present field', () => {
    const html = buildRequisitionLabelHtml(requisitionData, fullPagePreset);
    expect(html).toContain('DVMC26-0001');
    expect(html).toContain('Maria Garcia');
    expect(html).toContain('AUTO-0031');
    expect(html).toContain('Dr. Sarah Chen');
    expect(html).toContain('Metro General Hospital');
  });

  it('includes a real, embedded barcode SVG', () => {
    const html = buildRequisitionLabelHtml(requisitionData, preset);
    expect(html).toContain('<svg');
  });

  it('uses the real preset dimensions in the inline style', () => {
    const html = buildRequisitionLabelHtml(requisitionData, preset);
    expect(html).toContain(`width:${preset.widthMm}mm`);
    expect(html).toContain(`height:${preset.heightMm}mm`);
  });

  it('omits a field row entirely when the underlying data is genuinely absent, rather than showing an empty value', () => {
    const noProvider: RequisitionLabelData = { ...requisitionData, requestingProvider: undefined };
    const html = buildRequisitionLabelHtml(noProvider, preset);
    expect(html).not.toContain('Provider');
  });

  it('escapes real HTML-significant characters in patient data, never lets them inject markup', () => {
    const withUnsafeName: RequisitionLabelData = { ...requisitionData, patientName: '<script>alert(1)</script>' };
    const html = buildRequisitionLabelHtml(withUnsafeName, preset);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildContainerLabelHtml — real specimen-level content', () => {
  it('includes the specimen label and description alongside patient data', () => {
    const html = buildContainerLabelHtml(containerData, preset);
    expect(html).toContain('A');
    expect(html).toContain('Skin punch biopsy');
    expect(html).toContain('Maria Garcia');
  });

  it('the visible accession includes the real specimen letter suffix', () => {
    const html = buildContainerLabelHtml(containerData, preset);
    expect(html).toContain('DVMC26-0001-A');
  });

  it('two specimens on the same case produce genuinely different label HTML', () => {
    const specimenB: ContainerLabelData = { ...containerData, specimenLabel: 'B', specimenDesc: 'Fingernail clipping' };
    const htmlA = buildContainerLabelHtml(containerData, preset);
    const htmlB = buildContainerLabelHtml(specimenB, preset);
    expect(htmlA).not.toBe(htmlB);
  });
});
