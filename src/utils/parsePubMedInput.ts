// src/utils/parsePubMedInput.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "If they access the article and
// then search and find a different article, can we update the pubmed
// article link to the new article so they don't have to search
// again." Powers the ticker's "paste it here" field — deliberately a
// plain <input> paste, not navigator.clipboard.readText(), per direct
// follow-up on the security/VDI concern with the Clipboard API's own
// permission model.
//
// Real, pure parsing — accepts either a raw PMID or a real PubMed
// URL, and is honest about invalid input rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a real PMID from user-pasted input. Accepts a bare PMID
 * (digits only, PubMed IDs are real, positive integers — no fixed
 * length is enforced, since PMID length itself isn't a stable
 * contract to validate against) or a real pubmed.ncbi.nlm.nih.gov URL
 * in any of its common forms. Returns null for anything else, rather
 * than guessing at a nearest match.
 */
export function parsePubMedInput(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare PMID — digits only, no leading zero (real PMIDs don't have one).
  if (/^[1-9]\d*$/.test(trimmed)) return trimmed;

  // A real PubMed URL — pubmed.ncbi.nlm.nih.gov/{PMID} or
  // ncbi.nlm.nih.gov/pubmed/{PMID}, with or without scheme, trailing
  // slash, or query string.
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (!/(^|\.)ncbi\.nlm\.nih\.gov$/i.test(url.hostname)) return null;

    const pathMatch = url.pathname.match(/\/pubmed\/(\d+)/i) ?? url.pathname.match(/^\/(\d+)\/?$/);
    return pathMatch ? pathMatch[1] : null;
  } catch {
    return null;
  }
}
