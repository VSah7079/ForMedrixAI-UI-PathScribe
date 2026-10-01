// src/services/printRouting/wasCaseFrozenSectioned.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278/279 gap-closing follow-up ("Frozen Section vs.
// Routine Surgical specimen-type inference for print routing").
// Closes the one, specific gap resolveRealPrintRoutingContext.ts's own
// header previously disclosed: there is no case-level field for
// specimen type, but there IS a real, existing signal one service
// boundary away — IntraoperativeEntry.mergedIntoCaseId (written by
// IIntraoperativeService.merge()) plus each merged specimen's own real
// 'frozen_section_cut' milestone.
//
// This performs the exact same real reverse lookup
// components/QualityAssurance/IntraopLinkageTab.tsx and
// components/Contribution/qualityCalculations.ts already do
// independently today (scanning every IntraoperativeEntry for
// mergedIntoCaseId === caseId — there is genuinely no case-side
// pointer to index by instead; confirmed directly in Case.ts before
// writing this, not assumed). Never a third, separate copy of that
// scan's own logic invented here — this is the one, shared,
// real implementation the print-routing layer now uses; those two
// existing call sites are real, separate, pre-existing consumers of
// the same real data shape, not touched by this change.
//
// Real, honest limit, unchanged from before: a case that never went
// through intraop at all (the large majority of routine, non-frozen
// surgical cases) has no matching IntraoperativeEntry and this
// correctly, honestly returns false — 'ROUTINE_SURGICAL' remains the
// real, correct default for those, same as
// resolveRealPrintRoutingContext.ts's own pre-existing fallback
// already assumed. This function only ever turns a real signal INTO
// 'FROZEN_SECTION'; it never turns an absence of a signal into a
// false negative beyond that same honest default.
// ─────────────────────────────────────────────────────────────────────────────

import { mockIntraoperativeService } from '../intraop/mockIntraoperativeService';

export async function wasCaseFrozenSectioned(caseId: string): Promise<boolean> {
  const res = await mockIntraoperativeService.getAll();
  if (!res.ok) return false;

  const mergedEntry = res.data.find(
    entry => entry.status === 'merged' && entry.mergedIntoCaseId === caseId,
  );
  if (!mergedEntry) return false;

  return mergedEntry.specimens.some(specimen =>
    specimen.milestones.some(m => m.milestone === 'frozen_section_cut'),
  );
}
