// src/types/cytology/SynopticTemplate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed sequencing: "Drawer now,
// but structured for easy migration to i18n-keyed schema later."
// This type matches the real, existing schema already used by the 5
// real templates in data/templates/Cytology/ (plain-string labels) —
// it does NOT invent a new, parallel schema format. The future
// i18n-keyed schema (labelKey per field/option, per the later
// "Custom Synoptic Template Engine" spec) is pre-declared here as a
// real, optional, currently-unused field, so the real migration seam
// is explicit in the type itself, not just aspirational — a future
// template can carry BOTH label and labelKey during a real, gradual
// migration, and resolveSynopticFieldLabel.ts is the one, real place
// that decides which one wins, never the renderer itself.
// ─────────────────────────────────────────────────────────────────────────────

export interface SynopticFieldOption {
  id: string;
  label: string;
  /** Real, migration seam — see this file's own header. Undefined for
   *  every real template today. */
  labelKey?: string;
  /** Real, per direct guidance's own confirmed architectural
   *  separation: "Treat internationalization (i18n) strictly as a
   *  software localization effort... Rather than attempting ad-hoc
   *  translation of specialized terms, build a controlled, versioned
   *  dictionary specifically for standard pathology nomenclature."
   *  Deliberately a SEPARATE field from labelKey above — labelKey is
   *  for real, generic UI chrome (never used for this option's own
   *  clinical meaning); this references a real, specific
   *  PathologyLexiconEntry.termKey instead, whenever this option
   *  represents a real, specialized diagnostic/clinical term (a
   *  Bethesda category, a CAP histologic term). Undefined for a real
   *  option with no such clinical-terminology concern (e.g. a plain
   *  "Not specified" choice). */
  lexiconTermKey?: string;
  /** Real, Layer B (Narrative Generation Engine) declaration, per
   *  direct guidance's own confirmed 3-layer architecture ("Layer A:
   *  Structured Data Capture... Layer B: Narrative Generation Engine
   *  — Template logic, conditional rules, sentence assembly...
   *  finalize the narrative generation logic in the primary source
   *  language" before any localization). The exact, real, clinical
   *  English-language phrase this option contributes to a compiled
   *  narrative sentence when selected — e.g. "satisfactory for
   *  evaluation" for the `satisfactory` adequacy option. Deliberately
   *  separate from `label` (UI picklist text) and `lexiconTermKey`
   *  (i18n clinical-term validation, Layer C) — this is real,
   *  English-only, source-language narrative content, authored
   *  independently of both. Undefined means this option contributes
   *  nothing to the compiled narrative — a genuine, deliberate
   *  authoring decision (e.g. "Not specified" or "Other (specify)"
   *  has no fixed narrative content of its own), never an oversight
   *  silently treated as empty text. */
  narrativePhrase?: string;
  snomed?: string;
  icd?: string;
}

export type SynopticFieldType = 'text' | 'longtext' | 'numeric' | 'dropdown' | 'checkboxes';

export interface SynopticField {
  id: string;
  label: string;
  /** Real, migration seam — see this file's own header. Undefined for
   *  every real template today. */
  labelKey?: string;
  type: SynopticFieldType;
  required?: boolean;
  /** Real, per direct guidance's own confirmed tiering: "Tier 1:
   *  Diagnostic Classification Categories... Tier 2: Descriptive /
   *  Morphological Attributes." Makes that boundary a real, explicit
   *  schema fact rather than an implicit convention inferred from
   *  whether an option happens to carry a lexiconTermKey — a future
   *  author adding one to a real Tier 2 field without setting this
   *  would be caught by resolveSynopticTemplateClinicalTierConsistency.ts,
   *  not discovered by surprise in a live sign-out banner. Only
   *  'tier_1_diagnostic_category' fields are ever meant to carry a real
   *  lexiconTermKey on any of their options; only they trigger real
   *  unvalidated-term tracking, inline preview flagging, and
   *  sign-out audit logging. Undefined for every real field this
   *  distinction has never been made for yet — never assumed to be
   *  either tier by default. */
  clinicalTier?: 'tier_1_diagnostic_category' | 'tier_2_descriptive';
  /** Real, Layer B declaration: the sentence this field contributes
   *  to the compiled narrative when answered. `{value}` is replaced
   *  with the resolved narrativePhrase(s) of whichever option(s) were
   *  actually selected — dropdown: that one option's phrase;
   *  checkboxes: every selected option's real phrase, joined with
   *  ", " — or, for a field with no `options` at all (text/longtext/
   *  numeric), the raw answer itself, since a freeform field's own
   *  content already IS real, source-language prose with nothing
   *  further to resolve. Undefined means this field never
   *  contributes a sentence to the compiled narrative (e.g. an
   *  internal tracking field with no real narrative content of its
   *  own) — deliberately opt-in per field, never a blanket default,
   *  so every sentence the real compiler ever produces was a
   *  genuine, reviewed authoring decision, not an accidental
   *  inclusion. */
  narrativeSentenceTemplate?: string;
  /** Real, Layer C (Localization/i18n) migration seam, per direct
   *  guidance's own "Rendering UI strings" scope — mirrors labelKey's
   *  own exact pattern above. The sentence's generic connective
   *  wording ("Procedure:", "The specimen is...") is real, low-risk
   *  UI chrome, genuinely different from the clinical {value} content
   *  it wraps around (that half is a Managed Pathology Lexicon
   *  concern, never this one). resolveSynopticNarrativeSentenceTemplate
   *  is the one, real place that decides which of this pair wins —
   *  the compiler itself never inspects both directly. */
  narrativeSentenceTemplateKey?: string;
  snomed?: string;
  icd?: string;
  options?: SynopticFieldOption[];
}

export interface SynopticSection {
  id: string;
  title: string;
  /** Real, migration seam — see this file's own header. Undefined for
   *  every real template today. */
  titleKey?: string;
  fields: SynopticField[];
}

export interface SynopticTemplate {
  id: string;
  name: string;
  source: string;
  version: string;
  category: string;
  standard: string;
  sections: SynopticSection[];
}
