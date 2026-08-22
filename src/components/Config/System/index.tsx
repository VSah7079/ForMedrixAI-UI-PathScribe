import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../../pathscribe.css';
import FlagConfigPage            from './FlagConfigPage';
import SpecimenDictionarySection from './SpecimenDictionarySection';
import StainDictionarySection from './StainDictionarySection';
import ProtocolDictionarySection from './ProtocolDictionarySection';
import PrinterProfilesSection from './PrinterProfilesSection';
import GrossingRouteOverridesSection from './GrossingRouteOverridesSection';
import SpecimenCategoriesSection from './SpecimenCategoriesSection';
import ContainerTypesSection from './ContainerTypesSection';
import ScanStationsSection from './ScanStationsSection';
import CassetteRoutingRulesSection from './CassetteRoutingRulesSection';
import CassetteColorsSection from './CassetteColorsSection';
import PrintSettingsSection from './PrintSettingsSection';
import SubspecialtiesSection     from './SubspecialtiesSection';
import FontsSection              from './FontsSection';
import DocumentStyleSection      from './DocumentStyleSection';
import RetentionSection          from './RetentionSection';
import GoverningBodiesSection    from './GoverningBodiesSection';
import DelegationTypeSection     from './DelegationTypeSection';
import RvuCodeMapSection         from './RvuCodeMapSection';
import BillingDictionarySection  from './BillingDictionarySection';
import ParticipationTypesSection from './ParticipationTypesSection';
import SessionSecuritySection    from './SessionSecuritySection';
import ContributionSettingsSection from './ContributionSettingsSection';
import ExternalResourcesSection  from './ExternalResourcesSection';
import ResearchFeedSection      from './ResearchFeedSection';
import { resetConfigScroll } from '../../../utils/resetConfigScroll';

// ── Section registry ──────────────────────────────────────────────────────────

type SystemSection =
  | 'flags'
  | 'subspecialties'
  | 'specimens'
  | 'stains'
  | 'specimen_categories'
  | 'container_types'
  | 'scan_stations'
  | 'cassette_routing_rules'
  | 'cassette_colors'
  | 'fonts'
  | 'document_style'
  | 'retention'
  | 'session_security'
  | 'contribution_settings'
  | 'external_resources'
  | 'research_feed'
  | 'protocols'
  | 'grossing_route_overrides'
  | 'governing_bodies'
  | 'delegation_types'
  | 'rvu_code_map'
  | 'billing_dictionary'
  | 'participation_types'
  | 'print_settings'
  | 'printer_profiles';

// Real, per PS-85 (Jira), superseding this file's own earlier partial
// reorg (Independent/Reference-Data/Depends-on-reference-data) with a
// real, complete, confirmed mapping — every item in this file now
// belongs to exactly one of five real, named groups. clients,
// physicians, case_routing, routing_rules, deficiencies,
// case_mask_config, and facility_setup all moved OUT of System
// entirely (now in Integrations, per that same confirmed mapping) —
// System now holds only Lab Operations & Hardware and Reference Data
// & Master Dictionaries and Platform & Security, matching the real,
// confirmed top-level split (item 1 of that mapping is the
// Integrations tab in full; items 2-4 are all System, split into
// these five named sub-groups).
const SECTIONS: { id: SystemSection; emoji: string; label: string; group: string }[] = [
  // ── Workstation & Hardware ──
  { id: 'scan_stations',       emoji: '📍', label: 'Scan Stations'         , group: 'Workstation & Hardware' },
  { id: 'print_settings',      emoji: '🖨️', label: 'Print Settings'        , group: 'Workstation & Hardware' },
  { id: 'printer_profiles',    emoji: '🖨️', label: 'Printer Profiles'      , group: 'Workstation & Hardware' },

  // ── Lab Materials & Workflows ──
  { id: 'container_types',     emoji: '🧪', label: 'Container Types'       , group: 'Lab Materials & Workflows' },
  { id: 'stains',              emoji: '🧪', label: 'Stain Dictionary'      , group: 'Lab Materials & Workflows' },
  { id: 'specimens',           emoji: '🔬', label: 'Specimen Dictionary'   , group: 'Lab Materials & Workflows' },
  { id: 'cassette_colors',     emoji: '🎨', label: 'Cassette Colors'       , group: 'Lab Materials & Workflows' },
  { id: 'cassette_routing_rules', emoji: '🧊', label: 'Cassette Routing Rules', group: 'Lab Materials & Workflows' },
  { id: 'grossing_route_overrides', emoji: '🔀', label: 'Grossing Route Overrides', group: 'Lab Materials & Workflows' },

  // ── Clinical Lookups ──
  { id: 'specimen_categories', emoji: '🗂️', label: 'Specimen Categories'   , group: 'Clinical Lookups' },
  { id: 'subspecialties',      emoji: '🩺', label: 'Subspecialties'        , group: 'Clinical Lookups' },
  { id: 'protocols',           emoji: '🧬', label: 'Protocol Dictionary'   , group: 'Clinical Lookups' },
  { id: 'governing_bodies',    emoji: '📋', label: 'Governing Bodies'      , group: 'Clinical Lookups' },
  { id: 'participation_types', emoji: '👥', label: 'Participation Types'   , group: 'Clinical Lookups' },

  // ── Financial & Revenue Lookups ──
  { id: 'billing_dictionary',  emoji: '💲', label: 'Billing Dictionary (Charge Capture)', group: 'Financial & Revenue Lookups' },
  { id: 'rvu_code_map',        emoji: '📈', label: 'RVU Code Map (Productivity)', group: 'Financial & Revenue Lookups' },
  { id: 'flags',               emoji: '🚩', label: 'Flags'                 , group: 'Financial & Revenue Lookups' },

  // ── Administration & Compliance ──
  { id: 'fonts',               emoji: '🔤', label: 'Approved Fonts'        , group: 'Administration & Compliance' },
  { id: 'document_style',      emoji: '🖋', label: 'Document Style'        , group: 'Administration & Compliance' },
  { id: 'session_security',    emoji: '🔒', label: 'Session Security'      , group: 'Administration & Compliance' },
  { id: 'retention',           emoji: '🗄️', label: 'Data Retention'        , group: 'Administration & Compliance' },
  { id: 'delegation_types',    emoji: '🔀', label: 'Delegation Types'      , group: 'Administration & Compliance' },
  { id: 'contribution_settings', emoji: '📊', label: 'Contribution Dashboard' , group: 'Administration & Compliance' },
  { id: 'external_resources',  emoji: '🌐', label: 'External Resources'    , group: 'Administration & Compliance' },
  { id: 'research_feed',       emoji: '📰', label: 'Research Feed'         , group: 'Administration & Compliance' },
];

// ── Main component ────────────────────────────────────────────────────────────

// Real, per direct guidance and a real, confirmed reference screenshot
// (Configuration → Validation Studies' own real Studies/Dashboard/Reports
// row) — the real, generic ps-sub-tab-group/ps-sub-tab-btn pattern
// already proven there, reused here rather than a new one invented.
// Derived, not hand-maintained — GROUPS is every real, distinct group
// in SECTIONS, in the same order groups first appear there, so adding
// a new section to an existing group never needs a second, parallel
// edit here.
const GROUPS: string[] = Array.from(new Set(SECTIONS.map(s => s.group)));

const SystemTab: React.FC = () => {
  const location = useLocation();
  const [active, setActiveRaw] = useState<SystemSection>(() => {
    const section = new URLSearchParams(location.search).get('section') as SystemSection | null;
    return section && SECTIONS.some(s => s.id === section) ? section : SECTIONS[0].id;
  });
  // Real, per the group-tab redesign — the sidebar now shows only the
  // active group's own items, so a real, single source of truth for
  // "which section is selected" must always keep this in sync,
  // regardless of which of the four real entry points changed it
  // (deep-link, voice nav, a sidebar click, or a group-tab click) —
  // selectSection below is the one real place that ever happens, so
  // none of those four paths can drift out of sync with each other.
  const [activeGroup, setActiveGroup] = useState<string>(() => SECTIONS.find(s => s.id === active)?.group ?? GROUPS[0]);

  const selectSection = (id: SystemSection) => {
    setActiveRaw(id);
    const g = SECTIONS.find(s => s.id === id)?.group;
    if (g) setActiveGroup(g);
  };

  // Re-activate if URL changes (e.g. deep-link navigation)
  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section') as SystemSection | null;
    if (section && SECTIONS.some(s => s.id === section)) { selectSection(section); resetConfigScroll(); }
  }, [location.search]);

  const renderSection = () => {
    switch (active) {
      case 'flags':               return <FlagConfigPage />;
      case 'subspecialties':      return <SubspecialtiesSection />;
      case 'specimens':           return <SpecimenDictionarySection />;
      case 'stains':              return <StainDictionarySection />;
      case 'protocols':           return <ProtocolDictionarySection />;
      case 'printer_profiles':    return <PrinterProfilesSection />;
      case 'grossing_route_overrides': return <GrossingRouteOverridesSection />;
      case 'specimen_categories': return <SpecimenCategoriesSection />;
      case 'container_types': return <ContainerTypesSection />;
      case 'scan_stations': return <ScanStationsSection />;
      case 'cassette_routing_rules': return <CassetteRoutingRulesSection />;
      case 'cassette_colors': return <CassetteColorsSection />;
      case 'print_settings': return <PrintSettingsSection />;
      case 'fonts':               return <FontsSection />;
      case 'document_style':      return <DocumentStyleSection />;
      case 'retention':           return <RetentionSection />;
      case 'governing_bodies':    return <GoverningBodiesSection isSuperAdmin={true} />;
      case 'delegation_types':    return <DelegationTypeSection />;
      case 'billing_dictionary':  return <BillingDictionarySection />;
      case 'rvu_code_map':        return <RvuCodeMapSection />;
      case 'participation_types': return <ParticipationTypesSection />;
      case 'session_security':    return <SessionSecuritySection />;
      case 'contribution_settings': return <ContributionSettingsSection />;
      case 'external_resources':  return <ExternalResourcesSection />;
      case 'research_feed':       return <ResearchFeedSection />;
      default:                    return null;
    }
  };

  // ── Voice sub-navigation ───────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      const section = e.detail?.section as SystemSection;
      if (section) { selectSection(section); resetConfigScroll(); }
    };
    window.addEventListener('PATHSCRIBE_SYSTEM_NAVIGATE', handler as EventListener);
    return () => window.removeEventListener('PATHSCRIBE_SYSTEM_NAVIGATE', handler as EventListener);
  }, []);

  return (
    <div>
      {/* ── Real, per the confirmed group-tab redesign — one tab per real
          group, selecting a tab jumps the sidebar+content to that
          group's own first real section. ── */}
      <div className="ps-sub-tab-group">
        {GROUPS.map(g => (
          <button
            key={g}
            onClick={() => {
              setActiveGroup(g);
              const first = SECTIONS.find(s => s.group === g);
              if (first) setActiveRaw(first.id);
              resetConfigScroll();
            }}
            className={`ps-sub-tab-btn${activeGroup === g ? ' active' : ''}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="ps-confsys-shell">

        {/* ── Sidebar nav — real, per the confirmed redesign: only the
            active group's own items, no more group-header dividers,
            since only one group is ever visible at a time now. ── */}
        <div className="ps-confsys-sidebar">
          {SECTIONS.filter(s => s.group === activeGroup).map(s => (
            <button
              key={s.id}
              onClick={() => { selectSection(s.id); resetConfigScroll(); }}
              className={`ps-confsys-nav-btn${active === s.id ? ' ps-confsys-nav-btn--active' : ''}`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* ── Section content ── */}
        <div className="ps-confsys-content">
          {renderSection()}
        </div>

      </div>
    </div>
  );
};

export default SystemTab;
