// src/types/labels/LabelSizePreset.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct research: physical label sizes for pathology
// printing are governed by real, named standards (CLSI AUTO12 for
// clinical/lab specimen labels) and real, common hardware presets
// (Zebra/Brady/Dymo/SATO), not arbitrary pixel dimensions. Stored
// canonically in millimeters — mm is unambiguous and precise; inches are
// a UI-layer display conversion only, never a second, parallel data
// model (avoids the two-unit-systems-can-drift class of bug).
//
// Originally just requisition and container — cassette/slide labels
// were deliberately kept out, on the assumption that Cerebro's own
// CEREBRO-ID hardware drives that natively (see
// services/hl7/adapters/cerebroAdapter.ts's own header comment). Real,
// direct follow-up surfaced the real case that assumption didn't
// cover: "if an external pre-engraved 2D barcode is unreadable by
// your hardware scanners, place an adhesive slide/cassette secondary
// label... rather than attempting laser re-engraving." That's exactly
// a case where PathScribe DOES need to render a real, physical
// fallback label — histology_secondary_overlay below, sized to a
// real, named, commercially-sold product (LabTAG's own chemical-
// resistant histology cassette/slide label, 1"×0.25"), not guessed at.
// ─────────────────────────────────────────────────────────────────────────────

export type LabelBarcodeSymbology = 'code128' | 'qr' | 'datamatrix';

export interface LabelSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Real, informed default per size — 2D (QR/DataMatrix) for labels at
   *  or below ~50×25mm, where a 1D barcode genuinely doesn't have
   *  enough horizontal room to stay scannable; Code 128 for larger
   *  labels/full-page requisitions where that constraint doesn't
   *  apply. A per-preset default, not a hardcoded global choice — an
   *  admin can still override per preset. */
  defaultBarcodeSymbology: LabelBarcodeSymbology;
}

/** Real, named standard sizes — CLSI AUTO12 as the confirmed US default
 *  for specimen containers, plus the real preset sizes already
 *  researched for this project. Canonical mm values; inches are exact
 *  conversions of the real, named physical size (2.0in = 50.8mm, not a
 *  rounded approximation), not independently sourced. */
export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  {
    id: 'clsi_standard_specimen',
    name: 'Standard Specimen — CLSI AUTO12 (2.0″ × 1.0″)',
    widthMm: 50.8,
    heightMm: 25.4,
    defaultBarcodeSymbology: 'datamatrix',
  },
  {
    // Real feature, per direct follow-up: "Fallback Physical
    // Relabeling (Secondary Labeling)... place an adhesive slide/
    // cassette secondary label over the non-tissue side... rather
    // than attempting laser re-engraving." Real, named, commercially-
    // sold size — LabTAG's own chemical-resistant histology cassette/
    // slide label (1"×0.25", xylene/solvent-resistant — the real
    // constraint every histology label has to survive). Deliberately
    // its own, dedicated, minimal layout in buildLabelHtml.ts, not
    // forced through the existing compact/roomy split built for the
    // much larger 50.8×25.4mm CLSI preset above — at 6.35mm tall,
    // this label has room for a barcode and one line of text, nothing
    // more.
    id: 'histology_secondary_overlay',
    name: 'Secondary Cassette/Slide Overlay (1.0″ × 0.25″)',
    widthMm: 25.4,
    heightMm: 6.35,
    defaultBarcodeSymbology: 'datamatrix',
  },
  {
    id: 'medium_container',
    name: 'Medium Container (3.0″ × 2.0″)',
    widthMm: 76.2,
    heightMm: 50.8,
    defaultBarcodeSymbology: 'code128',
  },
  {
    id: 'large_container',
    name: 'Large Surgical Container (4.0″ × 2.0″)',
    widthMm: 101.6,
    heightMm: 50.8,
    defaultBarcodeSymbology: 'code128',
  },
  {
    id: 'requisition_sticker_small',
    name: 'Requisition Sticker (4.0″ × 2.0″)',
    widthMm: 101.6,
    heightMm: 50.8,
    defaultBarcodeSymbology: 'code128',
  },
  {
    id: 'requisition_pouch',
    name: 'Requisition / Transport Pouch (4.0″ × 6.0″)',
    widthMm: 101.6,
    heightMm: 152.4,
    defaultBarcodeSymbology: 'code128',
  },
  {
    id: 'requisition_full_page_letter',
    name: 'Full-Page Requisition — US Letter (8.5″ × 11″)',
    widthMm: 215.9,
    heightMm: 279.4,
    defaultBarcodeSymbology: 'code128',
  },
  {
    id: 'requisition_full_page_a4',
    name: 'Full-Page Requisition — A4 (210mm × 297mm)',
    widthMm: 210,
    heightMm: 297,
    defaultBarcodeSymbology: 'code128',
  },
];

export const DEFAULT_CONTAINER_LABEL_PRESET_ID = 'clsi_standard_specimen';
export const DEFAULT_REQUISITION_LABEL_PRESET_ID = 'requisition_full_page_letter';

export function getLabelSizePreset(id: string): LabelSizePreset | undefined {
  return LABEL_SIZE_PRESETS.find(p => p.id === id);
}

/** Pure unit conversion for display only — never a second, stored
 *  representation of the same size. */
export function mmToInches(mm: number): number {
  return mm / 25.4;
}
