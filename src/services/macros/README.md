# services/macros/

Text-expansion macro dictionary for the report editor (e.g. '.norm' shortcuts).

**Pattern:** Standard interface/mock/firestore pattern.

## Files

- **`generateShortcutFromName.ts`** (+ `.test.ts`, 6 tests) — **New**, per direct reminder ("no business logic in the UI code") — extracted out of `MacroPanel.tsx`'s own "Import from Word" adapter. A real, imported AutoText entry's own name isn't a valid `;`-prefixed shortcut on its own; this sanitizes and deduplicates against every currently-existing real shortcut, so an import can never silently create two macros sharing the same trigger.

## Notes

- **Real fix ("My Macros - Organize under Facility"), per direct guidance:** despite `MacroPanel.tsx`'s own "My Macros" title, this was never actually personal — `createdBy` was a hardcoded literal `'current-user'` for every macro anyone ever saved through that panel, and `getAll()` applied zero ownership filtering. Confirmed directly before fixing, not assumed. `Macro` gained `performingLabFacilityId?`/`ownerUserId?` and a real, shared `isMacroVisibleTo()` resolution function — a genuine three-tier model: Enterprise (both undefined, visible everywhere), Facility (scoped to one real performing lab), Personal (owned by exactly one real user, via `getSessionUser().id`). Deliberately a union of all three tiers, not a most-specific-wins override like Print Settings/Case Mask — a real user should see every applicable tier's macros simultaneously. See `IMacroService.test.ts` (10 tests) for the real resolution-rule and shortcut-generation coverage, including the real precedence case: `ownerUserId` always wins over `performingLabFacilityId` when both happen to be set (a personal macro carrying facility provenance must never leak to that facility's whole staff).
- See `services/voicemacro/README.md` for the separate, voice-triggered "Personal Quick Text" capability this same three-tier model was extended to.
- **Real addition ("MS Word AutoText / Building Blocks... load them into personal macros"), per direct guidance:** `MacroPanel.tsx` gained a real "Import from Word" button — a thin adapter over the genuinely decoupled `services/import/wordBuildingBlocksEngine.ts` (see that folder's own README for the full account, including a real parsing bug it caught and fixed). Real, preview-then-apply flow, same established shape as this app's other CSV imports — nothing is created until the admin confirms, each entry is individually selectable (AutoText pre-checked, other Building Blocks gallery types shown but not), and the whole batch is assigned to a real, chosen Enterprise/Facility/Personal tier.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*