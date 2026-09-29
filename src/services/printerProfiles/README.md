# services/printerProfiles/

Registry of real physical label-printer capabilities (ZPL support, DPI, DataMatrix module size, vendor, bridge type) — used to pick the right label template and prevent generating a barcode a given printer can't actually render legibly.

**Pattern:** Standard interface/mock pattern (no firestore stub currently), matching the same registry pattern as Protocol Dictionary / Stain Dictionary / Departments.

## Admin guide: how a site prints labels

*Written for customer administrators and IT. Intended for the PathScribe Admin Guide.*

A web browser can't send a label straight to a USB or network label printer. Something between PathScribe and the printer has to do it. Each printer's **Bridge Type** (Configuration → System → Workstation & Hardware → Printer Profiles) says which route that printer uses. Sites differ, so this is decided site by site during onboarding.

### Which route to choose, in order of preference

1. **Server-side printing through the interface engine, or BarTender.** Labels go from the server to network-attached printers, or to a BarTender Integration Platform the site already runs. **Nothing is installed on lab workstations.** Most large health systems and NHS Trusts already print this way.
2. **A print bridge the site already runs.** QZ Tray is common because other lab software uses it. Zebra Browser Print is found at smaller sites with only Zebra printers. **Nothing new needs IT approval** if the bridge is already deployed.
3. **The PathScribe Agent.** A small PathScribe program installed on each workstation that has a USB label printer. This route is only for sites with USB-only printers and none of the options above.

### What the site must agree to for the PathScribe Agent
The agent is a locally running program, so the customer's IT team has to approve installing it. PathScribe provides what enterprise IT normally asks for:
- **A signed installer:** an MSI signed with an EV code-signing certificate for Windows, and an Apple Developer ID–signed, notarized package for macOS. IT can push it silently through its own tools (Intune, SCCM, Jamf) rather than installing it by hand at each desk. Once installed, the agent runs without administrator rights.
- **A narrow footprint:**
  - It listens only on the workstation itself (`127.0.0.1`), so nothing else on the network can reach it.
  - It makes no outbound connections.
  - It does one thing: send print jobs from PathScribe on that workstation to that workstation's printer.
- **Ports:** it uses port 9100, or 9101 or 9102 if 9100 is taken. Port 9100 is also the standard raw-printing port, so it may already be in use. PathScribe finds whichever port the agent chose.
- **Encrypted, with its own certificate:** PathScribe talks to the agent only over an encrypted connection (`wss://`, the WebSocket form of HTTPS), even though it never leaves the workstation. The installer creates a security certificate unique to that workstation and adds it to the computer's trusted certificates. IT should expect that step. Firefox needs its enterprise-roots setting on (or the certificate added to it); Chrome and Edge use the computer's store.
- **A browser permission:** from Chrome 147 (April 2026), Chrome and Edge ask each user once before a website may connect to a program on their own computer (**Local Network Access**). IT can approve PathScribe's address in advance with the browser policy `LocalNetworkAccessAllowedForUrls`, so staff never see the prompt.
- **Several tabs at once:** print jobs from several PathScribe tabs are queued and printed one at a time, and each job reports back success or failure.

### Questions to ask during onboarding
- For each site: which label printers (make and model), and is each **network-attached or USB**?
- Is **BarTender** in use, or an interface engine (Mirth, Rhapsody) that already routes printing?
- Is **QZ Tray** or **Zebra Browser Print** already installed on the lab workstations?

The answers usually settle the route without the agent.

### Availability (Sep 2026)

| Bridge Type | Status |
|---|---|
| QZ Tray | Available |
| OS Print Dialog (the browser's own print queue) | Available. Suits graphic label printers, but not precise thermal barcode labels |
| Direct via Interface Engine | In development (Jira PS-53); PathScribe's side is built, the engine connection is not |
| BarTender Automation | Planned (PS-53) |
| Zebra Browser Print | Planned |
| PathScribe Agent | PathScribe is ready for it; the agent program itself is not yet available (PS-52) |

## Files

- **Batch 325 (PS-52):** a printer whose Bridge Type is `pathscribe_agent` now prints through `utils/labels/pathscribeAgent/` (discovery on 9100–9102, one job outcome per job). The agent program itself is still to be built.
- **Batch 346 (PS-52):** `PrinterProfile.agentPort`, an optional **Agent Port** shown only for PathScribe Agent printers. Leave it empty unless IT moved the agent off 9100–9102; when set (1024–65535) PathScribe tries it first. `validatePrinterProfileDraft.ts` now holds the checks the editor uses (`isPrinterProfileDraftValid`, `hasInvalidAgentPort`, and `printerProfileDraftForSave`, which clears the port when the bridge is changed to something else). The editor used to repeat the required-fields check itself; it now calls these.
- **`IPrinterProfileService.ts`** — the contract: `PrinterProfile`, `PrinterVendor`, `PrinterBridgeType`. `PrinterBridgeType`'s own doc comment carries the full, researched tradeoff reasoning for each of the 6 real bridge options (`qz_tray`, `zebra_browser_print`, `bartender_rest`, `direct_interface_engine`, `pathscribe_agent`, `os_print_dialog`) — read it directly there, not duplicated here since it needs to stay next to the type it documents. **Real fix (Workstation & Hardware redesign), per direct guidance:** gained `facilityId?: string` — this registry had zero facility association at all before, a genuine gap (not a deliberate one) that made it impossible to tell which printer belonged to which lab from this screen alone. Same Global/scoped convention as everywhere else — undefined means a real, shared network-pool printer reachable from more than one facility's own benches, not "unset."
- **`mockPrinterProfileService.ts`** — the real, active implementation.
- **`validatePrinterProfileDraft.ts`** (+ `.test.ts`) — real, pure validation for the admin add/edit form.

## Notes

- The **Admin guide** section above (Batch 321) is written for customers and feeds the Admin Guide PDF. Keep it in plain language, and update its Availability table when a bridge type ships.

- Real, honest scope limit: this registry stores/manages profiles and validates capability *before* a job is dispatched — it does not, and structurally cannot from inside a web app, auto-discover a real printer's own capabilities or push templates to hardware. That's the separate, not-yet-built Local Bridge Agent's job; this registry is where that data would live and get validated against once it exists.
- **Real, per direct guidance (Workstation & Hardware redesign):** `PrinterProfilesSection.tsx` now shows a real Facility column and accepts an optional `selectedFacilityId` prop, filtering the list to that facility's own profiles plus any Global (shared) one — consumed by the new group-level Facility Selector in `components/Config/System/index.tsx`.
- **Real fix (PS-55, Sep 2026) — the seeded demo profile's own `bridgeType` was silently undermining the real QZ Tray dispatch pipeline.** `mockPrinterProfileService.ts`'s seeded `printer-zt411-example` (the only printer the two `supportsPrinting` demo scan stations point at) still had `bridgeType: 'os_print_dialog'` — a real, valid `PrinterProfile` value, but one `utils/labels/printCassetteSlideLabel.ts`/`dispatchZplLabel.ts` explicitly document as having no working dispatch for the ZPL/GS1 pipeline (only `qz_tray` and `direct_interface_engine` do). That seed predates the real QZ Tray dispatch work — left as-is, every Print Cassette/Print Slide action at the app's only two print-capable demo stations would always hit the real "not yet implemented" refusal, never actually demonstrating the QZ Tray path PS-55 asked to have wired in. Updated to `bridgeType: 'qz_tray'` so the demo genuinely exercises it. New, real, end-to-end test coverage added at `useSpecimenBlockManagement.test.ts` (previously this integration layer — station lookup → printer profile lookup → `printCassetteLabel`/`printSlideLabel` call — had no test of its own; only the lower-level units in `printCassetteSlideLabel.test.ts` were covered).

## Batch 359: linked to the equipment register

- **`PrinterProfile.equipmentId`** (new, optional): the physical printer in `services/equipment/` (kind `label_printer`).
  - The mock service refuses any other kind (`EQUIPMENT_LINK_INVALID`).
  - The seeded Zebra profile points at the seeded register printer `eq-zebra-zt411-01`. A browser that stored the profile before gets the link (`withSeedFieldBackfill`); a stored link or a removed profile is left alone.
  - Duplicating a profile doesn't copy the device (`duplicateEntities.ts`).
- **`printerProfileList.ts`** (new): the screen's facility filter and support label, moved out of `PrinterProfilesSection.tsx`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
