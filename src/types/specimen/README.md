# types/specimen/

Input shape for adding a specimen mid-workflow (accessioning/grossing), distinct from the persisted `Specimen` shape in `types/case/`.

## Files

- **`AddSpecimenPayload.ts`** — deliberately carries no `hospitalId`/`siteId`: a specimen can't belong to a different facility than its parent case, so that's derived from `Case.originHospitalId` at dispatch time rather than duplicated here.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
