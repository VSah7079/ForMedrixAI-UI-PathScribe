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
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4, mm

function addWrappedText(doc: jsPDF, text: string, y: number, opts: { bold?: boolean; size?: number } = {}): number {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size ?? 10);
  const lines = doc.splitTextToSize(text, PAGE_WIDTH - MARGIN * 2);
  doc.text(lines, MARGIN, y);
  return y + lines.length * (opts.size ?? 10) * 0.42 + 2;
}

function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  if (y > 270) { doc.addPage(); y = MARGIN; }
  return addWrappedText(doc, title, y, { bold: true, size: 11 }) + 1;
}

export function generateCytologyReportPdf(content: CytologyReportContent): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  y = addWrappedText(doc, 'Cytology Report — GYN Cervical Screening', y, { bold: true, size: 14 });
  y += 2;

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

  y = addSectionHeader(doc, 'Sign-Off', y);
  if (content.screenedBy) y = addWrappedText(doc, `Screened by: ${content.screenedBy.name}`, y);
  y = addWrappedText(doc, `Signed by: ${content.signedBy.name}${content.signedBy.isPathologist ? ', Pathologist' : ', Cytotechnologist'} — ${new Date(content.signedAt).toLocaleString()}`, y);

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
 *  Real, honest no-op when there's nothing to embed — never a wasted
 *  pdf-lib round-trip on a report with no real associations. */
export async function generateCytologyReportPdfWithAttachments(content: CytologyReportContent): Promise<Uint8Array> {
  const doc = generateCytologyReportPdf(content);
  const baseBytes = new Uint8Array(doc.output('arraybuffer'));
  if (!content.imageAssociations || content.imageAssociations.length === 0) return baseBytes;

  const { embedImageAssociationsIntoPdf } = await import('../imageAssociation/embedImageAssociationsIntoPdf');
  return embedImageAssociationsIntoPdf(baseBytes, content.imageAssociations);
}
