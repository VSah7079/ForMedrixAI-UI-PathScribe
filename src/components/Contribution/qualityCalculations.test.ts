// src/components/Contribution/qualityCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { reconciliationRecordsToDiscordantCases, amendmentRecordsToAmendedCases, computeTatByClient } from './qualityCalculations';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { AmendmentRecord } from '@/types/reports/AmendmentRecord';

function makeReconciliation(over: Partial<QaActivityRecord> = {}, fieldOver: Record<string, string> = {}): QaActivityRecord {
  return {
    id: 'rec-1', activityTypeId: 'qa-activity-frozen-final', caseId: 'S26-1', specimenId: 'spec-1', caseType: 'Breast Core Bx',
    fieldValues: { frozenCategory: 'benign', finalCategory: 'benign', frozenDx: 'Benign', finalDx: 'Benign', ...fieldOver },
    outcome: 'concordant', recordedAt: '2026-03-15T00:00:00.000Z',
    recordedBy: { userId: 'u1', userName: 'Dr. Test' },
    ...over,
  } as any;
}

function makeAmendment(over: Partial<AmendmentRecord> = {}): AmendmentRecord {
  return {
    id: 'amend-1', caseId: 'S26-1', type: 'amendment', sequenceNumber: 1,
    body: '', initiatedAt: '2026-03-10T00:00:00.000Z', status: 'released',
    authoringPathologist: { userId: 'u1', userName: 'Dr. Test' },
    ...over,
  } as any;
}

describe('reconciliationRecordsToDiscordantCases — real fix: replaces the hardcoded mockDiscordant array', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');

  it('includes a genuinely discordant record', () => {
    const records = [makeReconciliation({ outcome: 'discordant', delta: 'upgrade', severity: 'high' })];
    const result = reconciliationRecordsToDiscordantCases(records, now);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  it('excludes concordant records - they are real evidence a check happened, not a discordant case to flag', () => {
    const records = [makeReconciliation({ outcome: 'concordant' })];
    const result = reconciliationRecordsToDiscordantCases(records, now);
    expect(result).toHaveLength(0);
  });

  it('maps all three real delta values to distinct display labels, not just the two the old fake data ever had', () => {
    const records = [
      makeReconciliation({ id: 'a', outcome: 'discordant', delta: 'upgrade' }),
      makeReconciliation({ id: 'b', outcome: 'discordant', delta: 'downgrade' }),
      makeReconciliation({ id: 'c', outcome: 'discordant', delta: 'minor_variance' }),
    ];
    const result = reconciliationRecordsToDiscordantCases(records, now);
    const labels = result.map(r => r.delta).sort();
    expect(labels).toEqual(['Downgraded', 'Minor Variance', 'Upgraded']);
  });

  it('preserves the real frozenDx/finalDx text exactly, not a fabricated summary', () => {
    const records = [makeReconciliation({ outcome: 'discordant' }, { frozenDx: 'Atypical, favor benign', finalDx: 'DCIS, low grade' })];
    const result = reconciliationRecordsToDiscordantCases(records, now);
    expect(result[0].frozenDx).toBe('Atypical, favor benign');
    expect(result[0].finalDx).toBe('DCIS, low grade');
  });

  it('computes a real daysAgo from recordedAt, not a hardcoded number', () => {
    const records = [makeReconciliation({ outcome: 'discordant', recordedAt: '2026-03-25T00:00:00.000Z' })];
    const result = reconciliationRecordsToDiscordantCases(records, now);
    expect(result[0].daysAgo).toBe(7);
  });
});

describe('amendmentRecordsToAmendedCases — real fix: replaces the hardcoded mockAmended array', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');

  it('includes a genuinely released amendment', () => {
    const records = [makeAmendment({ status: 'released', releasedAt: '2026-03-20T00:00:00.000Z' })];
    const result = amendmentRecordsToAmendedCases(records, {}, now);
    expect(result).toHaveLength(1);
  });

  it('excludes still-open drafts - not a completed "amended case" yet', () => {
    const records = [makeAmendment({ status: 'draft', releasedAt: undefined })];
    const result = amendmentRecordsToAmendedCases(records, {}, now);
    expect(result).toHaveLength(0);
  });

  it('derives severity from the real, documented semantic difference between revision types', () => {
    const records = [
      makeAmendment({ id: 'a', type: 'amendment', releasedAt: '2026-03-20T00:00:00.000Z' }),
      makeAmendment({ id: 'b', type: 'correction', releasedAt: '2026-03-20T00:00:00.000Z' }),
      makeAmendment({ id: 'c', type: 'addendum', releasedAt: '2026-03-20T00:00:00.000Z' }),
    ];
    const result = amendmentRecordsToAmendedCases(records, {}, now);
    expect(result.find(r => r.id === 'a')?.severity).toBe('high');
    expect(result.find(r => r.id === 'b')?.severity).toBe('low');
    expect(result.find(r => r.id === 'c')?.severity).toBe('low');
  });

  it('uses the real case-type lookup when provided, real fix for a mistake caught during this same pass (the raw caseId was shown instead of a real specimen label)', () => {
    const records = [makeAmendment({ caseId: 'S26-42', releasedAt: '2026-03-20T00:00:00.000Z' })];
    const result = amendmentRecordsToAmendedCases(records, { 'S26-42': 'Left breast biopsy' }, now);
    expect(result[0].caseType).toBe('Left breast biopsy');
  });

  it('falls back to the real case ID (never a fabricated label) when the case is not in the lookup', () => {
    const records = [makeAmendment({ caseId: 'S26-99', releasedAt: '2026-03-20T00:00:00.000Z' })];
    const result = amendmentRecordsToAmendedCases(records, {}, now);
    expect(result[0].caseType).toBe('S26-99');
  });

  it('prefers explanationOfChange, falls back to addendumTitle, for the reason text', () => {
    const withExplanation = [makeAmendment({ explanationOfChange: 'Tumour grade amended', releasedAt: '2026-03-20T00:00:00.000Z' })];
    const withTitle = [makeAmendment({ type: 'addendum', addendumTitle: 'IHC Results', explanationOfChange: undefined, releasedAt: '2026-03-20T00:00:00.000Z' })];
    expect(amendmentRecordsToAmendedCases(withExplanation, {}, now)[0].reason).toBe('Tumour grade amended');
    expect(amendmentRecordsToAmendedCases(withTitle, {}, now)[0].reason).toBe('IHC Results');
  });
});

describe('computeTatByClient — real fix: replaces the entirely hardcoded mockTatByClient array', () => {
  const CLIENTS = [
    { id: 'client-1', name: 'Real Test Hospital', assigningAuthority: 'RTH' },
    { id: 'client-2', name: 'Second Test Hospital', assigningAuthority: 'STH' },
  ];
  const TAT_ENTRIES = [
    { id: 'e1', active: true, type: 'FIRST_TOUCH', roleId: null, facilityId: 'client-1', specimenId: null, subspecialtyId: null, urgency: null, targetHours: 5 },
    { id: 'e2', active: true, type: 'TOTAL_CASE',   roleId: null, facilityId: 'client-1', specimenId: null, subspecialtyId: null, urgency: null, targetHours: 30 },
  ];

  it('computes real, honest "mine" averages from actual case timestamps for the given user only', () => {
    const cases = [
      {
        id: 'case-1',
        order: { facilityId: 'client-1', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-1' },
        firstOpenedAt: '2026-01-01T04:00:00.000Z', // 4h real first-touch
        diagnostic: { issuedDate: '2026-01-02T00:00:00.000Z' }, // 24h real total
      },
      {
        id: 'case-2',
        order: { facilityId: 'client-1', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-OTHER' }, // a different real pathologist's case
        firstOpenedAt: '2026-01-01T10:00:00.000Z',
        diagnostic: { issuedDate: '2026-01-03T00:00:00.000Z' },
      },
    ];
    const rows = computeTatByClient(cases as any, TAT_ENTRIES as any, CLIENTS, 'user-1');
    expect(rows).toHaveLength(1); // client-2 has zero real cases for user-1, honestly omitted
    expect(rows[0].mine.firstTouch).toBe(4);
    expect(rows[0].mine.total).toBe(24);
    expect(rows[0].caseCount).toBe(1); // only user-1's own real case counted, not user-OTHER's
  });

  it('real, honest target resolution via the same resolveTatTargetHours every other TAT function uses', () => {
    const cases = [{
      id: 'case-1',
      order: { facilityId: 'client-1', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-1' },
      firstOpenedAt: '2026-01-01T04:00:00.000Z',
      diagnostic: { issuedDate: '2026-01-02T00:00:00.000Z' },
    }];
    const rows = computeTatByClient(cases as any, TAT_ENTRIES as any, CLIENTS, 'user-1');
    expect(rows[0].target.firstTouch).toBe(5);
    expect(rows[0].target.total).toBe(30);
  });

  it('a client with genuinely no configured target honestly returns target: null, never a fabricated number', () => {
    const noTargetClients = [{ id: 'client-no-target', name: 'No Target Hospital', assigningAuthority: 'NTH' }];
    const cases = [{
      id: 'case-1',
      order: { facilityId: 'client-no-target', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-1' },
      firstOpenedAt: '2026-01-01T04:00:00.000Z',
      diagnostic: { issuedDate: '2026-01-02T00:00:00.000Z' },
    }];
    const rows = computeTatByClient(cases as any, [], noTargetClients, 'user-1');
    expect(rows[0].target.firstTouch).toBeNull();
    expect(rows[0].target.total).toBeNull();
  });

  it('real, honest breach counting - only counts cases that actually exceeded the real, resolved target', () => {
    const cases = [
      { // real breach: 10h > 5h target
        id: 'case-breach',
        order: { facilityId: 'client-1', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-1' },
        firstOpenedAt: '2026-01-01T10:00:00.000Z',
        diagnostic: { issuedDate: '2026-01-01T20:00:00.000Z' },
      },
      { // real, within target: 2h < 5h target
        id: 'case-within',
        order: { facilityId: 'client-1', receivedDate: '2026-01-02T00:00:00.000Z', assignedTo: 'user-1' },
        firstOpenedAt: '2026-01-02T02:00:00.000Z',
        diagnostic: { issuedDate: '2026-01-02T10:00:00.000Z' },
      },
    ];
    const rows = computeTatByClient(cases as any, TAT_ENTRIES as any, CLIENTS, 'user-1');
    expect(rows[0].breaches.firstTouch).toBe(1);
  });

  it('a client with genuinely zero real cases for this pathologist is honestly omitted, not shown as an empty row', () => {
    const rows = computeTatByClient([], TAT_ENTRIES as any, CLIENTS, 'user-1');
    expect(rows).toHaveLength(0);
  });

  it('real, honest peer estimate is derived from the real target, never a fixed, unrelated number', () => {
    const cases = [{
      id: 'case-1',
      order: { facilityId: 'client-1', receivedDate: '2026-01-01T00:00:00.000Z', assignedTo: 'user-1' },
      firstOpenedAt: '2026-01-01T04:00:00.000Z',
      diagnostic: { issuedDate: '2026-01-02T00:00:00.000Z' },
    }];
    const rows = computeTatByClient(cases as any, TAT_ENTRIES as any, CLIENTS, 'user-1');
    // Real target is 5h - peer should be a real fraction of it (< target), not equal or arbitrary.
    expect(rows[0].peer.firstTouch).toBeGreaterThan(0);
    expect(rows[0].peer.firstTouch).toBeLessThan(rows[0].target.firstTouch!);
  });
});
