// src/services/cytology/resolveCytologyWorkloadCapacity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CLIA 42 CFR § 493.1274 workload
// specification — the real, core prorated-cap math:
//   user_max_capacity = (user_assigned_cap * active_hours) / 8.0
//   exceeded if (user_scu_today + scu_weight) > user_max_capacity
//
// Real, deliberate design: `candidateScu` is the PROSPECTIVE total —
// the real caller's own already-completed SCU sum for the rolling
// window PLUS the new review's own weight, summed before calling this
// function — not something this function sums itself, since the real
// caller (the actual save flow) is the one that knows both real
// numbers. `activeScreeningHours` must likewise include the current,
// in-progress review's own real, locally-accumulated active seconds,
// not just prior completed reviews — otherwise a real, first review
// of the day would show activeScreeningHours === 0, making
// maxAllowedScu 0 and blocking even a single real review before any
// work could ever be recorded.
//
// Real, exact boundary per direct guidance's own stated formula: a
// STRICT greater-than — landing exactly on the cap is real, allowed
// usage, not a violation.
// ─────────────────────────────────────────────────────────────────────────────

export const CYTOLOGY_WORKLOAD_SOFT_BRAKE_THRESHOLD_PERCENT = 85;

export interface CytologyWorkloadCapacityStatus {
  maxAllowedScu: number;
  candidateScu: number;
  utilizationPercent: number;
  status: 'ok' | 'approaching' | 'exceeded';
}

export function resolveCytologyWorkloadCapacity(
  candidateScu: number,
  activeScreeningHours: number,
  userAssignedCap: number,
): CytologyWorkloadCapacityStatus {
  const maxAllowedScu = (userAssignedCap * activeScreeningHours) / 8;
  const utilizationPercent = maxAllowedScu > 0 ? (candidateScu / maxAllowedScu) * 100 : (candidateScu > 0 ? 100 : 0);
  const status: CytologyWorkloadCapacityStatus['status'] =
    candidateScu > maxAllowedScu ? 'exceeded'
    : utilizationPercent >= CYTOLOGY_WORKLOAD_SOFT_BRAKE_THRESHOLD_PERCENT ? 'approaching'
    : 'ok';
  return { maxAllowedScu, candidateScu, utilizationPercent, status };
}
