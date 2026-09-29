# services/deploymentReadiness/

**Keeps the UI deployment-neutral (Batch 330).** PathScribe has to deploy to public or private cloud (Azure, AWS, Google, or a hospital's own data centre). The real backend isn't built yet. These files make sure the screens don't pick up new dependencies on where data lives while it is being built.

## Files

- **`deploymentReadiness.guard.test.ts`** — three rules for the UI layer (`components/`, `pages/`, `hooks/`, `contexts/`, and top-level `src/*.tsx`):
  1. **No direct mock-service import** (`…/mockXxx`). Use `@/services` or an injected dependency, so replacing mocks with the real backend is one switch rather than a change in every screen.
  2. **No direct `localStorage` / `sessionStorage`.** Display preferences go through `utils/uiPreferences.ts`; data goes through a service.
  3. **No direct Firebase SDK import.** The database is reached only through services, so it can be replaced. Production will use Microsoft SQL Server behind an API server (Pete, Sep 2026).
- **`deploymentBaseline.ts`** — the files that broke a rule when the guard was added. It listed 183 mock imports, 39 browser-storage users and 1 Firebase import. Batch 334 removed `PendingApprovalSection.tsx` from the mock-import list (182 left). Batch 338 removed `OrchestratorSectionEditor.tsx` from the mock-import list (181 left) and `components/Editor/PathScribeEditor.tsx` from the browser-storage list (38 left; its theme preference now goes through `utils/uiPreferences.ts`). Batch 342 removed `pages/OrSuiteDashboardPage.tsx` from the mock-import list (180 left). Batch 343 (PS-60) removed `contexts/AuthContext.tsx` from both lists, and `ProtectedRoute.tsx` and `pages/LoginPage.tsx` from the browser-storage list (179 mock imports, 35 browser-storage users left). Batch 344 removed `pages/SynopticReportPage/modals/PreFinalisationModal.tsx` from the mock-import list and `pages/Synoptic/useSynopticFinalize.ts` from the browser-storage list (178 and 34 left). Batch 350 removed `pages/SearchPage.tsx` from both lists (177 and 33 left): saved searches go through the saved-search service, the last search through `utils/search/searchSession.ts`, and the action registry through `@/services`.
  - **The lists only shrink.** A new file may not break a rule, and a listed file that has been cleaned up must come off the list; the guard fails otherwise.
  - **Checked:** a new file importing a mock and using `localStorage` fails the guard with the fix named.

## Not covered by the guard

- **Services that answer synchronously.** For example `getSessionUser()`, and `templates/templateGovernanceSettings.ts → getTemplateGovernanceSettings()` from Batch 328. A real backend is asynchronous, so their callers will need a small change.
- **The protocol registry** (`components/Config/Protocols/protocolShared.tsx → PROTOCOL_REGISTRY`) lives in a component folder and is changed in place by `templates/templateService.ts`. It should move behind the template service.
- **Build-time settings.** `VITE_` settings are fixed when the app is built, so each customer would need its own build. Deployment needs settings read at run time.

## Batch 353

The TAT and delegation services took six files off the mock-import baseline (177 → 171) and four off the browser-storage baseline (33 → 29):
- `TATConfigSection.tsx`, `QualityTab.tsx`, `EnterpriseRollupTab.tsx` and `ContributionDashboardPage.tsx` came off both.
- `DelegateModal.tsx` and `InformalReviewBanner.tsx` came off the mock-import baseline.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

Seven files came off `MOCK_IMPORT_BASELINE` (they now import from `@/services`): `CasePoolAssignmentSection`, `ExternalConsultViewPage`, `EmbeddingStationPage`, `MicrotomyWorkstationPage`, `IntraopQueuePage`, `LeftReportPanel`, `useSpecimenBlockManagement`.

## Batch 365 (PS-347)
`pages/AccessionPage/OrderLookupModal.tsx` came off `MOCK_IMPORT_BASELINE`: it takes `patientIndexService` from `@/services`. `AccessionPage.tsx` was touched too but stays listed; it imports about fifteen mock services, too many to move in this batch.

## Batch 368

- **Came off `MOCK_IMPORT_BASELINE`:**
  - they now import from `@/services`: `CytologyCategoriesSection`, `AIContributionTab`, `MentorTab`, `ProductivityTab`, `FacilityEditorModal`, `CytologyQaTab`, `ReassignCasePatientPanel`, `TemplateAssemblyPage`, `BatchDetailView`, `EngraverMonitorPage`, `LabelDesignerPage`, `MolecularWorkcenterPage`, `CaseTeamModal`;
  - `BottomActionBar` reads `reportReleaseService`.
- **Came off the browser-storage list:** `CommentModalShell` keeps the dialog position through `utils/uiPreferences.ts`.
- **Correction:** Batch 367 touched these files, and others still listed, without doing this cleanup, and its notes didn't say so.
- **Still listed after being touched in Batch 367 or 368**, because the cleanup isn't practical in a small change:
  - `SynopticReportPage` and `QualityAssurancePage` (many mock imports);
  - `DeliveryRulesSection` (4) and `ValidationStudiesSection` (5);
  - `DemoResetTab` (clears browser storage by design);
  - `TemplatePreviewPanel` and `WorklistTable` (browser storage);
  - `HeaderBar` (a type import from `mockLisSyncService` and a session-storage flag set by messaging).

## Batch 369 (PS-355)

Seven files came off the mock-import baseline. Their mock imports were replaced with `@/services` (new exports: `billingDeficiencyService`, `outboundChargeQueueService`, `codeReviewPoolService`, `reasonDictionaryService`):
- `components/Config/Staff/RoleDictionary.tsx`
- `components/QualityAssurance/InspectionModeTab.tsx`
- `components/QualityAssurance/IntraopLinkageTab.tsx`
- `components/QualityAssurance/PatientMatchReviewSection.tsx`
- `components/QualityAssurance/QaDashboardTab.tsx`
- `components/QualityAssurance/ReconciliationTab.tsx`
- `pages/QualityAssurancePage.tsx`

`SynopticReportPage.tsx` was touched and stays listed. Its remaining direct imports are part of the report page's larger cleanup, as in Batch 368.

## Batch 370 (PS-356)

`components/Config/System/DemoResetTab.tsx` came off the browser-storage baseline. Its reset logic moved to `services/demoReset/`.

## Batch 380

`pages/SynopticReportPage/modals/AmendmentModal.tsx` (reason dictionary through `@/services`) and `pages/SynopticReportPage/hooks/useAmendmentWorkflow.ts` (audit service and the two AI suggestion functions through `@/services`) came off the mock-import baseline.

## Batch 381

Off the baselines:
- **`pages/SynopticReportPage/SynopticReportPage.tsx`, both lists.**
  - Audit, billing rules, service charges, the action registry, report templates, report release and the grossing-template evaluation now come through `@/services`.
  - The header's compact mode, the sidebar and the tab width are `utils/uiPreferences` preferences.
  - The search-results list is read with `getSessionFlag`.
- **`pages/SynopticReportPage/modals/BlockStainEditorModal.tsx`:** molecular targets and cassette colours come through `@/services`.

## Batch 382

Off the mock-import baseline: `components/Billing/CorrectAppliedCodeModal.tsx` (RVU code map), `components/Billing/PostSignoutBillingChangeModal.tsx` (reason dictionary) and `pages/SynopticReportPage/modals/DiscordanceReconciliationModal.tsx` (the frozen-final activity type id), all now through `@/services`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
