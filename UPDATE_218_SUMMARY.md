# PathScribe Update 218 — Summary

The real PAD/FAD signing action — this codebase's own, previously-missing "Phase 5" piece. Before this, `AutopsyReportSnapshot` (`padSnapshot`/`fadSnapshot`) was only ever *read* (by `resolveAutopsyBodyReleaseGate.ts` and `resolveAutopsyBodyAlreadyReleased.ts`) — nothing anywhere ever wrote one.

## What changed

1. **New: `signAutopsyReport.ts`** — the real signing action, for both PAD and FAD (one function, parameterized by tier, to avoid duplicating the countersign check). Follows `releaseAutopsyBody.ts`'s own established fetch → check → gate → persist shape:
   - Real ordering guard: an FAD can never be signed before a real, signed PAD exists.
   - Reuses `resolveResidentCountersignRequired.ts` (built for the Cytology countersign fix) — the exact same decision, not a third copy of the logic. A resident's or FPPE provisional hire's own sign-off is intercepted into a real `CountersignRecord`, never producing a snapshot directly.
   - When not intercepted: writes the real `AutopsyReportSnapshot` to `padSnapshot` or `fadSnapshot`. Signing the FAD also transitions `CaseStatus` to `finalized` — the case's real terminal event. Signing the PAD deliberately does not touch `CaseStatus` at all — matching `resolveAutopsyBodyReleaseGate.ts`'s own design, which already reads `padSnapshot` directly, never any `CaseStatus` value. 9 tests.

2. **`CountersignRecord`, `ICountersignService`, `mockCountersignService`** — added an optional `autopsyReportTier?: 'PAD' | 'FAD'` field, set only by this new Autopsy flow. Without it, an attending's eventual countersign completion would have no way to know whether a pending release was for a PAD or an FAD — a real, separate release can happen for each, weeks apart, on the same case.

3. **`SynopticReportPage.tsx`** — the real UI trigger: "Sign PAD" appears once authorization is complete and no PAD exists yet; "Sign FAD" appears once a PAD exists and no FAD does. Thin — calls `signAutopsyReport()` and re-fetches the case; no logic duplicated in the component.

## Verified end-to-end, live
Walked a real case through Accession → Complete Authorization → Sign PAD in the running app. Confirmed: the PAD banner correctly disappeared and was replaced by a real "Ready to Sign FAD" banner showing the actual signing user and date ("PAD signed 9/15/2026 by Pete Nimmo"), and — as a genuine bonus confirmation — the "Ready for Body Release" banner (built earlier this session, never testable until now since nothing wrote a `padSnapshot` before) correctly appeared too, confirming that gate reads the new snapshot correctly.

## Verification
`tsc` clean. Full suite: 431 files, 3732 tests, all passing (up from 430/3723 — one new test file, 9 new tests).

## Known, real follow-on — not built here
The attending's own "review a pending Autopsy countersign and complete it" UI does not exist yet. `countersignService.countersign()`/`.reject()` are real and already used by Surg Path's `useSignOutWorkflow.ts`, and are generic enough to reuse — but that hook is Surg-Path-only, so Autopsy's own release-for-countersign path (built here) currently has no attending-facing completion screen yet. Flagging this explicitly rather than leaving it silently incomplete: a resident's or FPPE hire's PAD/FAD release today correctly reaches `pending-countersign`, but nothing yet lets the attending actually finish that review for an Autopsy case specifically.
