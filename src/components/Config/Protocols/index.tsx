/**
 * Protocols/index.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrator for the Synoptic Library tab in ConfigurationPage.
 *
 * Renders a sidebar nav + one of three section components.
 * Reads ?section= from the URL on mount so that navigating back from
 * TemplateRenderer / SynopticEditor lands on the correct section rather
 * than always defaulting to Active Protocols.
 *
 * Sections:
 *   active  → ActiveProtocolsSection   (published templates in use)
 *   review  → ReviewQueueSection       (in_review | needs_changes | approved)
 *   all     → AllProtocolsSection      (full library, filterable)
 *
 * Consumed by:
 *   ConfigurationPage.tsx  when tab === 'protocols'
 * ─────────────────────────────────────────────────────────────────────────────
 */

//
// i18n note: `NAV_ITEMS` is module-level (outside the component, so it
// can't call `useTranslation()`), so each entry carries a `labelKey`/
// `subKey` pair resolved with `t()` at each render site instead of a
// literal `label`/`sub`. "Active Protocols"/"All Protocols" reuse
// ActiveProtocolsSection.tsx's/AllProtocolsSection.tsx's own exact-text
// section titles; "Review Queue" reuses TemplateRenderer's breadcrumb
// label for the same concept. Inline styles replaced with new,
// file-specific `.ps-protocols-tab-*` classes in pathscribe.css — this
// shell's own teal/cyan accent color and per-item subtitle line are
// distinct from the blue `.ps-confsys-*` shell other Config tabs share,
// so it gets its own small class family rather than a forced reuse.

import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useSearchParams } from 'react-router';
import ActiveProtocolsSection from './ActiveProtocolsSection';
import ReviewQueueSection     from './ReviewQueueSection';
import AllProtocolsSection    from './AllProtocolsSection';

type Section = 'active' | 'review' | 'all';

const NAV_ITEMS: { id: Section; icon: string; labelKey: string; subKey: string }[] = [
  { id: 'active', icon: '✅', labelKey: 'activeProtocolsSection.title', subKey: 'protocolsTab.nav.activeSub' },
  { id: 'review', icon: '📋', labelKey: 'templateRenderer.nav.breadcrumbReviewQueue', subKey: 'protocolsTab.nav.reviewSub' },
  { id: 'all',    icon: '🗂',  labelKey: 'allProtocolsSection.title', subKey: 'protocolsTab.nav.allSub' },
];

const ProtocolsTab: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Honour ?section= so back-navigation from editor/reviewer lands correctly.
  // Falls back to 'active' if the param is absent or unrecognised.
  const rawSection = searchParams.get('section') as Section | null;
  const activeSection: Section = ['active', 'review', 'all'].includes(rawSection ?? '')
    ? (rawSection as Section)
    : 'active';

  const setSection = (s: Section) => {
    setSearchParams(prev => {
      prev.set('section', s);
      return prev;
    }, { replace: true });
  };

  return (
    <div className="ps-protocols-tab-shell">

      {/* ── Sidebar ── */}
      <div className="ps-protocols-tab-sidebar">
        {NAV_ITEMS.map(item => {
          const isActive = activeSection === item.id;
          return (
            <div
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`ps-protocols-tab-nav-item${isActive ? ' ps-protocols-tab-nav-item--active' : ''}`}
            >
              <div className={`ps-protocols-tab-nav-item-label${isActive ? ' ps-protocols-tab-nav-item-label--active' : ''}`}>
                <span>{item.icon}</span>
                {t(item.labelKey)}
              </div>
              <div className={`ps-protocols-tab-nav-item-sub${isActive ? ' ps-protocols-tab-nav-item-sub--active' : ''}`}>
                {t(item.subKey)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section content ── */}
      <div className="ps-protocols-tab-content">
        {activeSection === 'active' && <ActiveProtocolsSection />}
        {activeSection === 'review' && <ReviewQueueSection />}
        {activeSection === 'all'    && <AllProtocolsSection />}
      </div>

    </div>
  );
};

export default ProtocolsTab;
