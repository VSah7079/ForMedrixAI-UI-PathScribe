# services/printerProfiles/

Registry of real physical label-printer capabilities (ZPL support, DPI, DataMatrix module size, vendor, bridge type) — used to pick the right label template and prevent generating a barcode a given printer can't actually render legibly.

**Pattern:** Standard interface/mock pattern (no firestore stub currently), matching the same registry pattern as Protocol Dictionary / Stain Dictionary / Specimen Categories.

## Files

- **`IPrinterProfileService.ts`** — the contract: `PrinterProfile`, `PrinterVendor`, `PrinterBridgeType`. `PrinterBridgeType`'s own doc comment carries the full, researched tradeoff reasoning for each of the 6 real bridge options (`qz_tray`, `zebra_browser_print`, `bartender_rest`, `direct_interface_engine`, `pathscribe_agent`, `os_print_dialog`) — read it directly there, not duplicated here since it needs to stay next to the type it documents.
- **`mockPrinterProfileService.ts`** — the real, active implementation.
- **`validatePrinterProfileDraft.ts`** (+ `.test.ts`) — real, pure validation for the admin add/edit form.

## Notes

- Real, honest scope limit: this registry stores/manages profiles and validates capability *before* a job is dispatched — it does not, and structurally cannot from inside a web app, auto-discover a real printer's own capabilities or push templates to hardware. That's the separate, not-yet-built Local Bridge Agent's job; this registry is where that data would live and get validated against once it exists.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
