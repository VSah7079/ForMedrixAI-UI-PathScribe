// src/services/cytology/resolvePathologyLexiconTerm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "default to the canonical
// source term... rather than guessing" resolution rule. The one, real
// place that decides what text to show for a real, specialized
// clinical term in a given locale — never falls back to a translated
// guess; falls back only to the term's own real, canonical
// (English/Latin) form.
// ─────────────────────────────────────────────────────────────────────────────

import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';

export interface ResolvedPathologyTerm {
  text: string;
  /** Real, per direct guidance's own "Clinical Disclaimers Baseline"
   *  — true only when a real, explicitly validated translation for
   *  this exact locale was actually found; false whenever the
   *  canonical term is shown instead (including for a real locale
   *  with no entry at all), so a real caller can render the required
   *  disclaimer indicator honestly. */
  isValidatedTranslation: boolean;
}

export function resolvePathologyLexiconTerm(
  termKey: string,
  locale: PathologyLexiconLocale | 'en',
  lexicon: PathologyLexiconEntry[],
  /** Real, Path Two — per direct guidance's own confirmed decision.
   *  'label' (the default, preserving every real, existing call
   *  site's own behavior unchanged) resolves the standalone picklist
   *  form; 'narrative' prefers a real, validated `narrativeText` when
   *  the translator explicitly provided a genuinely distinct one,
   *  falling back to the same `text` used for 'label' when they
   *  didn't — never a silently different default. */
  context: 'label' | 'narrative' = 'label',
): ResolvedPathologyTerm {
  const entry = lexicon.find(e => e.termKey === termKey);
  // Real, honest fallback for a term with no real lexicon entry at
  // all — the raw key itself, never a fabricated guess at what it
  // might mean.
  if (!entry) return { text: termKey, isValidatedTranslation: false };
  if (locale === 'en') return { text: entry.canonicalTerm, isValidatedTranslation: true };
  const translation = entry.translations[locale];
  if (translation) {
    const text = context === 'narrative' ? (translation.narrativeText ?? translation.text) : translation.text;
    return { text, isValidatedTranslation: true };
  }
  return { text: entry.canonicalTerm, isValidatedTranslation: false };
}
