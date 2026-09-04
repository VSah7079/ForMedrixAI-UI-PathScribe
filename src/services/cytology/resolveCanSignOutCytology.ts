// src/services/cytology/resolveCanSignOutCytology.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the actual sign-out authorization decision —
// genuinely distinct from resolveCytologySignOutGate (PS-163), which
// only answers "would a Cytotechnologist be allowed to sign this
// independently." A Pathologist can always sign out, regardless of
// that gate's own result, since a Pathologist signing IS the real
// pathologist review the gate exists to require — real, standard
// CLIA/CAP authority, not a bypass of it.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologySignOutGateResult } from './resolveCytologySignOutGate';

export function resolveCanSignOutCytology(
  isPathologist: boolean,
  ctGateResult: CytologySignOutGateResult,
): boolean {
  return isPathologist || ctGateResult.allowed;
}
