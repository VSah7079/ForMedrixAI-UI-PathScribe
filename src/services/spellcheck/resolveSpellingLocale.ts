// src/services/spellcheck/resolveSpellingLocale.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): which spelling language a report is checked in.
//
// Per Pete (Sep 26, 2026): the facility sets the default, the pathologist's
// own profile preference is inherited when the case is assigned to them,
// and the pathologist can switch the language for one case. So, most
// specific first:
//   1. the case's own override (chosen on that case);
//   2. the assigned pathologist's profile preference;
//   3. the facility's jurisdiction default (the case's ordering facility,
//      the same facility the report's convention has always followed);
//   4. the platform default (en-US).
// A choice that isn't available (none today; the mechanism stays for any
// future language) is skipped, not honoured, so a report is never left with
// no dictionary. Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import {
  DEFAULT_SPELLING_LOCALE, isSpellingLocale, JURISDICTION_SPELLING_LOCALE, SPELLING_LOCALES, type SpellingLocale,
} from './spellingLocales';

export type SpellingLocaleSource = 'case' | 'pathologist' | 'facility' | 'platform';

export interface ResolvedSpellingLocale {
  locale: SpellingLocale;
  source: SpellingLocaleSource;
  /** A higher-priority choice that was skipped because it isn't available. */
  unavailableChoice?: SpellingLocale;
}

export function resolveSpellingLocale(input: {
  caseOverride?: string | null;
  pathologistPreference?: string | null;
  facilityJurisdiction?: Jurisdiction | null;
}, locales: Record<SpellingLocale, { available: boolean }> = SPELLING_LOCALES): ResolvedSpellingLocale {
  const candidates: [unknown, SpellingLocaleSource][] = [
    [input.caseOverride, 'case'],
    [input.pathologistPreference, 'pathologist'],
    [input.facilityJurisdiction ? JURISDICTION_SPELLING_LOCALE[input.facilityJurisdiction] : undefined, 'facility'],
  ];
  let unavailableChoice: SpellingLocale | undefined;
  for (const [value, source] of candidates) {
    if (!isSpellingLocale(value)) continue;
    if (locales[value].available) return { locale: value, source, ...(unavailableChoice ? { unavailableChoice } : {}) };
    unavailableChoice ??= value;
  }
  return { locale: DEFAULT_SPELLING_LOCALE, source: 'platform', ...(unavailableChoice ? { unavailableChoice } : {}) };
}
