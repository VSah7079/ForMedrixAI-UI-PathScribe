# services/authorization/

Capabilities and the permission check (PS-355, Batch 369). This is the part
of a role PathScribe enforces. The voice and keyboard commands in
`constants/systemActions.ts` (the Role Dictionary's Commands tab) are not
access control.

Server contract: [`docs/architecture/AUTHORIZATION_API.md`](../../../docs/architecture/AUTHORIZATION_API.md).

## Files

- **`capabilityCatalog.ts`**: the one list. Each capability has:
  - a `domain:object:verb` key;
  - a locale `labelId`;
  - an admin-facing `group`;
  - a `risk` (`high` = every check at an action is audited);
  - `requires`, the capabilities it can't work without.

  `catalogProblems()` checks the key shape, duplicates, unknown requirements and cycles.
- **`capabilityDependencies.ts`** (pure): `requirementsOf`, `dependentsOf`, `planGrant`, `planRevoke`, `unmetRequirements`. The Role Dictionary uses the plans to tell the administrator when one capability needs another, and offers to turn it on (or off) too.
- **`evaluateCapability.ts`** (pure):
  - `heldRoles`, `evaluateCapability`, `grantedCapabilities`;
  - `capabilityAuditEntry`, the literal-English audit record naming the granting role or the refusal reason.

  A PathScribe support sign-in (session role `superadmin`) holds the built-in Superadmin role. A staff record naming that role gets nothing from it. There is no bypass.
- **`capabilitySeeds.ts`** (pure): the day-one grants (Superadmin gets everything; Admin gets every export plus the Batch 370 administration capabilities; QA Reviewer gets the exports; nobody else gets anything). `applyCapabilitySeeds` offers each built-in role only the seeds it hasn't been offered before (`Role.seededCapabilities`), so an administrator's removal sticks and a new capability still arrives.
- **`roleCapabilityRules.ts`** (pure):
  - `roleCapabilityProblem`: the role service refuses a save with an unknown key or an unmet requirement.
  - `roleCapabilityChangeAudit`: the "Role capabilities changed" entry.
- **`authorizationService.ts`**: `createAuthorizationService(deps)`.
  - `evaluate` decides without writing anything.
  - `enforce` decides and audits high-risk checks.
  - `grantedCapabilities` returns everything the signed-in user holds.

  It reads the session, the staff record and the role catalog fresh on every call.
- **`defaultAuthorizationService.ts`**: the app instance, exported from `@/services` as `authorizationService`.

## Facility scope (phase 2, Batch 370)

`StaffUser.facilityIds` is the facilities someone works for; empty means all. Per Pete, scope lives on the staff assignment, not the role. For someone limited to some facilities, `evaluateCapability` refuses:
- actions on another facility's data (`outOfScope`, naming the facilities);
- actions spanning all facilities: enterprise or organisation QA scopes, and QA reports with no scope switcher (`outOfScope`);
- case actions on a case with no facility recorded (`facilityUnknown`).

Actions with no facility dimension (managing roles) aren't affected. Scope never grants anything. The context comes from `qaScopeContext(scope)` for QA exports, and from the case's `order.facilityId` for the change-history export.

## Where it is enforced

| Capability | Checked in |
|---|---|
| `report:change-history:export` | `services/reportChangeLog/exportChangeLog.ts` |
| the 14 `qa:<report>:export` | `services/qualityAssurance/qaExport.ts`, called from each Quality Assurance tab through `qaReportUtils.exportQaReportRows(capability, …, context)`; the cytology–histology print view calls `enforce` before opening |
| `config:roles:manage` (Batch 370) | `services/roles/roleAdministration.ts` `saveRole`, which also refuses a save that leaves no assignable role able to manage roles |
| `config:staff:edit`, `config:staff-access:assign` (Batch 370) | `services/staff/staffAdministration.ts` `saveStaffMember`. The second is needed when roles, facilities, pediatric, orchestration or cross-tenant access, or credentials change |
| `config:demo-data:reset` (Batch 370) | `services/demoReset/demoReset.ts` `resetAllDemoData` |
| `platform:cross-tenant-cases:view` (Batch 371) | `services/cases/CaseRouter.ts` `getCase`, when support opens another organisation's case |
| `platform:governing-bodies:manage` (Batch 371) | `services/governingBodies/governingBodyAdministration.ts` `saveGoverningBodies` |

Screens use `hooks/useCapabilities.ts` and `components/Common/CapabilityButton.tsx` to grey out what the user can't do, with the reason in a tooltip.

## Guard

`capabilities.guard.test.ts` fails the build if:
- a catalog capability has no check at an action;
- a key used in the app isn't in the catalog;
- a gated button has no check behind it;
- a capability lacks locale text, or text is left for a capability that no longer exists.

## Not done yet

- Everything else that should be a capability: phase 3 (PS-357). That includes the other CSV exports outside Quality Assurance: the waste-tracking (disposal) report, the audit log, billing logs, dictionary exports, contribution and search.
- API server enforcement: phase 4 (PS-358).

## Batch 370 (PS-356): phase 2

- **The self-escalation path is closed.** Before this batch, anyone signed in could open Configuration, edit any role's capabilities (their own included) and change any staff member's roles. Saving a role now needs `config:roles:manage`, and saving a staff record needs `config:staff:edit`. Changing someone's roles, facilities, access flags or credentials also needs `config:staff-access:assign`, per Pete's split. The full demo reset needs `config:demo-data:reset`.
- **Facility scope** (above).
- **Screens:** `authorizationService.snapshot()` feeds `useCapabilities`, whose `has` / `decide` now take the action's context. `CapabilityButton` takes a `context`, and its tooltip gives the reason: not granted, a missing requirement, or outside the facility assignment.

## Batch 371: Superadmin reserved for ForMedrixAI support

Pete: Superadmin is for ForMedrixAI support staff, and hospital administrators have no control over it.

- **Platform-only capabilities** (`platformOnly: true`, group "ForMedrixAI platform support") count only from a role staff can't be given, which is Superadmin. `roleCapabilityProblem` refuses them on any hospital role, and a copy of Superadmin drops them. There are two so far:
  - `platform:cross-tenant-cases:view`: support opening another organisation's case. `CaseRouter.getCase` checks and audits it on every such open. Lists aren't audited per case.
  - `platform:governing-bodies:manage`: the platform-wide governing-body content settings (`services/governingBodies/governingBodyAdministration.ts`).
- **Superadmin is locked.** `lockPlatformRoles` puts it back to the whole catalog on every load. `saveRole` refuses any edit to it (`platformRole`), and so does the mock role service. The Role Dictionary shows it read-only with a banner.

## Batch 374: screens

- **17 screen capabilities** (`screen:<name>:open`, group "Screens", standard risk): one per screen reached from Home or its hubs. See [`../screens/README.md`](../screens/README.md).
- **Seeds** (`SCREEN_SEEDS`, Pete's matrix): every built-in role with app access now starts with its screens, including the four new bench roles. Admin also keeps its exports, administration and support-access capabilities; QA Reviewer keeps its exports.
- **A hospital's own roles** are now offered screens, once: every screen except Configuration and Quality & Compliance if the role has case access, and those if it has configuration access (`customRoleScreenSeed`). Before this batch, custom roles were never touched.

## Batch 376

- `config:field-requirements:manage` (administration group, high risk): change which fields a page requires, for the person's own organisation (PS-359). Seeded to Admin.

- **Batch 378:** `case:grossing:complete` (new group "Case work"), seeded to Pathologist, Fellow, Resident and PA.

## Batch 381: holds and delegation

Pete: "Add, keep today's users". Five new `casework` capabilities, all high-risk, so every check is audited:
- `case:hold:place`, `case:hold:release`
- `case:retention-hold:place`, `case:retention-hold:release`
- `case:delegation:create`

They're seeded to every built-in role with case access: Pathologist, Fellow, Resident, PA, Accessioner, Histotechnologist, Cytotechnologist, Molecular Technologist. A hospital's own roles with case access are offered them too (`customRoleScreenSeed`). Checked in `services/cases/caseHolds.ts` and `delegations/mockDelegationService.ts`; the buttons are `CapabilityButton`s.

## Batch 382: correcting an applied billing code

Pete: keep today's users, but as a permission of its own so a hospital can later take it off its clinical roles. One new capability in a new **Billing** group:
- `billing:applied-code:correct` (high risk): credit the original charge of an applied billing code and bill the corrected one.

Seeded to every role with case access and to Admin, Lab Director and QA Reviewer (who resolve billing deficiencies); a hospital's own roles with case or configuration access are offered it too. It sits in its own list in `capabilitySeeds.ts`, not in the case report actions. Checked in `services/billing/correctServiceCharge.ts` (`enforceAppliedCodeCorrection`), for the case, by the report page's correction and the QA resolution alike; the modal's button is a `CapabilityButton`. The Discordance and post-sign-out reason modals got no capability: they are steps inside sign-out and billing.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
