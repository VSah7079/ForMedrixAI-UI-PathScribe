// src/utils/performingLabs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared helper — per direct follow-up: "Performing Lab is going
// to be a fixture" for how enterprise customers scope their own
// dictionary items, worth having exactly once rather than
// reimplemented per dictionary. Confirmed before extracting, not
// assumed: the exact same "fetch all active performing labs" query
// was already independently written, identically, in both
// ExternalResourcesSection.tsx and ContainerTypesSection.tsx.
//
// Unlike services/facilities/IFacilityService.ts's own
// resolvePerformingLabFacilityId() (pure, data-only, takes a Facility
// directly), this makes a real service call — kept here in utils/
// rather than in the interface file itself, so the interface module
// never depends on its own mock/firestore implementation. Callers
// still own their own loading state; this just returns the real,
// filtered list.
// ─────────────────────────────────────────────────────────────────────────────
import { facilityService } from '../services';
import type { Facility } from '../services/facilities/IFacilityService';

export async function getActivePerformingLabs(): Promise<Facility[]> {
  const res = await facilityService.getAll();
  return res.ok ? res.data.filter(f => f.roles.includes('performing_lab') && f.status === 'Active') : [];
}
