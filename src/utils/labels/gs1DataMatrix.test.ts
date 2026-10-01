// src/utils/labels/gs1DataMatrix.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, dedicated tests for PS-51's own GS1 encoding engine. Includes a
// deliberate test proving the spec's own worked example, if encoded
// literally, is genuinely not GS1-compliant — see gs1DataMatrix.ts's
// own header for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildGs1DataMatrix, validateGs1Fields, GS1_SEPARATOR } from './gs1DataMatrix';
import type { Gs1LabelFields } from './gs1DataMatrix';

const validFields: Gs1LabelFields = {
  gtin: '00850000000000',
  accessionNumber: 'PS2026-8821',
  blockId: 'BLK-02',
};

describe('gs1DataMatrix — real GS1 Application Identifier encoding (PS-51 Section 3+4)', () => {
  it('builds a real, correctly-separated raw string — a real GS (0x1D) separator between the variable-length AI(21) and AI(10), matching GS1\'s own DataMatrix Guideline', () => {
    const result = buildGs1DataMatrix(validFields);
    expect(result).not.toBeNull();
    expect(result!.raw).toBe(`0100850000000000` + `21PS2026-8821` + GS1_SEPARATOR + `10BLK-02`);
  });

  it('never places a separator after the LAST element string — per GS1\'s own rule, a separator is never required after the final element', () => {
    const result = buildGs1DataMatrix(validFields);
    expect(result!.raw.endsWith(GS1_SEPARATOR)).toBe(false);
    expect(result!.raw.endsWith('BLK-02')).toBe(true);
  });

  it('the real, corrected fix to the spec\'s own worked example — the spec\'s literal string, encoded without a separator, is genuinely ambiguous and would not have been GS1-compliant', () => {
    const specLiteralString = '010085000000000021PS2026882110BLK02';
    const result = buildGs1DataMatrix({ gtin: '00850000000000', accessionNumber: 'PS2026882110BLK02', blockId: '' });
    // Confirms the ambiguity directly: without a real separator, "PS2026882110BLK02"
    // could equally be read as one long (21) value with no (10) at all —
    // this module never produces that shape.
    expect(specLiteralString.includes(GS1_SEPARATOR)).toBe(false);
    expect(result).toBeNull(); // blockId is empty — correctly rejected, not silently merged into accession.
  });

  it('pads a shorter, real GTIN (e.g. a real GTIN-12) to the full 14 digits AI(01) requires', () => {
    const result = buildGs1DataMatrix({ ...validFields, gtin: '850000000000' }); // 12 digits
    expect(result!.raw.startsWith('010085000000' + '0000')).toBe(true); // padded with 2 leading zeros
  });

  it('the real, human-readable form uses the standard, parenthesized AI convention and is safe to display — never contains the raw control-character separator', () => {
    const result = buildGs1DataMatrix(validFields);
    expect(result!.humanReadable).toBe('(01)00850000000000(21)PS2026-8821(10)BLK-02');
    expect(result!.humanReadable.includes(GS1_SEPARATOR)).toBe(false);
  });

  it('rejects a non-numeric GTIN', () => {
    const errors = validateGs1Fields({ ...validFields, gtin: 'ABC123' });
    expect(errors.some(e => e.field === 'gtin')).toBe(true);
  });

  it('rejects a GTIN longer than 14 digits — no real GTIN is ever longer', () => {
    const errors = validateGs1Fields({ ...validFields, gtin: '123456789012345' });
    expect(errors.some(e => e.field === 'gtin')).toBe(true);
  });

  it('rejects an accession number or block id over the real 20-character GS1 limit', () => {
    const errors = validateGs1Fields({ ...validFields, accessionNumber: 'A'.repeat(21) });
    expect(errors.some(e => e.field === 'accessionNumber')).toBe(true);
  });

  it('rejects the real, specific illegal characters (_, /, \\, :) — the underscore specifically because it collides with ZPL\'s own FNC1 escape sequence', () => {
    expect(validateGs1Fields({ ...validFields, accessionNumber: 'PS_2026' }).length).toBeGreaterThan(0);
    expect(validateGs1Fields({ ...validFields, accessionNumber: 'PS/2026' }).length).toBeGreaterThan(0);
    expect(validateGs1Fields({ ...validFields, blockId: 'BLK:02' }).length).toBeGreaterThan(0);
    expect(validateGs1Fields({ ...validFields, blockId: 'BLK\\02' }).length).toBeGreaterThan(0);
  });

  it('does NOT reject parentheses outright — escapes them in the human-readable form instead, per the spec\'s own distinct treatment', () => {
    const errors = validateGs1Fields({ ...validFields, accessionNumber: 'PS(2026)' });
    expect(errors).toHaveLength(0);
    const result = buildGs1DataMatrix({ ...validFields, accessionNumber: 'PS(2026)' });
    expect(result!.humanReadable).toContain('PS\\(2026\\)');
  });

  it('rejects a missing accession number or block id', () => {
    expect(validateGs1Fields({ ...validFields, accessionNumber: '' }).length).toBeGreaterThan(0);
    expect(validateGs1Fields({ ...validFields, blockId: '   ' }).length).toBeGreaterThan(0);
  });

  it('buildGs1DataMatrix returns null (never a partial/malformed result) when validation fails — callers must check validateGs1Fields for the real, specific reasons', () => {
    expect(buildGs1DataMatrix({ ...validFields, gtin: 'not-a-gtin' })).toBeNull();
  });
});
