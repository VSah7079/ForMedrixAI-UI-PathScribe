# PathScribe Update 234 — Summary

Autopsy is now wired into the Report_Released_Event infrastructure (Components A, B, C).

## What was investigated first, and the key finding

Checked whether Autopsy needed the same kind of separate, extracted dispatch function Cytology needed (last update) — it didn't. `Case.synopticReports` is a universal, non-specialty-specific field (`types/case/Case.ts`), and an Autopsy case's own gross/tissue-submission specimens are real `SynopticReportInstance`s just like any Surg Path case. That means `dispatchCaseInstances.ts` and `dispatchPreliminaryCaseInstances.ts` — completely unchanged — already process an Autopsy case's own specimen dispatch correctly.

The real, narrower gap: `buildOruR01Payload.ts` didn't know to look at `caseData.autopsy`'s own real snapshot data (`padSnapshot`/`fadSnapshot`) for the actual report *content* — an Autopsy case never populates `Case.diagnostic`, which is what that function read exclusively before this change. And `signAutopsyReport.ts` never called the publish event at all — zero dispatch logic existed for Autopsy anywhere before this update.

## What changed

- **`buildOruR01Payload.ts`**: new `narrative.autopsySections` field — populated only when `caseData.autopsy` exists, reading the *correct* real snapshot for the dispatch's own `resultState` (PAD's own frozen sections for a PRELIMINARY dispatch, FAD's for FINAL — never falls back to the other, even when both exist). Kept as its own, dedicated field rather than force-mapped onto Surg Path's fixed `grossDescription`/`microscopicDescription` fields, since an autopsy report's own real section labels are variable, not a fixed set. 4 new tests.
- **`signAutopsyReport.ts`**: after a real PAD or FAD snapshot is genuinely persisted (never for a provisional-hire sign that gets intercepted for countersign — there's no real snapshot yet to report in that case), calls `publishReportReleasedEvent`. PAD signs as `PRELIMINARY` (an interim milestone — matches this file's own, already-established "PAD never changes CaseStatus" posture); FAD as `FINAL` (the case's own real terminal event). Accepts an optional `generatePdf` callback, same established pattern as `releasePreliminaryReport.ts`. 4 new tests.
- **`SynopticReportPage.tsx`**: the Sign PAD/Sign FAD handler now passes its own real `generateReportPdfSnapshot` through — the same real PDF mechanism Surg Path's own Preliminary release and Final sign-out already use, since Autopsy cases are viewed and signed on this exact same page.

## Real, immediate effect
An Autopsy case now genuinely passes through Component B (print) and Component C (delivery rules) for the first time, exactly like Surg Path and Cytology. Because Autopsy reuses the real, existing `SynopticReportInstance`/PDF-generation infrastructure rather than needing anything new, its print path is already fully real today — unlike Cytology, there's no separate, known PDF gap left here.

## Verification
`tsc` clean throughout. Full suite: 440 files, 3831 tests, all passing (up from 440/3823 — 8 new tests across 2 files). Not verified live in the browser this turn — no seeded Autopsy case exists in this environment (Autopsy cases are created fresh via the Accession flow), and reaching a genuine PAD/FAD sign-out through browser automation would need building one from scratch first. Relying on the direct, layered unit coverage: `buildOruR01Payload.test.ts`'s new tests confirm the right snapshot is read for the right dispatch type, and `signAutopsyReport.test.ts`'s new tests confirm the publish call fires correctly (or doesn't, for a countersigned release) with the right report type and arguments.

## Still ahead
The Batch Headers & Cover Pages spec is the next, separate piece — the last item from several turns ago that hasn't been started yet.
