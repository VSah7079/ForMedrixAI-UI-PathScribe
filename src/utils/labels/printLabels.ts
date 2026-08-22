// src/utils/labels/printLabels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label-printing architecture
// scope. Deliberately mirrors CopilotReportViewModal.tsx's own,
// hard-won handlePrint mechanics exactly — that file's own comment
// documents real, confirmed browser print-engine behavior (opening a
// brand new, empty window avoids the blank-print issue that persisted
// through several attempts at patching ancestor elements in-place).
// Reusing the proven approach rather than re-discovering the same
// lesson.
//
// One real, load-bearing difference from that file: labels use
// `@page { size: ...; margin: 0; }` rather than a margin-only rule on a
// standard page size — this is the actual CSS mechanism that lets a
// physical label's exact real dimensions (from LabelSizePreset) reach
// the printer, not just margins on a page whose own size is still
// whatever the OS/driver defaults to.
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelSizePreset } from '@/types/labels/LabelSizePreset';

const LABEL_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #000; }
  .ps-label {
    display: flex; overflow: hidden;
    break-after: page; page-break-after: always;
  }
  .ps-label:last-child { break-after: auto; page-break-after: auto; }
  .ps-label-accession { font-weight: 800; letter-spacing: 0.02em; }
  .ps-label-fields { line-height: 1.25; overflow: hidden; }
  .ps-label-row { display: flex; gap: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps-label-field { color: #444; font-weight: 600; flex-shrink: 0; }
  .ps-label-value { color: #000; overflow: hidden; text-overflow: ellipsis; }
  .ps-label-barcode svg { display: block; }

  /* Real feature, per direct follow-up: "when we print we need to
     have some indication of these shared cassettes." Deliberately
     high-contrast (inverted colors) and full-width — this is a real,
     safety-relevant fact about a physical object multiple specimens'
     tissue lives inside, not an ordinary field to skim past among
     Patient/DOB/MRN. */
  .ps-label-shared-badge {
    background: #000; color: #fff; font-weight: 800; text-align: center;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Real, size-aware layout — a real 2"x1" (50.8x25.4mm) label cannot
     fit a stacked, full-size layout (confirmed directly: a first pass
     clipped MRN and the entire barcode via overflow:hidden, since the
     content genuinely didn't fit at readable font sizes). Small labels
     go side-by-side (compact 2D code + tight text block, using the
     landscape shape efficiently); large/full-page labels stay stacked
     with generous spacing, matching a real requisition form's own
     proportions. */
  .ps-label--compact {
    flex-direction: row; align-items: center; gap: 2mm; padding: 1.5mm;
  }
  .ps-label--compact .ps-label-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3mm; }
  .ps-label--compact .ps-label-accession { font-size: 7.5pt; }
  .ps-label--compact .ps-label-fields { font-size: 5.5pt; }
  .ps-label--compact .ps-label-barcode { flex-shrink: 0; width: 13mm; height: 13mm; }
  .ps-label--compact .ps-label-barcode svg { width: 100%; height: 100%; }
  .ps-label--compact .ps-label-shared-badge { font-size: 5pt; padding: 0.3mm 0; margin-bottom: 0.3mm; border-radius: 0.5mm; }

  .ps-label--roomy {
    flex-direction: column; justify-content: flex-start; gap: 4mm; padding: 10mm;
  }
  .ps-label--roomy .ps-label-accession { font-size: 16pt; margin-bottom: 2mm; }
  .ps-label--roomy .ps-label-shared-badge { font-size: 10pt; padding: 1.5mm 0; margin-bottom: 2mm; border-radius: 1mm; }
  .ps-label--roomy .ps-label-fields { font-size: 11pt; }
  .ps-label--roomy .ps-label-fields .ps-label-row { padding: 1mm 0; }
  .ps-label--roomy .ps-label-field { min-width: 24mm; }
  .ps-label--roomy .ps-label-barcode { margin-top: 4mm; }
  .ps-label--roomy .ps-label-barcode svg { width: 60mm; height: auto; }

  /* Real feature, per direct follow-up: "Fallback Physical Relabeling
     (Secondary Labeling)." Dedicated, minimal markup for the tiny
     25.4×6.35mm overlay preset — see buildSecondaryLabelHtml's own
     doc comment for why this is its own layout rather than a third
     size tier on .ps-label. Real, honest gap: not yet confirmed
     against physical label stock. */
  .ps-seclabel {
    display: flex; align-items: center; gap: 1mm; overflow: hidden;
    break-after: page; page-break-after: always;
  }
  .ps-seclabel:last-child { break-after: auto; page-break-after: auto; }
  .ps-seclabel-barcode { flex-shrink: 0; width: 6mm; height: 6mm; }
  .ps-seclabel-barcode svg { width: 100%; height: 100%; }
  .ps-seclabel-text { flex: 1; min-width: 0; overflow: hidden; }
  .ps-seclabel-id { font-weight: 800; font-size: 6.5pt; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ps-seclabel-note { font-size: 4.5pt; color: #444; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/**
 * Real, honest failure mode preserved from the proven pattern: a
 * blocked popup returns false instead of throwing, so the caller can
 * show its own real UI message rather than an unhandled exception.
 */
export function printLabels(labelHtmlFragments: string[], preset: LabelSizePreset, documentTitle: string): boolean {
  if (labelHtmlFragments.length === 0) return false;

  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow pop-ups for this site to print labels.');
    return false;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${documentTitle}</title>
<style>
  ${LABEL_STYLES}
  @media print { @page { size: ${preset.widthMm}mm ${preset.heightMm}mm; margin: 0; } }
</style>
</head>
<body>${labelHtmlFragments.join('')}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  // Same real, deliberate delay as CopilotReportViewModal.tsx's own
  // handlePrint — calling print() immediately is a documented cause of
  // blank output in new-window printing; this gives fonts/layout a
  // moment to actually paint first.
  setTimeout(() => { printWindow.print(); }, 250);
  return true;
}
