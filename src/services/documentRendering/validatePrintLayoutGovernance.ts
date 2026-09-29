// src/services/documentRendering/validatePrintLayoutGovernance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.4 (Master Template Engine — font & layout
// governance): "restrict styling to embedded, web-safe, regulatory-
// compliant typefaces" and "enforce minimum 0.5in margins on all
// borders for physical printer hardware compatibility."
//
// Real, disclosed scope: ALLOWED_PRINT_FONTS restricts which font
// FAMILY a caller may select — it does NOT, on its own, make a font
// genuinely PDF/A-embedded. jsPDF's 'helvetica'/'times'/'courier' are
// its own built-in base-14 fonts, which are NOT embedded in the output
// PDF, by the PDF spec itself — no jsPDF configuration can change
// that. What this DOES close, honestly: prevents this app's own code
// from silently drifting onto an arbitrary, unapproved font family
// (e.g. a copy-pasted 'Comic Sans' or a non-web-safe custom face) — a
// real, fail-loud guardrail, not on its own a PDF/A compliance claim.
//
// **Updated (gap-closing pass, Sep 2026), PS-276 §1.1.1**: the real
// font-embedding gap this header used to point at as "still open" is
// now closed. 'LiberationSans' — a real, genuinely embedded TrueType
// font program (SIL OFL 1.1, metrically compatible with Helvetica) —
// is now on this allowlist and is the one this app's own cytology PDF
// pipeline actually renders with; see registerEmbeddedPrintFont.ts and
// embeddedFonts/LICENSE_NOTICE.md for the full account. The three
// original base-14 entries stay on the allowlist too — they're not
// currently used by any real caller after this change, but removing
// them isn't this ticket's call to make on its own; they remain real,
// legacy, non-embedded options, now clearly disclosed as such rather
// than silently implied to be PDF/A-safe.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, deliberate allowlist. 'LiberationSans' is the one real,
 *  genuinely embedded, PDF/A-appropriate choice (see this file's own
 *  header comment) — 'helvetica'/'times'/'courier' remain allowed as
 *  jsPDF's own built-in base-14-compatible fonts, but are NOT embedded
 *  in the output PDF regardless of anything this allowlist does.
 *  Adding a new real font here is a real, deliberate decision, not a
 *  silent drift. */
export const ALLOWED_PRINT_FONTS: readonly string[] = ['helvetica', 'times', 'courier', 'LiberationSans'];

/** Real, per §1.2.4 — 0.5 inch in millimeters (1in = 25.4mm exactly). */
export const MIN_PRINT_MARGIN_MM = 12.7;

/** Real, fail-loud guard — throws with a clear, actionable message
 *  rather than silently rendering with whatever font was passed. Meant
 *  to be called at every real doc.setFont() call site in this app's
 *  own PDF-generation code, so an accidental future edit that
 *  introduces an unapproved font family fails a real test immediately,
 *  instead of shipping a non-compliant PDF nobody notices until a
 *  regulator or print vendor does. */
export function assertAllowedPrintFont(fontName: string): void {
  if (!ALLOWED_PRINT_FONTS.includes(fontName)) {
    throw new Error(
      `assertAllowedPrintFont: '${fontName}' is not on the real, approved print-font allowlist (${ALLOWED_PRINT_FONTS.join(', ')}) — ` +
      `see validatePrintLayoutGovernance.ts's own header comment before adding a new one.`
    );
  }
}

/** Real, fail-loud guard for §1.2.4's own 0.5in minimum-margin
 *  requirement — throws rather than silently rendering a report whose
 *  content could be clipped by real printer hardware. */
export function assertMinimumPrintMargin(marginMm: number): void {
  if (marginMm < MIN_PRINT_MARGIN_MM) {
    throw new Error(
      `assertMinimumPrintMargin: a ${marginMm}mm margin is below the real 0.5in (${MIN_PRINT_MARGIN_MM}mm) minimum required for physical printer hardware compatibility (PS-277 §1.2.4).`
    );
  }
}
