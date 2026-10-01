// src/services/assistPolling/assistMilestoneRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-87: the pure rules for turning a polled LIS milestone into an AI
// synoptic draft. No IO; runAssistPollCycle.ts supplies the data.
//
// What each milestone does (Pete, Sep 2026):
// - Gross Complete: the AI reads the gross description, decides which
//   synoptic templates the case needs, and fills in what the gross
//   supports.
// - Micro/Diagnosis Complete: the AI re-checks the template choice with the
//   microscopic findings and completes the draft.
// Everything the AI produces is a draft for the pathologist to review; a
// signed-out report is never touched.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case, SynopticReportInstance, ProtocolChange, AiFieldSuggestion } from '@/types/case/Case';
import { textFingerprint } from '../lisIngestion/stagingRules';
import type {
  AssistMilestone, AssistMilestoneRecord, AssistItemOutcome, LisCaseSnapshot,
  LisStatusCrosswalkEntry, AssistPollingSettings, AssistPollRun,
} from './types';

export const DEFAULT_ASSIST_POLLING_SETTINGS: AssistPollingSettings = {
  enabled: false,
  intervalMinutes: 5,
  statusCrosswalk: [
    { lisStatus: 'GROSS_COMPLETE', milestone: 'gross_complete' },
    { lisStatus: 'GROSSED',        milestone: 'gross_complete' },
    { lisStatus: 'MICRO_COMPLETE', milestone: 'micro_diagnosis_complete' },
    { lisStatus: 'DX_COMPLETE',    milestone: 'micro_diagnosis_complete' },
  ],
};

/** Runs kept in the activity log. */
export const MAX_RUNS_KEPT = 20;

/** The LIS status → milestone lookup: trimmed and case-insensitive,
 *  because LIS vocabularies are inconsistent about both. */
export function mapLisStatusToMilestone(lisStatus: string, crosswalk: readonly LisStatusCrosswalkEntry[]): AssistMilestone | undefined {
  const key = lisStatus.trim().toUpperCase();
  return crosswalk.find(e => e.lisStatus.trim().toUpperCase() === key)?.milestone;
}

/** Crosswalk rows that would break a lookup: blank statuses and
 *  duplicates (the same status mapped twice). */
export function findCrosswalkProblems(crosswalk: readonly LisStatusCrosswalkEntry[]): { blank: number[]; duplicates: number[] } {
  const blank: number[] = [];
  const duplicates: number[] = [];
  const seen = new Set<string>();
  crosswalk.forEach((e, i) => {
    const key = e.lisStatus.trim().toUpperCase();
    if (!key) { blank.push(i); return; }
    if (seen.has(key)) duplicates.push(i);
    seen.add(key);
  });
  return { blank, duplicates };
}

/** Fingerprint of the text a draft was built from, so an unchanged
 *  re-poll is skipped and an amended LIS text is drafted again. Shared with
 *  the staging queue's de-duplication. */
export { textFingerprint };

/** The LIS text a milestone's draft depends on. */
export function milestoneText(snapshot: LisCaseSnapshot, milestone: AssistMilestone): string {
  const gross = snapshot.grossText?.trim() ?? '';
  if (milestone === 'gross_complete') return gross;
  return [gross, snapshot.microscopicText?.trim() ?? '', snapshot.diagnosisText?.trim() ?? ''].join('\n§\n');
}

export type MilestonePlan =
  | { kind: 'skip'; outcome: AssistItemOutcome }
  | { kind: 'text_only'; outcome: AssistItemOutcome; textHash: string }
  | { kind: 'draft'; textHash: string; fill: 'gross' | 'full' };

/** Decides what to do with one polled case. */
export function planMilestoneWork(input: {
  snapshot: LisCaseSnapshot;
  milestone: AssistMilestone | undefined;
  caseData: Pick<Case, 'reportingMode' | 'status'> | null | undefined;
  record: Partial<Record<AssistMilestone, AssistMilestoneRecord>> | undefined;
  aiEnabled: { gross: boolean; microscopic: boolean };
}): MilestonePlan {
  const { snapshot, milestone, caseData, record, aiEnabled } = input;
  if (!milestone) return { kind: 'skip', outcome: 'no_milestone' };
  if (!caseData) return { kind: 'skip', outcome: 'case_not_found' };
  if (caseData.reportingMode !== 'assist') return { kind: 'skip', outcome: 'not_assist_case' };
  if (caseData.status === 'finalized') return { kind: 'skip', outcome: 'case_signed_out' };

  const textHash = textFingerprint(milestoneText(snapshot, milestone));
  if (record?.[milestone]?.textHash === textHash) return { kind: 'skip', outcome: 'already_processed' };

  if (milestone === 'gross_complete') {
    // A later milestone already drafted the whole report; a late or
    // amended gross only updates the text, it doesn't re-run the AI
    // over a fuller draft.
    if (record?.micro_diagnosis_complete) return { kind: 'text_only', outcome: 'text_only_superseded', textHash };
    if (!aiEnabled.gross) return { kind: 'text_only', outcome: 'text_only_ai_disabled', textHash };
    return { kind: 'draft', textHash, fill: 'gross' };
  }
  if (!aiEnabled.microscopic) return { kind: 'text_only', outcome: 'text_only_ai_disabled', textHash };
  return { kind: 'draft', textHash, fill: 'full' };
}

/** The case's LIS-owned text, updated from the snapshot. Only fields the
 *  LIS actually sent are written. */
export function lisTextPatch(caseData: Case, snapshot: LisCaseSnapshot): Pick<Case, 'diagnostic'> {
  const d = { ...(caseData.diagnostic ?? {}) };
  if (snapshot.grossText !== undefined) d.grossDescription = snapshot.grossText;
  if (snapshot.microscopicText !== undefined) d.microscopicDescription = snapshot.microscopicText;
  if (snapshot.diagnosisText !== undefined) d.primaryDiagnosis = snapshot.diagnosisText;
  return { diagnostic: d };
}

/** The case as the AI should read it for this fill. A gross-stage fill
 *  sees only the gross, so it can't guess at microscopic answers; a full
 *  fill sees the diagnosis appended to the microscopic text. Not
 *  persisted. */
export function caseForAiFill(caseData: Case, fill: 'gross' | 'full'): Case {
  const d = caseData.diagnostic ?? {};
  if (fill === 'gross') return { ...caseData, diagnostic: { ...d, microscopicDescription: '', ancillaryStudies: '' } };
  const micro = [d.microscopicDescription?.trim(), d.primaryDiagnosis?.trim() ? `DIAGNOSIS: ${d.primaryDiagnosis.trim()}` : '']
    .filter(Boolean).join('\n\n');
  return { ...caseData, diagnostic: { ...d, microscopicDescription: micro } };
}

const isEmptyAnswer = (v: string | string[] | undefined) =>
  v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const sameValue = (a: string | string[] | undefined, b: string | string[] | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

/** True when nobody has changed anything the AI put in this draft. */
export function isUntouchedAiDraft(inst: SynopticReportInstance): boolean {
  if (!inst.aiDraftSource || inst.status !== 'draft') return false;
  return Object.entries(inst.answers ?? {}).every(([field, value]) => {
    const sug = inst.aiSuggestions?.[field];
    return isEmptyAnswer(value) || (!!sug && sug.verification === 'unverified' && sameValue(value, sug.value));
  });
}

/** Instances the AI may fill: drafts only. Finalized and
 *  awaiting-countersign reports are never touched. */
export const isFillable = (inst: SynopticReportInstance) => inst.status === 'draft';

/** Applies the AI's template proposals.
 *  - "add": a new draft instance, marked as an AI draft.
 *  - "replace"/"remove" of an AI draft nobody has touched: applied
 *    directly (the AI is refining its own earlier choice).
 *  - "replace"/"remove" of anything else: left for the pathologist in
 *    pendingProtocolChanges, never applied to their work. */
export function applyTemplateProposals(
  caseData: Case,
  changes: readonly ProtocolChange[],
  milestone: AssistMilestone,
  now: string,
): { synopticReports: SynopticReportInstance[]; pendingProtocolChanges: ProtocolChange[]; draftsCreated: number; pendingReviewChanges: number } {
  let reports = [...(caseData.synopticReports ?? [])];
  const pending = [...(caseData.pendingProtocolChanges ?? [])];
  let draftsCreated = 0;
  let pendingReviewChanges = 0;
  const source = (c: ProtocolChange) => ({ milestone, generatedAt: now, reason: c.reason, confidence: c.confidence });
  const newDraft = (c: ProtocolChange): SynopticReportInstance => ({
    instanceId: `assist-${c.specimenId}-${c.proposedTemplateId}`,
    specimenId: c.specimenId,
    templateId: c.proposedTemplateId!,
    templateName: c.proposedTemplateName ?? c.proposedTemplateId!,
    answers: {},
    aiSuggestions: {},
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    aiDraftSource: source(c),
  });

  for (const c of changes) {
    const action = c.action ?? 'replace';
    if (action === 'add') {
      if (!c.proposedTemplateId) continue;
      if (reports.some(r => r.specimenId === c.specimenId && r.templateId === c.proposedTemplateId)) continue;
      reports.push(newDraft(c));
      draftsCreated++;
      continue;
    }
    const target = reports.find(r => r.instanceId === c.currentInstanceId)
      ?? reports.find(r => r.specimenId === c.specimenId && r.templateId === c.currentTemplateId);
    if (target && isUntouchedAiDraft(target)) {
      reports = reports.filter(r => r !== target);
      if (action === 'replace' && c.proposedTemplateId) {
        reports.push(newDraft(c));
        draftsCreated++;
      }
      continue;
    }
    if (!pending.some(p => p.id === c.id)) {
      pending.push({ ...c, reviewStatus: 'pending' });
      pendingReviewChanges++;
    }
  }
  return { synopticReports: reports, pendingProtocolChanges: pending, draftsCreated, pendingReviewChanges };
}

/** Merges fresh AI suggestions into a draft. A field's answer is
 *  (re)filled only when it is empty or still exactly the AI's earlier,
 *  unverified value; anything a person entered or verified is kept. */
export function mergeSuggestionsIntoInstance(
  inst: SynopticReportInstance,
  suggestions: Record<string, AiFieldSuggestion>,
  now: string,
): { instance: SynopticReportInstance; fieldsSuggested: number } {
  const answers = { ...(inst.answers ?? {}) };
  for (const [field, sug] of Object.entries(suggestions)) {
    const prev = inst.aiSuggestions?.[field];
    const current = answers[field];
    const untouched = isEmptyAnswer(current) || (!!prev && prev.verification === 'unverified' && sameValue(current, prev.value));
    if (untouched) answers[field] = sug.value;
  }
  return {
    instance: { ...inst, answers, aiSuggestions: { ...(inst.aiSuggestions ?? {}), ...suggestions }, updatedAt: now },
    fieldsSuggested: Object.keys(suggestions).length,
  };
}

/** True when the admin's draft settings differ from what's saved. */
export function assistSettingsChanged(saved: AssistPollingSettings, draft: AssistPollingSettings): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

/** Totals for one run, for the activity log. */
export function summarizeRun(run: Pick<AssistPollRun, 'items'>): Record<'drafted' | 'textOnly' | 'skipped' | 'failed', number> {
  const drafted = run.items.filter(i => i.outcome === 'draft_prepared').length;
  const textOnly = run.items.filter(i => i.outcome === 'text_only_ai_disabled' || i.outcome === 'text_only_superseded').length;
  const failed = run.items.filter(i => i.outcome === 'failed').length;
  return { drafted, textOnly, failed, skipped: run.items.length - drafted - textOnly - failed };
}
