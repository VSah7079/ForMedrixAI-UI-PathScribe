# PathScribe Update 214 — Summary

Covers everything since update-213. All files are drop-in replacements under `src/` — no deletions this time.

## 1. Real bugs found and fixed from direct feedback on the running app
- **Surg Path branch showing Cytology cases, wrong counts** — root cause: every cytology specimen the seeded cases reference (`sp-cyto-pap`, `sp-cyto-hpv-self`, `sp-fna-thyroid`) pointed to specimen dictionary entries that didn't exist at all. Added the 3 missing entries with correct categories (`mockSpecimenDictionaryService.ts`). Verified directly: zero cytology cases now leak into Surg Path; branch counts add up exactly.
- **DP and Non-GYN/FNA columns blank** — both `mockWsiScanBatchService.ts` and `mockAiScreeningResultService.ts` had zero seed data. Added realistic entries against real, existing cases (prostate biopsy — Gleason 4+3, Ki-67; breast mastectomy — QC failure + ER/PR/HER2; a GYN cytology case). All badges verified rendering real data.
- **34" monitor column-width trouble** — the worklist table's `<colgroup>` only defined 11 `<col>` widths, but the table has 12 actual columns (the two DP columns from a prior update were never added to it). Fixed and reordered.
- **Column order** — MRN, Sex, DOB (Age), Accession, Physician, then Specimen(s) and the rest, per direct spec.
- **Worklist scroll-position glitch** ("shifts right, then back left" when scrolling immediately after opening) — confirmed via direct Playwright measurement that real case data continues loading asynchronously after initial render, which can make a vertical scrollbar appear mid-scroll and shift available width. Fixed with `scrollbar-gutter: stable` on `.wl-table-scroll`, which permanently reserves that space so the scrollbar's appearance/disappearance can no longer shift anything.

## 2. Test fix — `AccessionPage.e2e.test.tsx`
A genuine, multi-layered gap in the test itself (not the app), found and fixed by direct isolation:
- `caseInfoValid` also requires Submitting Facility and Requesting Provider, neither of which the test filled in.
- The facility dropdown only populates via a real async fetch — needed a `waitFor`, since setting a value before the fetch resolves is a silent no-op against a `<select>` with no matching `<option>` yet.
- The provider-selection option uses `onMouseDown`, not `onClick` — `fireEvent.click()` doesn't dispatch a `mousedown` on its own.
- `autopsyFormValidation` also requires Jurisdiction and Case Authority, which only render on the "Case & Patient" tab — but can't be filled in until an Autopsy specimen is selected on the "Specimens" tab first, requiring a tab-switch mid-test.
- The final tab-switch-back needed a non-exact matcher, since the tab's own label changes from "Specimens" to "Specimens (1)" once a specimen is added.

## Full test status
428 test files, 3710 tests, all passing. `tsc` clean throughout.
