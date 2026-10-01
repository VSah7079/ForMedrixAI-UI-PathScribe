# components/Config/Search/

Search bar for the Configuration page itself (find the right settings tab —
and, for entries with a confirmed section, the specific setting within it).

**Pattern:** Single component, originally a deliberately narrow v1 scope
stated in its own header — since extended (see below).

**Real, per direct report ("the top level search in config found the
entry, but when clicked on, it did not go to the setting"): v1's own
stated limitation was a real, reported bug in practice, not just a
scoping note.** `onNavigate` only ever received a `tabId` — for a tab
with many sections (System has 30+), clicking a search result usually
landed on whatever section was already active or default, not the one
searched for. Fixed by reusing real, already-existing infrastructure
rather than inventing new plumbing: `ConfigSearchEntry` gained an
optional `section` field (`constants/configSearchIndex.ts`),
`ConfigSearchBar.tsx` now passes it through `onNavigate(tabId, section)`,
and `ConfigurationPage.tsx` dispatches the same real
`PATHSCRIBE_SYSTEM_NAVIGATE` custom event `AppShell.tsx`'s own
config-link chat messages already use — same `setTimeout` delay
reasoning (the System tab's component needs to mount, and its own
event listener attach, after `handleTabChange`'s state update, before
it can catch the event). Genuinely covers every entry with a confirmed
section mapping today; entries without one (see
`configSearchIndex.ts`'s own notes on `sys-jurisdiction`/`sys-info` —
neither is a real `SystemSection` sidebar item) still fall back to the
original tab-only navigation, a real result rather than nothing.

## Files

- **`ConfigSearchBar.tsx`** — Scores and matches against
  `CONFIG_SEARCH_INDEX` (label/synonyms/description) from
  `constants/configSearchIndex.ts`, navigates to the matched tab (and
  section, when known) on selection.
- **`ConfigSearchBar.test.tsx`** — **NEW.** Four real tests covering the
  fix above: a section-mapped entry passes both `tabId` and `section`;
  the same holds when matched via synonym, not just the exact label;
  an entry with no confirmed section still falls back to tab-only
  navigation (not silently nothing); selecting a result clears the
  query and closes the results panel.

## Notes

- `constants/configSearchIndex.ts` needs to stay in sync with the
  actual Config tabs/sections as they change — each `system`-tabbed
  entry's own `section` value needs to keep matching a real
  `SystemSection` id in `Config/System/index.tsx`, or it'll silently
  fall back to tab-only navigation again.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
