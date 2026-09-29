// src/services/assistPolling/runAssistPollCycle.test.ts — PS-87 end to end, with fakes.
import { describe, it, expect, vi } from 'vitest';
import type { Case, ProtocolChange } from '@/types/case/Case';
import { runAssistPollCycle, ingestPushedMessage, retryFailedEvents, type AssistPollDeps } from './runAssistPollCycle';
import { DEFAULT_ASSIST_POLLING_SETTINGS } from './assistMilestoneRules';
import type { AssistPollingState } from './types';
import type { NormalizedLisUpdate, StagedLisEvent } from '../lisIngestion/types';
import { MAX_ATTEMPTS, stageUpdates } from '../lisIngestion/stagingRules';
import { webhookJsonAdapter } from '../lisIngestion/adapters/webhookJsonAdapter';
import { hl7v2StatusAdapter } from '../lisIngestion/adapters/hl7v2StatusAdapter';

function makeCase(id: string, over: Partial<Case> = {}): Case {
  return {
    id, reportingMode: 'assist', status: 'pool',
    specimens: [{ id: `${id}-A`, label: 'A', description: 'Right hemicolectomy' }],
    synopticReports: [], diagnostic: {}, order: { facilityId: 'fac-1' },
    ...over,
  } as unknown as Case;
}

function harness(opts: { lis: NormalizedLisUpdate[]; cases: Case[]; aiEnabled?: { gross: boolean; microscopic: boolean } }) {
  const cases = new Map(opts.cases.map(c => [c.id, structuredClone(c)]));
  let state: AssistPollingState = { settings: { ...DEFAULT_ASSIST_POLLING_SETTINGS, enabled: true }, cursor: null, records: {}, runs: [] };
  let queue: StagedLisEvent[] = [];
  const audit: Array<{ detail: string }> = [];
  let clock = 0;
  let ids = 0;
  const lis = { updates: opts.lis, down: false };
  const evaluate = vi.fn(async (input: { specimens: Array<{ specimenId: string; currentSynoptics: unknown[] }> }) => ({
    warnings: [],
    changes: input.specimens.filter(s => s.currentSynoptics.length === 0).map((s, i): ProtocolChange => ({
      id: `chg-${i}`, specimenId: s.specimenId, specimenLabel: 'A', specimenDesc: '', action: 'add',
      proposedTemplateId: 'colon_resection', proposedTemplateName: 'Colon Resection', reason: 'tumour in colon', confidence: 88,
    } as ProtocolChange)),
  }));
  const suggest = vi.fn(async (c: Case) => ({
    tumor_size: { value: '5.8 cm', confidence: 90, source: 'gross', verification: 'unverified' as const },
    ...(c.diagnostic?.microscopicDescription ? { lvi: { value: 'present', confidence: 85, source: 'micro', verification: 'unverified' as const } } : {}),
  }));
  const deps: AssistPollDeps = {
    pollAdapter: {
      source: 'poll',
      fetchChangedSince: async since => {
        if (lis.down) throw new Error('LIS timeout');
        return lis.updates.filter(s => since === null || s.updatedAt > since);
      },
    },
    loadQueue: async () => structuredClone(queue),
    saveQueue: async q => { queue = structuredClone(q); },
    getCase: async id => structuredClone(cases.get(id)),
    updateCase: async (id, u) => { cases.set(id, { ...cases.get(id)!, ...structuredClone(u) }); },
    listDiagnosticTemplates: async () => [{ id: 'colon_resection', name: 'Colon Resection', category: 'GI' }],
    getTemplateFields: async () => [{ id: 'tumor_size', label: 'Tumor size' }, { id: 'lvi', label: 'LVI' }],
    evaluateSynopticAssignment: evaluate as never,
    generateSuggestions: suggest,
    getAiEnabled: async () => opts.aiEnabled ?? { gross: true, microscopic: true },
    loadState: async () => structuredClone(state),
    saveState: async s => { state = structuredClone(s); },
    logAudit: async e => { audit.push(e as { detail: string }); },
    now: () => `2026-09-24T15:${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}.000Z`,
    newId: () => `id-${ids++}`,
  };
  return { deps, cases, lis, state: () => state, queue: () => queue, audit, evaluate, suggest };
}

const gross: NormalizedLisUpdate = { accession: 'C1', lisStatus: 'GROSSED', updatedAt: '2026-09-24T10:00:00.000Z', grossText: 'Hemicolectomy, tumour 5.8 cm.' };
const micro: NormalizedLisUpdate = { ...gross, lisStatus: 'MICRO_COMPLETE', updatedAt: '2026-09-24T12:00:00.000Z', microscopicText: 'Adenocarcinoma, LVI present.', diagnosisText: 'Adenocarcinoma' };

describe('runAssistPollCycle (poll adapter → staging queue → worker)', () => {
  it('Gross Complete: stages the update, syncs the text, picks the template and fills from the gross only', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')] });
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run).toMatchObject({ fetched: 1, staged: 1 });
    expect(run.items).toEqual([expect.objectContaining({ accession: 'C1', source: 'poll', milestone: 'gross_complete', outcome: 'draft_prepared', draftsCreated: 1, fieldsSuggested: 1 })]);
    const c = h.cases.get('C1')!;
    expect(c.diagnostic?.grossDescription).toBe(gross.grossText);
    expect(c.synopticReports?.[0]).toMatchObject({ templateId: 'colon_resection', status: 'draft', answers: { tumor_size: '5.8 cm' }, aiDraftSource: { milestone: 'gross_complete' } });
    expect(h.suggest.mock.calls[0][0].diagnostic?.microscopicDescription).toBe('');
    expect(h.queue()).toEqual([expect.objectContaining({ state: 'processed', outcome: 'draft_prepared', attempts: 1 })]);
    expect(h.state().cursor).toBe(gross.updatedAt);
    expect(h.audit[0].detail).toContain('via poll');
  });

  it('then Micro/Diagnosis Complete: completes the same draft without duplicating it', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')] });
    await runAssistPollCycle(h.deps, 'manual');
    h.lis.updates = [gross, micro];
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run.items).toHaveLength(1);
    expect(run.items[0]).toMatchObject({ milestone: 'micro_diagnosis_complete', outcome: 'draft_prepared', draftsCreated: 0, fieldsSuggested: 2 });
    const c = h.cases.get('C1')!;
    expect(c.synopticReports).toHaveLength(1);
    expect(c.synopticReports?.[0].answers).toEqual({ tumor_size: '5.8 cm', lvi: 'present' });
    expect(c.diagnostic?.primaryDiagnosis).toBe('Adenocarcinoma');
  });

  it('a second poll with nothing new does nothing', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')] });
    await runAssistPollCycle(h.deps, 'manual');
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run).toMatchObject({ fetched: 0, staged: 0, items: [] });
    expect(h.evaluate).toHaveBeenCalledTimes(1);
  });

  it('only syncs text when the Gross-Driven AI toggle is off', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')], aiEnabled: { gross: false, microscopic: true } });
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run.items[0].outcome).toBe('text_only_ai_disabled');
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.cases.get('C1')!.diagnostic?.grossDescription).toBe(gross.grossText);
  });

  it('never touches a signed-out case, an Orchestration case, or an unmapped status', async () => {
    const h = harness({
      lis: [
        { ...gross, accession: 'F1' },
        { ...gross, accession: 'O1', updatedAt: '2026-09-24T10:01:00.000Z' },
        { ...gross, accession: 'C1', lisStatus: 'RECEIVED', updatedAt: '2026-09-24T10:02:00.000Z' },
      ],
      cases: [makeCase('F1', { status: 'finalized' } as never), makeCase('O1', { reportingMode: 'orchestrator' } as never), makeCase('C1')],
    });
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run.items.map(i => i.outcome)).toEqual(['case_signed_out', 'not_assist_case', 'no_milestone']);
    expect(h.evaluate).not.toHaveBeenCalled();
  });

  it('a failing event stays in the queue and is retried next run, without re-fetching from the LIS', async () => {
    const h = harness({ lis: [gross, { ...gross, accession: 'C2', updatedAt: '2026-09-24T11:00:00.000Z' }], cases: [makeCase('C1'), makeCase('C2')] });
    h.suggest.mockRejectedValueOnce(new Error('AI unavailable'));
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run.items.map(i => i.outcome)).toEqual(['failed', 'draft_prepared']);
    expect(run.items[0].error).toBe('AI unavailable');
    expect(h.state().cursor).toBe('2026-09-24T11:00:00.000Z');
    const retry = await runAssistPollCycle(h.deps, 'manual');
    expect(retry.fetched).toBe(0);
    expect(retry.items.map(i => [i.accession, i.outcome])).toEqual([['C1', 'draft_prepared']]);
  });

  it('an unreachable LIS is recorded, and anything already staged is still processed', async () => {
    const h = harness({ lis: [], cases: [makeCase('C1')] });
    await h.deps.saveQueue(stageUpdates([], [gross], 'webhook', { now: 'n', newId: () => 'e1' }).queue);
    h.lis.down = true;
    const run = await runAssistPollCycle(h.deps, 'scheduled');
    expect(run).toMatchObject({ error: 'LIS timeout', fetched: 0, trigger: 'scheduled' });
    expect(run.items.map(i => i.outcome)).toEqual(['draft_prepared']);
    expect(h.state().cursor).toBeNull();
  });
});

describe('ingestPushedMessage (push adapter → staging queue → worker, on receipt)', () => {
  it('drafts from an HL7 v2 message as soon as it arrives', async () => {
    const h = harness({ lis: [], cases: [makeCase('C1')] });
    const hl7 = [
      'MSH|^~\\&|LIS|LAB|PATHSCRIBE|PS|20260924100000||ORU^R01|M1|P|2.5.1',
      'ORC|SC|C1|C1||GROSSED',
      'OBR|1|C1|C1|88305||||||||||||||||||20260924100000',
      'OBX|1|TX|22634-0^Gross^LN||Hemicolectomy, tumour 5.8 cm.',
    ].join('\r');
    const run = await ingestPushedMessage(h.deps, hl7v2StatusAdapter, hl7);
    expect(run).toMatchObject({ trigger: 'push', staged: 1 });
    expect(run.items[0]).toMatchObject({ source: 'hl7v2', outcome: 'draft_prepared' });
    expect(h.cases.get('C1')!.synopticReports).toHaveLength(1);
    expect(h.audit[0].detail).toContain('via HL7 v2 message');
  });

  it('refuses an unreadable message and stages nothing', async () => {
    const h = harness({ lis: [], cases: [makeCase('C1')] });
    const run = await ingestPushedMessage(h.deps, webhookJsonAdapter, '{not json');
    expect(run.error).toBe('INVALID_JSON');
    expect(h.queue()).toEqual([]);
    expect(h.state().runs).toHaveLength(1);
  });

  it('the same change pushed and then polled is handled once', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')] });
    await ingestPushedMessage(h.deps, webhookJsonAdapter, JSON.stringify({ accession: 'C1', status: 'GROSSED', updatedAt: gross.updatedAt, grossText: gross.grossText }));
    const run = await runAssistPollCycle(h.deps, 'manual');
    expect(run).toMatchObject({ fetched: 1, staged: 0, items: [] });
    expect(h.evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('retryFailedEvents', () => {
  it('gives an event that used up its attempts another go', async () => {
    const h = harness({ lis: [gross], cases: [makeCase('C1')] });
    h.suggest.mockRejectedValue(new Error('AI unavailable'));
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await runAssistPollCycle(h.deps, 'manual');
    expect(h.queue()[0]).toMatchObject({ state: 'failed', attempts: MAX_ATTEMPTS });
    h.suggest.mockReset();
    h.suggest.mockResolvedValue({} as never);
    const run = await retryFailedEvents(h.deps);
    expect(run.items.map(i => i.outcome)).toEqual(['draft_prepared']);
    expect(h.queue()[0]).toMatchObject({ state: 'processed', attempts: 1 });
  });
});
