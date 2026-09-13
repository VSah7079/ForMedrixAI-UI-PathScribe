// src/services/cytology/resolveCytologyUnscreenedBacklogReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied US-QA-02 specification
// ("Unscreened Slide Backlog and Turnaround Time (TAT) Exceedance
// Report" — real regulatory driver: US CLIA '88 §493.1274).
//
// Real, buildable directly from data this app already captures:
// Specimen.receivedAt/collectedAt are real, existing top-level fields
// (types/case/Specimen.ts); "Current_Status" is derived from whether a
// real primary_screen review exists yet for the specimen — the same
// real distinction this module's own resolveCytologyReviewerRole.ts
// already draws between "no review yet" and "a review exists,
// awaiting further action."
//
// Real, deliberate scope: the real caller is responsible for
// filtering to specimens genuinely still in the backlog (no real
// sign-out record yet) before calling this — this resolver only
// decides Unscreened vs. Pending Path Review and the real TAT
// calculation for whatever it's given, matching this module's own
// established "resolve at the call site, don't refetch" pure-function
// posture (resolvePriorAbnormalPapFactor.ts and others).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TAT_THRESHOLD_HOURS = 48;

export type CytologyBacklogStatus = 'unscreened' | 'pending_path_review';

export interface CytologyUnscreenedBacklogRow {
  caseId: string;
  specimenId: string;
  accessionId?: string;
  collectionDate?: string;
  receivedDate?: string;
  currentStatus: CytologyBacklogStatus;
  /** Real, honest undefined when receivedDate itself is unavailable —
   *  never a fabricated elapsed time. */
  elapsedHours?: number;
  tatExceeded: boolean;
}

export interface CytologyBacklogSpecimenInput {
  caseId: string;
  specimenId: string;
  accessionId?: string;
  collectedAt?: string;
  receivedAt?: string;
  /** Real, per this module's own established role convention: true
   *  when at least one real primary_screen (or later) review already
   *  exists for this specimen. */
  hasAnyReview: boolean;
}

export function resolveCytologyUnscreenedBacklogReport(
  specimens: CytologyBacklogSpecimenInput[],
  now: Date,
  tatThresholdHours = DEFAULT_TAT_THRESHOLD_HOURS,
): CytologyUnscreenedBacklogRow[] {
  return specimens.map(sp => {
    let elapsedHours: number | undefined;
    if (sp.receivedAt) {
      elapsedHours = (now.getTime() - new Date(sp.receivedAt).getTime()) / (1000 * 60 * 60);
    }

    return {
      caseId: sp.caseId,
      specimenId: sp.specimenId,
      accessionId: sp.accessionId,
      collectionDate: sp.collectedAt,
      receivedDate: sp.receivedAt,
      currentStatus: sp.hasAnyReview ? 'pending_path_review' : 'unscreened',
      elapsedHours,
      tatExceeded: elapsedHours !== undefined && elapsedHours > tatThresholdHours,
    };
  });
}
