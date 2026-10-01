# types/autopsy/

Core data model for the Autopsy Pathology Module (PS-261, RFP-APLIS-2026-GLOBAL §3.1.C). The real logic that consumes this type lives in `services/autopsy/` — see that folder's own README for what's actually built on top of it.

## Files

- **`AutopsyCaseDetails.ts`** — `caseAuthority` (`'medicolegal_forensic' | 'hospital_consented'`), `ForensicAuthorization` (now tracking both the real verbal order that authorizes intake/refrigeration and the real written order required before gross examination — confirmed directly against real research across all 14 target jurisdictions), `HospitalConsentRecord` (its own `revokedOrNarrowedAt` field carries a documented, deliberate TODO: it conflates full revocation with mere scope narrowing, and `services/autopsy/resolveAutopsyGrossExaminationGate.ts` blocks on either conservatively until a real, structured `status`/`scopeConstraints` redesign happens), PAD/FAD report snapshots, organ retention, and ancillary holds.
- Real, confirmed fix (per direct follow-up): this type was never actually attached to the app's real `Case` entity until this session — `Case.autopsy?: AutopsyCaseDetails` (`types/case/Case.ts`) is the real, missing link that makes accessioning an autopsy case possible at all.
- Real, confirmed correction (per direct follow-up: "Isn't the body usually the specimen?"): this type does NOT carry its own storage/location tracking. A body is a real `Specimen`, and `Specimen.locationHistory: MaterialLocation[]` already covers that — see `services/autopsy/resolveMortuaryStorageOccupancy.ts`'s own README entry for the full account of a duplicated mechanism that was built and then removed.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
