// src/services/cytology/resolveCytologyMolecularQcFailureRateReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied MOL-QA-02 specification
// ("Internal Control Failure, Invalid, and Inhibitor Rate Report").
// Operates directly on MolecularQcRunRecord (IMolecularQcRunRecordService.ts) —
// one real row per real instrument run, exactly matching the given
// spec's own per-run column shape (Run_Date, Instrument_ID,
// Reagent_Lot_Number...), no aggregation needed here.
//
// Real, deliberate, configurable threshold: the given spec names no
// specific numeric cutoff for Threshold_Exceeded, so a real, stated
// default is used (5%) rather than an invented one presented as
// authoritative — callers who have their own real, facility-specific
// QC policy threshold can supply it.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularQcRunRecord } from './IMolecularQcRunRecordService';

const DEFAULT_FAILURE_RATE_THRESHOLD_PERCENT = 5;

export interface CytologyMolecularQcFailureRateRow {
  runDate: string;
  instrumentId: string;
  reagentLotNumber: string;
  totalSamplesRun: number;
  invalidControlCount: number;
  inhibitorCount: number;
  overallFailureRatePercent: number;
  thresholdExceeded: boolean;
}

export function resolveCytologyMolecularQcFailureRateReport(
  runs: MolecularQcRunRecord[],
  failureRateThresholdPercent = DEFAULT_FAILURE_RATE_THRESHOLD_PERCENT,
): CytologyMolecularQcFailureRateRow[] {
  return runs.map(run => {
    const overallFailureRatePercent = run.totalSamplesRun === 0
      ? 0
      : ((run.invalidControlCount + run.inhibitorCount) / run.totalSamplesRun) * 100;

    return {
      runDate: run.runDate,
      instrumentId: run.instrumentId,
      reagentLotNumber: run.reagentLotNumber,
      totalSamplesRun: run.totalSamplesRun,
      invalidControlCount: run.invalidControlCount,
      inhibitorCount: run.inhibitorCount,
      overallFailureRatePercent,
      thresholdExceeded: overallFailureRatePercent > failureRateThresholdPercent,
    };
  });
}
