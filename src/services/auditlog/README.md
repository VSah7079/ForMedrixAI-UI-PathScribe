# services/auditlog/

System-wide audit log — AI actions, user changes, system events.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- **Signing-authority facility override events (Sep 2026)** — four new `type: 'user'` event names, written by `components/Config/System/ParticipationTypesSection.tsx` via `services/participationTypes/authorityProvenance.ts`'s `buildFacilityOverrideAuditEntry()`: `Signing-authority facility override added` / `changed` / `removed (reverted to inherited default)` / `justification updated`. Each sets `facilityId`, records the acting admin in `user`, and puts every changed flag (from → to) plus the admin's justification — or an explicit "Justification: none given" — in `detail`. Built for regulatory audits (NATA, RCPath, CPSO, MHW…) of any local override of a jurisdiction's signing-authority default. PHI-free by construction (configuration identifiers only).

- PHI-safe by design — AuditLog.detail is documented as containing no patient names, DOB, MRN, or clinical values.
- **`AuditLog.facilityId`** — added August 2026, per direct specification, building the Post-Sign-Out Release Buffer's own Phase 5 (audit-logging polish). A real, optional, additive field — genuinely absent for the many pre-existing audit calls across this app that don't populate it, not backfilled. See `services/reportRelease/README.md`'s own Phase 5 section for the full story, including two real, app-wide gaps found and fixed in `components/Audit/useAuditLog.ts` and `audit/auditLogger.ts` along the way (a hardcoded `caseId: null` that discarded every real caller's own case id, regardless of what they passed) — not scoped narrowly to this one new field, since the same fix pattern closes the gap for `caseId` too.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*