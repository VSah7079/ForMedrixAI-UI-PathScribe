// src/services/spellcheck/spellingLocales.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): the spelling languages PathScribe checks against, and
// the default for each jurisdiction. Pure.
//
// Base dictionaries are Hunspell dictionaries copied into
// public/spellcheck/base/ by scripts/spellcheck/build-spellcheck-assets.mjs
// (sources and licences in public/spellcheck/NOTICE.txt):
//   en-US / en-GB / en-AU / en-CA — SCOWL-based (MIT AND BSD)
//   fr-FR — Dicollecte (MPL-2.0)      nl-NL — OpenTaal (BSD-3 or CC-BY-3.0)
//   ko-KR — hunspell-dict-ko (used under MPL-1.1)
//   de-DE — igerman98 (GPL-2.0 or GPL-3.0). Per Pete (Sep 26, 2026) it is
//           used under the GPL: shipped byte-for-byte unmodified as a
//           separate data file loaded at run time, with the full licence
//           texts and its source (or a written offer) — see
//           scripts/spellcheck/build-spellcheck-assets.mjs.
// `available: false` remains for any future language whose dictionary
// can't ship yet; none today.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

export type SpellingLocale = 'en-US' | 'en-GB' | 'en-AU' | 'en-CA' | 'fr-FR' | 'nl-NL' | 'ko-KR' | 'de-DE';

/** English spelling convention: 'US' (hemorrhage), 'GB' (haemorrhage) or
 *  'both' (Canada, where medical usage mixes the two). Undefined for
 *  non-English locales. */
export type EnglishConvention = 'US' | 'GB' | 'both';

export interface SpellingLocaleInfo {
  locale: SpellingLocale;
  /** Whether PathScribe ships dictionaries for it. */
  available: boolean;
  /** Script of the language, used to route mixed-script tokens. */
  script: 'latin' | 'hangul';
  convention?: EnglishConvention;
  /** For a non-Latin language: the English locale Latin-script words in
   *  the same report are checked against (Korean reports routinely carry
   *  English medical terms). */
  latinFallback?: SpellingLocale;
}

export const SPELLING_LOCALES: Record<SpellingLocale, SpellingLocaleInfo> = {
  'en-US': { locale: 'en-US', available: true, script: 'latin', convention: 'US' },
  'en-GB': { locale: 'en-GB', available: true, script: 'latin', convention: 'GB' },
  'en-AU': { locale: 'en-AU', available: true, script: 'latin', convention: 'GB' },
  'en-CA': { locale: 'en-CA', available: true, script: 'latin', convention: 'both' },
  'fr-FR': { locale: 'fr-FR', available: true, script: 'latin' },
  'nl-NL': { locale: 'nl-NL', available: true, script: 'latin' },
  'ko-KR': { locale: 'ko-KR', available: true, script: 'hangul', latinFallback: 'en-US' },
  'de-DE': { locale: 'de-DE', available: true, script: 'latin' },
};

/** Order the language picker shows them in. */
export const SPELLING_LOCALE_ORDER: readonly SpellingLocale[] = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'fr-FR', 'nl-NL', 'de-DE', 'ko-KR'];

/**
 * The default spelling language for each jurisdiction. Ireland and the
 * three UK nations use UK English; New Zealand uses the Australian
 * dictionary (there is no packaged en-NZ one; NZ medical spelling follows
 * the same British conventions); Belgium uses Dutch (as JURISDICTION_LOCALE
 * does; a French-speaking Belgian lab can choose French per case).
 */
export const JURISDICTION_SPELLING_LOCALE: Record<Jurisdiction, SpellingLocale> = {
  US: 'en-US', CA: 'en-CA',
  GB_EW: 'en-GB', GB_SCT: 'en-GB', GB_NIR: 'en-GB', IE: 'en-GB',
  AU: 'en-AU', NZ: 'en-AU',
  KR: 'ko-KR', BE: 'nl-NL', NL: 'nl-NL', DE: 'de-DE', FR: 'fr-FR',
};

export const DEFAULT_SPELLING_LOCALE: SpellingLocale = 'en-US';

export function isSpellingLocale(v: unknown): v is SpellingLocale {
  return typeof v === 'string' && v in SPELLING_LOCALES;
}
