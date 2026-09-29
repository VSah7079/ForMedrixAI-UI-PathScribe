# services/delegations/

**Case delegations behind a service (Batch 353).** Pete: delegations "will need to move to services the API server owns". This is the front-end half; the endpoints are specified in [docs/architecture/TAT_AND_DELEGATION_API.md](../../../docs/architecture/TAT_AND_DELEGATION_API.md).

Before this, delegation records and the functions that read and wrote them (`getDelegations`, `completeDelegation`) lived inside the demo case service, and screens imported that file directly. The delegation *types* (labels, colours, whether a type transfers ownership) are a separate dictionary: `services/delegationTypes/`.

## Files

- **`IDelegationService.ts`**: the contract. `@/services` exports it as `delegationService`.
  - `DelegationRecord`, `DelegationRequest` (case, requestor, type, a user or pool recipient, an optional synoptic report, a note).
  - `list({ caseId? })`, `delegate(request)` and `complete(id)`. Completing twice is a no-op success.
- **`delegationRules.ts`** (+ `.test.ts`): pure decisions the screens used to make.
  - `planDelegation`: `SYNOPTIC_ASSIGN` with a chosen synoptic assigns that report; anything else delegates the case to the user or pool. This was in the Delegate dialog.
  - `pendingDelegationsTo`: the Worklist's "Delegated to me".
  - `informalReviewsAsDelegations`: informal review requests as `CASUAL_REVIEW` records, for consultation TAT.
- **`delegationStore.ts`**: the demo records, under their original key `ps_delegations_v1`, with the five seeded demo delegations (moved from `mockCaseService.ts`). The demo case service writes here when it delegates a case, assigns a synoptic or accepts a pool case.
- **`mockDelegationService.ts`** (+ `.test.ts`): the demo implementation. `delegate()` updates the demo case through `mockCaseService.delegateCase` / `assignSynoptic`, which record the delegation. `assignSynoptic` now returns its record.

## Now using the service

- The Worklist's "Delegated to me" count.
- The Delegate dialog, which also gets delegation types through `delegationTypeService`.
- The Quality tab's consultation TAT.
- Search's "delegated to" pathologist role.

## Still open

- Pool claims (`ps_claims_v1`) are still kept by the demo case service.
- The demo `list()` returns every record. The server should scope it to cases the user can access; see the API document §6.

## Batch 355 (PS-346)

The informal-review banner and `findPendingInformalReview` were deleted. The banner wasn't shown by any page, since informal reviews moved to `InformalReviewRequest`. `complete()` stays in the contract, but nothing on screen calls it now.

## Batch 381

`delegate()` checks `case:delegation:create` first and returns `notPermitted` without changing anything. The capability is seeded to every role with case access (Pete: keep today's users).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
