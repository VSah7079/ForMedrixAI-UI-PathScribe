// src/services/cases/resolveClaimParticipationType.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the Cytology review-role/sign-out review
// ("It shouldn't be any different than [surgical] pathology or autopsy.
// Check the performing types on cases."): a real, separate, confirmed gap
// found while checking that — acceptPoolCase() always tagged whoever
// claimed a pool case with participationTypeIds: ['primary'] (Attending /
// Primary Pathologist, full finalize authority) via syncPrimaryAssignee(),
// regardless of who they actually are. A resident or a cytotechnologist
// claiming straight from a pool got silently tagged as the case's
// Attending — not a Cytology-specific bug, and not new here, but it
// undermines any real, participant-driven authorization fix layered on
// top of it, so it's fixed alongside that work rather than left standing.
//
// Real, deliberate reuse rather than a second, independent eligibility
// check: this is the EXACT same Role → participationTypeIds mapping
// CaseTeamModal.tsx's own real drag-eligibility check
// (getDragEligibility) already uses to decide who may be dropped onto
// which participation-type lane — staffMember.roles (the real StaffUser
// credential list) filtered against the Role dictionary's own
// participationTypeIds. Never a second, independently-maintained
// eligibility rule that could silently drift from CaseTeamModal's own.
//
// Real, deliberate default-selection rule: when a staff member is
// eligible for more than one real participation type, this picks the
// LEAST-privileged (canFinalize: false) one they're eligible for, using
// resolveParticipationTypeAuthority() so a lab's own authorityOverrides
// genuinely take effect here too — never the most-privileged. A resident
// who also happens to be eligible for some other type must never
// silently receive Attending finalize authority just because nobody has
// explicitly assigned them yet; that's the exact real gap this closes.
// Falls back to 'primary' only when the staff member has no real
// eligibility data on file at all (no matching Role, or no
// participationTypeIds configured on it) — the same, unchanged default
// every caller got before this function existed, so a site with no real
// Role/participation-type data configured yet sees no behavior change.
// ─────────────────────────────────────────────────────────────────────────────

import type { Role } from '@/services/roles/IRoleService';
import { resolveParticipationTypeAuthority, type ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';

const DEFAULT_CLAIM_PARTICIPATION_TYPE_ID = 'primary';

export function resolveClaimParticipationType(
  staffUserRoles: string[] | undefined,
  roles: Role[],
  participationTypes: ParticipationTypeRecord[],
  performingLabFacilityId?: string | null,
): string {
  const eligibleRoles = roles.filter(r => (staffUserRoles ?? []).includes(r.name));
  const allowedIds = new Set(eligibleRoles.flatMap(r => r.participationTypeIds ?? []));
  if (allowedIds.size === 0) return DEFAULT_CLAIM_PARTICIPATION_TYPE_ID;

  const eligibleTypes = participationTypes.filter(t => allowedIds.has(t.id));
  if (eligibleTypes.length === 0) return DEFAULT_CLAIM_PARTICIPATION_TYPE_ID;

  const withAuthority = eligibleTypes.map(t => ({
    type: t,
    canFinalize: resolveParticipationTypeAuthority(t, performingLabFacilityId ?? undefined).canFinalize === true,
  }));

  const nonFinalizing = withAuthority.filter(x => !x.canFinalize);
  const pool = nonFinalizing.length > 0 ? nonFinalizing : withAuthority;
  return pool.sort((a, b) => a.type.sortOrder - b.type.sortOrder)[0].type.id;
}
