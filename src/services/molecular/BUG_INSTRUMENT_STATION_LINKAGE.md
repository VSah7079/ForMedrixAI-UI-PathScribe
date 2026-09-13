# BUG: Molecular instruments (`targetInstrumentId`) have no real dictionary entity or station linkage

**Status: OPEN — filed, not fixed.** Per direct request while reviewing
the Molecular module: "are the target instruments also [tied] to the
station?" Confirmed directly before filing this: **no.**

## What's real and confirmed today

`MolecularBatch.targetInstrumentId` (`IMolecularBatchService.ts`) is a
**plain, free-typed `string`** — not a reference to any real,
validated dictionary entity. Seed data confirms this directly:
`targetInstrumentId: 'PANTHER_02'` in `mockMolecularBatchService.ts`
is just a hardcoded string, the same way it's read and passed around
in every other real consumer (`resolveMolecularHistoricalTrace.ts`,
`resolveMolecularWorklistPayload.ts`, `resolveMolecularScanVerification.ts`,
`printMolecularLabels.ts`, `buildLabelHtml.ts`).

**No real "Instrument" dictionary/catalog service exists anywhere in
this app.** The only real hit for "instrumentation" is
`services/cytology/ICytologyInstrumentationService.ts` — a genuinely
different concept (a single, global WSI-vs-traditional-scope
*modality* setting, not a catalog of individual, named physical
devices) and not reusable here.

**Compare to the real, established, correct pattern this app already
has for a physical location/device concept**:
`services/scanStations/IScanStationService.ts`'s own `ScanStation` —
a real entity with its own `id`, human-facing `name`, and a real,
printable `barcodeCode` for physical station-switching. Instruments
have none of this. There is no way today to:

- List, add, or edit a real instrument as an admin-managed entity.
- Validate that a `targetInstrumentId` typed into a batch (or hardcoded
  in seed data) actually refers to a real, known instrument — a typo
  or a decommissioned instrument ID would be silently accepted.
- Know which physical scan station, deck, or facility a given
  instrument is actually associated with or located at — the "linked
  to a station" question this bug is named for has no real answer
  today, because there's no real place for that link to live.

## Real, concrete consequences

- `resolveMolecularScanVerification.ts`'s own real dispatch-
  verification flow (scan the plate barcode, scan the deck/instrument
  location, confirm they match) has no real, independent source of
  truth for "which instruments exist and where they physically are" —
  it can only compare two scanned strings to each other, never
  validate either one against a real, known instrument record.
- `printMolecularLabels.ts` prints `targetInstrumentId` directly onto
  a real, physical label with no guarantee the string it's printing
  corresponds to a real, currently-active instrument.
- Multi-facility/multi-instrument labs (the same real, general
  concern this app already takes seriously for `scanStations`,
  `printerProfiles`, and `hardwareContainers`, all of which are real,
  facility-scoped entities) have no way to know which instrument
  belongs to which lab/location.

## Real, recommended fix shape (not built here — this is a bug filing, not a fix)

A new `services/instruments/` folder, following this app's own
established interface/mock/firestore pattern, with a real
`Instrument` entity — `id`, `name`, `instrumentId` (the real, stable
code currently free-typed as `targetInstrumentId`), and a real
`stationId` and/or `facilityId` link, mirroring `ScanStation`'s own
shape. `MolecularBatch.targetInstrumentId` would then reference a real
`Instrument.id` (or its stable code) rather than an arbitrary string —
**exactly the same real fix this app's own Molecular module already
made once before, for a sibling field**: `README.md`'s own Phase 22
entry converted `MolecularBatch.assayCode` from a free-typed string
into a real reference to the existing Diagnostic Catalog, after
confirming the same real, concrete risk (a typo silently defeating
`resolveMolecularControlRequirementValidation.ts`'s own safety check).
`targetInstrumentId` is the same real pattern, unaddressed.

## Scope note

Filed as a bug per direct request — not investigated further or
fixed as part of this pass. A real effort estimate and full design
(e.g. whether every existing molecular batch's own real
`targetInstrumentId` values need backfilling into the new dictionary,
whether this becomes a Tier 1/Tier 2 cascade like other facility-
scoped entities) is real, separate work for whoever picks this up.
