// src/types/quality/TatConfigEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// TAT / escalation target types. Moved here from
// components/Config/System/TATConfigSection.tsx in Batch 317 (PS-73) so the
// rules that operate on them (services/tatConfig/tatConfigRules.ts) and
// services/referenceCheck/ no longer import types from a component. The
// component re-exports them, so existing imports keep working.
// ─────────────────────────────────────────────────────────────────────────────


export type TATType =
  | 'FIRST_TOUCH'
  | 'TOTAL_CASE'
  | 'FROZEN_SECTION'
  | 'COLD_ISCHEMIA'
  | 'GROSSING'
  | 'SIGN_OUT'
  | 'CONSULTATION_RESPONSE'   // How fast I respond to colleagues' requests
  | 'CONSULTATION_AWAITING';  // How long I wait for colleagues' responses

export type TATUrgency = 'ROUTINE' | 'STAT';

export interface TATEntry {
  id:             string;
  /** Real, deliberate widening (PS-116): was strictly `TATType` — a
   *  fixed, closed union of clinical-workflow measurements. A real QA
   *  Activity Type (PS-113/114/115) is dynamic and open-ended by
   *  design (an admin can Duplicate a new one at any time with no
   *  code change), so it can never be a member of a closed union.
   *  Still holds a real `TATType` value for every existing clinical-
   *  workflow entry — resolveTatTargetHours (qualityCalculations.ts)
   *  already treated this as a plain `string`, confirmed directly, so
   *  this widening changes zero resolution behavior for those entries.
   *  See getTatTypeLabel/getTatTypeDescription below for how a value
   *  that isn't a real TATType resolves to a real QA Activity Type's
   *  own name instead. */
  type:           string;
  targetHours:    number;
  urgency:        TATUrgency | null;   // null = all urgency levels
  facilityId:       string | null;       // null = all ordering/referring facilities
  /**
   * Real, per direct guidance: a genuinely separate dimension from
   * facilityId above, not a replacement for it — facilityId is the
   * ORDERING/REFERRING facility (who sent the case); this is the real
   * performing lab actually doing the work. A performing lab's own
   * general TAT policy and a specific ordering facility's own
   * contractual TAT agreement can both apply, independently — see
   * qualityCalculations.ts's own TatEntryForResolution for the full
   * account of how both are resolved together.
   */
  performingLabFacilityId: string | null;
  specimenId:     string | null;       // null = all specimens
  subspecialtyId: string | null;       // null = all subspecialties
  roleId:         string | null;       // null = all roles; e.g. 'Resident', 'Pathologist'
  active:         boolean;
  notes:          string;
  createdAt:      string;
}
