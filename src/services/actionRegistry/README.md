# services/actionRegistry/

Voice-command and keyboard-shortcut action catalog — the registry of every named system action (e.g. 'DELEGATE_FULL_TRANSFER') that voice commands and shortcuts can trigger.

**Pattern:** Standard interface/mock/firestore pattern.

**Real, honest gap, found while fixing the RFP-APLIS-2026-GLOBAL Multi-Language UI & Localization Framework's own voice-input BCP-47 bug (Sep 2026)**: this registry's own 191 real entries all carry English-only `voiceTriggers` phrases. The new French/German/Dutch/Korean voice *language* profiles (`constants/voiceProfiles.ts`) let the browser's speech engine correctly recognize spoken French/German/Dutch/Korean for free-text dictation, and `contexts/punctuationMaps.ts` covers spoken punctuation commands in those same four languages — but a navigation/action command spoken in one of these languages (e.g. "supprimer" for "delete") would not match any of this registry's own trigger phrases, since none had been translated.

**Update (Sep 2026) — the data model and matching logic are now real and built**: `SystemAction` gained an additive, optional `voiceTriggersByLanguage` field (existing `voiceTriggers` completely untouched — zero migration risk across the 191 real entries), and `findActionByTrigger()` now takes an optional `language` argument, checking a real, translated set first (when one exists) with English kept as a deliberate fallback tier in every matching tier, including the fuzzy one. **Phase 3a also now real and built**: 18 representative, everyday-workflow actions (navigation, sign-out, common AI-review confirm/override/skip) carry real, native-language content for French, German, Dutch, and Korean, verified end to end through real matching tests. **Phase 3b also now real and built (Sep 2026)**: every one of this registry's remaining 170 actions carries the same real, native-language content too — the complete real action surface, 188 of 188 real, matchable actions, applied via a verified translation script and confirmed with 9 more end-to-end matching tests (`phase3bTranslatedTriggers.test.ts`), including disambiguation checks across several real app contexts. One real, honest finding surfaced while testing this: `findActionByTrigger()`'s own `phraseMatch()` has a pre-existing (not introduced by this work) word-boundary-substring quirk — see `MULTILANG_VOICE_COMMANDS_PLAN.md` for the full account. **What's still real, separate work, not attempted here**: a native-speaker quality review of all this translated content, and the separate Gemini refinement-prompt audit (Piece 4 of the plan). Converting an action's own `voiceTriggers` into real, translated phrases when that action is next added or updated falls under the same real "new/updated UI converts its own strings" rule `src/i18n/README.md` already establishes for page/modal text. **See `src/MULTILANG_VOICE_COMMANDS_PLAN.md` for the full scoping plan**, including a real, honest trade-off recorded there: keeping English as a fuzzy-tier fallback reduces, but doesn't eliminate, a genuine cross-language false-positive risk — a deliberate choice favoring bilingual usability, revisitable later.

**Real fix (PS-66, Sep 2026)** — `mockActionRegistryService.ts` had 12 real
`internalKey` collisions against `constants/systemActions.ts`'s own `ACTION_MAP`
(the ticket itself claimed 10; independent verification found 3 it missed and
1 false positive in its list — full count and per-key rationale in
`constants/README.md`). 9 of the 12 were the same logical action described
twice (`ENTER_ADDENDUM`, `NEXT_UNANSWERED`, `NEXT_REQUIRED`, `CONFIRM_FIELD`,
`EDIT_FIELD`, and all four `GROSSING_*` entries) — each now aliases
`systemActions.ts`'s own key via `ACTION_MAP['id']?.internalKey ?? 'fallback'`,
the same pattern already used by `ENTER_GROSS`/`ENTER_MICRO`/`ENTER_DIAGNOSIS`/
`MSG_MARK_UNREAD`/`MSG_COMPOSE`, so the two files can no longer silently drift
apart on these keys. The other 3 (`SKIP_FIELD`, `FULL_VIEW`, `TABBED_VIEW`) had
no `systemActions.ts` counterpart at all — genuinely different actions that had
only accidentally collided — so those keep local literals, just fresh,
never-used ones (`F17+PS054`–`PS056`). `mockActionRegistryService.test.ts`
gained two regression tests: one confirming no hardcoded literal in this file
collides with any `ACTION_MAP` key, one confirming each of the 9 consolidations
and 3 renumbers landed exactly where intended. The existing "every action has a
genuinely unique internalKey" test (mock-internal only) still passes unchanged.
Deliberately **not** touched here: a separate, larger, purely-internal
duplication within `systemActions.ts` itself (16 more keys, unrelated to this
file) — see `constants/README.md` for that disclosure.

## Batch 378

`GROSSING_COMPLETE` (Complete Grossing, category `GROSSING`, Alt+Shift+F9, `grossing.complete` / F24+PS050): voice phrases in all five languages. The Grossing screen sets the `GROSSING` context. Existing stores pick the action up through `loadActions`' merge of new seed actions; the registry version wasn't bumped, so no one's customised shortcuts are wiped.

## Batch 379

`GROSSING_COMPLETE_CONFIRM` (Alt+Shift+F10, `grossing.completeConfirm` / F24+PS051) and `GROSSING_COMPLETE_CANCEL` (Alt+Shift+F11, `grossing.completeCancel` / F24+PS052), in category `GROSSING`, with voice phrases in all five languages. They answer the Grossing screen's "complete grossing without a protocol?" confirmation hands-free, and do nothing when no confirmation is open. They merge into existing stores like `GROSSING_COMPLETE` did, with no version bump.

**Fixed: every action was announced twice.** `executeAction` dispatched `VOICE_ACTION_TRIGGERED` once at the start and again after doing the work. So every page's `onAction` listener ran each command twice: Grossing, Accession, the report page, Intraop, Pool Claim and Delegate. The success toast also showed twice. It now announces once. Found when a voice-confirmed Complete grossing ran a second time against the same case version and showed "This case was updated elsewhere". Guarded by `executeActionDispatch.test.ts`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

## Batch 380

The report page's modal save buttons, category `SYNOPTIC`, with voice phrases in all five languages:
- `SPECIMEN_EDIT_SAVE` ("save specimen", Alt+Shift+F2, `specimen.saveEdit` / F20+PS009)
- `REVISION_SAVE` ("save amendment", "save correction", "release addendum", Alt+Shift+F3, `diagnosis.saveRevision` / F17+PS057)
- `CRITICAL_NOTIFICATION_RECORD` ("record notification", Alt+Shift+F7, `diagnosis.recordCriticalNotification` / F17+PS058)

Each modal listens while it's open and saves exactly as its button does, Field Requirements check included.

## Batch 381

The group 2 modals' save buttons (category `SYNOPTIC`, voice phrases in all five languages):
- `HOLD_PLACE` ("place hold", Alt+Shift+F5, `case.hold`)
- `HOLD_RELEASE` ("release hold", Alt+Shift+F6, `case.releaseHold`)
- `COMMENT_POST` ("post comment", Alt+Shift+F8, `case.postComment` / F19+PS013)
- `BIOPSY_ARRAY_SAVE` ("save biopsy array", Alt+Shift+F12, `specimen.saveBiopsyArray` / F20+PS010)

The Delegate modal now listens for the existing `DELEGATE_CONFIRM` ("confirm delegation"), which was seeded but had nothing listening. Block cancel and restain have no voice command: several blocks' forms can be open at once, so a command couldn't tell which block it meant.

## Batch 382

Three more modal buttons (category `SYNOPTIC`, voice phrases in all five languages):
- `DISCORDANCE_RECORD` ("record discordance", Ctrl+Alt+Shift+Z, `diagnosis.recordDiscordance` / F17+PS059)
- `POST_SIGNOUT_BILLING_CONFIRM` ("confirm billing change", Ctrl+Alt+Shift+1, `billing.confirmPostSignoutChange` / F24+PS053)
- `CORRECT_CODE_CONFIRM` ("correct billing code", Ctrl+Alt+Shift+2, `billing.correctAppliedCode` / F24+PS054)

Alt+Shift+F1 and F4 were left free (F1 is help; Alt+F4 closes a window). Each modal listens while it's open and acts exactly as its button does, checks included; the correction also needs `billing:applied-code:correct`.
