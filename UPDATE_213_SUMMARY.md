# PathScribe Update 213 — Summary

Covers everything built since update-212. All files are drop-in replacements/additions under `src/` — merge into your local tree, and see `DELETED_FILES.txt` for the 3 files to remove manually (an orphaned, verified-dead-code duplicate found and cleaned up along the way; a zip can't delete files on its own).

## 1. Autopsy — full UI wiring audit and closure
- `AutopsyAuthorizationCompletionForm.tsx` and the (already-shipped) `AutopsyBodyReleaseForm.tsx` mounted for real in `SynopticReportPage.tsx` — both existed with complete logic but zero real UI callers before this pass.
- `getMainBodySpecimen.ts` — centralizes the "which specimen is the body" heuristic (Specimen "A"), replacing duplicated inline logic.
- `resolveAutopsyBodyAlreadyReleased.ts`, `formatAutopsyTatSlaSummary.ts`, `formatConsentingRelativePriorityHint.ts`, `filterAutopsyTemplateToActiveSections.ts` — closed 6 confirmed "logic exists, zero UI callers" gaps (accession status badge, TAT/SLA display, consenting-relative priority hint, HTA-gated organ retention tier field, which didn't even have an input to set it).
- New Asset Location Dictionary admin screen (`AssetLocationDictionarySection.tsx`) — the mortuary storage_slot tracking this needed had no admin UI at all; now has a Dictionary tab and a live Mortuary Storage Occupancy tab.
- Cassette routing rule added for the previously-uncolored `proto-autopsy-cardiac-sectioning` protocol.
- Config search index entries added so "autopsy"/"mortuary" searches actually surface something.
- `ProtocolDictionarySection.tsx` — `defaultCount`/`defaultPieceCount` admin fields + spreadsheet round-trip.

## 2. Digital Pathology — architecture cleanup + 5 type-level gaps closed
- Deleted a genuinely orphaned, verified-dead-code duplicate: `services/cytology/IWsiScanBatchService.ts` + its mock (see `DELETED_FILES.txt`). The real, live version lives under `services/digitalPathology/`.
- `WsiScanSlide` extended with `acquisitionMode`/`focalPlaneCount` (Z-stack vs. single-plane — Cytology vs. Surgical Pathology's genuinely different scanning physics) and `qcPassed` (distinct from scan status — a slide can scan successfully but still fail image QC).
- `AiSlideTriageSummary` extended with `triageLevel`/`primaryFinding` (the real 3-level system Paige/Ibex report, vs. BD FocalPoint's binary gate — kept as two genuinely different shapes, never conflated).
- `AiScreeningResult` extended with `biomarkers[]` (Ki-67, HER2, PD-L1 TPS, etc.).
- `resolveDigitalPriorCounts.ts` — digital vs. glass prior case counts, reusing the existing patient-identity resolver rather than inventing a second one.
- `WsiScanStatusUpdateEventPayload` extended to match, and the inbound processor updated to pass the new fields through untouched.

## 3. Surgical Pathology DP Worklist — grid, drawer, badges
- `resolveWorklistDpBadges.ts` — reconciles the three different real vendor shapes into one honest Digital Readiness badge and one DP AI Triage badge (never overclaiming — e.g. a binary "review recommended" gate maps to "equivocal," never "high risk," since that vendor never claimed malignancy).
- Two new columns added directly to the existing `WorklistTable.tsx` (not a second worklist) — compact badges, click-through to a new `SlideDetailDrawer.tsx`.
- Both badges render nothing at all for a case with no real DP data — never a fabricated placeholder.

## 4. Worklist navigation redesign
- **Branch tabs** — Surg Path / Cytology / Autopsy / All Cases (`resolveCaseDisciplineBranch.ts`), persisted, defaulting to "All Cases" so nothing changes for anyone who doesn't touch it. Selecting a branch narrows the case list *and* which specialty tiles show underneath.
- **GYN Cytology / Non-GYN Cytology-FNA tiles** (`resolveCaseHasSpecimenCategory.ts`) — closes a real, previously-deferred requirement ("I do not want to send the Pathologist to multiple worklist"). Only rendered inside the Cytology branch.
- **Autopsy grouping** — given low case volume, Autopsy cases group by accession status (Temporary Accession vs. Fully Authorized) via `autopsyGrouping.ts`, reusing the existing `WorklistTable.tsx` divider-row mechanism rather than new UI.
- **DP tile** — scoped to Surg Path/Cytology only (hidden for Autopsy, which has no real DP integration).
- **"New Cases" tracking** — new `caseViewTracking` service (`ICaseViewTrackingService`/`mockCaseViewTrackingService`), modeled directly on the messaging system's own `Message.isRead`/`isUrgent` pattern. Wired into both the mouse-click and voice-driven case-open paths. Tile color switches to red when a new case is also urgent, matching the messaging system's own `ps-unread-urgent` behavior.
- **Real bug fixed along the way**: `wsiSlidesByCaseId`/`dpResultByCaseId`/`viewedCaseIds` were missing from the main `filteredCases` memo's dependency array, meaning those filters could silently show stale results.

## 5. Voice commands — extended properly, not bypassed
Every new filter/action above has a full voice command in `mockActionRegistryService.ts` — English plus French/German/Dutch/Korean triggers, matching the app's existing standard, each checked against the shortcut-collision test (which caught and required fixing several real conflicts along the way):
- Read Digital Readiness, Read AI Triage, Open Slide Details
- Filter DP, Filter GYN Cytology, Filter Non-GYN Cytology/FNA, Filter Autopsy, Filter New Cases

## Full test status
427 test files, 3706 tests, all passing. `tsc` clean throughout.
