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

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const Home = lazy(() => import("./pages/Home"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AccessionPage = lazy(() => import("./pages/AccessionPage/AccessionPage"));

const WorklistPage = lazy(() => import("./pages/WorklistPage/WorklistPage"));
const QualityAssurancePage = lazy(() => import("./pages/QualityAssurancePage"));
const BatchManagementPage = lazy(() => import("./pages/BatchManagement/BatchManagementPage"));
const DisposalQueuePage = lazy(() => import("./pages/BatchManagement/DisposalQueuePage"));
const PendingBatchQueuePage = lazy(() => import("./pages/BatchManagement/PendingBatchQueuePage"));
const IntraopQueuePage = lazy(() => import("./pages/IntraopQueuePage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const ConfigurationPage = lazy(() => import("./pages/ConfigurationPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ContributionDashboardPage = lazy(() =>
  import("./pages/ContributionDashboardPage")
);

const SynopticReportPage = lazy(() =>
  import("./pages/SynopticReportPage/SynopticReportPage")
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

                      {/* Protected Routes — ScannerProvider only active when authenticated */}
                      <Route element={<ProtectedRoute />}>
                        <Route element={<MobileRestrictedRoute />}>
                        <Route element={<ScannerProvider><MaterialScanTrackingBridge /><AppShell /></ScannerProvider>}>
                          <Route path="/" element={<Home />} />
                          <Route path="/accession" element={<AccessionPage />} />
                          <Route path="/worklist" element={<WorklistPage />} />
                          <Route path="/quality-assurance" element={<QualityAssurancePage />} />
                          <Route path="/batch-management" element={<BatchManagementPage />} />
                          <Route path="/batch-management/disposal" element={<DisposalQueuePage />} />
                          <Route path="/batch-management/pending-load" element={<PendingBatchQueuePage />} />
                          <Route path="/intraop-queue" element={<IntraopQueuePage />} />
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
