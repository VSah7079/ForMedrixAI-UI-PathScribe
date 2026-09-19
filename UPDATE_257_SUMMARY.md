# PathScribe Update 257 — PS-286: Slide Distribution Station

Third of the confirmed PS-284 → 285 → 286 → 287 → 288 workstation-build
sequence. This update covers PS-286 only: the post-staining distribution
bench — continuous-scan checkout of finished, physical slides either to a
pathologist (physical checkout) or a digital scanner (WSI ingestion), with
split-destination warnings and a scan exception log.

## What was built

### Types & data model
- `types/case/Specimen.ts` — `StainOrder` extended: `distributionDestination`
  (`'physical' | 'digital'`), `distributionStatus` (`'Assigned' | 'Checked
  Out' | 'In Scanning Queue' | 'Loaded on Scanner'`), `assignedPathologistId`/
  `assignedPathologistName`, `assignedSubspecialtyId`, `physicalLocation`
  (`slideFolderId`/`trayNumber`/`courierBagId`), `scannerAssignment`
  (`scannerInstrumentId`/`rackId`/`slotPosition`), `activeExceptionReason`,
  `distributionEvents` (new exported `SlideDistributionEvent[]` — a real,
  append-only chain-of-custody log, same reasoning `Case.caseComments`
  already established for why an audit trail needs to be append-only).

### Pure business logic
- `utils/slideDistributionOperations.ts` (+ test, 13 tests) —
  `assignPhysicalSlide`, `assignScannerSlide`, `flagSlideException`/
  `resolveSlideException`, `recordLabelReprintRequest`,
  `resolveSplitDestinationWarning`. Constant: `SLIDE_EXCEPTION_REASONS`.

### UI
- `pages/SlideDistributionStationPage/` — new folder: the page itself
  (an always-visible continuous-scan input, no scan-to-clear state
  machine), three components (`QueuePanel`, `ScanCenterPanel`,
  `DestinationControlPanel`), and `hooks/useSlideDistributionStation.ts`.
  Architecturally different from the other two workstations: a real
  continuous-scan **queue** that can span multiple cases at once (per-case
  version tracking, not a single shared counter), rather than one work item
  at a time.
- `pathscribe.css` — new `.ps-slidedist-*` class family, matching the
  series' own dark palette/spacing, plus genuinely new shapes this bench
  needed (queue-row list, destination toggle, quick-picker search grid,
  schematic "occupied slots" chip grid).
- `App.tsx` — new route `/workstations/slide-distribution`.
- `Home.tsx` — new nav tile (`home.slideDistributionTile.*`).

## Investigation done before building (confirmed, not assumed)

- `WsiScanBatch`/`WsiScanSlide` already tracks the *digital scan outcome*
  once a slide reaches a scanner, but has no physical-routing concept and
  identifies slides only by `caseId`/`specimenId`/`slidePosition`, never a
  real `StainOrder.id` — genuinely complementary to this update's own
  `StainOrder`-level fields, not a duplicate.
- No slide-level pathologist/subspecialty field existed anywhere before
  this change (only case-level `Case.assignedTo`/`Case.subspecialtyId`).
- `services/subspecialties/`'s real `Subspecialty.userIds` is the reused
  precedent for the pool quick-picker; individual pathologists come from
  `userService.getAll()` filtered to `roles.includes('Pathologist')`.
- `HardwareContainer` tracks *staining* racks bound to a whole `Batch`
  (`Available`/`InUse`) — a real, adjacent pattern, but for a different
  real object than an individual output slide's own carrier, so not
  reused here.
- `cerebroAdapter.ts` confirms general chain-of-custody tracking is real
  context but genuinely not yet implemented pending a field-verified
  integration guide. **Deliberate decision**: build a real, PathScribe-
  native append-only log now rather than wait on that integration.
- **No rack/tray-to-slide-membership data model exists anywhere in this
  app.** "Batch Container Recognition" is scoped honestly to real,
  existing data instead of a fabricated container model: scanning an
  individual slide barcode queues that one slide; scanning a block/
  cassette barcode queues every real slide already cut from that block.

## i18n

Built with `useTranslation()`/`t()` from the start (new page). New
`slideDistribution.*` namespace plus `home.slideDistributionTile.*`,
across all five locale files (en/fr/de/nl/ko). Verified programmatically —
not by eye:

- All five locale files parse as valid JSON.
- All five have **identical key sets**: 735 leaf keys total per file, 47 of
  them under `slideDistribution.*`/`home.slideDistributionTile.*` combined,
  matched exactly across every locale.

## READMEs updated in the same pass

- `pages/SlideDistributionStationPage/README.md` (new)
- `pages/README.md` (new subfolder-index row)
- `i18n/README.md` (new "Sixth real conversion" entry)
- `services/users/README.md` (new real-consumer note)
- `services/subspecialties/README.md` (new real-consumer note)

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **467/467 test
  files, 4075/4075 tests passing, zero failures** (same harmless
  `ECONNREFUSED 127.0.0.1:3000` stderr noise as every prior run this
  session, unrelated to test pass/fail).
- New tests, `slideDistributionOperations.test.ts`: **13/13 passed.**

### Known project gotcha (re-encountered, not new)

Three separate `if (!result.ok) { ... result.error }` sites in
`useSlideDistributionStation.ts` failed to narrow under this project's
`strictNullChecks: false` — same class of failure documented in
`services/reports/README.md` and hit again in both PS-284 and PS-285.
Fixed the same way as PS-285: an explicit type cast
(`(result as { ok: false; error: string }).error`) at each site.

## Deliberate scope cuts

- No `MatrixBlock`-level slides.
- No formal scanner-instrument registry — free-text `scannerInstrumentId`,
  same honest convention `WsiScanBatch.scannerInstrumentId` already uses.
- No real rack/tray container model (see Investigation above).
- Split-Destination Warnings scoped to one block, not the whole accession —
  same real scope-cut precedent PS-285's own split-block tracking
  documents.
- **Physical foot-pedal integration is explicitly deferred, not
  dropped.** Per direct instruction received during this update: foot
  pedals are ubiquitous lab hardware and support is required — this is
  now the next real item to address once PS-288 is delivered, tracked
  here so it isn't lost across the series.

## Next

PS-287 (narrowed scope), PS-288 (built in the same pass) — each following
this same full workflow. **Then: physical foot-pedal integration**, per
direct instruction.
