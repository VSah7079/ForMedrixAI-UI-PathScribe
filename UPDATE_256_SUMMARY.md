# PathScribe Update 256 — PS-285: Embedding Station

Second of the confirmed PS-284 → 285 → 286 → 287 → 288 workstation-build
sequence. This update covers PS-285 only: the sibling bench workstation to
PS-284's Microtomy Workstation — cassette scan/verify, piece-count
verification against grossing, one-touch discrepancy reporting, base mold
size + orientation selection, multi-cassette/split-block tracking, and
on-demand cassette-label reprint with a mandatory reason.

## What was built

### Types & data model
- `types/case/Specimen.ts` — `HistologyBlock` extended: `moldSize`
  (`EmbeddingMoldSize`), `orientationInstructions`, `splitBlockGroupId`,
  `lastDiscrepancyReason`/`lastDiscrepancyReportedBy`/
  `lastDiscrepancyReportedAt` (`EmbeddingDiscrepancyReason`),
  `lastCassetteReprintReason`/`lastCassetteReprintOrderedBy`/
  `lastCassetteReprintOrderedAt`/`cassetteReprintCount`
  (`CassetteReprintReason`). Deliberately did **not** extend `MatrixBlock.ts`
  — same scope cut PS-284 made, kept consistent across the series.

### Pure business logic
- `utils/embeddingOperations.ts` (+ test, 17 tests) — `confirmPieceCount`,
  `flagEmbeddingDiscrepancy`, `setMoldAndOrientation`, `groupSplitBlocks`/
  `resolveSplitBlockGroupStatus`, `recordCassetteReprint`,
  `addEmbeddingBlockComment`, `resolveEmbeddingAlertBadges`. Constants:
  `EMBEDDING_DISCREPANCY_REASONS`, `CASSETTE_REPRINT_REASONS`,
  `EMBEDDING_MOLD_SIZES`, `EMBEDDING_ORIENTATION_QUICK_FILLS`.
- Reused `setBlockAlertFlags` from `utils/microtomyOperations.ts` (Tiny
  Tissue/Fragile/Decal Required toggle) rather than duplicating it — it's a
  genuinely generic `HistologyBlock` operation with no microtomy-specific
  meaning.

### UI
- `pages/EmbeddingStationPage/` — new folder: the page itself, three
  components (`EmbeddingCenterPanel`, `CassettePrintPanel`,
  `CommentDrawer`), and `hooks/useEmbeddingStation.ts` (real persistence,
  scan resolution — block/slide targets only, real cassette GS1/ZPL
  print-dispatch chain, and raises the real, existing
  `def-tissue-discrepancy` deficiency via `specimenDeficiencyService` on a
  genuine piece-count mismatch or a one-touch discrepancy flag — the exact
  same mechanism/comment wording `useSpecimenBlockManagement.ts`'s own
  `handleUpdateBlock` already uses).
- `pathscribe.css` — new `.ps-embedding-*` class family, built to visually
  match `MicrotomyWorkstationPage.tsx`/`GrossingScreenPage.tsx` (same
  header/back-button pattern, same `ps-overlay`/`ps-modal-dark` modal
  convention, same dark palette), per the same direct visual-consistency
  guidance PS-284 followed.
- `App.tsx` — new route `/workstations/embedding`, in the same
  non-case-scoped, `ScannerProvider`-wrapped route group as
  `/workstations/microtomy`.
- `Home.tsx` — new nav tile (`home.embeddingTile.*`), converted the same
  "convert only what you touch" way as the Microtomy tile before it. Real,
  honest note: the intended accent color collided with the existing Search
  tile's `#CC79A7` (caught by this file's own real regression test —
  "every card has a genuinely distinct color"), so a distinct, non-Wong-
  palette orange (`#F97316`) was used instead.

## Design notes

- **Multi-Cassette / Split-Block Tracking is the opposite concept from the
  pre-existing `sharedCassetteId`** (multiple *specimens* sharing one
  cassette): the new `splitBlockGroupId` covers one *specimen's* tissue
  split across several cassettes (A1/A2/A3). The two are never conflated.
- **Biopsy/Needle Core alert badges are deliberately not new stored
  booleans** — derived live from the specimen's own linked
  `SpecimenEntry.type`/`procedure` (looked up once per work item), never a
  second, driftable copy of a fact the dictionary entry already states.
- **"Audit Triggers: routes an alert to the histotechnology supervisor"**
  is implemented as the real, existing `def-tissue-discrepancy` deficiency
  landing in the real, existing QA working queue (`QualityAssurancePage.tsx`)
  supervisors already monitor — not a new, separate paging channel.
- The mandatory reprint-reason prompt is a real `ps-overlay`/`ps-modal-dark`
  modal owned by the page (same "child requests, parent owns the modal"
  shape as Microtomy's own remove-reason flow), not a bare inline dropdown.

## i18n

Built with `useTranslation()`/`t()` from the start (new page). New
`embeddingStation.*` namespace plus `home.embeddingTile.*`, across all five
locale files (en/fr/de/nl/ko). Verified programmatically — not by eye:

- All five locale files parse as valid JSON.
- All five have **identical key sets**: 688 leaf keys total per file, 61 of
  them under `embeddingStation.*`/`home.embeddingTile.*` combined, matched
  exactly across every locale.

## READMEs updated in the same pass

- `pages/EmbeddingStationPage/README.md` (new)
- `pages/README.md` (new subfolder-index row)
- `i18n/README.md` (new "Fifth real conversion" entry)

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **466/466 test
  files, 4062/4062 tests passing, zero failures** (some harmless
  `ECONNREFUSED 127.0.0.1:3000` stderr noise, unrelated to test pass/fail —
  same as every prior run this session).
- New tests, `embeddingOperations.test.ts`: **17/17 passed.**

### Known project gotcha (re-encountered, not new)

`handleReprintCassette`'s `if (!recorded.ok) { ... recorded.error }` failed
to narrow under this project's `strictNullChecks: false` — same class of
failure already documented in `services/reports/README.md` and hit again in
PS-284's own `markStainPrintResult`. Fixed with an explicit type cast
(`(recorded as { ok: false; error: string }).error`) rather than a single
optional-field shape this time, since `EmbeddingOperationResult` needed to
stay a real discriminated union for its other, successfully-narrowing call
sites.

## Deliberate scope cuts (matching PS-284's own precedent)

- No `MatrixBlock`-level scan resolution or embedding — a cassette shared
  by multiple specimens is a genuinely separate data shape
  (`types/case/MatrixBlock.ts`), not covered here.
- No foot-pedal support.
- Cassette label preview is a schematic illustration (deterministic
  pattern, not a real decodable barcode) — same honest posture as
  `HardwarePrintPanel.tsx`'s own slide preview.
- No action-registry/voice wiring for this new bench.

## Next

PS-286, then PS-287 (narrowed scope), PS-288 (built in the same pass) —
each following this same full workflow.
