# services/printRouting/

**Real, per PS-278 ("Print Destination Routing Engine — multi-criteria
rules, printer mapping hierarchy, IP protocol abstraction").** Decides
*which printer* a print job should go to, once
`services/delivery/` (Component C) has already decided a real print is
happening at all. See `services/printing/README.md` for where this
plugs into the rest of the real dispatch pipeline (Mode 3,
`DIRECT_NETWORK_PRINT`), and `services/printing/transport/` for the
three real IP protocol clients this engine's own resolved destination
is actually sent over.

## Why this is a new folder, not a new field on an existing rule set

Checked directly before writing anything here — none of this app's
three existing, real "admin rule → resolve something" engines are the
right shape to extend:

- `services/routingRules/` (`RoutingRule`/`TemplateRoutingService`) —
  maps one entity (a client/physician/protocol) to one report
  **template**. A genuinely different target and a genuinely
  different real precedence convention (see below).
- `services/delivery/` (`DeliveryRule`/`resolveDeliveryAction`) —
  decides **whether** a report is printed at all (Electronic Only /
  Print Only / Dual / Suppress), from up to four independently-
  optional criteria, most-specific-wins by score. This engine
  deliberately runs *after* that one has already said "yes, print" —
  it never re-decides that question, and reuses two of that engine's
  own real criteria directly (see below) rather than re-resolving them.
- `services/caseRegistry/resolveCaseMaskScopeCandidates.ts` — the real,
  ordered Department → Facility → Enterprise candidate-list shape.
  Structurally the closest real precedent to this ticket's own
  "printer mapping hierarchy," but a CaseMask resolves **whole-record**
  at whichever scope wins; this engine's own real, additional
  Specimen/Case Type and Event Trigger Type criteria need to also be
  checked *within* whichever scope tier wins — a genuinely different,
  two-layer real requirement neither existing shape covers alone.

## The real, deliberate hybrid this engine implements

See `types/printRouting/PrintRoutingRule.ts`'s own header for the full
account, and `resolvePrintDestination.ts`'s own header for the exact
algorithm. Short version:

- **Outer pass** — a strict, ordered walk of PS-278 §2.1.2's own four
  named tiers, most to least specific: `workstation` → `location` →
  `clientAccount` → `facility`. The first tier with any real, active,
  matching rule wins outright — never scored against a less specific
  tier.
- **Inner pass** — *within* that one winning tier, more than one real
  rule can share the same scope; PS-278 §2.1.1's own two, independently
  optional criteria (`specimenCaseType`, `eventTriggerType`) are scored
  most-specific-wins, same real convention `resolveDeliveryAction.ts`
  already establishes for Component C.

`resolvePrintDestination.test.ts` and `PrintRoutingRule.ts`'s own
header cover the full, real reasoning and edge cases (a criterion that
doesn't match disqualifies a rule entirely at that tier — it never
becomes a weaker match; the resolver falls through to the next tier
instead).

## What's real and closed here

- **`types/printRouting/PrintDestination.ts`** — `PrintProtocol`
  (`RAW_9100` | `LPR_LPD` | `IPP` — real, per §2.1.3's own three named
  protocols; "print-server abstraction" is deliberately NOT a fourth
  member here — see that file's own header for why it's already
  exactly `PrintDeliveryMode.INTERFACE_ENGINE_HANDOFF`, a real,
  pre-existing capability, not a gap) and the real network target
  shape (`ipAddress`/`port`/`queueName`/`resourcePath`).
- **`types/printRouting/PrintRoutingRule.ts`** — the rule shape, the
  real `SpecimenCaseType`/`EventTriggerType` classifications (new,
  confirmed not to already exist anywhere under this exact
  vocabulary), and `mapReportTypeToEventTriggerType()` — a real, direct
  mapping from the already-wired `ReportReleasedEventType`, never a
  second, independently-maintained classification of the same event.
- **`IPrintRoutingRuleService.ts` / `mockPrintRoutingRuleService.ts`**
  — real CRUD, `localStorage`-backed like every other mock service in
  this app, seeded with one real, demonstrable rule at each of the
  four tiers (built against the same Fenwick General Hospital demo
  data `mockLocationService.ts`/TAT config already use, not a
  parallel demo site).
- **`resolvePrintDestination.ts`** — the pure, testable resolver (see
  above). 16 tests covering both passes independently and together.
- **`resolveRealPrintRoutingContext.ts`** — resolves the real, live
  criteria this app actually has for a given case, same real split
  `resolveRealDeliveryDecision.ts` already establishes for Component
  C. Reuses `Case.order.locationId → Location.pointOfCare` and
  `Case.order.facilityId` **directly** — the exact same real fields
  Component C's own `DeliveryRule.pointOfCare`/`orderingFacilityId`
  already resolve against, never a second, parallel lookup. Now also
  resolves Specimen/Case Type (via `wasCaseFrozenSectioned.ts`) and
  User/Workstation identity — see the two closed-gap sections below.
- **`wasCaseFrozenSectioned.ts`** — the real Frozen Section vs. Routine
  Surgical inference (see closed-gap section below).
- **`components/Config/System/PrintRoutingRuleSection.tsx`** — the real
  admin UI for authoring `PrintRoutingRule` records (see closed-gap
  section below).

## Closed gap — Specimen/Case Type (`wasCaseFrozenSectioned.ts`)

Previously disclosed here as an honest gap defaulting to
`ROUTINE_SURGICAL`. Now real and closed: **`wasCaseFrozenSectioned.ts`**
finds the real, existing (if indirect) signal this app already has —
the one-directional `IntraoperativeEntry.mergedIntoCaseId` reverse
lookup (the only real link from an intraop entry to a `Case`) plus that
entry's own `IntraopSpecimen.milestones` containing a real
`frozen_section_cut` `MilestoneType` — the exact same pattern
`IntraopLinkageTab.tsx` and `qualityCalculations.ts` already use
elsewhere, not a new or parallel mechanism. `resolveRealPrintRoutingContext.ts`
now calls it directly whenever `source` isn't `CYTOLOGY` and no
`specimenCaseTypeOverride` was supplied, honestly returning `false` (and
so `ROUTINE_SURGICAL`) on any service error rather than throwing. See
`wasCaseFrozenSectioned.test.ts` for the covered cases (merged +
milestone present, merged without the milestone, never merged, a
still-pending intraop entry correctly ignored, and the service-error
fallback).

## Closed gap — User/Workstation identity threading

Previously disclosed here as unavailable at the automated, event-publish
dispatch layer. Now real and closed: `publishReportReleasedEvent.ts`
already resolves `event.releasedBy?.id` at every real call site — it
just wasn't forwarded the one hop further into the print-routing
context. It now is, alongside the already-established
`getEffectiveScanStationId()` utility (the same device-persisted /
logged-in-user fallback `mockAuditService.ts`, `CaseRouter.ts`, and
`mockReportVersionService.ts` already use) for `workstationId`. Both
are real, best-effort values — `userId` is honestly `undefined` when no
`releasedBy` was given, and this never fabricates an identity that
doesn't actually exist for a given dispatch.

## Closed gap — Admin UI (`PrintRoutingRuleSection.tsx`)

Previously disclosed here as the same already-accepted "no admin UI"
gap `services/delivery/README.md` names for `DeliveryRule`. Now real
and closed for this engine:
`components/Config/System/PrintRoutingRuleSection.tsx` is a full CRUD
admin UI (rule table, Add/Edit modal, live Test panel resolving a real
destination via `resolvePrintDestination.ts` directly), following the
exact same three-part pattern `DeliveryRulesSection.tsx` already
establishes and reusing its CSS classes verbatim — zero new CSS. Wired
into the System config tab under `print_routing_rules`. See that
component's own header comment and
`components/Config/System/README.md` for the UI-layer account.

---
*See [services/README.md](../README.md) for how this folder fits the
whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
