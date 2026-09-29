# services/delivery/

Component C of the "Decoupled Dispatch & Print Management System" spec — the Delivery Configuration Rules Engine. Decides, for a given real release, whether it goes out electronically, physically, both, or neither, before either real subscriber (electronic dispatch in `services/reports/`, print in `services/printing/`) ever runs.

**Pattern:** standard interface/mock pattern for the rules themselves (`IDeliveryRuleService`/`mockDeliveryRuleService`), plus two pure resolver functions kept deliberately separate from each other and from the data layer.

## What's real and built

- **`types/delivery/DeliveryRule.ts`** — the rule shape. All four real criteria the source spec names (Provider ID, Ordering Facility, Patient Location, Report Type) are optional on a rule — an unset criterion is a wildcard, never a mismatch. `action` is exactly the source spec's own four options: `ELECTRONIC_ONLY | PRINT_ONLY | DUAL | SUPPRESS`. Checked directly before building this type: `services/routingRules/RoutingRule` (template routing's own rule shape) maps one entity dimension to one target — a genuinely different, incompatible shape from a rule combining up to four criteria to one of four actions, so this is a new type, not a forced reuse.
- **`IDeliveryRuleService.ts` / `mockDeliveryRuleService.ts`** — real CRUD for admin-defined rules, `localStorage`-backed like every other mock service in this app.
- **`resolveDeliveryAction.ts`** — the pure, testable resolver. Real, most-specific-wins scoring, same precedence convention `services/reportTemplates/TemplateRoutingService.ts`'s own passes already establish: a rule disqualifies itself the moment any criterion it specifies doesn't match the real input; the rule matching the most real criteria among the remaining, qualifying ones wins; ties broken by whichever was updated more recently. Defaults to `ELECTRONIC_ONLY` — the source spec's own stated default ("Default for EHR-integrated providers") — only when no real, active rule qualifies at all. 10 tests, including the source spec's own Use Case 2 (a facility-scoped rule) and Use Case 3 (an OR/Preliminary-scoped rule) as direct scenarios.
- **`resolveRealDeliveryDecision.ts`** — resolves the real, live criteria for an actual case (`Case.order.orderingPhysicianId`/`facilityId`, and — the one criterion with no obvious source — `pointOfCare`, which turned out to already exist as `Location.pointOfCare`, HL7 PV1-3.1, reachable via the case's own `order.locationId`; no new `Case` field was needed for this engine at all) and hands them to the pure resolver above, never duplicating its matching logic. 5 tests.

## Where this is wired in

`services/reports/publishReportReleasedEvent.ts` calls `resolveRealDeliveryDecision` **before** either real subscriber (electronic dispatch, print) runs at all, then gates both behind the resolved action — `ELECTRONIC_ONLY`/`PRINT_ONLY` run exactly one subscriber, `DUAL` runs both concurrently (`Promise.all`, not sequential), `SUPPRESS` runs neither (the event is still logged — suppressed means no dispatch, never "this release never happened"). See `services/reports/README.md`'s own entry on `publishReportReleasedEvent.ts` for the full account, including a real bug found and fixed there: a transient failure resolving the delivery decision itself must degrade to the same `ELECTRONIC_ONLY` default, never abort the whole publish call and block both real subscribers over an incidental lookup failure.

## Real, deliberate scope not yet built

- **Closed — stale claim corrected.** This line previously said no admin UI existed. Found, while addressing an external release-readiness review, that this was no longer true and had gone uncorrected: **`components/Config/System/DeliveryRulesSection.tsx`** is a real, wired admin UI (rule table, Add/Edit modal, live Test panel calling `resolveDeliveryAction.ts` directly), registered under `'delivery_rules'` in the System tab. It predates this correction — the README simply never caught up with the actual codebase. `services/printRouting/README.md`'s own equivalent gap for `PrintRoutingRule` is now closed the same way (`PrintRoutingRuleSection.tsx`), copying this file's exact three-part pattern.
- **This engine itself applies to every real source uniformly** — it runs inside `publishReportReleasedEvent.ts` at the event level, before any source-based branching, so a Cytology or Autopsy release is gated by the same real rules as Surg Path. The one real, remaining Cytology gap is its own complete lack of an amendment mechanism (see `services/cytology/README.md`) — not something this engine itself is missing.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
