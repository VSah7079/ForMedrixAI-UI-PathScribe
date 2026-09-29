// src/services/assistPolling/assistPollingRuntime.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-87: wires runAssistPollCycle to the app's real services.
//
// The poll is a system process, not a user action: it reads and writes
// Assist cases through the LIS case service directly (as the Engine
// webhooks do through the Admin SDK), not through CaseRouter's per-user
// access check. Whoever presses "Poll now" doesn't limit which cases the
// LIS sync can update.
//
// Entry points (Batch 323, Pete's ingestion-layer design): all three feed
// the universal staging queue (services/lisIngestion/) and then run the
// same worker.
//   runAssistPollNow        the poll adapter. In production a server-side
//                           schedule (e.g. a Vercel cron route beside
//                           api/webhooks/engine/) calls it every
//                           settings.intervalMinutes; "Poll now" calls it
//                           from the admin screen.
//   ingestLisMessageNow     a pushed HL7 v2 or JSON message. In production
//                           an inbound endpoint calls it; the admin screen's
//                           "Test an inbound message" calls it here.
//   retryFailedLisEventsNow the admin screen's "Retry failed".
// ─────────────────────────────────────────────────────────────────────────────

import type { AssistPollRun } from './types';
import { runAssistPollCycle, ingestPushedMessage, retryFailedEvents, type AssistPollDeps } from './runAssistPollCycle';
import { mockAssistPollingService } from './mockAssistPollingService';
import { mockPollAdapter } from '../lisIngestion/adapters/mockPollAdapter';
import { mockLisStagingQueueService } from '../lisIngestion/mockLisStagingQueueService';
import { hl7v2StatusAdapter } from '../lisIngestion/adapters/hl7v2StatusAdapter';
import { webhookJsonAdapter } from '../lisIngestion/adapters/webhookJsonAdapter';
import type { LisPushAdapter } from '../lisIngestion/types';

async function buildDeps(): Promise<AssistPollDeps> {
  const [{ mockCaseService, evaluateSynopticAssignment, generateAiSuggestionsForReport }, templateModule, { aiBehaviorService, auditService }] =
    await Promise.all([
      import('@/services/cases/mockCaseService'),
      import('@/services/templates/templateService'),
      import('@/services'),
    ]);

  const deps: AssistPollDeps = {
    pollAdapter: mockPollAdapter,
    loadQueue: () => mockLisStagingQueueService.load(),
    saveQueue: q => mockLisStagingQueueService.save(q),
    getCase: id => mockCaseService.getCase(id),
    updateCase: (id, updates) => mockCaseService.updateCase(id, updates),
    listDiagnosticTemplates: async () =>
      (await templateModule.listTemplates('published'))
        .filter(t => t.isDiagnostic !== false)
        .map(t => ({ id: t.id, name: t.name, category: t.category })),
    getTemplateFields: async id => {
      const detail = await templateModule.getTemplate(id);
      return detail.template.sections.flatMap(s => s.fields.map(f => ({ id: f.id, label: f.label, options: f.options?.map(o => ({ id: o.id, label: o.label })) })));
    },
    evaluateSynopticAssignment,
    generateSuggestions: (c, templateId, fields) => generateAiSuggestionsForReport(c, templateId, fields),
    getAiEnabled: async () => {
      const res = await aiBehaviorService.get();
      return {
        gross: !res.ok || res.data.grossEnabled !== false,
        microscopic: !res.ok || res.data.microscopicEnabled !== false,
      };
    },
    loadState: () => mockAssistPollingService.getState(),
    saveState: s => mockAssistPollingService.saveState(s),
    logAudit: entry => auditService.logEvent(entry),
    now: () => new Date().toISOString(),
    newId: () => `lis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
  return deps;
}

export async function runAssistPollNow(trigger: 'manual' | 'scheduled' = 'manual'): Promise<AssistPollRun> {
  return runAssistPollCycle(await buildDeps(), trigger);
}

/** The push adapters a site can send through. */
export const LIS_PUSH_ADAPTERS: Record<'hl7v2' | 'webhook', LisPushAdapter> = {
  hl7v2: hl7v2StatusAdapter,
  webhook: webhookJsonAdapter,
};

export async function ingestLisMessageNow(kind: 'hl7v2' | 'webhook', raw: string): Promise<AssistPollRun> {
  return ingestPushedMessage(await buildDeps(), LIS_PUSH_ADAPTERS[kind], raw);
}

export async function retryFailedLisEventsNow(): Promise<AssistPollRun> {
  return retryFailedEvents(await buildDeps());
}
