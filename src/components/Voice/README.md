# components/Voice/

Voice dictation and command UI — toggle button, command overlay,
miss-recognition prompt, accent/settings, and the voice macro (text
expansion via spoken phrase) config tab. All real, all wired to
`contexts/VoiceProvider.tsx` and real services.

**Real fix, this pass:** voice AI refinement was previously a
completely separate, hardcoded-to-Gemini integration, disconnected
from the rest of the app's AI infrastructure and its model-governance
story. It's now a genuine `AIModel` (`type: 'Voice Dictation'`),
resolved dynamically and called through the same multi-vendor
`callAi()` path as everything else — see `services/ai/README.md` and
`services/models/README.md`. Setting a new voice model live is
hard-blocked without a PASS-graded Validation Study, same as
report-generation models. This folder's own UI needed one real fix as
a result — see `VoiceToggleButton.tsx` below.

**Pattern:** Small, focused components, each consuming `useVoice()` from
`VoiceProvider.tsx` for shared voice state (phase, transcript, etc.).

## Files

- **`VoiceSettings.tsx`** — Accent selection + mounts `SpeechConfigTab`
  and (from `Config/System/`) `VoiceSection` — the real consumer of that
  cross-folder file noted in `Config/System/README.md`. No issues.
- **`VoiceMissPrompt.tsx`** — Shown when a voice command isn't recognised,
  up to 3 fuzzy candidates, auto-dismiss/auto-confirm timing logic clearly
  documented in its own header. Deliberately not shown during dictation
  (word misses aren't command misses). No issues.
- **`VoiceToggleButton.tsx`** — Main voice on/off control, 4-color phase
  indicator (standby/local/ai/dictate). **Correction to this file's own
  prior note:** previously described as referencing "the real, separate
  Gemini-backed voice integration ... distinct from the main
  narrative-generation AI provider abstraction ... confirmed correct,
  not a stale reference." That's no longer true as of this pass — voice
  now resolves through the same `AIModel` catalog and `callAi()` path
  as everything else (see folder header above). **Real fix, caught via
  direct report:** two tooltip strings were still hardcoded to
  `VITE_GEMINI_API_KEY` specifically (`'Voice Local only
  (VITE_GEMINI_API_KEY not set)'` and a dev-only detail line) — stale
  and actively misleading now that the active voice model resolves
  dynamically and could be configured to any supported vendor. Both
  reworded to be vendor-neutral rather than name a specific env var
  that may no longer be the accurate one to check.
- **`VoiceCommandOverlay.tsx`** — Success/fail flash on command
  recognition. No issues.
- **`SpeechConfigTab.tsx`** — Voice macro (spoken phrase → written text
  expansion) admin list. **See Notes — minor consistency items, not bugs.**

## Notes

- **Style inconsistency, not a bug:** `SpeechConfigTab.tsx` instantiates
  `new MockVoiceMacroService()` directly rather than importing a
  pre-built singleton the way every other mock service in this codebase
  is consumed (`mockActionRegistryService`, `mockClientService`, etc. are
  all exported already-instantiated). No functional risk here — the
  service persists to `localStorage`, so even multiple instances would
  read/write the same underlying data — but worth matching the
  established convention if this file is touched again. Confirmed via
  grep: `SpeechConfigTab.tsx` is the sole consumer, so there's no existing
  divergent-instance bug to fix, just a pattern to align.
- **Naming convention, not a bug:** the hook this tab uses is
  `hooks/usepathscribeSpeech.ts` — lowercase 'p', where every other hook
  in this codebase follows `use` + PascalCase (`useSpecimenDictionary`,
  `useSynopticAudit`, `useAuditLog`). Cosmetic only; not renamed here
  since a hook filename rename has broader import-path ripple than fits a
  quick pass — flagging for whenever that file is next touched.

## Batch 367 (PS-74): no inline CSS

`VoiceToggleButton.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
