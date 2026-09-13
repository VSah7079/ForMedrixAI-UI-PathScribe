# services/roles/

Staff role dictionary — permissions, case/config access, pediatric-viewing gate, Orchestration/Outreach visibility.

**Pattern:** Standard interface/mock/firestore pattern.

**Real addition, per direct design brief on the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section Dashboard:** `'or-staff'` role added, same real "directory only — no app access" posture as the existing `'physician'` role (`caseAccess: false, configAccess: false`, an empty `DEFAULT_ROLE_PERMISSIONS` entry in `constants/systemActions.ts`). OR staff (RN, circulator, surgeon) never log into the main app — they exist in this directory only to be resolved by `quickAuthPin` and attributed on the Intraoperative Dashboard's own audit log.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*