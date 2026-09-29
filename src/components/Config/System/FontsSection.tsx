/**
 * FontsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the list of fonts approved for use in the PathScribeEditor toolbar.
 *
 * Architecture role:
 *   One of the focused section components in the System config tab.
 *   Reads and writes approvedFonts via SystemConfigContext so changes are
 *   immediately available to PathScribeEditor anywhere in the app.
 *
 * Behaviour:
 *   - AVAILABLE_FONTS defines the full pool of fonts that can be approved.
 *     Add new fonts to that list to make them available to admins.
 *   - Each font has a toggle. Enabled fonts appear in approvedFonts in
 *     SystemConfig and are shown in the editor toolbar font picker.
 *   - Disabled fonts are visible here but greyed out — easy to re-enable.
 *   - At least one font must remain enabled (toggle is blocked if it's the last).
 *   - Font names render in their own typeface so admins can see what they're
 *     approving at a glance.
 *
 * Consumed by:
 *   components/Config/System/index.tsx  (renders this as the 'fonts' section)
 *
 * Related files:
 *   types/systemConfig.ts            ← approvedFonts: string[] field
 *   contexts/SystemConfigContext.tsx ← useSystemConfig hook
 *   components/Editor/PathScribeEditor.tsx ← reads approvedFonts for toolbar
 *
 * Real fix (batch 37, i18n sweep): this file's own Toggle turned out NOT to
 * be the same pattern as VoiceSection.tsx's (batch 36) despite sharing the
 * same 40×22px track and #0891B2 on-color — that batch's README claim that
 * the two were "identical" was based on a shallow grep match and didn't
 * hold up once this file was actually read: this Toggle has a third,
 * distinct disabled/greyed state VoiceSection's doesn't, a different
 * thumb size (18px vs 14px), and a solid (not translucent) off-color. So
 * this batch gives it its own small `.config-toggle-btn*` class family
 * instead of reusing batch 36's `.config-toggle-track*` — see the CSS
 * comment there for the correction.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useSystemConfig } from '../../../contexts/SystemConfigContext';

// ─── Full available font pool ─────────────────────────────────────────────────
// These are the fonts admins can choose to approve or disable.
// Add new entries here to expand the pool — no other changes needed.
// `name`/`label` are real font-family values and display names (proper
// nouns — not translated); `category` stays an internal English grouping
// id used for filtering, with its display text resolved via
// CATEGORY_LABEL_KEY + t() at render time (same "data key stays English,
// display label is translated" pattern used for AIContributionTab.tsx's
// SUBSPECIALTY_LABELS in batch 34).

interface FontEntry {
  name: string;       // CSS font-family value
  label: string;      // display name (usually same as name)
  category: string;   // grouping label
}

const AVAILABLE_FONTS: FontEntry[] = [
  // Serif — traditional clinical/academic documents
  { name: 'Times New Roman', label: 'Times New Roman', category: 'Serif'      },
  { name: 'Georgia',         label: 'Georgia',         category: 'Serif'      },
  { name: 'Garamond',        label: 'Garamond',        category: 'Serif'      },
  { name: 'Palatino',        label: 'Palatino',        category: 'Serif'      },

  // Sans-serif — clean, modern reports
  { name: 'Arial',           label: 'Arial',           category: 'Sans-Serif' },
  { name: 'Helvetica',       label: 'Helvetica',       category: 'Sans-Serif' },
  { name: 'Calibri',         label: 'Calibri',         category: 'Sans-Serif' },
  { name: 'Verdana',         label: 'Verdana',         category: 'Sans-Serif' },
  { name: 'Trebuchet MS',    label: 'Trebuchet MS',    category: 'Sans-Serif' },
  { name: 'Tahoma',          label: 'Tahoma',          category: 'Sans-Serif' },
  { name: 'Roboto',          label: 'Roboto',          category: 'Sans-Serif' },

  // Monospace — codes, lab values, structured data
  { name: 'Courier New',     label: 'Courier New',     category: 'Monospace'  },
  { name: 'Consolas',        label: 'Consolas',        category: 'Monospace'  },
  { name: 'Lucida Console',  label: 'Lucida Console',  category: 'Monospace'  },
];

// Derive sorted category list preserving insertion order
const CATEGORIES = Array.from(new Set(AVAILABLE_FONTS.map(f => f.category)));

const CATEGORY_LABEL_KEY: Record<string, string> = {
  'Serif':      'fontsSection.categories.serif',
  'Sans-Serif': 'fontsSection.categories.sansSerif',
  'Monospace':  'fontsSection.categories.monospace',
};

// ─── Toggle component ─────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
}

const Toggle: React.FC<ToggleProps> = ({ enabled, onChange, disabled = false, title, ariaLabel }) => (
  <button
    role="switch"
    aria-checked={enabled}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => !disabled && onChange(!enabled)}
    title={title}
    className={`config-toggle-btn config-toggle-btn--${disabled ? 'disabled' : enabled ? 'on' : 'off'}`}
  >
    <span className={`config-toggle-btn__thumb${enabled ? ' config-toggle-btn__thumb--on' : ''}`} />
  </button>
);

// ─── Main component ───────────────────────────────────────────────────────────

const FontsSection: React.FC = () => {
  const { t } = useTranslation();
  const { config, updateConfig } = useSystemConfig();
  const [search, setSearch] = useState('');

  const approvedFonts = config.approvedFonts;

  const isApproved = (fontName: string) => approvedFonts.includes(fontName);

  const toggleFont = (fontName: string, enable: boolean) => {
    if (enable) {
      updateConfig({ approvedFonts: [...approvedFonts, fontName] });
    } else {
      // Prevent disabling the last enabled font
      if (approvedFonts.length <= 1) return;
      updateConfig({ approvedFonts: approvedFonts.filter(f => f !== fontName) });
    }
  };

  const filteredFonts = (category: string) =>
    AVAILABLE_FONTS
      .filter(f => f.category === category)
      .filter(f => f.label.toLowerCase().includes(search.toLowerCase()));

  const approvedCount = approvedFonts.length;
  const totalCount    = AVAILABLE_FONTS.length;
  const lastFontWarning = t('fontsSection.warning');

  return (
    <div className="config-fonts-page">

      {/* ── Header ── */}
      <div className="config-fonts-header">
        <h2 className="config-fonts-title">
          🔤 {t('fontsSection.title')}
        </h2>
        <p className="config-fonts-description">
          {t('fontsSection.description')}
        </p>
        <div className="config-fonts-status-row">
          <span className="config-fonts-count-badge">
            {t('fontsSection.countBadge', { approved: approvedCount, total: totalCount })}
          </span>
          {approvedCount <= 1 && (
            <span className="ps-conf-hint ps-conf-hint--warning">
              ⚠ {lastFontWarning}
            </span>
          )}
        </div>
      </div>

      {/* ── Search ── */}
      <input
        type="text"
        placeholder={t('fontsSection.searchPlaceholder')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="ps-conf-input config-fonts-search"
      />

      {/* ── Font groups ── */}
      {CATEGORIES.map(category => {
        const fonts = filteredFonts(category);
        if (fonts.length === 0) return null;
        const categoryLabel = t(CATEGORY_LABEL_KEY[category] ?? category);

        return (
          <div key={category} className="config-fonts-category-group">
            {/* Category label */}
            <div className="config-fonts-category-label">
              {categoryLabel}
            </div>

            <div className="config-fonts-grid">
            {fonts.map(font => {
              const enabled  = isApproved(font.name);
              const isLast   = enabled && approvedCount <= 1;

              return (
                <div key={font.name} className={`config-fonts-card config-fonts-card--${enabled ? 'enabled' : 'disabled'}`}>
                  {/* Font name rendered in its own typeface */}
                  <div>
                    <span
                      style={{ '--font-name': font.name } as React.CSSProperties}
                      className={`config-fonts-card__name config-fonts-card__name--${enabled ? 'enabled' : 'disabled'}`}
                    >
                      {font.label}
                    </span>
                    <span className="config-fonts-card__category">
                      {categoryLabel}
                    </span>
                  </div>

                  {/* Status + toggle */}
                  <div className="config-fonts-card__meta">
                    <span className={`config-fonts-card__status config-fonts-card__status--${enabled ? 'enabled' : 'disabled'}`}>
                      {enabled ? t('fontsSection.status.active') : t('fontsSection.status.inactive')}
                    </span>
                    <Toggle
                      enabled={enabled}
                      onChange={val => toggleFont(font.name, val)}
                      disabled={isLast}
                      title={isLast ? lastFontWarning : undefined}
                      ariaLabel={enabled
                        ? t('fontsSection.toggle.ariaDisable', { font: font.label })
                        : t('fontsSection.toggle.ariaEnable', { font: font.label })}
                    />
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        );
      })}

    </div>
  );
};

export default FontsSection;
