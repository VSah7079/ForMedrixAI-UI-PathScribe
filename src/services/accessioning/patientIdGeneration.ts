// src/services/accessioning/patientIdGeneration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 377. Accession fills in a Patient ID when the accessioner leaves it
// blank: AUTO-<the case id without its prefix>. Pete: when an organisation
// requires Patient ID (Field Requirements), the generated one satisfies it,
// "unless it fails for some reason, in that case an alert".
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

/** The generated Patient ID for a case, or null when one can't be made from its id. */
export function autoPatientId(caseId: string | null | undefined): string | null {
  const tail = (caseId ?? '').slice(4).trim();
  return tail ? `AUTO-${tail}` : null;
}

/**
 * The Patient ID to save: what was entered, else a generated one. Fails only
 * when nothing was entered, none could be generated, and the organisation
 * requires one; without the requirement, the patient is saved without an ID.
 */
export function resolveSubmittedPatientId(
  entered: string, caseId: string | null | undefined, required: boolean,
): { ok: true; value: string; generated: boolean } | { ok: false } {
  const typed = entered.trim();
  if (typed) return { ok: true, value: typed, generated: false };
  const auto = autoPatientId(caseId);
  if (auto) return { ok: true, value: auto, generated: true };
  return required ? { ok: false } : { ok: true, value: '', generated: false };
}
