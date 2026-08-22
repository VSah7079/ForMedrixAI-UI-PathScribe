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

  Also still has the previously-noted, now-doubly-confirmed stale header
  path comment (`src/components/Config/Users/RoleDictionary.tsx` — file
  lives in `Config/Staff/`) — left as a known cosmetic item, not touched
  this pass.

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

- The stale `Config/Users/` path comment on `RoleDictionary.tsx` (still
  unfixed — see above) suggests this folder was renamed from `Users/` to
  `Staff/` at some point — same class of self-documentation drift as
  `services/aiBehavior/IAIBehaviorService.ts`'s stale path comment found
  during the services/ review.
- See `Common/README.md` for `Dropdown.tsx`'s own entry, and
  `System/README.md` for `ParticipationTypesSection.tsx`'s matching fix
  (the admin screen side of the same consolidation).

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
