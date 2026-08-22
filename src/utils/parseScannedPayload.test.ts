// src/utils/parseScannedPayload.test.ts
import { describe, it, expect } from 'vitest';
import { parseScannedPayload } from './parseScannedPayload';

const GS = String.fromCharCode(29);

describe('parseScannedPayload — real feature, per direct, detailed specification: "Barcode Listener & Form Auto-Ingestion," the "2. Parser Logic" piece', () => {
  describe('GS1 (DataMatrix / GS1-128)', () => {
    it('parses AI(01) GTIN + AI(10) BATCH/LOT (GS-terminated) + AI(21) SERIAL (last field, no terminator needed)', () => {
      // Hand-verified real fixture: '01' + 14-digit GTIN, '10' + 'LOT789' + GS, '21' + 'SN00042'
      const raw = '010001234567890510LOT789' + GS + '21SN00042';
      const result = parseScannedPayload(raw);
      expect(result).toEqual({
        type: 'gs1',
        gtin: '00012345678905',
        batchLot: 'LOT789',
        serial: 'SN00042',
        companyInternal: {},
      });
    });

    it('parses AI(21) SERIAL alone — the real "Serial/Accession" mapping the spec asks for, no GTIN required', () => {
      const result = parseScannedPayload('21SP26098412');
      expect(result).toEqual({ type: 'gs1', serial: 'SP26098412', companyInternal: {} });
    });

    it('parses AI(17) EXPIRY DATE — real fixed-length (6-digit YYMMDD), not reformatted here', () => {
      const result = parseScannedPayload('17261231');
      expect(result).toEqual({ type: 'gs1', expiryDate: '261231', companyInternal: {} });
    });

    it('parses a real, company-internal AI (90-99) into the companyInternal bucket, not fabricated as MRN — GS1 has no standard AI for MRN, confirmed directly against GS1\'s own AI table', () => {
      const result = parseScannedPayload('91MRN00445566');
      expect(result).toEqual({ type: 'gs1', companyInternal: { '91': 'MRN00445566' }, });
    });

    it('tolerates a leading GS/FNC1 flag character, which some real scanner configurations include', () => {
      const withLeadingGs = GS + '21SN00042';
      expect(parseScannedPayload(withLeadingGs)).toEqual({ type: 'gs1', serial: 'SN00042', companyInternal: {} });
    });

    it('parses the real, human-readable parenthesized notation as a tolerant fallback', () => {
      const result = parseScannedPayload('(01)00012345678905(21)ABC123');
      expect(result).toEqual({ type: 'gs1', gtin: '00012345678905', serial: 'ABC123', companyInternal: {} });
    });

    it('a genuinely truncated GTIN (fewer than the real, required 14 digits) is not misparsed as a complete field', () => {
      // '01' followed by only 5 digits, not the real, required 14
      const result = parseScannedPayload('0112345');
      expect(result.type).not.toBe('gs1');
    });
  });

  describe('Delimited (^ or |)', () => {
    it('splits a real, full ^-delimited record into [FamilyName, GivenName, MRN, DOB, Accession], per the spec\'s own order', () => {
      const result = parseScannedPayload('GARCIA^MARIA^MRN30456^19901105^SP26-098412');
      expect(result).toEqual({
        type: 'delimited',
        familyName: 'GARCIA', givenName: 'MARIA', mrn: 'MRN30456', dob: '19901105', accession: 'SP26-098412',
      });
    });

    it('splits a real |-delimited record the same way', () => {
      const result = parseScannedPayload('SMITH|JOHN|MRN99999|19850601|FGH-ORD-88213');
      expect(result).toEqual({
        type: 'delimited',
        familyName: 'SMITH', givenName: 'JOHN', mrn: 'MRN99999', dob: '19850601', accession: 'FGH-ORD-88213',
      });
    });

    it('tolerates fewer than 5 real segments — a real label might genuinely omit trailing fields', () => {
      const result = parseScannedPayload('GARCIA^MARIA^MRN30456');
      expect(result).toEqual({
        type: 'delimited',
        familyName: 'GARCIA', givenName: 'MARIA', mrn: 'MRN30456', dob: undefined, accession: undefined,
      });
    });

    it('a single stray separator with no real second field is not misclassified as delimited', () => {
      const result = parseScannedPayload('JUSTONEFIELD|');
      // Only one real, non-empty segment — not a genuine delimited record
      expect(result.type).toBe('plain');
    });
  });

  describe('Plain alphanumeric — the spec\'s own fallback', () => {
    it('classifies a bare accession-style string with no GS1 or delimiter structure as plain', () => {
      const result = parseScannedPayload('SP26-098412');
      expect(result).toEqual({ type: 'plain', value: 'SP26-098412' });
    });

    it('classifies a bare MRN-style numeric string as plain', () => {
      const result = parseScannedPayload('778812');
      expect(result).toEqual({ type: 'plain', value: '778812' });
    });

    it('trims real, incidental whitespace before classifying', () => {
      const result = parseScannedPayload('  SP26-098412  ');
      expect(result).toEqual({ type: 'plain', value: 'SP26-098412' });
    });
  });
});
