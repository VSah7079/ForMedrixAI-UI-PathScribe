# AUTHORIZATION_API.md: capabilities checked in context

**Status:** phases 1 and 2 built in the browser (Batches 369 and 370;
PS-355, PS-356). The API server part described here is phase 4 (PS-358) and
is not built yet.

Design: "PathScribe Access Control: Capabilities in Context" (the design doc
linked from PS-355). Browser code: [`src/services/authorization/`](../../src/services/authorization/README.md).

## The model

- A **capability** is a single thing PathScribe enforces, named
  `domain:object:verb` with the verb last: `qa:fppe-tracking:export`,
  `report:change-history:export`.
- The **catalog** (`capabilityCatalog.ts`) is the only list. Each entry has
  its key, its admin-facing group, a risk level, and the capabilities it
  **requires**. A key is added when its check is added, never before; a
  guard test fails the build otherwise.
- A **role** grants capabilities (`Role.capabilities`). A **staff member**
  holds roles (`StaffUser.roles`) and a facility assignment
  (`StaffUser.facilityIds`, empty = all). Scope belongs to the assignment,
  not the role (Batch 370).
- **Superadmin** is a built-in role, reserved for ForMedrixAI support staff
  (Pete, Batch 371). It always holds every capability, and there is no
  bypass in the check. It is held only through a support sign-in, can't be
  assigned to a hospital's staff, and can't be changed by a hospital.
- **Platform-only capabilities** (`platform:*`) count only from Superadmin.
  A hospital role can't hold them.

## The check

```
can(user, capability, context) → decision
```

Allowed when all three hold:
- a role the user holds grants the capability;
- every capability it requires is granted too, by the same role or another held role;
- the action is within the user's facility assignment.

An assignment limited to some facilities refuses:
- another facility's data;
- any action spanning all facilities (enterprise or organisation QA scopes);
- a case action on a case with no facility recorded.

The decision carries the role(s) that granted it; that is what the audit
entry records.

| Field | Meaning |
|---|---|
| `capability` | the key checked |
| `allowed` | true / false |
| `reason` | when refused: `noUser`, `unknownCapability`, `notGranted`, `requirementNotGranted`, `outOfScope`, `facilityUnknown` |
| `outsideFacilities` | for `outOfScope`: the facilities not covered (`all` for an all-facility action) |
| `grantedBy` | `[{ id, name }]` of the held roles that grant it |
| `missingRequirements` | for `requirementNotGranted` |
| `context` | `{ caseId?, facilityId?, facilityIds?, allFacilities? }` |

## What the API server must do (phase 4)

1. **Decide who the caller is from the bearer token**, never from anything
   the browser sends (see `AUTHENTICATION_OIDC.md`). Load the caller's staff
   record and the site's role catalog from SQL Server.
2. **Check before doing the work.** Every endpoint that performs a catalog
   action names its capability and runs the same evaluation (same catalog,
   same requirement rule). A refusal returns `403` with
   `{ "error": "capability_refused", "capability": "...", "reason": "..." }`
   and does no work.
3. **Audit every check of a high-risk capability**, allowed or refused, in
   the same transaction as the action where possible. The entry holds: time
   (UTC), user id and name, capability, allowed/refused, the granting role
   id(s) and name(s) or the refusal reason, case id and facility id when
   present, and the session role. The audit table is append-only: no
   update or delete permission for the application's database login.
4. **Role writes are validated and audited.** Saving a role refuses unknown
   keys and a capability whose requirements aren't granted
   (`roleCapabilityProblem`), and writes a "Role capabilities changed" entry
   naming who changed what.
5. **Superadmin** is granted from ForMedrix's own identity tenant (see
   `ACCESS_CONTROL_PLAN.md`), never from a customer's staff directory.

Endpoints so far:

| Action | Capability |
|---|---|
| Export a case's report change history | `report:change-history:export` |
| Export each Quality Assurance report | its own `qa:<report>:export` (14), with the scope's facilities |
| Create or change a role (including its capabilities) | `config:roles:manage`; also refuse a change that leaves no assignable role with it |
| Create or edit a staff record | `config:staff:edit` |
| Change a staff member's roles, facilities, pediatric/orchestration/cross-tenant access or credentials | `config:staff-access:assign` (requires `config:staff:edit`) |
| Reset all demo data (demo deployments only) | `config:demo-data:reset` |
| Open a case from another organisation (support) | `platform:cross-tenant-cases:view`, audited on every open |
| Change the governing-body content settings | `platform:governing-bodies:manage` |
| Change the Superadmin role | refused for everyone at a hospital; ForMedrixAI defines it |
| Any endpoint serving a screen reached from Home (its lists and data) | that screen's `screen:<name>:open` (Batch 374), besides the action's own capability |
| Complete grossing (case to Gross Complete) | `case:grossing:complete` with the case's facility; the organisation's Grossing field requirements checked first |
| Change which fields a page requires (Field Requirements) | `config:field-requirements:manage`, caller a member of that organisation; locked fields refused |
| Set an organisation's support access policy and window | `config:support-access:policy`, caller a member of that organisation |
| Approve, reject or revoke a support access request | `config:support-access:approve`, caller a member of that organisation and not the requester |
| Read or export an organisation's support audit | `config:support-audit:view`, caller a member of that organisation |

## Support access (Batch 372)

The hospital controls whether ForMedrixAI support reaches its data. The browser
version is `src/services/supportAccess/`; the server must do the following.

1. **Policy gate before the capability check.** Every request from a support
   (Superadmin) token that touches an organisation other than the agent's own
   first reads that organisation's policy:
   - `disabled` → `403 { "error": "support_access_disabled" }`;
   - `approvalRequired` → allowed only with an approved, unexpired request for
     that agent and organisation, else `403 { "error": "support_access_not_approved" }`;
   - `alwaysAllowed` → allowed.
   Refusals are recorded in the organisation's support audit. List and search
   endpoints drop rows from organisations the agent can't reach, rather than
   refusing the whole request.
2. **Ticket-bound sessions.** On approval the server issues (or marks) the
   agent's access with the ticket id and the approval's expiry
   (`approvedAt + windowMinutes`, default 120, allowed 30/60/120/240/480). The
   token or server-side session carries both; nothing is honoured after
   expiry, revocation, the agent ending it, or the ticket closing (ticketing
   webhook).
3. **The hospital's support audit table**, one per tenant (or a tenant-keyed
   table whose rows only that tenant can read), append-only for the
   application's database login. Row: `seq`, `at` (UTC), actor id and name,
   ticket id, action, case ids, detail (English, PHI-free), **originating IP
   and country** (from the request, which the browser can't know truthfully),
   `prevHash`, `hash` = SHA-256 over the JSON array
   `[id, seq, tenantId, at, actorId, actorName, ticketId, action, caseIds, detail, originIp, originCountry, prevHash]`,
   genesis `prevHash` 64 zeros. Actions: `policyChanged`, `accessRequested`,
   `accessApproved`, `accessRejected`, `accessExpired`, `accessEnded`,
   `accessRevoked`, `caseOpened`, `casesListed`, `searchRun`, `caseEdited`,
   `accessRefused`, `auditExported`; also support's exports and configuration
   changes in that tenant.
4. **Notification.** A new request notifies the organisation's approvers
   (holders of `config:support-access:approve`) in-app, by email, and by an
   optional tenant webhook.
5. **Export** as CSV, JSON (with the chain check) and PDF, columns
   `Timestamp | Support agent name | Originating IP | Originating country | Ticket ID | Action taken | Case IDs | Detail`.

## What the browser does

- `authorizationService.enforce()` is the mock phase's enforcement point:
  the export services call it and stop on a refusal. It writes the same
  audit entry the server will.
- `useCapabilities()` / `CapabilityButton` grey out an action the user can't
  take and say why. That is presentation only: the service still checks.
- In production the browser's check stays as presentation; the server's is
  the one that counts.
