// src/services/cytology/resolvePathologyLexiconNarrativeTextRedundancy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, Path Two governance check, per direct guidance's own
// confirmed decision: "if narrativeText is identical to text
// (case-insensitive and trimmed), throw a compiler warning to keep
// the bundle lean and clear out redundant overrides." A real,
// deterministic, pure check — no build-pipeline wiring assumed here,
// since none exists yet for the Lexicon specifically (see this
// file's own real caller for how it's actually exercised today).
// ─────────────────────────────────────────────────────────────────────────────

import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';

export interface RedundantNarrativeTextFinding {
  termKey: string;
  locale: PathologyLexiconLocale;
}

/** Real, case-insensitive, trimmed comparison — per direct guidance's
 *  own exact wording. A `narrativeText` that differs only in casing
 *  or surrounding whitespace from `text` carries no real, distinct
 *  narrative-context meaning; it's flagged the same as an exact
 *  duplicate. */
function isRedundant(text: string, narrativeText: string): boolean {
  return text.trim().toLowerCase() === narrativeText.trim().toLowerCase();
}

/** Real, per direct guidance's own confirmed governance check.
 *  Returns every real (termKey, locale) pair across the whole
 *  lexicon where a real, recorded `narrativeText` turned out
 *  identical to `text` after all — a stale or unnecessary override
 *  a reviewer should clear out, not a genuine narrative-context
 *  distinction. Returns an empty array for a real lexicon with no
 *  such findings, never a placeholder entry. */
export function resolvePathologyLexiconNarrativeTextRedundancy(
  lexicon: PathologyLexiconEntry[],
): RedundantNarrativeTextFinding[] {
  const findings: RedundantNarrativeTextFinding[] = [];
  for (const entry of lexicon) {
    for (const [locale, translation] of Object.entries(entry.translations) as [PathologyLexiconLocale, PathologyLexiconEntry['translations'][PathologyLexiconLocale]][]) {
      if (!translation?.narrativeText) continue;
      if (isRedundant(translation.text, translation.narrativeText)) {
        findings.push({ termKey: entry.termKey, locale });
      }
    }
  }
  return findings;
}
