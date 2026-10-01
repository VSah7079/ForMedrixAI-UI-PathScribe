# services/reportChangeLog/

Batch 368 (PS-353): the report change log. It records who changed what on a case, when, and from which workstation, so a log can be pulled.

## Decisions (Pete, 2026-09-28)

- **One entry per save.** Each entry holds the user, time, workstation and every field changed, old → new.
- **Every change to the case** is logged, under an area:
  - synoptic answers;
  - narrative (gross, microscopic, diagnosis);
  - codes, wherever they sit;
  - specimens and blocks;
  - case details (status, participants, holds, anything else).
- **Long text** shows as a word-level diff; the full before and after are stored.
- **Access:**
  - anyone who can open the case sees Change history on the report page;
  - anyone holding the capability `report:change-history:export` can export CSV (Admin and QA Reviewer by default, PS-355), and every export is audited.
  - QA was also named, but the app has no QA role at sign-in yet.

## Files

- **`IReportChangeLogService.ts`**: `ReportChangeEntry`, `ReportFieldChange` and the service (`record`, `listForCase`). There is no update or delete.
- **`reportChangeRules.ts`**: pure rules.
  - `diffCaseChanges(before, after, writtenKeys)`:
    - compares only the fields the save wrote;
    - ignores bookkeeping (`version`, `updatedAt`, nested timestamps);
    - matches list items by id, so reordering isn't a change;
    - labels records by their own labels (a specimen's label, a template's name);
    - files code lists under Codes;
    - treats empty and missing as the same.
  - `labelSynopticChanges`: turns answer field and option ids into the template's labels, as worded at save time.
  - `wordDiff` / `isLongText`: the word-level diff and when to use it (over 60 characters or 6 words).
  - `changeLogRows`: the export rows, with formula-like values neutralised. (`canExportChangeLog`, the admin-tier stand-in, was removed in Batch 369.)
- **`recordCaseChange.ts`**:
  - Called by every case write in the mock case services (`mockCaseService.updateCase`, its any-mode path, and `mockOrchestratorCaseService.updateCase`). Any screen or background write is covered, not only the report page.
  - Attributes the save to the signed-in user and the scan station.
  - Resolves synoptic labels, then records.
  - It never blocks the save.
- **`mockReportChangeLogService.ts`**: the browser store (`report_change_log`, cleared by Demo Reset). It fires `REPORT_CHANGE_LOGGED_EVENT` so an open report page refreshes.
- **`exportChangeLog.ts`**: the CSV, with translated headings from the caller. It checks `report:change-history:export` through the authorization service first (that check is audited too, naming the role that allowed it), refuses without it, and audits `Report change history exported`.

## Screens

- **Report page header:** a "📝 N recorded saves" chip beside the version chip.
- **`ChangeHistoryModal`:**
  - entries newest first, filtered by area;
  - old → new, or the word diff;
  - every value tagged `data-phi` for screenshot redaction.

## Production

`docs/architecture/REPORT_CHANGE_LOG_API.md`: the server writes the entry in the same transaction as the case update, computes the diff itself, and grants INSERT/SELECT only.

## Limits

- **Background writes** (Assist-mode polling, pool claims, flags) are attributed to the signed-in user in the browser demo. The server knows its real callers.
- **Field keys other than synoptic answers** show as stored (`finalDiagnosis`, `status`). Only synoptic answers are translated to template labels.
- **Undone edits:** one entry per save means an edit made and undone before saving leaves no trace. That is by design.

## Batch 369 (PS-355): export needs a capability

`exportChangeLog(caseId, entries, actor, labels, { auditService, authorization })` first calls `authorization.enforce('report:change-history:export', { caseId })`:
- that check is audited, naming the role that allowed it or why it was refused;
- the export is audited as before;
- `actor` is now just `{ name }`.

`canExportChangeLog(role)` is removed.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
