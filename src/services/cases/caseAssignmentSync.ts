// src/services/cases/caseAssignmentSync.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for keeping order.assignedTo / assignedParticipationTypeId
// in sync with the 'primary' participant in participants[] — the fix for the
// "split-brain assignment" gap: CaseTeamModal used to write participants[]
// without touching order.assignedTo, so listCasesForUser() (which filters on
// assignedTo, not participants[]) would keep showing a case under its old
// owner even after the team roster changed. Any code that changes who's
// primary on a case — delegateCase's ownership-transfer branch,
// acceptPoolCase, or CaseTeamModal's own primary-role change — should call
// this rather than writing order.assignedTo or participants[] directly.
//
// 'primary' is the real, seeded participation type ID (see
// mockParticipationTypeService.ts) — not an invented role. Demoting the
// outgoing primary drops the 'primary' tag and keeps whatever other roles
// they already had; if that leaves them with none, they default to
// 'attending' (a real attending physician of record on the case doesn't
// stop being one just because someone else is now primary — inventing a
// synthetic "contributor" role would misrepresent that under CAP/CLIA
// sign-off terms). See AMENDMENT_STATUS_REDESIGN_BRIEF.md-adjacent design
// notes for the full history of this decision.
// ─────────────────────────────────────────────────────────────────────────────
import type { Case, CaseParticipant } from '@/types/case/Case';

/** Real, per direct follow-up on the Cytology review-role/sign-out
 *  review — the real, confirmed sibling to syncPrimaryAssignee() below,
 *  for the one real call site (acceptPoolCase) that was blindly calling
 *  syncPrimaryAssignee() for EVERY pool-claim, tagging every claimer
 *  'primary'/Attending regardless of who they actually are. Everything
 *  syncPrimaryAssignee's own header says about delegateCase/CaseTeamModal
 *  still holds — those are explicit, human-chosen "make this person
 *  primary" actions and are untouched here. This function instead tags
 *  the claimer with whatever real participation type they were actually
 *  resolved to (resolveClaimParticipationType.ts) — 'resident',
 *  'cytotechnologist', etc. — never assuming 'primary'. Deliberately
 *  the same participant-upsert shape as syncPrimaryAssignee (existing
 *  participant gets the type added; a new claimer gets a fresh record),
 *  so the two stay visibly parallel rather than silently diverging. */
export function syncClaimAssignee(
  caseData: Case,
  claimingStaffId: string,
  claimingStaffName: string | undefined,
  participationTypeId: string,
): Partial<Case> {
  const existingParticipants: CaseParticipant[] = caseData.participants ?? [];
  const targetIndex = existingParticipants.findIndex(p => p.staffId === claimingStaffId && p.status !== 'removed');

  let updatedParticipants: CaseParticipant[];
  if (targetIndex >= 0) {
    const types = new Set(existingParticipants[targetIndex].participationTypeIds);
    types.add(participationTypeId);
    updatedParticipants = existingParticipants.map((p, i) =>
      i === targetIndex ? { ...p, participationTypeIds: Array.from(types), status: 'active' } : p
    );
  } else {
    updatedParticipants = [
      ...existingParticipants,
      {
        staffId: claimingStaffId,
        staffName: claimingStaffName ?? claimingStaffId,
        source: 'manual',
        participationTypeIds: [participationTypeId],
        addedBy: claimingStaffId,
        addedAt: new Date().toISOString(),
        status: 'active',
      },
    ];
  }

  return {
    order: {
      ...caseData.order,
      assignedTo: claimingStaffId,
      assignedParticipationTypeId: participationTypeId,
    },
    participants: updatedParticipants,
  };
}

export function syncPrimaryAssignee(
  caseData: Case,
  newPrimaryStaffId: string,
  updatedBy: string,
  newPrimaryStaffName?: string,
): Partial<Case> {
  const existingParticipants: CaseParticipant[] = caseData.participants ?? [];

  const updatedParticipants = existingParticipants.map(p => {
    if (p.status === 'active' && p.participationTypeIds.includes('primary') && p.staffId !== newPrimaryStaffId) {
      const remainingTypes = p.participationTypeIds.filter(t => t !== 'primary');
      return { ...p, participationTypeIds: remainingTypes.length > 0 ? remainingTypes : ['attending'] };
    }
    return p;
  });

  const targetIndex = updatedParticipants.findIndex(p => p.staffId === newPrimaryStaffId && p.status !== 'removed');
  if (targetIndex >= 0) {
    const types = new Set(updatedParticipants[targetIndex].participationTypeIds);
    types.add('primary');
    updatedParticipants[targetIndex] = {
      ...updatedParticipants[targetIndex],
      participationTypeIds: Array.from(types),
      status: 'active',
    };
  } else {
    updatedParticipants.push({
      staffId: newPrimaryStaffId,
      staffName: newPrimaryStaffName ?? newPrimaryStaffId,
      source: 'manual',
      participationTypeIds: ['primary'],
      addedBy: updatedBy,
      addedAt: new Date().toISOString(),
      status: 'active',
    });
  }

  return {
    order: {
      ...caseData.order,
      assignedTo: newPrimaryStaffId,
      assignedParticipationTypeId: 'primary',
    },
    participants: updatedParticipants,
  };
}
