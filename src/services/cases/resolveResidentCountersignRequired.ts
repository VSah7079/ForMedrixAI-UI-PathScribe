// src/services/cases/resolveResidentCountersignRequired.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("the same countersign needs to work for
// Cytology as well") — extracts the real resident/FPPE countersign
// decision useSignOutWorkflow.ts's own gate already makes inline for
// Surg Path into a small, pure, independently-testable function, so
// the identical decision can be reused (not re-derived) anywhere else
// a sign-out needs the same real gate — Cytology today
// (CytologyScreeningPage.tsx), Autopsy PAD/FAD once that signing flow
// is actually built.
//
// Deliberately decision-only: this never itself calls
// countersignService.release() or touches CaseStatus — callers do
// that. Keeping the "should this be intercepted" question pure and
// separate from the real side effects (snapshot, status transition,
// notification email) that differ by specialty is what makes this
// genuinely reusable rather than another copy of the same inline
// logic.
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseParticipant } from '@/types/case/Case';

export interface ResidentCountersignCheckInput {
  participants: CaseParticipant[] | undefined;
  signingUserId: string;
  /** Whether the signing user currently has an active FPPE
   *  supervision assignment for this case's own subspecialty —
   *  resolved by the caller via qaSupervisionAssignmentService
   *  (this function stays synchronous and pure; it never makes that
   *  real, async lookup itself). */
  hasActiveFppeAssignment: boolean;
}

export interface ResidentCountersignCheckResult {
  /** True when this sign-out must be intercepted — released for
   *  countersign rather than finalized. */
  required: boolean;
  /** Which real condition triggered it — undefined when required is
   *  false. A caller resolving who the reviewer is (attending
   *  participant vs. FPPE proctor) branches on this same distinction,
   *  so it's returned rather than re-derived. */
  reason?: 'resident' | 'fppe';
}

export function resolveResidentCountersignRequired(input: ResidentCountersignCheckInput): ResidentCountersignCheckResult {
  const { participants, signingUserId, hasActiveFppeAssignment } = input;

  const isAttendingToo = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId && p.participationTypeIds?.includes('attending')
  ) ?? false;

  if (isAttendingToo) {
    // Real, deliberate: a dual-role signer (also an active attending
    // participant on this same case) is never intercepted, regardless
    // of any resident participation type or FPPE assignment they might
    // also carry — they ARE the attending here.
    return { required: false };
  }

  const isResidentParticipant = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId && p.participationTypeIds?.includes('resident')
  ) ?? false;

  if (isResidentParticipant) return { required: true, reason: 'resident' };
  if (hasActiveFppeAssignment) return { required: true, reason: 'fppe' };
  return { required: false };
}
