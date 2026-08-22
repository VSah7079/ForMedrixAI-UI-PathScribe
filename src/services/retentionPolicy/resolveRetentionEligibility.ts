// src/services/retentionPolicy/resolveRetentionEligibility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared extraction — resolveCategoryOverride and
// resolveFacilityIdForLocation previously lived as two, identical,
// independently-maintained copies in computeDisposalQueue.ts and
// disposeItemByScan.ts (the exact "two copies that could silently
// drift apart" risk this app's own established pattern
// (resolveMaterialFromScan.ts, among others) exists specifically to
// avoid). Pulled out here, unchanged, as the one, real, shared
// implementation both files now import.
//
// Real, new addition, per direct follow-up: "computeDisposalQueue.ts
// doesn't know matrix blocks exist." A real matrix block is shared by
// MULTIPLE specimens, each with its own, potentially different,
// SpecimenCategory.retentionOverrideDays — resolveMostConservativeEligibleDate
// is the real, single resolution point for that case: the LATEST
// (most conservative) real eligible date across every real
// participant's own, individual retention clock, since a shared,
// physical cassette can't genuinely be disposed until EVERY real
// participant's own requirement has independently been satisfied.
//
// Real, architectural fix, per direct follow-up: "if CAP or RCPath or
// some other governmental agency changes their rule, then we need to
// actually release software in order to stay compliant." This is now
// the one, real place a Jurisdiction/materialType pair gets resolved
// to a real, LIVE retention-days figure — via
// GoverningBody.retentionPolicyVersions (ForMedrix-staff-editable, no
// release required) instead of a hardcoded constant.
//
// Real, second architectural fix, per direct follow-up: "it depends
// entirely on whether the regulation lengthens or shortens the
// retention period, as well as statutory grandfathering clauses."
// resolveApplicableRetentionVersion below is the real resolution
// algorithm this second fix requires — see its own doc comment for
// the full, worked reasoning, and RetentionPolicyVersion's own doc
// comment (IGoverningBodyService.ts) for the real, cited two-rule
// distinction (lengthening = always retroactive; shortening =
// prospective/grandfathered by default) this implements.
// ─────────────────────────────────────────────────────────────────────────────

import { specimenDictionaryService, specimenCategoryService } from '@/services';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { mockGoverningBodyService } from '@/services/governingBodies/mockGoverningBodyService';
import type { RetentionPolicyVersion } from '@/services/governingBodies/IGoverningBodyService';
import { calculateRetentionEligibleDate } from './RetentionPolicy';
import type { RetainableMaterialType, RetentionOverrideDays } from './RetentionPolicy';
import type { Jurisdiction } from '@/types/systemConfig';

/** Real, single resolution point — Specimen's own real
 *  specimenDictionaryEntryId -> SpecimenEntry.specimenCategoryId ->
 *  SpecimenCategory.retentionOverrideDays. Returns undefined (not an
 *  empty object) at any real, missing step along that chain, so
 *  callers correctly fall through to the jurisdiction default rather
 *  than treating a missing link as "no override" in a way that could
 *  be confused with a real, deliberately-empty override. */
export async function resolveCategoryOverride(specimenDictionaryEntryId: string | undefined): Promise<RetentionOverrideDays | undefined> {
  if (!specimenDictionaryEntryId) return undefined;
  const dictRes = await specimenDictionaryService.getAll();
  if (!dictRes.ok) return undefined;
  const entry = dictRes.data.find(e => e.id === specimenDictionaryEntryId);
  if (!entry?.specimenCategoryId) return undefined;
  const catRes = await specimenCategoryService.getAll();
  if (!catRes.ok) return undefined;
  const category = catRes.data.find(c => c.id === entry.specimenCategoryId);
  return category?.retentionOverrideDays;
}

/** Real, single resolution point — a station-name string (whatever a
 *  real MaterialLocation.location actually carries) resolved back to
 *  that ScanStation's own real facilityId. Returns undefined for an
 *  unrecognized location string (an external/legacy location name
 *  with no matching real ScanStation record) rather than guessing. */
export async function resolveFacilityIdForLocation(locationName: string | undefined): Promise<string | undefined> {
  if (!locationName) return undefined;
  const stationsRes = await mockScanStationService.getAll();
  if (!stationsRes.ok) return undefined;
  const station = stationsRes.data.find(s => s.name === locationName);
  return station?.facilityId;
}

/**
 * Real, single resolution algorithm, per direct follow-up's own two,
 * cited rules:
 *   - Lengthening a retention period applies immediately to every
 *     real, currently-stored, non-disposed item — "you cannot dispose
 *     of a 12-year-old block today simply because it met the old
 *     10-year rule when it was accessioned."
 *   - Shortening one applies prospectively by default — material
 *     signed out under an older, longer-retention legal framework can
 *     carry a real, legal obligation to that framework's own terms.
 *
 * Walks the real version history newest-first. A version that hasn't
 * reached its own effectiveDate yet (relative to `now`) is skipped
 * entirely — it isn't in effect at all yet. The first version found
 * that's genuinely in effect AND either (a) is explicitly retroactive
 * (applyToExistingInventory), or (b) the real case's own finalizedAt
 * is on or after that version's own effectiveDate, is the one that
 * governs this specific case. An older case that predates a real,
 * prospective-only version correctly falls through to whichever
 * earlier version WAS active at its own finalizedAt — genuinely
 * grandfathered, not silently overridden by whatever is configured
 * today.
 */
export function resolveApplicableRetentionVersion(
  versions: RetentionPolicyVersion[],
  finalizedAt: Date,
  now: Date = new Date(),
): RetentionPolicyVersion | undefined {
  const sorted = versions.slice().sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  for (const v of sorted) {
    const effectiveDate = new Date(v.effectiveDate);
    if (effectiveDate > now) continue;
    if (v.applyToExistingInventory) return v;
    if (finalizedAt >= effectiveDate) return v;
  }
  return undefined;
}

/** Real, single resolution point — the current jurisdiction's own,
 *  real, LIVE, version-resolved retention-days figure for one
 *  material type, sourced from whichever real GoverningBody record
 *  covers that jurisdiction (GoverningBody.jurisdictions) and
 *  whichever of that body's own real versions genuinely applies to
 *  this specific case's own finalizedAt (see
 *  resolveApplicableRetentionVersion's own doc comment). Returns
 *  undefined when no real, enabled body covers this jurisdiction, or
 *  no real version of its history actually applies yet — a caller
 *  must treat that as "no safe default exists," never silently fall
 *  back to 0 days (which would make everything instantly "eligible"). */
export async function resolveGoverningBodyRetentionDays(
  jurisdiction: Jurisdiction,
  materialType: RetainableMaterialType,
  finalizedAt: string,
): Promise<number | undefined> {
  const bodies = await mockGoverningBodyService.getAll();
  const body = bodies.find(b => b.enabled && b.retentionPolicyVersions?.length && b.jurisdictions?.includes(jurisdiction));
  if (!body?.retentionPolicyVersions) return undefined;
  const version = resolveApplicableRetentionVersion(body.retentionPolicyVersions, new Date(finalizedAt));
  return version?.[materialType];
}

/** Real, single resolution point, per direct follow-up: "A regular
 *  admin can currently set a per-category override below the
 *  governing body's own floor with no guard at all." The real, live,
 *  CURRENT (today's date) floor for every material type at once —
 *  used by SpecimenCategoriesSection.tsx as the real reference an
 *  admin's own retentionOverrideDays entry gets checked against
 *  before it's allowed to go lower. Deliberately "today's version,"
 *  not a specific case's own finalizedAt-resolved version — this is
 *  an admin-facing reference point at edit time, genuinely distinct
 *  from resolveGoverningBodyRetentionDays's own real, case-specific
 *  resolution used at actual disposal-eligibility time. Returns
 *  undefined if no real, enabled body covers this jurisdiction at
 *  all — the UI must treat that as "no real floor to check against
 *  yet," not silently allow anything through. */
export async function resolveCurrentGoverningBodyFloor(
  jurisdiction: Jurisdiction,
): Promise<Record<RetainableMaterialType, number> | undefined> {
  const bodies = await mockGoverningBodyService.getAll();
  const body = bodies.find(b => b.enabled && b.retentionPolicyVersions?.length && b.jurisdictions?.includes(jurisdiction));
  if (!body?.retentionPolicyVersions) return undefined;
  const now = new Date();
  const current = body.retentionPolicyVersions
    .filter(v => new Date(v.effectiveDate) <= now)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  if (!current) return undefined;
  return { block: current.block, slide: current.slide, wet_tissue: current.wet_tissue };
}

/**
 * Real, single resolution point for a real, physical object shared by
 * MULTIPLE specimens (a real MatrixBlock — types/case/MatrixBlock.ts).
 * The MOST CONSERVATIVE (latest) real eligible date across every real
 * participant's own, individual retention clock — never the earliest,
 * and never just the jurisdiction default ignoring per-participant
 * category overrides, since that could let a shared cassette become
 * "eligible" while one real participant's own, longer requirement
 * hasn't actually been satisfied yet.
 *
 * Returns null if the participant list is empty, if no real
 * GoverningBody/version covers this jurisdiction and finalizedAt at
 * all, or if ANY real participant's own date can't be computed (e.g.
 * no real finalizedAt) — a shared object with even one real,
 * unresolved participant clock has no safe, real eligible date to
 * report at all.
 */
export async function resolveMostConservativeEligibleDate(
  materialType: RetainableMaterialType,
  jurisdiction: Jurisdiction,
  finalizedAt: string | undefined,
  specimenDictionaryEntryIds: (string | undefined)[],
): Promise<Date | null> {
  if (specimenDictionaryEntryIds.length === 0 || !finalizedAt) return null;
  const jurisdictionDefaultDays = await resolveGoverningBodyRetentionDays(jurisdiction, materialType, finalizedAt);
  if (jurisdictionDefaultDays === undefined) return null;
  const dates = await Promise.all(
    specimenDictionaryEntryIds.map(async id => {
      const override = await resolveCategoryOverride(id);
      const effectiveDays = override?.[materialType] ?? jurisdictionDefaultDays;
      return calculateRetentionEligibleDate(effectiveDays, finalizedAt);
    }),
  );
  if (dates.some(d => d === null)) return null;
  return new Date(Math.max(...dates.map(d => d!.getTime())));
}
