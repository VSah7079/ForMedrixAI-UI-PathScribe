# services/users/

Staff user directory — the full user profile (name, roles, NPI, license, department, voice profile) underlying login/staff assignment.

**Pattern:** Standard interface/mock/firestore pattern.

**Real addition (this session):** `StaffUser.canAccessCrossTenantQa?: boolean` — a granular permission distinct from `role: 'superadmin'`, grants cross-tenant visibility specifically for QA/compliance reporting views without granting the broader platform-admin case-access bypass superadmin implies. Same pattern as the existing `canViewPediatric`/`canViewOrchestration` flags — defaults to false/undefined, must be explicitly granted. See `services/auth/README.md` for the real enforcement (`canViewCrossTenantQaData()`) and why this was added.

**Real addition, per direct design brief on the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section Dashboard:** `StaffUser.quickAuthPin?: string` — the real, working PIN half of that dashboard's own "badge tap or PIN" quick-auth flow (`services/intraopDashboard/resolveStaffByQuickAuthPin.ts`), only meaningful for a real `'or-staff'`-role user. **A real, pre-existing gap found while adding this**: `components/Config/Staff/StaffTab.tsx` declares its own, local `StaffUser` interface instead of importing this real one — structurally near-identical, but a second copy that has to be kept in sync by hand; the new field had to be added there too. Not restructured here — a real, separate consolidation.

**Real, new consumer (PS-286, Sep 2026):** `getAll()`, filtered to `roles.includes('Pathologist') && status === 'Active'`, is now how `pages/SlideDistributionStationPage/hooks/useSlideDistributionStation.ts` populates its own Pathologist quick-picker grid — the first real place this directory drives an individual-slide assignment, as opposed to case-level `assignedTo`. Read-only; nothing in this folder's own files changed.

**Spelling language (PS-342, Batch 338):** `StaffUser.spellingLocale?: string | null`, the pathologist's preferred spelling language (`services/spellcheck/spellingLocales.ts`). Null means the facility default. A case assigned to the pathologist is spell-checked in it unless the case has its own choice. Set in Staff → edit; the local `StaffUser` copy in `StaffTab.tsx` gained the field too.

**SSO accounts (PS-60, Batch 343):** `StaffUser.externalIdentities?: ExternalIdentityLink[]`, the single-sign-on accounts a person signs in with (provider, issuer, permanent account id, when and how linked). Sign-in matches on these, never on email alone; a first sign-in can add one by email (`services/auth/externalIdentity.ts`). No admin screen shows them yet.

## Batch 370 (PS-356)

`StaffUser.facilityIds` (new, optional) is the facilities this person works for; empty means all. It narrows where their capabilities apply and doesn't change which cases they can open.

Screens change staff through `services/staff/staffAdministration.ts`, never `userService.add/update` directly.

## Batch 371

New seed staff record `PATH-SJ-001` (Dr. Sarah Johnson, Pathologist, ORG-DVMC). Her demo sign-in is now `pathologist`, not `superadmin`, and without the record she'd have no organisation and so no case access. `USERS_VERSION` was bumped to 10, which replaces a stored staff list with the seed on next load.

## Batch 374

Staff records for the four bench demo users (ACC-001, HT-001, CT-001, MT-001) and for Michelle Nimmo (PATH-MN-001, Pathologist + Admin). Michelle's sign-in had no staff record, so she held no role. `USERS_VERSION` is 11.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*