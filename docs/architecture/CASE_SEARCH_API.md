# Case search: the search endpoint on the PathScribe API server

**Status:** specification for the API server team. The browser side and an in-memory reference implementation are built and tested (Batch 350; Batch 351 added the section 3 filters); the endpoint itself is not built yet.
**Decision (Pete, Sep 27, 2026):** "Results should be paged so that the heavy lifting is done on the server side." The server filters, sorts, counts and returns one page; the browser never receives more cases than it shows.
**Stack:** ASP.NET Core API server over Microsoft SQL Server (Sep 2026 decisions).

## 1. What it's for

The **Case Search** page. A user sets filters, runs the search, and pages through the results. They can also export every match to CSV.

Before Batch 350, the browser asked the case list for everything and filtered it. Several filters never matched, the access check ran after each page was cut, and export only covered the rows on screen.

## 2. What already exists in the browser

All of this is in `src/services/caseSearch/`:

| File | What it does |
|---|---|
| `caseSearchTypes.ts` | **The wire contract, and the source of truth for this spec:** criteria, sort keys, page sizes, export row, limits |
| `caseSearchMatching.ts` | **The matching rules this spec describes, as code** (§5), plus ordering and page bounds. Pure functions, tested in `caseSearchMatching.test.ts` |
| `createCaseSearchService.ts` | The reference implementation: access-filtered cases → match → sort → count → page. Tested in `createCaseSearchService.test.ts`. Its `loadReferenceData()` dependency lists the data matching joins (§5.1) |
| `mockCaseSearchService.ts` | Wires it to this build's mock data. The API client replaces it |

The page turns its form into a request with `utils/search/buildCaseSearchRequest.ts`. It never sends a user id: the server takes the user from the session.

## 3. Endpoints

### `POST /api/cases/search`

Request body (`CaseSearchRequest`):

```json
{
  "criteria": { "mrn": "100001", "statuses": ["finalized"], "dateBasis": "signedOut", "dateFrom": "2026-08-28" },
  "sort": { "key": "accessionDate", "direction": "desc" },
  "page": 2,
  "pageSize": 25,
  "timeZone": "America/Phoenix"
}
```

Response 200 (`CaseSearchPage`):

```json
{ "items": [ /* Case, the same shape GET /api/cases/{id} returns */ ], "total": 312, "page": 2, "pageSize": 25, "pageCount": 13 }
```

- **`page`** is 1-based. A page past the end returns the last page, with `page` set to that page, so a pager never shows an empty page after cases stop matching.
- **`pageSize`** is 25, 50 or 100. Clamp anything else to 1–100.
- **`total`** is every case the user may see that matches, across all pages.
- **`timeZone`** is the facility's IANA time zone. It decides which calendar day an accession, sign-out or release timestamp falls on, and today's date for ages and turnaround. It defaults to UTC. The server may prefer the facility's configured zone.
- **POST, not GET:** criteria are too long and too sensitive (names, MRNs) for a URL or access logs.

### `POST /api/cases/search/export`

The same body without `page` and `pageSize`. It returns `CaseSearchExport`: `{ rows, total, truncated }`.

- `rows` holds at most 5,000 export rows (`CaseSearchExportRow`), in the requested order.
- Values are data: codes and ISO dates. The browser translates the headings, statuses and priorities and formats the dates for the user's locale.
- Flags are names: current flag records name their definition, and older records carry the name themselves.

## 4. Access control: before matching, never after

1. The user comes from the authenticated session.
2. Apply the same visibility rules as the case list (`CaseRouter.getAll` with `filterAccessibleCasesWithPools`) **in the query's WHERE clause**:
   - the organisation and enterprise boundary (the case's origin hospital);
   - subspecialty-restricted pools;
   - Orchestration cases only for users with `canViewOrchestration`.

   Pediatric patient details are not a visibility rule: the browser redacts them for users without `canViewPediatric`, as on the Worklist.
3. Only then match, count and page. A total or a page cut before the access check is wrong: that was the old bug.
4. Restricted pool cases are returned the way the case list returns them. The browser redacts patient details for users who haven't claimed them.

## 5. Matching rules

Criteria are **ANDed**. Values within one criterion are **ORed**. An empty or missing criterion means no restriction. Text matching is case-insensitive.

| Criterion | Matches |
|---|---|
| `anyIdentifier` | Any of the following: the accession number or external accession, MRN, MPI id (exact), requisition / external order / referral number, or the patient's name (every word, any order). For identifiers, punctuation doesn't matter: `s264403` finds `S26-4403` |
| `patientName` | Every word appears in the patient's given, family, first, last or preferred name |
| `mrn` | Part of the MRN (punctuation ignored) |
| `mpiId` | The patient's MPI id, exactly |
| `accessionNo` | Part of the accession or external accession number |
| `orderNo` | Part of the requisition, external order, referral, lab or block number |
| `dateFrom` / `dateTo` with `dateBasis` | The facility-local calendar date, inclusive, of: **`accessioned`** (default): `accession.accessionedAt`, else `order.receivedDate`, else the earliest specimen `receivedAt`, else `createdAt`. **`signedOut`**: `finalizedAt`, else the autopsy's FAD `signedAt`, else, for a case whose status is finalized, closed or pending release, `diagnostic.issuedDate`. **`released`**: `releasedAt`, else the sign-out instant for a finalized or closed case (a case in its release buffer isn't released). A case with no such date doesn't match |
| `sexes` | `patient.sex` in `M`, `F`, `U` (anything else counts as `U`) |
| `dobFrom` / `To`, `ageMin` / `Max` | Date of birth range, and age in whole years on today's facility date, both inclusive. A case with no DOB doesn't match |
| `statuses` | `status` |
| `priorities` | `order.priority`, exactly. A missing priority counts as `Routine` |
| `caseFlagIds` | A case flag that isn't removed (`deletedAt` null), referencing one of these definitions. An older inline record matches by the definition's name or LIS code |
| `specimenFlagIds` | The same, for any specimen's flags |
| `synopticTemplateIds` | Any `synopticReports[].templateId` |
| `pathologistIds` with `pathologistRole` | These staff on the case in the role (default `any`): **`assigned`** `order.assignedTo`; **`signedOut`** `finalizedBy`, else `diagnostic.finalizedBy` of a signed-out case; **`resident`** participants with participation type `resident`, and countersign records' resident; **`countersigner`** participants with type `attending`, and countersign records' attending; **`delegatedTo`** open (pending or accepted) delegations' recipient; **`any`** all of these, plus `acceptedBy`, every participant and `synopticReports[].assignedTo` |
| `orderingPhysicianIds` | `order.orderingPhysicianId`, or a `requestingProvider` equal to that physician's name (titles ignored) |
| `submittingFacilityIds` | `order.facilityId`. A chosen organisation includes every facility under it (Batch 354; see below) |
| `specimenTerms` | Any specimen's description, label or display name contains the term |
| `diagnosisTerms` | The diagnostic text contains the term: primary and secondary diagnoses, microscopic description, preliminary impression, synoptic tumour type and grade, or a biomarker result ("her2 3+") |
| `snomedCodes` | `coding.snomed`, or any specimen's SNOMED codes |
| `icdCodes` | ICD-10, ICD-11 and ICD-O on the case, the order's ICD-10 codes, and specimen ICD codes. A category matches its sub-codes: `C50` finds `C50.412` |
| `caseTypes` | **`autopsy`**: the case has autopsy details. **`gynCytology`** / **`nonGynCytology`**: a specimen's dictionary entry has category `GYN_CYTOLOGY` / `NON_GYN_CYTOLOGY`. **`surgical`**: neither (`resolveCaseDisciplineBranch` = `surgpath`) |
| `revisionTypes` | `amendment`, `correction`, `addendum`: `lastRevisionType` on the case or a synoptic report, or a **released** amendment record of that type for the case |
| `holdTypes` | An **active** hold: `case` (`caseHolds`), `retention` (`retentionHolds`), `autopsyAncillary` (`autopsy.ancillaryHold`) |
| `resultFlags` | `abnormalDetectionStatus.severity`: `Abnormal`, `Critical`, `Malignant` |
| `pendingWork` | Stain orders on blocks and decants whose status isn't Coverslipped, Ready for Review or Cancelled. **`stains`**: any such order. **`ihc`** / **`molecular`**: one whose stain, looked up by name in the stain dictionary, has category IHC or Immunofluorescence / Molecular. **`addOns`**: an add-on order (ordering pathologist, add-on priority or panel set) that is open or has an exception awaiting pathologist review |
| `pastTatTarget` | The TOTAL_CASE turnaround target applies (most-specific TAT entry for the case's facility, performing lab, first specimen type, subspecialty and urgency; STAT and Rush count as STAT) and the time from `order.receivedDate` (else the accession instant) to sign-out, or to now for an open case, exceeds it. No target, no match |
| `subspecialtyIds` | `subspecialtyId`, else the subspecialty its synoptic protocols map to, else the first specimen routing rule that matches (for the case's performing lab) |
| `performingLabIds` | The submitting facility's performing lab: the facility's `performingLabFacilityId`, else the facility itself when it has the performing-lab role. A chosen organisation includes every lab under it (Batch 354) |
| `locationIds` | `order.locationId` |
| `intakes` | `standard` (`order.intakeType` missing or standard), `downtime`, `outside`, and `referenceLab` (`isReferenceLabCase`) |
| `payer` | Part of `order.outsidePatientData`'s billing type, primary or secondary payer name |
| `cptCodes` | CPT codes on the case, a specimen, a specimen's matrix-block coding or a block. A prefix matches (`8834` finds `88342`) |
| `autopsyJurisdictions` / `autopsyAuthorities` / `autopsyReports` | Only autopsy cases. `autopsy.jurisdiction`; `autopsy.caseAuthority`; reports `none` (neither snapshot), `pad` (`padSnapshot`), `fad` (`fadSnapshot`) |

**Organisations include what is under them (Batch 354).** Pete: "Trust-level search to automatically include child organizations and specimens underneath them."
- **Expansion:** before matching, the server expands `submittingFacilityIds` and `performingLabIds`. Each chosen facility brings every facility whose `parentId` chain reaches it, at any depth (Trust → hospital site → ordering client).
- **Examples:**
  - Choosing an NHS Trust finds every case at its sites.
  - Choosing one site finds that site's cases.
- **Reference implementation:** `expandOrganisationCriteria` in `caseSearchMatching.ts` and `withDescendantFacilityIds` in `services/facilities/facilityHierarchy.ts`.
- **In SQL:** a recursive CTE over `Facility.ParentId`. Guard against loops in the data.

### 5.1 Data the server joins (Batch 351)

The reference implementation receives these as `CaseSearchReferenceData`. In SQL they are joins or lookups:
- the specimen dictionary (category per entry);
- facilities (performing lab per submitting facility, and each facility's parent, for the organisation tree);
- the stain dictionary (category per stain name);
- amendment records (released types per case);
- countersign records (resident and attending per case);
- delegations (open recipients per case);
- protocol-to-subspecialty mapping and specimen routing rules;
- TAT entries and the most-specific-wins resolver (`resolveTatTargetHours`).

## 6. Sorting

| `key` | Order by |
|---|---|
| `accessionDate` | The accession instant (§5) |
| `signedOutDate` | The sign-out instant (§5); open cases last |
| `lastUpdated` | `updatedAt` |
| `patientName` | Family name, then given name |
| `accessionNumber` | Full accession number |

- **Nulls:** cases with no value sort last in either direction.
- **Tiebreak:** always add the case id as the final key. Without it, a case can appear on two pages or on none.

## 7. SQL Server notes

- **One query:** filter (access rules + criteria), then `ORDER BY … , Id`, then `OFFSET (@page-1)*@pageSize ROWS FETCH NEXT @pageSize ROWS ONLY`. The total comes from `COUNT(*) OVER()` or a second count on the same WHERE clause.
- **Why page numbers here:** Search needs "page 3 of 13" and a total. The cursor paging on the internal case list (`CaseFilterParams.cursor`) stays for callers that stream. Search users rarely go past the first few pages, and OFFSET with the indexes below is fine at that depth. If deep paging becomes common, keyset paging on (sort key, Id) can replace OFFSET without changing this contract.
- **Indexes:**
  - accession instant, `updatedAt`, patient family/given name, and accession number, each with Id;
  - MRN, MPI id, requisition number, `order.facilityId`, status and priority;
  - the flag and participant child tables.
- **Text:** `anyIdentifier`, `patientName`, `diagnosisTerms` and `specimenTerms` are contains-matches. Use full-text indexes for diagnosis and specimen text. Store normalised (punctuation-stripped) copies of identifiers for the punctuation-insensitive match.
- **Parameters:** parameterise every value. The lists (statuses, ids) become table-valued parameters.

## 8. Audit

- **Search:** each search is recorded as a case search by the user. The reference implementation's case list does this (`case.search`).
- **Export:** each export is recorded with the row count and total, as literal English with no patient data. In the reference implementation: "Exported 99 of 99 matching cases from Search to CSV".

## 9. Acceptance tests for the endpoint

1. Pages of one search never overlap and together return every match, in the requested order (`createCaseSearchService.test.ts`).
2. `total` and page sizes are counted after access rules: a user who can't see a case never has it counted.
3. A page past the end returns the last page.
4. Each row of §5 has a case in `caseSearchMatching.test.ts`. Port those cases to the server's tests.
5. Export stops at 5,000 rows, reports `truncated`, and writes one audit entry.

## 10. Open items

- **Demo data:** several Batch 351 filters match nothing in this build's demo cases, because no case carries the data yet: holds, the abnormal marker, locations, intake type, payer, sign-out timestamps (one case has an issued date) and autopsy details. Their rules are covered by `caseSearchMatching.test.ts`.
- **TAT targets and delegations** now come from their own services (Batch 353): `tatTargetService` with the resolver in `services/tatConfig/tatTargetResolution.ts`, and `delegationService`. Their endpoints are in [TAT_AND_DELEGATION_API.md](TAT_AND_DELEGATION_API.md).
