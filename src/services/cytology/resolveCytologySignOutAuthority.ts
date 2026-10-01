// src/services/cytology/resolveCytologySignOutAuthority.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-327 (Batch 332): per-lab / country signing authority for Cytology
// sign-out, PATHOLOGIST TRACK ONLY (Pete's decision).
//
//   • Cytotechnologist track — unchanged. CLIA lets a credentialed
//     cytotechnologist sign NILM GYN cases independently; that path keeps
//     its existing rules (resolveCytologySignOutGate's credentialed-CT
//     exception and the new-CT competency countersign). No configured
//     countersign types and no finalize check are applied to it.
//   • Pathologist track (everyone else who signs cytology) — the same
//     rules as Surgical Pathology and Autopsy:
//       – countersign: the lab/country's configured countersign types
//         (resolveCountersignRequiredTypeIds), minus 'cytotechnologist',
//         which only ever belongs to the CT track;
//       – finalize: canFinalizeCase (per-lab authorityOverrides, then the
//         PS-341 country profile, then the platform default).
//
// The track itself comes from resolveCytologyIsPathologistTrack (the page's
// existing `isPathologist`). Pure: the caller resolves the authority context
// (services/auth/resolveFinalizeAuthorityContext.ts) and the session.
// ─────────────────────────────────────────────────────────────────────────────

import { canFinalizeCase, resolveCountersignRequiredTypeIds, type CaseAccessDecision, type CaseFinalizeParticipant, type SessionUser } from '@/services/auth/caseAccessControl';
import type { FinalizeAuthorityContext } from '@/services/auth/resolveFinalizeAuthorityContext';

export interface CytologySignOutAuthority {
  track: 'pathologist' | 'cytotechnologist';
  /** Pass to resolveResidentCountersignRequired; undefined on the CT track
   *  so its behaviour is exactly as before. */
  countersignRequiredTypeIds: string[] | undefined;
  /** The finalize decision for a direct sign-out; null on the CT track. */
  finalizeDecision: CaseAccessDecision | null;
}

export function resolveCytologySignOutAuthority(input: {
  isPathologistTrack: boolean;
  session: SessionUser | null;
  participants: CaseFinalizeParticipant[] | null | undefined;
  context: FinalizeAuthorityContext;
}): CytologySignOutAuthority {
  if (!input.isPathologistTrack) {
    return { track: 'cytotechnologist', countersignRequiredTypeIds: undefined, finalizeDecision: null };
  }
  const { participationTypes, performingLabFacilityId, jurisdiction } = input.context;
  return {
    track: 'pathologist',
    countersignRequiredTypeIds: resolveCountersignRequiredTypeIds(participationTypes, performingLabFacilityId, jurisdiction)
      .filter(id => id !== 'cytotechnologist'),
    finalizeDecision: canFinalizeCase(input.session, input.participants, participationTypes, performingLabFacilityId, jurisdiction),
  };
}
