# services/printerProfiles/

Registry of real physical label-printer capabilities (ZPL support, DPI, DataMatrix module size, vendor, bridge type) — used to pick the right label template and prevent generating a barcode a given printer can't actually render legibly.

**Pattern:** Standard interface/mock pattern (no firestore stub currently), matching the same registry pattern as Protocol Dictionary / Stain Dictionary / Departments.

## Files

- **`IPrinterProfileService.ts`** — the contract: `PrinterProfile`, `PrinterVendor`, `PrinterBridgeType`. `PrinterBridgeType`'s own doc comment carries the full, researched tradeoff reasoning for each of the 6 real bridge options (`qz_tray`, `zebra_browser_print`, `bartender_rest`, `direct_interface_engine`, `pathscribe_agent`, `os_print_dialog`) — read it directly there, not duplicated here since it needs to stay next to the type it documents. **Real fix (Workstation & Hardware redesign), per direct guidance:** gained `facilityId?: string` — this registry had zero facility association at all before, a genuine gap (not a deliberate one) that made it impossible to tell which printer belonged to which lab from this screen alone. Same Global/scoped convention as everywhere else — undefined means a real, shared network-pool printer reachable from more than one facility's own benches, not "unset."
- **`mockPrinterProfileService.ts`** — the real, active implementation.
- **`validatePrinterProfileDraft.ts`** (+ `.test.ts`) — real, pure validation for the admin add/edit form.

## Notes

- Real, honest scope limit: this registry stores/manages profiles and validates capability *before* a job is dispatched — it does not, and structurally cannot from inside a web app, auto-discover a real printer's own capabilities or push templates to hardware. That's the separate, not-yet-built Local Bridge Agent's job; this registry is where that data would live and get validated against once it exists.
- **Real, per direct guidance (Workstation & Hardware redesign):** `PrinterProfilesSection.tsx` now shows a real Facility column and accepts an optional `selectedFacilityId` prop, filtering the list to that facility's own profiles plus any Global (shared) one — consumed by the new group-level Facility Selector in `components/Config/System/index.tsx`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
