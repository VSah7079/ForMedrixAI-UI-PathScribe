// src/utils/labels/pathscribeAgent/printJobStatus.test.ts — Batch 346 (PS-52, point 2)
import { describe, it, expect } from 'vitest';
import { createAgentPrintJobStore, summariseAgentPrintJobs, type AgentPrintJob } from './printJobStatus';

describe('agent print job store', () => {
  it('tracks a job while in flight and drops it when done or failed', () => {
    const store = createAgentPrintJobStore();
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.update({ jobId: 'a', printerName: 'ZD421', phase: 'sending' });
    store.update({ jobId: 'a', printerName: 'ZD421', phase: 'queued', position: 2 });
    expect(store.getSnapshot()).toEqual([{ jobId: 'a', printerName: 'ZD421', phase: 'queued', position: 2 }]);
    store.update({ jobId: 'a', printerName: 'ZD421', phase: 'printing' });
    expect(store.getSnapshot()[0]).toMatchObject({ phase: 'printing', position: null });
    store.update({ jobId: 'a', printerName: 'ZD421', phase: 'done' });
    expect(store.getSnapshot()).toEqual([]);
    expect(calls).toBe(4);
    off();
    store.update({ jobId: 'b', printerName: 'P', phase: 'failed' }); // unknown job: no change, no notice
    store.update({ jobId: 'c', printerName: 'P', phase: 'sending' });
    expect(calls).toBe(4);
  });

  it('keeps the same snapshot until something changes', () => {
    const store = createAgentPrintJobStore();
    const first = store.getSnapshot();
    store.update({ jobId: 'x', printerName: 'P', phase: 'done' });
    expect(store.getSnapshot()).toBe(first);
  });
});

describe('summariseAgentPrintJobs', () => {
  const job = (jobId: string, phase: AgentPrintJob['phase'], position: number | null = null): AgentPrintJob => ({ jobId, printerName: `P-${jobId}`, phase, position });

  it('shows nothing with no jobs', () => {
    expect(summariseAgentPrintJobs([])).toBeNull();
  });

  it('prefers the printing job, then the queued job nearest the front, then sending', () => {
    expect(summariseAgentPrintJobs([job('a', 'queued', 3), job('b', 'printing'), job('c', 'sending')])).toEqual({ kind: 'printing', printerName: 'P-b', waiting: 2 });
    expect(summariseAgentPrintJobs([job('a', 'queued', 3), job('b', 'queued', 1), job('c', 'sending')])).toEqual({ kind: 'queued', ahead: 1, waiting: 2 });
    expect(summariseAgentPrintJobs([job('a', 'sending')])).toEqual({ kind: 'sending', waiting: 0 });
  });
});
