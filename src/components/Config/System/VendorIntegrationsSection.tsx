// src/components/Config/System/VendorIntegrationsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Why not a main Vendor Integration and
// then have categories on the left." Confirmed directly: four
// separate, flat vendor dictionaries had accumulated as separate
// top-level Config nav entries (DP/AI, WSI Viewers, Image Management
// Systems, and this pass's new Gross/Macro Imaging & Telepathology)
// — genuinely one too many. Consolidated into one nav entry with its
// own internal category sub-nav, mirroring this exact same real,
// established shell/sidebar/content pattern this whole page's own
// outer level already uses (Config/System/index.tsx's own
// ps-confsys-shell/sidebar/nav-btn/content classes, reused directly
// here rather than inventing a second navigation pattern).
//
// Deliberately a thin wrapper — every category renders the exact
// same, already-built dictionary component (DpVendorDictionarySection,
// WsiViewerVendorDictionarySection, ImageManagementSystemVendorDictionarySection,
// GrossImagingVendorDictionarySection); none of those were rewritten
// for this consolidation, only re-homed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import DpVendorDictionarySection from './DpVendorDictionarySection';
import WsiViewerVendorDictionarySection from './WsiViewerVendorDictionarySection';
import ImageManagementSystemVendorDictionarySection from './ImageManagementSystemVendorDictionarySection';
import GrossImagingVendorDictionarySection from './GrossImagingVendorDictionarySection';

type VendorCategory = 'dp_ai' | 'wsi_viewers' | 'image_management' | 'gross_imaging';

const CATEGORY_IDS: { id: VendorCategory; emoji: string }[] = [
  { id: 'dp_ai',            emoji: '🔬' },
  { id: 'wsi_viewers',      emoji: '🖥️' },
  { id: 'image_management', emoji: '🗄️' },
  { id: 'gross_imaging',    emoji: '📷' },
];

const VendorIntegrationsSection: React.FC = () => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<VendorCategory>('dp_ai');

  const renderCategory = () => {
    switch (activeCategory) {
      case 'dp_ai':            return <DpVendorDictionarySection />;
      case 'wsi_viewers':      return <WsiViewerVendorDictionarySection />;
      case 'image_management': return <ImageManagementSystemVendorDictionarySection />;
      case 'gross_imaging':    return <GrossImagingVendorDictionarySection />;
    }
  };

  return (
    <div className="ps-confsys-shell">
      <div className="ps-confsys-sidebar">
        {CATEGORY_IDS.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`ps-confsys-nav-btn${activeCategory === c.id ? ' ps-confsys-nav-btn--active' : ''}`}
          >
            {c.emoji} {t(`vendorIntegrations.category.${c.id}`)}
          </button>
        ))}
      </div>
      <div className="ps-confsys-content">
        {renderCategory()}
      </div>
    </div>
  );
};

export default VendorIntegrationsSection;
