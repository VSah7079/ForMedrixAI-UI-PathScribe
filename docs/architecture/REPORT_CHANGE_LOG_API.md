# Report change log — API server contract (PS-353)

Batch 368 built the report change log in the browser demo (`src/services/reportChangeLog/`). This is what the ASP.NET Core API server must do so the production log is complete and trustworthy.

## Requirement (Pete, 2026-09-28)

"The system should be auditing changes so that a log can be pulled." Decisions:

| Question | Decision |
|---|---|
| Granularity | One entry per save: who, when, which workstation, and every field changed in that save, old → new |
| Scope | All changes to the case: synoptic answers, narrative, codes, specimens and blocks, case details |
| Long text | Word-level diff on screen; the full before and after are stored |
| Access | Anyone who can open the case can read it; admins (and QA, once QA is a role) can export CSV, and every export is audited |

## Writing entries

- **Where:** in the same database transaction as every case update. The demo does it in the mock case services (`recordCaseChange`), which every write path passes through, including background ones. On the server there must be no update path that skips it.
- **What:**
  - Compute the diff server-side from the stored row before the update and the row after it. Never trust a diff sent by the client.
  - Rules (`reportChangeRules.ts` is the reference):
    - only the fields the update wrote;
    - bookkeeping ignored (`version`, `updatedAt`, `lastUpdatedFromStation`, nested timestamps);
    - list items matched by id, so reordering is not a change;
    - codes filed under Codes wherever they sit;
    - synoptic answers stored with the template's field and option labels as worded at save time.
- **Attribution:**
  - The user comes from the authenticated principal, never from the request body.
  - The workstation comes from the scan-station header the audit trail already uses.
  - Background writes (Assist-mode polling, interface messages) are attributed to their service identity. In the browser demo they show as the signed-in user.
- **Append-only:**
  - The application role gets INSERT and SELECT only on the table: no UPDATE, no DELETE.
  - Retention matches the case record's.

### Suggested table (SQL Server)

```sql
CREATE TABLE report_change_log (
  id            UNIQUEIDENTIFIER PRIMARY KEY,
  case_id       NVARCHAR(64)  NOT NULL,
  saved_at      DATETIME2(3)  NOT NULL,
  user_id       NVARCHAR(64)  NOT NULL,
  user_name     NVARCHAR(200) NOT NULL,
  station_id    NVARCHAR(64)  NULL,
  case_version  INT           NOT NULL,   -- the version this save produced
  changes       NVARCHAR(MAX) NOT NULL    -- JSON array of ReportFieldChange
);
CREATE INDEX ix_report_change_log_case ON report_change_log (case_id, saved_at);
```

`ReportFieldChange` is `{ area, path[], kind: changed|added|removed, before, after }` (`IReportChangeLogService.ts`).

## Reading and exporting

| Endpoint | Who | Notes |
|---|---|---|
| `GET /cases/{caseId}/change-log` | anyone with access to the case (same check as `GET /cases/{caseId}`) | Oldest first; paged if large |
| `GET /cases/{caseId}/change-log/export.csv` | capability `report:change-history:export` (Batch 369; see `AUTHORIZATION_API.md`) | Writes an audit event `Report change history exported` with the counts; values starting with `= + - @` are prefixed with `'` so spreadsheets don't run them |

## Not in scope here

- **PDF integrity at release:** a failed PDF blocks release, a SHA-256 is kept and checked on retrieval, and rendering is reproducible. That is PS-354.
- **A QA role:** built in Batch 369 (PS-355). Export needs the capability `report:change-history:export`, which Admin, QA Reviewer and Superadmin hold by default.
