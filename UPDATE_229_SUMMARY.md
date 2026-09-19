# PathScribe Update 229 — Summary

Component B: the Print Queue Engine, from the "Decoupled Dispatch & Print Management System" spec. Both real delivery modes built, wired as a genuinely concurrent second subscriber to last update's `ReportReleasedEvent`.

## Key finding before building

Checked whether the spec's two modes are actually buildable from a browser-based app before assuming either was structurally impossible. Mode 1 (Native Spooler) turned out to be genuinely buildable: QZ Tray — already integrated in this app for cassette/slide label printing — has a real, documented PDF/pixel data type, not just raw ZPL. TSC's own type-checking against the installed `@types/qz-tray` package caught and corrected the exact real API shape (`type: 'pixel', format: 'pdf', flavor: 'base64'`), so this is a genuine, type-checked integration, not a guessed one.

A separate, honest structural limit surfaced too: the real PDF renderer (`generateReportPdfSnapshot`) lives inside `SynopticReportPage.tsx`'s own React closure, not callable from any background function — the same limitation `buildOruR01Payload.ts` already documented for narrative text. Followed the same, established pattern: an optional callback, threaded through from whichever real caller actually has it.

## What changed

- **`types/printing/PrintJob.ts`** — mirrors `OutboundResultQueueEntry`'s already-established queue/retry/error-code shape, not a new pattern.
- **`IPrintQueueService.ts` / `mockPrintQueueService.ts`** — the real, persisted print queue (enqueue, retry, mark-failed with a real audit log, mark-printed), mirroring `mockOutboundResultQueueService.ts`'s own proven implementation.
- **`qzTrayBridge.ts`**: new `printPdfViaQzTray` — Mode 1, the real, native path.
- **`dispatchInterfaceMessage.ts`**: added `'PRINT_JOB'` to the transaction-type union — Mode 2, the Interface Engine hand-off.
- **`IFacilityService.ts`**: minimal `Facility.printDeliveryConfig` (enabled/mode/printerName) — deliberately not the full Delivery Configuration Rules Engine from the same spec (provider/location/report-type action matrix), which stays separate, explicitly deferred work. Just enough real config to make Component B itself usable and testable.
- **New: `dispatchPrintJob.ts`** — the real function tying it together. Resolves a facility's config, routes to whichever mode, and fails a job honestly (`PRINTER_OFFLINE`, `PRINTER_UNREACHABLE`, `PRINT_REJECTED`) rather than throwing — per the source spec's own Use Case 2 ("holds the job, alerts the administrator, re-attempts... without blocking the electronic HL7 interface"). 11 tests covering every real branch of both modes.
- **`publishReportReleasedEvent.ts`**: print dispatch now runs via `Promise.all` alongside electronic dispatch — genuinely concurrent, per the source spec's own architecture, not sequential. A print failure is caught and reported as an honest `printOutcome: 'failed'`, never allowed to break the whole publish call or mask electronic dispatch. New `priority` field on the event, for the source spec's own Use Case 3 (Emergency/High-Priority).
- **`releasePreliminaryReport.ts` / `SynopticReportPage.tsx`**: threaded the real `generatePdf` callback and the case's own real performing facility through, end to end, so the "Release as Preliminary" button (built two updates ago) can now genuinely produce a printable PDF for Component B to act on.
- **`DemoResetTab.tsx`**: registered the new `print_queue_v1` key — and, while in there, corrected an earlier placement mistake: last update's `reportReleasedEventLog` had been filed under admin-config keys; moved it to the accumulating-queue/log list where it actually belongs.

## Verification
`tsc` clean throughout. Full suite: 436 files, 3789 tests, all passing (up from 435/3772 — 17 new tests across 2 new test files, plus the existing `releasePreliminaryReport.test.ts` extended for the new parameter). Verified live in the running app: the "Release as Preliminary" button — whose call signature changed — still works with no regressions and no page errors.

## Honest scope — what this is not
No facility has `printDeliveryConfig` set in seed data yet, and there's no admin UI to set it — this update built the engine itself, not its own settings screen (matching how `ConcordanceReviewSettingsSection.tsx` needed its own, separate UI build earlier). QZ Tray itself is a real, external desktop application; its actual print behavior can't be exercised in this sandbox regardless of UI — the 11 tests on `dispatchPrintJob.ts` are the real coverage for both modes' logic. The Delivery Configuration Rules Engine (the full provider/location/report-type action matrix) remains separate, deferred work, as does Cytology's continued disconnection from this entire event/dispatch infrastructure.
