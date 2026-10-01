# services/equipment/

**The lab's equipment register (Batch 358).**

- **Pete's decision.** Asked whether to centralise equipment configuration, Pete said "Yes" to the hybrid:
  - this register holds what every device shares;
  - workflow-specific settings stay on their own screens and point at a register entry. Printer Profiles and Grossing Hardware are linked in Batch 359; engravers and cold-chain storage units come later.
- **Regulation.** ISO 15189 and CAP both expect one equipment inventory. Maintenance and calibration history can be added here later.
- **Instruments.** It takes over Batch 356's instrument list (PS-326). A molecular batch's "target instrument" is register equipment of kind `analyser`.

## Files

- **`IEquipmentService.ts`**: the contract. `@/services` exports it as `equipmentService`, with `EQUIPMENT_KINDS`.
  - `Equipment`: `code`, `name`, `kind`, `make`, `model`, `serialNumber`, `facilityId` (its performing lab), optional `scanStationId`, and `status`.
  - `EQUIPMENT_KINDS`: analyser, stainer, tissue processor, slide scanner, camera, scale, label printer, engraver, storage unit, other. Labels come from `equipmentKinds.*`.
  - Methods: `getAll`, `getActive(kind?)`, `getById`, `getByCode`, `create`, `update`, `deactivate` and `reactivate`.
  - **The code is fixed once created and equipment is never deleted.** Other records carry the code: `MolecularBatch.targetInstrumentId`, the deck barcode `LOC-INST-<code>-SLOT_<slot>`, and printed labels.
- **`equipmentRules.ts`** (+ `.test.ts`), pure:
  - `validateEquipmentDraft`: name; code (required, letters/digits/`_`/`-`, unique ignoring case); kind; lab; a station in the same lab. Errors are translation-key suffixes.
  - `checkBatchInstrument`: a batch may only target an active analyser.
  - `checkEquipmentStation`: whether this workstation is the equipment's station.
  - `equipmentForPicker`, `filterEquipment` and `stationsForEquipment`, for the screens.
- **`mockEquipmentService.ts`** (+ `.test.ts`): the demo register, under storage key `equipment`.
  - Seeded with the Panther analysers (the same ids and codes as Batch 356).
  - A browser holding Batch 356's `instruments` list brings it across once, as analysers.
  - Seed records added later reach existing browsers (`mockSeedMerge.ts`).
  - Demo Reset clears both keys.

## Where it's used

- **Configuration → System → Workstation & Hardware → Equipment** (`components/Config/System/EquipmentSection.tsx`), which replaced the Instruments screen.
  - Filter by text, kind, status and the shared facility selector.
  - Add, edit, deactivate and reactivate; the code is locked after creation.
- **Plate builder:** offers the active analysers, this station's lab first.
- **Batch creation:** refuses a code that isn't an active analyser.
- **Worklist dispatch:** checks the analyser's station.

## Still open

- **Linking the workflow screens.** Printer Profiles and Grossing Hardware are not linked yet (Batch 359). Engravers and cold-chain storage units aren't linked.
- **Maintenance and calibration** records are not built.
- **Free-text instrument ids.** Molecular QC run records and inbound instrument messages still carry a free-text `instrumentId`.
- **Workcenter display.** The Molecular Workcenter shows codes, not names.

## Batch 359: settings records point at the register

- **Linked:** Printer Profiles (`PrinterProfile.equipmentId`) and the new Grossing Hardware screen (`GrossingHardwareProfile.equipmentId`) name their physical device here.
- **Rules** (`equipmentRules.ts`):
  - `checkEquipmentLink`: the device must exist and be the right kind; no link is fine.
  - `equipmentLinkOptions`: active devices of the kind, plus the current link.
  - `settingsLinksByEquipment`: the register's new **Settings** column, e.g. "Printer profile: ZEBRA-192.168.12.85".
  - `EQUIPMENT_LINK_INVALID`: the error the settings services return.
- **New seed:** the Zebra ZT411 behind the seeded printer profile (`eq-zebra-zt411-01`).
- **Still open:**
  - Engravers and cold-chain storage units aren't linked.
  - There are no maintenance or calibration records yet. *Built in Batch 360.*
  - A settings record's own lab/station and its device's lab/station are not kept in step.

## Batch 360: maintenance and calibration records

- **Schedules** on the device: `Equipment.maintenanceIntervalDays` and `calibrationIntervalDays`, each optional, whole days from 1 to 3650.
- **`IEquipmentLogService.ts`**: each device's service history, exported as `equipmentLogService`.
  - Entry types: maintenance, calibration, function check, repair, malfunction.
  - Outcomes: pass, fail, not applicable. Each entry also records the date done, who did it, and notes.
  - **Append-only:** no edit or delete. A mistake is corrected by a new entry. Adding an entry writes `equipment.log_entry_added` to the audit log (detail in English).
- **`equipmentLogRules.ts`** (+ `.test.ts`), pure, on the facility's calendar:
  - Validation: no future dates; who is required; a failure or malfunction needs notes.
  - `nextDue`: due dates count from the last passing entry. A failed calibration doesn't reset the clock.
  - `hasOpenMalfunction`: open until a passing repair or function check on or after it.
  - `equipmentServiceState`: the worst of malfunction, overdue, not yet done, due soon, up to date, not scheduled.
  - List helpers.
- **`mockEquipmentLogService.ts`** (+ `.test.ts`): storage key `equipment_log`, cleared by Demo Reset.
  - The Panthers get 30-day maintenance and 180-day calibration schedules.
  - A history is seeded relative to the first load: Panther 1 up to date, Panther 2 calibration overdue, Panther 3 with an open malfunction.
  - Existing browsers get the schedules through `withSeedFieldBackfill`.
- **Screen:** the register shows a **Service** column (status, and next or past due date) and a **Log** action that opens `EquipmentLogModal.tsx`.
- **Still open:**
  - A device with an open malfunction or overdue calibration is flagged, but not blocked. A molecular batch can still target it. *Pete decided in Batch 361: show it in red, don't block it.*
  - There are no reminders.
  - There is no report across devices.

## Batch 361: shown in red

Pete's decision on the open question above: flag the device, don't block it.
- **`equipmentLogRules.ts`:** `isServiceAlert(state)` is true for an open malfunction or anything past due (maintenance or calibration). `serviceStatesById` gives each device's state for a picker.
- **Where it shows:** the register row (red name and edge) and the molecular batch instrument picker (a warning sign and the state in the option, a red border and a warning under it when chosen).
- **Still open:** the Molecular Workcenter lists batches by instrument code only, so it shows no red flag.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
