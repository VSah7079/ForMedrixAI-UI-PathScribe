# services/supportAccess — ForMedrixAI support access (Batch 372)

The hospital, as data controller, decides whether ForMedrixAI support may reach its data, approves each visit, and owns the record of what support did. Built from Pete's specification of Sep 28, 2026.

"Support access" means a **Superadmin session reaching an organisation the person isn't a staff member of** (`caseAccessControl.isCrossTenantSupportAccess`). ForMedrixAI people working in their own organisation, and every hospital user, are unaffected.

**Demo starting policies (Batch 373, `demoSupportAccessSeed.ts`).** Desert Valley, Manchester and Midwest start at Approval required; each has an Admin who can approve (Pete Nimmo / user 3, Bronwyn Prior, Amber Fehrs-Battey). Henry Ford, Fenwick and the ten international screening labs have nobody who could approve, so they start at Always allowed: their cases stay visible to ForMedrixAI demo accounts, and every look is recorded in their support audit. An organisation's own saved settings replace the seed. A real deployment has no seed.

**Cases with no resolvable organisation.** A case whose hospital id isn't in any organisation's `legacyTenantIds` has no policy to apply and no stream to record in, so the gate lets it through; the Batch 371 check (`platform:cross-tenant-cases:view`, audited in the main log) still applies. Since Batch 373 every demo case resolves (`facilities/facilityHierarchy.linkFacilitiesToOrganisations`), so this applies only to data entered later with an unknown hospital id.

## The policy (per organisation)

| Policy | What support can do |
|---|---|
| Disabled | Nothing: the organisation's cases are left out of lists and searches, and opening one is refused. |
| **Approval required** (default) | Support requests access per ticket, with a reason (10+ characters). An approver in the organisation approves or rejects. An approval lasts the organisation's **access window** (30 min, 1, **2 (default)**, 4 or 8 hours), or less if support ends it or the hospital revokes it. |
| Always allowed | Support reaches the data without asking. Everything is still recorded. |

Capabilities (seeded to Admin; hospitals grant them to whichever roles they choose):
- `config:support-access:policy`: set the policy and window.
- `config:support-access:approve`: approve, reject, revoke. The approver must be a member of that organisation and not the requester (a Superadmin holds every capability, so the capability alone isn't enough).
- `config:support-audit:view`: see and export the support audit.

## The support audit stream

Each organisation has its own append-only stream, separate from the main audit log. Every entry records the time, the actor, the ticket, the action, the case ids disclosed, and a PHI-free English detail. It is **hash-chained**: each entry's SHA-256 covers its fields and the previous entry's hash, so a changed, removed or reordered entry breaks the chain (`verifySupportAuditChain`), and the screen and the JSON export say where.

Recorded: policy changes; requests, approvals, rejections, expiries, early ends and revocations; refused opens; case opens and edits; every list, search or report that disclosed the organisation's cases (with the case ids); searches (the criteria **names**, never the values, which can be patient names); audit exports.

Export: CSV or JSON, columns `Timestamp | Support agent name | Originating IP | Originating country | Ticket ID | Action taken | Case IDs | Detail`. Cells starting `= + - @` are neutralised.

## Files

| File | What it holds |
|---|---|
| `supportAccessRules.ts` | Pure rules: the decision, expiry, request and decision problems, the hash input and chain check, export rows, queues, window display. |
| `supportAccessService.ts` | `createSupportAccessService(deps)`: settings, requests, decisions, the audit stream, export. Every hospital action checks its capability with `authorizationService.enforce`. |
| `defaultSupportAccessService.ts` | The mock wiring: storage, session, enterprise facilities, staff and roles, in-app notification to approvers, demo seed. |
| `demoSupportAccessSeed.ts` | The demo organisations' starting policies (Batch 373). |
| `supportAccessGate.ts` | The policy gate applied by `CaseRouter` (open, edit, list) and the case search (search criteria). |
| `supportAccess.test.ts` | Rules, the service flow, and the gate. |

## Storage and demo reset

Settings (`pathscribe_support_access_settings`) and requests (`pathscribe_support_access_requests`) are demo state and clear with a Full Reset. The audit stream (`pathscribe_support_audit`) is in `DELIBERATELY_NOT_RESET` and survives it. All three sit under `mockStorage`'s `pathscribe_mock_` prefix.

## What waits for the API server (phase 4)

- **Originating IP and country** can only be recorded truthfully by the server from the request; the browser records them as empty.
- **Email and webhook** notification to approvers. Today approvers get an in-app message, written in the requester's language.
- **Ending access when the ticket closes** needs the ticketing system's close event.
- **PDF export**. CSV and JSON exist today.
- **Tenant-isolated storage**: the stream in its own per-tenant, append-only table (PS-358), writable only by the server, with tokens for support sessions bound to the ticket and the approval's expiry.
- Support's exports and configuration changes are checked by capability and recorded in the main audit log. They aren't copied into the hospital's stream yet, because configuration data isn't tenant-scoped in the mock.

See `docs/architecture/AUTHORIZATION_API.md` § Support access for the server contract.
