// src/pages/SynopticReportPage/hooks/buildSynopticNarrativePrompt.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed PS-275 scope (Phase 2 of the
// foundational AI sync, the reverse of PS-274): "A way to build the
// actual prompt from the current synoptic answers (mirroring
// evaluateSynopticAssignment()'s own real pattern of assembling a
// structured prompt from specimen/field data)."
//
// Kept as its own pure, testable function — no AI call, no React state
// — mirroring buildReviewFieldsFromAiSuggestions.ts's own real split:
// the actual generateNarrative() call and review-state wiring belong
// to the real caller (PathScribeAIService.generateNarrativeFromSynopticAnswers,
// then a hook/handler in SynopticReportPage.tsx), not here.
//
// Real, deliberate style match: mirrors PathScribeAIService's own
// existing suggestSynopticFields() prompt construction (the
// "FIELDS (id | label | ...)" list style) rather than inventing a
// second, divergent prompt convention for the reverse direction.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorTemplate } from '../../../components/Config/Protocols/SynopticEditor';

function resolveAnswerDisplayValue(
  value: string | string[] | undefined,
  optionsById: Map<string, string>,
): string | undefined {
  if (value === undefined) return undefined;
  const ids = Array.isArray(value) ? value : [value];
  const labels = ids.map(id => optionsById.get(id) ?? id).filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : undefined;
}

/** Real, per direct guidance's own confirmed prompt-building
 *  requirement. Resolves every real, answered field's own option
 *  label(s) from the real template (never raw ids in the prompt —
 *  the AI should read "Present and examined," not
 *  "spleen_status_present"), grouped under the real section titles a
 *  pathologist would recognize. Genuinely unanswered fields are
 *  silently omitted — never padded with a placeholder that would read
 *  as a real, negative finding to the AI. */
export function buildSynopticNarrativePrompt(
  template: EditorTemplate,
  answers: Record<string, string | string[]>,
): { system: string; prompt: string } {
  const sectionBlocks: string[] = [];

  for (const section of template.sections) {
    const optionsById = new Map<string, string>();
    for (const field of section.fields) {
      for (const option of field.options) optionsById.set(option.id, option.label);
    }

    const lines: string[] = [];
    for (const field of section.fields) {
      const display = resolveAnswerDisplayValue(answers[field.id], optionsById);
      if (display !== undefined) lines.push(`- ${field.label}: ${display}`);
    }

    if (lines.length > 0) sectionBlocks.push(`${section.title}:\n${lines.join('\n')}`);
  }

  const answeredFieldsText = sectionBlocks.join('\n\n');

  return {
    system: 'You are a pathology AI assistant. Write in formal, third-person pathology report prose. Return only the narrative text — no markdown, no headers, no preamble.',
    prompt: `Write a gross pathology narrative from the following synoptic findings. Group related findings into coherent paragraphs by anatomic system; do not simply restate each field as its own sentence.

SYNOPTIC FINDINGS (by section):
${answeredFieldsText}

Write only the narrative prose itself.`,
  };
}
