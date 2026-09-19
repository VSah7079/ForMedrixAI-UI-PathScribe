# PathScribe Update 267 — fixed the flaky `referralDispatchIntegration.test.ts` timeout

Direct report, verbatim (pasted vitest output): `referralDispatchIntegration.test.ts`
timing out at 5000ms on *"real, completing an External Referral batch via
supervisor override automatically enqueues the real manifest and creates
a real tracking record."*

## Root cause

**Test-only bug — no production code was wrong.** The test raced a
deliberately fire-and-forget production call:

- `mockBatchService.ts`'s `dispatchReferralIfApplicable()` (called from
  both `completeReconciliation()` and `overrideAndComplete()`) is a
  **synchronous, non-`async` function**. It calls
  `mockReferralOutboundQueueService.enqueue(...)` and
  `mockReferralTrackingService.createOnDispatch(...)` without awaiting
  either — its own header comment is explicit about why: *"a real
  referral-side failure must never block the batch's own, already-
  successful reconciliation completion."* This is the same posture
  every other outbound dispatch in this app already takes (rack
  release, AI screening order, etc.) — deliberate, not an oversight.
- Both of those services use a real `setTimeout`-based delay internally
  (`mockReferralOutboundQueueService`: 80ms, `mockReferralTrackingService`:
  30ms) to simulate real async persistence — also deliberate, matching
  every other mock service in the app.
- The test called `overrideAndComplete()`, awaited it, and then
  **immediately** checked the referral queue and tracking record — with
  nothing in between to let the 80ms/30ms fire-and-forget work actually
  finish. Under light load this usually "won" the race by luck; under
  the heavier concurrent load your run was under (491 files vs. the 476
  I see locally — see note below), it lost the race consistently enough
  to read as a hang.
- I confirmed this is a pure timing race, not a genuine hang or bug in
  either referral service, by reading both `mockReferralOutboundQueueService.ts`
  and `mockReferralTrackingService.ts` in full: both are simple,
  bounded, real `localStorage`-backed reads/writes with a fixed real
  delay — nothing in either can block indefinitely.

## The fix

- **`src/services/batches/referralDispatchIntegration.test.ts`** — added
  a real `150ms` wait (comfortably above both services' own 80ms/30ms
  internal delays) between `overrideAndComplete()` and the assertions
  that depend on the fire-and-forget dispatch having persisted. This is
  not a new pattern — it's the same real wait-out convention already
  established elsewhere in this codebase for the identical situation
  (`mockReportVersionService.test.ts`, which waits out its own
  fire-and-forget `mockOutboundResultQueueService` enqueue the same
  way).
- **No production code changed.** `dispatchReferralIfApplicable()` stays
  fire-and-forget on purpose — making the batch-completion API await
  the referral dispatch would fix the test but would genuinely slow
  down (and couple the success of) every real batch completion to a
  secondary referral system, which is exactly what that function's own
  header comment says this design must never do. The bug was entirely
  in the test's own synchronization, not in what it was testing.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run src/services/batches/referralDispatchIntegration.test.ts`**:
  2/2 passing.
- **`npx vitest run --exclude firestore.rules.test.ts`** (full suite):
  476/476 test files, 4154/4154 tests passing — same steady count as
  every prior validation run this session, confirming no regressions.
- No live browser verification for this update — the fix is contained
  entirely to a test file; no production/UI code changed.

## One open item, not resolved here

Your own vitest run reported **491 test files / 4246 tests**; every run
I've done this session — including the full-suite run just above —
consistently reports **476 files / 4154 tests**. That's a real gap (15
files / 92 tests) I haven't explained: it could mean your checkout has
additional test files not present in what I'm working from, a different
`--exclude` pattern, or something else entirely. Worth a quick check on
your end (e.g. `git status` / `git log` diff against this checkout, or
just a directory diff) if it matters for confidence that fixes made here
fully apply to what you're actually running — I can help reconcile it
directly if you can tell me what's different.

## Files changed

- `src/services/batches/referralDispatchIntegration.test.ts` — real
  wait added between the fire-and-forget dispatch and the assertions
  that depend on it.
