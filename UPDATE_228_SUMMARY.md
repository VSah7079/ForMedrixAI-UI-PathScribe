# PathScribe Update 228 — Summary

Component A refinement, from the "Decoupled Dispatch & Print Management System" spec: a real, centralized `ReportReleasedEvent` — every real release (Preliminary or Final) now flows through one, named publish point instead of each call site independently orchestrating its own dispatch.

## Design decision made before building

Three real call sites existed, each with its own inline dispatch logic: `useSignOutWorkflow.ts`'s immediate FINAL dispatch, `mockReportReleaseService.ts`'s buffer-expiry FINAL dispatch, and `releasePreliminaryReport.ts`'s own PRELIMINARY dispatch loop. Rather than rewriting the two, already-working, already-tested dispatch implementations (`dispatchCaseInstances.ts`'s FINAL loop, with its own strict one-time dedup; the Preliminary loop, deliberately with no dedup), the real, existing logic was kept intact and extracted/wrapped, not rebuilt — the new event layer is a thin, real router in front of proven code, not a risky reimplementation of it.

## What changed

- **New: `publishReportReleasedEvent.ts`** — the one, real, named publish point. Logs the event, then delegates by `reportType` to the real, existing dispatch function (`dispatchCaseInstances` for FINAL/CORRECTED/ADDENDUM, the newly-extracted `dispatchPreliminaryCaseInstances` for PRELIMINARY). This is the one real place a future print-queue subscriber would hook in — not something every call site would need to learn about individually.
- **New: `dispatchPreliminaryCaseInstances.ts`** — the Preliminary dispatch loop, extracted unchanged from `releasePreliminaryReport.ts`'s own original implementation, so both it and the new publish function share the exact same real logic rather than two, slightly different copies.
- **New: `mockReportReleasedEventLogService.ts`** — a real, persisted audit trail of every release event. Real, tangible value even before any second subscriber exists: before this, the only trace of a Preliminary release was a single, case-level, overwritten timestamp — not a real history of every release.
- **`releasePreliminaryReport.ts`**: keeps its own real guards (not-final check, orchestration-mode check) and the attestation-field write, but now calls `publishReportReleasedEvent` for the actual dispatch step instead of owning its own inline loop.
- **`useSignOutWorkflow.ts`** and **`mockReportReleaseService.ts`**: both real FINAL dispatch call sites now call `publishReportReleasedEvent` instead of `dispatchCaseInstances` directly.
- **`DemoResetTab.tsx`**: registered the new `reportReleasedEventLog` storage key — caught by the same, real coverage test as last time.

## Verification
`tsc` clean. Full suite: 435 files, 3772 tests, all passing (up from 433/3763 — 18 new tests across 3 new test files, plus the existing `releasePreliminaryReport.test.ts` rewritten to match the new, correct dependency chain). Notably, the two pre-existing test files for the FINAL call sites (`useSignOutWorkflow.test.ts`, `mockReportReleaseService.test.ts`) needed zero changes — their mocks of `dispatchCaseInstances` still intercept correctly, since `publishReportReleasedEvent` itself calls that same, real, mocked function one layer deeper.

## Honest scope — what this is not
Component B (the Print Queue Engine) and the Delivery Configuration Rules Engine from the same spec do not exist yet — this event has exactly one real subscriber today. Cytology's own release path (`CytologyScreeningPage.tsx`) is not wired to this event either, consistent with its already-flagged, separate disconnection from this app's broader reporting infrastructure.
