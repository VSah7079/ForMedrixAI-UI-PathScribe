// src/services/cytology/compileCytologySynopticNarrative.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, Layer B (Narrative Generation Engine), per direct guidance's
// own confirmed 3-layer architecture: "Auto-generating readable
// narrative text from structured diagnostic inputs... is a domain
// logic problem, not a translation problem... Build it using
// modular, deterministic templating (or structured rule evaluation)
// rather than dynamic generative text to ensure safety, consistency,
// and auditability."
//
// This is genuinely, deliberately deterministic — no AI call, no
// dynamic generation. It walks a real template's own sections/fields
// in their real, authored order and assembles whichever real
// sentences the template itself declares (SynopticField.
// narrativeSentenceTemplate / SynopticFieldOption.narrativePhrase —
// see SynopticTemplate.ts's own doc comments). A field or option
// with no real narrative declaration contributes nothing — never a
// silent guess at what it "should" say.
//
// Real, per direct guidance's own explicit sequencing ("finalize the
// narrative generation logic in the primary source language" before
// any localization): the clinical {value} content this compiler
// assembles stays canonical/English UNLESS a real, explicitly
// validated Managed Pathology Lexicon entry exists for the current
// locale (Path Two — see resolvePathologyLexiconTerm.ts's own
// 'narrative' context) — never a guessed or machine-translated
// substitute. The `t` param below is Layer C's OTHER half: real,
// low-risk UI-chrome localization of each sentence's own generic
// wording ("Procedure:", "The specimen is...") via
// narrativeSentenceTemplateKey — the same exact labelKey/t() pattern
// already established for field/option/section labels, deliberately
// kept as its own, separate mechanism from the clinical half above.
//
// Real, per direct guidance's own confirmed correction: this compiler
// no longer returns a plain string. "Direct Spatial Correlation"
// between an unvalidated clinical phrase and its own real
// lexiconTermKey requires the UI layer to render that phrase as its
// own, distinct, hoverable span — a flattened string can't carry
// that. CompiledNarrativeResult.segments preserves each real chunk's
// own provenance; rawText (the same string this function used to
// return directly) stays available for copy/paste, audit logging,
// and "Insert into Notes" — a plain-text destination that was never
// going to render spans regardless.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticTemplate, SynopticField } from '@/types/cytology/SynopticTemplate';
import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';
import { resolveSynopticNarrativeSentenceTemplate } from './resolveSynopticFieldLabel';
import { resolvePathologyLexiconTerm } from './resolvePathologyLexiconTerm';

export interface CompiledNarrativeSegment {
  text: string;
  /** Real, per direct guidance's own confirmed requirement — true
   *  only for a segment whose own real clinical content came from an
   *  option's canonical `narrativePhrase` fallback because the
   *  current locale had no real, validated Lexicon entry on record.
   *  False for every real UI-chrome segment (sentence template text)
   *  and every real, successfully-validated clinical segment. */
  isUnvalidatedFallback: boolean;
  /** Real, per direct guidance's own "Key Traceability on Focus/
   *  Hover" requirement — the exact real lexiconTermKey that
   *  produced this segment, so the UI can surface it directly on the
   *  highlighted span. Only ever set when isUnvalidatedFallback is
   *  true AND the option itself carried a real lexiconTermKey (a
   *  plain option with no lexiconTermKey at all was never a Lexicon
   *  concern in the first place, so it's never flagged). */
  lexiconTermKey?: string;
  /** Real, the current locale this segment was resolved against —
   *  carried alongside lexiconTermKey so a real UI tooltip can state
   *  plainly which locale has no validated entry yet, not just that
   *  one is missing. Only set alongside lexiconTermKey. */
  fallbackLocale?: string;
}

export interface CompiledNarrativeResult {
  segments: CompiledNarrativeSegment[];
  /** Real, plain-text form — every real segment's own text
   *  concatenated in order, identical to what this function used to
   *  return directly before this structured-output change. The real
   *  destination for copy/paste, audit logging, and "Insert into
   *  Notes" (a plain-text field with nowhere to render a span). */
  rawText: string;
  /** Real, per direct guidance's own confirmed requirement — true
   *  when any real segment in this exact result has
   *  isUnvalidatedFallback set. A real, cheap, already-computed
   *  summary so a caller never has to re-scan segments itself just
   *  to answer "does this narrative contain anything unvalidated." */
  hasUnvalidatedTerms: boolean;
}

function plainSegment(text: string): CompiledNarrativeSegment {
  return { text, isUnvalidatedFallback: false };
}

/** Real, per direct guidance's own dropdown-vs-checkboxes distinction:
 *  a dropdown answer is a single real option id (or undefined); a
 *  checkboxes answer is zero or more, each resolved and flagged
 *  independently — a real, mixed case (one validated option, one
 *  unvalidated) produces one plain segment and one flagged segment,
 *  joined by a real, plain ", " separator segment of its own. A
 *  field with no real `options` at all (text/longtext/numeric) has
 *  no option to resolve — its own raw answer already IS the real,
 *  source-language content, used directly as a single plain segment.
 *
 *  Real, Path Two addition: an option with a real `lexiconTermKey`
 *  consults the Managed Pathology Lexicon (narrative context — see
 *  resolvePathologyLexiconTerm.ts's own context param) for a real,
 *  validated, locale-appropriate phrase, falling back to the
 *  option's own real, canonical `narrativePhrase` — flagged as
 *  isUnvalidatedFallback — whenever the current locale has no real,
 *  validated entry on record. Per direct guidance's own "default to
 *  canonical source term rather than guessing," never a fabricated
 *  translation. */
function resolveFieldNarrativeValueSegments(
  field: SynopticField,
  answer: string | string[] | undefined,
  locale: PathologyLexiconLocale | 'en',
  lexicon: PathologyLexiconEntry[],
): CompiledNarrativeSegment[] {
  if (answer === undefined) return [];
  if (!field.options) {
    const raw = Array.isArray(answer) ? answer.join(', ') : answer;
    return raw.trim() ? [plainSegment(raw.trim())] : [];
  }
  const selectedIds = Array.isArray(answer) ? answer : [answer];
  const valueSegments: CompiledNarrativeSegment[] = [];
  for (const id of selectedIds) {
    const option = field.options.find(o => o.id === id);
    if (!option) continue;
    if (option.lexiconTermKey) {
      const resolved = resolvePathologyLexiconTerm(option.lexiconTermKey, locale, lexicon, 'narrative');
      if (resolved.isValidatedTranslation) {
        valueSegments.push(plainSegment(resolved.text));
        continue;
      }
      if (option.narrativePhrase) {
        valueSegments.push({
          text: option.narrativePhrase,
          isUnvalidatedFallback: true,
          lexiconTermKey: option.lexiconTermKey,
          fallbackLocale: locale,
        });
      }
      continue;
    }
    if (option.narrativePhrase) valueSegments.push(plainSegment(option.narrativePhrase));
  }
  // Real, per direct guidance's own confirmed checkboxes-joining
  // behavior (unchanged from before this structured-output change)
  // — every prior real segment gets its own, plain ", " separator
  // before the next one, never before the first.
  const withSeparators: CompiledNarrativeSegment[] = [];
  valueSegments.forEach((seg, i) => {
    if (i > 0) withSeparators.push(plainSegment(', '));
    withSeparators.push(seg);
  });
  return withSeparators;
}

/** Real, per direct guidance's own confirmed compiler entry point.
 *  Returns the real, assembled narrative — as structured segments,
 *  never a flattened string — for a real template + a real set of
 *  answers, in the template's own real section/field order. Returns
 *  an empty segment list (and empty rawText) when no real field both
 *  declares a narrative sentence AND has a real, current answer —
 *  never a placeholder sentence claiming there's nothing to report.
 *
 *  Real, Layer C addition: `t` resolves each field's own real
 *  narrativeSentenceTemplateKey when the template declares one (see
 *  resolveSynopticFieldLabel.ts's own resolver) — real, low-risk UI
 *  chrome localization, genuinely separate from the clinical
 *  {value} content itself (Path Two, resolved per-option above). */
export function compileCytologySynopticNarrative(
  template: SynopticTemplate,
  answers: Record<string, string | string[]>,
  t: (key: string) => string,
  locale: PathologyLexiconLocale | 'en',
  lexicon: PathologyLexiconEntry[],
): CompiledNarrativeResult {
  const fieldSegmentGroups: CompiledNarrativeSegment[][] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      const sentenceTemplate = resolveSynopticNarrativeSentenceTemplate(field, t);
      if (!sentenceTemplate) continue;
      const valueSegments = resolveFieldNarrativeValueSegments(field, answers[field.id], locale, lexicon);
      if (valueSegments.length === 0) continue;
      // Real, per direct guidance's own confirmed template shape —
      // every real sentenceTemplate across every real template has
      // exactly one "{value}" placeholder (chrome text before,
      // optional chrome text after, e.g. "Cellularity: {value}." or
      // a pure "{value}" passthrough with no chrome at all on either
      // side); split on it directly rather than a single-shot
      // .replace(), so the chrome itself can be its own, real, never-
      // flagged segment surrounding the clinical value segment(s).
      const [before, after] = sentenceTemplate.split('{value}');
      const fieldSegments: CompiledNarrativeSegment[] = [];
      if (before) fieldSegments.push(plainSegment(before));
      fieldSegments.push(...valueSegments);
      if (after) fieldSegments.push(plainSegment(after));
      fieldSegmentGroups.push(fieldSegments);
    }
  }
  const segments: CompiledNarrativeSegment[] = [];
  fieldSegmentGroups.forEach((group, i) => {
    if (i > 0) segments.push(plainSegment(' '));
    segments.push(...group);
  });
  return {
    segments,
    rawText: segments.map(s => s.text).join(''),
    hasUnvalidatedTerms: segments.some(s => s.isUnvalidatedFallback),
  };
}
