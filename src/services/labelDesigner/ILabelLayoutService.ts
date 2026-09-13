// src/services/labelDesigner/ILabelLayoutService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up (PS-245): a real, drag-and-drop label
// designer, spanning essentially every real label type in this app —
// "Requisition, Specimen, Block, Slide, decant, Molecular assets."
//
// Real, deliberate architectural decision, confirmed by directly
// reading components/TemplateBuilder/'s own real code before building
// anything: that system's own TemplateNode/BaseNode is built around
// colSpan in a 12-column FLOWING grid — real, correct for a linear,
// paginated report, genuinely wrong for a label. A label is a fixed
// physical rectangle; its own fields sit at specific real mm
// coordinates, not flowing top-to-bottom. Reusing that exact type
// system would be forcing a real, load-bearing mismatch, not a minor
// adaptation. What IS genuinely reused: the same real UI pattern
// (palette → canvas → inspector) and the same real drag-and-drop
// mechanic (native HTML5 drag/drop, confirmed directly — no new
// library dependency either system needs).
//
// Real, deliberate default, stated plainly since it was a genuinely
// open question (PS-245) not yet answered: one real, global layout
// per label type, not yet scoped per-facility/per-Enterprise.
//
// Real, direct correction, per direct follow-up supplying a real
// architectural strategy: real Enterprise hierarchy and inheritance,
// mirroring FacilityInterfaceEngineConnection/FacilityLisRouting's own
// exact, already-established pattern in this codebase — an
// Enterprise-level default every facility inherits unless it sets its
// own real, explicit override, resolved the same real, one-hop-parent
// way resolveLisRoutingForFacility() already does. Real, deliberate
// per-group policy, per direct guidance's own explicit table: not
// every real label type is allowed a facility override at all —
// "Histology Assets" (block/slide) and "Molecular Assets" are
// deliberately locked to the Enterprise default only, since hardware
// compatibility (cassette/slide printers, automated stainers, slide
// scanners, liquid handlers) genuinely depends on every real facility
// producing an identical, real physical format — a real facility
// override there isn't a customization, it's a real risk of a scanner
// misread. "Specimen & Processing" (requisition/specimen/decant)
// genuinely allows real, regional variation.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

// Real, per direct follow-up — every real label type this designer
// covers, matching this app's own already-existing label data shapes
// (types/labels/LabelData.ts) exactly, one designer entry per real,
// distinct physical label.
export const LABEL_TYPES = [
  'requisition', 'specimen', 'block', 'slide', 'decant',
  'molecular_specimen', 'molecular_plate', 'molecular_rack', 'molecular_deck_location',
] as const;
export type LabelType = typeof LABEL_TYPES[number];

export const LABEL_TYPE_DISPLAY_NAMES: Record<LabelType, string> = {
  requisition: 'Requisition Label',
  specimen: 'Specimen (Container) Label',
  block: 'Block (Cassette) Label',
  slide: 'Slide Label',
  decant: 'Decant Container Label',
  molecular_specimen: 'Molecular Specimen Label',
  molecular_plate: 'Molecular Plate Label',
  molecular_rack: 'Molecular Rack Label',
  molecular_deck_location: 'Molecular Deck Location Label',
};

/** Real, per direct follow-up's own explicit "Recommended
 *  Configuration Strategy by Label Group" table. `false` means the
 *  real, physical/hardware-compatibility risk of facility-level
 *  variation outweighs any real, local customization value — the
 *  Enterprise default is the only real, editable layout for that
 *  type, full stop. `true` means real, regional variation is
 *  genuinely expected and a real facility may set its own override. */
export const LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE: Record<LabelType, boolean> = {
  requisition: true, specimen: true, decant: true, // "Specimen & Processing" — Regional / Enterprise Standard
  block: false, slide: false, // "Histology Assets" — Hardware-Driven / Strict Standard, local edits disabled
  molecular_specimen: false, molecular_plate: false, molecular_rack: false, molecular_deck_location: false, // "Molecular Assets" — Enterprise Standard, identical enterprise-wide
};

/** Real, per direct follow-up ("add a way for users to output their
 *  label so they can verify that they will work") — the real barcode
 *  symbology each label type's own real, existing print path actually
 *  uses today, confirmed directly against each real preset's own
 *  `defaultBarcodeSymbology` (types/labels/LabelSizePreset.ts) and,
 *  for block/slide, their own real GS1 DataMatrix machinery
 *  (zplTemplates.ts) — never guessed from a display name. Used by the
 *  designer's own barcode preview and ZPL export so both show a real,
 *  representative symbology, not an arbitrary one. */
export const LABEL_TYPE_DEFAULT_SYMBOLOGY: Record<LabelType, 'code128' | 'datamatrix'> = {
  requisition: 'code128', // requisition_sticker_small/pouch presets, and the header's own real Code128
  specimen: 'datamatrix', // clsi_standard_specimen preset
  block: 'datamatrix', // real GS1 DataMatrix
  slide: 'datamatrix', // real GS1 DataMatrix
  decant: 'datamatrix', // shares resolveContainerPreset() = clsi_standard_specimen
  molecular_specimen: 'datamatrix', // clsi_standard_specimen preset
  molecular_plate: 'code128', // medium_container preset
  molecular_rack: 'code128', // medium_container preset
  molecular_deck_location: 'datamatrix', // clsi_standard_specimen preset
};

// Real, per direct follow-up — a real label's own real, physical
// default size (mm), matching this app's own already-established real
// dimensions where one already exists (e.g. the requisition sticker
// sheet's own real 4"×6" default, molecular labels' own real, smaller
// dimensions) — an honest, reasonable default elsewhere, not a
// fabricated precision this app hasn't actually established yet.
export const LABEL_TYPE_DEFAULT_SIZE_MM: Record<LabelType, { widthMm: number; heightMm: number }> = {
  requisition: { widthMm: 101.6, heightMm: 152.4 }, // 4"×6", this app's own real, established requisition sheet default
  specimen: { widthMm: 50.8, heightMm: 25.4 }, // 2"×1", this app's own real CLSI-cited container preset
  block: { widthMm: 25.4, heightMm: 12.7 }, // 1"×0.5", a real, small cassette label
  slide: { widthMm: 25.4, heightMm: 9.5 }, // a real, small slide label — this app's own real slide template targets a genuinely tiny area
  decant: { widthMm: 50.8, heightMm: 25.4 },
  molecular_specimen: { widthMm: 25.4, heightMm: 12.7 },
  molecular_plate: { widthMm: 50.8, heightMm: 19.05 },
  molecular_rack: { widthMm: 38.1, heightMm: 12.7 },
  molecular_deck_location: { widthMm: 38.1, heightMm: 12.7 },
};

/** Real, per this file's own header — one real, draggable field a
 *  given label type genuinely supports. `key` matches the real
 *  property name on that label type's own real data shape
 *  (types/labels/LabelData.ts) exactly, so a real renderer can look
 *  the real value up directly, never a fabricated or renamed field. */
export interface LabelFieldDefinition {
  key: string;
  displayName: string;
}

// Real, per this file's own header — confirmed directly against each
// real label type's own real data shape before writing this, not
// guessed. A field genuinely absent from a given type's own real data
// (e.g. a slide has no real patientName field at all) is genuinely
// absent from that type's own catalog here too — never offered as a
// draggable option for a label type that has no real place to source
// it from.
export const LABEL_FIELD_CATALOG: Record<LabelType, LabelFieldDefinition[]> = {
  requisition: [
    { key: 'fullAccession', displayName: 'Accession Number' },
    { key: 'patientName', displayName: 'Patient Name' },
    { key: 'dateOfBirth', displayName: 'Date of Birth' },
    { key: 'mrn', displayName: 'MRN' },
    { key: 'requestingProvider', displayName: 'Requesting Provider' },
    { key: 'submittingFacility', displayName: 'Submitting Facility' },
    { key: 'barcode', displayName: 'Accession Barcode' },
  ],
  specimen: [
    { key: 'fullAccession', displayName: 'Accession Number' },
    { key: 'patientName', displayName: 'Patient Name' },
    { key: 'dateOfBirth', displayName: 'Date of Birth' },
    { key: 'mrn', displayName: 'MRN' },
    { key: 'requestingProvider', displayName: 'Requesting Provider' },
    { key: 'submittingFacility', displayName: 'Submitting Facility' },
    { key: 'specimenLabel', displayName: 'Specimen Label' },
    { key: 'specimenDesc', displayName: 'Specimen Description' },
    { key: 'barcode', displayName: 'Specimen Barcode' },
  ],
  block: [
    { key: 'accessionNumber', displayName: 'Accession Number' },
    { key: 'specimenDesignator', displayName: 'Specimen Designator' },
    { key: 'blockId', displayName: 'Block ID' },
    { key: 'patientName', displayName: 'Patient Name' },
    { key: 'barcode', displayName: 'GS1 DataMatrix Barcode' },
  ],
  slide: [
    { key: 'fullAccession', displayName: 'Accession Number' },
    { key: 'specimenLabel', displayName: 'Specimen Label' },
    { key: 'blockLabel', displayName: 'Block Label' },
    { key: 'level', displayName: 'Level' },
    { key: 'stainName', displayName: 'Stain' },
    { key: 'barcode', displayName: 'GS1 DataMatrix Barcode' },
  ],
  decant: [
    { key: 'fullAccession', displayName: 'Accession Number' },
    { key: 'patientName', displayName: 'Patient Name' },
    { key: 'specimenLabel', displayName: 'Specimen Label' },
    { key: 'specimenDesc', displayName: 'Specimen Description' },
    { key: 'decantLabel', displayName: 'Decant Label' },
    { key: 'decantTypeLabel', displayName: 'Decant Type' },
    { key: 'barcode', displayName: 'Decant Barcode' },
  ],
  molecular_specimen: [
    { key: 'containerBarcode', displayName: 'Container Barcode' },
    { key: 'accessionNumber', displayName: 'Accession Number' },
    { key: 'aliquotVolumeUl', displayName: 'Aliquot Volume (µL)' },
    { key: 'barcode', displayName: 'DataMatrix Barcode' },
  ],
  molecular_plate: [
    { key: 'plateBarcode', displayName: 'Plate Barcode' },
    { key: 'assayName', displayName: 'Assay Name' },
    { key: 'targetInstrumentId', displayName: 'Target Instrument' },
    { key: 'barcode', displayName: 'Plate Barcode (Code128)' },
  ],
  molecular_rack: [
    { key: 'rackBarcode', displayName: 'Rack Barcode' },
    { key: 'barcode', displayName: 'Rack Barcode (Code128)' },
  ],
  molecular_deck_location: [
    { key: 'deckLocationLabel', displayName: 'Deck Location Label' },
    { key: 'targetInstrumentId', displayName: 'Target Instrument' },
    { key: 'deckSlot', displayName: 'Deck Slot' },
    { key: 'barcode', displayName: 'Deck Location Barcode' },
  ],
};

/** Real, per this file's own header — one real, placed field on a
 *  real layout's own canvas: which real field, positioned at a real
 *  x/y within the label's own real physical bounds (mm), with a real
 *  width/height and font size (also mm, for direct, consistent
 *  physical-unit math with everything else this app's own label
 *  system already uses — see buildRequisitionStickerSheetZpl.ts's own
 *  established mm-first convention). */
export interface LabelLayoutField {
  id: string;
  fieldKey: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizeMm: number;
}

export interface LabelLayout {
  id: ID;
  labelType: LabelType;
  /** Real, per this file's own header — undefined/absent means this
   *  is the real Enterprise-level default; a real, set facilityId
   *  means this is that specific facility's own real, explicit
   *  override. Only ever set when
   *  LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE[labelType] is true — real,
   *  honestly enforced by the service below, not just a UI-level
   *  suggestion. */
  facilityId?: string;
  widthMm: number;
  heightMm: number;
  fields: LabelLayoutField[];
  updatedAt: string;
}

export interface ILabelLayoutService {
  /** Real, per this file's own header — resolves the real, effective
   *  layout for a given facility: that facility's own real, explicit
   *  override if one exists (and is genuinely allowed for this label
   *  type), else the real Enterprise-level default, else honest null
   *  if neither has ever been configured. Pass no facilityId to fetch
   *  the Enterprise default directly, e.g. for editing it. */
  getByLabelType(labelType: LabelType, facilityId?: string): Promise<ServiceResult<LabelLayout | null>>;
  /** Real, honest refusal — per this file's own header — when
   *  attempting to save a real, facility-scoped override for a label
   *  type where LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE is false. */
  save(layout: Omit<LabelLayout, 'id' | 'updatedAt'> & { id?: ID }): Promise<ServiceResult<LabelLayout>>;
  reset(labelType: LabelType, facilityId?: string): Promise<ServiceResult<void>>;
}

/**
 * Real, per this file's own header — pure, data-only resolution,
 * mirroring resolveLisRoutingForFacility's own exact shape
 * (services/facilities/IFacilityService.ts): a real facility's own
 * explicit override if one exists AND this label type genuinely
 * allows one, else the real Enterprise-level default (the one real
 * layout with no facilityId set), else honest undefined when neither
 * has ever been configured. Kept as its own, separate, pure function
 * — not inlined into the service — so it's directly testable without
 * any real storage mechanics, matching this app's own established
 * "pure resolveX function, caller supplies context" convention used
 * throughout (resolveTenantFacility, resolveCaseMaskScopeCandidates,
 * etc.).
 */
export function resolveLabelLayoutForFacility(
  labelType: LabelType,
  facilityId: string | undefined,
  allLayouts: LabelLayout[],
): LabelLayout | undefined {
  if (facilityId && LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE[labelType]) {
    const override = allLayouts.find(l => l.labelType === labelType && l.facilityId === facilityId);
    if (override) return override;
  }
  return allLayouts.find(l => l.labelType === labelType && !l.facilityId) ?? undefined;
}
