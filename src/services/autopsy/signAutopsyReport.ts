// src/services/autopsy/signAutopsyReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("let's get that signing") — the actual
// PAD/FAD signing action, which never existed anywhere in this
// codebase before this: AutopsyReportSnapshot (padSnapshot/
// fadSnapshot) was, until now, only ever read (by
// resolveAutopsyBodyReleaseGate.ts and resolveAutopsyBodyAlreadyReleased.ts),
// never written.
//
// Same real fetch → check → gate → persist shape as
// releaseAutopsyBody.ts — logic lives here, never inline in a form
// component.
//
// Real, per PS-292's own decided countersign requirements ("stay
// strict... the same countersign needs to work for Cytology as
// well"): a resident's or FPPE provisional hire's own PAD/FAD
// sign-off is intercepted here too, via the exact same, shared
// resolveResidentCountersignRequired.ts decision already wired into
// Cytology's own sign-out — never a third, separate copy of that
// logic. On interception this releases the case for countersign
// (countersignService.release(), CountersignRecord.autopsyReportTier
// set) rather than producing a real snapshot.
//
// Real, per direct follow-up ("continue with attending sign out") —
// the attending's own side. Mirrors useSignOutWorkflow.ts's own real
// pattern exactly: no separate review screen. The attending just
// signs normally (this same action), and if a real, still-pending
// CountersignRecord exists for this same tier, its completion
// (countersignService.countersign()) is captured alongside the real
// snapshot write below, not as a separate step.
//
// Real, per the same session's own decision on FAD vs. CaseStatus:
// signing the FAD (when not intercepted) also transitions the case's
// own CaseStatus to 'finalized' — the case's real terminal event.
// Signing the PAD deliberately does NOT change CaseStatus at all: PAD
// is an interim milestone tracked on AutopsyCaseDetails itself, not a
// case-level status transition — matching resolveAutopsyBodyReleaseGate.ts's
// own design, which already reads padSnapshot directly rather than
// any CaseStatus value.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { countersignService, qaSupervisionAssignmentService } from '@/services';
import { FPPE_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import { resolveResidentCountersignRequired } from '@/services/cases/resolveResidentCountersignRequired';
import { publishReportReleasedEvent } from '@/services/reports/publishReportReleasedEvent';
import type { AutopsyReportTier, AutopsyReportSnapshot } from '@/types/autopsy/AutopsyCaseDetails';

interface OrchestratorSectionLike { id: string; label: string; text?: string }

// Real, per direct correction ("the Final Diagnosis in an Autopsy
// report is a cause of death, what else could it be? That data exist
// as does the PAD data — let's not over complicate things here"):
// there is no dedicated, Autopsy-specific "cause of death" field
// anywhere in this codebase, and there doesn't need to be one — the
// real, existing report text every specialty already writes
// (Case.orchSections — Gross Description, Diagnosis, etc., the same
// generic mechanism this app already uses for every specialty's own
// report) IS the real data. Snapshotting it directly, honestly,
// rather than inventing a new, structured AutopsyReportContent type
// — this is what makes the PAD-vs-FAD comparison this session already
// wanted buildable now, on real data, not blocked on a type that
// doesn't exist.
function buildReportTextSnapshot(caseData: any): { sections: { id: string; label: string; text: string }[] } {
  const sections: OrchestratorSectionLike[] = caseData?.orchSections ?? [];
  return { sections: sections.map(s => ({ id: s.id, label: s.label, text: s.text ?? '' })) };
}

// Real, per the same correction — the countersign delta computation
// (countChangedFields, mockCountersignService.ts) needs the real
// section text to detect real changes too, not just scope/
// jurisdiction (which rarely change): flattens each real section's
// text into its own key, same generic "field id → value" shape
// Surg Path's own SynopticReportInstance.answers already uses for the
// exact same real comparison.
function buildCountersignComparisonSnapshot(caseData: any): Record<string, string | string[]> {
  const sections: OrchestratorSectionLike[] = caseData?.orchSections ?? [];
  const sectionFields: Record<string, string> = {};
  sections.forEach(s => { sectionFields[`section_${s.id}`] = s.text ?? ''; });
  return {
    scope: JSON.stringify(caseData?.autopsy?.scope ?? {}),
    jurisdiction: caseData?.autopsy?.jurisdiction ?? '',
    ...sectionFields,
  };
}

export interface SignAutopsyReportResult {
  ok: boolean;
  outcome?: 'signed' | 'released_for_countersign';
  error?: string;
}

export async function signAutopsyReport(
  caseId: string,
  tier: AutopsyReportTier,
  signingUser: { id: string; name: string; isPathologist: boolean },
  /** Real, per direct follow-up ("wire in Autopsy") — optional: only
   *  SynopticReportPage.tsx's own real caller, which has
   *  generateReportPdfSnapshot in scope, can actually supply this.
   *  Same real, established pattern as releasePreliminaryReport.ts's
   *  own identical parameter. */
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>,
): Promise<SignAutopsyReportResult> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return { ok: false, error: 'Case not found.' };
  if (!caseData.autopsy) return { ok: false, error: 'Case has no autopsy record.' };

  // Real, deliberate ordering guard: an FAD can never be signed before
  // a real, signed PAD exists — same real-world sequencing
  // resolveAutopsyBodyReleaseGate.ts already assumes (PAD comes before
  // FAD, never the reverse).
  if (tier === 'FAD' && !caseData.autopsy.padSnapshot) {
    return { ok: false, error: 'The PAD must be signed before the FAD can be signed.' };
  }

  const provisionalParticipant = caseData.participants?.some(
    p => p.status === 'active' && p.staffId === signingUser.id && p.participationTypeIds?.includes('provisional_hire')
  );
  const isAttendingToo = caseData.participants?.some(
    p => p.status === 'active' && p.staffId === signingUser.id && p.participationTypeIds?.includes('attending')
  );
  const activeFppeAssignment = provisionalParticipant && !isAttendingToo
    ? await qaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, signingUser.id, (caseData as any)?.subspecialtyId).then(r => r.ok ? r.data : null).catch(() => null)
    : null;

  const countersignCheck = resolveResidentCountersignRequired({
    participants: caseData.participants,
    signingUserId: signingUser.id,
    hasActiveFppeAssignment: !!activeFppeAssignment,
  });

  if (countersignCheck.required) {
    // Real, Autopsy-native snapshot of what's actually being released
    // for review — the real autopsy record's own current state,
    // wrapped into the same generic shape CountersignRecord's
    // releasedAnswersSnapshot already uses everywhere else, keyed by
    // this case's own accession rather than a synoptic instanceId
    // (Autopsy has none).
    const releasedAnswersSnapshot: Record<string, Record<string, string | string[]>> = {
      [caseId]: buildCountersignComparisonSnapshot(caseData),
    };

    await countersignService.release({
      caseId,
      subspecialtyId: (caseData as any)?.subspecialtyId,
      residentId: signingUser.id,
      residentName: signingUser.name,
      releasedAnswersSnapshot,
      autopsyReportTier: tier,
    });

    try {
      await caseRouter.updateCase(caseId, { status: 'pending-countersign' } as any);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Failed to release for countersign.' };
    }

    return { ok: true, outcome: 'released_for_countersign' };
  }

  const snapshot: AutopsyReportSnapshot = {
    tier,
    frozenPayload: {
      scope: caseData.autopsy.scope,
      jurisdiction: caseData.autopsy.jurisdiction,
      ...buildReportTextSnapshot(caseData),
    },
    signedBy: { name: signingUser.name, isPathologist: signingUser.isPathologist },
    signedAt: new Date().toISOString(),
  };

  const updatedAutopsy = {
    ...caseData.autopsy,
    ...(tier === 'PAD' ? { padSnapshot: snapshot } : { fadSnapshot: snapshot }),
  };

  // Real attending-side countersign completion — mirrors
  // useSignOutWorkflow.ts's own real pattern exactly: the attending
  // never sees a separate review screen; they just sign normally
  // (here, the same Sign PAD/Sign FAD action), and if a real,
  // still-pending CountersignRecord exists for this same tier, its
  // completion is captured alongside the real snapshot write, not as
  // a separate step. Matched on tier, not just caseId — an Autopsy
  // case can have two real, separate releases (PAD, then later FAD)
  // months apart; this must never complete the wrong one.
  const pendingRecordRes = await countersignService.getForCase(caseId).catch(() => null);
  const pendingRecord = pendingRecordRes?.ok ? pendingRecordRes.data : null;
  if (pendingRecord && pendingRecord.status === 'pending' && pendingRecord.autopsyReportTier === tier) {
    const currentAnswersByInstance: Record<string, Record<string, string | string[]>> = {
      [caseId]: buildCountersignComparisonSnapshot(caseData),
    };
    await countersignService.countersign({
      caseId,
      attendingId: signingUser.id,
      attendingName: signingUser.name,
      currentAnswersByInstance,
    }).catch(() => {});
  }

  try {
    await caseRouter.updateCase(caseId, {
      autopsy: updatedAutopsy,
      ...(tier === 'FAD' ? { status: 'finalized' } : {}),
    } as any);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to sign the report.' };
  }

  // Real, per direct follow-up ("wire in Autopsy") — routes through
  // the same, real, centralized Report_Released_Event every other
  // real dispatch in this app now goes through. Real, deliberate:
  // source defaults to 'SURGPATH' (omitted here), which is correct —
  // an Autopsy case's own gross/tissue-submission specimens are real
  // SynopticReportInstances (Case.synopticReports is a universal,
  // non-specialty-specific field, confirmed directly before this
  // change), so dispatchCaseInstances.ts's own real, existing loop
  // already processes them correctly; the real, Autopsy-specific
  // content itself (PAD/FAD's own frozen sections) reaches the
  // dispatch through buildOruR01Payload.ts's own new
  // narrative.autopsySections field instead, not through a second,
  // separate dispatch function. PAD signs as PRELIMINARY (an interim
  // milestone, matching this file's own header comment on why PAD
  // never changes CaseStatus); FAD as FINAL (the case's own real
  // terminal event).
  await publishReportReleasedEvent({
    caseId,
    reportType: tier === 'PAD' ? 'PRELIMINARY' : 'FINAL',
    releasedAt: new Date().toISOString(),
    releasedBy: { id: signingUser.id, name: signingUser.name },
    performingFacilityId: (caseData as any)?.order?.facilityId,
    generatePdf,
  });

  return { ok: true, outcome: 'signed' };
}
