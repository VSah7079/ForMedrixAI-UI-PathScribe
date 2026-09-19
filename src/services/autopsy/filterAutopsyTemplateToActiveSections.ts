// src/services/autopsy/filterAutopsyTemplateToActiveSections.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed organ-driven section
// visibility — the final wiring step. Everything up to this point
// (resolveActiveAutopsyGrossingSections, Specimen.organCodes, the
// AccessionPage picker) fed into this: the actual template a
// pathologist works from should only ever show sections for organs
// genuinely present among the case's specimens.
//
// Deliberately scoped to ONLY the real Autopsy template
// (template.category === 'AUTOPSY') — every other real template
// (Surgical, Cytology, etc.) passes through this function completely
// unaffected, never touched.
//
// Deliberately returns a NEW template object (never mutates the input
// in place) — the real caller (RightSynopticPanel.tsx) loads templates
// through a real, shared cache (getTemplateCached); mutating a cached
// object's own sections array would corrupt it for every other real
// caller sharing that same cache entry.
//
// Also real, per Part B's own Rule Set 2 ("Head & Neck Only ...
// Section 1 (External Exam): Revealed, but filtered to facial/scalp/
// conjunctival/neck trauma"): once External Examination is the ONLY
// other real section active alongside Head & Neck, its own fields get
// narrowed too — not just the section list. Real, judgment-based
// mapping from the spec's own body-region language to this section's
// actual fields (mechanism-based checkboxes, not a region map): whole-
// body measurements (weight, length, BMI) are genuinely inapplicable
// when only head/neck tissue exists to examine, so they're dropped;
// rigor/livor mortis, medical intervention devices (ETT/trach is
// directly head/neck-relevant), and surface trauma all stay, since
// each can still be meaningfully documented on the tissue that IS
// present. Kept honest about this being a real interpretation, not a
// verbatim field-by-field mapping the spec itself never gave.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import { resolveActiveAutopsyGrossingSections, type AutopsySpecimenForSectionDerivation } from './resolveActiveAutopsyGrossingSections';

/** Real fields that stay meaningful on an External Examination when
 *  only head/neck tissue is present. See this file's own header
 *  comment for the reasoning behind each inclusion/exclusion. */
const EXTERNAL_EXAM_HEAD_NECK_ONLY_FIELD_IDS = new Set([
  'rigor_mortis', 'livor_mortis', 'medical_intervention_devices', 'surface_injuries_trauma',
]);

export function filterAutopsyTemplateToActiveSections(
  template: EditorTemplate,
  specimens: AutopsySpecimenForSectionDerivation[],
): EditorTemplate {
  if (template.category !== 'AUTOPSY') return template;

  const activeSectionIds = resolveActiveAutopsyGrossingSections(specimens);
  const isHeadAndNeckOnly = activeSectionIds.size === 2 && activeSectionIds.has('head_and_neck');

  return {
    ...template,
    sections: template.sections
      .filter(section => activeSectionIds.has(section.id as any))
      .map(section =>
        isHeadAndNeckOnly && section.id === 'external_examination'
          ? { ...section, fields: section.fields.filter(f => EXTERNAL_EXAM_HEAD_NECK_ONLY_FIELD_IDS.has(f.id)) }
          : section
      ),
  };
}
