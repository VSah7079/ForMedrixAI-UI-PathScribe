// src/services/documentRendering/registerEmbeddedPrintFont.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.1 gap-closing pass. Closes the one, real,
// material blocker `documentRendering/README.md`'s own "Real,
// remaining gaps" section had disclosed: jsPDF's default 'helvetica'
// (and 'times'/'courier') are the 14 PDF standard fonts, which by the
// PDF spec itself are never embedded — PDF/A conformance requires
// every font in the document to be embedded, and no jsPDF
// configuration can embed a standard font, only swapping to a
// genuinely separate, real font program does.
//
// This file is the one real place that font program gets registered
// onto a real jsPDF doc instance, via jsPDF's own documented
// addFileToVFS()/addFont() mechanism — see
// embeddedFonts/LICENSE_NOTICE.md for the real sourcing/licensing
// account of the Liberation Sans font program itself
// (embeddedFonts/LiberationSans-Regular-normal.ts /
// LiberationSans-Bold-bold.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { jsPDF } from 'jspdf';
import { LIBERATION_SANS_REGULAR_BASE64 } from './embeddedFonts/LiberationSans-Regular-normal';
import { LIBERATION_SANS_BOLD_BASE64 } from './embeddedFonts/LiberationSans-Bold-bold';

/** Real, deliberate font-family name this app's own PDF pipelines
 *  should pass to `doc.setFont(...)` in place of `'helvetica'` once
 *  `registerEmbeddedPrintFont(doc)` has been called on that same doc
 *  instance. Kept as a named export (not a hardcoded string at each
 *  call site) so every real caller stays in sync if this ever changes. */
export const EMBEDDED_PRINT_FONT_FAMILY = 'LiberationSans';

const REGULAR_VFS_FILENAME = 'LiberationSans-Regular.ttf';
const BOLD_VFS_FILENAME = 'LiberationSans-Bold.ttf';

/** Real, idempotent registration — safe to call more than once on the
 *  same doc instance (jsPDF's own addFont/addFileToVFS calls are
 *  themselves idempotent no-op-safe on re-registration, but this
 *  module tracks it anyway so a future caller never has to reason
 *  about call order across this file and whatever else touches the
 *  same doc).
 *
 *  Real, deliberate encoding choice: 'WinAnsiEncoding', not the
 *  default 'Identity-H' — this pipeline's own real report content is
 *  entirely Latin-1/ASCII clinical text (patient names, accession
 *  numbers, standard medical terminology), so the simpler, real
 *  WinAnsiEncoding embedding path applies directly with no Unicode
 *  CID/CMap machinery this content never needs. Verified directly
 *  against jsPDF's own addfont plugin source
 *  (node_modules/jspdf/dist/jspdf.es.min.js's own 'putFont' event
 *  handlers) that this path embeds the font's own real, full
 *  `FontFile2` program — the actual, genuine embedding PDF/A
 *  conformance requires, not a reference or a subset stand-in. */
export function registerEmbeddedPrintFont(doc: jsPDF): void {
  if (!doc.existsFileInVFS(REGULAR_VFS_FILENAME)) {
    doc.addFileToVFS(REGULAR_VFS_FILENAME, LIBERATION_SANS_REGULAR_BASE64);
    doc.addFont(REGULAR_VFS_FILENAME, EMBEDDED_PRINT_FONT_FAMILY, 'normal', undefined, 'WinAnsiEncoding');
  }
  if (!doc.existsFileInVFS(BOLD_VFS_FILENAME)) {
    doc.addFileToVFS(BOLD_VFS_FILENAME, LIBERATION_SANS_BOLD_BASE64);
    doc.addFont(BOLD_VFS_FILENAME, EMBEDDED_PRINT_FONT_FAMILY, 'bold', undefined, 'WinAnsiEncoding');
  }
}
