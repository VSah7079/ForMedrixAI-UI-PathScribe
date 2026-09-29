# services/tatConfig/

Decision logic for the TAT / escalation target editor (`components/Config/System/TATConfigSection.tsx`). Moved out of the component in Batch 317 (PS-73) when Duplicate was added there.

**Pattern:** pure functions. The types are in `types/quality/TatConfigEntry.ts`.

## Files

- **`tatConfigRules.ts`**
  - `findTatConflict(entries, draft, excludeId?)`: an active entry with exactly the same scope (type, urgency, ordering facility, performing lab, specimen, subspecialty, role). Pass `excludeId` in edit mode only.
  - `buildTatEntry(draft, mode, existing, entries, { now, newId })`: validates the draft and builds the entry to save, or returns `typeRequired` / `hoursRequired` / `conflict`.
- **`tatConfigRules.test.ts`**

## Bugs fixed in the move

1. **Add vs edit** was decided by `!!entry`. A duplicate passes an entry for an **add**, so saving a copy would have overwritten its source. It is now decided by an explicit `mode`.
2. **Role scope was wiped on edit.** Save always wrote `roleId: null`, because the form has no role picker. Editing a seeded per-role target (for example, Resident sign-out) silently widened it to every role. The draft's `roleId` is now kept.

## Batch 353: TAT targets behind a service

Pete: TAT targets "will need to move to services the API server owns". This is the front-end half; the endpoints are specified in [docs/architecture/TAT_AND_DELEGATION_API.md](../../../docs/architecture/TAT_AND_DELEGATION_API.md).

- **`ITatTargetService.ts`**: `getAll`, `add`, `update` and `remove`. Add and update are separate calls, so a duplicate is always an add. `remove` refuses a system default (`systemDefault`). `@/services` exports it as `tatTargetService`.
- **`mockTatTargetService.ts`** (+ `.test.ts`): the demo implementation. It keeps the targets under the key the TAT screen always used (`pathscribe_tat_entries_v2`), so demo edits carry over and Demo Reset still clears them.
- **`systemDefaultTatEntries.ts`**: the built-in targets and `isSystemDefaultTatEntryId`, moved from `TATConfigSection.tsx`.
- **`tatTargetResolution.ts`**: `resolveTatTargetHours`, `resolveTatEntry` and `specificityScore` (most specific wins), moved unchanged from `components/Contribution/qualityCalculations.ts`, which re-exports them.
- **Now reading through the service:**
  - the TAT screen;
  - Search's past-TAT filter;
  - the Quality tab;
  - the Contribution dashboard;
  - the Enterprise rollup;
  - the facility and subspecialty reference check.

  Each used to read the screen's browser storage itself.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
