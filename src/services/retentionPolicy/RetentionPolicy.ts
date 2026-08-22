// src/services/retentionPolicy/RetentionPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Retention should be configured...
// I would select something to minimize the amount of work for the
// admins." Confirmed directly, by checking real, seeded record counts
// before deciding, not by guessing: SpecimenCategory
// (services/specimenCategories/) has 6 real entries; the full Specimen
// Dictionary (SpecimenEntry) and Protocol dictionaries are each real,
// growing sets meant to reach the hundreds. Configuring retention at
// the specimen-category level, not per specimen-dictionary-entry or
// per-protocol, is the real, load-bearing choice that keeps ongoing
// admin work small — 6 possible overrides, not hundreds.
//
// Real, architectural fix, per direct follow-up: "if CAP or RCPath or
// some other governmental agency changes their rule, then we need to
// actually release software in order to stay compliant." The real,
// cited jurisdiction-level defaults this file used to hardcode
// directly (JURISDICTION_RETENTION_DEFAULTS) now live as real,
// live, Firestore-backed GoverningBody.retentionDefaults records
// (see services/governingBodies/IGoverningBodyService.ts's own
// header for the full reasoning) — updating a published figure is a
// real data change now, not a code change requiring a release.
//
// This file itself stays deliberately pure and dependency-free — no
// import of the governing-body SERVICE (that would create a real
// circular import back through IGoverningBodyService.ts, which
// imports RetainableMaterialType from here). calculateRetentionEligibleDate
// below takes an already-resolved retentionDays number rather than
// looking anything up itself; resolveRetentionEligibility.ts (the
// real, service-touching layer) is where a Jurisdiction/materialType
// pair gets resolved to a real, live retentionDays value via the
// GoverningBody data.
// ─────────────────────────────────────────────────────────────────────────────

export type RetainableMaterialType = 'block' | 'slide' | 'wet_tissue';

export const MATERIAL_TYPE_LABEL: Record<RetainableMaterialType, string> = {
  block: 'Tissue Blocks', slide: 'Slides', wet_tissue: 'Wet Tissue',
};

/** Real, optional per-SpecimenCategory override — see
 *  services/specimenCategories/ISpecimenCategoryService.ts's own
 *  SpecimenCategory.retentionOverrideDays for where this actually
 *  attaches. Any material type omitted here falls back to the real,
 *  live GoverningBody default for the current jurisdiction — an
 *  admin only needs to fill in the real exception, not re-specify
 *  everything. */
export type RetentionOverrideDays = Partial<Record<RetainableMaterialType, number>>;

/** Human-readable period — years for anything a full year or longer,
 *  weeks otherwise, so a real 4-week wet-tissue window doesn't render
 *  as a confusing "0 years." */
export function formatRetentionPeriod(days: number): string {
  if (days >= 365) {
    const years = days / 365.25;
    return `${Number.isInteger(years) ? years : years.toFixed(1)} year${years === 1 ? '' : 's'}`;
  }
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** Real, direct localStorage read — for service-layer code that isn't
 *  a React component and can't call useSystemConfig() the way
 *  BatchDetailView.tsx (or any other component) does. Same real
 *  storage key (contexts/SystemConfigContext.tsx's own LS_KEY) as the
 *  single source of truth, read directly rather than guessed at or
 *  duplicated across call sites. Falls back to 'US' — the same real
 *  default SystemConfigContext itself uses when nothing has been
 *  configured yet — so a fresh install still gets a real, sensible
 *  retention gate rather than silently skipping the check. */
export function getCurrentJurisdiction(): import('@/types/systemConfig').Jurisdiction {
  try {
    const raw = localStorage.getItem('pathscribe_system_config_v2');
    const config = raw ? JSON.parse(raw) : null;
    return config?.jurisdiction ?? 'US';
  } catch {
    return 'US';
  }
}

/** Real, single point of calculation — the earliest real, retention-
 *  policy-eligible disposal date for one item, given an already-
 *  resolved real number of retention days (categoryOverride wins when
 *  set for this materialType; otherwise the live GoverningBody
 *  default for the current jurisdiction — see
 *  resolveRetentionEligibility.ts's own resolveRetentionDays for that
 *  real resolution). Returns null if `signOutAt` is missing — an
 *  un-signed-out case has no real, meaningful retention clock running
 *  yet, and a caller should treat that as "not eligible" rather than
 *  guessing. */
export function calculateRetentionEligibleDate(
  retentionDays: number,
  signOutAt: string | undefined,
): Date | null {
  if (!signOutAt) return null;
  const signOutDate = new Date(signOutAt);
  const eligible = new Date(signOutDate);
  eligible.setDate(eligible.getDate() + retentionDays);
  return eligible;
}
