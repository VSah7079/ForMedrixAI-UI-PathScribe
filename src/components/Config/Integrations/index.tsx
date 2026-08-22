// src/components/Config/Integrations/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// New top-level config tab, per direct request: consolidates the real
// interoperability-related sections that were scattered in
// System/index.tsx's flat "Independent" group (LIS Integration,
// Identifier Formats, Terminology Services) into their own major
// configuration tab, alongside the new HL7 Crosswalk admin UI.
//
// Real, per PS-85 (Jira) — real, complete, confirmed reorg: this tab
// now holds every real inbound-message-parsing, external-site-mapping,
// and client-entity-definition screen — moved here from System's own
// flat list. Facility Configuration (ClientDictionaryPage), Facility
// Setup, Case Mask Configuration, Case Routing (CasePoolAssignmentSection),
// Routing Rules, Physicians, and Specimen Deficiencies all real,
// shipped screens, no new feature work. A flat list here (no group
// headers), matching how this was confirmed — only Order Types &
// Inbound Rules (CrosswalkSection) is called out as its own distinct
// item, since it's the one genuinely new addition (the real Map & Link
// banner built directly into it).
//
// Real, deliberate exclusion: no "HL7/FHIR Segment Mapping" item —
// confirmed no real, dedicated screen exists anywhere yet (PS-81 built
// the resolution engine, not an admin UI for it) — omitted from the
// real, confirmed mapping this reorg is built from, not an oversight.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../../pathscribe.css';
import LISSection from './LISSection';
import IdentifierFormatsSection from './IdentifierFormatsSection';
import TerminologyServicesSection from '../Terminology/TerminologyServicesSection';
import CrosswalkSection from './CrosswalkSection';
import RoutingRulesSection from '../System/RoutingRulesSection';
import DeficienciesSection from '../System/DeficienciesSection';
import FacilitySetupSection from '../System/FacilitySetupSection';
import CaseMaskConfigSection from '../System/CaseMaskConfigSection';
import { ClientDictionaryPage } from '../../../pages/system/ClientDictionaryPage';
import PhysiciansSection from '../System/PhysiciansSection';
import CasePoolAssignmentSection from '../System/CasePoolAssignmentSection';
import { resetConfigScroll } from '../../../utils/resetConfigScroll';

type IntegrationsSection =
  | 'lis'
  | 'identifiers'
  | 'terminology'
  | 'crosswalk'
  | 'clients'
  | 'facility_setup'
  | 'case_mask_config'
  | 'case_routing'
  | 'routing_rules'
  | 'physicians'
  | 'deficiencies';

const SECTIONS: { id: IntegrationsSection; emoji: string; label: string }[] = [
  { id: 'lis',              emoji: '🔗', label: 'LIS Integration' },
  { id: 'identifiers',      emoji: '🔍', label: 'Identifier Formats' },
  { id: 'terminology',      emoji: '🔌', label: 'Terminology Services' },
  { id: 'clients',          emoji: '🏥', label: 'Facility Configuration' },
  { id: 'facility_setup',   emoji: '🏢', label: 'Facility Setup' },
  { id: 'crosswalk',        emoji: '🧩', label: 'Order Types & Inbound Rules' },
  { id: 'case_mask_config', emoji: '🔢', label: 'Case Mask Configuration' },
  { id: 'case_routing',     emoji: '🔀', label: 'Case Routing' },
  { id: 'routing_rules',    emoji: '📋', label: 'Routing Rules' },
  { id: 'physicians',       emoji: '🩻', label: 'Physicians' },
  { id: 'deficiencies',     emoji: '⚠️', label: 'Specimen Deficiencies' },
];

const IntegrationsTab: React.FC = () => {
  const location = useLocation();
  const [active, setActive] = useState<IntegrationsSection>(() => {
    const section = new URLSearchParams(location.search).get('section') as IntegrationsSection | null;
    return section && SECTIONS.some(s => s.id === section) ? section : SECTIONS[0].id;
  });

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section') as IntegrationsSection | null;
    if (section && SECTIONS.some(s => s.id === section)) { setActive(section); resetConfigScroll(); }
  }, [location.search]);

  const renderSection = () => {
    switch (active) {
      case 'lis':              return <LISSection />;
      case 'identifiers':      return <IdentifierFormatsSection />;
      case 'terminology':      return <TerminologyServicesSection isSuperAdmin={true} />;
      case 'clients':          return <ClientDictionaryPage />;
      case 'facility_setup':   return <FacilitySetupSection />;
      case 'crosswalk':        return <CrosswalkSection />;
      case 'case_mask_config': return <CaseMaskConfigSection />;
      case 'case_routing':     return <CasePoolAssignmentSection />;
      case 'routing_rules':    return <RoutingRulesSection />;
      case 'physicians':       return <PhysiciansSection />;
      case 'deficiencies':     return <DeficienciesSection />;
      default:                 return null;
    }
  };

  return (
    <div className="ps-confsys-shell">
      <div className="ps-confsys-sidebar">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => { setActive(s.id); resetConfigScroll(); }}
            className={`ps-confsys-nav-btn${active === s.id ? ' ps-confsys-nav-btn--active' : ''}`}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>
      <div className="ps-confsys-content">
        {renderSection()}
      </div>
    </div>
  );
};

export default IntegrationsTab;
