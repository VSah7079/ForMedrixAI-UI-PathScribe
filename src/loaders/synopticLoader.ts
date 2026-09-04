import { LoaderFunctionArgs, redirect } from "react-router-dom";
import { caseRouter } from "../services/cases/CaseRouter";
import { facilityService } from "../services";
import { getSessionUser, resolvePediatricAccess, resolveOrchestrationAccess } from "../services/auth/caseAccessControl";

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
  const session = getSessionUser();

  const orchDecision = resolveOrchestrationAccess(session, caseData as any);
  if (!orchDecision.granted) {
    console.warn(`Orchestration access denied for case ${caseId}: ${orchDecision.reason}`);
    return redirect(`/worklist?accessDenied=orchestration&caseId=${caseId}`);
  }

  const facilityId = (caseData as any)?.order?.facilityId;
  if (facilityId) {
    const facilityRes = await facilityService.getById(facilityId).catch(() => undefined);
    const facility = facilityRes?.ok ? facilityRes.data : null;
    const pedDecision = resolvePediatricAccess(session, caseData as any, facility);
    if (!pedDecision.granted) {
      console.warn(`Pediatric access denied for case ${caseId}: ${pedDecision.reason}`);
      return redirect(`/worklist?accessDenied=pediatric&caseId=${caseId}`);
    }
  }

  return caseData;
}
