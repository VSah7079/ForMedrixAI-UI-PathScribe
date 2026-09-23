// src/utils/extractCaseReferencesFromText.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix (PS-299 — "Messages referencing a case should show a link to
// that case at the top"): AppShell.tsx's own messaging drawer already had
// a real, working case link, but only ever for messages some other part
// of this app pre-populated with a structured Message.caseNumber field
// (e.g. the automated "Pool case available" / informal-review
// notifications) — an ordinary, human-typed message that simply mentions
// a real accession number in its own subject or body ("can you take a
// look at MPA26-1004 today?") got no link at all, even though the real
// case it's talking about is right there in the text. That's the actual
// gap this closes.
//
// Deliberately NOT a speculative regex guessing at "accession-shaped"
// text (this app's own real accession formats vary by facility —
// S26-4401, MPA26-1006, HFHS-006, ...; a generic pattern would either
// miss real ones or false-positive on ordinary prose). Instead, this
// matches directly against the real, already-known set of case
// accession numbers passed in — zero false positives by construction,
// at the real cost of only catching references to cases that actually
// exist in whatever list the caller supplies.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans free text for whole-word mentions of any accession number in
 * knownAccessions, returning the distinct matches found, in the order
 * they first appear. Case-insensitive (accession numbers are always
 * compared/displayed upper-case elsewhere in this app).
 */
export function extractCaseReferencesFromText(text: string, knownAccessions: string[]): string[] {
  if (!text || knownAccessions.length === 0) return [];

  const found: string[] = [];
  const seen = new Set<string>();

  // Longest-first so a full accession like "MPA26-1006-POOL" is matched
  // whole rather than only its shorter prefix "MPA26-1006" (both could
  // otherwise be "known" if a caller passes both a case's own
  // accession and a specimen-level id derived from it).
  const sorted = [...new Set(knownAccessions.filter(Boolean))].sort((a, b) => b.length - a.length);

  for (const accession of sorted) {
    if (seen.has(accession.toUpperCase())) continue;
    // Escape regex metacharacters — real accession numbers can contain
    // hyphens, which are safe in a character class context anyway, but
    // this stays correct if a future format ever adds another symbol.
    const escaped = accession.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, 'i');
    if (re.test(text)) {
      found.push(accession.toUpperCase());
      seen.add(accession.toUpperCase());
    }
  }

  return found;
}
