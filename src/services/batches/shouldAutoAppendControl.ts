// src/services/batches/shouldAutoAppendControl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289/PS-292's own "batch-manifest scanning with
// automatic control-slide appending" piece (original Stain QC Module
// spec's own \u00a72.3), and direct follow-up refining the single
// StainType.requiresTargetControl field into two real, independent
// toggles — see IStainService.ts's own doc comments on both fields
// for the full reasoning. Deliberately checks both together, never
// either alone: a stain can require a target control while the lab
// still wants to suppress automatic slide generation for it (a real,
// internal tissue control, or a manual SOP), and the inverse
// (allowControlAutoAppend true, requiresTargetControl false/unset) is
// meaningless — there's no real control requirement to auto-append
// for in the first place.
// ─────────────────────────────────────────────────────────────────────────────

import type { StainType } from '../stains/IStainService';

export function shouldAutoAppendControl(stain: Pick<StainType, 'requiresTargetControl' | 'allowControlAutoAppend'>): boolean {
  return !!stain.requiresTargetControl && !!stain.allowControlAutoAppend;
}
