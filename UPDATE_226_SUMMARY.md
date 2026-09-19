# PathScribe Update 226 — Summary

`TemplateRoutingService` now selects Preliminary vs. Final templates by the case's real `CaseStatus` — the gap identified when summarizing PS-292's remaining work. Wired end-to-end and confirmed live in the running app.

## What changed

**`TemplateRoutingService.ts`** — added a new "Pass -1" (Preliminary status gate), reached before every existing pass, since Preliminary-vs-Final is more fundamental than which specific subspecialty Final template applies:

- New `resolveIsFinalStatus(status)` helper — checked the real `CaseStatus` lifecycle directly rather than assuming a simple `=== 'finalized'` check was correct. It wasn't: `pending-release` comes *after* `finalized` in the real sequence (its own doc comment confirms `Case.finalizedAt` is already stamped the moment a case enters it — the attending has genuinely completed sign-out, only external dispatch is held back for the recall window). Treating it as still-Preliminary would have been wrong. `resolveIsFinalStatus` returns true for `finalized`, `pending-release`, and `closed` — every earlier status, including `pending-countersign` (per PS-292's own explicit "stay strict" decision), stays Preliminary.
- `TemplateRoutingInput.caseStatus` is genuinely opt-in: an omitted value skips the gate entirely and resolution proceeds exactly as it did before this field existed. Found out why this matters the hard way — my first attempt defaulted "no status provided" to "assume Preliminary," which broke 6 of the file's own 9 pre-existing tests, all of which call this resolver without ever mentioning status. Fixed to match every other pass's own convention: an absent input skips that pass, it doesn't force an outcome.
- **A second, real, latent bug found and fixed along the way**: Pass 0 (facility override) never checked `if (!resolved)` before running — safe when it was always the first pass, but a live bug the moment a real pass could precede it. Without this fix, a case correctly routed to Preliminary by the new gate would have been silently overwritten by a facility override for its eventual Final template.
- Real, honest scope limit, stated directly in the code and here: resolves to the one real Surg Path Preliminary template (`tmpl-prelim-surgpath`) — this service is only ever called from Surg Path's own `contextBuilder.ts` today (Cytology's own disconnection from this system is a separate, already-flagged gap on PS-292). Does not yet support a facility-specific Preliminary override the way Pass 0 does for Final templates.

**`contextBuilder.ts`** — the one real caller now passes `caseStatus: caseData.status` into the resolver.

**`TemplateRoutingService.test.ts`** — 6 new tests: the `resolveIsFinalStatus` boundary directly, a non-final case correctly overriding even a matching facility override, `pending-countersign` staying Preliminary, `pending-release` correctly resolving as Final (the key edge case), `finalized` resolving normally, and an omitted `caseStatus` resolving exactly as before.

## Verification
`tsc` clean. Full suite: 432 files, 3754 tests, all passing (up from 432/3748 — 6 new tests). Verified live in the running app: opened an existing, real `intraoperative-complete` (not yet final) case's Report Draft tab and confirmed the rendered report now shows "PRELIMINARY REPORT — NOT FINAL DIAGNOSIS" with "Report Template: Preliminary Report — Surgical Pathology... resolved by preliminary status" — the real, new routing pass visibly winning, not just passing in isolation. The Ancillary Testing Status and Critical Value Log sections correctly stayed hidden with no placeholder text, confirming last update's `hideIfEmpty` fix is also working correctly in the live render.
