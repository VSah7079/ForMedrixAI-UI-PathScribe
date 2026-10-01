// src/utils/applyGrossingRefinement.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "The AI call can happen in the
// background... not necessarily going to serialize the accession event with
// Grossing immediately." AccessionPage.tsx now creates every Case with a
// real, immediately-usable default Grossing Template for every specimen,
// then refines it in the background once the real AI evaluation resolves —
// see that file's own refineGrossingTemplatesInBackground() for the full
// design.
//
// Real feature, per direct follow-up on the same session: "Do we capture
// failed template association? That might be a good quality measure."
// Confirmed directly before this existed: the AI's routing confidence,
// reasoning, and fallback/failure status for the initial Grossing Template
// assignment was never persisted anywhere in the real data model — only
// ever shown transiently (a toast, React state), gone the moment the page
// was navigated away from. This now records a real, permanent outcome per
// specimen (Case.ts's own GrossingReportInstance.templateAssignmentOutcome)
// — a genuinely different, valuable signal from whether the template itself
// changed: a specimen where the AI confidently agreed with the default is a
// real, different outcome from one where the AI call failed outright, even
// though neither one changes the specimen's actual templateId.
//
// This is the pure half of both features, extracted specifically so the
// one, load-bearing safety property — never silently swap a specimen's
// template out from under someone who has already started grossing it — is
// independently, deterministically testable, without depending on the real
// AI's own non-deterministic output.
// ─────────────────────────────────────────────────────────────────────────────

import type { GrossingReportInstance } from '@/types/case/Case';
import type { GrossingTemplateAssignment } from '@/services/grossing/IGrossingEvaluationService';

export interface GrossingRefinementResult {
  reports: GrossingReportInstance[];
  /** True when at least one real specimen's actual templateId changed —
   *  the caller uses this specifically to decide whether the
   *  user-facing "Grossing Templates refined" toast is warranted. A
   *  quality-outcome-only update (see anyDataChanged) is real and
   *  worth persisting, but not worth interrupting the accessioner
   *  about. */
  anyTemplateChanged: boolean;
  /** True when any real report object changed at all — including a
   *  report that only got its templateAssignmentOutcome recorded for
   *  the first time, with no template change. The caller uses this to
   *  decide whether a real updateCase() persist is warranted at all. */
  anyDataChanged: boolean;
}

/** Real, load-bearing safety check: a grossing report's TEMPLATE is only
 *  safe to change when it's still genuinely pristine — the
 *  accessioner-time default, never touched. `status !== 'draft'` means
 *  grossing was already finalized; a real answer already recorded means
 *  the PA is actively working from whatever template it currently has,
 *  even if still nominally 'draft'. Either way, silently swapping the
 *  template under them would be actively disruptive, not helpful. Does
 *  NOT gate whether the real quality-outcome metadata gets recorded —
 *  that's a real, separate, always-safe signal to capture regardless. */
export function isGrossingReportPristine(report: GrossingReportInstance): boolean {
  return report.status === 'draft' && Object.keys(report.answers).length === 0;
}

/** Real, pure mapping from the AI evaluation's own real output shape
 *  (GrossingTemplateAssignment) to the real, persisted quality-outcome
 *  shape — see that field's own doc comment in Case.ts for the full
 *  reasoning behind each of the four real outcomes. */
function toTemplateAssignmentOutcome(
  assignment: GrossingTemplateAssignment,
  evaluatedAt: string,
): NonNullable<GrossingReportInstance['templateAssignmentOutcome']> {
  if (assignment.fromOverride) {
    return { outcome: 'override', reason: assignment.reason, evaluatedAt };
  }
  if (assignment.belowThreshold) {
    return { outcome: 'fallback', confidence: assignment.confidence, reason: assignment.reason, evaluatedAt };
  }
  return { outcome: 'ai', confidence: assignment.confidence, reason: assignment.reason, evaluatedAt };
}

/**
 * Applies the real AI's evaluation on top of a Case's current, real
 * grossingReports — real data in, real data out, no I/O. Every report
 * with a real, matching assignment gets its templateAssignmentOutcome
 * recorded, regardless of pristine status — a real quality signal worth
 * keeping either way. Only a genuinely pristine report (see
 * isGrossingReportPristine) with a real, different suggested template
 * has its actual templateId/templateName replaced. A report with no
 * real, matching assignment at all (the AI never produced one for this
 * specimen) is returned completely unchanged, same object reference.
 */
export function applyGrossingRefinement(
  currentReports: GrossingReportInstance[],
  assignments: GrossingTemplateAssignment[],
  now: () => string = () => new Date().toISOString(),
): GrossingRefinementResult {
  const assignmentBySpecimenId = new Map(assignments.map(a => [a.specimenId, a]));
  let anyTemplateChanged = false;
  let anyDataChanged = false;

  const reports = currentReports.map(report => {
    const assignment = assignmentBySpecimenId.get(report.specimenId);
    if (!assignment) return report; // genuinely nothing real to record for this specimen

    const evaluatedAt = now();
    const templateAssignmentOutcome = toTemplateAssignmentOutcome(assignment, evaluatedAt);
    const templateChanges = isGrossingReportPristine(report) && assignment.templateId !== report.templateId;

    anyDataChanged = true;
    if (templateChanges) anyTemplateChanged = true;

    return {
      ...report,
      ...(templateChanges ? { templateId: assignment.templateId, templateName: assignment.templateName } : {}),
      templateAssignmentOutcome,
      updatedAt: evaluatedAt,
    };
  });

  return { reports, anyTemplateChanged, anyDataChanged };
}

/** Real, pure builder for the 'failed' outcome — the real AI call
 *  itself threw (network/provider error), not just a low-confidence
 *  result. Applied uniformly to every specimen that was awaiting a
 *  real evaluation, since a single failed evaluateGrossingTemplateAssignment
 *  call genuinely covers the whole case's specimens at once (one real
 *  request, not one per specimen). Never touches templateId/
 *  templateName/status/answers — the specimen keeps its safe, default
 *  template; only the quality-outcome metadata records that a real
 *  evaluation was attempted and genuinely failed. */
export function markGrossingRefinementFailed(
  currentReports: GrossingReportInstance[],
  errorMessage: string,
  now: () => string = () => new Date().toISOString(),
): GrossingReportInstance[] {
  const attemptedAt = now();
  return currentReports.map(report => ({
    ...report,
    templateAssignmentOutcome: { outcome: 'failed' as const, errorMessage, evaluatedAt: attemptedAt },
    updatedAt: attemptedAt,
  }));
}

