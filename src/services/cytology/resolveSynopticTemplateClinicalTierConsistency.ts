// src/services/cytology/resolveSynopticTemplateClinicalTierConsistency.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed tiering: "Tier 1:
// Diagnostic Classification Categories... Tier 2: Descriptive /
// Morphological Attributes." SynopticField.clinicalTier makes that
// boundary a real, explicit schema fact rather than an implicit
// convention inferred from whether an option happens to carry a
// lexiconTermKey. This function is the real, deterministic check
// that keeps the two facts from ever drifting apart — a genuine
// authoring mistake (a real lexiconTermKey added to a field nobody
// tagged 'tier_1_diagnostic_category', or a field explicitly tagged
// 'tier_2_descriptive' that somehow carries one anyway) gets
// caught here, not discovered by surprise in a live sign-out banner
// or, worse, missed entirely because nothing ever checked.
//
// Real, deliberate scope: this checks ONE direction strictly (any
// real lexiconTermKey-bearing option demands its own field be tagged
// 'tier_1_diagnostic_category', and a field explicitly tagged
// 'tier_2_descriptive' may never carry one) — it does NOT require
// every real Tier 2 field to be explicitly tagged
// 'tier_2_descriptive'. An untagged field is safe by construction
// (nothing about it triggers unvalidated-term tracking either way),
// so exhaustively labeling every real descriptive field a real
// author never intended to put through Lexicon validation adds
// annotation burden without adding any real safety this check
// doesn't already guarantee.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';

export interface ClinicalTierConsistencyFinding {
  fieldId: string;
  reason: 'untagged_field_has_lexicon_option' | 'tier_2_field_has_lexicon_option';
}

/** Real, per direct guidance's own confirmed governance check.
 *  Returns every real finding across the whole template — empty for
 *  a real, fully consistent template, never a placeholder entry. */
export function resolveSynopticTemplateClinicalTierConsistency(
  template: SynopticTemplate,
): ClinicalTierConsistencyFinding[] {
  const findings: ClinicalTierConsistencyFinding[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      const hasLexiconOption = field.options?.some(o => !!o.lexiconTermKey) ?? false;
      if (!hasLexiconOption) continue;
      if (field.clinicalTier === 'tier_2_descriptive') {
        findings.push({ fieldId: field.id, reason: 'tier_2_field_has_lexicon_option' });
      } else if (field.clinicalTier !== 'tier_1_diagnostic_category') {
        findings.push({ fieldId: field.id, reason: 'untagged_field_has_lexicon_option' });
      }
    }
  }
  return findings;
}
