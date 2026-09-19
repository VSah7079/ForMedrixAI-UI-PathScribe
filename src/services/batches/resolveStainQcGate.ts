// src/services/batches/resolveStainQcGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289/PS-292's own Gating Strategy research — the pure
// decision logic for the post-run QC gate. Deliberately pure (takes
// already-resolved inputs, no lookups of its own) — same real
// separation established elsewhere in this app (e.g.
// resolveMolecularRunValidationGating.ts) between "gather the real
// data" (async, has its own real call sites) and "decide, given the
// data" (pure, directly testable without mocking any service).
//
// Reconciles two real, distinct pieces of direct guidance that could
// otherwise read as contradictory:
//   1. The original Stain QC Module spec's own §2.4: a failed run
//      "shall flag the entire run, prevent clinical reporting" —
//      unconditional, regardless of enforcement mode.
//   2. The later Gating Strategy research's own description of
//      Auto-Resolve: it clears "without blocking the user" — meaning
//      Auto-Resolve does NOT block merely because a success signal
//      hasn't arrived YET (the whole point of "bypassed").
// Resolution: a CONFIRMED FAILURE always blocks, in every mode — it's
// a real, conclusive negative signal, not an absent one. Only the
// "no signal yet" case is where Auto-Resolve's own "never blocks"
// posture actually applies.
// ─────────────────────────────────────────────────────────────────────────────

import type { QcEnforcementMode } from '../workstationGroups/IWorkstationGroupService';
import type { StainingInstrumentStatus } from './IBatchService';

export type StainQcGateStatus =
  | 'not-applicable'       // No real enforcement mode resolved at all — this stain/batch never opted into gating.
  | 'clear'                // Gate satisfied — sign-out may proceed.
  | 'blocked-failed'       // A real, confirmed instrument failure — blocks in every mode.
  | 'blocked-enforced'     // Enforced mode, no real visual-read confirmation yet.
  | 'blocked-hybrid';      // Hybrid mode, no real success signal AND no manual confirmation yet.

export interface StainQcGateInput {
  /** The real, effective enforcement mode for this specific stain —
   *  already resolved by the caller as StainType.qcEnforcementMode
   *  (if set) else the batch's own WorkstationGroup.qcEnforcementMode
   *  (if set) else undefined. This function never re-derives that
   *  precedence itself — see resolveEffectiveQcEnforcementMode below
   *  for the one, real place that logic lives. */
  effectiveMode: QcEnforcementMode | undefined;
  stainingInstrumentStatus: StainingInstrumentStatus | undefined;
  hasVisualReadConfirmation: boolean;
}

export function resolveStainQcGate(input: StainQcGateInput): StainQcGateStatus {
  const { effectiveMode, stainingInstrumentStatus, hasVisualReadConfirmation } = input;

  // No real enforcement mode configured anywhere for this stain —
  // this stain never opted into gating at all. Never a default-
  // enforced gate for unconfigured stains; absence of configuration
  // means no gate, not a silently-assumed 'Enforced'.
  if (!effectiveMode) return 'not-applicable';

  // Real, per the original spec's own §2.4 — a confirmed failure is a
  // real, conclusive negative signal and blocks in every mode,
  // regardless of what the resolved enforcement mode otherwise says.
  if (stainingInstrumentStatus === 'Run Failed') return 'blocked-failed';

  if (effectiveMode === 'Enforced') {
    return hasVisualReadConfirmation ? 'clear' : 'blocked-enforced';
  }

  if (effectiveMode === 'Auto-Resolve') {
    // Real, per the Gating Strategy research's own words — clears
    // "without blocking the user." A success signal that hasn't
    // arrived YET is not treated as a block; only a real, confirmed
    // failure (handled above) blocks under this mode.
    return 'clear';
  }

  // Hybrid — a real success signal clears automatically; absent that,
  // falls back to requiring the same manual confirmation Enforced
  // mode requires.
  if (stainingInstrumentStatus === 'Run Completed') return 'clear';
  return hasVisualReadConfirmation ? 'clear' : 'blocked-hybrid';
}

/** Real, the one place StainType's own per-stain override is weighed
 *  against the WorkstationGroup's own instrument-level default — per
 *  direct decision ("both — instrument-level default, per-stain
 *  override"), the stain's own override wins when set. */
export function resolveEffectiveQcEnforcementMode(
  stainTypeMode: QcEnforcementMode | undefined,
  workstationGroupMode: QcEnforcementMode | undefined,
): QcEnforcementMode | undefined {
  return stainTypeMode ?? workstationGroupMode;
}
