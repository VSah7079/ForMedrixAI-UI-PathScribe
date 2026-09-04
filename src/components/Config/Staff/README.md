# components/Config/Staff/

Staff directory and role/permission dictionary.

**Pattern:** Two co-located, real components — `StaffTab.tsx` imports
`Role`/`DEFAULT_ROLES` directly from `RoleDictionary.tsx`.

## Files

- **`RoleDictionary.tsx`** — Real, substantial (613+ lines) two-panel
  role/permission editor (category groups left, permissions/clients/
  cheat-sheet right). Imports `ACTION_GROUPS`/`DEFAULT_ROLE_PERMISSIONS`
  from `constants/systemActions`.

  **FIXED this pass — real data-source disconnect, not cosmetic.** The
  "Case Participation" tab used to call `loadParticipationTypes()` from
  `../System/ParticipationTypesSection` — a separate, local, hardcoded
  list with a different localStorage key (no `_v2` suffix) than
  `services/participationTypes/mockParticipationTypeService.ts`, the real
  service `CaseTeamModal.tsx` actually reads. The two lists had drifted to
  contain **different types entirely** (this screen showed Second
  Opinion/Preliminary Report/Observer/Cytotechnologist/Tumour Board; the
  real service had Attending/Transcriptionist/Clinician/External/Resident)
  — meaning any eligibility a role appeared to have here didn't
  necessarily match what `CaseTeamModal.tsx` actually enforced. Now
  imports `mockParticipationTypeService` directly (async `getActive()` +
  `useEffect`, replacing the old synchronous local call) — the same
  service the real feature uses, genuinely in sync.

  **Real addition:** a real Duplicate action, next to Edit on every
  row — reuses the exact same 'add' flow/modal as a genuinely new role,
  pre-filled with the source role's full configuration (permissions,
  facility access, case participation, colour), same "duplicate, then
  review before saving" pattern already established for Container
  Types/Physicians/Case Routing rules elsewhere in this app, not an
  instant, unreviewed clone. `builtIn` is deliberately forced `false`
  regardless of the source's own value — duplicating one of the 4 seed
  roles (Pathologist/Resident/Admin/Physician) always produces a
  genuine custom role, never a second role silently claiming built-in
  status. Also, in passing: the previously-noted stale
  `Config/Users/RoleDictionary.tsx` header path comment is no longer
  present in the real file — confirmed directly while making this
  change, corrected from this file's own earlier note.

- **`StaffTab.tsx`** — Real staff directory (496+ lines), wired to
  `userService`. **FIXED this pass:** the "add a role" dropdown (chips +
  add-another pattern) used a native `<select>`, whose *open* option list
  is OS-rendered and can't be restyled via CSS regardless of the
  `.ps-conf-select` class already applied to its closed state — visibly
  inconsistent with the app's dark theme once opened. Replaced with the
  new `components/Common/Dropdown.tsx` (a genuinely custom-rendered
  dropdown, first real usage of that component). ~36 other native
  `<select>` elements remain across `Config/System/` — logged in
  `PRIORITY_FIXES.md` as a separate, deliberately deferred item; this
  fix is the proof-of-concept, not a full sweep.

  **Also, this is where `FppeAssignmentsSection.tsx` (`Config/System/`)
  actually renders** — as this tab's own "Credentialing Review"
  sub-tab, alongside "Staff Members" and "Role Dictionary." The file
  physically lives in `Config/System/` (it's a real, pre-existing
  filing mismatch relative to where it's actually used), not moved as
  part of any pass here.

  **Real fix (Staff member Organized under Role), per direct
  guidance:** `roles` used to only ever become the real, live role list
  once an admin happened to visit the "Role Dictionary" sub-tab first
  (via its own `onRolesChange` callback) — landing directly on "Staff
  Members" left this stuck at the 4 hardcoded `DEFAULT_ROLES` for the
  whole session, silently missing any real custom role. Now fetches
  `roleService.getAll()` directly on mount here too, same real
  fetch+mapping `RoleDictionary.tsx` itself already does, so both stay
  genuinely in sync regardless of which sub-tab loads first. The flat
  staff table was also replaced with one section per real role (badge +
  real member count, own mini-table), scaling to however many real
  roles actually exist — 6, 60, doesn't matter, this always iterates
  the live `roles` list, never a fixed count. **Revised per direct
  follow-up:** a staff member with more than one role shows under their
  FIRST/primary role only (`u.roles[0]`) in this default browsing
  view — never duplicated across every role they hold. Explicitly
  filtering to one specific role from the dropdown is treated as a
  deliberate query, though, and still finds real membership via
  `.includes()` even when that role isn't someone's primary one — only
  the default, unfiltered view groups strictly by primary. A real,
  defensive "No Matching Role" section catches anyone whose own
  *primary* role doesn't match any currently-known role (e.g. a role
  renamed/deleted after assignment) — never lets them silently
  disappear from the screen entirely. **Real addition, per direct
  follow-up:** a small "+N" marker next to the staff member's own name
  when they hold more than one role — since the table now groups by
  primary role only, a secondary role wouldn't otherwise be obvious at
  a glance without checking the Role column separately. Names the real
  secondary role(s) directly on hover (a real `title` attribute), not
  just a bare, unexplained count.

  **Real fix (free-text staff search), per direct guidance:** the
  existing search box only ever matched name/email — widened to also
  match credentials, NPI, GMC number, license, and phone, each checked
  defensively (a person can genuinely have no credentials/GMC number).
  An admin who doesn't recall a name's spelling but has an NPI, or is
  looking someone up by phone, no longer comes up empty.

- **`AccessRequestsQueue.tsx`** — real feature, per direct follow-up:
  "Do we Track the request to gain access? I would think that would be
  a good quality metric. How long did the Admins take, Do we generate
  a ticket system that has its own status." A real, actionable admin
  queue for real Pediatric/Pool/Orchestration access requests, backed
  by `services/access/`. The department-wide turnaround-time rollup
  built on the same underlying data lives in
  `components/QualityAssurance/AccessRequestResponseTab.tsx` — this
  screen is where an admin actually resolves a request; that one is
  where a manager reviews aggregate response time.

## Notes

- **Correction to this file's own prior note:** the `Config/Users/`
  path comment on `RoleDictionary.tsx` mentioned as stale above is no
  longer present — confirmed directly while adding the Duplicate action
  (this pass). The general observation about self-documentation drift
  still stands as a real pattern worth watching for elsewhere in this
  app (e.g. `services/aiBehavior/IAIBehaviorService.ts`'s own stale path
  comment, found during the services/ review, unverified whether still
  present) — just no longer accurate as a live issue on this specific file.
- See `Common/README.md` for `Dropdown.tsx`'s own entry, and
  `System/README.md` for `ParticipationTypesSection.tsx`'s matching fix
  (the admin screen side of the same consolidation).

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
