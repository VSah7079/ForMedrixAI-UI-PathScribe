// src/components/Config/Cytology/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "I want a new Configuration Subtab for
// Cytology." Consolidates every real Cytology admin screen — the
// three that already existed under System (Interpretation and
// Recommendations, QC Random Selection Rate, Cyto-Histologic
// Correlation) plus the six real, confirmed-missing cascade settings
// screens this same pass builds — into one, dedicated tab, rather
// than leaving Cytology config scattered across System's own,
// unrelated groups. Same real sidebar+content shell
// (Config/System/index.tsx's own `.ps-confsys-*` classes) for visual
// consistency, simplified to skip the group-tabs layer System uses —
// every section here already belongs to the same one real group.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../../pathscribe.css';
import { resetConfigScroll } from '../../../utils/resetConfigScroll';
import CytologyCategoriesSection from '../System/CytologyCategoriesSection';
import CytologyQcSettingsSection from '../System/CytologyQcSettingsSection';
import SnomedCervicalHistologySeverityMappingSection from '../System/SnomedCervicalHistologySeverityMappingSection';
import CytologyNomenclatureSettingsSection from './CytologyNomenclatureSettingsSection';
import CytologyRegistrySettingsSection from './CytologyRegistrySettingsSection';
import CytologyRoutingSettingsSection from './CytologyRoutingSettingsSection';
import CytologyScreeningStrategySection from './CytologyScreeningStrategySection';
import CytologyWorkloadCapSettingsSection from './CytologyWorkloadCapSettingsSection';
import CytologyInstrumentationSection from './CytologyInstrumentationSection';
import NonGynCytologyCategoriesSection from './NonGynCytologyCategoriesSection';

export type CytologyConfigSection =
  | 'cytology_categories' | 'cytology_qc_settings' | 'snomed_histology_severity_mapping'
  | 'cytology_nomenclature' | 'cytology_registry' | 'cytology_routing'
  | 'cytology_screening_strategy' | 'cytology_workload_cap' | 'cytology_instrumentation'
  | 'non_gyn_cytology_categories';

const SECTIONS: { id: CytologyConfigSection; emoji: string; label: string }[] = [
  { id: 'cytology_categories', emoji: '🧫', label: 'Interpretation and Recommendations' },
  { id: 'non_gyn_cytology_categories', emoji: '🧪', label: 'Non-GYN Classification (Milan/Paris)' },
  { id: 'cytology_nomenclature', emoji: '🌐', label: 'Nomenclature System' },
  { id: 'cytology_screening_strategy', emoji: '🔬', label: 'Screening Strategy' },
  { id: 'cytology_routing', emoji: '↪️', label: 'Non-GYN Routing' },
  { id: 'cytology_registry', emoji: '📋', label: 'Registry Reporting' },
  { id: 'cytology_qc_settings', emoji: '🎯', label: 'QC Random Selection Rate' },
  { id: 'cytology_workload_cap', emoji: '📊', label: 'Daily Workload Cap' },
  { id: 'cytology_instrumentation', emoji: '🖥️', label: 'Assisted Instrumentation' },
  { id: 'snomed_histology_severity_mapping', emoji: '🧬', label: 'Cyto-Histologic Correlation (SNOMED)' },
];

const CytologyTab: React.FC = () => {
  const location = useLocation();
  const [active, setActive] = useState<CytologyConfigSection>(() => {
    const section = new URLSearchParams(location.search).get('section') as CytologyConfigSection | null;
    return section && SECTIONS.some(s => s.id === section) ? section : SECTIONS[0].id;
  });

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section') as CytologyConfigSection | null;
    if (section && SECTIONS.some(s => s.id === section)) { setActive(section); resetConfigScroll(); }
  }, [location.search]);

  const renderSection = () => {
    switch (active) {
      case 'cytology_categories': return <CytologyCategoriesSection />;
      case 'non_gyn_cytology_categories': return <NonGynCytologyCategoriesSection />;
      case 'cytology_nomenclature': return <CytologyNomenclatureSettingsSection />;
      case 'cytology_screening_strategy': return <CytologyScreeningStrategySection />;
      case 'cytology_routing': return <CytologyRoutingSettingsSection />;
      case 'cytology_registry': return <CytologyRegistrySettingsSection />;
      case 'cytology_qc_settings': return <CytologyQcSettingsSection />;
      case 'cytology_workload_cap': return <CytologyWorkloadCapSettingsSection />;
      case 'cytology_instrumentation': return <CytologyInstrumentationSection />;
      case 'snomed_histology_severity_mapping': return <SnomedCervicalHistologySeverityMappingSection />;
      default: return null;
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

export default CytologyTab;
