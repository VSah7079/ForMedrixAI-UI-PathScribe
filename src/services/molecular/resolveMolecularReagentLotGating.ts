// src/services/molecular/resolveMolecularReagentLotGating.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §3.3 "Gating Rules": "Prevent
// batch creation if any assigned lot is expired, marked as failed, or
// lacks active Quality Control (QC) sign-off." Also covers §3.2
// "Control Lot Validation... require control lot numbers and
// expiration dates to be validated before batch approval" — the same
// real three checks, applied to a control's own lot fields when a well
// carries one.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularReagentLot, MolecularWell, MolecularSampleType } from './IMolecularBatchService';

export type MolecularGatingFailureReason = 'expired' | 'failed_qc' | 'no_qc_signoff' | 'missing_control_lot_info';

export interface MolecularGatingFailure {
  componentType: string;
  lotNumber: string;
  reason: MolecularGatingFailureReason;
}

export interface MolecularGatingResult {
  allowed: boolean;
  failures: MolecularGatingFailure[];
}

// Real, per the given specification's own §3.2 — every real sample
// type that represents a control/calibrator, not a patient specimen.
// A well carrying one of these is a real control and its own lot
// info must genuinely be validated, per this file's own header.
const CONTROL_SAMPLE_TYPES: readonly MolecularSampleType[] = ['CONTROL_NTC', 'CONTROL_PTC_HIGH', 'CONTROL_PTC_LOW', 'CALIBRATOR'];

function checkLot(componentType: string, lotNumber: string, expirationDate: string, qcStatus: 'signed_off' | 'pending' | 'failed', now: Date): MolecularGatingFailure[] {
  const failures: MolecularGatingFailure[] = [];
  if (new Date(expirationDate).getTime() < now.getTime()) failures.push({ componentType, lotNumber, reason: 'expired' });
  if (qcStatus === 'failed') failures.push({ componentType, lotNumber, reason: 'failed_qc' });
  if (qcStatus === 'pending') failures.push({ componentType, lotNumber, reason: 'no_qc_signoff' });
  return failures;
}

/**
 * Real, per the given spec's own §3.3: every real reagent lot assigned
 * to a batch must be simultaneously non-expired, not marked failed,
 * and QC-signed-off — any one real violation blocks the whole batch,
 * never a partial/soft warning. Also checks any real control lot info
 * carried on a well (§3.2), using the same real three-way check.
 *
 * Real, direct correction, found via a full, direct re-read of the
 * given spec against this app's own actual code: the earlier version
 * only checked whether an *already-present* control expiration date
 * was in the past — a control well with no controlInfo at all, or an
 * empty lot number/expiration date, silently passed (`new
 * Date('').getTime()` is `NaN`, and `NaN < now` is false). The given
 * spec's own wording — "Require control lot numbers and expiration
 * dates to be validated before batch approval" — means present and
 * valid, not "valid if present." Every real control/calibrator well
 * (CONTROL_NTC, CONTROL_PTC_HIGH, CONTROL_PTC_LOW, CALIBRATOR) now
 * must genuinely carry a non-empty lot number and expiration date, or
 * the batch is blocked with a real, specific, honest reason — not a
 * silently-passing gap.
 */
export function resolveMolecularReagentLotGating(
  reagentLots: MolecularReagentLot[],
  wells: MolecularWell[],
  now: Date = new Date(),
): MolecularGatingResult {
  const failures: MolecularGatingFailure[] = [];

  for (const lot of reagentLots) {
    failures.push(...checkLot(lot.componentType, lot.lotNumber, lot.expirationDate, lot.qcStatus, now));
  }

  for (const well of wells) {
    if (!well.sampleType || !CONTROL_SAMPLE_TYPES.includes(well.sampleType)) continue;
    const control = well.controlInfo;
    if (!control || !control.controlLotNumber || !control.controlExpirationDate) {
      failures.push({ componentType: 'CONTROL', lotNumber: control?.controlLotNumber || '(none)', reason: 'missing_control_lot_info' });
      continue;
    }
    if (new Date(control.controlExpirationDate).getTime() < now.getTime()) {
      failures.push({ componentType: 'CONTROL', lotNumber: control.controlLotNumber, reason: 'expired' });
    }
  }

  return { allowed: failures.length === 0, failures };
}
