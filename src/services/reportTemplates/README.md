# services/reportTemplates/

Report Template assembly — ordered AssemblySlots referencing reportParts/ building blocks. Also home to TemplateRoutingService, the Pass 0-0a-0b-1-2-3 resolution chain.

**Pattern:** Standard interface/mock/firestore pattern for the CRUD side; TemplateRoutingService.ts is separate routing logic.

## Files

- **`TemplateRoutingService.ts`** — Client override -> Physician preference -> Synoptic protocol -> Subspecialty -> Gold Standard resolution chain for which report template a case gets. **Real addition (Report Template by facility, if none defined then Enterprise), per direct guidance:** new Pass 0a — a facility with no own client-override rule rolls up to its real Enterprise parent's own rule, one real hop (`Facility.parentId`), same established pattern `resolveInterfaceEngineConnectionForFacility`/`resolveLisRoutingForFacility`/`resolveIdentifierFormatsForFacility` already use in `services/facilities/IFacilityService.ts` — confirmed and reused directly, not reinvented. No new admin UI or storage needed: an Enterprise's own template preference is just an ordinary `type: 'client'` `RoutingRule` keyed on its own facility id — `RoutingRulesTab.tsx`'s existing client picker already lists every real facility, Enterprise or affiliate alike, with nothing excluding Enterprise-flagged ones. `resolveReportTemplateAsync()` resolves the real Enterprise id via `mockFacilityService.getById()` before calling into the pure resolver — an Enterprise-type facility itself never gets one resolved, since it has nothing further to roll up to. New `TemplateRoutingService.test.ts` (8 tests — previously this file had zero direct test coverage despite being real, consequential production routing logic): facility-specific override always wins over Enterprise even when both exist, Enterprise fallback fires only when the facility's own lookup fails, falls through correctly when neither has a rule, Pass 0a correctly marked unreached when Pass 0 already resolved it, and the real async wrapper's actual Facility-lookup integration (mocked service boundary, not just the pure resolver).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*