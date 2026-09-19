# PathScribe Update 236 — Summary

Real, verbatim "previously reported as" text for corrected reports — audited explicitly, and carried into the outbound dispatch. Per direct correction: the system constructs nothing here. The prior Final Diagnosis text simply *is* the previously-reported-as statement; this update makes sure that real, existing text is captured, audited, and forwarded, not diffed or reworded.

## What was checked before building anything

Confirmed the raw data already existed, in two places, before assuming anything needed inventing:
- `AmendmentRecord.originalReportSnapshot` — captured at Stage 1 of every real amendment (before any editing happens), and it's a full spread of the original instance, which means the prior `instance.comment` (the Final Diagnosis text) was already sitting there, verbatim, for every real correction. Confirmed `amendmentService.release()` already returns the full record — no separate fetch needed.
- `ReportVersionRecord.synopticAnswersSnapshot` — a complete per-version snapshot, available for every real version, not just ones that triggered the separate, narrower `FieldLineage`/"Delta step" mechanism (which only fires when multiple prior versions exist and a field was actively overridden — confirmed that's a much rarer case than "any correction at all").

## What changed

- **`useAmendmentWorkflow.ts`**: the correction/amendment release path now reads `amendmentReleaseRes.data.originalReportSnapshot.comment` — the real, prior Final Diagnosis text, verbatim — and reads the real, current `activeInstance.comment` as what it was corrected to. Both now go into the `amendment_released` audit log entry as explicit `previouslyReportedAs`/`correctedTo` fields, not buried inside an opaque snapshot. No diffing, no reconstruction — just the two real values, side by side, in the audit trail.
- **`buildOruR01Payload.ts`**: new `narrative.previouslyReportedAs` field, accepted as a parameter (the function itself has no way to know a "before" state — it only reads the current, live case) and included only for a genuine CORRECTED dispatch. Never populated for FINAL or ADDENDUM — an addendum adds supplemental content, it doesn't replace prior text.
- **`dispatchAmendedCaseInstance.ts` / `publishReportReleasedEvent.ts`**: both gained the same field, threaded straight through with no transformation, so the real, prior text makes it from the amendment record all the way to the outbound ORU^R01 message.

## Verification
`tsc` clean throughout. Full suite: 441 files, 3850 tests, all passing (up from 441/3842 — 8 new tests: 4 in `buildOruR01Payload.test.ts`, 1 forwarding test in each of `dispatchAmendedCaseInstance.test.ts` and `publishReportReleasedEvent.test.ts`, 2 in `useAmendmentWorkflow.test.ts` covering the audit log and the outbound-dispatch forwarding respectively). 4 existing tests updated for the new parameter position, not because their own real behavior changed.

## Honest scope
This only covers the real, existing correction path (Surg Path/Autopsy's shared `useAmendmentWorkflow.ts`) — the same one wired into Components A/B/C two updates ago. Cytology still has no amendment mechanism at all to carry this through, and Autopsy's own dedicated post-FAD `AutopsyAddendum` type still has no real service built on it.
