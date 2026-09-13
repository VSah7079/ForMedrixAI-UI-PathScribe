// src/services/cytology/mockMolecularQcRunRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct instruction: synthetic seed data so MOL-QA-02 and
// MOL-QA-04 can actually be demoed. Every value below is invented for
// this purpose — clearly-synthetic instrument IDs, lot numbers, and Ct
// values, the same kind of synthetic seed data this app already uses
// throughout for patients, accessions, and reviews. Nothing here
// represents a real instrument, a real reagent lot, or a real
// manufacturer's own validation data.
//
// Real, deliberate seed design, not arbitrary filler: two real
// instruments, each with a real lot transition partway through the
// seeded date range (an "old" lot to a "new" lot), so MOL-QA-04's own
// lot-to-lot comparison has real, non-trivial data to show. One run is
// seeded with a real, deliberately elevated invalid/inhibitor count so
// MOL-QA-02's own Threshold_Exceeded flag has a real case to flag, not
// an all-clean dataset that never demonstrates the alert path. One
// control-level Ct shift across the CYTO-2 lot change is seeded large
// enough to fail a real, reasonable delta-Ct threshold (see
// resolveCytologyMolecularLotToLotTrendReport.ts's own header for why
// ~1.0 Ct, not a fabricated regulatory number), so that report's own
// Pass/Fail column has a real fail case too.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { IMolecularQcRunRecordService, MolecularQcRunRecord } from './IMolecularQcRunRecordService';

const STORE_KEY = 'molecular_qc_run_records';
const ok = <T>(data: T) => ({ ok: true as const, data });
const delay = () => new Promise(res => setTimeout(res, 30));

const SEED: MolecularQcRunRecord[] = [
  // CYTO-1 — Roche cobas 4800, LOT-CYTO1-2601 (Jan 2026)
  { id: 'mqc-001', runDate: '2026-01-06T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2601', totalSamplesRun: 94, invalidControlCount: 0, inhibitorCount: 1,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.2 }, { controlLevel: 'high_positive', meanCt: 24.1 }] },
  { id: 'mqc-002', runDate: '2026-01-13T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2601', totalSamplesRun: 88, invalidControlCount: 1, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.5 }, { controlLevel: 'high_positive', meanCt: 23.9 }] },
  { id: 'mqc-003', runDate: '2026-01-20T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2601', totalSamplesRun: 91, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 32.9 }, { controlLevel: 'high_positive', meanCt: 24.3 }] },
  // CYTO-1 — lot transition to LOT-CYTO1-2604 (Feb 2026) — real, small, passing Ct shift
  { id: 'mqc-004', runDate: '2026-02-03T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2604', totalSamplesRun: 96, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.6 }, { controlLevel: 'high_positive', meanCt: 24.5 }] },
  { id: 'mqc-005', runDate: '2026-02-10T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2604', totalSamplesRun: 89, invalidControlCount: 0, inhibitorCount: 1,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.4 }, { controlLevel: 'high_positive', meanCt: 24.2 }] },
  // CYTO-1 — a real, deliberately elevated-failure run, for MOL-QA-02's own Threshold_Exceeded case
  { id: 'mqc-006', runDate: '2026-02-17T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2604', totalSamplesRun: 90, invalidControlCount: 5, inhibitorCount: 4,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.8 }, { controlLevel: 'high_positive', meanCt: 24.6 }] },
  { id: 'mqc-007', runDate: '2026-02-24T08:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Roche cobas 4800 HPV', reagentLotNumber: 'LOT-CYTO1-2604', totalSamplesRun: 93, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.3 }, { controlLevel: 'high_positive', meanCt: 24.4 }] },

  // CYTO-2 — Hologic Aptima, LOT-CYTO2-2601 (Jan 2026)
  { id: 'mqc-008', runDate: '2026-01-07T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2601', totalSamplesRun: 76, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 31.8 }, { controlLevel: 'high_positive', meanCt: 22.6 }] },
  { id: 'mqc-009', runDate: '2026-01-14T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2601', totalSamplesRun: 82, invalidControlCount: 1, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 32.0 }, { controlLevel: 'high_positive', meanCt: 22.8 }] },
  { id: 'mqc-010', runDate: '2026-01-21T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2601', totalSamplesRun: 79, invalidControlCount: 0, inhibitorCount: 1,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 31.6 }, { controlLevel: 'high_positive', meanCt: 22.5 }] },
  // CYTO-2 — lot transition to LOT-CYTO2-2605 (Feb 2026) — real, deliberately large Ct shift on the low-positive control, for MOL-QA-04's own Fail case
  { id: 'mqc-011', runDate: '2026-02-04T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2605', totalSamplesRun: 80, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.2 }, { controlLevel: 'high_positive', meanCt: 22.9 }] },
  { id: 'mqc-012', runDate: '2026-02-11T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2605', totalSamplesRun: 84, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.5 }, { controlLevel: 'high_positive', meanCt: 23.0 }] },
  { id: 'mqc-013', runDate: '2026-02-18T08:00:00.000Z', instrumentId: 'CYTO-2', assayName: 'Hologic Aptima HR-HPV', reagentLotNumber: 'LOT-CYTO2-2605', totalSamplesRun: 81, invalidControlCount: 0, inhibitorCount: 0,
    controlResults: [{ controlLevel: 'negative', meanCt: 0 }, { controlLevel: 'low_positive', meanCt: 33.3 }, { controlLevel: 'high_positive', meanCt: 22.7 }] },
];

const load = (): MolecularQcRunRecord[] => storageGet(STORE_KEY, SEED);
const persist = (data: MolecularQcRunRecord[]) => storageSet(STORE_KEY, data);

export const mockMolecularQcRunRecordService: IMolecularQcRunRecordService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async add(record) {
    await delay();
    const created: MolecularQcRunRecord = { ...record, id: 'MOL_RUN_' + Date.now() };
    const all = load();
    persist([...all, created]);
    return ok(created);
  },
};
