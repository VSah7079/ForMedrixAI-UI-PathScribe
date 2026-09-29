// src/services/documentRendering/applyDeterministicPdfMetadata.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.2 — "re-rendering a signed report at any
// future point must produce a pixel-identical document." Checked
// directly before building this: generateCytologyReportPdf.ts's own
// real jsPDF output was NOT actually deterministic — jsPDF writes the
// PDF's own `/CreationDate`/`/ModDate` from the real wall-clock
// `new Date()` at the moment `.output()` is called, so generating the
// exact same report content twice, at two different real times,
// produced two byte-different PDFs. Verified directly (not assumed):
// this is the one non-deterministic element in that pipeline — every
// other value jsPDF writes comes straight from `content`, which is
// itself the same each time.
//
// Real fix: re-open the bytes with pdf-lib (already a real dependency
// of this pipeline — embedImageAssociationsIntoPdf.ts) and overwrite
// Title/Author/Subject/Creator/Producer plus CreationDate/
// ModificationDate with values derived from the report's OWN data
// (never `new Date()`/wall-clock).
//
// Real, second non-determinism source found and closed (not assumed —
// diffed two raw jsPDF outputs for byte-identical content, confirmed
// directly against jsPDF's own source): jsPDF's own internal
// `setFileId()` (called with no arguments on every real `.output()`)
// unconditionally randomizes the PDF trailer's `/ID` via
// `Math.random()`, regardless of any metadata this app sets — pdf-lib
// then preserves that same random `/ID` unchanged through a load/save
// round trip, since it only reads it, never regenerates it. Metadata
// alone was NOT enough to close this — clearing `context.trailerInfo.ID`
// below was required too. With both fixed, the same report content
// now always produces byte-identical output, verified directly by
// this file's own test (two real generations, byte-for-byte
// `Uint8Array` equality).
//
// Real, honest scope: this closes the ONE concrete determinism gap
// found. It does not, by itself, make the document ISO 19005 (PDF/A)
// compliant — see this folder's own README for the real, separate,
// still-open PDF/A gap (full font embedding; jsPDF's default
// `helvetica` is one of the 14 standard PDF fonts, which are NOT
// embedded, and PDF/A requires every font to be).
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument } from 'pdf-lib';

export interface DeterministicPdfMetadata {
  title: string;
  author: string;
  subject: string;
  /** Real, per spec — must be a stable value derived from the
   *  report's own data (e.g. `signedAt`), never `new Date()`/`Date.now()`.
   *  Used for both CreationDate and ModificationDate — this app never
   *  claims a report was modified after its own real sign-out moment. */
  timestamp: string | Date;
}

const PRODUCER_AND_CREATOR = 'PathScribe';

/**
 * Real, deterministic metadata pass — given the same bytes and the
 * same metadata input, always produces byte-identical output. Applied
 * as the LAST step of PDF generation (after any image-association
 * merge), so it's the one place that guarantees determinism
 * regardless of how many other real steps ran before it.
 */
export async function applyDeterministicPdfMetadata(
  bytes: Uint8Array,
  metadata: DeterministicPdfMetadata,
): Promise<Uint8Array> {
  // Real, verified-necessary option: pdf-lib's own PDFDocument.load()
  // unconditionally overwrites Producer/ModificationDate to
  // "pdf-lib (...)"/`new Date()` (its own real wall-clock, right at
  // load time) unless told not to — confirmed directly by reading
  // pdf-lib's own updateInfoDict(), called from its constructor. This
  // app's own explicit setCreator/setProducer/setCreationDate/
  // setModificationDate calls below run after load and would still
  // win either way, but skipping pdf-lib's own pointless wall-clock
  // write here keeps this function's real intent — and its test's own
  // verification loads — honest and unambiguous.
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const timestamp = typeof metadata.timestamp === 'string' ? new Date(metadata.timestamp) : metadata.timestamp;

  doc.setTitle(metadata.title);
  doc.setAuthor(metadata.author);
  doc.setSubject(metadata.subject);
  doc.setProducer(PRODUCER_AND_CREATOR);
  doc.setCreator(PRODUCER_AND_CREATOR);
  doc.setCreationDate(timestamp);
  doc.setModificationDate(timestamp);
  // Real, per this file's own header comment — clears jsPDF's own
  // randomized trailer /ID (an optional trailer entry outside the
  // Info dict, so clearing it is spec-valid and never breaks a real
  // PDF reader). pdf-lib's own public API has no dedicated setter for
  // this, so this reaches its `context.trailerInfo` directly — a real,
  // documented, narrowly-scoped use of an otherwise-internal field,
  // not a blind `as any` cast of unrelated behavior.
  doc.context.trailerInfo.ID = undefined;

  return doc.save();
}
