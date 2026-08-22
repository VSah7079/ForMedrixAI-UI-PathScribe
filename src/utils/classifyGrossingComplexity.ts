// src/utils/classifyGrossingComplexity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the Grossing spec's "Toggle
// between Gross Description Mode and Synoptic Reporting Mode" section:
// "Smart Auto-Switching (Context Awareness)... A. LIS Specimen / CPT
// Code (Primary Trigger)... Routine/Simple (defaults to Template
// Mode): CPT 88300, 88302, 88304, 88305... Complex (defaults to
// Narrative Mode): CPT 88307, 88309."
//
// Real, deliberate scope: this app's own Narrative (dictate) and
// Template (structured fields) paths already coexist per specimen,
// independently — a pathologist can use either or both freely (see
// useGrossingCompletion.ts's own dictated-text-as-alternative-to-
// structured-answers design). This classifier is a real, additive
// SUGGESTION signal, not a gate — it never restricts which path is
// actually usable, only which one a specimen's own assigned CPT code
// makes more likely to be the right starting point.
// ─────────────────────────────────────────────────────────────────────────────

export type GrossingModeSuggestion = 'narrative' | 'template' | 'unknown';

// Per the spec's own explicit table. Kept as a small, literal set
// rather than a numeric-range rule — CPT ranges for surgical pathology
// aren't evenly complexity-ordered (88302 sits between two 88305-
// adjacent-but-unrelated codes in the real fee schedule), so a rule
// like "88300-88305 = simple" would be a coincidence of this specific
// table, not a real pattern to generalize from.
const SIMPLE_CPT_CODES = new Set(['88300', '88302', '88304', '88305']);
const COMPLEX_CPT_CODES = new Set(['88307', '88309']);

/**
 * Suggests a starting Grossing mode from a specimen's own, real,
 * assigned CPT code(s) — never a gate, always overridable. Returns
 * 'unknown' (not a default guess) when no assigned code matches
 * either known set, since guessing "probably simple" for a code this
 * app doesn't recognize could be actively wrong for a genuinely
 * complex, uncommon specimen.
 */
export function classifyGrossingComplexity(cptCodes: string[] | undefined): GrossingModeSuggestion {
  const codes = cptCodes ?? [];
  if (codes.some(c => COMPLEX_CPT_CODES.has(c))) return 'narrative';
  if (codes.some(c => SIMPLE_CPT_CODES.has(c))) return 'template';
  return 'unknown';
}
