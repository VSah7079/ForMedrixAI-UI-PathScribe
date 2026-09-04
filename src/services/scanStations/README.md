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

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
