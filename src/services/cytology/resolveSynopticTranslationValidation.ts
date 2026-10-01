// src/services/cytology/resolveSynopticTranslationValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed data-model correction:
// "tie the checkbox directly to the underlying document metadata"
// rather than an implicit, UI-side-only warning. These two, real,
// pure functions are what a real caller uses to (1) find every real,
// currently-unvalidated clinical term actually present in a real set
// of synoptic answers, and (2) decide whether an existing, real,
// recorded acknowledgment still honestly covers the current state —
// never trusted blindly forever, since the underlying answers can
// genuinely change after the acknowledgment was made.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';
import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';
import { resolvePathologyLexiconTerm } from './resolvePathologyLexiconTerm';

export function resolveUnvalidatedTermKeysInAnswers(
  template: SynopticTemplate,
  answers: Record<string, string | string[]>,
  locale: PathologyLexiconLocale | 'en',
  lexicon: PathologyLexiconEntry[],
): string[] {
  const unvalidated = new Set<string>();
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!field.options) continue;
      const answer = answers[field.id];
      if (answer === undefined) continue;
      const selectedIds = Array.isArray(answer) ? answer : [answer];
      for (const optionId of selectedIds) {
        const option = field.options.find(o => o.id === optionId);
        if (!option?.lexiconTermKey) continue;
        const resolved = resolvePathologyLexiconTerm(option.lexiconTermKey, locale, lexicon);
        if (!resolved.isValidatedTranslation) unvalidated.add(option.lexiconTermKey);
      }
    }
  }
  return Array.from(unvalidated);
}

/** Real, per direct guidance's own explicit warning ("this specific
 *  acknowledgment no longer honestly covers the new state") — an
 *  acknowledgment is current only when EVERY real, currently-
 *  unvalidated term key was already covered by it; a real, newly-
 *  appeared unvalidated term (from an answer changed after the
 *  acknowledgment was made) makes it stale. */
export function resolveTranslationAcknowledgmentIsCurrent(
  acknowledgment: { acknowledgedUnvalidatedTermKeys: string[] } | undefined,
  currentUnvalidatedTermKeys: string[],
): boolean {
  if (currentUnvalidatedTermKeys.length === 0) return true;
  if (!acknowledgment) return false;
  const ackSet = new Set(acknowledgment.acknowledgedUnvalidatedTermKeys);
  return currentUnvalidatedTermKeys.every(key => ackSet.has(key));
}
