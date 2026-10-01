# services/screens — which screens a user may open (Batch 374)

Pete: "Home Page should only show tiles that the User has access to."

Each screen reached from the Home page, or from one of its two hubs, has a capability `screen:<name>:open` in the capability catalog (group "Screens"). Roles grant them like any other capability, and hospitals change them in the Role Dictionary.

- **Home** shows a tile only for a screen the user may open.
- **A hub tile** (Pathology Workspace, Quality & Compliance) shows when the user may open at least one screen inside it, and the hub then shows only those.
- **Routes** check again (`components/Common/ScreenGate.tsx`), so typing the address shows "You don't have access to this screen" instead.
- **The nav bar's quick case search** shows only with `screen:search:open`.

Case pages (a report, grossing) aren't screens here. A case is reached from a screen, and case access has its own rules (`auth/caseAccessControl`).

| Screen | Capability | Where |
|---|---|---|
| Accession, Worklist, Search, Add-On Orders, Intraop Queue, Cytology QC Peer Review Queue, Surgical Post-Sign-Out QA, My Contribution, Batch Management, Configuration | `screen:accession:open` … `screen:configuration:open` | Home |
| Cytology, Microtomy, Embedding, Slide Distribution and Molecular Workspaces | `screen:cytology-workspace:open` … `screen:molecular:open` | Pathology Workspace |
| Audit, Quality Assurance | `screen:audit-log:open`, `screen:quality-assurance:open` | Quality & Compliance |

Starting grants per built-in role are in `authorization/capabilitySeeds.ts` (`SCREEN_SEEDS`, Pete's matrix of Sep 28, 2026). A hospital's own roles are offered the screens their access implies (`customRoleScreenSeed`), so nobody loses a screen they could open before.

## Files

| File | What it holds |
|---|---|
| `screenAccess.ts` | Screen ids, their capabilities, the hubs, `canOpenTile` / `visibleTiles` (pure), and `createScreenAccessService` (the route check, through `authorizationService.enforce`). |
| `defaultScreenAccessService.ts` | The route check wired to this build's authorization service. |
| `screenAccess.test.ts` | The catalog and screen table agree; tile filtering; the route check. |

Opening a screen is standard risk, so it isn't audited; what is done on a screen is checked by that action's own capability. The API server checks the same capability on the screen's endpoints (phase 4, `docs/architecture/AUTHORIZATION_API.md`).

## Batch 375: fewer Home tiles

Pete moved three things off the Home page:
- **The Cytology QC Peer Review Queue and Surgical Post-Sign-Out QA** are views inside the Worklist. The Worklist tile shows for anyone who may open its case list or either queue (`TILE_SCREENS.worklist`). `worklistViews` / `resolveWorklistView` decide which views the Worklist offers and opens. `?view=cytologyQc` / `?view=surgicalQa` pick one, and the old addresses redirect there.
- **Add-On Orders** is an action on a case: "Add-on order" in the report page's block row opens `/add-on-orders?case=<id>` with the case loaded. The screen capability still decides who sees the action.
- **Batch Management** is inside the Pathology Workspace hub.

`TILE_SCREENS` maps each Home tile to the screens that open it. A tile shows, and its route opens, when the user may open any of them.
