# pages/WorklistPage/

The main case worklist — filter tiles, the case table (rendered via
`components/Worklist/WorklistTable.tsx`, documented separately in
`components/Worklist/README.md`), and the supporting modals/tiles
specific to this page.

## Files

- **`WorklistPage.tsx`** (871 lines) — the page itself: LIS/Outreach
  context switching, the filter-tile strip, stats computation, and the
  page title above the table.

  **Real bugs found and fixed in a review pass** (`PRIORITY_FIXES.md`
  item #54): page title and tile label were two completely independent
  hardcoded strings (`FILTER_TITLES` map vs. each tile's own inline
  label) that had already drifted apart in several places — most
  visibly, selecting "Amendment & Addenda" showed "Amended Cases" as
  the page title. Also found: `countersign` wasn't in the title map at
  all, silently falling back to the generic "Active Cases" title, and
  `grosscomplete`/`urgent`/`draft` each had a different string in the
  title than on their own tile. Fixed properly, not patched: replaced
  both hardcoded copies with one shared `FILTER_LABELS` map that both
  the title and every tile's label read from — the specific class of
  drift that caused this is now structurally impossible, not just
  fixed for the one reported case.

  Also fixed in the same pass: the Urgent tile showed a bare count with
  no indication that pool-status (unassigned) urgent cases existed
  separately — added a "2 Restricted" sublabel, using an existing
  `sublabel` field already wired into the tile rendering but never
  populated by any tile before this. And a real colorblind-accessibility
  gap — `delegated` and `accessioned` tiles used the literal same color
  (`#38bdf8` vs `#38BDF8`, differing only in letter casing), plus two
  near-duplicate pairs (the two violets, the two oranges) that would be
  hard to distinguish. Reassigned three tile colors to resolve both;
  left the other nine alone since they were already reasonably distinct
  and semantically sensible (red/green/gray for urgent/completed/draft
  in particular).

  **Extended further** (`PRIORITY_FIXES.md` item #55, in
  `WorklistTable.tsx`/`poolGrouping.ts` rather than this file directly
  — see `components/Worklist/README.md`): unassigned-and-urgent cases
  now sort to the very top of the whole list, and the Urgent/All Cases
  divider bars inside the table also show their own restricted-count
  breakdown, mirroring the tile fix above.

  **Real, per direct UI-review follow-up ("Fix the root" — background
  inconsistency across pages): this page's own, fully inline-styled
  background-image/gradient (and the `backgroundColor`/`color` pairing
  that went with them) removed entirely.** This was the most involved
  of the five pages fixed in that pass — the only one with no CSS
  class behind its background at all, just raw `style={{...}}`. Falls
  through to `AppShell.tsx`'s own, real `.ps-app-root` background now
  (see that folder's own README for the fuller account of the
  inline-style bug this whole pass traced back to) — matching
  Configuration/Quality Assurance/Intraop Queue/Contribution. The rest
  of this page's inline style block (position/width/height/font-
  family/display/flex-direction) deliberately left as-is — a full
  inline-style-to-CSS-class conversion for this page is separate,
  larger, pre-existing work, not part of this pass.

- **`AmendedAddendaTriageTile.tsx`** (94 lines) — the "Amendment &
  Addenda Triage" summary tile, built to an explicit spec documented in
  its own header: inbound LIS amendment notices awaiting review, open
  (draft) amendment records, and open (draft) addendum records. Two
  named exit conditions (clerical review-marked elsewhere; clinical —
  only leaves once the draft is actually released/re-finalized), both
  documented directly in the file rather than left implicit. Not
  reviewed in depth this session beyond confirming it's real, wired-up,
  and not dead code.

- **`ResourcesModal.tsx`** (45 lines) — the shared quick-links modal
  (protocols/references/internal systems), opened via the global
  `PATHSCRIBE_PAGE_OPEN_RESOURCES` window event — see
  `pages/README.md`'s `AuditLogPage.tsx` entry for a real bug found
  elsewhere where a page rendered this same modal but never listened
  for that event at all. This page's own listener was confirmed
  correctly wired. Not reviewed in further depth this session.

## Notes

- This folder previously had no README at all, despite
  `pages/README.md`'s own header already listing `WorklistPage/`
  alongside `AccessionPage/` as one of the subfolder pages — a real
  documentation gap, closed here rather than left for later.
- The case table itself, its pool-grouping/sorting logic, and the
  claim-workflow modal all live in `components/Worklist/`, documented
  there rather than duplicated here — this page owns filtering/tiles/
  context, that folder owns the table and its row-level behavior.
- **Real, per direct guidance ("Yes we should scope 'Return to
  Trainee'/'Reject with Notes'... one unified tile instead of two" →
  "let's not display tiles with 0 entries"): a new "Needs Revision"
  tile**, deliberately one, role-neutral tile rather than two
  permanently-visible ones — `needsRevisionCount` counts BOTH real
  sides of the same real event (cases returned TO this user as the
  resident, OR returned BY this user as the attending, still awaiting
  the resident's revision), since a given viewer is usually only ever
  on one side for any real case but the same real filter correctly
  serves both. **The first tile in this row with real, conditional
  visibility** — filtered out entirely when its count is 0, deliberately
  scoped to just this new tile rather than retrofitted onto the other
  14 tiles above, all of which keep their own established "always
  visible, count included" behavior unchanged, per direct guidance. The
  tile's own real filter still works correctly if a viewer had it
  active and its count later drops to 0 — the table below just shows
  its own real "no cases" state, it doesn't reset or silently break.
  Deep brown (`#78350F`), deliberately not amber/orange — see
  `services/cases/README.md`'s own fuller account of the color
  decision and the "Return to Trainee" feature this tile surfaces.

---
*When this folder's contents change meaningfully, update THIS file.*
