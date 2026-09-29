# services/templates/

Synoptic template LIBRARY MANAGEMENT ONLY, post-July-2026 split — seeds the CAP/RCPath-derived generic JSON templates into editorStore.

**Pattern:** Single real file.

## Files

- **`templateService.ts`** — Core template seeding/management logic.
- **`protocolLifecycle.ts`** (Batch 317, PS-73): pure rules for the protocol library's row actions.
  - `prepareProtocolCopy`: **Duplicate** gives a new protocol (new id, localized copy name, patch bump, no lineage). **New Version** gives the next version (new id, same name, minor bump, `supersedesId` → the published source).
  - `findProtocolNameConflict`: names are unique among live protocols; archived ones and a protocol's own version lineage don't count.
  - `protocolActions`: which actions each lifecycle state offers.
  - `matchesStatusFilter`: "All" hides archived.
  - `buildProtocolExport` / `protocolExportFilename`: the Export JSON payload (`format: 'pathscribe-synoptic-protocol'`, version 1, full editor template) and its file name.
  - `bumpVersion`: moved here from SynopticEditor.tsx.
- **`protocolLifecycle.test.ts`**, **`templateService.archive.test.ts`**
## Notes

- The AI-suggestion sub-system that used to live here moved to services/templateSuggestions/ — see that folder's README.
- src/templates/mockDcisTemplate.ts (a DIFFERENT, top-level, non-services/ folder) still needs relocating here or into Config/Templates/ — flagged in PRIORITY_FIXES.md, not yet done.

## Archive, restore and New Version (Batch 317, PS-73)

`templateService.ts` gained:

- **`archiveTemplate(id)`**: status `'archived'` (a new `LifecycleState`) plus `archivedAt`. Allowed from any state. The protocol drops out of every status-filtered list, so it is no longer offered for new reports; reports already written with it keep their content.
- **`restoreTemplate(id)`**: archived → `'draft'`. A restored protocol must be reviewed again before anyone can report with it.
- **`publishTemplate`** now archives the published protocol a New Version `supersedesId`, so only one version of a protocol is live at a time. `saveDraft` carries `supersedesId` into the registry.
- **`transitionTemplate(id, 'archived')`** dispatches to `archiveTemplate`.
- **List-cache invalidation.** Every registry write now clears the `listTemplatesCached` cache. Before this, a cached `'published'`/`'approved'` list kept showing a protocol after its status changed until the page reloaded.

Lifecycle transitions here are still logged to the console only, not to the audit log. That was true of every transition before this batch too.
- **Copies keep registry-only attributes.** `prepareProtocolCopy` sets `copiedFromId`. On a copy's first save, `saveDraft` inherits the source's `isDiagnostic`, `type` and `group` (`inheritedCopyAttributes`). Without this, a copy of a non-diagnostic Grossing checklist would have defaulted to diagnostic.
- **Reviewer cache cleared.** Archive, restore and supersede clear `TemplateRenderer.tsx`'s cached `ps_state_<id>`. Otherwise a restored draft would still show as published in the reviewer, with no way back into review.

## `editorUrlAfterSave` (Batch 326, PS-63)

In `protocolLifecycle.ts`. After the first save of a new template or a Duplicate / New Version, it gives the editor the saved protocol's own address. Without it, a page refresh opened another fresh copy and the next save created a second protocol. It is tested in `protocolLifecycle.test.ts`.

## Review governance (Batch 328, PS-63)

Pete's rules for approving and publishing, enforced in the service. The Admin Guide text is in `components/Config/Protocols/README.md` → "Who may approve and publish".

- **`templatePublishingRules.ts`** (+ `.test.ts`, new; pure):
  - `calcTemplateCoverage`, moved here from `SynopticEditor.tsx` so the editor and the publish check use the same figure;
  - `SNOMED_PUBLISH_THRESHOLD` (80);
  - the settings type with its safe defaults and `normalizeGovernanceSettings`;
  - `isTemplateApprover`: the Template Approver / Lab Director / Admin roles, or an admin app role. Since Batch 329 the check is by built-in role id, not name;
  - `decideApprove` and `decidePublish`, which implement Can Publish = approver ∧ (self-approval allowed ∨ not an author), plus Required Reviewers and the SNOMED gate;
  - `countingApprovals`.
- **`templateGovernanceSettings.ts`** (new):
  - the site settings, stored as `pathscribe_template_governance`;
  - `saveTemplateGovernanceWithAudit`, which records a change in the audit log with literal English detail.
- **`templateService.ts`:**
  - `saveDraft` records every saver's id in `editorIds` and clears `approvals`. Submit, resubmit and request-changes also clear `approvals`.
  - `approveTemplate` and `publishTemplate` read the signed-in user and the settings, and throw `{ code, message }` on a refusal: `NOT_APPROVER`, `SELF_APPROVAL`, `ALREADY_APPROVED`, `NOT_ENOUGH_APPROVALS`, `SNOMED_BELOW_THRESHOLD`.
  - Approve returns `approvalCount`, and stays `in_review` until enough approvals are in.
  - Publish records `publishedById` / `publishedAt`.
  - **Where publish reads coverage:** from the stored editor content when there is some, else the registry's seeded `snomedPct`.
  - **New `resetToDraft`:** `transitionTemplate(id, 'draft')` used to throw, so the reviewer page's Reset never reached the registry.
- **Legacy data:** a template approved before this batch has no approval records. Its recorded approval counts as one approval by a non-author. Seeded templates have no `editorIds`, so no one counts as their author.
- **Tests:** `templatePublishingRules.test.ts` (rules) and `templateService.governance.test.ts` (end to end through the service). `templateService.archive.test.ts` now approves before publishing a New Version.

## Drafting by role, and roles by id (Batch 329, PS-63)

Per Pete: drafting is locked to **Template Author**, Admin inherits it, and the template roles are built in and checked by id.

- **`templatePublishingRules.ts`:**
  - **Drafting:** `canDraftTemplates` allows the Template Author role, the Admin role, and admin app roles.
  - **By id, not name:** it and `isTemplateApprover` now take `roleIds` and compare fixed built-in ids (`services/roles/systemRoles.ts → SYSTEM_ROLE_IDS`). They no longer compare names.
- **`templateService.ts`:**
  - **`currentActor()`** is now async. At the moment of the action it reads the signed-in user's staff record and the role catalog, and maps role names to ids (`roleIdsForNames`). A role granted or renamed therefore works without signing in again.
  - **Drafting guard:** `saveDraft`, `submitForReview` and `deleteTemplate` throw `NOT_TEMPLATE_AUTHOR` for anyone else. `resubmitForReview` allows authors and approvers.
  - **New `canCurrentUserDraftTemplates()`:** the editor uses it to open read-only.
- **Tests:** `templatePublishingRules.test.ts` (+1) and `templateService.governance.test.ts` (+2):
  - a Template Author can draft but not approve, and a Template Approver can approve but not draft;
  - approval still works after a built-in role is renamed.

  `templateService.archive.test.ts` now signs in an admin before saving.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*