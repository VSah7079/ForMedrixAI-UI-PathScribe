# services/subspecialties/

Pathology subspecialty dictionary — pools, workgroups, member/physician/client assignment.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- `userIds` (member/assigned physicians) and `isWorkgroupEnabled` are now
  genuinely load-bearing, not just descriptive fields — as of a direct
  audit that found pool-claim actions had zero membership enforcement,
  `services/cases/mockCaseService.ts`'s `claimPoolCase`/`acceptPoolCase`
  now read both directly to decide whether a given pathologist can claim
  a case from a given pool. See that folder's own README for the real
  fix. Nothing in this folder's own files changed — worth knowing this
  data has a real, new consumer now, even though the change lives
  elsewhere.
- `isWorkgroup` (a separate flag — is this record a pool at all) is off
  for every subspecialty except `oncology-pool` in the current seed
  data, and no routing rule currently targets that one either — which
  subspecialties should actually be real, claimable pools is a
  deliberate product decision still pending, not something changed here.
- **Redesigned against FEAT-ROUT-01** (see `services/cases/README.md`'s
  `casePoolAssignmentService.ts` entry for the full account): `Subspecialty`
  gained `performingLabFacilityId?: string` (Global/scoped convention,
  same as `ContainerType`/`DelegationType`) — different performing labs
  now get their own separate pools of the same name (e.g. each lab's own
  "General Pathology"), rather than one shared pool org-wide. Also gained
  `isCatchAll?: boolean` — the real, primary source of truth for which
  pool a lab's unmapped specimens fall through to; `SubspecialtiesSection.tsx`
  enforces at most one catch-all per scope (setting it on one pool clears
  it from whichever pool held it before, for the same lab or Global).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*