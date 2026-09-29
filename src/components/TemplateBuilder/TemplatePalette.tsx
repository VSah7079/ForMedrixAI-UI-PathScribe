// src/components/TemplateBuilder/TemplatePalette.tsx
//
// i18n note: `PALETTE_ITEMS` (types/template.ts) is a shared,
// multi-consumer array — its own `label`/`subtitle` also double as
// the real default `label` a new `TemplateNode` is created with
// (createDefaultNode, same file), i.e. real content the user places
// into their own report design and can rename, not pure UI chrome —
// left as literal English, out of scope for this single-file batch.
// `CATEGORY_CONFIG` below, by contrast, is local to this file and
// purely decorative palette-grouping chrome, so it's translated here.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PALETTE_ITEMS, type PaletteItem } from '../../types/template';

const PALETTE_DRAG_PREFIX = 'palette::';

// ── WCAG AA minimum contrast colours (all tested against #0d1117) ──
// Normal text needs 4.5:1. Large/bold text needs 3:1.
// #e2e8f0 on #0d1117 = 14.3:1 ✓ (primary labels)
// #94a3b8 on #0d1117 = 5.8:1 ✓  (secondary / subtitles)
// #64748b on #0d1117 = 3.6:1 — only used for large bold category labels (passes 3:1)
// These values now live in pathscribe.css under ps-tpal-* — see that file for the
// corresponding rules; kept here as the source-of-truth comment for future edits.

const CATEGORY_ORDER = ['content', 'structure', 'conditional', 'layout'] as const;

const CATEGORY_CONFIG: Record<string, { labelKey: string; icon: string }> = {
  content:     { labelKey: 'templatePalette.categories.content',     icon: '◧' },
  structure:   { labelKey: 'templatePalette.categories.structure',   icon: '⊟' },
  conditional: { labelKey: 'templatePalette.categories.conditional', icon: '⋮' },
  layout:      { labelKey: 'templatePalette.categories.layout',      icon: '⊞' },
};

// ── Palette item ───────────────────────────────────────────────

const PaletteItemRow: React.FC<{ item: PaletteItem }> = ({ item }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', PALETTE_DRAG_PREFIX + item.type);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`ps-tpal-item${hovered ? ' ps-tpal-item--hovered' : ''}`}
    >
      {/* Coloured icon badge — colour is per-item-type data, set via CSS custom properties */}
      <div
        className="ps-tpal-item-icon"
        style={{ '--tpal-color': item.color } as React.CSSProperties}
      >
        {item.icon}
      </div>

      {/* Labels */}
      <div className="ps-tpal-item-labels">
        <div className="ps-tpal-item-label">{item.label}</div>
        <div className="ps-tpal-item-subtitle">{item.subtitle}</div>
      </div>

      {/* Drag affordance */}
      {hovered && <div className="ps-tpal-item-drag-hint">⠿</div>}
    </div>
  );
};

// ── Category group ─────────────────────────────────────────────

const CategoryGroup: React.FC<{
  category: string;
  items: PaletteItem[];
  defaultOpen?: boolean;
}> = ({ category, items, defaultOpen = true }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const cfg = CATEGORY_CONFIG[category];

  return (
    <div className="ps-tpal-group">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`ps-tpal-group-header${open ? ' ps-tpal-group-header--open' : ''}`}
      >
        <span className="ps-tpal-group-icon">{cfg.icon}</span>
        <span className="ps-tpal-group-label">{t(cfg.labelKey)}</span>
        <span className="ps-tpal-group-count">{items.length}</span>
        <span className={`ps-tpal-group-chevron${open ? '' : ' ps-tpal-group-chevron--closed'}`}>▾</span>
      </button>

      {/* Items */}
      {open && (
        <div>
          {items.map(item => (
            <PaletteItemRow key={item.type} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main palette ───────────────────────────────────────────────

export const TemplatePalette: React.FC = () => {
  const { t } = useTranslation();
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: PALETTE_ITEMS.filter(p => p.category === cat),
  }));

  return (
    <aside className="ps-tpal-root">
      {/* Header */}
      <div className="ps-tpal-header">
        <div className="ps-tpal-header-title">{t('templatePalette.headerTitle')}</div>
        <div className="ps-tpal-header-sub">{t('templatePalette.headerSubtitle')}</div>
      </div>

      {/* Scrollable groups */}
      <div className="ps-tpal-groups">
        {grouped.map(({ category, items }) => (
          <CategoryGroup
            key={category}
            category={category}
            items={items}
            defaultOpen={category === 'content' || category === 'structure'}
          />
        ))}
      </div>
    </aside>
  );
};
