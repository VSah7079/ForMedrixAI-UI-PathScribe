# components/Editor/

The rich text editor (Tiptap-based) used throughout PathScribe for
narrative report content, plus `tiptapBridge/` (renamed from
`integration/` — see Notes) — the bridge layer that lets the Orchestrator
Engine drive the editor programmatically (streaming AI content into
specific sections without corrupting user edits elsewhere).

**Pattern:** `PathScribeEditor.tsx` is the real Tiptap component;
`NarrativeEditor.tsx` is a thin props-forwarding wrapper; `tiptapBridge/`
is pure logic (no React) bridging the editor to the AI orchestrator.

## Files

- **`PathScribeEditor.tsx`** (1018+ lines) — The real editor: full
  toolbar (formatting, tables, alignment, macros), macro hotkey extension,
  multi-instance shared toolbar support, user-configurable tab width.
  Exposes `PathScribeEditorHandle` via `forwardRef`.

  **FIXED — real theming bug, not cosmetic.** `DARK_THEME`'s
  `contentBg`/`contentText` were hardcoded to `'white'`/a dark-text color
  even when `theme="dark"` was explicitly selected — meaning the dark
  theme option only ever affected the toolbar chrome, never the actual
  writing surface, undermining the point of the option existing. Found
  via a real usability report: the Case/Specimen Comment modals (embedding
  this editor) had just been given a dark-themed shell, but the editor
  itself inside them stayed a plain white box, illegible against the
  new dark surroundings. Now genuinely dark end-to-end when selected.

  **NEW — real user-facing theme toggle**, not just a fixed default per
  screen. `allowThemeToggle` prop shows a real sun/moon button in the
  toolbar; `theme` prop is now only the *starting point* — once a user
  has ever clicked the toggle anywhere it appears, that becomes their
  real preference (persisted to `localStorage`), shared across every
  editor instance that opts in, overriding whatever default any
  individual screen was built with. Off by default so contexts that
  shouldn't show it (e.g. a small font preview box) don't get one
  uninvited. First real usages: `Case`/`Specimen` Comment modals
  (`pages/Synoptic/Comments/`), both defaulting to dark with the toggle
  available. **Confirmed via direct test that `OrchestratorSectionEditor.tsx`
  — the one pre-existing consumer already using `theme="dark"` — is
  completely unaffected**, since it doesn't pass `allowThemeToggle` and
  therefore never enters the new stateful/persisted code path at all.

  **Real, found-and-fixed follow-up gap in this exact same fix, per direct
  report ("occasional text that is dark and pretty much impossible to
  read")**: the earlier `DARK_THEME.contentText` fix above corrected the
  theme *token* itself, but the injected `<style>{...}</style>` block
  that actually applies `.ps-editor-content`'s real text color still
  hardcoded the light theme's own `#1e293b` directly, never referencing
  `theme.contentText` at all — meaning a real user clicking the real
  sun/moon toggle button *while actively writing a report* would see
  the toolbar chrome correctly switch to dark, while the actual report
  text they were typing became nearly invisible, silently forced back
  to the light theme's own dark text color regardless of which theme
  was genuinely active. Fixed by interpolating `${theme.contentText}`
  into the same template string, alongside the `${minHeight}`/
  `${approvedFonts[0]}` interpolations already there — the real fix is
  one line, using infrastructure that already existed and was already
  correct everywhere else in this same component.

- **`NarrativeEditor.tsx`** — Thin wrapper forwarding props/ref to
  `PathScribeEditor.tsx`. No issues.
- **`PathScribeEditorRef.ts`** — Defines `PathScribeEditorHandle`, the
  imperative ref interface (getEditor/insertAtPos/appendToken/setContent/
  clearContent/focus/isEditable/setEditable) that the Orchestrator Engine
  and `NarrativeEditor.tsx` use to drive the editor without going through
  React props. Single real source of truth for that interface.
- **`tiptapBridge/anchorMap.ts`** — Tracks each narrative section's
  position in the Tiptap document via `data-section-id` paragraph
  attributes, so content can be inserted/replaced at the right spot
  without corrupting unrelated user edits. No issues.
- **`tiptapBridge/aiContentMarkers.ts`** — Marks AI-generated vs.
  user-edited node ranges via node attributes (not marks/decorations,
  deliberately — survives undo/redo). No issues.
- **`tiptapBridge/insertAtAnchor.ts`** — Safe content insertion at
  section-specific positions, protects user-edited content from being
  overwritten. No issues.
- **`tiptapBridge/streamingWriter.ts`** — Bridges Orchestrator token
  streaming into the editor, one `StreamingSession` per section, supports
  cancellation mid-stream. Sole external consumer:
  `orchestrator/orchestratorEngine.ts`. No issues.

## Notes

- **Real duplicate-type drift risk, fixed:** `PathScribeEditor.tsx` used
  to declare its own separate `export interface PathScribeEditorHandle`,
  structurally identical to the one in `PathScribeEditorRef.ts` — but
  every external consumer already imported the `PathScribeEditorRef.ts`
  version. Consolidated to one declaration.
- `PathScribeEditorRef.ts`'s "HOW TO ADD THIS" comment block reads like a
  pending implementation guide but the pattern is already fully
  implemented — added a status note so it's clearly read as
  historical/reference documentation, not a to-do.
- **RENAMED: `integration/` → `tiptapBridge/`.** Checked and confirmed
  correctly placed under `components/` (these 4 files are fundamentally
  Tiptap/ProseMirror-specific, operate on live `Editor`/`Transaction`/
  `Decoration` internals, can't be abstracted from the editor library
  without a rewrite) — same established pattern as `PathScribeEditorRef.ts`
  (also consumed from outside this folder). Renamed only because
  `integration/` didn't signal "Tiptap-specific" to someone skimming
  folder names. All internal path comments + the one external import
  (`orchestratorEngine.ts`) updated; confirmed zero dangling references.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
