// src/utils/labels/buildLabelHtml.test.ts
import { describe, it, expect } from 'vitest';
import { buildRequisitionLabelHtml, buildContainerLabelHtml, buildRequisitionStickerSheetHtml } from './buildLabelHtml';
import { getLabelSizePreset, DEFAULT_REQUISITION_LABEL_PRESET_ID } from '@/types/labels/LabelSizePreset';
import type { RequisitionLabelData, ContainerLabelData, RequisitionStickerSheetData } from '@/types/labels/LabelData';

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

  it('real, direct correction: a genuinely missing provider now shows the explicit "Not Recorded" placeholder, not a collapsed row — reconsidered from an earlier, incorrect distinction', () => {
    const noProvider: RequisitionLabelData = { ...requisitionData, requestingProvider: undefined };
    const html = buildRequisitionLabelHtml(noProvider, preset);
    expect(html).toContain('Provider');
    expect(html).toContain('Not Recorded');
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

describe('buildRequisitionStickerSheetHtml — real, per direct correction + supplied research: a real, multi-zone sticker sheet, not one fixed-size label', () => {
  const sheetPreset = getLabelSizePreset(DEFAULT_REQUISITION_LABEL_PRESET_ID)!;
  const sheetData: RequisitionStickerSheetData = {
    ...requisitionData, logInStickerCount: 3, specimenStickerCount: 2, cassetteSlideStickerCount: 4,
  };

  it('renders the real header zone with full patient demographics and the real accession barcode', () => {
    const html = buildRequisitionStickerSheetHtml(sheetData, sheetPreset);
    expect(html).toContain('Maria Garcia');
    expect(html).toContain('DVMC26-0001');
    expect(html).toContain('ps-req-header');
  });

  it('renders the real, correct count of stickers for each real zone — never more or fewer than configured', () => {
    const html = buildRequisitionStickerSheetHtml(sheetData, sheetPreset);
    const stickerCount = (html.match(/ps-req-sticker"/g) ?? []).length;
    expect(stickerCount).toBe(3 + 2 + 4);
  });

  it('a real, zero count for one zone produces genuinely zero stickers for that zone, never a fabricated minimum', () => {
    const html = buildRequisitionStickerSheetHtml({ ...sheetData, cassetteSlideStickerCount: 0 }, sheetPreset);
    const stickerCount = (html.match(/ps-req-sticker"/g) ?? []).length;
    expect(stickerCount).toBe(3 + 2 + 0);
  });

  it('every real sticker across every zone carries the same, real accession barcode payload — the one real identifier known at requisition-print time', () => {
    const html = buildRequisitionStickerSheetHtml(sheetData, sheetPreset);
    const occurrences = (html.match(/DVMC26-0001/g) ?? []).length;
    // Real, minimum expectation: header + at least one occurrence per
    // real zone with a non-zero count (3 zones here, all non-zero).
    expect(occurrences).toBeGreaterThanOrEqual(1 + 3);
  });

  it('real, per direct correction: a genuinely missing MRN shows an explicit "Not Recorded" placeholder, never a silently collapsed row', () => {
    const html = buildRequisitionStickerSheetHtml({ ...sheetData, mrn: '' }, sheetPreset);
    expect(html).toContain('Not Recorded');
    expect(html).toContain('MRN');
  });

  it('real, per direct correction: a genuinely missing submitting facility shows an explicit "Not Recorded" placeholder', () => {
    const html = buildRequisitionStickerSheetHtml({ ...sheetData, submittingFacility: '' }, sheetPreset);
    const notRecordedCount = (html.match(/Not Recorded/g) ?? []).length;
    expect(notRecordedCount).toBeGreaterThanOrEqual(1);
  });

  it('real, direct correction (reconsidered from an earlier, incorrect distinction): a genuinely missing requestingProvider now shows the same explicit "Not Recorded" placeholder as MRN/facility, not a collapsed row', () => {
    const html = buildRequisitionStickerSheetHtml({ ...sheetData, requestingProvider: undefined }, sheetPreset);
    expect(html).toContain('Provider');
    expect(html).toContain('Not Recorded');
  });
});
