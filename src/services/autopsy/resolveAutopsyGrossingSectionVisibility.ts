// src/services/autopsy/resolveAutopsyGrossingSectionVisibility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Autopsy Grossing Synoptic spec's own Part B ("Dynamic
// Section Revelation Rules" — the Specimen-to-Module Mapping Rule
// Matrix). Kept as a real, pure, standalone function per this whole
// module's own "no inline logic in the UI" discipline — a future
// rendering layer only calls this and applies its result, never
// re-derives the mapping itself.
//
// Real, deliberate split into two real functions rather than one:
// Rule Sets 1-3 key off a real, whole-specimen Container Type;
// Rule Set 4 (Targeted Organ / Multi-Specimen Collections) keys off a
// genuinely different real input — a specific organ, per discrete
// excised specimen — not a container type at all. Forcing both into
// one input shape would blur a real, meaningful distinction the spec
// itself draws.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTOPSY_GROSSING_SECTION_IDS = [
  'external_examination',
  'head_and_neck',
  'cardiovascular_system',
  'respiratory_system',
  'gastrointestinal_hepatobiliary',
  'genitourinary_endocrine',
  // Real, per direct guidance's own confirmed canonical organ
  // vocabulary follow-up — this section's own real content
  // (data/templates/Autopsy/autopsy_gross_examination.json) has since
  // been authored, resolving the real, honest gap this file's own
  // header comment originally flagged (AutopsyOrganCode.ts no longer
  // needs a separate string-literal union for it).
  'musculoskeletal_hematopoietic',
] as const;

export type AutopsyGrossingSectionId = (typeof AUTOPSY_GROSSING_SECTION_IDS)[number];

export interface AutopsySectionVisibility {
  sectionId: AutopsyGrossingSectionId;
  visible: boolean;
}

/** Real, per Part B's own three whole-specimen container types. */
export type AutopsySpecimenContainerType = 'whole_body' | 'head_and_neck' | 'thoraco_abdominal';

const VISIBLE_SECTIONS_BY_CONTAINER: Record<AutopsySpecimenContainerType, AutopsyGrossingSectionId[]> = {
  // Rule Set 1 — Whole Body (Complete 3-Cavity Autopsy): every real section revealed.
  whole_body: [...AUTOPSY_GROSSING_SECTION_IDS],
  // Rule Set 2 — Head & Neck Only (or Cranial Vault): only External
  // Exam (real, per spec: "filtered strictly to facial, scalp,
  // conjunctival, and neck trauma inputs" — the filtering itself is
  // real, separate, deferred UI work, not a section-visibility
  // concern) and Head & Neck itself. Musculoskeletal & Hematopoietic
  // stays hidden here — spleen, lymph nodes, and bone marrow are not
  // head-and-neck-limited structures.
  head_and_neck: ['external_examination', 'head_and_neck'],
  // Rule Set 3 — Thoraco-Abdominal (Truncal Autopsy): every real
  // section except Head & Neck. Real, deliberate addition:
  // Musculoskeletal & Hematopoietic is included here — spleen and
  // abdominal/mediastinal lymph nodes are genuinely truncal
  // structures a real thoraco-abdominal autopsy would examine.
  thoraco_abdominal: [
    'external_examination', 'cardiovascular_system', 'respiratory_system',
    'gastrointestinal_hepatobiliary', 'genitourinary_endocrine', 'musculoskeletal_hematopoietic',
  ],
};

export function resolveAutopsyGrossingSectionVisibility(
  containerType: AutopsySpecimenContainerType,
): AutopsySectionVisibility[] {
  const visible = new Set(VISIBLE_SECTIONS_BY_CONTAINER[containerType]);
  return AUTOPSY_GROSSING_SECTION_IDS.map(sectionId => ({ sectionId, visible: visible.has(sectionId) }));
}

/** Real, per Part B's own Rule Set 4 — the two real, named examples
 *  (Specimen B: Brain -> Section 2 only; Specimen C: Heart -> Section
 *  3 only). Deliberately only the organs the spec itself names —
 *  never fabricating additional organ->section mappings it doesn't
 *  give. */
export type AutopsyTargetedOrgan = 'brain' | 'heart';

const ONLY_VISIBLE_SECTION_BY_ORGAN: Record<AutopsyTargetedOrgan, AutopsyGrossingSectionId> = {
  brain: 'head_and_neck',
  heart: 'cardiovascular_system',
};

export function resolveAutopsyTargetedOrganSectionVisibility(
  organ: AutopsyTargetedOrgan,
): AutopsySectionVisibility[] {
  const onlyVisible = ONLY_VISIBLE_SECTION_BY_ORGAN[organ];
  return AUTOPSY_GROSSING_SECTION_IDS.map(sectionId => ({ sectionId, visible: sectionId === onlyVisible }));
}
