// src/services/cytology/resolveCytologyMolecularLotToLotTrendReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyMolecularLotToLotTrendReport } from './resolveCytologyMolecularLotToLotTrendReport';
import type { MolecularQcRunRecord } from './IMolecularQcRunRecordService';

const run = (id: string, instrumentId: string, runDate: string, lot: string, lowPositiveCt: number): MolecularQcRunRecord => ({
  id, runDate, instrumentId, assayName: 'Test Assay', reagentLotNumber: lot,
  totalSamplesRun: 90, invalidControlCount: 0, inhibitorCount: 0,
  controlResults: [{ controlLevel: 'low_positive', meanCt: lowPositiveCt }],
});

describe('resolveCytologyMolecularLotToLotTrendReport — real, per direct guidance\'s own MOL-QA-04 specification', () => {
  it('a genuinely empty input produces zero rows, never a crash', () => {
    expect(resolveCytologyMolecularLotToLotTrendReport([])).toHaveLength(0);
  });

  it('a real, single lot with no real lot change produces zero rows — nothing to compare yet', () => {
    const runs = [run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30)];
    expect(resolveCytologyMolecularLotToLotTrendReport(runs)).toHaveLength(0);
  });

  it('a real, small Ct shift within the real default 1.0 threshold correctly passes', () => {
    const runs = [
      run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30.0),
      run('r2', 'CYTO-1', '2026-02-01T00:00:00.000Z', 'LOT-B', 30.5),
    ];
    const [row] = resolveCytologyMolecularLotToLotTrendReport(runs);
    expect(row.passFailStatus).toBe('pass');
    expect(row.deltaCtDifference).toBeCloseTo(0.5, 5);
  });

  it('a real, large Ct shift beyond the real default 1.0 threshold correctly fails', () => {
    const runs = [
      run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30.0),
      run('r2', 'CYTO-1', '2026-02-01T00:00:00.000Z', 'LOT-B', 32.0),
    ];
    const [row] = resolveCytologyMolecularLotToLotTrendReport(runs);
    expect(row.passFailStatus).toBe('fail');
  });

  it('a real, custom threshold is honored when explicitly provided', () => {
    const runs = [
      run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30.0),
      run('r2', 'CYTO-1', '2026-02-01T00:00:00.000Z', 'LOT-B', 30.5),
    ];
    const [row] = resolveCytologyMolecularLotToLotTrendReport(runs, 0.3);
    expect(row.passFailStatus).toBe('fail');
  });

  it('real lots are compared in genuine chronological order, never a real, backwards comparison', () => {
    // Runs given out of chronological order in the input array itself
    const runs = [
      run('r2', 'CYTO-1', '2026-02-01T00:00:00.000Z', 'LOT-B', 32.0),
      run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30.0),
    ];
    const [row] = resolveCytologyMolecularLotToLotTrendReport(runs);
    expect(row.reagentLotOld).toBe('LOT-A');
    expect(row.reagentLotNew).toBe('LOT-B');
  });

  it('real, multiple real instruments are never mixed into the same real lot-to-lot comparison', () => {
    const runs = [
      run('r1', 'CYTO-1', '2026-01-01T00:00:00.000Z', 'LOT-A', 30.0),
      run('r2', 'CYTO-1', '2026-02-01T00:00:00.000Z', 'LOT-B', 30.5),
      run('r3', 'CYTO-2', '2026-01-01T00:00:00.000Z', 'LOT-X', 28.0),
      run('r4', 'CYTO-2', '2026-02-01T00:00:00.000Z', 'LOT-Y', 28.4),
    ];
    const rows = resolveCytologyMolecularLotToLotTrendReport(runs);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.instrumentId).sort()).toEqual(['CYTO-1', 'CYTO-2']);
  });

  it('a real control level with no real data on one side of the lot change is honestly skipped, never a fabricated comparison', () => {
    const oldRun: MolecularQcRunRecord = { id: 'r1', runDate: '2026-01-01T00:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'x', reagentLotNumber: 'LOT-A', totalSamplesRun: 90, invalidControlCount: 0, inhibitorCount: 0, controlResults: [{ controlLevel: 'high_positive', meanCt: 24 }] };
    const newRun: MolecularQcRunRecord = { id: 'r2', runDate: '2026-02-01T00:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'x', reagentLotNumber: 'LOT-B', totalSamplesRun: 90, invalidControlCount: 0, inhibitorCount: 0, controlResults: [{ controlLevel: 'low_positive', meanCt: 32 }] };
    const rows = resolveCytologyMolecularLotToLotTrendReport([oldRun, newRun]);
    expect(rows).toHaveLength(0);
  });
});
