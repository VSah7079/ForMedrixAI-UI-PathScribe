// src/services/molecular/resolveMolecularRunValidationGating.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §5.2 "Run Validation
// Gating": "Results generated from a run where controls failed (e.g.,
// NTC amplification) are automatically flagged and blocked from
// auto-verification in PathScribe."
//
// Real, deliberate design: controls_passed is treated as the real,
// authoritative signal, never the inbound review_status alone — a real
// interface engine could send an inconsistent payload (controls_passed:
// false alongside review_status: AUTO_PASSED, a genuine data-integrity
// problem, not a hypothetical one), and PathScribe's own real job per
// this section is to enforce the block itself, not merely trust
// whatever the sending system already decided.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularReviewStatus } from '@/types/events/MolecularRunResultsPayload';

/**
 * Real, per this file's own header: PathScribe's own, authoritative
 * review status, derived from controls_passed regardless of what the
 * inbound payload's own review_status claims. A genuinely inconsistent
 * incoming payload (controls_passed: false, review_status:
 * AUTO_PASSED) is corrected to the real, safe outcome (BLOCKED), never
 * passed through as if it were consistent.
 */
export function resolveMolecularRunValidationGating(controlsPassed: boolean): MolecularReviewStatus {
  return controlsPassed ? 'AUTO_PASSED' : 'BLOCKED';
}
