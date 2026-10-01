# services/fieldRequirements — which fields a page requires (PS-359, Batch 376)

Pete: "The User may need to have control over what fields on a page are required before saving. Field Configuration that is grouped by Pages … Some fields should always be required, and should be uneditable."

- **The catalog** (`FIELD_REQUIREMENT_PAGES` in `fieldRequirementRules.ts`) is the only list of configurable pages and fields. Each field is one of:
  - **locked:** always required, with a reason shown;
  - **required:** by default, and can be switched off;
  - **optional:** by default, and can be switched on.
- **Defaults reproduce what each page required before,** so nothing changes until an administrator changes it.
- **Settings are per organisation only.** There are no enterprise or performing-facility overrides (Pete). An organisation's choices are stored only where they differ from the default.
- **Changing one** (`setRequired`):
  - needs `config:field-requirements:manage` (seeded to Admin);
  - applies only to the person's own organisation;
  - refuses locked fields;
  - writes a "Field requirement changed" audit entry.
- **Screens** read the resolved requirements (`forSession(page)`) and use `missingRequiredFields` to decide whether they can save and what to list as missing. The API server applies the same rules when it saves (phase 4).

## Accession (the first page)

| Group | Field | Default |
|---|---|---|
| Patient | Given name(s), family name(s), date of birth | locked (patient identification) |
| Patient | Patient ID (MRN) | optional |
| Order | Submitting facility | locked (routing and billing) |
| Order | Requesting provider | locked (the ordering person is required by laboratory regulations) |
| Order | Location, assigned pathologist, clinical indication | optional |
| Specimens | Description | locked (a case needs at least one described specimen), checked on every specimen |
| Specimens | Date/time collected, date/time placed in fixative | optional, checked on every specimen |

The Accession page greys out Next and Submit until the required fields are filled, and lists what's still required. The Patient ID and Assign to Pathologist labels drop "(optional)" when the organisation requires them.

**Adding a page:** add its fields to the catalog with ids that never change, add their names under `fieldRequirements.fields.<page>` in all five locales, and have the page call `forSession(page)` and `missingRequiredFields`.

## Files

| File | What it holds |
|---|---|
| `fieldRequirementRules.ts` | The catalog, `resolveFieldRequirements`, `overrideProblem`, `missingRequiredFields` and the audit entry. Pure. |
| `fieldRequirementService.ts` | `createFieldRequirementService(deps)`: read and change an organisation's choices. |
| `defaultFieldRequirementService.ts` | The mock wiring. Stored under `pathscribe_field_requirements`; a Full Reset clears it back to the defaults. |
| `fieldRequirements.test.ts` | Rules and service. |
| `reportPageChecks.ts` | Batch 380: what the case report page's modals need before saving (+ `reportPageChecks.test.ts`). |

## Batch 377: fields filled in automatically

A field marked `autoFilled` is filled in by the page when left blank, so a blank value still counts as supplied. Accession's Patient ID is one: left blank, it becomes `AUTO-<case number>`. If an organisation requires Patient ID and none can be generated, Submit stops with an alert (Pete). Field Requirements shows "Filled in automatically if left blank" beside such a field.

## Batch 378: Grossing

The Grossing screen saves each edit as it's made, so its requirements are checked when grossing is completed (`services/grossing/grossingCompletion.ts`).

| Group | Field | Default |
|---|---|---|
| Specimens | At least one block | locked, checked on every specimen (required by default and switchable since Batch 379) |
| Blocks | Piece count | optional, checked on every block |
| Fixation | Fixation end time | optional, checked on every specimen |
| Fixation | Fixative-to-tissue ratio confirmed | optional, checked on every specimen |

New field flag: `perBlock`. New groups: `blocks`, `fixation`.

## Batch 379: the protocol rule, switchable per organisation (Pete)

Pete: required by default, but switchable per organisation, since departments differ in how rigidly they work and how they read the regulations.

| Group | Field | Default |
|---|---|---|
| Specimens | Grossing protocol attached (`protocol`) | **required**, checked on every specimen. This is the organisation's "require protocol for grossing completion" switch. |
| Specimens | At least one block | **required** (was locked), checked on every specimen that has a protocol and isn't a cytology preparation |

- **Who can switch it:** anyone holding `config:field-requirements:manage`, for their own organisation only. Admin has it built in. A hospital that wants its quality manager to decide grants that capability to the quality manager's role in Staff → Roles; there is no built-in Quality Manager role.
- **Switched off**, a specimen without a protocol no longer stops Complete grossing. The Grossing screen says which specimens will go for review, asks for confirmation, and each one gets an open "Grossed Without Protocol" deficiency in the QA deficiency queue (`services/grossing/grossingCompletion.ts`).
- **Why the block rule changed scope:** blocks are added on the Grossing screen from the protocol's pathways, so a specimen with no protocol can't get one there, and a cytology preparation makes slides (decants), not blocks. Before this, either kind of specimen stopped its case from ever completing. The protocol rule now covers the first; the second no longer needs blocks.
- New field flag: `hint` (`blocksScope`, `protocolOff`), shown on the Field Requirements screen in place of "Checked on every specimen". The `blocks` lock reason is gone.

## Batch 380: the case report page, group 1

Pete: "move on to the Synoptic Report page and its related modals". New page **Case report** (`report`), checked when each modal saves, by `reportPageChecks.ts` (+ test):

| Group | Fields | Default |
|---|---|---|
| Add or edit specimen | Specimen label, Specimen description | locked (what the modal already required) |
| | Anatomic site, Laterality, Collection method, Container type, Complexity, SNOMED specimen type, SNOMED anatomic site | optional, switchable on |
| Amendments and addenda | Reason, Explanation or addendum text, Addendum title, Clinician notified of a major amendment | locked (CAP / RCPath; the amendment service also enforces them) |
| | Clinician notified of a minor amendment, Clinician notified of an addendum | optional, switchable on; when on, the notification section shows for that type |
| Critical findings | Clinician notified, Notification method, Notified by | locked (CLIA 42 CFR 493.1291(g)) |
| | Clinician read back the finding | optional, switchable on |

- `specimenEditProblems`, `revisionMissingFields`, `revisionNotificationShown` and `criticalNotificationMissing` return what's missing in catalog order. The modals show it as "Still required: …" and mark required labels.
- `hooks/useFieldRequirements(page)` loads a page's requirements for the signed-in user's organisation, starting from the defaults.
- A synoptic template's own required answers stay with the template (`RightSynopticPanel.validateRequired` at finalize). They aren't duplicated here.
- Group 2 (holds, comments, Delegate, biopsy arrays, block cancel/restain) came in Batch 381; group 3 began in Batch 382 (discordance and billing changes) and continues with the autopsy forms and the date and fixative gates.

## Batch 381: the case report page, group 2

Pete chose to list each modal's fixed fields as locked, so the settings screen shows every rule a modal applies.

| Group | Fields | Default |
|---|---|---|
| Holds | Case hold note and release note; retention hold note and release note | locked |
| Comments | Comment text | locked |
| Delegation | Delegation type, recipient, the synoptic report (when handing one over) | locked |
| | Note on every delegation | optional, switchable on. A delegation type can also require a note of its own (Delegation Types); either one shows the note field. |
| Biopsy arrays | Cassette label, at least two specimens | locked |
| Block cancellation and restains | Reason for cancelling a block; stain and reason for a restain | locked (ISO 15189 traceability) |

New checks in `reportPageChecks.ts`: `holdMissing`, `commentMissing` (an editor's empty paragraph counts as empty), `delegationMissing` / `delegationNoteShown`, `biopsyArrayMissing`, `chosenReason`, `blockCancelMissing`, `restainMissing`.

## Batch 382: the case report page, group 3 (part 1)

Pete's group 2 choice again: every fixed field is listed as locked.

| Group | Fields | Default |
|---|---|---|
| Frozen-final reconciliation | Final diagnosis, final category | locked |
| | Delta, clinical impact, root cause, comment on the discordance | locked; asked only when the final category differs from the frozen one |
| | Explanation when the root cause is Other | locked; asked only for that root cause |
| Billing changes after sign-out | Reason and comment for a billing change | locked (an audit trail for the charge and credit) |
| | Corrected billing code | locked; must also differ from the code being corrected |

New checks in `reportPageChecks.ts`: `discordanceStage` (none chosen / concordant / discordant), `discordanceMissing`, `billingChangeMissing`, `correctedCodeCheck`. The record the reconciliation modal saves is built in `services/quality/discordanceRecord.ts`, from the same checks.
