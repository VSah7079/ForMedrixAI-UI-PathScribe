// src/services/cytology/cloneCytologyReviewAsDraft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the "copy the selected review into their name"
// time-saver, per direct guidance: "It would be good for an additional
// review (Cytotech or Pathologist) [to] copy the selected review into
// their name and from there they can modify it as required."
//
// Produces a real draft — the exact shape ICytologyReviewRecordService.create
// expects — pre-populated with a source review's own diagnostic content
// (adequacy/general categorization/primary+additional interpretations/
// recommendations), but attributed to the NEW reviewer, in a NEW role,
// under a genuinely new record once created(). This is a starting point
// for a real, independent opinion, not a link back to the source — the
// new reviewer can freely modify every field before saving, and the
// resulting record is its own, separately-owned review, editable only
// by them (see ICytologyReviewRecordService.update's own doc comment).
//
// Deliberately a pure function — it does not call create() itself. The
// real caller (the eventual review-capture UI) decides when to clone,
// lets the new reviewer edit the draft, then calls create() once they
// save it.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord, CytologyReviewRole } from '@/types/cytology/CytologyReviewRecord';

export function cloneCytologyReviewAsDraft(
  source: CytologyReviewRecord,
  newReviewer: { userId: string; userName: string },
  newRole: CytologyReviewRole,
): Omit<CytologyReviewRecord, 'id' | 'recordedAt' | 'updatedAt'> {
  return {
    specimenId: source.specimenId,
    caseId: source.caseId,
    role: newRole,
    // Real, per direct UI-review follow-up: the real category
    // selections themselves are copied — that's the whole point of
    // the time-saver — but each selection's own free-text comment is
    // deliberately dropped, same real reasoning as `notes` below: a
    // comment is the source reviewer's own, personal wording about
    // THAT specific pick, and copying it would misattribute their
    // words to the new reviewer even though the underlying category
    // choice is a fair, real starting point.
    adequacySelections: source.adequacySelections?.map(s => ({ categoryId: s.categoryId })),
    generalCategorizationId: source.generalCategorizationId,
    primaryInterpretationId: source.primaryInterpretationId,
    additionalInterpretations: source.additionalInterpretations?.map(s => ({ categoryId: s.categoryId })),
    recommendations: source.recommendations?.map(s => ({ categoryId: s.categoryId })),
    // Real, per this file's own header: copied as-is at clone time,
    // since the diagnostic content is initially identical to the
    // source. If the new reviewer changes the interpretation before
    // saving, the real caller re-derives this via
    // resolveCytologyReviewRequirement before persisting — this pure
    // function only produces the initial draft state, not the final,
    // saved one.
    requiresPathologistReview: source.requiresPathologistReview,
    recordedBy: newReviewer,
    // Deliberately NOT copied: `notes` and `primaryInterpretationComment`
    // are the source reviewer's own, personal commentary — copying
    // them would misattribute their words to the new reviewer. The
    // new reviewer writes their own, if any.
  };
}
