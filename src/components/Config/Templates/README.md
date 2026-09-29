# components/Config/Templates/

Admin protocol/template review workflow — the review queue list and the
full-page lifecycle reviewer.

**Pattern:** Standard page-pair (list → detail), plus one confirmed,
non-trivial open bug (now fixed — see Notes).

## Files

- **`AdminTemplateList.tsx`** — Template review queue list. Thin, correct —
  single mock entry today, navigates to `/template-review/:templateId`.
- **`TemplateRenderer.tsx`** — Full-page protocol reviewer, reached via
  `/template-review/:templateId`. Excellent self-documented lifecycle model
  (draft → in_review → approved → published, with needs_changes as a
  rejection branch, reset as an admin escape hatch) and source-aware
  terminology (CAP "Accept/Release" vs RCPath "Ratify/Publish" vs
  ICCR/Custom "Approve/Publish"). **KNOWN BUG, see Notes (now fixed).**

  **Also fixed this pass (PRIORITY_FIXES.md #8):** this file's own
  `ModalOverlay` component — already a single, extracted, reused-in-place
  component rather than copy-pasted — had its internals converted to
  `ps-overlay`/`ps-modal-dark`. The cleanest case of this whole
  modal-consolidation effort: one edit to the component definition
  correctly fixed every place in the file that renders `<ModalOverlay>`,
  with no risk of missing a duplicate instance.

  **Real, found-and-fixed accessibility bug, per direct report
  ("occasional text that is dark and pretty much impossible to
  read")**: the same lifecycle-stepper separator (here an arrow, `→`,
  rather than a dash) used `#1e293b` — the exact same copied pattern
  fixed in `AllProtocolsSection.tsx`/`ActiveProtocolsSection.tsx` (see
  `../Protocols/README.md`). Fixed to `#64748b`.

## Notes

- **BUG FIXED (July 2026).** `TemplateRenderer.tsx` was fully rewritten to
  fetch real content via `services/templates/templateService.ts`'s
  `getTemplate(templateId)` and render the actual `EditorTemplate` shape
  (`EditorSection`/`EditorField`, from `../Protocols/SynopticEditor.tsx`)
  directly — the same rich model the real template builder authors, with
  6 field types and per-field/per-option SNOMED/ICD coding (which the old
  renderer couldn't display at all; new `CodingBadges` component adds it).
  19 real generic (post-CAP/RCPath-licensing-cleanup) templates are
  already seeded in `editorStore` and now display correctly. Protocols
  with no authored content yet show an explicit empty state with a link
  to the editor, instead of fabricated placeholder content.
  **Deleted as fully dead, confirmed via full-`src/` grep, zero remaining
  references anywhere:** `types/templateTypes.ts` (its `AuditEvent`/
  `TemplateLifecycleState` exports were already an orphaned duplicate of
  the real `types/AuditEvent.ts`, which everything else in the app
  correctly used instead) and `src/templates/mockDcisTemplate.ts` (typed
  against the now-deleted schema). `src/templates/` is now an empty
  folder. Full before/after schema comparison in
  `../Protocols/README.md`.
- Not attempted, worth a look separately: `ALLOWED_TRANSITIONS`/
  `LIFECYCLE_STYLES` don't have an entry for `'deprecated'`
  (`TemplateStatus = LifecycleState | 'deprecated'` in
  `templateService.ts`) — falls back safely via `??` today, but a
  genuinely deprecated template would just render with draft styling
  rather than something more explicit. Pre-existing, not introduced by
  this rewrite.

## Batch 328 (PS-63): review rules and no inline CSS

- **`TemplateRenderer.tsx` now waits for the service.** Approve, Publish, Needs Changes, Submit and Reset each wait for `transitionTemplate` before changing the page. Before, the page updated first and a service error was only logged.
  - **A refusal** (no approver role, self-approval, too few approvals, SNOMED below 80%) is shown in the confirm box as translated text (`templateRenderer.governance.*`), and nothing changes.
  - **Approval that needs more reviewers:** the page shows "Approval recorded (n of m)" and stays In Review.
  - **Registry status wins:** the status from the registry now wins over the page's local `ps_state_<id>` copy.
- **No inline CSS.** The per-state colours were an inline-style map; they are now `ps-tmplr-state--<state>` classes that set `--tmplr-bg/fg/border`, used by:
  - the badge;
  - the transition buttons (the disabled look is `:disabled`);
  - the flow steps (`--current` / `--past`);
  - the confirm button (`--destructive`).

  Selected answer options use `ps-tmplr-option-label--selected`. Checked in the browser against the previous look.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
