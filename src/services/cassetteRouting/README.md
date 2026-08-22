# services/cassetteRouting/

Admin-configurable rules resolving which logical cassette color (`services/cassetteColors/`) an order routes to, based on protocol, priority, origin station, ordering facility, and case type. Fully admin-manageable through Configuration → Cassette Routing Rules — an admin can link any real protocol to any real color and set a priority weight, all without code.

**Pattern:** Standard interface/mock pattern (no firestore stub currently).

## Files

- **`ICassetteRoutingRuleService.ts`** — the contract: `CassetteRoutingRule` (conditions, `colorId`, `priorityWeight`), `CassetteRoutingConditions` (`protocolId` — single id, not an array; `priority` — array of `CassetteRuleOrderPriority`; `originStationId`; `orderingFacilityId`; `caseType`; `decantType` — for cell-block-specific rules), `CassetteRuleOrderPriority`.
- **`mockCassetteRoutingRuleService.ts`** — the real, active implementation, `localStorage`-backed. Seeds: Renal Protocol → Blue (weight 10), Cell Block → Green/Mesh (weight 50, decantType-scoped), STAT Override → Red (weight 90, priority-only, beats everything), and four Small Biopsy → Yellow rules (skin punch, prostate core, breast core, endometrial — one rule per protocol, since `conditions.protocolId` is a single id).

## Notes

- The real evaluation engine (`utils/evaluateCassetteRouting.ts`) is a pure function taking this folder's rules/colors plus a resolved `Protocol` list — deliberately kept out of `services/` so it can be unit-tested without any real service mocking. `utils/resolveBlockCassetteColor.ts` and `utils/resolveDecantCassetteColor.ts` are the thin, async wrappers that actually fetch and call it.
- Cassette type/form-factor is deliberately never a second field here — it always comes from the matched protocol's own processing format, so it can never drift from the real protocol definition.
- A real "small biopsy" category spanning several genuinely different protocols needs one rule per protocol — `protocolId` has no array form. Higher `priorityWeight` wins when more than one rule genuinely matches the same order.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
