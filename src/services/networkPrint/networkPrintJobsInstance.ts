// src/services/networkPrint/networkPrintJobsInstance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 347 (PS-54): the app's shared network print tracker, exported from
// `@/services` as `networkPrintJobs`. Answers come over the live-update
// connection; with no API server (the local transport, i.e. the demo)
// nothing can answer, so the demo may simulate the engine's reply — except
// in an SSO build, which is never a demo.
// ─────────────────────────────────────────────────────────────────────────────

import { dispatchNetworkPrintJob } from '@/utils/labels/dispatchNetworkPrintJob';
import { mockAuditService } from '../auditlog/mockAuditService';
import { liveUpdateService } from '../liveUpdates/liveUpdateService';
import { localLiveUpdateService } from '../liveUpdates/localLiveUpdateService';
import { readSessionProfile } from '../auth/sessionProfile';
import { createNetworkPrintJobTracker } from './networkPrintJobs';

/** The demo may simulate an engine answer only with no API server and outside SSO builds. */
export function canSimulatePrintResults(opts: { transport: 'signalr' | 'local'; authMode: string | undefined }): boolean {
  return opts.transport === 'local' && opts.authMode !== 'sso';
}

export const networkPrintJobs = createNetworkPrintJobTracker({
  dispatch: dispatchNetworkPrintJob,
  audit: mockAuditService,
  subscribeResults: onEvent => liveUpdateService.subscribePrintJobs(onEvent),
  simulate: canSimulatePrintResults({ transport: liveUpdateService.transport, authMode: import.meta.env.VITE_AUTH_MODE as string | undefined })
    ? result => { localLiveUpdateService.publishPrintJobStatus(result); }
    : undefined,
  currentUserName: () => { const p = readSessionProfile(); return p?.name ?? p?.id ?? 'unknown'; },
});
