// src/services/cases/resolveCytologyIsPathologistTrack.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the Cytology review-role/sign-out review
// ("It shouldn't be any different than [surgical] pathology or autopsy.
// Check the performing types on cases."). Confirmed directly: this app's
// login-level User.role is typed "pathologist" | "admin" |
// "pathologist-admin" | "superadmin" — there is no resident or
// cytotechnologist value at all, so CytologyScreeningPage.tsx's old
// `isPathologist = user?.role === 'pathologist' || ...'pathologist-admin'`
// was true for every real clinical login, always — not a missing check,
// a signal that structurally can't carry the distinction it was being
// used for.
//
// Real, deliberate scope: this answers ONE specific question —
// "is this reviewer functioning in the pathologist workflow track on
// THIS case, as opposed to the Cytotechnologist screening track" — the
// same real question resolveCytologyReviewerRole() and
// resolveCanSignOutCytology() already ask via their own isPathologist
// parameter. It does NOT answer "can this person finalize independently"
// (that's a genuinely different, cytology-specific question —
// resolveCytologySignOutGate.ts already encodes the real CLIA rule that
// a Cytotechnologist MAY independently sign certain NILM GYN cases,
// which is why cytology deliberately does NOT reuse surgical pathology's
// canFinalizeCase() — that function's 'primary'/'attending'-only model
// would incorrectly block a real, CLIA-permitted Cytotech sign-out).
//
// Real, deliberate rule: "pathologist track" = holds ANY real
// participation type on this case OTHER than 'cytotechnologist' —
// primary/attending/resident/provisional_hire/second_opinion/consultant
// all represent a physician-level reviewer in a cytology review context
// (a resident IS a physician in training; the CT-independent-sign-out
// gate exists to require physician review, not specifically ATTENDING
// review — a resident's own countersign requirement is a real, separate,
// already-correct check — resolveResidentCountersignRequired.ts,
// already wired into this same sign-out flow, untouched by this file).
//
// Real, deliberate fallback: when this specific user holds NO real
// participation record on this case at all, falls back to the caller's
// own accountIsAdminTier signal — a temporary, honest safety net for
// data that predates this fix (an old case claimed before
// acceptPoolCase() was corrected to tag real roles), not a loophole.
// Every NEW claim, after that same fix, always has a real, correctly-
// typed participant record by the time a reviewer reaches this screen.
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseParticipant } from '@/types/case/Case';

export function resolveCytologyIsPathologistTrack(
  participants: CaseParticipant[] | undefined,
  signingUserId: string | undefined,
  /** Caller-resolved: true for admin/pathologist-admin/superadmin
   *  account tiers, and the fallback used when this user has no real
   *  participation record on this case yet. Deliberately NOT "any
   *  logged-in account" — that was the exact bug being fixed. */
  fallbackWhenNoParticipantRecord: boolean,
): boolean {
  if (!signingUserId) return fallbackWhenNoParticipantRecord;

  const myTypes = (participants ?? [])
    .filter(p => p.status === 'active' && p.staffId === signingUserId)
    .flatMap(p => p.participationTypeIds ?? []);

  if (myTypes.length === 0) return fallbackWhenNoParticipantRecord;

  return myTypes.some(t => t !== 'cytotechnologist');
}
