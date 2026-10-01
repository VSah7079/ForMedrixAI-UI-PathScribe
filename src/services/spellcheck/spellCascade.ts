// src/services/spellcheck/spellCascade.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): the Hierarchical Lexicon Cascade (§2.1, AC1). Each
// word is resolved through the tiers in order; the first tier that
// accepts it wins:
//   1. user overrides      — the pathologist's personal dictionary
//   1b. facility overrides — the lab's dictionary (local acronyms, shorthand)
//   —  regional check      — a word written in the other English convention
//                            ("hematology" in a UK report) is flagged with
//                            this convention's form, before tiers 2–4 could
//                            accept it (AC2)
//   2. jurisdiction medical lexicon
//   3. standardised clinical vocabularies (SNOMED CT / LOINC terms, from
//      the dictionary build; codes themselves never reach here, see
//      tokenizeForSpelling.ts)
//   4. base language dictionary
// Pure: tiers are plain lookups, so this runs the same in the Web Worker,
// in tests and anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

import { koreanLookupForms, tokenizeForSpelling, type SpellToken } from './tokenizeForSpelling';

export type SpellTier = 'personal' | 'facility' | 'medical' | 'clinical' | 'base';

export interface WordLookup {
  has(word: string): boolean;
  suggest?(word: string): string[];
}

export interface SpellTiers {
  script: 'latin' | 'hangul';
  personal: WordLookup;
  facility: WordLookup;
  medical: WordLookup;
  clinical: WordLookup;
  base: WordLookup;
  /** Lower-case word in the other English convention → this convention's form. */
  otherConvention?: ReadonlyMap<string, string>;
  /** The other English convention's base dictionary: a word it accepts and
   *  this one doesn't is reported as a regional variant, not a misspelling. */
  otherConventionBase?: WordLookup;
  /** For a non-Latin language: the tiers Latin-script words are checked against. */
  latinFallback?: SpellTiers;
}

export type SpellVerdict =
  | { ok: true; tier: SpellTier }
  | { ok: false; reason: 'misspelled' | 'regionalVariant'; preferred?: string };

export interface SpellIssue {
  from: number;
  to: number;
  word: string;
  reason: 'misspelled' | 'regionalVariant';
  /** For a regional variant: this convention's spelling. */
  preferred?: string;
}

const TIERS: readonly SpellTier[] = ['medical', 'clinical', 'base'];

/** Keeps the capitalisation pattern of the original word. */
export function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function checkWord(word: string, script: SpellToken['script'], tiers: SpellTiers): SpellVerdict {
  if (script === 'latin' && tiers.script !== 'latin' && tiers.latinFallback) return checkWord(word, script, tiers.latinFallback);
  const forms = tiers.script === 'hangul' && script === 'hangul' ? koreanLookupForms(word) : [word];
  const any = (lookup: WordLookup) => forms.some(f => lookup.has(f));

  if (any(tiers.personal)) return { ok: true, tier: 'personal' };
  if (any(tiers.facility)) return { ok: true, tier: 'facility' };

  const preferred = tiers.otherConvention?.get(word.toLowerCase());
  if (preferred) return { ok: false, reason: 'regionalVariant', preferred: matchCase(word, preferred) };

  for (const tier of TIERS) if (any(tiers[tier])) return { ok: true, tier };

  if (tiers.otherConventionBase?.has(word)) {
    const own = tiers.base.suggest?.(word)?.[0];
    return { ok: false, reason: 'regionalVariant', ...(own ? { preferred: own } : {}) };
  }
  return { ok: false, reason: 'misspelled' };
}

/** Every flagged word in a text, with offsets. `cache` (optional) memoises
 *  verdicts per word for repeated checks of the same document. */
export function checkText(text: string, tiers: SpellTiers, cache?: Map<string, SpellVerdict>): SpellIssue[] {
  const issues: SpellIssue[] = [];
  for (const token of tokenizeForSpelling(text)) {
    const key = `${token.script}:${token.text}`;
    let verdict = cache?.get(key);
    if (!verdict) {
      verdict = checkWord(token.text, token.script, tiers);
      cache?.set(key, verdict);
    }
    if (verdict.ok === false) {
      issues.push({ from: token.from, to: token.to, word: token.text, reason: verdict.reason, ...(verdict.preferred ? { preferred: verdict.preferred } : {}) });
    }
  }
  return issues;
}

export const MAX_SUGGESTIONS = 6;

/** Suggestions for a flagged word: the regional form first, then the
 *  medical lexicon's, then the base dictionary's; no duplicates. */
export function suggestWord(word: string, script: SpellToken['script'], tiers: SpellTiers): string[] {
  if (script === 'latin' && tiers.script !== 'latin' && tiers.latinFallback) return suggestWord(word, script, tiers.latinFallback);
  const out: string[] = [];
  const push = (s: string | undefined) => { if (s && s !== word && !out.includes(s)) out.push(s); };
  const verdict = checkWord(word, script, tiers);
  if (verdict.ok === false) push(verdict.preferred);
  // Each dictionary ranks only its own suggestions, so the medical list
  // used to crowd out a closer everyday word ("specimin" → "spermatic"
  // before "specimen"). Pool them (medical, clinical, base) and rank by
  // closeness to what was typed; equal distances keep that order.
  const pooled: string[] = [];
  for (const s of [...(tiers.medical.suggest?.(word) ?? []), ...(tiers.clinical.suggest?.(word) ?? []), ...(tiers.base.suggest?.(word) ?? [])]) {
    if (s && s !== word && !pooled.includes(s)) pooled.push(s);
  }
  const typed = word.toLowerCase();
  pooled
    .map((s, i) => ({ s, i, d: editDistance(typed, s.toLowerCase()) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .forEach(x => push(x.s));
  return out.slice(0, MAX_SUGGESTIONS);
}

/** Edit distance counting insertions, deletions, substitutions and swaps of
 *  two neighbouring letters ("recieve" → "receive" is 1), for ranking. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A lookup over a word list: exact match, or lower-case match for words
 *  stored in lower case (so "Ductal" at a sentence start still matches). */
export function wordSetLookup(words: Iterable<string>): WordLookup {
  const exact = new Set<string>();
  const lower = new Set<string>();
  for (const w of words) {
    const t = w.trim();
    if (!t) continue;
    exact.add(t);
    if (t === t.toLowerCase()) lower.add(t);
  }
  return { has: w => exact.has(w) || lower.has(w.toLowerCase()) };
}

export const EMPTY_LOOKUP: WordLookup = { has: () => false };
