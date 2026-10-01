# TAT targets and case delegations: endpoints on the PathScribe API server

**Status:** specification for the API server team. The browser side is built and tested (Batch 353): each area has an interface and a demo implementation, and every screen goes through the interface. The endpoints are not built yet.

**Decision (Pete, Sep 27, 2026):** the TAT targets and the delegations "will need to move to services the API server owns". This is part one, the front end. Until the server is ready, the demo implementations keep the app demoable. When it is, an API client replaces them and the screens don't change.

**Stack:** ASP.NET Core API server over Microsoft SQL Server, with SignalR for live updates.

## 1. Where this was before Batch 353

| Data | Kept by | Read by |
|---|---|---|
| **TAT targets** | The TAT settings screen (`TATConfigSection.tsx`), in browser storage; the built-in defaults were a constant in that component | Search, the Quality tab, the Contribution dashboard, the Enterprise rollup and the facility/subspecialty reference check: each read the screen's storage itself |
| **Delegations** | Functions inside the demo case service (`mockCaseService.ts`) | Worklist, the report page's informal-review banner (deleted in Batch 355), the Delegate dialog, the Quality tab and Search imported that file directly |

## 2. What exists in the browser now

**`src/services/tatConfig/`**

| File | What it does |
|---|---|
| `ITatTargetService.ts` | **The contract:** `getAll`, `add`, `update` and `remove`, with errors `notFound`, `duplicateId` and `systemDefault` |
| `systemDefaultTatEntries.ts` | The built-in targets (ids start with `sys-`). The server seeds the same list |
| `tatTargetResolution.ts` | **Which target applies to a case** (most specific wins). Pure; the rule the server uses when it computes TAT (§5) |
| `tatConfigRules.ts` | Draft validation and conflict check for the editor (Batch 317) |
| `mockTatTargetService.ts` | The demo implementation |

**`src/services/delegations/`**

| File | What it does |
|---|---|
| `IDelegationService.ts` | **The contract:** `DelegationRecord`, `DelegationRequest`, and `list`, `delegate` and `complete`, with errors `notFound` and `caseNotFound` |
| `delegationRules.ts` | Pure rules: what a request does (`planDelegation`), which delegations wait on a user, and informal review requests as consultation records |
| `delegationStore.ts`, `mockDelegationService.ts` | The demo implementation. It updates demo cases through the demo case service |

`@/services` exports `tatTargetService`, `delegationService` and `delegationTypeService`.

## 3. TAT target endpoints

A `TATEntry` is defined in `src/types/quality/TatConfigEntry.ts`.

| Endpoint | Does | Errors |
|---|---|---|
| `GET /api/tat-targets` | Every target, active or not, system defaults included | — |
| `POST /api/tat-targets` | Adds a target | `409 duplicateId` |
| `PUT /api/tat-targets/{id}` | Replaces a target, including switching it on or off | `404 notFound` |
| `DELETE /api/tat-targets/{id}` | Deletes a target | `409 systemDefault` (switch it off instead); `404 notFound` |

- **Add and update are separate on purpose.** A duplicated entry is an add, even though it starts from an existing one; the caller says which.
- **Permissions.** Editing should need the admin access that opens the TAT settings screen. Reading should be open to any signed-in user, because dashboards and search resolve targets.
- **Audit.** The server should audit changes. Today the screen writes `tat_entry_created`, `tat_entry_updated`, `tat_entry_toggled` and `tat_entry_deleted` to the audit log itself.
- **Conflict check.** The server should repeat the editor's check: no two active entries with the same scope (`tatConfigRules.findTatConflict`).

## 4. Delegation endpoints

| Endpoint | Does | Errors |
|---|---|---|
| `GET /api/delegations?caseId=` | Delegation records, all or one case's | — |
| `POST /api/delegations` | Takes a `DelegationRequest`; updates the case as the delegation type requires, and records the delegation. Returns the record | `404 caseNotFound` |
| `POST /api/delegations/{id}/complete` | Marks it completed with the time. Completing it again returns the record unchanged | `404 notFound` |

**What `POST /api/delegations` does** (`planDelegation`, and the demo case service's `delegateCase` / `assignSynoptic`):

1. **Assigning a synoptic.** `SYNOPTIC_ASSIGN` with a chosen synoptic report and a user recipient assigns that report to the user, who finalises it for the attending to countersign. Without a chosen report, the case is delegated like any other type.
2. **Delegation types that transfer ownership** (`DelegationType.transfersOwnership`, admin-configurable) make the recipient the case's primary pathologist.
3. **`POOL`** clears the assignee and sets the pool. An Orchestration case's status becomes `pool`.
4. **Any other type** adds the recipient as a participant, with the role the type maps to (`delegationTypeMapper.ts`). It never changes the assignee or status.

Do the case update and the delegation record in one transaction. **Accepting a pool case** also marks that case's first pending delegation `accepted`; the pool-accept endpoint does this.

## 5. How TAT uses these

- **Case TAT** (Search's "past TAT target", the Quality tab and the dashboards) resolves a target with `resolveTatTargetHours`. The dimensions are:
  - the case's ordering facility;
  - its performing lab;
  - the first specimen's dictionary entry;
  - its subspecialty;
  - urgency (STAT or routine).
- **Consultation response and awaiting TAT** are measured on `CASUAL_REVIEW` delegations plus informal review requests (`informalReviewsAsDelegations`). Informal review requests replaced `CASUAL_REVIEW` delegations for new work.

## 6. Open items

- **List scope.** The demo `list()` returns every delegation; the quality calculations then pick the user's own. The server should return only delegations on cases the user can access, and a dashboard endpoint should return the user's figures rather than the raw records.
- **Live updates.** When a delegation is created or completed, the recipient's Worklist count should update through SignalR (see [LIVE_UPDATES_SIGNALR.md](LIVE_UPDATES_SIGNALR.md)).
- **Pool claim.** Claims (`ps_claims_v1`) are still kept by the demo case service.
- **Quality calculations still in a component folder.** `components/Contribution/qualityCalculations.ts` holds the outlier calculations; only the target resolver moved in this batch.
