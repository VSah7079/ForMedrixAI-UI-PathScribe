// src/services/autopsy/releaseAutopsyBody.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "continue with wiring and
// UI" — the real orchestration this module's own gate
// (resolveAutopsyBodyReleaseGate.ts) and event builder
// (buildAutopsyBodyReleaseLocationEvent.ts) were both deliberately
// kept decoupled from: fetch the real case, re-check the real gate
// server-side (never trust a UI's own earlier check alone — the case
// may have changed since), append the real, built event onto the
// real, target specimen's own locationHistory (per this module's own
// "body is a specimen" architecture), and persist via the real,
// existing caseRouter — never a second, parallel persistence path.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { resolveAutopsyBodyReleaseGate } from './resolveAutopsyBodyReleaseGate';
import { buildAutopsyBodyReleaseLocationEvent, type AutopsyBodyReleaseDetails } from './buildAutopsyBodyReleaseLocationEvent';

export interface ReleaseAutopsyBodyResult {
  ok: boolean;
  blockedReasons?: string[];
  error?: string;
}

export async function releaseAutopsyBody(
  caseId: string,
  specimenId: string,
  releaseDetails: AutopsyBodyReleaseDetails,
): Promise<ReleaseAutopsyBodyResult> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return { ok: false, error: 'Case not found.' };
  if (!caseData.autopsy) return { ok: false, error: 'Case has no autopsy record.' };

  const gate = resolveAutopsyBodyReleaseGate(caseData.autopsy);
  if (!gate.allowed) return { ok: false, blockedReasons: gate.blockedReasons };

  const targetSpecimen = caseData.specimens.find(s => s.id === specimenId);
  if (!targetSpecimen) return { ok: false, error: 'Specimen not found on this case.' };

  const releaseEvent = buildAutopsyBodyReleaseLocationEvent(releaseDetails);
  const updatedSpecimens = caseData.specimens.map(s =>
    s.id === specimenId
      ? { ...s, locationHistory: [...(s.locationHistory ?? []), releaseEvent] }
      : s,
  );

  await caseRouter.updateCase(caseId, { specimens: updatedSpecimens });
  return { ok: true };
}
