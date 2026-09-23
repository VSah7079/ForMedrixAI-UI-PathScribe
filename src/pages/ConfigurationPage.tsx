/**
 * ConfigurationPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Top-level configuration page, accessible from the Home screen nav tile.
 * Voice context: CONFIGURATION — tab navigation commands active while here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../components/Audit/useAuditLog';
import { useIsAdmin, useIsSuperAdmin } from '../contexts/AuthContext';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '../constants/systemActions';
import AITab         from '../components/Config/AI/index';
import ModelsTab     from '../components/Config/Models/index';
import ProtocolsTab  from '../components/Config/Protocols/index';
import StaffTab      from '../components/Config/Staff/StaffTab';
import SystemTab     from '../components/Config/System/index';
import CytologyTab   from '../components/Config/Cytology/index';
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
// Validation Studies tab is only visible to admin-tier roles. useIsAdmin/
// useIsSuperAdmin now come from AuthContext.tsx — file-by-file cleanup
// sweep: this page used to carry its own local copy of both (already fixed,
// per its own prior history, to read useAuth() rather than an independent
// localStorage.getItem('pathscribe-user') + JSON.parse); Config/AI/index.tsx
// carried a second, real-bug-prone copy of the same check. Both now share
// one implementation.
const VALID_TABS = ['ai', 'protocols', 'staff', 'voice', 'system', 'cytology', 'tat', 'actions', 'macros', 'templates', 'validation', 'demo'] as const;
type TabId = typeof VALID_TABS[number];

const TAB_LABEL_KEYS: Record<TabId, string> = {
  actions:    'configuration.tabs.actions',
  ai:         'configuration.tabs.ai',
  macros:     'configuration.tabs.macros',
  templates:  'configuration.tabs.templates',
  staff:      'configuration.tabs.staff',
  protocols:  'configuration.tabs.protocols',
  system:     'configuration.tabs.system',
  cytology:   'configuration.tabs.cytology',
  tat:        'configuration.tabs.tat',
  validation: 'configuration.tabs.validation',
  voice:      'configuration.tabs.voice',
  // Pinned last deliberately, not alphabetized — a reset/destructive
  // action, same convention as keeping "Delete Account" separate from
  // an alphabetized settings list rather than letting it land wherever
  // "D" happens to sort.
  demo:       'configuration.tabs.demo',
};
const TAB_ORDER: TabId[] = ['actions', 'ai', 'macros', 'templates', 'staff', 'protocols', 'system', 'cytology', 'tat', 'validation', 'voice', 'demo'];

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
  const { t }      = useTranslation();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { log }    = useAuditLog();

  const [activeTab,   setActiveTab]   = useState<TabId>(() => getTabFromSearch(location.search));
  const [isLoaded,    setIsLoaded]    = useState(false);
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
      case 'cytology':  return <CytologyTab />;
      case 'tat':       return <TATConfigSection />;
      case 'actions':   return <ActionsTab />;
      case 'macros':    return <MacrosTab />;
      case 'voice':     return <VoiceSettings />;
      case 'templates':  return <ReportTemplatesSection />;
      case 'validation': return isAdmin
        ? <ValidationStudiesSection isSuperAdmin={isSuperAdmin} />
        : <div className="ps-cfgpage-locked">
            <div className="ps-cfgpage-locked-icon">🔒</div>
            <div className="ps-cfgpage-locked-title">{t('configuration.adminRequiredTitle')}</div>
            <div className="ps-cfgpage-locked-sub">{t('configuration.adminRequiredSub')}</div>
          </div>;
      case 'demo':      return <DemoResetTab />;
      default:          return null;
    }
  };

  if (!isLoaded) return <div className="ps-cfgpage-loading">{t('configuration.loading')}</div>;

  return (
    <div className="ps-cfgpage-shell">

      {/* ── Header + Tab bar — full width, never scrolls ── */}
      <div className="ps-cfgpage-header">
        <div className="ps-cfgpage-title-block">
          <h1 className="ps-cfgpage-title">{t('configuration.title')}</h1>
          <p className="ps-cfgpage-subtitle">{t('configuration.subtitle')}</p>
          <ConfigSearchBar onNavigate={(tabId, section) => {
            handleTabChange(tabId);
            // Real, per direct report ("the top level search in config
            // found the entry, but when clicked on, it did not go to
            // the setting"): same real PATHSCRIBE_SYSTEM_NAVIGATE event
            // AppShell.tsx's own config-link chat messages already
            // dispatch, same setTimeout delay reasoning — the System
            // tab's own component needs to actually mount (and its
            // event listener attach) after handleTabChange's state
            // update, before this event can be caught.
            if (section) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('PATHSCRIBE_SYSTEM_NAVIGATE', { detail: { section } }));
              }, 150);
            }
          }} />
        </div>

        <div className="ps-cfgpage-tabbar">
          {TAB_ORDER.filter(tabId => {
            if (tabId === 'validation') return isAdmin; // admin, pathologist-admin, superadmin
            return true;
          }).map(tabId => (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={`ps-cfgpage-tab-btn${activeTab === tabId ? ' ps-cfgpage-tab-btn--active' : ''}`}
            >
              {t(TAB_LABEL_KEYS[tabId])}
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
    </div>
  );
};

export default ConfigurationPage;
