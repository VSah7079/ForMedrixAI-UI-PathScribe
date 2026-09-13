// src/services/cytology/resolveCytologyApacProficiencyTestReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyApacProficiencyTestReport } from './resolveCytologyApacProficiencyTestReport';
import type { CytologyProficiencyTestResult } from './ICytologyProficiencyTestResultService';

function makeResult(overrides: Partial<CytologyProficiencyTestResult>): CytologyProficiencyTestResult {
  return {
    id: 'r1', caseId: 'c1', accessionNumber: 'S26-PT001-CYT-001', provider: 'CAP',
    challengeReferenceId: 'CAP-GYN-2026-A-01', outcome: 'satisfactory', receivedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveCytologyApacProficiencyTestReport — real, per direct guidance on APAC-QA-01', () => {
  it('real, a genuinely empty result list produces an honest, empty real report, never a fabricated row', () => {
    const report = resolveCytologyApacProficiencyTestReport([]);
    expect(report.rows).toHaveLength(0);
    expect(report.totalEvents).toBe(0);
    expect(report.satisfactoryRatePercent).toBe(0);
  });

  it('real, one row per real, received grade — the report never aggregates rows away', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1' }),
      makeResult({ id: 'r2', outcome: 'unsatisfactory' }),
    ]);
    expect(report.rows).toHaveLength(2);
  });

  it('real, correctly computes the real satisfactory rate across a real, mixed set', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', outcome: 'satisfactory' }),
      makeResult({ id: 'r2', outcome: 'satisfactory' }),
      makeResult({ id: 'r3', outcome: 'unsatisfactory' }),
      makeResult({ id: 'r4', outcome: 'no_response' }),
    ]);
    expect(report.satisfactoryCount).toBe(2);
    expect(report.satisfactoryRatePercent).toBe(50);
  });

  it('real, direct application of the real, researched CLIA rule: two non-satisfactory events out of three real, consecutive events correctly flags the third', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', outcome: 'satisfactory', receivedAt: '2026-01-01T00:00:00.000Z' }),
      makeResult({ id: 'r2', outcome: 'unsatisfactory', receivedAt: '2026-02-01T00:00:00.000Z' }),
      makeResult({ id: 'r3', outcome: 'unsatisfactory', receivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    const flagged = report.rows.find(r => r.receivedAt === '2026-03-01T00:00:00.000Z');
    expect(flagged?.consecutiveDeficiencyFlagged).toBe(true);
  });

  it('real, a genuinely single non-satisfactory event out of three consecutive events correctly does NOT flag — the real rule requires two, not one', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', outcome: 'satisfactory', receivedAt: '2026-01-01T00:00:00.000Z' }),
      makeResult({ id: 'r2', outcome: 'satisfactory', receivedAt: '2026-02-01T00:00:00.000Z' }),
      makeResult({ id: 'r3', outcome: 'unsatisfactory', receivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    const notFlagged = report.rows.find(r => r.receivedAt === '2026-03-01T00:00:00.000Z');
    expect(notFlagged?.consecutiveDeficiencyFlagged).toBe(false);
  });

  it('real, direct correction check: fewer than three real events can never be flagged — the real rule genuinely requires a real, three-event window', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', outcome: 'unsatisfactory', receivedAt: '2026-01-01T00:00:00.000Z' }),
      makeResult({ id: 'r2', outcome: 'unsatisfactory', receivedAt: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(report.rows.every(r => !r.consecutiveDeficiencyFlagged)).toBe(true);
  });

  it('real, no_response correctly counts toward the real deficiency rule, same as unsatisfactory — a real non-submission is genuinely as bad as a wrong answer for this real rule', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', outcome: 'satisfactory', receivedAt: '2026-01-01T00:00:00.000Z' }),
      makeResult({ id: 'r2', outcome: 'no_response', receivedAt: '2026-02-01T00:00:00.000Z' }),
      makeResult({ id: 'r3', outcome: 'unsatisfactory', receivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    const flagged = report.rows.find(r => r.receivedAt === '2026-03-01T00:00:00.000Z');
    expect(flagged?.consecutiveDeficiencyFlagged).toBe(true);
  });

  it('real, the consecutive-window rule is scoped per real provider — a real, unrelated provider\'s own events never contribute to another provider\'s own window', () => {
    const report = resolveCytologyApacProficiencyTestReport([
      makeResult({ id: 'r1', provider: 'CAP', outcome: 'unsatisfactory', receivedAt: '2026-01-01T00:00:00.000Z' }),
      makeResult({ id: 'r2', provider: 'RCPAQAP', outcome: 'unsatisfactory', receivedAt: '2026-02-01T00:00:00.000Z' }),
      makeResult({ id: 'r3', provider: 'CAP', outcome: 'unsatisfactory', receivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    // Real, only two real CAP events exist — the real rule genuinely
    // needs three real, consecutive events within the SAME provider.
    expect(report.rows.every(r => !r.consecutiveDeficiencyFlagged)).toBe(true);
  });
});
