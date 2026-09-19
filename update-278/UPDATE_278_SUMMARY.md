# Update 278 — PS-72 batch write-up (SynopticReportPage-adjacent modals) + PS-73/75 dictionary rollout

Two threads, both continuing straight from Update 277.

## Part 1 — PS-72: the batch that never got its own write-up

Update 277 covered `PatientManagementSection.tsx`/`PatientMatchReviewSection.tsx`. The next
batch of PS-72 fixes (screenshot-redaction tagging) landed afterward but was never documented.
Recorded here for the record:

| File | Fix |
|---|---|
| `SynopticReportPage/modals/CaseTeamModal.tsx` | Patient name span → `data-phi="name"`. Everything else flagged in this file was a staff name — confirmed out of scope (see below). |
| `Worklist/WorklistTable.tsx` | Checked, no gap — real PHI already covered by `data-phi` on ancestor `<td>`s. |
| `CytologyWorklistPage/CytologyScreeningPage.tsx` | 4 fixes — three accession spans in the Patient History panel, plus the case-header id+patient/MRN line. |
| `RequestReview/RequestReviewModal.tsx` | `data-phi="true"` on the case id/label div. |
| `pages/MockEMRPage.tsx` | `data-phi="true"` on the patient-meta span. |
| `SynopticReportPage/modals/CopilotReportViewModal.tsx` | Added `data-phi` to Accession/Patient/MRN divs — technically redundant, the modal's outer div already has `data-capture-hide="true"` (fully hides the element during capture, a coarser mechanism than tagging). Kept as defense-in-depth. |
| `Synoptic/Comments/CaseCommentModal.tsx` | Accession wrapped in `data-phi="accession"` — also technically redundant (`CommentModalShell.tsx` already has `data-capture-hide="true"`). Kept for the same reason. |
| `SynopticReportPage/modals/RetentionHoldModal.tsx` | Genuine gap (no `data-capture-hide`) — accession wrapped in `data-phi="accession"`. |
| `SynopticReportPage/modals/CaseHoldModal.tsx` | Same genuine gap, same fix. |
| `PatientHistory/PatientHistoryModal.tsx` | Multiple fixes — header MRN, breadcrumb name, related-patients block, `CaseCard`'s id/diagnosis, `ReportField`'s new `phi?` prop (applied to Case ID, left off Pathologist). Deliberately did NOT extend to Gross/Microscopic Description, Ancillary Studies, or Pathologist Comment narrative text — flagged as a scope boundary, not an oversight. |
| `SynopticReportPage/modals/MatrixBlockEditorModal.tsx` | Checked — `fullAccession` only feeds print-label generation, never DOM-rendered. No fix needed. |

**Staff/physician names — scope resolved and codified**: per direct GDPR-based ruling, staff
and physician names are out of PS-72 entirely (neither `data-phi` nor `data-pii`) — that's
RBAC/data-minimization territory, not a screenshot-redaction concern. This is now written
directly into `scripts/tag-phi.mjs` (the `referringPhysician`/`orderingPhysician`/
`requestingClinician` pattern was removed, with a comment explaining why, so it doesn't get
silently re-added later).

Also fixed this batch, not PS-72-specific: `AccessionPage.tsx`'s just-accessioned-case
accession number, and `ConfirmModal.tsx`'s `message` prop widened from `string` to
`React.ReactNode` so PHI-bearing confirmation dialogs can carry a `data-phi` span (used by
several of the fixes above).

Verification: `tsc --noEmit` clean and 477/477 test files (4171/4171 tests) passing throughout.

**i18n question, answered separately**: confirmed via precise grep (`useTranslation()` /
`t('...')` call pattern, not a bare `"t("` substring match) that large files like
`AccessionPage.tsx` (4006 lines) and `SynopticReportPage.tsx` (5641 lines) have effectively
zero real i18n coverage today — only 53 of 333 page/component files use `useTranslation()` at
all. Per your own plan, this is deferred to the post-feature-complete sweep (business logic,
hard-coded strings, inline CSS, i18n wrapper) — not touched here.

---

## Part 2 — PS-73/75 dictionary rollout

Five remaining dictionary files, each judged individually rather than copy-pasted from
`ContainerTypesSection.tsx`'s reference pattern.

### 1. `SpecimenCategoriesSection.tsx` — PS-73 + PS-75, standard pattern
- Added `performingLabFacilityId?: string` to `SpecimenCategory` (`ISpecimenCategoryService.ts`).
- PS-73: name uniqueness compound-scoped by lab (`findDuplicate` on `[performingLabFacilityId, name]`).
- PS-75: Performing Lab picker in the modal, "Performing Lab" table column, lab filter dropdown.
- Justification: `mockSpecimenCategoryService.findOrCreateByName()` already treats `name` as a
  de facto case-insensitive unique key for real order-intake auto-creation — the admin UI
  should enforce the same thing rather than let it drift.

### 2. `CassetteColorsSection.tsx` — PS-73 (both fields) + PS-75, standard pattern, with one flag
- Added `performingLabFacilityId?: string` to `CassetteColorDefinition` (`ICassetteColorService.ts`).
- PS-73: **both** `key` and `displayName` uniqueness, each compound-scoped by lab. `key`
  collisions matter because it's the identifier sent downstream; `displayName` collisions
  matter because the "Substitute With" fallback picker is where a technician actually reads
  color names in a physical cassette-loading workflow.
- PS-75: Performing Lab picker, table column, filter — physical hopper hardware is genuinely
  lab-specific, arguably a stronger case than Container Types itself.
- **Flag for you**: `key`'s own doc comment says it's "the stable key sent to the Engine" (a
  real external dispatch payload). `getByKey()` on the service has zero real call sites today
  — routing rules resolve a color by its real `id` (`colorId`), never by bare key — so
  compound-scoping `key` per lab isn't a live bug. But if a future real Engine integration ever
  dispatches by bare key without also passing lab/facility context, two labs both using
  `COLOR_BIOPSY` could be genuinely ambiguous on the Engine side. Worth confirming the real
  dispatch payload will carry lab context before that integration is built — flagged in a code
  comment on the field itself, not deciding it here.

### 3. `ParticipationTypesSection.tsx` / `TypeModal.tsx` — PS-73 only, PS-75 recommended against
- PS-73: added `label` and `abbreviation` uniqueness (global, case-insensitive) in
  `TypeModal.handleSave`. Real gap — `abbreviation` renders as a compact chip in
  `CaseTeamModal.tsx`, where two types sharing e.g. "PRIM" would be genuinely ambiguous.
- **PS-75 — recommending against, not deciding unilaterally**: this dictionary encodes
  case-team sign-out authority (`canFinalize`, `requiresCountersign`, `canViewWholeCase`). Unlike
  Container Types or Cassette Colors (operational conveniences), silently letting a lab fork
  what "Primary Pathologist" is allowed to do would be a compliance-relevant decision, not a
  UI nicety. Left un-scoped by performing lab, with the reasoning written directly into
  `TypeModal.tsx`'s `handleSave` — flagging this explicitly rather than adding it "to match
  the pattern."

### 4. `SubspecialtiesSection.tsx` — PS-73 as GLOBAL uniqueness (deliberate deviation)
- PS-75 was already fully implemented here (performing-lab field, picker, catch-all-per-scope
  logic) before this rollout — nothing to add there.
- PS-73: added name uniqueness in `handleSave`, but **globally**, not compound-scoped by lab —
  the standard pattern this file's own inline comment (near the catch-all logic) seems to
  suggest ("its own General Pathology... never shared with another lab's cases").
- **Why the deviation, flagged for you**: confirmed directly that a Specimen links to its
  subspecialty by bare name string (`sp.subspecialty === sub.name`) — never by id, and not
  lab-aware. If two subspecialty records legitimately shared a name across two labs, that
  lookup would be ambiguous — a specimen tagged "General Pathology" could silently resolve to
  whichever same-named record happens to match first. So name uniqueness is enforced globally
  until specimen-linking itself becomes lab-aware or id-based. This is a real, separate
  architectural gap worth its own look — not just a rollout footnote.

### 5. `GoverningBodiesSection.tsx` — no changes
- PS-73: already covered. Custom bodies derive their own id from the label
  (`label.trim().toUpperCase().replace(/\s+/g, '_')`) and `idConflict` already blocks a
  colliding one on create — that derivation *is* the uniqueness check.
- PS-75: doesn't apply. This dictionary's real axis of variation is `jurisdictions` (a
  governing body applies to specific jurisdictions), which the record already models
  correctly. Adding `performingLabFacilityId` here would be a redundant, conceptually wrong
  second axis for the same underlying idea. Reasoning written directly into the file next to
  `idConflict` so it doesn't get "fixed" into matching the other four later.

### Verification
- `npx tsc --noEmit -p .` — clean.
- `npx vitest run --exclude firestore.rules.test.ts` — 477/477 files, 4171/4171 tests passing.

### Three things worth your direct call, summarized
1. **ParticipationTypesSection** — should case-team sign-out authority (Primary/Countersign/etc.) ever be allowed to vary per performing lab, or is that a bright line?
2. **SubspecialtiesSection** — specimens reference subspecialty by bare name, not id, and not lab-aware. That's a real gap independent of this rollout; worth a look before it causes a real misattribution.
3. **CassetteColorsSection** — confirm the real Engine dispatch payload will carry lab/facility context before `key` is ever relied on as a global lookup outside PathScribe.
