// src/types/quality/QaSubspecialtyRiskWeight.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, per direct guidance: a configurable risk multiplier per
// Subspecialty (PS-32), for the surgical post-sign-out peer review
// case-selection engine specifically — NOT a field on QaActivityType
// itself (PS-117's own generic engine only knows flat
// samplingPercentage/targetedSelectionRule; subspecialty-weighted
// stratified sampling is new, PS-324-specific infrastructure layered
// on top of it, per direct guidance's own explicit correction: real,
// confirmed directly that `subspecialtyService` (PS-32) has zero
// risk-weighting capability today — this is genuinely new, not
// something that already half-existed).
//
// Deliberately its own small config service, not baked into
// Subspecialty.ts itself — a risk weight is a QA-program policy
// decision (how aggressively to sample this subspecialty for peer
// review), not an intrinsic fact about the subspecialty the way its
// name/routing/pool membership are. Future-proofed to key off real
// Subspecialty.id values so it can bind cleanly if subspecialtyService
// itself ever grows this capability, per direct guidance — but kept
// separate for now rather than speculatively modifying that service.
// ─────────────────────────────────────────────────────────────────────────────

export interface QaSubspecialtyRiskWeight {
  id: string;
  /** Real FK to Subspecialty.id. */
  subspecialtyId: string;
  /** Real, per direct guidance's own worked example (High=3x,
   *  Moderate=2x, Routine=1x) — stored as the actual multiplier, not a
   *  named tier, so the Configuration Center can offer any real value
   *  a QA director wants, not just three fixed presets. Must be > 0;
   *  enforced at the service layer, not the type level, matching this
   *  app's own real convention for every other range-constrained
   *  numeric field. */
  multiplier: number;
  updatedAt: string;
  updatedBy: string;
}
