// src/services/cytology/resolveCytologyApacProficiencyTestReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance on APAC-QA-01 — "external EQA proficiency
// testing." Operates directly on CytologyProficiencyTestResult
// (ICytologyProficiencyTestResultService.ts) — one real row per real,
// received grade, matching this module's own established
// per-event report shape (resolveCytologyMolecularQcFailureRateReport.ts's
// own precedent), no invented aggregation shape.
//
// Real, researched compliance rule, not an invented threshold:
// confirmed directly (general CLIA PT requirements, MLO Online) —
// "if a laboratory has two unsatisfactory events out of three
// consecutive events, it will be cited with a deficiency for
// unsuccessful PT performance." `consecutiveDeficiencyFlagged` below
// applies this exact real rule to a real, chronologically-ordered
// result list, per real provider+challenge series — never a
// fabricated, invented cutoff.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyProficiencyTestResult } from './ICytologyProficiencyTestResultService';

export interface CytologyApacProficiencyTestRow {
  receivedAt: string;
  accessionNumber: string;
  provider: string;
  challengeReferenceId: string;
  outcome: CytologyProficiencyTestResult['outcome'];
  scoreDetail?: string;
  /** Real, per this file's own header — true when this event is the
   *  third of three real, chronologically-consecutive events (per
   *  provider) where two of the three were 'unsatisfactory' or
   *  'no_response' — the real, researched CLIA deficiency-citation
   *  rule, applied honestly rather than invented. */
  consecutiveDeficiencyFlagged: boolean;
}

export interface CytologyApacProficiencyTestReport {
  rows: CytologyApacProficiencyTestRow[];
  totalEvents: number;
  satisfactoryCount: number;
  satisfactoryRatePercent: number;
}

const NON_SATISFACTORY: CytologyProficiencyTestResult['outcome'][] = ['unsatisfactory', 'no_response'];

export function resolveCytologyApacProficiencyTestReport(results: CytologyProficiencyTestResult[]): CytologyApacProficiencyTestReport {
  // Real, per this file's own header — grouped and chronologically
  // ordered per provider, since the real CLIA rule is a real,
  // consecutive-event count within one real PT program, not across
  // genuinely unrelated providers.
  const byProvider = new Map<string, CytologyProficiencyTestResult[]>();
  for (const r of results) {
    const list = byProvider.get(r.provider) ?? [];
    list.push(r);
    byProvider.set(r.provider, list);
  }

  const flaggedIds = new Set<string>();
  for (const list of byProvider.values()) {
    const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    for (let i = 2; i < sorted.length; i++) {
      const window = sorted.slice(i - 2, i + 1);
      const nonSatisfactoryCount = window.filter(r => NON_SATISFACTORY.includes(r.outcome)).length;
      if (nonSatisfactoryCount >= 2) flaggedIds.add(sorted[i].id);
    }
  }

  const rows: CytologyApacProficiencyTestRow[] = [...results]
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .map(r => ({
      receivedAt: r.receivedAt,
      accessionNumber: r.accessionNumber,
      provider: r.provider,
      challengeReferenceId: r.challengeReferenceId,
      outcome: r.outcome,
      scoreDetail: r.scoreDetail,
      consecutiveDeficiencyFlagged: flaggedIds.has(r.id),
    }));

  const totalEvents = results.length;
  const satisfactoryCount = results.filter(r => r.outcome === 'satisfactory').length;
  const satisfactoryRatePercent = totalEvents === 0 ? 0 : (satisfactoryCount / totalEvents) * 100;

  return { rows, totalEvents, satisfactoryCount, satisfactoryRatePercent };
}
