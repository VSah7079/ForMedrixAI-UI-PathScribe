// src/services/assistPolling/runAssistPollCycle.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-87: the Assist worker, fed by the universal staging queue
// (services/lisIngestion/, Pete's ingestion-layer design). Every dependency
// is passed in, so this runs the same from the admin screen, from a
// server-side schedule, and from an inbound-message endpoint, and is
// testable without module mocks.
//
// Three ways in, one queue, one worker:
//   runAssistPollCycle     poll adapter → stage → process the queue
//   ingestPushedMessage    push adapter (HL7 v2 / JSON webhook) → stage →
//                          process the queue straight away ("on receipt")
//   retryFailedEvents      put failed events back in line → process
//
// For each staged event the worker:
//   1. maps its LIS status to a milestone (site crosswalk);
//   2. decides what to do (assistMilestoneRules.planMilestoneWork);
//   3. writes the LIS text onto the case (the LIS owns it in Assist mode);
//   4. for a draft: asks the AI which synoptic templates fit, applies the
//      proposals as drafts or pending review, and fills every draft instance
//      with AI suggestions;
//   5. records the milestone, audits it, and marks the event handled.
// One event failing never stops the others; it stays in the queue and is
// retried on the next run (up to MAX_ATTEMPTS, then an admin can retry).
// ─────────────────────────────────────────────────────────────────────────────

import type { Case, ProtocolChange, AiFieldSuggestion } from '@/types/case/Case';
import type { SynopticEvaluationInput } from '@/services/aiIntegration/IAIIntegrationService';
import type { NewAuditLog } from '@/services/auditlog/IAuditService';
import type { LisPollAdapter, LisPushAdapter, StagedLisEvent } from '../lisIngestion/types';
import { stageUpdates, workableEvents, recordAttempt, retryFailed, trimQueue } from '../lisIngestion/stagingRules';
import type { AssistPollingState, AssistPollRun, AssistPollItemResult, AssistMilestone, AssistCaseRecords } from './types';
import {
  mapLisStatusToMilestone, planMilestoneWork, lisTextPatch, caseForAiFill,
  applyTemplateProposals, mergeSuggestionsIntoInstance, isFillable, MAX_RUNS_KEPT,
} from './assistMilestoneRules';

export interface TemplateSummary { id: string; name: string; category: string }
export interface TemplateFieldSpec { id: string; label: string; options?: Array<{ id: string; label: string }> }

export interface AssistPollDeps {
  pollAdapter: LisPollAdapter;
  loadQueue: () => Promise<StagedLisEvent[]>;
  saveQueue: (queue: StagedLisEvent[]) => Promise<void>;
  getCase: (caseId: string) => Promise<Case | null | undefined>;
  updateCase: (caseId: string, updates: Partial<Case>) => Promise<void>;
  /** Published diagnostic synoptic templates the AI may choose from. */
  listDiagnosticTemplates: () => Promise<TemplateSummary[]>;
  getTemplateFields: (templateId: string) => Promise<TemplateFieldSpec[]>;
  evaluateSynopticAssignment: (input: SynopticEvaluationInput) => Promise<{ changes: ProtocolChange[]; warnings: string[] }>;
  generateSuggestions: (caseData: Case, templateId: string, fields: TemplateFieldSpec[]) => Promise<Record<string, AiFieldSuggestion>>;
  /** The Config → AI Behavior toggles. */
  getAiEnabled: () => Promise<{ gross: boolean; microscopic: boolean }>;
  loadState: () => Promise<AssistPollingState>;
  saveState: (state: AssistPollingState) => Promise<void>;
  logAudit: (entry: NewAuditLog) => Promise<unknown>;
  now: () => string;
  newId: () => string;
}

const MILESTONE_AUDIT_LABEL: Record<AssistMilestone, string> = {
  gross_complete: 'Gross Complete',
  micro_diagnosis_complete: 'Microscopic/Diagnosis Complete',
};

const SOURCE_AUDIT_LABEL: Record<StagedLisEvent['source'], string> = {
  poll: 'poll', hl7v2: 'HL7 v2 message', webhook: 'webhook',
};

/** Builds and saves the AI draft for one case. Returns counts. */
async function draftCase(
  deps: AssistPollDeps,
  caseData: Case,
  milestone: AssistMilestone,
  fill: 'gross' | 'full',
  templates: TemplateSummary[],
): Promise<Pick<AssistPollItemResult, 'draftsCreated' | 'fieldsSuggested' | 'pendingReviewChanges'>> {
  const now = deps.now();
  const aiCase = caseForAiFill(caseData, fill);
  const d = aiCase.diagnostic ?? {};

  // 1. Which templates does the case need?
  const evaluation = await deps.evaluateSynopticAssignment({
    caseText: { gross: d.grossDescription ?? '', microscopic: d.microscopicDescription ?? '', ancillary: d.ancillaryStudies ?? '' },
    specimens: (caseData.specimens ?? []).map(sp => ({
      specimenId: sp.id,
      specimenLabel: sp.label,
      specimenDesc: sp.description,
      currentSynoptics: (caseData.synopticReports ?? [])
        .filter(r => r.specimenId === sp.id)
        .map(r => ({ instanceId: r.instanceId, templateId: r.templateId, templateName: r.templateName })),
    })),
    availableTemplates: templates,
    facilityId: caseData.order?.facilityId,
  });
  const applied = applyTemplateProposals(caseData, evaluation.changes, milestone, now);

  // 2. Fill every draft with what the text supports.
  let fieldsSuggested = 0;
  const reports = [];
  for (const inst of applied.synopticReports) {
    if (!isFillable(inst)) { reports.push(inst); continue; }
    const fields = await deps.getTemplateFields(inst.templateId);
    const suggestions = await deps.generateSuggestions(aiCase, inst.templateId, fields);
    const merged = mergeSuggestionsIntoInstance(inst, suggestions, now);
    fieldsSuggested += merged.fieldsSuggested;
    reports.push(inst.aiDraftSource ? { ...merged.instance, aiDraftSource: { ...inst.aiDraftSource, milestone, generatedAt: now } } : merged.instance);
  }

  await deps.updateCase(caseData.id, { synopticReports: reports, pendingProtocolChanges: applied.pendingProtocolChanges });
  return { draftsCreated: applied.draftsCreated, fieldsSuggested, pendingReviewChanges: applied.pendingReviewChanges };
}

/** Handles one staged event; throws on failure (the caller records it). */
async function processEvent(
  deps: AssistPollDeps,
  ev: StagedLisEvent,
  state: AssistPollingState,
  records: AssistCaseRecords,
  cache: { aiEnabled?: { gross: boolean; microscopic: boolean }; templates?: TemplateSummary[] },
): Promise<AssistPollItemResult> {
  const milestone = mapLisStatusToMilestone(ev.lisStatus, state.settings.statusCrosswalk);
  const item: AssistPollItemResult = {
    eventId: ev.id, source: ev.source, accession: ev.accession, lisStatus: ev.lisStatus, milestone,
    outcome: 'no_milestone', draftsCreated: 0, fieldsSuggested: 0, pendingReviewChanges: 0,
  };
  const caseData = milestone ? await deps.getCase(ev.accession) : null;
  cache.aiEnabled ??= await deps.getAiEnabled();
  const plan = planMilestoneWork({ snapshot: ev, milestone, caseData, record: records[ev.accession], aiEnabled: cache.aiEnabled });
  if (plan.kind === 'skip') { item.outcome = plan.outcome; return item; }

  const textPatch = lisTextPatch(caseData!, ev);
  await deps.updateCase(caseData!.id, textPatch);
  if (plan.kind === 'draft') {
    cache.templates ??= await deps.listDiagnosticTemplates();
    Object.assign(item, await draftCase(deps, { ...caseData!, ...textPatch }, milestone!, plan.fill, cache.templates));
    item.outcome = 'draft_prepared';
  } else {
    item.outcome = plan.outcome;
  }

  const at = deps.now();
  records[ev.accession] = { ...records[ev.accession], [milestone!]: { processedAt: at, textHash: plan.textHash } };
  // A Micro/Diagnosis draft covers the gross too.
  if (milestone === 'micro_diagnosis_complete' && plan.kind === 'draft' && !records[ev.accession]?.gross_complete) {
    records[ev.accession] = { ...records[ev.accession], gross_complete: { processedAt: at, textHash: 'covered-by-micro' } };
  }
  await deps.logAudit({
    type: plan.kind === 'draft' ? 'ai' : 'system',
    event: plan.kind === 'draft' ? 'Assist LIS update: AI synoptic draft prepared' : 'Assist LIS update: LIS text synced',
    detail: plan.kind === 'draft'
      ? `LIS reported ${MILESTONE_AUDIT_LABEL[milestone!]} (status ${ev.lisStatus}, via ${SOURCE_AUDIT_LABEL[ev.source]}). AI draft: ${item.draftsCreated} new synoptic draft(s), ${item.fieldsSuggested} field suggestion(s), ${item.pendingReviewChanges} template change(s) left for pathologist review.`
      : `LIS reported ${MILESTONE_AUDIT_LABEL[milestone!]} (status ${ev.lisStatus}, via ${SOURCE_AUDIT_LABEL[ev.source]}). Text synced; no AI draft (${item.outcome}).`,
    user: 'Assist LIS ingestion',
    caseId: ev.accession,
    confidence: null,
  });
  return item;
}

/** Works through the staging queue; returns one result per event handled. */
async function drainQueue(deps: AssistPollDeps, state: AssistPollingState, records: AssistCaseRecords): Promise<AssistPollItemResult[]> {
  let queue = await deps.loadQueue();
  const items: AssistPollItemResult[] = [];
  const cache = {};
  for (const ev of workableEvents(queue)) {
    try {
      const item = await processEvent(deps, ev, state, records, cache);
      queue = recordAttempt(queue, ev.id, { ok: true, outcome: item.outcome }, deps.now());
      items.push(item);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      queue = recordAttempt(queue, ev.id, { ok: false, error }, deps.now());
      items.push({
        eventId: ev.id, source: ev.source, accession: ev.accession, lisStatus: ev.lisStatus,
        milestone: mapLisStatusToMilestone(ev.lisStatus, state.settings.statusCrosswalk),
        outcome: 'failed', error, draftsCreated: 0, fieldsSuggested: 0, pendingReviewChanges: 0,
      });
    }
  }
  await deps.saveQueue(trimQueue(queue));
  return items;
}

async function finishRun(deps: AssistPollDeps, state: AssistPollingState, run: AssistPollRun, patch: Partial<AssistPollingState>) {
  run.finishedAt = deps.now();
  await deps.saveState({ ...state, ...patch, runs: [run, ...state.runs].slice(0, MAX_RUNS_KEPT) });
  return run;
}

const newRun = (deps: AssistPollDeps, trigger: AssistPollRun['trigger']): AssistPollRun => {
  const at = deps.now();
  return { id: deps.newId(), startedAt: at, finishedAt: at, trigger, fetched: 0, staged: 0, items: [] };
};

/** Poll the LIS into the staging queue, then process the queue. */
export async function runAssistPollCycle(deps: AssistPollDeps, trigger: 'manual' | 'scheduled'): Promise<AssistPollRun> {
  const state = await deps.loadState();
  const run = newRun(deps, trigger);
  const records = { ...state.records };
  let cursor = state.cursor;
  try {
    const updates = await deps.pollAdapter.fetchChangedSince(state.cursor);
    run.fetched = updates.length;
    const staged = stageUpdates(await deps.loadQueue(), updates, 'poll', { now: deps.now(), newId: deps.newId });
    await deps.saveQueue(staged.queue);
    run.staged = staged.added.length;
    // Everything fetched is now safely in the queue, so the cursor can move
    // past all of it; failures are retried from the queue, not re-fetched.
    for (const u of updates) if (!cursor || u.updatedAt > cursor) cursor = u.updatedAt;
  } catch (e) {
    // The LIS was unreachable: still process anything already staged.
    run.error = e instanceof Error ? e.message : String(e);
  }
  run.items = await drainQueue(deps, state, records);
  return finishRun(deps, state, run, { cursor, records });
}

/** An inbound message (HL7 v2 or JSON webhook) → staging queue → processed
 *  on receipt. An unreadable message is refused with the adapter's error
 *  code and nothing is staged. */
export async function ingestPushedMessage(deps: AssistPollDeps, adapter: LisPushAdapter, raw: string): Promise<AssistPollRun> {
  const state = await deps.loadState();
  const run = newRun(deps, 'push');
  const records = { ...state.records };
  const result = adapter.normalize(raw);
  if (result.ok === false) {
    run.error = result.error;
    return finishRun(deps, state, run, {});
  }
  const staged = stageUpdates(await deps.loadQueue(), result.updates, adapter.source, { now: deps.now(), newId: deps.newId });
  await deps.saveQueue(staged.queue);
  run.staged = staged.added.length;
  run.items = await drainQueue(deps, state, records);
  return finishRun(deps, state, run, { records });
}

/** Puts every failed event back in line and processes the queue. */
export async function retryFailedEvents(deps: AssistPollDeps): Promise<AssistPollRun> {
  const state = await deps.loadState();
  const run = newRun(deps, 'retry');
  const records = { ...state.records };
  const { queue } = retryFailed(await deps.loadQueue());
  await deps.saveQueue(queue);
  run.items = await drainQueue(deps, state, records);
  return finishRun(deps, state, run, { records });
}
