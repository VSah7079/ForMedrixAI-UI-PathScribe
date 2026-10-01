// src/services/billing/shouldAutoUpgradeComplexity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own detailed spec and follow-up discussion:
// "Auto-Derivation Fallback: if a user types text into a specimen-
// specific microscopic section, automatically upgrade complexity to
// GROSS_AND_MICRO." The real, honest signal this app can actually use:
// a real answer in a specimen's own SynopticReportInstance (the
// diagnostic checklist, post-microscopy) - never GrossingReportInstance
// (a completely separate, customer-configured, pre-microscopy record
// type that this function never reads), and only when that instance's
// own template is genuinely diagnostic (isDiagnosticProtocol/
// isTemplateDiagnostic - excludes procedural/Grossing-purposed
// protocols even if one were ever mistakenly linked through this path).
//
// Honest, disclosed limitation, per direct guidance's own explanation
// of real CAP eCP structure: a handful of elements (e.g. Tumor Size,
// Specimen Size, Intactness) are sometimes filled from gross
// measurement alone, and the underlying CAP XML carries no formal
// isGross tag distinguishing them from genuinely microscopy-derived
// elements (histologic grade, margins, LVI). This function cannot
// distinguish that narrow case and does not try to - a real answer in
// a diagnostic synoptic is treated as evidence of real post-grossing
// work, accepting that a small number of edge cases may fire slightly
// early. This is a real, accepted trade-off, not an oversight.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, minimal shape - only what this function actually reads, so
 *  callers never need to construct a full SynopticReportInstance just
 *  to check this. */
export interface SynopticAnswersForComplexity {
  answers: Record<string, string | string[]>;
}

const hasRealAnswer = (value: string | string[] | undefined): boolean => {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
};

/** Real, per direct guidance - true only when the specimen's own
 *  diagnostic synoptic (never a Grossing checklist) has at least one
 *  real, non-empty answer. Callers should only call setComplexity to
 *  GROSS_AND_MICRO when this is true AND the specimen's current
 *  complexity is undefined or GROSS_ONLY - never downgrade a real,
 *  explicit GROSS_AND_MICRO declaration back based on this signal
 *  alone, and never override a pathologist's own explicit GROSS_ONLY
 *  override without this real, positive evidence. */
export function shouldAutoUpgradeComplexity(
  instance: SynopticAnswersForComplexity | undefined,
  templateIsDiagnostic: boolean
): boolean {
  if (!instance) return false;
  if (!templateIsDiagnostic) return false;
  return Object.values(instance.answers).some(hasRealAnswer);
}

/** Real, per direct guidance's own design discussion: complexity is
 *  treated as a business-logic rule resolved at read time, not a
 *  canonical mutation written into specimen state on every keystroke
 *  - keeps a large, heavily-used, live-editing component
 *  (RightSynopticPanel.tsx) untouched, and keeps a clear, permanent
 *  distinction between what a pathologist explicitly declared
 *  (specimen.complexity, never touched by this function) and what the
 *  system infers.
 *
 *  Real, deliberate difference from the snippet floated in
 *  discussion: returns undefined (never a fabricated
 *  DEFAULT_COMPLEXITY) when neither an explicit declaration nor real
 *  auto-derivation evidence exists.
 *  resolveSpecimenDictionaryBaseCptCode already handles undefined
 *  complexity correctly (falls back to the dictionary's own
 *  unconditional default) - inventing a blanket default here (e.g.
 *  always GROSS_ONLY) would risk actively wrong billing for a
 *  genuinely complex specimen whose synoptic just hasn't been touched
 *  yet, which is worse than the existing, honest "not yet known"
 *  fallback.
 *
 *  Async resolution (which SynopticReportInstance(s) belong to this
 *  specimen, and whether each one's own template is diagnostic)
 *  happens at the call site - same "resolve async data before calling
 *  the pure function" posture as
 *  resolveSpecimenDictionaryBaseCptCode's own allDictionaryEntries
 *  parameter, never fetched from inside this function. A specimen can
 *  carry more than one real synoptic instance (see
 *  ProtocolChangeModal.tsx's own doc comment) - any one of them having
 *  real, diagnostic answers is sufficient evidence. */
export function getEffectiveComplexity(
  specimen: { complexity?: 'GROSS_ONLY' | 'GROSS_AND_MICRO' },
  relevantSynopticInstances: { instance: SynopticAnswersForComplexity; templateIsDiagnostic: boolean }[]
): 'GROSS_ONLY' | 'GROSS_AND_MICRO' | undefined {
  if (specimen.complexity) return specimen.complexity;
  const shouldUpgrade = relevantSynopticInstances.some(
    ({ instance, templateIsDiagnostic }) => shouldAutoUpgradeComplexity(instance, templateIsDiagnostic)
  );
  return shouldUpgrade ? 'GROSS_AND_MICRO' : undefined;
}
