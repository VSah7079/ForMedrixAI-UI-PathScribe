import { LoaderFunctionArgs, redirect } from "react-router-dom";
import { caseRouter } from "../services/cases/CaseRouter";
import { getSessionUser } from "../services/auth/caseAccessControl";
import { resolveCaseAccessGate } from "../services/auth/resolveCaseAccessGate";

export async function synopticLoader({ params }: LoaderFunctionArgs) {
  const caseId = params.caseId;

  if (!caseId) {
    console.error("Missing caseId in route params");
    return redirect("/worklist");
  }

  // caseRouter already handles both LIS (S26-) and Orchestrator (O26-)
  // lookups internally — was previously two separate, manual calls to
  // mockCaseService then mockOrchestratorCaseService, duplicating logic
  // caseRouter has since consolidated.
  const caseData = await caseRouter.getCase(caseId).catch(() => undefined);

  if (!caseData) {
    console.error(`Case not found in any service: ${caseId}`);
    return redirect("/worklist");
  }

  // Real, per direct investigation: this loader — the actual data-loading
  // path every route to a case's report funnels through (also used by
  // /report/:caseId, see FullReportPage.tsx) — previously performed no
  // authorization check beyond "does this case exist." Pediatric and
  // Orchestration access were only ever checked as UI-level convenience
  // gates on the Worklist table's click handler and Search's display
  // logic; a direct URL, bookmark, shared link, or browser-history entry
  // bypassed both entirely. See caseAccessControl.ts's own header comment
  // on resolvePediatricAccess/resolveOrchestrationAccess for the full
  // reasoning — this is now the single, real enforcement point, and the
  // UI-level checks call the same functions rather than their own
  // separately-drifting logic.
  //
  // File-by-file cleanup sweep: the actual two-check sequence (was
  // duplicated here and in FullReportPage.tsx's own useEffect) now lives
  // once, in resolveCaseAccessGate.ts — both real case-view entry points
  // call the same function instead of two independently-maintained copies.
  const session = getSessionUser();
  const gate = await resolveCaseAccessGate(session, caseData as any);
  if (!gate.granted) {
    console.warn(`${gate.reason === 'orchestration' ? 'Orchestration' : 'Pediatric'} access denied for case ${caseId}: ${gate.detail}`);
    return redirect(`/worklist?accessDenied=${gate.reason}&caseId=${caseId}`);
  }

  return caseData;
}
