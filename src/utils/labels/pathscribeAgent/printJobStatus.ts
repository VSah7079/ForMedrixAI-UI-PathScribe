// src/utils/labels/pathscribeAgent/printJobStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 346 (dev review of PS-52, point 2): what this tab's PathScribe
// Agent print jobs are doing right now, for the on-screen indicator
// (components/Printing/AgentPrintStatus.tsx).
//
//   update()      takes the client's progress reports (pathscribeAgentClient's
//                 onJobStatus). A job is shown while it is sending, queued
//                 or printing, and dropped when it is done or has failed:
//                 the print callers already report the outcome.
//   subscribe() / getSnapshot()
//                 the shape React's useSyncExternalStore expects. The
//                 snapshot is a new array only when something changed.
//   summariseAgentPrintJobs()
//                 the one line the indicator shows for a list of jobs.
//
// Held in memory for this tab only: nothing is stored.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentJobStatusUpdate } from './pathscribeAgentClient';

export interface AgentPrintJob {
  jobId: string;
  printerName: string;
  phase: 'sending' | 'queued' | 'printing';
  /** Jobs ahead of this one while queued (0 = prints next); otherwise null. */
  position: number | null;
}

export interface AgentPrintJobStore {
  update(u: AgentJobStatusUpdate): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly AgentPrintJob[];
}

export function createAgentPrintJobStore(): AgentPrintJobStore {
  let jobs: readonly AgentPrintJob[] = [];
  const listeners = new Set<() => void>();
  const set = (next: readonly AgentPrintJob[]) => { jobs = next; for (const l of [...listeners]) l(); };

  return {
    update: u => {
      const rest = jobs.filter(j => j.jobId !== u.jobId);
      if (u.phase === 'done' || u.phase === 'failed') {
        if (rest.length !== jobs.length) set(rest);
        return;
      }
      const job: AgentPrintJob = {
        jobId: u.jobId,
        printerName: u.printerName,
        phase: u.phase,
        position: u.phase === 'queued' && typeof u.position === 'number' ? u.position : null,
      };
      const i = jobs.findIndex(j => j.jobId === u.jobId);
      set(i < 0 ? [...jobs, job] : jobs.map((j, k) => (k === i ? job : j)));
    },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => jobs,
  };
}

/** What the indicator says, or null when nothing is in flight. */
export type AgentPrintSummary =
  | { kind: 'printing'; printerName: string; waiting: number }
  | { kind: 'queued'; ahead: number; waiting: number }
  | { kind: 'sending'; waiting: number }
  | null;

/**
 * One line for all of this tab's jobs: the job that is furthest along
 * (printing, then the queued job nearest the front, then sending), plus
 * how many more of this tab's labels are waiting behind it.
 */
export function summariseAgentPrintJobs(jobs: readonly AgentPrintJob[]): AgentPrintSummary {
  if (jobs.length === 0) return null;
  const waiting = jobs.length - 1;
  const printing = jobs.find(j => j.phase === 'printing');
  if (printing) return { kind: 'printing', printerName: printing.printerName, waiting };
  const queued = jobs.filter(j => j.phase === 'queued');
  if (queued.length > 0) {
    return { kind: 'queued', ahead: Math.min(...queued.map(j => j.position ?? 0)), waiting };
  }
  return { kind: 'sending', waiting };
}

/** The app's shared store, fed by the shared agent client. */
export const agentPrintJobs: AgentPrintJobStore = createAgentPrintJobStore();
