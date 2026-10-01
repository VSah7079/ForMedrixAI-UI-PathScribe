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

## RoleDictionary: localized Duplicate, no inline CSS (Batch 317, PS-73)

Duplicate now uses `services/duplication` → `duplicateRole`, which forces `builtIn: false` and takes the name from `t('common.copyOfName')`. It used to store an English `"(Copy)"`.

The file's 11 inline styles are gone:

- Checkbox sizes are `ps-rd-cb--size-16/18/20`.
- Role and participation badges pass `--ps-hue`, and CSS derives the tints with `color-mix()`.
- Permission and category bars pass `--rd-pct`.

## Jurisdictional credentials & appointments (Batch 331, PS-327)

The Staff edit form has a new **Jurisdictional credentials & appointments** section. Before it, `StaffUser.providerCredentials` existed only in the data model, so nobody could be given one.
- **Each row** has a credential type (the known types from `services/staff/resolveNormalizedCredentialCapabilities.ts`, with translated names), issuing body, jurisdiction (translated names), effective date and optional expiry.
- **Validation** is in `services/staff/providerCredentialRules.ts`.
- **Audit:** each add or remove is written to the audit log as "Staff credentials changed".
- **What it's for:** this is how a pathologist is given a forensic (medicolegal) appointment, which forensic autopsy sign-out now requires (`services/autopsy/README.md`), or a UK Advanced Specialist cytology diploma.
- **Inline styles removed.** The per-role colour chips and badges (4 inline styles) now set only `--ps-hue`, and `.ps-st-role-chip` / `.ps-st-role-badge` derive their colours with `color-mix`.
- **Checked in the browser:**
  - the section renders and validates;
  - saving stores the credential;
  - the audit entry reads "Jurisdictional credentials for … added MEDICOLEGAL_APPOINTMENT (…)".

## Spelling language preference (Batch 338, PS-342)

Staff → edit has a **Spelling language** select (id `staff-spelling-locale`), saved as `StaffUser.spellingLocale` (null = use the facility default). When a case is assigned to this pathologist, its report is spell-checked in this language unless the case has its own choice (Pete, Sep 26: "dynamically inherit the pathologist's user-profile preferences when a case is assigned"). The options are the available languages from `services/spellcheck/spellingLocales.ts`, with translated names (`spellCheck.locales.*`).

## Linked sign-in accounts (Batch 345, PS-60 follow-up)

**`LinkedSignInAccounts.tsx`**, shown in the edit modal (not when adding):
- **What it lists:** the person's single-sign-on accounts, meaning provider, shortened account id, when, and how linked (first sign-in, administrator, directory sync).
- **Unlink:** one confirmation, takes effect at once (not part of Save), audited as *SSO account unlinked*.
- **Where the logic is:** `services/auth/linkedAccounts.ts`.
- **What the screen tells admins:** with linking by email on, an unlinked account links again at its next sign-in while the email still matches. To keep someone out, deactivate them or change the email too.

## Role Dictionary: Capabilities (Batch 369, PS-355)

- **New `RoleCapabilitiesTab.tsx`**: the enforced part of a role, and the tab the role editor now opens on.
  - Capabilities are grouped the way admins know the app: Report history, then the Quality Assurance pillars.
  - Each shows its description, an **Audited** tag for high-risk ones, the `domain:object:verb` key, and what it needs or is needed by.
  - **Dependency prompt (per Pete):** turning on a capability that needs another lists what's missing and offers to turn it on too. Turning off one that others need lists those and offers to turn them off too. Cancel leaves the role as it was. The group select-all goes through the same prompt.
  - What depends on what comes from `services/authorization` (`planGrant` / `planRevoke`).
- **The old Permissions tab is renamed Commands.** Those 189 voice and keyboard commands were never enforced, and the tab now says so. The list column is renamed too, and a Capabilities count column is added.
- **Saving writes an audit entry** "Role capabilities changed", naming the signed-in user and what was granted or removed.
- **`StaffTab.tsx`**: the staff role picker leaves out roles that can't be assigned (Superadmin).
- **`roleDictionaryControls.tsx`**: `TriCheckbox` / `DivCheckbox`, moved out of `RoleDictionary.tsx` so both tabs use them.
- **`RoleDictionary.tsx`** takes `actionRegistryService` and `participationTypeService` from `@/services` and is off the deployment baseline.
- **Unchanged for phase 2 (PS-356):** the role-level Pediatric Access switch and the Facility Access tab. They still do nothing and still show.

## Batch 370 (PS-356): who can change roles and staff

- **The self-escalation gap.** Anyone signed in could save any role and any staff member's roles; that is now closed.
- **`RoleDictionary.tsx`:**
  - Saves go through `services/roles/roleAdministration.ts` (`config:roles:manage`). A refusal is shown in the modal; the lockout guard, for example, explains that another role must be able to manage roles first.
  - Add Role, Duplicate and Save are `CapabilityButton`s.
  - The role-level Pediatric Access checkbox and column, the Facility Access tab and column, and the "Pediatric Access Granted/Revoked" audit entry (which recorded a change with no effect) are removed, along with their locale keys and CSS.
- **`StaffTab.tsx`:**
  - Saves go through `services/staff/staffAdministration.ts`. `config:staff:edit` covers any save; `config:staff-access:assign` is also needed to change roles, the new **Facilities** assignment, pediatric/orchestration access or credentials.
  - Without the second, those fields show read-only, with a note.
  - Add staff and Save are `CapabilityButton`s.
  - The credentials audit moved into the service.

## Batch 371: Superadmin is read-only here

Pete: hospital administrators have no control over Superadmin.
- **In the Role Dictionary list**, its row is labelled "managed by ForMedrixAI". It has View instead of Edit, and no Duplicate.
- **Its role editor opens read-only**, with a banner saying it's ForMedrixAI's, that it can't be changed or given to anyone, and that support opening a case is audited. There is no Save.
- **Hospital roles' Capabilities tabs** don't list the ForMedrixAI platform group. Their capability count excludes it too.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
