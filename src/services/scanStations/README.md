# services/scanStations/

Registry of physical scan/work stations — where a tech actually scans a specimen at the bench — facility-scoped, with an Active/Inactive/Unverified lifecycle and a real workflow-stage mapping. A genuinely different real entity from `services/locations/` (which tracks where a *patient* is physically placed, ward/room/bed, HL7 PV1) and from `services/hardwareContainers/` (a reusable rack that moves between stations, not a fixed station itself).

**Pattern:** Standard interface/mock pattern (no firestore stub currently), same established shape as `services/locations/`.

## Files

- **`IScanStationService.ts`** — the contract: `ScanStation` (barcode code for `STATION:`-prefix switching, `workflowStage`, `facilityId`, lifecycle status).
- **`mockScanStationService.ts`** — the real, active implementation.
- **`validateScanStationDraft.ts`** (+ `.test.ts`) — real, pure validation for the admin add/edit form. **Real fix (Workstation & Hardware redesign):** `facilityId` had no validation at all before — the free-text UI field it used to pair with defaulted to a fake, always-non-empty `'lab-main'` string, so a required-field check would never have fired anyway. Now a real, live rule, since the field is a real dropdown with no default selection.

## Notes

- **Real fix (Workstation & Hardware redesign), per direct guidance:** `ScanStation.facilityId` was always correctly typed as a real Facility reference, but the admin UI (`ScanStationsSection.tsx`) rendered it as free text with a fabricated `'lab-main'` default that matched no real Facility record. Now a real dropdown sourced from `getActivePerformingLabs()`, same convention as every other lab-scoped dictionary in this app; the 8 seeded stations were corrected to point at a real, existing performing-lab Facility (`c-fenwick-general`) instead. The section also now accepts an optional `selectedFacilityId` prop, filtering its own list when the new Workstation & Hardware group-level Facility Selector (`components/Config/System/index.tsx`) has one selected.
- The current effective scan station drives real, downstream behavior throughout the app (material scan tracking, print routing, cassette color resolution context) — see `hooks/useEffectiveScanStation.ts` and `hooks/useCurrentScanStation.ts` for how a station gets resolved and threaded through.
- **Real, new consumer (PS-287, Sep 2026):** `getAll()`, filtered by `workflowStage` and `facilityId`, is now how `utils/addOnOrderOperations.ts`'s own `resolveRoutingStations()` shows a pathologist's add-on order which real stations it would actually reach — per that ticket's own direct Jira comment, scoped to the case's own performing lab (via `services/cases/casePoolAssignmentService.ts`'s `resolveCasePerformingLab()`), never an enterprise-wide list. Display-only — this doesn't dispatch cutting itself, that stays PS-284's own bench. Read-only; nothing in this folder's own files changed.
- **Real, new consumer (PS-288, Sep 2026):** `ScanStation.facilityId` is now also the real fallback signal `services/facilityOpsDashboard/resolveBatchFacilityId.ts` uses to scope a `Batch` to a facility when none of its own items resolve one via `Case.originHospitalId` (e.g. a batch just opened, nothing scanned into it yet). Read-only; nothing in this folder's own files changed.

## Batch 356

- **New seed station:** "Molecular — Amplification Bay" (`station-molecular-1`, `MOLECULAR-01`, Fenwick General). The seeded Panther instruments sit there (`services/instruments/`).
- **Existing browsers:** stations have no seed version, so a browser that already stored stations won't show it until Demo Reset. *Fixed in Batch 357: see below.*
- **Export:** `@/services` now exports `scanStationService`.

## Batch 357

`load()` appends any seed station whose id isn't stored (`services/mockSeedMerge.ts`) and writes the list back. A browser that stored stations before a seed station was added now gets it without Demo Reset; stored stations and their edits are untouched. Safe because stations can't be deleted, only deactivated. Test: `mockScanStationSeedMerge.test.ts`.

## Batch 358

The seeded Panthers now live in the equipment register (`services/equipment/`), still at `station-molecular-1`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
