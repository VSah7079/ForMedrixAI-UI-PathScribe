// src/services/cytology/generateCytologyReportPdf.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, client-side PDF rendering of CytologyReportContent, using
// jsPDF. Real, deliberate scope: this app's own real PDF pipeline
// (SynopticReportPage.tsx's generateReportPdfSnapshot, calling an
// external Firebase render_report Cloud Function) is deeply coupled
// to the synoptic-template system — bodyAssembly/headerAssembly/
// footerAssembly/narrativeTemplate — none of which cytology's own,
// genuinely simpler report content uses. Checked directly before
// building this: no client-side PDF library existed in this app yet,
// and reusing that external, synoptic-shaped endpoint for a genuinely
// different report structure would be misusing a service with no way
// to verify the (external, source-inaccessible) backend handles it
// correctly. This is a real, separate, honest, in-browser renderer
// instead — genuinely simpler, matching cytology's own genuinely
// simpler report.
//
// Renders all seven real, standard sections in the same order
// CytologyReportContent (types/cytology/) defines them.
//
// Real, per PS-277 (Master Template Engine) — this file's own real
// scope wall from PS-276 carries forward unchanged: only this real,
// in-repo, client-side pipeline. See services/documentRendering/README.md
// for the full account of what's closed here vs. what's genuinely out
// of reach (the external, source-inaccessible surgical-pathology
// render_report Cloud Function).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';
import { drawBarcodeOnJsPdfDoc } from '@/services/documentRendering/drawBarcodeOnJsPdfDoc';
import { applyDeterministicPdfMetadata } from '@/services/documentRendering/applyDeterministicPdfMetadata';
import { applyContinuationPageHeaders, CONTINUATION_HEADER_HEIGHT_MM } from '@/services/documentRendering/applyContinuationPageHeaders';
import { assertAllowedPrintFont, assertMinimumPrintMargin } from '@/services/documentRendering/validatePrintLayoutGovernance';
import type { HeaderLogoRegion } from '@/services/documentRendering/embedCytologyHeaderLogo';
import { registerEmbeddedPrintFont, EMBEDDED_PRINT_FONT_FAMILY } from '@/services/documentRendering/registerEmbeddedPrintFont';

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4, mm
const PAGE_HEIGHT = 297; // A4, mm
// Real, per PS-277 §1.2.4 — a real, fail-loud check at module load,
// not just a comment claiming the existing 15mm constant "happens to"
// clear the real 0.5in minimum. Throws immediately (before this module
// can even be used to render a report) if this constant is ever edited
// down below the real regulatory/hardware minimum.
assertMinimumPrintMargin(MARGIN);
/** Real, per PS-276 §1.1.3's "dynamic barcoding... for document
 *  tracking and accession identification" — real physical placement
 *  for the accession-number barcode drawn in the header (see
 *  drawBarcodeOnJsPdfDoc.ts's own real vector drawing, never a
 *  rasterized image). */
const BARCODE_WIDTH_MM = 40;
const BARCODE_HEIGHT_MM = 10;
/** Real, per PS-277 §1.2.3 — the minimum real vertical room a section
 *  header needs below it before this app treats the page as full:
 *  the header's own line (~4.6mm at size 11) plus at least one real
 *  body line (~4.2mm at size 10) plus spacing/buffer. "Keep With Next"
 *  for a section header — real, deliberate, minimal interpretation: a
 *  header is never left as the very last line on a page with nothing
 *  of its own section beneath it. */
const SECTION_HEADER_MIN_TRAILING_SPACE_MM = 14;
/** Real, per PS-277 §1.2.2 gap-closing — the fixed box reserved for
 *  content.printBranding.headerLogoUrl, when set. A real, deliberate
 *  letterhead-logo size (not a full-width banner) — big enough to be
 *  legible, small enough to never crowd out the facility name/address/
 *  Director/CLIA text this app already prints just below it. */
const HEADER_LOGO_MAX_WIDTH_MM = 30;
const HEADER_LOGO_MAX_HEIGHT_MM = 14;

/** Real, per PS-277 §1.2.2 gap-closing — the one, real "out parameter"
 *  this function accepts. See generateCytologyReportPdf's own header
 *  comment on `layoutOut` for why this exists instead of changing this
 *  function's return type. */
export interface CytologyPdfLayoutOut {
  headerLogoRegion?: HeaderLogoRegion;
}

function addWrappedText(doc: jsPDF, text: string, y: number, opts: { bold?: boolean; size?: number } = {}): number {
  // Real, per PS-276 §1.1.1 gap-closing — the real, embedded font
  // (registered once per doc via registerEmbeddedPrintFont(), called
  // at the top of generateCytologyReportPdf() below) replaces the old
  // 'helvetica' reference. jsPDF's own base-14 'helvetica' can never
  // be embedded, by the PDF spec itself; EMBEDDED_PRINT_FONT_FAMILY
  // genuinely is.
  const fontName = EMBEDDED_PRINT_FONT_FAMILY;
  assertAllowedPrintFont(fontName);
  doc.setFont(fontName, opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size ?? 10);
  const lines = doc.splitTextToSize(text, PAGE_WIDTH - MARGIN * 2);
  const lineHeight = (opts.size ?? 10) * 0.42;
  // Real, per PS-277 §1.2.1/§1.2.3 — a real, per-LINE overflow check
  // (not just at section-header boundaries, which was a real, found
  // gap: a long paragraph/list mid-section could previously run off
  // the bottom of the page uncaught). Continuation pages resume at
  // MARGIN + CONTINUATION_HEADER_HEIGHT_MM, reserving real space for
  // applyContinuationPageHeaders' own second pass at the very end.
  for (const line of lines) {
    if (y + lineHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN + CONTINUATION_HEADER_HEIGHT_MM;
    }
    doc.text(line, MARGIN, y);
    y += lineHeight;
  }
  return y + 2;
}

function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  // Real, per PS-277 §1.2.3 — "Keep With Next" for section headers:
  // real, deliberate check for enough room for the header's own line
  // AND at least one real line of the section it introduces, not just
  // the header text alone (the real, prior 'y > 270' check only ever
  // protected the header itself from being orphaned, never what
  // follows it).
  if (y + SECTION_HEADER_MIN_TRAILING_SPACE_MM > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    y = MARGIN + CONTINUATION_HEADER_HEIGHT_MM;
  }
  return addWrappedText(doc, title, y, { bold: true, size: 11 }) + 1;
}

/**
 * Real, per PS-277 §1.2.2 gap-closing — `layoutOut`, when passed, is a
 * real, deliberate "out parameter": this function is still fully
 * synchronous and never fetches network bytes itself (every existing
 * direct caller — CytologyScreeningPage.tsx's own interactive
 * print-preview — keeps calling this with a single argument,
 * completely unaffected, since `layoutOut` defaults to undefined).
 * When the caller passes a real object here (only
 * generateCytologyReportPdfWithAttachments does), this function fills
 * in `headerLogoRegion` with the exact, fixed box it reserved for
 * content.printBranding.headerLogoUrl (undefined when no logo URL was
 * resolved), so that async caller can later fetch the real bytes and
 * draw them into that exact region via embedCytologyHeaderLogo.ts —
 * entirely after this function has already returned. Changing this
 * function's own return type (to bundle the region into it) was
 * deliberately avoided — it would force every existing, plain-preview
 * caller to change for a feature they don't use.
 */
export function generateCytologyReportPdf(content: CytologyReportContent, layoutOut?: CytologyPdfLayoutOut): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // Real, per PS-276 §1.1.1 gap-closing — registers the real, embedded
  // Liberation Sans font program onto this doc instance before any
  // real text is drawn (addWrappedText below, and
  // applyContinuationPageHeaders' own later pass over this same doc
  // instance both rely on this having already run).
  registerEmbeddedPrintFont(doc);
  let y = MARGIN;

  y = addWrappedText(doc, 'Cytology Report — GYN Cervical Screening', y, { bold: true, size: 14 });
  y += 2;

  // Real, per PS-276 §1.1.3 — a real, scannable Code 128 vector
  // barcode of the accession number, in the header's top-right
  // corner, for document tracking and accession identification. Drawn
  // after the title text above (so it never depends on final title
  // wrap height) but before §1 below, at a fixed y so it never shifts
  // with content length.
  drawBarcodeOnJsPdfDoc(doc, content.accessionNumber, 'code128', {
    x: PAGE_WIDTH - MARGIN - BARCODE_WIDTH_MM,
    y: MARGIN,
    widthMm: BARCODE_WIDTH_MM,
    heightMm: BARCODE_HEIGHT_MM,
  });

  // Real, per PS-277 §1.2.2 (conditional branding & header overrides).
  // A real, pre-resolved reference — this function never resolves a
  // Facility/Department/Enterprise hierarchy itself (see
  // resolveFacilityPrintBranding.ts and this type's own doc comment).
  // Absent = the plain, no-branding header exactly as before this
  // batch, never a hard requirement.
  if (content.printBranding) {
    const b = content.printBranding;
    // Real, per PS-277 §1.2.2 gap-closing — reserves a fixed,
    // content-independent box (same "never shifts with content length"
    // reasoning as the accession barcode above) for the real embedded
    // logo image. This synchronous, network-free function never
    // fetches b.headerLogoUrl itself — generateCytologyReportPdfWithAttachments
    // + embedCytologyHeaderLogo.ts do the real async fetch and draw the
    // real, fetched bytes into this exact region via pdf-lib, entirely
    // after this function has already returned. Space is reserved
    // unconditionally whenever headerLogoUrl is set, even before that
    // later fetch is attempted, so this function's own page layout
    // never depends on whether that later fetch succeeds.
    if (b.headerLogoUrl) {
      if (layoutOut) {
        layoutOut.headerLogoRegion = { xMm: MARGIN, yMm: y, maxWidthMm: HEADER_LOGO_MAX_WIDTH_MM, maxHeightMm: HEADER_LOGO_MAX_HEIGHT_MM };
      }
      y += HEADER_LOGO_MAX_HEIGHT_MM + 2;
    }
    y = addWrappedText(doc, b.facilityName, y, { bold: true, size: 10 });
    const addressLine = [b.address, b.city, b.state, b.zip].filter(Boolean).join(', ');
    if (addressLine) y = addWrappedText(doc, addressLine, y, { size: 8 });
    // Real, per direct architecture guidance #2 — resolveFacilityPrintBranding.ts
    // already withholds directorName/cliaOrIsoNumber for a pure 'TC'
    // (technical-component-only) report; this just renders whichever
    // of the two real fields actually came back.
    const regLine = [
      b.directorName ? `Director: ${b.directorName}` : undefined,
      b.cliaOrIsoNumber ? `CLIA/ISO: ${b.cliaOrIsoNumber}` : undefined,
    ].filter(Boolean).join('   ');
    if (regLine) y = addWrappedText(doc, regLine, y, { size: 8 });
    y += 2;
  }

  // §1 Administrative & Patient Identifiers
  y = addSectionHeader(doc, 'Patient', y);
  y = addWrappedText(doc, `${content.patientName}${content.patientDateOfBirth ? ` · DOB ${new Date(content.patientDateOfBirth).toLocaleDateString()}` : ''}${content.patientMrn ? ` · MRN ${content.patientMrn}` : ''}`, y);
  y = addWrappedText(doc, `Accession: ${content.accessionNumber}${content.orderingProvider ? ` · Ordering Provider: ${content.orderingProvider}` : ''}`, y);
  if (content.specimenCollectedAt) y = addWrappedText(doc, `Collected: ${new Date(content.specimenCollectedAt).toLocaleString()}`, y);
  if (content.specimenReceivedAt) y = addWrappedText(doc, `Received: ${new Date(content.specimenReceivedAt).toLocaleString()}`, y);
  if (content.lastMenstrualPeriod) y = addWrappedText(doc, `LMP: ${new Date(content.lastMenstrualPeriod).toLocaleDateString()}`, y);
  y += 2;

  // §2 Specimen Type
  y = addSectionHeader(doc, 'Specimen Type', y);
  y = addWrappedText(doc, content.specimenTypeDescription + (content.preparationMethod ? ` (${content.preparationMethod})` : ''), y);
  y += 2;

  // §3 Specimen Adequacy
  y = addSectionHeader(doc, 'Specimen Adequacy', y);
  for (const line of content.specimenAdequacy) y = addWrappedText(doc, `• ${line}`, y);
  y += 2;

  // §4 General Categorization
  if (content.generalCategorization) {
    y = addSectionHeader(doc, 'General Categorization', y);
    y = addWrappedText(doc, content.generalCategorization, y);
    y += 2;
  }

  // §5 Interpretation / Diagnostic Result
  y = addSectionHeader(doc, 'Interpretation / Diagnostic Result', y);
  y = addWrappedText(doc, content.primaryInterpretation, y);
  for (const line of content.additionalInterpretations) y = addWrappedText(doc, `• ${line}`, y);
  y += 2;

  // §6 Adjunctive Testing & Integrated Results
  if (content.hpvResult || content.computerAssistedScreening) {
    y = addSectionHeader(doc, 'Adjunctive Testing & Integrated Results', y);
    if (content.hpvResult) y = addWrappedText(doc, `HPV: ${content.hpvResult}`, y);
    if (content.computerAssistedScreening) {
      y = addWrappedText(doc, `Computer-Assisted Screening: ${content.computerAssistedScreening.used ? 'Yes' : 'No'}${content.computerAssistedScreening.system ? ` (${content.computerAssistedScreening.system})` : ''}`, y);
    }
    y += 2;
  }

  // §7 Educational Notes, Comments, & Sign-Off
  if (content.recommendations.length > 0 || content.educationalNotes) {
    y = addSectionHeader(doc, 'Recommendations & Comments', y);
    for (const line of content.recommendations) y = addWrappedText(doc, `• ${line}`, y);
    if (content.educationalNotes) y = addWrappedText(doc, content.educationalNotes, y);
    y += 2;
  }

  // Real, per direct correction ("Cytology cases can have addendums...
  // appending supplemental information to an already completed or
  // signed-out case without altering the original signed text") — a
  // real, pre-existing gap this batch closes: addendumText existed on
  // CytologyReportContent already, but nothing in this renderer ever
  // actually printed it. Real, per PS-277 §1.2.3 — "Addenda forced
  // onto a dedicated page when configured by client policy"
  // (Facility.forceAddendumOnDedicatedPagePrintPolicy, resolved by the
  // real caller — see releaseCytologyAddendum.ts). Absent/false
  // preserves the plain, share-a-page behavior.
  if (content.addendumText) {
    if (content.forceAddendumOnDedicatedPage) {
      doc.addPage();
      y = MARGIN + CONTINUATION_HEADER_HEIGHT_MM;
    }
    y = addSectionHeader(doc, 'Addendum', y);
    y = addWrappedText(doc, content.addendumText, y);
    y += 2;
  }

  y = addSectionHeader(doc, 'Sign-Off', y);
  if (content.screenedBy) y = addWrappedText(doc, `Screened by: ${content.screenedBy.name}`, y);
  y = addWrappedText(doc, `Signed by: ${content.signedBy.name}${content.signedBy.isPathologist ? ', Pathologist' : ', Cytotechnologist'} — ${new Date(content.signedAt).toLocaleString()}`, y);

  // Real, per PS-277 §1.2.1 — the real, required LAST pass: every real
  // page this report actually ended up with now exists, so "Page X of
  // Y" can finally be correct. Never touches page 1 (see
  // applyContinuationPageHeaders' own header comment for why).
  applyContinuationPageHeaders(
    doc,
    { patientName: content.patientName, patientMrn: content.patientMrn, accessionNumber: content.accessionNumber },
    { marginMm: MARGIN, pageWidthMm: PAGE_WIDTH },
  );

  return doc;
}

/** Real, per direct confirmation to build item 5 of the image/PDF
 *  architecture scoping — composes this file's own real, existing
 *  jsPDF text rendering with embedImageAssociationsIntoPdf.ts's own
 *  real, fidelity-preserving image embedding and stream-level PDF
 *  merging (spec §3). Kept as a separate, new async function rather
 *  than changing generateCytologyReportPdf's own signature — every
 *  existing caller of that synchronous function keeps working
 *  unchanged; only a caller that actually has real
 *  content.imageAssociations to embed needs to reach for this one.
 *
 *  Real, per PS-276 §1.1.2 — applyDeterministicPdfMetadata.ts is
 *  always applied last, on BOTH paths below (with or without real
 *  image associations), so the same `content` always produces
 *  byte-identical output regardless of which path ran — see that
 *  function's own header comment for the real, verified gap this
 *  closes (jsPDF's own wall-clock CreationDate/ModDate).
 *
 *  Real, per PS-276 §1.1.3 — a below-300-DPI image-resolution warning
 *  (embedImageAssociationsIntoPdf.ts's own real check) is logged, not
 *  silently dropped, but never blocks or alters the real PDF output —
 *  a below-minimum gross photo is still real, useful documentation.
 *
 *  Real, per PS-277 §1.2.2 gap-closing — also the one, real caller
 *  that passes a `layoutOut` object into generateCytologyReportPdf, so
 *  it can read back the fixed header-logo region that function
 *  reserved and hand it to embedCytologyHeaderLogo.ts for the real,
 *  async fetch-and-draw pass. Runs independently of (and, in page
 *  order, before) the imageAssociations pass above — a header logo
 *  belongs on page 1 itself, never one of the imageAssociations'
 *  own, separately-appended pages. Same "log the warning, never block
 *  or alter the rest of the real PDF output" posture as
 *  imageAssociations' own DPI warnings — a logo that can't be fetched,
 *  or that embeds below the 300 DPI minimum, still leaves the rest of
 *  the real, diagnostic report content completely unaffected. */
export async function generateCytologyReportPdfWithAttachments(content: CytologyReportContent): Promise<Uint8Array> {
  const layoutOut: CytologyPdfLayoutOut = {};
  const doc = generateCytologyReportPdf(content, layoutOut);
  const baseBytes = new Uint8Array(doc.output('arraybuffer'));
  const metadata = {
    title: `Cytology Report — ${content.accessionNumber}`,
    author: content.signedBy.name,
    subject: 'Cytology Report',
    timestamp: content.signedAt,
  };

  let bytes: Uint8Array = baseBytes;
  const warnings: string[] = [];

  if (layoutOut.headerLogoRegion && content.printBranding?.headerLogoUrl) {
    const { embedCytologyHeaderLogo } = await import('../documentRendering/embedCytologyHeaderLogo');
    const logoResult = await embedCytologyHeaderLogo(bytes, content.printBranding.headerLogoUrl, layoutOut.headerLogoRegion);
    bytes = logoResult.bytes;
    if (logoResult.warning) warnings.push(logoResult.warning);
  }

  if (content.imageAssociations && content.imageAssociations.length > 0) {
    const { embedImageAssociationsIntoPdf } = await import('../imageAssociation/embedImageAssociationsIntoPdf');
    const assocResult = await embedImageAssociationsIntoPdf(bytes, content.imageAssociations);
    bytes = assocResult.bytes;
    warnings.push(...assocResult.warnings);
  }

  for (const warning of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[PathScribe] ${warning}`);
  }
  return applyDeterministicPdfMetadata(bytes, metadata);
}
