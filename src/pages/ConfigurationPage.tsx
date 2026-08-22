/**
 * ConfigurationPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Top-level configuration page, accessible from the Home screen nav tile.
 * Voice context: CONFIGURATION — tab navigation commands active while here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuditLog } from '../components/Audit/useAuditLog';
import { useAuth } from '../contexts/AuthContext';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '../constants/systemActions';
import AITab         from '../components/Config/AI/index';
import ModelsTab     from '../components/Config/Models/index';
import ProtocolsTab  from '../components/Config/Protocols/index';
import StaffTab      from '../components/Config/Staff/StaffTab';
import SystemTab     from '../components/Config/System/index';
import IntegrationsTab from '../components/Config/Integrations/index';
import TATConfigSection from '../components/Config/System/TATConfigSection';
import MacrosTab     from '../components/Config/Macros/index';
import VoiceSettings from '../components/Voice/VoiceSettings';
import { ActionsTab }  from '../components/Config/Actions/ActionsTab';
import DemoResetTab    from '../components/Config/System/DemoResetTab';
import ReportTemplatesSection    from '../components/TemplateBuilder/ReportTemplatesSection';
import ValidationStudiesSection from '../components/ValidationStudies/ValidationStudiesSection';
import ConfigSearchBar from '../components/Config/Search/ConfigSearchBar';
import { resetConfigScroll } from '../utils/resetConfigScroll';
import '../pathscribe.css';

// ── Admin permission check ────────────────────────────────────────────────────
// Validation Studies tab is only visible to admin-tier roles (admin,
// pathologist-admin, or superadmin) — a broader check than AuthContext's
// own roleHas() helper, which deliberately doesn't fold superadmin into
// its "admin" check (see roleHas's own doc comment). Was previously its
// own independent localStorage.getItem('pathscribe-user') + JSON.parse,
// duplicating exactly what AuthContext already does under the same
// storage key — now reads useAuth()'s already-parsed user.role instead,
// so there's one source of truth for the stored shape rather than two
// that could drift out of sync.
function useIsAdmin(): boolean {
  const { user } = useAuth();
  return !!user && ['admin', 'pathologist-admin', 'superadmin'].includes(user.role);
}

function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 'superadmin';
}

const VALID_TABS = ['ai', 'protocols', 'staff', 'voice', 'system', 'integrations', 'tat', 'actions', 'macros', 'templates', 'validation', 'demo'] as const;
type TabId = typeof VALID_TABS[number];

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'actions',    label: 'Action Registry'    },
  { id: 'ai',         label: 'AI Behavior'        },
  { id: 'macros',     label: 'Macros'             },
  { id: 'templates',  label: 'Report Templates'   },
  { id: 'staff',      label: 'Staff'              },
  { id: 'protocols',  label: 'Synoptic Library'   },
  { id: 'system',     label: 'System'             },
  { id: 'integrations', label: 'Integrations'     },
  { id: 'tat',        label: 'TAT Configuration'   },
  { id: 'validation', label: 'Validation Studies' },
  { id: 'voice',      label: 'Voice'              },
  // Pinned last deliberately, not alphabetized — a reset/destructive
  // action, same convention as keeping "Delete Account" separate from
  // an alphabetized settings list rather than letting it land wherever
  // "D" happens to sort.
  { id: 'demo',       label: '⟳ Demo Reset'       },
];

function getTabFromSearch(search: string): TabId {
  const t = new URLSearchParams(search).get('tab') as TabId | null;
  // Real fix, per direct report: "The Config page opens up on the 2nd
  // tab. I would say it should either open on the first tab or the
  // System Tab." Defaulted to 'ai' (Config's own 2nd tab) purely
  // because it happened to be first in VALID_TABS after Action
  // Registry — never a deliberate landing-page choice. 'system' now,
  // since that's genuinely where most real, active admin work in this
  // app lives (Scan Stations, Cassette Routing Rules, Cassette
  // Colors, Protocols, and everything else built under it this
  // session) — a plain /configuration visit should land where an
  // admin actually needs to be most often, not wherever the tab list
  // happened to order things.
  return t && (VALID_TABS as readonly string[]).includes(t) ? t : 'system';
}

const ConfigurationPage: React.FC = () => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { log }    = useAuditLog();

  const [activeTab,   setActiveTab]   = useState<TabId>(() => getTabFromSearch(location.search));
  const [isLoaded,    setIsLoaded]    = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const isAdmin      = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();

  useEffect(() => { setActiveTab(getTabFromSearch(location.search)); }, [location.search]);
  useEffect(() => { const t = setTimeout(() => setIsLoaded(true), 100); return () => clearTimeout(t); }, []);

  // ── Voice: set context on mount ─────────────────────────────────────────────
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.CONFIGURATION);
    return () => mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
  }, []);

  // ── Voice: tab navigation listeners ────────────────────────────────────────
  useEffect(() => {
    const tabIds = VALID_TABS as readonly TabId[];

    const nextTab = () => {
      setActiveTab(current => {
        const idx = tabIds.indexOf(current);
        const next = tabIds[Math.min(idx + 1, tabIds.length - 1)];
        navigate(`/configuration?tab=${next}`);
        log('navigate_tab', { tabId: next });
        return next;
      });
    };

    const prevTab = () => {
      setActiveTab(current => {
        const idx = tabIds.indexOf(current);
        const prev = tabIds[Math.max(idx - 1, 0)];
        navigate(`/configuration?tab=${prev}`);
        log('navigate_tab', { tabId: prev });
        return prev;
      });
    };

    window.addEventListener('PATHSCRIBE_NEXT_TAB',     nextTab);
    window.addEventListener('PATHSCRIBE_PREVIOUS_TAB', prevTab);
    return () => {
      window.removeEventListener('PATHSCRIBE_NEXT_TAB',     nextTab);
      window.removeEventListener('PATHSCRIBE_PREVIOUS_TAB', prevTab);
    };
  }, [navigate, log]);

  const handleTabChange = (tabId: TabId) => {
    navigate(`/configuration?tab=${tabId}`);
    log('navigate_tab', { tabId });
    // Real fix, per direct report: switching tabs used to leave
    // scroll position wherever it was on the previous tab, hiding
    // the new tab's own add button and column headers until manually
    // scrolled up. See utils/resetConfigScroll.ts's own header for
    // why this needs a direct container lookup rather than a prop.
    resetConfigScroll();
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'ai':        return <AITab ModelsPanel={ModelsTab} />;
      case 'protocols': return <ProtocolsTab />;
      case 'staff':     return <StaffTab />;
      case 'system':    return <SystemTab />;
      case 'integrations': return <IntegrationsTab />;
      case 'tat':       return <TATConfigSection />;
      case 'actions':   return <ActionsTab />;
      case 'macros':    return <MacrosTab />;
      case 'voice':     return <VoiceSettings />;
      case 'templates':  return <ReportTemplatesSection />;
      case 'validation': return isAdmin
        ? <ValidationStudiesSection isSuperAdmin={isSuperAdmin} />
        : <div className="ps-cfgpage-locked">
            <div className="ps-cfgpage-locked-icon">🔒</div>
            <div className="ps-cfgpage-locked-title">Admin access required</div>
            <div className="ps-cfgpage-locked-sub">Validation Studies is available to administrators only.</div>
          </div>;
      case 'demo':      return <DemoResetTab />;
      default:          return null;
    }
  };

  if (!isLoaded) return <div className="ps-cfgpage-loading">Loading configuration…</div>;

  return (
    <div className="ps-cfgpage-shell">

      {/* ── Header + Tab bar — full width, never scrolls ── */}
      <div className="ps-cfgpage-header">
        <div className="ps-cfgpage-title-block">
          <h1 className="ps-cfgpage-title">Configuration</h1>
          <p className="ps-cfgpage-subtitle">Control AI behavior, templates, users, and system settings</p>
          <ConfigSearchBar onNavigate={tabId => handleTabChange(tabId)} />
        </div>

        <div className="ps-cfgpage-tabbar">
          {TAB_LABELS.filter(tab => {
            if (tab.id === 'validation') return isAdmin; // admin, pathologist-admin, superadmin
            return true;
          }).map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`ps-cfgpage-tab-btn${activeTab === tab.id ? ' ps-cfgpage-tab-btn--active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content — FULL WIDTH so scrollbar lands at viewport edge ── */}
      <div className="ps-cfgpage-scroll">
        {/* Inner content: full width, padding on sides */}
        <div className="ps-cfgpage-inner">
          {renderActiveTab()}
        </div>
      </div>

      {/* Unsaved Changes Modal */}
      {showWarning && (
        <div className="ps-overlay" onClick={() => setShowWarning(false)}>
          <div className="ps-modal-dark ps-cfgpage-modal--w420" onClick={e => e.stopPropagation()}>
            <span className="ps-modal-dark-title">Unsaved Changes</span>
            <p className="ps-modal-dark-body">You have unsaved changes. Are you sure you want to leave?</p>
            <div className="ps-modal-dark-footer">
              <button className="ps-btn-ghost-dark" onClick={() => setShowWarning(false)}>Stay</button>
              <button className="ps-btn-red" onClick={() => navigate('/')}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationPage;
