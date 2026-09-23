// src/services/quality/resolveQaCaseSelectionContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-117. The real, normalized set of per-case facts the generic QA
// case-selection engine can check a QaTargetedSelectionRule against —
// the direct generalization of Discordance's own hardcoded trigger
// condition (useSignOutWorkflow.ts's real merged-intraop-session
// check), checked directly against that real, working code before
// this was written.
//
// Deliberately a pure function taking already-resolved data (the
// case's own real intraop entries), not resolving them itself — same
// "resolve async/real data at the call site, pass already-resolved
// data into the pure function" posture as
// shouldRandomlySampleForCodeReview.ts and resolveBillingDateOfService
// elsewhere in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';
import type { QaCaseSelectionSignal } from '@/types/quality/QaActivityType';

/** One boolean per real QaCaseSelectionSignal value — every signal the
 *  engine can ever check a targeted rule against, computed once per
 *  case. Extending this object (a genuinely new kind of case fact) is
 *  the one real, honest "code change" case-selection rules can't avoid
 *  — see QaCaseSelectionSignal's own doc comment. */
export type QaCaseSelectionContext = Record<QaCaseSelectionSignal, boolean>;

/**
 * Real, per direct guidance (PS-117): computes the case-selection
 * context for one case. `hasNonDeferredFrozenCategory` is exactly
 * Discordance's own real, hardcoded condition (useSignOutWorkflow.ts:
 * `mergedSession?.specimens.find(s => s.frozenCategory &&
 * s.frozenCategory !== 'deferred')`), lifted verbatim into a named,
 * reusable signal rather than re-derived differently here — a merged
 * intraop session for this case with at least one specimen carrying a
 * real (non-deferred) frozen category.
 */
export function resolveQaCaseSelectionContext(
  caseId: string,
  allIntraopEntries: IntraoperativeEntry[],
): QaCaseSelectionContext {
  const mergedSession = allIntraopEntries.find(
    e => e.status === 'merged' && e.mergedIntoCaseId === caseId,
  );
  const hasNonDeferredFrozenCategory = !!mergedSession?.specimens.some(
    s => s.frozenCategory !== undefined && s.frozenCategory !== 'deferred',
  );

  return {
    hasNonDeferredFrozenCategory,
  };
}
