// src/services/labelDesigner/ILabelLayoutService.test.ts
import { describe, it, expect } from 'vitest';
import {
  LABEL_TYPES, LABEL_TYPE_DISPLAY_NAMES, LABEL_TYPE_DEFAULT_SIZE_MM, LABEL_FIELD_CATALOG,
  LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE, resolveLabelLayoutForFacility,
} from './ILabelLayoutService';
import type { LabelLayout } from './ILabelLayoutService';

describe('LABEL_TYPES and its own real, per-type catalogs — real, per direct follow-up (PS-245)', () => {
  it('every real label type has a real display name, default size, and field catalog — no real type left undefined', () => {
    for (const type of LABEL_TYPES) {
      expect(LABEL_TYPE_DISPLAY_NAMES[type]).toBeTruthy();
      expect(LABEL_TYPE_DEFAULT_SIZE_MM[type]).toBeDefined();
      expect(LABEL_TYPE_DEFAULT_SIZE_MM[type].widthMm).toBeGreaterThan(0);
      expect(LABEL_TYPE_DEFAULT_SIZE_MM[type].heightMm).toBeGreaterThan(0);
      expect(LABEL_FIELD_CATALOG[type]).toBeDefined();
      expect(LABEL_FIELD_CATALOG[type].length).toBeGreaterThan(0);
    }
  });

  it('real, every field catalog entry has a real, non-empty key and display name', () => {
    for (const type of LABEL_TYPES) {
      for (const field of LABEL_FIELD_CATALOG[type]) {
        expect(field.key.length).toBeGreaterThan(0);
        expect(field.displayName.length).toBeGreaterThan(0);
      }
    }
  });

  it('real, no field catalog offers a duplicate key for the same real label type', () => {
    for (const type of LABEL_TYPES) {
      const keys = LABEL_FIELD_CATALOG[type].map(f => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('real, confirmed directly against the actual label data shapes: slide has no real patientName field, and its own catalog correctly has none', () => {
    const slideKeys = LABEL_FIELD_CATALOG.slide.map(f => f.key);
    expect(slideKeys).not.toContain('patientName');
  });

  it('real, confirmed directly: requisition has no real specimenLabel field (that concept doesn\'t exist yet at requisition-print time), and its own catalog correctly has none', () => {
    const requisitionKeys = LABEL_FIELD_CATALOG.requisition.map(f => f.key);
    expect(requisitionKeys).not.toContain('specimenLabel');
  });
});

describe('LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE — real, per direct guidance\'s own explicit "Recommended Configuration Strategy by Label Group" table', () => {
  it('real, "Specimen & Processing" types (requisition/specimen/decant) genuinely allow a real facility override', () => {
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.requisition).toBe(true);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.specimen).toBe(true);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.decant).toBe(true);
  });

  it('real, "Histology Assets" (block/slide) are genuinely locked to the Enterprise default — no facility override, per direct guidance\'s own "disable local user edits"', () => {
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.block).toBe(false);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.slide).toBe(false);
  });

  it('real, every "Molecular Asset" type is genuinely locked to the Enterprise default — identical enterprise-wide, per direct guidance', () => {
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.molecular_specimen).toBe(false);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.molecular_plate).toBe(false);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.molecular_rack).toBe(false);
    expect(LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE.molecular_deck_location).toBe(false);
  });
});

describe('resolveLabelLayoutForFacility — real, per direct guidance: real Enterprise hierarchy and inheritance, mirroring resolveLisRoutingForFacility\'s own exact pattern', () => {
  const enterpriseDefault: LabelLayout = {
    id: 'l-1', labelType: 'requisition', widthMm: 101.6, heightMm: 152.4, fields: [], updatedAt: '2026-09-07T00:00:00.000Z',
  };
  const facilityOverride: LabelLayout = {
    id: 'l-2', labelType: 'requisition', facilityId: 'fac-1', widthMm: 101.6, heightMm: 152.4, fields: [], updatedAt: '2026-09-07T00:00:00.000Z',
  };

  it('real, no facilityId given correctly resolves to the real Enterprise default directly', () => {
    const result = resolveLabelLayoutForFacility('requisition', undefined, [enterpriseDefault, facilityOverride]);
    expect(result?.id).toBe('l-1');
  });

  it('real, a real facility with its own real, saved override on an allowed type correctly gets that override, not the Enterprise default', () => {
    const result = resolveLabelLayoutForFacility('requisition', 'fac-1', [enterpriseDefault, facilityOverride]);
    expect(result?.id).toBe('l-2');
  });

  it('real, a real facility with NO override of its own correctly falls back to the real Enterprise default', () => {
    const result = resolveLabelLayoutForFacility('requisition', 'fac-999', [enterpriseDefault, facilityOverride]);
    expect(result?.id).toBe('l-1');
  });

  it('real, direct correction: a real, locked label type (block) correctly ignores any facility override that might exist, always resolving to the Enterprise default — even if one was saved before a policy tightened', () => {
    const lockedDefault: LabelLayout = { id: 'l-3', labelType: 'block', widthMm: 25.4, heightMm: 12.7, fields: [], updatedAt: '2026-09-07T00:00:00.000Z' };
    const lockedOverrideThatShouldNeverApply: LabelLayout = { id: 'l-4', labelType: 'block', facilityId: 'fac-1', widthMm: 25.4, heightMm: 12.7, fields: [], updatedAt: '2026-09-07T00:00:00.000Z' };
    const result = resolveLabelLayoutForFacility('block', 'fac-1', [lockedDefault, lockedOverrideThatShouldNeverApply]);
    expect(result?.id).toBe('l-3');
  });

  it('real, honest undefined when neither an Enterprise default nor any real override has ever been configured', () => {
    const result = resolveLabelLayoutForFacility('slide', 'fac-1', []);
    expect(result).toBeUndefined();
  });
});
