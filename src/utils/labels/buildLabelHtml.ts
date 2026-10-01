// src/utils/labels/buildLabelHtml.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label-printing architecture
// scope. Pure, string-building function — real label data + a real
// LabelSizePreset in, a real, self-contained HTML fragment out. No DOM
// dependency: unlike CopilotReportViewModal.tsx's print flow (which
// grabs innerHTML from an already-rendered, interactive component),
// label content is pure, deterministic data — building the HTML
// directly is simpler, fully unit-testable, and doesn't require a
// hidden React component mounted somewhere on the page just to print.
//
// Real, size-aware layout — found via live testing, not guessed at in
// advance: a first pass used one fixed layout (stacked, justify-
// content: space-between) for every preset. Confirmed two real,
// opposite failures live: on the full-page requisition preset, content
// was stranded with a huge empty gap in the middle of the page; on the
// real 2"x1" (50.8x25.4mm) CLSI container preset, the same layout
// clipped the MRN row and the entire barcode via overflow:hidden — the
// content genuinely didn't fit at those font sizes. A small label and
// a full page are different design problems, not the same layout
// scaled — see printLabels.ts's own CSS for the two real, distinct
// layout modes this now picks between.
// ─────────────────────────────────────────────────────────────────────────────

import type { RequisitionLabelData, ContainerLabelData, StationLabelData, SecondaryLabelData, DecantContainerLabelData, MolecularSpecimenLabelData, MolecularPlateLabelData, MolecularRackLabelData, MolecularDeckLocationLabelData, RequisitionStickerSheetData, RequisitionStickerZoneKind } from '@/types/labels/LabelData';
import { barcodePayloadForRequisition, barcodePayloadForContainer, barcodePayloadForStation, barcodePayloadForSecondaryLabel, barcodePayloadForDecantContainer, barcodePayloadForMolecularSpecimen, barcodePayloadForMolecularPlate, barcodePayloadForMolecularRack, barcodePayloadForMolecularDeckLocation, REQUISITION_STICKER_ZONE_DIMENSIONS } from '@/types/labels/LabelData';
import type { LabelSizePreset } from '@/types/labels/LabelSizePreset';
import { generateBarcodeSvg } from './generateBarcodeSvg';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDob(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** A label at or below this real physical area gets the compact,
 *  side-by-side layout — above it, the roomy, stacked one. 50x25mm
 *  (the CLSI AUTO12 standard, confirmed too small for the original
 *  stacked layout via live testing) is the largest size that
 *  genuinely needs it; anything meaningfully bigger has real room to
 *  spare for the roomier, more legible stacked layout. */
const COMPACT_LAYOUT_MAX_AREA_MM2 = 55 * 30;

function isCompactLayout(preset: LabelSizePreset): boolean {
  return preset.widthMm * preset.heightMm <= COMPACT_LAYOUT_MAX_AREA_MM2;
}

function fieldRows(rows: Array<[string, string | undefined]>): string {
  return rows
    .filter((r): r is [string, string] => !!r[1])
    .map(([label, value]) => `<div class="ps-label-row"><span class="ps-label-field">${escapeHtml(label)}</span><span class="ps-label-value">${escapeHtml(value)}</span></div>`)
    .join('');
}

/** Shared wrapper — real structural difference from the first pass:
 *  the accession/fields are grouped into their own `.ps-label-text`
 *  block, a sibling of `.ps-label-barcode` (not a parent of it), since
 *  the compact layout's `flex-direction: row` needs text and barcode
 *  as two independent flex children sitting side by side, not one
 *  nested inside the other. */
function labelWrapper(preset: LabelSizePreset, accessionText: string, rowsHtml: string, barcodeSvg: string, badgeHtml?: string): string {
  const layoutClass = isCompactLayout(preset) ? 'ps-label--compact' : 'ps-label--roomy';
  return `
    <div class="ps-label ${layoutClass}" style="width:${preset.widthMm}mm;height:${preset.heightMm}mm;">
      <div class="ps-label-text">
        ${badgeHtml ?? ''}
        <div class="ps-label-accession">${accessionText}</div>
        <div class="ps-label-fields">${rowsHtml}</div>
      </div>
      <div class="ps-label-barcode">${barcodeSvg}</div>
    </div>`;
}

export function buildRequisitionLabelHtml(data: RequisitionLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForRequisition(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Patient', data.patientName],
    ['DOB', formatDob(data.dateOfBirth)],
    // Real, same direct correction as buildRequisitionStickerSheetHtml's
    // own identical fix above — a genuinely missing identifying field
    // shows as an explicit placeholder, not a silently collapsed line.
    ['MRN', data.mrn || 'Not Recorded'],
    ['Provider', data.requestingProvider || 'Not Recorded'],
    ['Facility', data.submittingFacility || 'Not Recorded'],
  ]);
  return labelWrapper(preset, escapeHtml(data.fullAccession), rows, barcodeSvg);
}

// Real, per direct follow-up + supplied research: the real, multi-zone
// requisition sticker sheet — see RequisitionStickerSheetData's own
// doc comment (types/labels/LabelData.ts) for the full reasoning.
// Every real sticker on this sheet carries the same real accession
// barcode (the one real identifier already known at requisition-print
// time) — only size, count, and a short zone label differ.

function repeatedStickerHtml(kind: RequisitionStickerZoneKind, count: number, barcodePayload: string, symbology: LabelSizePreset['defaultBarcodeSymbology']): string {
  const dims = REQUISITION_STICKER_ZONE_DIMENSIONS[kind];
  const barcodeSvg = generateBarcodeSvg(barcodePayload, symbology, { widthMm: dims.widthMm * 0.6, heightMm: dims.heightMm * 0.7 });
  const stickers = Array.from({ length: count }, () => `
    <div class="ps-req-sticker" style="width:${dims.widthMm}mm;height:${dims.heightMm}mm;">
      <div class="ps-req-sticker-barcode">${barcodeSvg}</div>
      <div class="ps-req-sticker-text">${escapeHtml(barcodePayload)}</div>
    </div>`).join('');
  return `<div class="ps-req-sticker-row">${stickers}</div>`;
}

export function buildRequisitionStickerSheetHtml(data: RequisitionStickerSheetData, preset: LabelSizePreset): string {
  const accessionBarcode = barcodePayloadForRequisition(data);
  const headerBarcodeSvg = generateBarcodeSvg(accessionBarcode, preset.defaultBarcodeSymbology, { widthMm: 20, heightMm: 8 });
  const headerRows = fieldRows([
    ['Patient', data.patientName],
    ['DOB', formatDob(data.dateOfBirth)],
    // Real, direct correction, per direct follow-up ("if the fields
    // have no data... it would be valuable to notify the reader"):
    // fieldRows collapses a field entirely when its own value is
    // empty — the right, established behavior for a real, optional
    // field, but wrong for a real identifying/routing field a
    // specimen's own safe handling depends on. A genuinely missing
    // MRN or submitting facility now shows as an explicit "Not
    // Available" placeholder instead of silently vanishing from the
    // label, matching this same file's own ZPL sibling
    // (buildRequisitionStickerSheetZpl.ts) exactly, so both real
    // rendering paths for the same real sheet agree.
    ['MRN', data.mrn || 'Not Recorded'],
    ['Provider', data.requestingProvider || 'Not Recorded'],
    ['Facility', data.submittingFacility || 'Not Recorded'],
  ]);

  return `
    <div class="ps-req-sheet" style="width:${preset.widthMm}mm;height:${preset.heightMm}mm;">
      <div class="ps-req-header">
        <div class="ps-req-header-text">
          <div class="ps-label-accession">${escapeHtml(data.fullAccession)}</div>
          <div class="ps-label-fields">${headerRows}</div>
        </div>
        <div class="ps-req-header-barcode">${headerBarcodeSvg}</div>
      </div>
      <div class="ps-req-zone">
        <div class="ps-req-zone-title">Log-In / Transport</div>
        ${repeatedStickerHtml('log_in', data.logInStickerCount, accessionBarcode, preset.defaultBarcodeSymbology)}
      </div>
      <div class="ps-req-zone">
        <div class="ps-req-zone-title">Specimen / Tube</div>
        ${repeatedStickerHtml('specimen', data.specimenStickerCount, accessionBarcode, preset.defaultBarcodeSymbology)}
      </div>
      <div class="ps-req-zone">
        <div class="ps-req-zone-title">Cassette / Slide</div>
        ${repeatedStickerHtml('cassette_slide', data.cassetteSlideStickerCount, accessionBarcode, preset.defaultBarcodeSymbology)}
      </div>
    </div>`;
}

export function buildContainerLabelHtml(data: ContainerLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForContainer(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Specimen', `${data.specimenLabel} — ${data.specimenDesc}`],
    ['Patient', data.patientName],
    ['DOB', formatDob(data.dateOfBirth)],
    ['MRN', data.mrn],
  ]);
  const accessionText = `${escapeHtml(data.fullAccession)}-${escapeHtml(data.specimenLabel)}`;
  // Real feature, per direct follow-up: "when we print we need to
  // have some indication of these shared cassettes." Real, honest
  // labeling — names the real other specimens by letter, not just a
  // generic "shared" flag, so whoever handles the physical cassette
  // next knows exactly what else is in it without opening the case.
  const badgeHtml = data.sharedCassetteSiblings?.length
    ? `<div class="ps-label-shared-badge">⚭ SHARED CASSETTE — also: ${escapeHtml(data.sharedCassetteSiblings.map(s => s.specimenLabel).join(', '))}</div>`
    : undefined;
  return labelWrapper(preset, accessionText, rows, barcodeSvg, badgeHtml);
}

/** Real feature, per direct follow-up: "proceed with the decant
 *  container label." Same real labelWrapper()/generateBarcodeSvg()
 *  pipeline as buildContainerLabelHtml immediately above — a decant's
 *  own container is a real, distinct physical object (poured off
 *  separately from its parent specimen), not a different rendering
 *  mechanism. No shared-cassette badge — see
 *  buildDecantContainerLabelData.ts's own header for why that real
 *  concept has no analog for a fluid decant. Shows the decant TYPE
 *  (Cell Block / Residual Fluid) directly on the label — the one real
 *  piece of information this label needs that an ordinary specimen
 *  container label doesn't, since a histotech handling this
 *  physical object needs to know at a glance whether it's headed for
 *  paraffin embedding (cell block) or needs different handling
 *  (residual fluid). */
export function buildDecantContainerLabelHtml(data: DecantContainerLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForDecantContainer(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Specimen', `${data.specimenLabel} — ${data.specimenDesc}`],
    ['Type', data.decantTypeLabel],
    ['Patient', data.patientName],
    ['DOB', formatDob(data.dateOfBirth)],
    ['MRN', data.mrn],
  ]);
  const accessionText = `${escapeHtml(data.fullAccession)}-${escapeHtml(data.specimenLabel)}${escapeHtml(data.decantLabel)}`;
  return labelWrapper(preset, accessionText, rows, barcodeSvg);
}

/**
 * Real feature, per direct follow-up: "Station barcode label
 * generation itself." Same real labelWrapper()/generateBarcodeSvg()
 * this whole file already uses — a station label is a real, distinct
 * label KIND (no patient/case data at all), but not a different
 * rendering mechanism; reusing the same proven layout/print pipeline
 * rather than a separate one built just for this.
 */
export function buildStationLabelHtml(data: StationLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForStation(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Stage', data.workflowStage],
    ['Printed', formatDob(data.printedAt)],
  ]);
  return labelWrapper(preset, escapeHtml(data.stationName), rows, barcodeSvg);
}

/**
 * Real feature, per direct follow-up: "Fallback Physical Relabeling
 * (Secondary Labeling)... place an adhesive slide/cassette secondary
 * label over the non-tissue side... rather than attempting laser
 * re-engraving." Deliberately its OWN, dedicated markup — not routed
 * through labelWrapper()'s compact/roomy split, since both of those
 * layouts were sized and confirmed via live testing against the much
 * larger 50.8×25.4mm CLSI preset. At 25.4×6.35mm, this label has real
 * room for exactly one small barcode and one short line of text side
 * by side — nothing else fits. Real, honest gap: unlike the two
 * layouts above, this one has NOT been confirmed against real,
 * physical label stock — it's built from the same real CSS mechanism
 * (@page size in printLabels.ts), but the tight, sub-millimeter
 * margins at this size make it the kind of thing that genuinely needs
 * a real print test before trusting it blind on a live cassette.
 */
export function buildSecondaryLabelHtml(data: SecondaryLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForSecondaryLabel(data), preset.defaultBarcodeSymbology);
  return `
    <div class="ps-seclabel" style="width:${preset.widthMm}mm;height:${preset.heightMm}mm;">
      <div class="ps-seclabel-barcode">${barcodeSvg}</div>
      <div class="ps-seclabel-text">
        <div class="ps-seclabel-id">${escapeHtml(data.recordLabel)}</div>
        <div class="ps-seclabel-note">was: ${escapeHtml(data.foreignId)}</div>
      </div>
    </div>`;
}

// ── Molecular Testing Execution Module — Phase 4 ────────────────────
// Real, per direct follow-up: same real labelWrapper()/fieldRows()
// pipeline every label kind above already uses — no second, parallel
// HTML-building mechanism for molecular labels.

export function buildMolecularSpecimenLabelHtml(data: MolecularSpecimenLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForMolecularSpecimen(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Accession', data.accessionNumber],
    ['Volume', data.aliquotVolumeUl !== undefined ? `${data.aliquotVolumeUl} µL` : undefined],
    ['Printed', formatDob(data.printedAt)],
  ]);
  return labelWrapper(preset, escapeHtml(data.containerBarcode), rows, barcodeSvg);
}

export function buildMolecularPlateLabelHtml(data: MolecularPlateLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForMolecularPlate(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Assay', data.assayName],
    ['Instrument', data.targetInstrumentId],
    ['Printed', formatDob(data.printedAt)],
  ]);
  return labelWrapper(preset, escapeHtml(data.plateBarcode), rows, barcodeSvg);
}

export function buildMolecularRackLabelHtml(data: MolecularRackLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForMolecularRack(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Printed', formatDob(data.printedAt)],
  ]);
  return labelWrapper(preset, escapeHtml(data.rackBarcode), rows, barcodeSvg);
}

export function buildMolecularDeckLocationLabelHtml(data: MolecularDeckLocationLabelData, preset: LabelSizePreset): string {
  const barcodeSvg = generateBarcodeSvg(barcodePayloadForMolecularDeckLocation(data), preset.defaultBarcodeSymbology);
  const rows = fieldRows([
    ['Instrument', data.targetInstrumentId],
    ['Deck Slot', data.deckSlot],
    ['Printed', formatDob(data.printedAt)],
  ]);
  return labelWrapper(preset, escapeHtml(data.deckLocationLabel), rows, barcodeSvg);
}
