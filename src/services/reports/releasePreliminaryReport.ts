// src/services/reports/releasePreliminaryReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research and design recommendation ("Provide a
// Manual Trigger: Give users a clean 'Release as Preliminary' button
// on the diagnostic sign-out screen at any point before final
// verification") — the manual pathologist action identified as the
// primary trigger in over 80% of real preliminary-report cases (a
// bone marrow biopsy showing acute leukemia, a transplant kidney
// biopsy showing acute rejection — the pathologist releases a partial
// finding immediately, then leaves the case open for special stains/
// IHC/flow). Built first, deliberately, ahead of any automatic event
// hooks (ROSE completion, gross-only release, delayed-ancillary
// prompts) — those would all dispatch through this exact same real
// mechanism, just from a different trigger point; this is the one,
// real foundation they'd all need underneath them, not a separate
// pipeline duplicated per trigger.
//
// Real, deliberate default behavior, per the same direct guidance:
// pulls whatever text currently exists in Preliminary Diagnosis and
// Specimen Source (buildOruR01Payload's own real, existing fields —
// nothing new invented here), relies on the real, already-working
// hideIfEmpty engine behavior for unpopulated fields (never this
// function's own concern), and — critically — never changes the
// case's own real CaseStatus. A Preliminary release is explicitly NOT
// a sign-out: the case stays in whatever in-progress/unverified state
// it was already in, exactly as it would if this action had never
// been taken.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { resolveIsFinalStatus } from '../reportTemplates/TemplateRoutingService';
import { publishReportReleasedEvent } from './publishReportReleasedEvent';

export interface ReleasePreliminaryReportResult {
  ok: boolean;
  /** Real count of real SynopticReportInstances a Preliminary message
   *  was actually dispatched for — 0 alongside ok:true is a real,
   *  honest "nothing to release" (an orchestration case with no real
   *  specimen instances at all yet), never conflated with a failure. */
  dispatchedCount: number;
  error?: string;
}

export async function releasePreliminaryReport(
  caseId: string,
  releasingUser: { id: string; name: string; role?: string },
  /** Real, per direct follow-up ("Component B") — optional: only
   *  SynopticReportPage.tsx's own real caller, which has
   *  generateReportPdfSnapshot in scope, can actually supply this.
   *  See publishReportReleasedEvent.ts's own doc comment on this
   *  same field for the full, honest structural reason. */
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>,
): Promise<ReleasePreliminaryReportResult> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return { ok: false, dispatchedCount: 0, error: 'Case not found.' };
  if (caseData.reportingMode !== 'orchestrator') {
    return { ok: false, dispatchedCount: 0, error: 'Preliminary release is only available for Orchestration-mode cases.' };
  }
  // Real, deliberate guard: releasing a "Preliminary" report on a case
  // that's already genuinely final doesn't mean anything real — that
  // case should go through the normal sign-out/dispatch path instead,
  // never this one. Reuses resolveIsFinalStatus directly (PS-292's own
  // real, already-decided definition of "genuinely final") rather than
  // a second, separate check that could quietly disagree with it.
  if (resolveIsFinalStatus(caseData.status)) {
    return { ok: false, dispatchedCount: 0, error: 'This case is already final — use the normal sign-out flow instead of a Preliminary release.' };
  }

  const instances = caseData.synopticReports ?? [];
  if (instances.length === 0) return { ok: true, dispatchedCount: 0 };

  // Real, per direct follow-up ("Component A refinement: formalize a
  // real Report_Released_Event") — the real dispatch loop itself now
  // lives in dispatchPreliminaryCaseInstances.ts, called through the
  // one, real, shared publish point every real release (Preliminary
  // or Final) now goes through, rather than this function owning its
  // own, separate copy of the dispatch logic.
  const { dispatchedCount = 0 } = await publishReportReleasedEvent({
    caseId,
    reportType: 'PRELIMINARY',
    releasedAt: new Date().toISOString(),
    releasedBy: { id: releasingUser.id, name: releasingUser.name },
    performingFacilityId: (caseData as any)?.order?.facilityId,
    generatePdf,
  });

  // Real, deliberate: sets the same, real Preliminary Reviewer
  // Attestation fields the Preliminary template itself already
  // renders (DiagnosticMetadata.reviewerRole/preliminaryRecordedAt —
  // types/case/Case.ts) — those fields existed since the templates
  // shipped but nothing ever wrote to them; this action is their real
  // write path. Deliberately does NOT touch caseData.status at all —
  // per direct guidance, the case stays in whatever in-progress/
  // unverified state it was already in.
  if (dispatchedCount > 0) {
    try {
      await caseRouter.updateCase(caseId, {
        diagnostic: {
          ...caseData.diagnostic,
          reviewerRole: releasingUser.role ?? 'Pathologist',
          preliminaryRecordedAt: new Date().toISOString(),
        },
      } as any);
    } catch {
      // Real, deliberate: the dispatch itself already succeeded and
      // is the real, meaningful outcome of this action — a failure to
      // also update the attestation fields afterward is a real,
      // separate, secondary concern that must never roll back or mask
      // a dispatch that genuinely already went out.
    }
  }

  return { ok: true, dispatchedCount };
}
