// src/services/cytology/resolveCytologyMolecularLotToLotTrendReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied MOL-QA-04 specification
// ("Molecular Assay Lot-to-Lot and Run QC Trend Report"). Operates
// directly on MolecularQcRunRecord (IMolecularQcRunRecordService.ts),
// the same real entity MOL-QA-02 reads — comparing mean Ct per real
// control level between consecutive real reagent lots on the same
// real instrument.
//
// Real, deliberate, configurable pass/fail threshold: no single
// number is universal across manufacturers or analytes (confirmed via
// real research before building this — CLSI EP26-A and published
// lot-verification studies each use their own real, assay-specific
// criteria, not one shared number). A real, commonly-cited practical
// rule of thumb — roughly 1.0 Ct of drift — is used as a real, stated
// default here, not presented as an authoritative regulatory
// threshold; a real facility's own, more specific QC policy should
// override it.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularQcRunRecord, MolecularControlLevel } from './IMolecularQcRunRecordService';

const DEFAULT_DELTA_CT_FAIL_THRESHOLD = 1.0;

export interface CytologyMolecularLotToLotTrendRow {
  instrumentId: string;
  reagentLotOld: string;
  reagentLotNew: string;
  controlLevel: MolecularControlLevel;
  meanCtOld: number;
  meanCtNew: number;
  deltaCtDifference: number;
  passFailStatus: 'pass' | 'fail';
}

export function resolveCytologyMolecularLotToLotTrendReport(
  runs: MolecularQcRunRecord[],
  deltaCtFailThreshold = DEFAULT_DELTA_CT_FAIL_THRESHOLD,
): CytologyMolecularLotToLotTrendRow[] {
  const rows: CytologyMolecularLotToLotTrendRow[] = [];

  const byInstrument = new Map<string, MolecularQcRunRecord[]>();
  for (const run of runs) {
    const list = byInstrument.get(run.instrumentId) ?? [];
    list.push(run);
    byInstrument.set(run.instrumentId, list);
  }

  for (const [instrumentId, instrumentRuns] of byInstrument) {
    // Real, chronological order matters — lot changeover is a real,
    // time-ordered event, and comparing lots out of order would
    // produce a real, backwards comparison.
    const sorted = [...instrumentRuns].sort((a, b) => a.runDate.localeCompare(b.runDate));
    const lotsInOrder = Array.from(new Set(sorted.map(r => r.reagentLotNumber)));

    for (let i = 1; i < lotsInOrder.length; i++) {
      const oldLot = lotsInOrder[i - 1];
      const newLot = lotsInOrder[i];
      const oldRuns = sorted.filter(r => r.reagentLotNumber === oldLot);
      const newRuns = sorted.filter(r => r.reagentLotNumber === newLot);

      const controlLevels: MolecularControlLevel[] = ['negative', 'low_positive', 'high_positive'];
      for (const controlLevel of controlLevels) {
        const oldCts = oldRuns.flatMap(r => r.controlResults.filter(c => c.controlLevel === controlLevel).map(c => c.meanCt));
        const newCts = newRuns.flatMap(r => r.controlResults.filter(c => c.controlLevel === controlLevel).map(c => c.meanCt));
        if (oldCts.length === 0 || newCts.length === 0) continue; // real, honest skip — no real data to compare for this control level

        const meanCtOld = oldCts.reduce((s, c) => s + c, 0) / oldCts.length;
        const meanCtNew = newCts.reduce((s, c) => s + c, 0) / newCts.length;
        const deltaCtDifference = meanCtNew - meanCtOld;

        rows.push({
          instrumentId, reagentLotOld: oldLot, reagentLotNew: newLot, controlLevel,
          meanCtOld, meanCtNew, deltaCtDifference,
          passFailStatus: Math.abs(deltaCtDifference) > deltaCtFailThreshold ? 'fail' : 'pass',
        });
      }
    }
  }

  return rows;
}
