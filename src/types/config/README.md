# types/config/

Org-hierarchy configuration shapes — separate from `services/organisation/` and `services/systemConfig/`, these are the specific per-tier config records.

## Files

- **`CaseMaskConfig.ts`** — per-organisation accession-number mask configuration (prefix, number series, facility-timezone-aware `{YEAR}` reset). Replaces an earlier temporary global `O26-NNNN` max+1 scheme. **Redesigned into a real three-level hierarchy** (Organisation → Facility/Site → Department), per direct guidance — see `services/caseRegistry/README.md` for the full account. `CaseMaskToken` gained `{CAT}`/`{DEPT}`; `CaseMaskConfig` gained `siteIndependentSequence?: Record<string, boolean>` alongside the existing `sitePrefixMap`, as a separate opt-in — a site can have a custom prefix with no independent counter, or the reverse.
- **`EnterpriseConfig.ts`** — Enterprise-tier feature flags (`reportingPlusEnabled`, default `false`) and record shape.
- **`HospitalConfig.ts`** — Hospital-tier feature flags (`reportingPlusEnabled`, default `true`) and record shape.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
