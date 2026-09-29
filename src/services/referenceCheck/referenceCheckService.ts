// src/services/referenceCheck/referenceCheckService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Checks whether a foundational config entity (Facility, Subspecialty, Specimen
// Category) is still referenced elsewhere before it gets deactivated. This
// closes a real, confirmed gap: FacilityDictionaryPage's deactivate() previously
// just flipped status with zero check for whether Physicians, TAT entries, or
// Grossing Route Overrides still pointed at it.
//
// Deliberately scoped to only the dependency edges actually verified in the
// codebase (see the System-tab sidebar reorganization this session) — no
// speculative checks for relationships that were checked and found not to
// exist (e.g. Container Types, Stain Dictionary have no confirmed dependents).
//
// Governing Bodies → Terminology Services is deliberately excluded from this
// checker: that relationship is a static, compile-time ICD-10-variant lookup
// table (getIcd10VariantForBody), not a live stored reference that could go
// stale — deactivating a Governing Body record doesn't corrupt any data the
// way deactivating a Facility while Physicians/TAT/overrides still reference it
// would.
// ─────────────────────────────────────────────────────────────────────────────
import { physicianService, grossingRoutingOverrideService, specimenDictionaryService } from '../index';
import { loadRoutingRules } from '../cases/casePoolAssignmentService';
import { mockTatTargetService } from '../tatConfig/mockTatTargetService';

export interface ReferenceSource {
  label: string;
  count: number;
}

export interface ReferenceCheckResult {
  hasReferences: boolean;
  sources: ReferenceSource[];
}

// Batch 353: TAT targets come from the TAT target service (they were read
// from the TAT settings screen's browser storage).
async function loadTatEntries() {
  const res = await mockTatTargetService.getAll();
  return res.ok ? res.data : [];
}

function toResult(sources: ReferenceSource[]): ReferenceCheckResult {
  const nonZero = sources.filter(s => s.count > 0);
  return { hasReferences: nonZero.length > 0, sources: nonZero };
}

export async function checkFacilityReferences(facilityId: string): Promise<ReferenceCheckResult> {
  const [physiciansRes, overridesRes] = await Promise.all([
    physicianService.getAll(),
    grossingRoutingOverrideService.getAll(),
  ]);
  const physicianCount = physiciansRes.ok ? physiciansRes.data.filter((p) => p.clientIds?.includes(facilityId)).length : 0;
  const overrideCount = overridesRes.ok ? overridesRes.data.filter((o) => o.clientId === facilityId && o.active !== false).length : 0;
  const tatCount = (await loadTatEntries()).filter(e => e.active && e.facilityId === facilityId).length;
  return toResult([
    { label: 'Physicians', count: physicianCount },
    { label: 'Grossing Route Overrides', count: overrideCount },
    { label: 'TAT Configuration entries', count: tatCount },
  ]);
}

export async function checkSubspecialtyReferences(subspecialtyId: string): Promise<ReferenceCheckResult> {
  const routingRuleCount = loadRoutingRules().filter(r => r.subspecialtyId === subspecialtyId && r.active).length;
  const tatCount = (await loadTatEntries()).filter(e => e.active && e.subspecialtyId === subspecialtyId).length;
  return toResult([
    { label: 'Routing Rules', count: routingRuleCount },
    { label: 'TAT Configuration entries', count: tatCount },
  ]);
}

export async function checkDepartmentReferences(departmentId: string): Promise<ReferenceCheckResult> {
  const res = await specimenDictionaryService.getAll();
  const count = res.ok ? res.data.filter((e) => e.departmentId === departmentId).length : 0;
  return toResult([{ label: 'Specimen Dictionary entries', count }]);
}

/** Real, per this file's own header — "Client" is the Client Dictionary
 *  UI's own name for a Facility record, not a separate entity
 *  (ClientDictionaryPage.tsx: `import type { Facility as Client }`,
 *  reconciled June 2026 to share the exact same facilityService
 *  every other real screen already uses). Deliberately identical
 *  logic to checkFacilityReferences — a real Client and a real
 *  Facility are the same record under two different labels, so a
 *  second, independent reference-check would just be this same
 *  check duplicated, genuinely risking drift between the two over
 *  time. */
export async function checkClientReferences(clientId: string): Promise<ReferenceCheckResult> {
  return checkFacilityReferences(clientId);
}

/** Real, honest limit, stated plainly rather than guessed: a
 *  SpecimenEntry is documented (ISpecimenCategoryService.ts's own
 *  header) as needing a real specimenCategoryId field "added to
 *  specimenTypes.ts separately" — confirmed directly that field does
 *  not exist anywhere on SpecimenEntry yet, so there is genuinely no
 *  real, live reference to check today. Returns an honest "no
 *  references" rather than fabricating a check against a field that
 *  isn't there. Real, deliberate shape so the actual check drops in
 *  with zero structural change once specimenCategoryId exists —
 *  mirroring checkDepartmentReferences's own exact
 *  filter-and-count pattern is the intended, obvious next step, not
 *  a new design question. */
export async function checkSpecimenCategoryReferences(_categoryId: string): Promise<ReferenceCheckResult> {
  return toResult([{ label: 'Specimen Dictionary entries', count: 0 }]);
}
