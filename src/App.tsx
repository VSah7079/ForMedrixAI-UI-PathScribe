import React, { Suspense, lazy } from "react";
import "./pathscribe.css";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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

// Standard Wrappers
import ProtectedRoute from "./ProtectedRoute";
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
const AccessionPage = lazy(() => import("./pages/AccessionPage/AccessionPage"));

const WorklistPage = lazy(() => import("./pages/WorklistPage/WorklistPage"));
const CytologyWorklistPage = lazy(() => import("./pages/CytologyWorklistPage/CytologyWorklistPage"));
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
const PendingBatchQueuePage = lazy(() => import("./pages/BatchManagement/PendingBatchQueuePage"));
const EngraverMonitorPage = lazy(() => import("./pages/BatchManagement/EngraverMonitorPage"));
const IntraopQueuePage = lazy(() => import("./pages/IntraopQueuePage"));
const OrSuiteDashboardPage = lazy(() => import("./pages/OrSuiteDashboardPage"));
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
const MolecularOrderQueuePage = lazy(() =>
  import("./pages/MolecularOrderQueuePage/MolecularOrderQueuePage")
);
const CytologyQcQueuePage = lazy(() => import("./pages/CytologyQcQueuePage"));
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
const PageLoader: React.FC = () => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "#0b1120",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10000,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        border: "3px solid rgba(8,145,178,0.15)",
        borderTop: "3px solid #0891B2",
        borderRadius: "50%",
        animation: "ps-spin 0.7s linear infinite",
      }}
    />
    <style>{`@keyframes ps-spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ── App ───────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ToastContainer />
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

                      {/* Protected Routes — ScannerProvider only active when authenticated */}
                      <Route element={<ProtectedRoute />}>
                        <Route element={<MobileRestrictedRoute />}>
                        <Route element={<ScannerProvider><MaterialScanTrackingBridge /><AppShell /></ScannerProvider>}>
                          <Route path="/" element={<Home />} />
                          <Route path="/accession" element={<AccessionPage />} />
                          <Route path="/worklist" element={<WorklistPage />} />
                          <Route path="/cytology-worklist" element={<CytologyWorklistPage />} />
                          <Route path="/cytology-worklist/:caseId" element={<CytologyScreeningPage />} />
                          <Route path="/molecular" element={<MolecularWorkcenterPage />} />
                          <Route path="/molecular-batch/:batchId" element={<MolecularPlateBuilderPage />} />
                          <Route path="/molecular-rack" element={<MolecularRackWorklistPage />} />
                          <Route path="/molecular-rack/:rackId" element={<MolecularRackLoadingPage />} />
                          <Route path="/molecular-control-rules" element={<MolecularControlRulesPage />} />
                          <Route path="/dev/mock-interface-engine" element={<MockInterfaceEnginePage />} />
                          <Route path="/quality-assurance" element={<QualityAssurancePage />} />
                          <Route path="/batch-management" element={<BatchManagementPage />} />
                          <Route path="/batch-management/disposal" element={<DisposalQueuePage />} />
                          <Route path="/batch-management/pending-load" element={<PendingBatchQueuePage />} />
                          <Route path="/batch-management/engraver-monitor" element={<EngraverMonitorPage />} />
                          <Route path="/intraop-queue" element={<IntraopQueuePage />} />
                          <Route path="/molecular-order-queue" element={<MolecularOrderQueuePage />} />
                          <Route path="/cytology-qc-queue" element={<CytologyQcQueuePage />} />
                          <Route path="/migration-jobs" element={<MigrationJobsPage />} />
                          <Route path="/search" element={<SearchPage />} />
                          <Route path="/audit" element={<AuditLogPage />} />
                          <Route
                            path="/configuration"
                            element={<ConfigurationPage />}
                          />
                          <Route
                            path="/contribution"
                            element={<ContributionDashboardPage />}
                          />
                        </Route>

                        {/* Clinical Routes — full-screen, AppShell mounted for drawer/messaging but NavBar hidden */}
                        <Route element={<ScannerProvider><MaterialScanTrackingBridge /><AppShell hideNav /></ScannerProvider>}>
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
