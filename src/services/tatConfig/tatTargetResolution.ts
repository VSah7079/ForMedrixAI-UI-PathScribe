// src/services/tatConfig/tatTargetResolution.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: which turnaround target applies. Moved here unchanged from
// components/Contribution/qualityCalculations.ts, so services (case search,
// the quality dashboards, the API contract) no longer reach into a
// component file for it. qualityCalculations.ts re-exports these names.
//
// Most specific wins: an entry's null dimensions match anything; ordering
// facility and performing lab weigh 4, specimen and subspecialty 2, urgency
// and role 1. Only role-agnostic entries apply to case targets.
// ─────────────────────────────────────────────────────────────────────────────

/** The fields of a TATEntry (types/quality/TatConfigEntry.ts) the
 *  resolver reads. */
export interface TatEntryForResolution {
  type: string;
  targetHours: number;
  urgency: 'ROUTINE' | 'STAT' | null;
  facilityId: string | null;
  /**
   * Real, per direct guidance: a genuinely separate dimension from
   * facilityId above, not a replacement for it — facilityId represents the
   * ORDERING/REFERRING facility (who sent the case), performingLabFacilityId
   * represents the real performing lab actually doing the work being
   * measured. Both can independently apply: a performing lab's own
   * general TAT policy, and a specific ordering client's own contractual
   * TAT agreement (which may hold regardless of which internal lab
   * within an Enterprise ends up performing the work). Resolved via
   * resolvePerformingLabFacilityId() at the real call site, never a raw
   * facilityId read.
   */
  performingLabFacilityId: string | null;
  specimenId: string | null;
  subspecialtyId: string | null;
  roleId: string | null;
  active: boolean;
}

export interface TatResolutionContext {
  facilityId?: string;
  performingLabFacilityId?: string;
  specimenId?: string;
  subspecialtyId?: string;
  urgency?: 'ROUTINE' | 'STAT';
}

/** Real, per direct guidance: exported and shared with
 *  TATConfigSection.tsx's own admin-UI specificity display, rather than
 *  two separate copies of the same weighting scheme that could silently
 *  drift apart the moment either one gains a new dimension (which is
 *  exactly what just happened here — performingLabFacilityId, added to
 *  both real consumers from this one, single implementation). Same
 *  scoring weights as the admin UI's own hierarchy documentation
 *  (client=4, performing lab=4 — a genuine peer dimension, not
 *  subordinate to client — specimen/subspecialty=2, urgency/role=1). */
export function specificityScore(e: TatEntryForResolution): number {
  let score = 0;
  if (e.facilityId)              score += 4;
  if (e.performingLabFacilityId) score += 4;
  if (e.specimenId)             score += 2;
  if (e.subspecialtyId)         score += 2;
  if (e.urgency)                score += 1;
  if (e.roleId)                 score += 1;
  return score;
}

/** Real, most-specific-wins resolution against actual TATEntry data -
 *  null-valued dimensions on an entry mean "matches anything" for that
 *  dimension. roleId is deliberately not matched here - case-level TAT
 *  targets aren't role-scoped the way consultation-response ones would
 *  be, so only role-agnostic (roleId: null) entries are eligible.
 *  Returns null (not a fabricated default) when no real entry matches
 *  at all - caller decides how to handle that honestly. */
/** Real, per direct guidance: the actual winning-entry resolution,
 *  extracted so a real consumer that needs to know WHICH entry won
 *  (not just its targetHours) — TATConfigSection.tsx's own Resolution
 *  Simulator — can call the exact same logic directly, rather than a
 *  third, hand-maintained reimplementation that could (and, before
 *  this fix, already did) silently disagree with the real resolver in
 *  edge cases its own hardcoded priority list didn't cover. */
export function resolveTatEntry(
  entries: TatEntryForResolution[],
  type: string,
  context: TatResolutionContext
): TatEntryForResolution | null {
  const matching = entries.filter(e =>
    e.active && e.type === type && e.roleId === null &&
    (e.facilityId === null || e.facilityId === context.facilityId) &&
    (e.performingLabFacilityId === null || e.performingLabFacilityId === context.performingLabFacilityId) &&
    (e.specimenId === null || e.specimenId === context.specimenId) &&
    (e.subspecialtyId === null || e.subspecialtyId === context.subspecialtyId) &&
    (e.urgency === null || e.urgency === context.urgency)
  );
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => specificityScore(b) - specificityScore(a))[0];
}

/** Real, most-specific-wins resolution against actual TATEntry data -
 *  null-valued dimensions on an entry mean "matches anything" for that
 *  dimension. roleId is deliberately not matched here - case-level TAT
 *  targets aren't role-scoped the way consultation-response ones would
 *  be, so only role-agnostic (roleId: null) entries are eligible.
 *  Returns null (not a fabricated default) when no real entry matches
 *  at all - caller decides how to handle that honestly. */
export function resolveTatTargetHours(
  entries: TatEntryForResolution[],
  type: string,
  context: TatResolutionContext
): number | null {
  return resolveTatEntry(entries, type, context)?.targetHours ?? null;
}
