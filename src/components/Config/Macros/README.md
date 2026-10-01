# components/Config/Macros/

Admin macro (text-expansion) editor.

**Pattern:** Thin tab wrapper (`index.tsx`) over the real panel
(`MacroPanel.tsx`).

## Files

- **`MacroPanel.tsx`** — Real macro editor wired to `macroService`. Filters
  to `status === 'Active'` macros for the editable list — correct, matches
  macro lifecycle used elsewhere. No issues.
  **Real fix (PS-128, Sep 2026):** this panel's own real `isDirty` (a
  genuine, in-progress unsaved macro draft) was previously known only to
  its own Save button (`disabled={!isDirty}`) — `ConfigurationPage.tsx`'s
  tab bar, voice-nav, and search navigation had no way to see it, and
  would silently discard an in-progress macro edit on any tab switch. Now
  reports `isDirty` into the new `../configDirtyGuardContext.ts` on every
  change (and clears it on unmount, so a stale flag can't outlive the
  tab), letting `ConfigurationPage.tsx` actually confirm before
  discarding. This was the ONE real, confirmed case of a Config tab with
  local draft state reachable through `ConfigurationPage.tsx`'s own tab
  tree — see that page's own README entry for the other two real
  `isDirty` producers in this app (`TemplateRenderer.tsx`,
  `SynopticEditor.tsx`) that were investigated and ruled out as separate,
  standalone routes, not part of this tab system at all.
- **`index.tsx`** — `MacrosTab`, 10-line wrapper. **See Notes — hardcoded
  font list.**

## Notes

- **MINOR DRIFT RISK:** `index.tsx` hardcodes `approvedFonts` as a literal
  array (`['Arial', 'Times New Roman', 'Courier New', 'Roboto']`) instead
  of reading `services/fonts/` (the real font dictionary, editable via
  `Config/System/FontsSection.tsx`). If an admin edits the font dictionary,
  this list silently won't reflect it. Small, real fix — pull from
  `fontService` instead of the literal — not done in this pass since it's
  a behavior change, not a mechanical rename.

## Batch 349 (PS-126)

Pete: "dark text is hard to read; admins should see all macros sorted by type; users with permission to create an Enterprise macro will see that option."
- **Readable text:** the sidebar hint used `#475569` on the dark panel (about 2.3:1); it now uses the panel's secondary text colour (about 6.5:1), and the empty-list text moved up a step too.
- **All tab (administrators):** every macro, including other users' personal ones, grouped Enterprise → each facility → each user's personal macros (under the user's name), sorted by name. It is the administrators' first tab; their four tabs sit two by two because four don't fit one row of the sidebar.
- **Enterprise only for administrators:** the visibility list offers Enterprise only to them. Anyone else opening an Enterprise macro, or another user's personal macro, sees it read only: a note, no Delete, Save disabled; the save also refuses it.
- The decisions live in `services/macros/macroAccess.ts`; `__tests__/MacroPanel.test.tsx` gained 4 tests for this.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
