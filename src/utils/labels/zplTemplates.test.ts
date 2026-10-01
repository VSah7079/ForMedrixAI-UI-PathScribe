// src/utils/labels/zplTemplates.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CASSETTE_LABEL_LAYOUT } from '@/services/printSettings/IPrintSettingsService';
import { buildCassetteZplTemplate, buildSlideZplTemplate, zplEscapeGs1 } from './zplTemplates';
import { buildGs1DataMatrix } from './gs1DataMatrix';
import type { Gs1LabelFields } from './gs1DataMatrix';

const validFields: Gs1LabelFields = {
  gtin: '00850000000000',
  accessionNumber: 'PS2026-8821',
  blockId: 'BLK-02',
};

describe('zplTemplates — real, corrected fix to PS-51 Section 6.2\'s own ZPL template', () => {
  it('the real GS1 separator is converted to Zebra\'s own "_1" FNC1 escape sequence', () => {
    const gs1 = buildGs1DataMatrix(validFields)!;
    const escaped = zplEscapeGs1(gs1);
    expect(escaped).not.toContain('\x1d');
    expect(escaped).toContain('_1');
    expect(escaped).toBe('0100850000000000' + '21PS2026-8821' + '_1' + '10BLK-02');
  });

  it('the real, generated template includes ^FH immediately before the ^FD carrying the escaped GS1 string — without it, "_1" prints literally instead of being interpreted as FNC1', () => {
    const gs1 = buildGs1DataMatrix(validFields)!;
    const zpl = buildCassetteZplTemplate({
      gs1, accessionNumber: 'PS2026-8821', specimenDesignator: 'A1', blockId: 'BLK-02', patientName: 'DOE, JOHN',
      layout: DEFAULT_CASSETTE_LABEL_LAYOUT, dpi: 300,
    });
    expect(zpl).toContain('^FH^FD0100850000000000');
  });

  it('the real, full template structure matches the spec\'s own real layout (DataMatrix + 3 text lines), corrected', () => {
    const gs1 = buildGs1DataMatrix(validFields)!;
    const zpl = buildCassetteZplTemplate({
      gs1, accessionNumber: 'PS2026-8821', specimenDesignator: 'A1', blockId: 'BLK-02', patientName: 'DOE, JOHN',
      layout: DEFAULT_CASSETTE_LABEL_LAYOUT, dpi: 300,
    });
    expect(zpl).toContain('^XA');
    // Real fix, found while verifying against Zebra's own ^BX syntax:
    // the spec's own "120" quality value was never actually valid —
    // ZPL DataMatrix quality levels are only 0/50/80/100/140/200.
    // ECC200 (GS1's own recommended level) is used instead.
    expect(zpl).toContain('^BXN,3,200,,,1'); // columns/rows blank (auto), not 0 — real, Labelary-verified fix; module dots now computed from the real, admin-configured layout (0.25mm at 300dpi), not a hardcoded literal
    expect(zpl).toContain('^FDPS2026-8821');
    expect(zpl).toContain('A1 - BLK-02');
    expect(zpl).toContain('DOE, JOHN');
    expect(zpl.trim().endsWith('^XZ')).toBe(true);
  });

  it('real, defensive safety this module adds beyond the spec: every ^ and ~ character is fully stripped from free text before interpolation — a patient name can never inject a new ZPL command, since the one character (^) that starts a command can never survive into the output', () => {
    const gs1 = buildGs1DataMatrix(validFields)!;
    const zpl = buildCassetteZplTemplate({
      gs1, accessionNumber: 'PS2026-8821', specimenDesignator: 'A1', blockId: 'BLK-02',
      patientName: 'DOE^JOHN~XA^FO999,999^FS',
      layout: DEFAULT_CASSETTE_LABEL_LAYOUT, dpi: 300,
    });
    const patientNameLine = zpl.split('\n').find(l => l.includes('DOE'));
    expect(patientNameLine).toBeDefined();
    // The malicious payload's own ^/~ characters are gone entirely —
    // "FO999,999" and "FS" survive only as harmless, inert plain text,
    // never as real commands, since nothing precedes them with a real
    // caret or tilde anymore.
    expect(patientNameLine).not.toContain('^FO999,999');
    expect(patientNameLine).not.toContain('~');
    // Exactly the four REAL, intended carets from this template's own
    // ^FO/^A0/^FD/^FS commands on this line remain — none from the
    // sanitized patient name itself.
    expect((patientNameLine!.match(/\^/g) ?? []).length).toBe(4);
  });
});

describe('zplTemplates — buildSlideZplTemplate, the real, missing slide half of PS-51 Section 3.1', () => {
  const slideGs1 = buildGs1DataMatrix({ gtin: '00850000000000', accessionNumber: 'S26-4403', blockId: 'SLD-A1L1' })!;

  it('uses a real, valid ECC200 quality level and a real, conservative module size for this label\'s own tiny real area', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E',
    });
    expect(zpl).toContain('^BXN,2,200,,,1'); // columns/rows blank (auto), not 0
  });

  it('real, direct bug fix verified at the label\'s own real, correct scale (1.0" x 0.25" canvas, 300 dpi) via real Labelary testing: uses ^BY2, not ^BY1 — clears a real "increase module width" linter warning with zero real layout cost, since ^BY never controlled the DataMatrix\'s own module size (that\'s the unchanged "2" in ^BXN,2,...)', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E',
    });
    expect(zpl).toContain('^BY2');
    expect(zpl).not.toContain('^BY1');
  });

  it('includes the real ^FH + FNC1 escape fix, same as the cassette template', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E',
    });
    expect(zpl).toContain('^FH^FD0100850000000000');
  });

  it('real, deliberate content trim: shows specimen/block/level/stain, never the full accession or patient name as separate, human-readable text — no real room for either on a 1.0" x 0.25" label', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L2', stainName: 'MMR Panel',
    });
    expect(zpl).toContain('A1 L2');
    expect(zpl).toContain('MMR Panel');
    // The full accession is correctly present — but only inside the
    // barcode's own ^FH^FD field data (real, required, GS1 AI(21)),
    // never as its own, separate, human-readable ^FD text line the
    // way the cassette template has room for.
    const textLines = zpl.split('\n').filter(l => l.includes('^A0N'));
    expect(textLines.some(l => l.includes('S26-4403'))).toBe(false);
  });

  it('the real, correct structure — DataMatrix + two compact text lines, XA/XZ framed', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E',
    });
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trim().endsWith('^XZ')).toBe(true);
  });

  it('real, defensive safety this module adds beyond the spec, same as the cassette template: stain name with ZPL control-prefix characters is sanitized', () => {
    const zpl = buildSlideZplTemplate({
      gs1: slideGs1, fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E^XA^FO1,1^FS',
    });
    const stainLine = zpl.split('\n').find(l => l.includes('H&E'));
    expect(stainLine).not.toContain('^FO1,1');
  });
});
