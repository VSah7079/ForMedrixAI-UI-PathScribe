import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import { ToastContainer, toast } from "react-toastify";
// PS-100 (Batch 349): warnings, errors and long toasts stay until closed.
import { installToastPolicy } from "./utils/installToastPolicy";
// react-toastify's stylesheet must load BEFORE pathscribe.css: both declare
// `:root { --toastify-* }`, and the later declaration wins regardless of
// selector specificity. pathscribe.css's own toast section (search
// "TOAST NOTIFICATIONS") re-maps those variables onto PathScribe's dark
// theme tokens — that only takes effect if it loads last.
import "react-toastify/dist/ReactToastify.css";
import "./pathscribe.css";

// Auth + Providers
import { AuthProvider } from "./contexts/AuthContext";
import { SystemConfigProvider } from "./contexts/SystemConfigContext";
import { MessagingProvider } from "./contexts/MessagingContext";
import { SpecimenDictionaryProvider } from "./components/Config/System/useSpecimenDictionary";

// Breadcrumb
import { BreadcrumbProvider } from './contexts/BreadcrumbContext';
import { DirtyStateProvider } from './contexts/DirtyStateProvider';

// Voice Integration
import { VoiceProvider } from "./contexts/VoiceProvider";

// Scanner Integration (barcode/QR scanner support)
import { ScannerProvider } from "./contexts/ScannerProvider";
import { MaterialScanTrackingBridge } from "./components/MaterialScanTrackingBridge";
import { DefaultActionOnScanBridge } from "./components/DefaultActionOnScanBridge";

// PathScribe Agent print progress (Batch 346, PS-52)
import { AgentPrintStatus } from "./components/Printing/AgentPrintStatus";
// Network print results and Retry (Batch 347, PS-54)
import { NetworkPrintJobs } from "./components/Printing/NetworkPrintJobs";

// Standard Wrappers
import ProtectedRoute from "./ProtectedRoute";
import ScreenGate from "./components/Common/ScreenGate";
import MobileRestrictedRoute from "./MobileRestrictedRoute";
import AppShell from "./components/AppShell/AppShell";

// Loaders
import { synopticLoader } from "./loaders/synopticLoader";

//EMR Access
import MockEMRPage from './pages/MockEMRPage';
import MockWsiViewerPage from './pages/MockWsiViewerPage';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const Home = lazy(() => import("./pages/Home"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const AccessionPage = lazy(() => import("./pages/AccessionPage/AccessionPage"));

const WorklistPage = lazy(() => import("./pages/WorklistPage/WorklistPage"));
const CytologyWorklistPage = lazy(() => import("./pages/CytologyWorklistPage/CytologyWorklistPage"));
const PathologyWorkspacePage = lazy(() => import("./pages/PathologyWorkspacePage/PathologyWorkspacePage"));
const QualityComplianceHubPage = lazy(() => import("./pages/QualityComplianceHubPage/QualityComplianceHubPage"));
const CytologyScreeningPage = lazy(() => import("./pages/CytologyWorklistPage/CytologyScreeningPage"));
const MolecularWorkcenterPage = lazy(() => import("./pages/MolecularWorkcenterPage/MolecularWorkcenterPage"));
const MolecularPlateBuilderPage = lazy(() => import("./pages/MolecularBatchPage/MolecularPlateBuilderPage"));
const MolecularRackWorklistPage = lazy(() => import("./pages/MolecularBatchPage/MolecularRackWorklistPage"));
const MolecularRackLoadingPage = lazy(() => import("./pages/MolecularBatchPage/MolecularRackLoadingPage"));
const MolecularControlRulesPage = lazy(() => import("./pages/MolecularBatchPage/MolecularControlRulesPage"));
const MockInterfaceEnginePage = lazy(() => import("./pages/MockInterfaceEnginePage/MockInterfaceEnginePage"));
const QualityAssurancePage = lazy(() => import("./pages/QualityAssurancePage"));
const BatchManagementPage = lazy(() => import("./pages/BatchManagement/BatchManagementPage"));
const DisposalQueuePage = lazy(() => import("./pages/BatchManagement/DisposalQueuePage"));
const DisposalReportPage = lazy(() => import("./pages/BatchManagement/DisposalReportPage"));
const PendingBatchQueuePage = lazy(() => import("./pages/BatchManagement/PendingBatchQueuePage"));
const EngraverMonitorPage = lazy(() => import("./pages/BatchManagement/EngraverMonitorPage"));
const IntraopQueuePage = lazy(() => import("./pages/IntraopQueuePage"));
const OrSuiteDashboardPage = lazy(() => import("./pages/OrSuiteDashboardPage"));
const FacilityOpsDashboardPage = lazy(() => import("./pages/FacilityOpsDashboard/FacilityOpsDashboardPage"));
const ExternalConsultViewPage = lazy(() => import("./pages/ExternalConsultViewPage/ExternalConsultViewPage"));
const CriticalAlertReferencePage = lazy(() => import("./pages/CriticalAlertReferencePage/CriticalAlertReferencePage"));
const MigrationJobsPage = lazy(() => import("./pages/MigrationJobsPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const ConfigurationPage = lazy(() => import("./pages/ConfigurationPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ContributionDashboardPage = lazy(() =>
  import("./pages/ContributionDashboardPage")
);

const SynopticReportPage = lazy(() =>
  import("./pages/SynopticReportPage/SynopticReportPage")
);
const GrossingScreenPage = lazy(() =>
  import("./pages/GrossingScreenPage/GrossingScreenPage")
);
const MicrotomyWorkstationPage = lazy(() =>
  import("./pages/MicrotomyWorkstationPage/MicrotomyWorkstationPage")
);
const EmbeddingStationPage = lazy(() =>
  import("./pages/EmbeddingStationPage/EmbeddingStationPage")
);
const SlideDistributionStationPage = lazy(() =>
  import("./pages/SlideDistributionStationPage/SlideDistributionStationPage")
);
const AddOnOrderPage = lazy(() =>
  import("./pages/AddOnOrderPage/AddOnOrderPage")
);
const MolecularOrderQueuePage = lazy(() =>
  import("./pages/MolecularOrderQueuePage/MolecularOrderQueuePage")
);
const FullReportPage = lazy(() => import("./pages/FullReportPage"));

const SynopticEditor = lazy(() =>
  import("./components/Config/Protocols/SynopticEditor")
);
const TemplateRendererPage = lazy(() =>
  import("./components/Config/Templates/TemplateRenderer").then((m) => ({
    default: m.TemplateRenderer,
  }))
);

// ── Report Part & Template Assembly (replaces old TemplateBuilderPage) ────────
const PartBuilderPage = lazy(() =>
  import("./components/TemplateBuilder/PartBuilderPage")
);
const TemplateAssemblyPage = lazy(() =>
  import("./components/TemplateBuilder/TemplateAssemblyPage")
);

// ── Loading fallback ──────────────────────────────────────────────────────────
// Real, found while converting this file: the `ps-spin` keyframe below was
// being redefined locally on every render via an inline <style> tag, when
// it's already a real, global keyframe in pathscribe.css (reused by
// .ps-autogen-toast-spinner elsewhere) — dead, redundant CSS. Uses the
// existing global keyframe via a real class instead.
const PageLoader: React.FC = () => (
  <div className="ps-app-loader-overlay">
    <div className="ps-app-loader-spinner" />
  </div>
);

installToastPolicy(toast);

// ── App ───────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <Router>
    <ToastContainer />
    <div className="ps-print-feedback">
      <NetworkPrintJobs />
      <AgentPrintStatus />
    </div>
    <SystemConfigProvider>
      <AuthProvider>
        <MessagingProvider>
          <SpecimenDictionaryProvider>
              <DirtyStateProvider>
                <BreadcrumbProvider>
                <VoiceProvider>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      
                      {/* Public route — shown when not authenticated */}
                      <Route path="/login" element={<LoginPage />} />
                      {/* PS-60: where the identity provider returns after SSO sign-in. */}
                      <Route path="/auth/callback/:providerId" element={<AuthCallbackPage />} />

                      {/* Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
                          Intraoperative/Frozen Section Dashboard — deliberately
                          public/unauthenticated. This is a Location-First "Station
                          Identity" terminal (a wall-mounted OR display), not a
                          lab-staff login; it must stay up and keep its live timers
                          running without ever hitting this app's own normal session
                          timeout. Individual attribution for a real action (a
                          verbal report, an alert acknowledgement) happens via its
                          own, separate quick-auth PIN flow inside the page itself,
                          never via this app's normal, authenticated login. */}
                      <Route path="/or-suite-dashboard" element={<OrSuiteDashboardPage />} />

                      {/* PS-288 — same real, deliberate "public/
                          unauthenticated, wall-mounted Station-Identity
                          display" reasoning as /or-suite-dashboard just
                          above: a Grossing/Embedding/Staining/etc. bench
                          display binds once to a real Display Profile
                          (facilityOpsDashboard/) and must keep running
                          without hitting this app's own normal session
                          timeout. */}
                      <Route path="/facility-ops-dashboard" element={<FacilityOpsDashboardPage />} />

                      {/* PS-290 — deliberately public/unauthenticated for a
                          different real reason than the two routes above:
                          there is no PathScribe login for an outside
                          consultant to have at all. The token in the URL
                          IS this route's entire authorization — see
                          services/consultAccess/IConsultTokenService.ts's
                          own header for the full, load-bearing caveat on
                          what that does and does NOT mean. Do not treat
                          this route as a precedent for any other
                          unauthenticated PHI-bearing page without the
                          same explicit caveat. */}
                      <Route path="/consult/:token" element={<ExternalConsultViewPage />} />

                      {/* PS-136 — the reference-resolution landing page
                          behind the SMS/secure-email non-PHI "tap to
                          view" deep link. This IS the "any other
                          unauthenticated PHI-bearing page" the comment
                          just above warns against becoming — the
                          answer, not an exception to it: this route
                          never displays PHI or clinical content at all
                          (no findingTerm/findingSeverity/sourceQuote),
                          precisely because it has no real
                          authentication to gate that with. See
                          services/clinical/ICriticalAlertReferenceTokenService.ts's
                          own header and CriticalAlertReferencePage.tsx's
                          own header for the full reasoning. Do not add
                          real clinical content to this route without
                          first adding the same "same explicit caveat"
                          this file's own comments require. */}
                      <Route path="/critical-alert/:token" element={<CriticalAlertReferencePage />} />

                      {/* Protected Routes — ScannerProvider only active when authenticated */}
                      <Route element={<ProtectedRoute />}>
                        <Route element={<MobileRestrictedRoute />}>
                        <Route element={<ScannerProvider><MaterialScanTrackingBridge /><DefaultActionOnScanBridge /><AppShell /></ScannerProvider>}>
                          <Route path="/" element={<Home />} />
                          <Route path="/accession" element={<ScreenGate screen="accession"><AccessionPage /></ScreenGate>} />
                          <Route path="/worklist" element={<ScreenGate screen="worklist"><WorklistPage /></ScreenGate>} />
                          {/* "Homepage Changes part 1" — direct request: new second-level
                              hub grouping Cytology Workspace, Microtomy Workspace, Embedding
                              Workspace, and Slide Distribution Workspace behind one Home tile. */}
                          <Route path="/pathology-workspace" element={<ScreenGate screen="pathologyWorkspace"><PathologyWorkspacePage /></ScreenGate>} />
                          {/* Real, direct follow-up (Sep 2026) — Quality & Compliance hub
                              grouping Audit and Quality Assurance behind one Home tile,
                              same real second-level-hub pattern as Pathology Workspace. */}
                          <Route path="/quality-compliance" element={<ScreenGate screen="qualityCompliance"><QualityComplianceHubPage /></ScreenGate>} />
                          <Route path="/cytology-worklist" element={<ScreenGate screen="cytologyWorkspace"><CytologyWorklistPage /></ScreenGate>} />
                          <Route path="/cytology-worklist/:caseId" element={<ScreenGate screen="cytologyWorkspace"><CytologyScreeningPage /></ScreenGate>} />
                          <Route path="/molecular" element={<ScreenGate screen="molecular"><MolecularWorkcenterPage /></ScreenGate>} />
                          <Route path="/molecular-batch/:batchId" element={<ScreenGate screen="molecular"><MolecularPlateBuilderPage /></ScreenGate>} />
                          <Route path="/molecular-rack" element={<ScreenGate screen="molecular"><MolecularRackWorklistPage /></ScreenGate>} />
                          <Route path="/molecular-rack/:rackId" element={<ScreenGate screen="molecular"><MolecularRackLoadingPage /></ScreenGate>} />
                          <Route path="/molecular-control-rules" element={<ScreenGate screen="molecular"><MolecularControlRulesPage /></ScreenGate>} />
                          <Route path="/dev/mock-interface-engine" element={<MockInterfaceEnginePage />} />
                          <Route path="/quality-assurance" element={<ScreenGate screen="qualityAssurance"><QualityAssurancePage /></ScreenGate>} />
                          <Route path="/batch-management" element={<ScreenGate screen="batchManagement"><BatchManagementPage /></ScreenGate>} />
                          <Route path="/batch-management/disposal" element={<ScreenGate screen="batchManagement"><DisposalQueuePage /></ScreenGate>} />
                          <Route path="/batch-management/disposal-report" element={<ScreenGate screen="batchManagement"><DisposalReportPage /></ScreenGate>} />
                          <Route path="/batch-management/pending-load" element={<ScreenGate screen="batchManagement"><PendingBatchQueuePage /></ScreenGate>} />
                          <Route path="/batch-management/engraver-monitor" element={<ScreenGate screen="batchManagement"><EngraverMonitorPage /></ScreenGate>} />
                          <Route path="/workstations/microtomy" element={<ScreenGate screen="microtomy"><MicrotomyWorkstationPage /></ScreenGate>} />
                          <Route path="/workstations/embedding" element={<ScreenGate screen="embedding"><EmbeddingStationPage /></ScreenGate>} />
                          <Route path="/workstations/slide-distribution" element={<ScreenGate screen="slideDistribution"><SlideDistributionStationPage /></ScreenGate>} />
                          <Route path="/add-on-orders" element={<ScreenGate screen="addOnOrders"><AddOnOrderPage /></ScreenGate>} />
                          <Route path="/intraop-queue" element={<ScreenGate screen="intraopQueue"><IntraopQueuePage /></ScreenGate>} />
                          <Route path="/molecular-order-queue" element={<MolecularOrderQueuePage />} />
                          {/* Batch 375: the two peer-review queues are views of the Worklist now; the old addresses land there. */}
                          <Route path="/cytology-qc-queue" element={<Navigate to="/worklist?view=cytologyQc" replace />} />
                          <Route path="/surgical-qa-worklist" element={<Navigate to="/worklist?view=surgicalQa" replace />} />
                          <Route path="/migration-jobs" element={<MigrationJobsPage />} />
                          <Route path="/search" element={<ScreenGate screen="search"><SearchPage /></ScreenGate>} />
                          <Route path="/audit" element={<ScreenGate screen="auditLog"><AuditLogPage /></ScreenGate>} />
                          <Route
                            path="/configuration"
                            element={<ScreenGate screen="configuration"><ConfigurationPage /></ScreenGate>}
                          />
                          <Route
                            path="/contribution"
                            element={<ScreenGate screen="myContributions"><ContributionDashboardPage /></ScreenGate>}
                          />
                        </Route>

                        {/* Clinical Routes — full-screen, AppShell mounted for drawer/messaging but NavBar hidden */}
                        <Route element={<ScannerProvider><MaterialScanTrackingBridge /><DefaultActionOnScanBridge /><AppShell hideNav /></ScannerProvider>}>
                          <Route
                            path="/case/:caseId/synoptic"
                            element={<SynopticReportPage />}
                            loader={synopticLoader}
                          />
                          <Route
                            path="/case/:caseId/grossing"
                            element={<GrossingScreenPage />}
                            loader={synopticLoader}
                          />
                          <Route
                            path="/report/:caseId"
                            element={<FullReportPage />}
                          />
                        </Route>

                        {/* ── Report Part Builder — full-screen canvas for one part ── */}
                        <Route
                          path="/admin/parts/new"
                          element={<PartBuilderPage />}
                        />
                        <Route
                          path="/admin/parts/:partId/edit"
                          element={<PartBuilderPage />}
                        />

                        {/* ── Template Assembly — slot list editor ── */}
                        <Route
                          path="/admin/templates/new"
                          element={<TemplateAssemblyPage />}
                        />
                        <Route
                          path="/admin/templates/:templateId/edit"
                          element={<TemplateAssemblyPage />}
                        />

                        <Route
                          path="/template-editor/new"
                          element={<SynopticEditor />}
                        />
                        <Route
                          path="/template-editor/:templateId"
                          element={<SynopticEditor />}
                        />
                        <Route
                          path="/template-review/:templateId"
                          element={<TemplateRendererPage />}
                        />
                        <Route
                          path="/mock-emr"
                          element={<MockEMRPage />}
                        />
                        <Route
                          path="/wsi-viewer"
                          element={<MockWsiViewerPage />}
                        />
                        </Route>
                      </Route>
                      {/* Redirect any unmatched paths to login */}
                      <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                  </Suspense>
                </VoiceProvider>
                </BreadcrumbProvider>
                </DirtyStateProvider>
            </SpecimenDictionaryProvider>
        </MessagingProvider>
      </AuthProvider>
    </SystemConfigProvider>
  </Router>
);

export default App;
