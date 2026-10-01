# utils/__tests__/

Tests for utils in the parent `utils/` folder that don't have their own dedicated, co-located test file (most `utils/` files use a co-located `*.test.ts` instead — these two are the exceptions, tested from this shared folder).

## Files

- **`evaluateCassetteRouting.test.ts`** — tests the real cassette-routing rule evaluation engine (`evaluateCassetteRouting.ts`) against real `CassetteRoutingRule`/`CassetteColorDefinition` shapes.
- **`evaluateMicroscopicFinalizeGate.test.ts`** — tests the real microscopic-description finalize gate (`evaluateMicroscopicFinalizeGate.ts`).

---
*See [utils/README.md](../README.md) for the parent folder.*
