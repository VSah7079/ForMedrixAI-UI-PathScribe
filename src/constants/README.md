# src/constants/

Five files — voice/action registries, macros, and a manually-maintained
config search index.

## The real find: duplicate internalKeys in the keyboard/voice dispatch registry

`systemActions.ts`'s own header states an explicit, documented
invariant: "Never reuse or reassign an internalKey even if an action
is removed." Checked whether that actually held — it didn't. 21
`internalKey` values were each assigned to two genuinely different
actions (two spots were even 3-way collisions) — e.g. `F17+PS001` was
shared by both `diagnosis.grossDescription` and `ai.diagnosisSuggest`,
two completely different commands. Since this key is what the
keyboard handler actually dispatches on, a real collision means the
system can't distinguish between the colliding actions.

Root cause, once mapped out precisely: an entire later block of
actions (`ai.*`, `delegation.*`, `synoptic.*`, `pool.*`) had
internalKeys identical to an earlier block — the pattern strongly
suggests the later block was copy-pasted from the earlier one as a
template and never renumbered.

**Fixed:** kept the earlier block's keys unchanged, assigned fresh,
sequential, genuinely non-conflicting numbers to the later block's
colliding entries, chosen by finding the actual highest existing
number already used in each `Fnn` block first — so the file's own
numbering convention stays intact. Verified via a script that
enumerates every `internalKey` in the file: 188 entries, 188 unique
keys, zero duplicates remaining.

**Real fix (PS-66, Sep 2026) — the cross-file question above, resolved.**
`services/actionRegistry/mockActionRegistryService.ts` imports
`ACTION_MAP` from this file, and in several places deliberately reuses
an existing action's key via `ACTION_MAP['x']?.internalKey` — a
legitimate alias pattern. This ticket's own description claimed 10
real collisions beyond that alias pattern; independent, exhaustive
re-verification (a full-file scan of both files' `internalKey`
literals, not a re-read of the ticket's own list) found **12**, not
10 — the ticket's scan missed `diagnosis.enterAddendum` vs.
`ENTER_ADDENDUM`, `synoptic.jumpNextRequired` vs. `FULL_VIEW`, and
`synoptic.markDeferred` vs. `TABBED_VIEW`, and one of its stated 10
(`F18+PS014`) was a false positive — already the legitimate alias
pattern, not a second hardcoded literal.

Per-key comparison of label, shortcut, and voice-trigger content (the
same judgment call the ticket itself asked for, not a mechanical
rename) resolved all 12: **9 were the same logical action defined
twice** — exact label matches (`ENTER_ADDENDUM`/`enterAddendum` =
"Enter Addendum", `CONFIRM_FIELD`/`confirmField` = "Confirm Field",
all four `GROSSING_*`/`grossing.*` pairs) or matching
shortcut+voice-trigger content despite different keys
(`NEXT_UNANSWERED`'s `Ctrl+Alt+U`/"next unanswered" matches
`synoptic.jumpNextUnanswered`'s own description) — now consolidated
via the alias pattern so the two files can't drift apart again.
**3 were genuinely different actions that had only accidentally
collided** (`SKIP_FIELD`/`FULL_VIEW`/`TABBED_VIEW` have zero matching
`systemActions.ts` counterpart anywhere in the file, confirmed by
grep) — renumbered to fresh keys (`F17+PS054`–`F17+PS056`) instead.
`ai.viewConfidence`/`override`/`reviewTriage`/`codeSuggest`/
`narrativeGenerate` moved to `F17+PS047`–`F17+PS051` and
`synoptic.confirmField`/`overrideField` to `F17+PS052`/`F17+PS053` to
free up the keys the consolidation needed — see `systemActions.ts`'s
own PS-66 comments for exactly which entries moved and why, and
`services/actionRegistry/README.md` for the mock-file side. A bounded
regression test (`mockActionRegistryService.test.ts`) now guards
against a hardcoded literal reintroducing a real cross-file collision.

**Still found, still not fixed — a separate, larger, purely-internal
question.** Resolving the 12 real collisions above required
renumbering 5 of the 21 internally-duplicated keys described earlier
in this file (`ai.viewConfidence` through `ai.narrativeGenerate`,
`F17+PS004`–`PS008`). The other 16 — `ai.diagnosisSuggest`/
`ai.grossAssist`/`ai.macroSuggest` (`F17+PS001`–`PS003`, colliding
with the `diagnosis.*` group) and the entire `F18+PS001`–`PS013`
`delegation.*`/`pool.*`-vs-`messages.*` overlap — remain exactly as
found: real, disclosed, and deliberately not touched here, since none
of them were part of this ticket's actual cross-file scope and fixing
them means the same consolidate-vs-renumber judgment call repeated 16
more times. Recommended as its own follow-up ticket rather than
folded into this one.

## The other four files

`computationalActions.ts`, `defaultMacros.ts`, `voiceProfiles.ts` —
clean, no issues. `configSearchIndex.ts` is a manually-maintained
search index for the Configuration page's search bar, with its own
honest, self-documented confidence levels (explicitly flags which
entries are "verified" against the Admin Guide vs. "placeholder"
best-guesses for tabs that were never documented) — a genuinely mature
pattern, not something needing correction here.

**Real, per direct follow-up ("did we work on this yet? Per-facility
Specimen Deficiencies" → the config search bug this surfaced): five
stale entries removed, one added.** Five `'verified'`-confidence
entries (LIS Integration Enabled/Endpoint/Owns Case Statuses, Allow
Post-Final Actions, Identifier Formats) pointed at screens confirmed
genuinely deleted (`components/Config/System/README.md`'s own
correction has the full account) — "verified" here meant grounded in
the Admin Guide at the time it was written, not a guarantee it stayed
current as the app changed underneath it. A new `sys-deficiencies`
entry was added — Specimen Deficiencies had zero index entry despite
being a real, live, built screen. This pass was deliberately scoped
to these six changes, not a full rebuild against the current nav —
this file's own maturity claim above still needs re-checking
periodically, not just trusted going forward.

**Real, per direct follow-up ("the top level search in config found
the entry, but when clicked on, it did not go to the setting"):
`ConfigSearchEntry` gained an optional `section` field.** Every
result previously navigated to the right top-level tab only — for
`system` (30+ sections), that usually landed nowhere near the actual
setting. `section` carries the exact `SystemSection` id
(`Config/System/index.tsx`'s own type) for entries with a confirmed
mapping — `sys-specimens`/`sys-subspecialties`/`sys-terminology`/
`sys-physicians`/`sys-flags`/`sys-delegation-types`/`sys-deficiencies`
all set it now. Left deliberately unset for `sys-jurisdiction`/
`sys-info` — neither is a real `SystemSection` sidebar item, and
guessing one would be worse than the honest tab-only fallback both
already had. See `components/Config/Search/README.md` for the
consuming side of this fix.

## Batch 329 (PS-63)

`systemActions.ts → DEFAULT_ROLE_PERMISSIONS` has sets for the new built-in roles **Template Author**, **Template Approver** and **Lab Director**. Each gets Configuration access and report-template configuration; Lab Director also gets the audit log. Which template actions each may take is decided by role id in `services/templates/templatePublishingRules.ts`, not by these sets.

## Batch 365 (PS-347)

`voiceProfiles.ts`: no Belgian Dutch (nl-BE) profile yet. Chrome's support for it couldn't be confirmed (see the comment above `NL-NL` and the Batch 365 changelog), so Belgian Dutch users dictate with NL-NL.

## Batch 369 (PS-355)

`DEFAULT_ROLE_PERMISSIONS` gains `QA Reviewer` (basic navigation) and `Superadmin` (every command). These are voice and keyboard commands, not access control; what those roles may do is their capabilities (`services/authorization/`).

## Batch 374

`DEFAULT_ROLE_PERMISSIONS` has command sets for the four new bench roles (basic navigation only). Commands aren't access control; screens are capabilities (`services/screens`).

- **Batch 378:** `grossing.complete` (Complete Grossing, F24+PS050) and `VOICE_CONTEXT.GROSSING` for the Grossing screen.
- **Batch 381:** `case.postComment` (F19+PS013) and `specimen.saveBiopsyArray` (F20+PS010).
- **Batch 380:** `specimen.saveEdit` (F20+PS009), `diagnosis.saveRevision` (F17+PS057) and `diagnosis.recordCriticalNotification` (F17+PS058): the report page's modal save buttons.
- **Batch 379:** `grossing.completeConfirm` (F24+PS051) and `grossing.completeCancel` (F24+PS052), answering the Grossing screen's "complete without a protocol?" confirmation.

- **Batch 382:** `diagnosis.recordDiscordance` (F17+PS059), `billing.confirmPostSignoutChange` (F24+PS053) and `billing.correctAppliedCode` (F24+PS054): the reconciliation, post-sign-out reason and applied-code correction modals' buttons.
