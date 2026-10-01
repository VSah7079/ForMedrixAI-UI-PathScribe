// src/services/labelDesigner/buildLabelLayoutZpl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "add a way for users to output their
// label so they can verify that they will work." The designer's own
// canvas preview is a real, useful layout sketch, but it cannot
// answer the real question a person actually needs answered before
// trusting a new format: will this real barcode actually scan, at
// this real size, printed at a real printer's own real dpi? This
// file's own only job: turn a real, saved LabelLayout into real,
// working ZPL — the same real format every other label in this app
// already gets checked through Labelary
// (labelary.com/viewer.html) — using the exact same, already-proven
// building blocks (mmToDots, buildBarcodeCommand) the rest of this
// app's own real ZPL already relies on, not a second, parallel
// implementation that could quietly drift from those.
//
// Real, honest, stated simplification: the barcode field's own real
// payload here is the layout's own real, illustrative sample value
// (see LabelDesignerPage.tsx's own SAMPLE_VALUES), not each label
// type's own real, production-specific encoded payload (e.g.
// block/slide's own real GS1 structure, built from a real GTIN this
// generic designer model has no concept of). This is genuinely
// sufficient for what this feature is actually for — confirming
// real, physical fit, sizing, and general scannability at this
// label's own real dimensions — not a byte-for-byte replica of a
// specific label type's own production encoding.
// ─────────────────────────────────────────────────────────────────────────────

import { mmToDots, buildBarcodeCommand } from '../../utils/labels/simpleZplTemplate';
import { LABEL_TYPE_DEFAULT_SYMBOLOGY } from './ILabelLayoutService';
import type { LabelLayout, LabelLayoutField, LabelType } from './ILabelLayoutService';

/**
 * Real, per this file's own header — converts a real, saved
 * LabelLayout into real, working ZPL a person can paste directly
 * into Labelary's own real viewer (labelary.com/viewer.html) to
 * verify fit and scannability before trusting the format. `dpi`
 * matches whichever real printer this lab actually targets — 203 is
 * this app's own established default elsewhere (buildRequisitionStickerSheetZpl.ts).
 */
export function buildLabelLayoutZpl(
  layout: LabelLayout,
  labelType: LabelType,
  sampleValues: Record<string, string>,
  dpi: number,
): string {
  const symbology = LABEL_TYPE_DEFAULT_SYMBOLOGY[labelType];

  const commands = layout.fields.map((field: LabelLayoutField) => {
    const xDots = mmToDots(field.xMm, dpi);
    const yDots = mmToDots(field.yMm, dpi);
    const value = sampleValues[field.fieldKey] ?? field.fieldKey;

    if (field.fieldKey === 'barcode') {
      const barcodeCommand = buildBarcodeCommand(symbology, value, dpi, field.heightMm, field.widthMm);
      return `^FO${xDots},${yDots}\n${barcodeCommand}`;
    }

    const fontDots = mmToDots(field.fontSizeMm, dpi);
    return `^FO${xDots},${yDots}^A0N,${fontDots},${fontDots}^FD${value}^FS`;
  });

  return ['^XA', '^CI28', ...commands, '^XZ'].join('\n');
}
