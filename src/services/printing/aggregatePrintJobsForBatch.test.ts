// src/services/printing/aggregatePrintJobsForBatch.test.ts
import { describe, it, expect } from 'vitest';
import { aggregatePrintJobsForBatch, DEFAULT_BATCHABLE_MODES } from './aggregatePrintJobsForBatch';
import type { PrintJob } from '@/types/printing/PrintJob';

function makeJob(overrides: Partial<PrintJob> & Pick<PrintJob, 'id'>): PrintJob {
  return {
    caseId: 'CASE-1', reportType: 'FINAL', mode: 'NATIVE_QZ_TRAY', priority: 'Routine',
    status: 'QUEUED', queuedAt: '2026-09-23T10:00:00.000Z', retryCount: 0, maxRetriesExceeded: false,
    ...overrides,
  };
}

describe('DEFAULT_BATCHABLE_MODES', () => {
  it('is real, per the source spec’s own "non-interfaced" qualifier — excludes INTERFACE_ENGINE_HANDOFF', () => {
    expect(DEFAULT_BATCHABLE_MODES).toEqual(['NATIVE_QZ_TRAY', 'DIRECT_NETWORK_PRINT']);
  });
});

describe('aggregatePrintJobsForBatch', () => {
  const window9to5 = { groupBy: 'clientAccount' as const, windowStart: '08:00', windowEnd: '17:00' };

  it('groups real, eligible jobs sharing the same real clientAccount key into one real batch', () => {
    const jobs = [
      makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A' }),
      makeJob({ id: 'j2', orderingFacilityId: 'CLIENT-A' }),
      makeJob({ id: 'j3', orderingFacilityId: 'CLIENT-B' }),
    ];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.groups).toHaveLength(2);
    const clientA = result.groups.find(g => g.groupKey === 'CLIENT-A');
    expect(clientA?.jobIds.sort()).toEqual(['j1', 'j2']);
    expect(result.skippedJobIds).toEqual([]);
  });

  it('groups by the real pointOfCare (delivery route) key when configured', () => {
    const jobs = [
      makeJob({ id: 'j1', pointOfCare: 'Theatre 2' }),
      makeJob({ id: 'j2', pointOfCare: 'Theatre 2' }),
      makeJob({ id: 'j3', pointOfCare: 'Pathology Lab' }),
    ];
    const result = aggregatePrintJobsForBatch(jobs, { ...window9to5, groupBy: 'deliveryRoute' }, 'seed1');
    expect(result.groups.map(g => g.groupKey).sort()).toEqual(['Pathology Lab', 'Theatre 2']);
  });

  it('skips a real job outside the real, configured time window — never silently included', () => {
    const jobs = [
      makeJob({ id: 'early', orderingFacilityId: 'CLIENT-A', queuedAt: '2026-09-23T05:00:00.000Z' }),
      makeJob({ id: 'late', orderingFacilityId: 'CLIENT-A', queuedAt: '2026-09-23T22:00:00.000Z' }),
      makeJob({ id: 'onTime', orderingFacilityId: 'CLIENT-A', queuedAt: '2026-09-23T12:00:00.000Z' }),
    ];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.skippedJobIds.sort()).toEqual(['early', 'late']);
    expect(result.groups[0].jobIds).toEqual(['onTime']);
  });

  it('honors the exact real window boundaries as inclusive', () => {
    const jobs = [
      makeJob({ id: 'atStart', orderingFacilityId: 'CLIENT-A', queuedAt: '2026-09-23T08:00:00.000Z' }),
      makeJob({ id: 'atEnd', orderingFacilityId: 'CLIENT-A', queuedAt: '2026-09-23T17:00:00.000Z' }),
    ];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.skippedJobIds).toEqual([]);
    expect(result.groups[0].jobIds.sort()).toEqual(['atEnd', 'atStart']);
  });

  it('skips a real job on a real, ineligible (interfaced) mode by default', () => {
    const jobs = [makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A', mode: 'INTERFACE_ENGINE_HANDOFF' })];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.skippedJobIds).toEqual(['j1']);
    expect(result.groups).toEqual([]);
  });

  it('a real, explicit eligibleModes override widens or narrows which modes qualify', () => {
    const jobs = [makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A', mode: 'INTERFACE_ENGINE_HANDOFF' })];
    const result = aggregatePrintJobsForBatch(jobs, { ...window9to5, eligibleModes: ['INTERFACE_ENGINE_HANDOFF'] }, 'seed1');
    expect(result.groups[0].jobIds).toEqual(['j1']);
  });

  it('skips a real job with no real grouping key at all (e.g. no orderingFacilityId resolved) rather than dropping it silently', () => {
    const jobs = [makeJob({ id: 'j1', orderingFacilityId: undefined })];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.skippedJobIds).toEqual(['j1']);
  });

  it('skips a real job that is not QUEUED — a HOLD/FAILED/PRINTED job is never silently swept into a new batch', () => {
    const jobs = [
      makeJob({ id: 'held', orderingFacilityId: 'CLIENT-A', status: 'HOLD' }),
      makeJob({ id: 'printed', orderingFacilityId: 'CLIENT-A', status: 'PRINTED' }),
    ];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'seed1');
    expect(result.groups).toEqual([]);
    expect(result.skippedJobIds.sort()).toEqual(['held', 'printed']);
  });

  it('produces a real, deterministic batchId from groupBy + groupKey + the caller’s own seed — no randomness', () => {
    const jobs = [makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A' })];
    const result = aggregatePrintJobsForBatch(jobs, window9to5, 'run-2026-09-23');
    expect(result.groups[0].batchId).toBe('batch-clientAccount-CLIENT-A-run-2026-09-23');
  });
});
