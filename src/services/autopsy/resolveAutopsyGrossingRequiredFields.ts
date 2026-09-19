// src/services/autopsy/resolveAutopsyGrossingRequiredFields.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed tiered-validation
// architecture: "Instead of making fields required by default, use a
// tiered, state-driven approach" — Tier 1 (unconditional gatekeeper
// fields, EditorField.required) and Tier 2 (conditional fields, only
// required once their own real parent answer triggers them,
// EditorField.requiredIf) are both real, pure, resolved here. Tier 3
// (soft warnings at sign-out for unanswered secondary fields) is
// deliberately NOT a "required" concept at all — it never blocks, so
// it has no real place in this file; a real sign-out screen surfaces
// it separately by simply checking which real, non-required fields
// are still blank.
//
// Reuses SynopticEditor.tsx's own exported isVisible() for the real
// Tier 2 check — requiredIf shares the exact same real
// VisibilityCondition shape visibleWhen already uses, so the exact
// same real matching logic applies; never a second, parallel
// implementation.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorTemplate, EditorField } from '../../components/Config/Protocols/SynopticEditor';
import { isVisible } from '../../components/Config/Protocols/SynopticEditor';

/** Real, per direct guidance's own confirmed Tier 1 + Tier 2 logic.
 *  A real field is currently required if EITHER its own, real,
 *  unconditional `required` is true (Tier 1), OR its own real
 *  `requiredIf` condition is currently satisfied by the real, given
 *  answers (Tier 2) — never both checked redundantly, never a field
 *  with neither ever appearing here (Tier 3 fields are real,
 *  optional, always). */
export function resolveAutopsyGrossingRequiredFields(
  template: EditorTemplate,
  answers: Record<string, string | string[]>,
): EditorField[] {
  const required: EditorField[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.required || (field.requiredIf && isVisible(field.requiredIf, answers))) {
        required.push(field);
      }
    }
  }
  return required;
}

function isAnswered(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

/** Real, per direct guidance's own confirmed Tier 3 sign-out
 *  behavior: "Hard Blocks: Missing gatekeeper answers or incomplete
 *  conditional chains." The real, actual list a sign-out screen
 *  blocks on — every real, currently-required field (Tier 1 or
 *  triggered Tier 2) that genuinely has no real answer yet. */
export function resolveAutopsyGrossingMissingRequiredFields(
  template: EditorTemplate,
  answers: Record<string, string | string[]>,
): EditorField[] {
  return resolveAutopsyGrossingRequiredFields(template, answers)
    .filter(field => !isAnswered(answers[field.id]));
}
