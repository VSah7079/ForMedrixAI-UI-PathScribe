# services/users/

Staff user directory — the full user profile (name, roles, NPI, license, department, voice profile) underlying login/staff assignment.

**Pattern:** Standard interface/mock/firestore pattern.

**Real addition (this session):** `StaffUser.canAccessCrossTenantQa?: boolean` — a granular permission distinct from `role: 'superadmin'`, grants cross-tenant visibility specifically for QA/compliance reporting views without granting the broader platform-admin case-access bypass superadmin implies. Same pattern as the existing `canViewPediatric`/`canViewOrchestration` flags — defaults to false/undefined, must be explicitly granted. See `services/auth/README.md` for the real enforcement (`canViewCrossTenantQaData()`) and why this was added.

**Real addition, per direct design brief on the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section Dashboard:** `StaffUser.quickAuthPin?: string` — the real, working PIN half of that dashboard's own "badge tap or PIN" quick-auth flow (`services/intraopDashboard/resolveStaffByQuickAuthPin.ts`), only meaningful for a real `'or-staff'`-role user. **A real, pre-existing gap found while adding this**: `components/Config/Staff/StaffTab.tsx` declares its own, local `StaffUser` interface instead of importing this real one — structurally near-identical, but a second copy that has to be kept in sync by hand; the new field had to be added there too. Not restructured here — a real, separate consolidation.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*