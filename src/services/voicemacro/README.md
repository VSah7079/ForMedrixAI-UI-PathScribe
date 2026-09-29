# services/voicemacro/

Voice-triggered macro dictionary — distinct from the text-expansion macros/ folder (this is voice-command-triggered, not typed-shortcut-triggered).

**Pattern:** Standard interface/mock/firestore pattern.

## Files

- **`mockVoiceMacroService.ts`** — (renamed from mockVoiceService.ts July 2026 — file name was inconsistent with its own class name, MockVoiceMacroService, which was already correct). **Real, wired-in now:** `refineTranscript()` used to be a real, correct algorithm with zero real call sites anywhere in the app, confirmed directly — the substitution logic was extracted into a pure, shared `applyVoiceMacroSubstitutions()` (`types/voiceMacros.ts`), which `refineTranscript()` now delegates to and which `contexts/VoiceProvider.tsx`'s own real, live dictation pipeline also calls directly (see that folder's own README entry for the full account) — no longer orphaned.

## Real, per direct guidance ("Personal Quick Text" — Enterprise then Facility then Staff)

`VoiceMacro` gained the identical three-tier ownership model `Macro` (`services/macros/`) already has —
`performingLabFacilityId?`/`ownerUserId?`, plus a matching `isVoiceMacroVisibleTo()` resolution function (kept as a genuinely separate implementation from `isMacroVisibleTo()`, not a shared generic, since the two types are deliberately different — see this folder's own header — but the real visibility *rule* is identical and must be kept in sync by hand if either ever changes). This is the real mechanism behind Personal Quick Text: a pathologist selects text they've already written in a real case (`components/... /OrchestratorSectionEditor.tsx`'s own "QT" button — see that file's README entry for the full account), and a new `VoiceMacro` gets created with `ownerUserId` set and `performingLabFacilityId` auto-resolved from the case's own real performing lab — never asked of the pathologist, only the spoken trigger is. Also gained `name?`/`sourceCaseId?`/`createdBy?`/`createdAt?` for real management and provenance. See `types/voiceMacros.test.ts` (3 tests) for the resolution-rule coverage.

## Batch 338: shared instance in the barrel

`mockVoiceMacroService` (a shared `MockVoiceMacroService` instance) is exported from `@/services` as `voiceMacroService`, so UI code needn't import the mock. `OrchestratorSectionEditor.tsx` uses it. `contexts/VoiceProvider.tsx` and `components/Voice/SpeechConfigTab.tsx` still create their own instances from the mock file; the class keeps no state beyond browser storage, so the instances agree.


## Batch 348 (PS-67): result shape

`refineTranscript` returns `ServiceResult<string>` from `services/types.ts` (`{ ok: true, data }`), the app's one result shape. It used to return `{ success, data }`.
---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*