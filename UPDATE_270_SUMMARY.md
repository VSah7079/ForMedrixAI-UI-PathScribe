# PathScribe Update 270 — Windows changes the picture; test timeout raised to 20s

Your answer changed my model of what's actually happening: you're
running `npm test` directly on your own Windows machine (PowerShell),
not a CI runner. I'd been assuming "heavier CI load" as the reason a
fixed sleep, then a bounded poll, both failed to fully fix this on your
end — but there's no CI here at all. That points at something more
specific to Windows.

## The real, previously-unconsidered piece

This test's own imports are **dynamic**, inside the test body:

```ts
const { mockBatchService } = await import('./mockBatchService');
const { mockReferralOutboundQueueService } = await import('../referral/mockReferralOutboundQueueService');
const { mockReferralTrackingService } = await import('../referral/mockReferralTrackingService');
```

`mockBatchService.ts` alone pulls in **24 further real imports** of its
own. Because these are dynamic, not static, Vitest has no reason to have
already transformed this whole module graph before the test's own clock
starts — that transform cost is paid live, inside the test, counted
against its timeout. On Linux (this environment) that's fast and mostly
invisible. On Windows, Defender's real-time scanning plus NTFS overhead
is a well-documented, real source of multi-second stalls for exactly
this kind of Node/Vite file-transform-heavy work — nothing wrong with
your machine, just a genuinely slower path for this specific workload.

That's on top of the actual race this test is also checking (the
fire-and-forget referral dispatch, addressed by Update 269's polling) —
so on a slow Windows run, the cold-transform cost could plausibly eat
most of the original 5000ms budget before the polling even gets a
chance to do its job.

## The fix

Per Vitest's own error message ("pass a timeout value as the last
argument"): both tests in this file now get a real **20000ms** budget
instead of the 5000ms default. This doesn't mask a genuine hang — the
actual work stays bounded either way (the poll itself is still capped
at 3000ms) — it just stops a slow-but-legitimate run from being cut off
before it finishes. Kept Update 269's polling in place too; both
changes are independent and complementary.

## Still honest about this: I still can't reproduce the original failure

Every run here — 5 in a row last time, another clean run just now —
passes. This fix is my best reasoning from your new information, not a
verified reproduction. If it still fails on your machine after this, the
next most useful thing would be the **full timing breakdown** vitest
prints per file (`transform`/`setup`/`import`/`tests`/`environment` —
visible in the summary line, like the `261.89s` breakdown above) for
this specific file on your machine, which would show directly whether
transform time is really the culprit.

## One practical, unrelated tip

If Windows Defender is on and this project's folder isn't excluded from
real-time scanning, excluding it (Settings → Privacy & security →
Windows Security → Virus & threat protection → Manage settings →
Exclusions → add your `pathscribe-ai` folder) commonly speeds up *all*
Node/Vite work here, not just this test — worth trying regardless of
whether it fixes this specific timeout.

## To get your real test-file count in PowerShell

The `find`/`wc` commands I gave you are Unix-only — Windows PowerShell
equivalent:

```powershell
(Get-ChildItem -Path src -Recurse -Include *.test.ts,*.test.tsx).Count
```

Still curious whether that comes back as 476 (matches every count I get)
or something else — if it's something else, that's a separate, real
thing worth chasing down.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run src/services/batches/referralDispatchIntegration.test.ts`**:
  2/2 passing.
- **`npx vitest run --exclude firestore.rules.test.ts`** (full suite):
  476/476 test files, 4154/4154 tests passing.

## Files changed

- `src/services/batches/referralDispatchIntegration.test.ts` — both
  tests given an explicit 20000ms timeout; header comment updated with
  the Windows-specific reasoning.
