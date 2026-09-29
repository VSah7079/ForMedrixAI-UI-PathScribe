# services/billing/codeEngine/

**The Generic Code Engine (PS-89, Batch 333).** One shared set of rules for effective-dated code systems in the Billing Dictionary (`BillingRuleVersion`): CPT, HCPCS, NHS OPCS-4 and local lab codes. Having one set prevents a repeat of the `BillingRuleVersion` / `RvuTableVersion` duplication.

Everything here is pure and storage-neutral. The PS-89 design was written for Firestore write batches (450 ops, or 200 codes per chunk). The production database is now Microsoft SQL Server (Pete, Sep 2026), where an import is one transaction on the API server, so chunking belongs to that server, not to these rules.

## Files

- **`naturalSunset.ts`** — PS-89 §6. When a new version is approved, the version it supersedes **stays ACTIVE** and gets `effectiveTo` = the moment before the new version starts.
  - **Why it matters:** earlier dates of service keep resolving to the old rule.
  - **What it replaced:** `approveVersion` marked the prior version RETIRED immediately, so approving a future-dated change left every earlier date with no rule. That was a real bug.
  - **Limits:** only an open-ended prior is closed. A deliberately set expiry is never overwritten.
- **`countryMatch.ts`** — PS-89 §8. Decides whether a rule's country applies to the country being billed.
  - `UK` and `GB` are treated as the same.
  - An `EU` organisation matches rules for any EU member state, because `Organisation.country` uses `UK`/`EU` while the Billing Dictionary uses ISO member-state codes.
- **`csvColumnMapping.ts`** — PS-89 §9, the rules behind the import wizard.
  - **Required mappings:** `billingCode`, `cpt` and `effectiveFrom`. A batch-wide fallback date can stand in for an effective-date column.
  - **Auto-matching** is seeded from `parseRvuUploadRows`' aliases.
  - **One column, several fields:** one "Code" column may feed both `billingCode` and `cpt`.
- **`planCodeImport.ts`** — PS-89 §1-§2. Turns mapped CSV rows into new versions under one `CodeImportJob`.
  - **Versions:** the next version per `(billingCode, siteId)`.
  - **Status:** every row is **PENDING_APPROVAL**. Per Pete, one job is one approval.
  - **Change reason:** `changeReason` is synthesized as `Bulk Import [{jobId}] ({fileName}) by {user}`, plus the batch note if one was given.
  - **Defaults:** the level is inferred from the description or taken from a default; the billing type defaults to Global.
  - **Refused rows** each come with a reason: missing code, bad date, unknown level or type, bad RVU, a duplicate in the file, or a version already pending.
- **`planImportJob.ts`** — deciding a job as a whole.
  - **Approve:** four-eyes applies (the reviewer can't be the uploader). Rows become ACTIVE, natural sunset runs, and the closed priors are recorded on the job.
  - **Reject:** requires a reason; all rows become REJECTED.
  - **Rollback** (PS-89 §3-§4, approved jobs only):
    - a row a service charge used becomes RETIRED, with a note appended to `rollbackNotes` (the original `changeReason` is never overwritten);
    - an unused row is removed, recorded only in `purgedTuples`;
    - the priors it closed are reopened.
  - **Reference matching** is tuple-exact on `(billingCode, siteId, version)` via `ruleReferenceKey`. That avoids the cross-join false positive §4 describes.
- **`importJobAudit.ts`** (Batch 334) — the audit entries for upload, approve, reject and rollback, in literal English. The service writes them, so every path is audited, not just the screens.
- **`pendingImportQueue.ts`** (Batch 334) — what Pending Approvals shows: versions from an import job leave the per-row list (the job appears once instead), the uploader is locked out of deciding their own job, and only an approved job can be rolled back.
- **`importWizardRules.ts`** (Batch 334) — the Code Import screen's decisions: reading the CSV's header row, the usual country for each coding standard (CPT/HCPCS → US, NHS OPCS-4 → UK, local codes → none), setting a mapped column, and when an import can be submitted (a checked file with importable rows; refused rows only if the admin skips them).
- **`codeEngine.test.ts`** — 13 tests. **`importWizard.test.ts`** (Batch 334) — 7 tests.

The service that stores all this is `../mockCodeImportService.ts`. The job type is `types/billing/CodeImportJob.ts`.

## Deliberately not done

- **§7 race:** the narrow race between the reference check and removal is accepted as the design states. The charge itself stays accurate; only its deep rule-version trail is lost.
- **§10 legacy migration:** in the mock, the `vocabulary: 'CPT'` / `country: 'US'` backfill is done on load (`mockBillingRuleService.loadBillingRuleVersions`). A real database needs the same one-off field completion.
- **Real backend:** on SQL Server an import should be one transaction, and the rollback's reference check and removal should run in the same transaction, which closes the §7 race.

## Screens (Batch 334)

- **System → Financial & Revenue Lookups → Code Import (Bulk)** (`components/Config/System/CodeImportSection.tsx`): choose a CSV, the coding standard, country and site, and a batch note; match columns (billing code, CPT and effective date are required, and a date for the whole file can replace a date column); check the file, which lists every refused row with its reason; import. The same screen lists every job, newest first, with Roll back (reason required) for approved jobs.
- **System → Pending Billing Rule Approvals**: a pending job appears once in the dictionary-updates table with Approve / Reject (reason required); the uploader sees it locked.

---
*See [services/billing/README.md](../README.md) for the billing services this belongs to.*
