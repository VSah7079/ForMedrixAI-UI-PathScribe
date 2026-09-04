# components/Config/Protocols/

The Synoptic Library — protocol/template lifecycle management (registry,
review queue, active library) and the full template builder. Tightly
coupled to `Config/Templates/` (the read-only reviewer) — see the Notes
section below for a real, now fully-diagnosed bug that spans both folders.

**Pattern:** `index.tsx` routes 3 list-view sections; `protocolShared.tsx`
is the shared metadata registry; `SynopticEditor.tsx` is the real content
builder.

## Files

- **`index.tsx`** — Sidebar orchestrator for 3 sections (Active/Review
  Queue/All), URL-aware so navigating back from `TemplateRenderer.tsx` or
  `SynopticEditor.tsx` lands on the right section. No issues.
- **`protocolShared.tsx`** (721+ lines) — `PROTOCOL_REGISTRY`: the shared
  metadata/lifecycle registry (status, owner, review notes, `fields` as a
  **count**, not content) consumed across this folder and `Config/Templates/`.
  `protocolGroup()`/`isDiagnosticProtocol()` are well-reasoned derivation
  helpers with sensible defaults.

  **CORRECTION (July 2026) — the 19 templates' registry exclusion was
  never intentional.** This README previously stated `PROTOCOL_REGISTRY`
  "correctly excludes" the 19 generic synoptic templates seeded directly
  into `editorStore` (breast_invasive, lung_adeno, colon_resection, etc.),
  framing it as a deliberate consequence of CAP/RCPath content-licensing
  cleanup. That was wrong — these templates were simply never given
  registry entries to begin with, meaning they were reachable only by
  direct URL (`/template-editor/breast_invasive`) and completely invisible
  to normal browsing/assignment via Configuration → Synoptic Library →
  All Protocols. Fixed by adding all 19 as `published` entries (see
  `scripts/add-generic-template-registry-entries.cjs`), each retaining
  the existing `-generic` version suffix as the honest signal that these
  are placeholder content pending a confirmed CAP/RCPath license — the
  license swap will replace file content in place, same template IDs,
  rather than needing a separate interim status. `PROTOCOL_REGISTRY` is
  now 32 entries (was 13).

  **FIXED this pass (PRIORITY_FIXES.md #8):** two hand-rolled modal
  shells — "Upload Protocol" and "Build / Customise" — converted to
  `ps-overlay`/`ps-modal-dark`. Confirmed these were a genuine duplicated
  shell (the exact background color appeared nowhere else in the file),
  not part of a broader deliberate internal theme, so safe to fully
  standardize rather than just convert the backdrop.

- **`SynopticEditor.tsx`** (816+ lines, the real template builder) — Add/
  reorder/delete sections and fields, 6 field types (dropdown/radio/
  checkboxes/numeric/text/longtext), per-field AND per-option SNOMED+ICD
  coding, preview modal. This is where `EditorTemplate`/`EditorSection`/
  `EditorField` — the actual rich content model — are defined. **See
  Notes — this is the other half of the TemplateRenderer bug.**

  **`EditorField.markerGroup?: string`** (added for the biomarker display
  work, July 2026) — optional metadata grouping related fields under one
  card in the `MarkersPanel` display (`pages/SynopticReportPage/
  components/MarkersPanel.tsx`) — e.g. "ER Status"/"ER % Positivity"/
  "ER Intensity" all tagged `markerGroup: "ER"` render together rather
  than as separate, disconnected badges. Only meaningful within a
  template's `biomarkers` section (currently only `breast_invasive` and
  `lung_adeno` have one); falls back to the field's own label if unset,
  so untagged fields/templates degrade gracefully rather than breaking.

  **FIXED this pass (PRIORITY_FIXES.md #8):** three overlay backdrops
  converted to `ps-overlay`. The live-preview modal's inner box was
  deliberately left white/light-themed — it renders the template as it
  would actually look in a real document, same "should look like paper"
  reasoning as the main report editor, not an oversight. The two confirm
  dialogs (Submit for Review, Unsaved Changes) had their backdrops
  converted; their inner boxes use this file's own `T.surface`/`T.border`
  theme tokens, applied *consistently* throughout the whole file (unlike
  `protocolShared.tsx`'s genuinely duplicated shell above) — left as-is
  rather than force onto slightly different exact shared-class values
  without being asked.

- **`ReviewQueueSection.tsx`** — Pre-publish lifecycle list
  (draft/in_review/needs_changes/approved). Routes to `TemplateRenderer.tsx`
  ("Open Reviewer") or `SynopticEditor.tsx` ("Open Editor"). No issues.
- **`AllProtocolsSection.tsx`** — Full library, filterable by status.
  **Real, found-and-fixed accessibility bug, per direct report
  ("occasional text that is dark and pretty much impossible to
  read")**: the lifecycle stepper's own separator dash (`—`) used
  `#1e293b` — darker than even its own sibling "future/inactive step"
  label color (`#334155`) right next to it. Fixed to `#64748b`,
  clearly visible without competing with the stepper's own real
  visual hierarchy (past/current/future).
- **`ActiveProtocolsSection.tsx`** — Published protocols in the reporting
  workflow. "View Protocol" → `TemplateRenderer.tsx` (read-only), "New
  Version" → `SynopticEditor.tsx` (draft fork). Same real lifecycle-
  stepper separator-dash fix as `AllProtocolsSection.tsx` above — the
  exact same copied pattern, independently confirmed and fixed here too.
- **`TerminologyAlertBanner.tsx`** — SNOMED/ICD deprecation alerts inline
  in `SynopticEditor.tsx`, plus a compact `TerminologyAlertBadge` used in
  protocol cards elsewhere in this folder. No issues.

## Notes

- **On naming:** "Editor" here (`SynopticEditor.tsx`) means something
  genuinely different from `components/Editor/` (the Tiptap narrative
  writing surface) — this one edits structured template *definitions*
  (sections, fields, conditional visibility), not free-text content.
  Prompted by a direct question about whether this file was mis-grouped;
  it isn't — same overloaded-terminology pattern already documented in
  the top-level `components/README.md` for "Search"/"Template"/"Review",
  now a fourth confirmed instance with "Editor". Correctly placed, folder
  path disambiguates rather than the bare filename.

## Notes — TemplateRenderer bug, fully diagnosed and FIXED (July 2026)

Picking up from `Config/Templates/README.md`'s earlier, partial diagnosis:
it's not just "missing content" — **there are two structurally
incompatible schemas for template content in this codebase**, and
`TemplateRenderer.tsx` and `SynopticEditor.tsx` each use a different one:

| | `types/templateTypes.ts` (what `TemplateRenderer.tsx` renders) | `SynopticEditor.tsx` (what admins actually author) |
|---|---|---|
| Section content | `TemplateSection.questions: Question[]` | `EditorSection.fields: EditorField[]` |
| Item label | `Question.text` | `EditorField.label` |
| Item type | 2 values: `"choice" \| "text"` | 6 values: `dropdown/radio/checkboxes/numeric/text/longtext` |
| Options | `TemplateOption { id, label }` | `FieldOption { id, label, snomed, icd }` — coding lives per-option |
| Field-level coding | none | `snomed`/`icd` directly on `EditorField` |

`services/templates/templateService.ts` — the real backend both pages are
supposed to share — is correctly typed (`TemplateDetail.template:
EditorTemplate`) and its `getTemplate(id)` genuinely does return real,
admin-authored content from `editorStore` when it exists. **But its own
header comment claims `TemplateRenderer.tsx` is a consumer, and that's
stale — confirmed by direct grep: `TemplateRenderer.tsx` never calls
`getTemplate()` anywhere.** It only imports `transitionTemplate` from this
service. That's almost certainly *why* it was left hardcoded to
`mockDcisTemplate` in the first place — wiring `getTemplate()` in naively
would hand the renderer an `EditorTemplate`, and its rendering code is
built entirely around `Question`/`ChoiceQuestion`/`.text` — a real
TypeScript type mismatch, not a small prop-threading fix.

**Net effect for Pete:** any protocol actually authored or edited via
`SynopticEditor.tsx` — the real admin workflow — currently cannot be
correctly displayed via "View Protocol"/"Open Reviewer" at all. Every
protocol, regardless of `templateId`, still shows the same DCIS
placeholder content in `TemplateRenderer.tsx`.

**Resolved — option 1 chosen (rewrite the renderer to consume `EditorTemplate`
directly).** Full implementation detail in `../Templates/README.md`. Kept
the diagnosis above as-written since it's still the accurate before-state
and the reasoning for why option 1 was viable (real content already
existed in `editorStore` for 19 templates).

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
