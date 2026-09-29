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
  /** Real, per direct follow-up ("We also should account for Cytotecs
   *  trained and new staff while we are here") — the real sibling to
   *  hasActiveFppeAssignment above, for a Cytotechnologist participant
   *  under an active New Cytotechnologist Competency Assessment
   *  supervision assignment (CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID).
   *  Optional, defaulting to false: this only ever applies to a
   *  cytotechnologist participation type, which Surg Path/Autopsy
   *  cases never carry, so those existing callers (useSignOutWorkflow.ts,
   *  signAutopsyReport.ts) are unaffected and never need to pass it. */
  hasActiveCytotechCompetencyAssignment?: boolean;
  /** Real, per PS-327 ("requiresCountersign gating also resolves per-lab
   *  through the same mechanism" as canFinalizeCase's own authorityOverrides
   *  resolution): participation-type ids whose real
   *  ParticipationTypeRecord.requiresCountersign flag resolves true for
   *  this case's performing lab — already resolved by the caller via
   *  resolveCountersignRequiredTypeIds() (services/auth/caseAccessControl.ts),
   *  same real per-lab resolution canFinalizeCase() uses, reused rather than
   *  re-derived here. This function stays synchronous/pure by design (see
   *  the file header) — it never resolves participation types or a
   *  performing lab itself.
   *
   *  Optional, defaulting to undefined/empty: a caller not yet updated to
   *  pass this sees ZERO change in behavior — the existing hardcoded
   *  'resident'/cytotechnologist checks below are completely untouched by
   *  this field either way. Additive only: this generalizes those two
   *  hardcoded, built-in checks to ANY admin-defined participation type
   *  whose own requiresCountersign flag is configured true (a
   *  jurisdiction-specific junior role, for instance) — 'resident' itself
   *  already has requiresCountersign:true in real seed data, so a real
   *  caller passing this correctly never double-fires anything new for
   *  today's built-in resident workflow; the isResidentParticipant check
   *  below still matches first and returns before this one is even
   *  evaluated. */
  countersignRequiredTypeIds?: string[];
}

export interface ResidentCountersignCheckResult {
  /** True when this sign-out must be intercepted — released for
   *  countersign rather than finalized. */
  required: boolean;
  /** Which real condition triggered it — undefined when required is
   *  false. A caller resolving who the reviewer is (attending
   *  participant vs. FPPE proctor) branches on this same distinction,
   *  so it's returned rather than re-derived. */
  reason?: 'resident' | 'fppe' | 'cytotech_competency' | 'configured_type';
}

export function resolveResidentCountersignRequired(input: ResidentCountersignCheckInput): ResidentCountersignCheckResult {
  const { participants, signingUserId, hasActiveFppeAssignment, hasActiveCytotechCompetencyAssignment, countersignRequiredTypeIds } = input;

  const isAttendingToo = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId && p.participationTypeIds?.includes('attending')
  ) ?? false;

  if (isAttendingToo) {
    // Real, deliberate: a dual-role signer (also an active attending
    // participant on this same case) is never intercepted, regardless
    // of any resident participation type or FPPE/competency assignment
    // they might also carry — they ARE the attending here.
    return { required: false };
  }

  const isResidentParticipant = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId && p.participationTypeIds?.includes('resident')
  ) ?? false;

  if (isResidentParticipant) return { required: true, reason: 'resident' };

  // Real, per PS-327: generalizes the hardcoded isResidentParticipant
  // check above to any admin-defined participation type whose own
  // (per-performing-lab) requiresCountersign flag resolves true — see
  // this input field's own doc comment above for the full gap this
  // closes. Checked in the same "static type-based, not time-window-
  // based" tier as the resident check, before the FPPE/cytotech
  // assignment-based checks below.
  const isConfiguredCountersignParticipant = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId &&
      p.participationTypeIds?.some(id => countersignRequiredTypeIds?.includes(id))
  ) ?? false;
  if (isConfiguredCountersignParticipant) return { required: true, reason: 'configured_type' };

  if (hasActiveFppeAssignment) return { required: true, reason: 'fppe' };

  // Real, per direct follow-up: the same real gap this whole fix
  // closes for cytology's isPathologist signal also applies here — a
  // Cytotechnologist who independently qualifies to sign a NILM GYN
  // case under resolveCytologySignOutGate's own real CLIA exception
  // still shouldn't be signing UNSUPERVISED during their real,
  // CLIA-mandated first-year competency window. Scoped to the
  // cytotechnologist participation type specifically — this never
  // fires for a resident or attending, who are handled by the checks
  // above.
  const isCytotechParticipant = participants?.some(
    p => p.status === 'active' && p.staffId === signingUserId && p.participationTypeIds?.includes('cytotechnologist')
  ) ?? false;

  if (isCytotechParticipant && hasActiveCytotechCompetencyAssignment) {
    return { required: true, reason: 'cytotech_competency' };
  }

  return { required: false };
}
