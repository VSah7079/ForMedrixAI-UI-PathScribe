// src/types/cytology/PathologyLexicon.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed architecture: "Rather than
// attempting ad-hoc translation of specialized terms, build a
// controlled, versioned dictionary specifically for standard
// pathology nomenclature (CAP protocols, Bethesda 2014/2020
// categories). If a term isn't explicitly validated in the target
// language lexicon, the system should default to the canonical source
// term (or Latin/English standard) rather than guessing."
//
// Real, deliberate distinction from resolveSynopticFieldLabel.ts's own
// labelKey/t() mechanism: THAT mechanism is for real, generic UI
// chrome (section titles, field labels like "Specimen"/"Procedure")
// — real, low-risk software localization. THIS lexicon is
// specifically for real, specialized diagnostic/clinical terminology
// (Bethesda categories, CAP-specific histologic terms) where an
// unreviewed machine guess is a real, unacceptable patient-safety
// risk. A term with no real, explicitly validated translation on
// record NEVER falls back to a guessed translation — only to its own
// real, canonical source-language term.
// ─────────────────────────────────────────────────────────────────────────────

export type PathologyLexiconLocale = 'fr' | 'de' | 'nl' | 'ko';

export interface PathologyLexiconTranslation {
  text: string;
  /** Real, Path Two — per direct guidance's own confirmed decision
   *  and linguistic rationale: a validated LABEL translation (a
   *  standalone, nominative-form picklist term) doesn't always read
   *  naturally once embedded mid-sentence in a compiled narrative —
   *  grammatical case, capitalization, and citation form can
   *  genuinely differ between the two contexts in many target
   *  languages. Undefined means this locale's own validated
   *  narrative-context form is identical to `text` (the common case)
   *  — real callers fall back to `text` for narrative use, never
   *  silently inventing a different form. Only ever set when a real,
   *  named validator (see `validatedBy` below — the same real
   *  attribution covers both fields; there is no separate approval
   *  record for this one) actively confirmed this locale's grammar
   *  genuinely requires a distinct narrative form — see
   *  resolvePathologyLexiconNarrativeTextRedundancy.ts for the real,
   *  deterministic check that flags a real `narrativeText` which
   *  turned out identical to `text` after all, so a stale or
   *  unnecessary override doesn't linger. */
  narrativeText?: string;
  /** Real, per direct guidance's own "Clinical Disclaimers Baseline"
   *  — every real translation is attributed to a real, named
   *  validator; this lexicon never accepts an anonymous or
   *  machine-generated entry as "validated." */
  validatedBy: string;
  validatedAt: string;
  /** Real, versioned — Bethesda/CAP terminology itself is revised
   *  over real editions (e.g. "Bethesda 2014" vs "Bethesda 2023");
   *  a real, prior validated translation stays on record rather than
   *  being silently overwritten when a term's own source definition
   *  changes. */
  version: number;
}

export interface PathologyLexiconEntry {
  /** Real, stable key — e.g. "bethesda.thyroid.category.iii",
   *  "cap.thyroid.histology.papillary_carcinoma". Never the raw
   *  option id from a specific template's own JSON — a shared
   *  clinical term used across multiple real templates has exactly
   *  one real lexicon entry, not one per template. */
  termKey: string;
  /** Real, per direct guidance — "the canonical source term (or
   *  Latin/English standard)." Always present; this is the real,
   *  guaranteed fallback for every locale with no validated
   *  translation on record. */
  canonicalTerm: string;
  /** Real, per-locale validated translations — a real, empty object
   *  for a term with no real, reviewed translation in ANY locale yet;
   *  never a placeholder entry standing in for "not yet done." */
  translations: Partial<Record<PathologyLexiconLocale, PathologyLexiconTranslation>>;
}
