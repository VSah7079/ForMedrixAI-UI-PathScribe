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

import type { RequisitionLabelData, ContainerLabelData, StationLabelData, SecondaryLabelData, DecantContainerLabelData } from '@/types/labels/LabelData';
import { barcodePayloadForRequisition, barcodePayloadForContainer, barcodePayloadForStation, barcodePayloadForSecondaryLabel, barcodePayloadForDecantContainer } from '@/types/labels/LabelData';
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
    ['MRN', data.mrn],
    ['Provider', data.requestingProvider],
    ['Facility', data.submittingFacility],
  ]);
  return labelWrapper(preset, escapeHtml(data.fullAccession), rows, barcodeSvg);
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
