/**
 * ActiveProtocolsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders validated/published protocols available in the reporting workflow.
 * Consumed by components/Config/Protocols/index.tsx (ProtocolsTab).
 *
 * Shows:
 *   - "Import CAP / RCPath" + "Build from Scratch" action buttons
 *   - Search bar
 *   - Protocols grouped by anatomical category
 *   - Each row expands to show stats, lifecycle tracker, and actions
 *
 * Navigation:
 *   "View Protocol" → /template-review/:id   (TemplateRenderer, read-only)
 *   "New Version"   → /template-editor/:id   (SynopticEditor, creates draft fork)
 *
 * i18n note: `p.category`/`p.source`/`p.type`/`p.owner`/`p.lastModified`/
 * `p.name` are persisted mock registry data (protocolShared.tsx's own
 * posture) and stay untouched/English here too. `protocolGroup()`'s return
 * values are a real closed set used for the group filter tabs, so they go
 * through a GROUP_LABEL_KEY map (protocolShared.tsx flagged this file as
 * the place that mapping belongs). The lifecycle-tracker step labels reuse
 * the exact `protocolShared.lifecycle.*` keys LifecycleBadge already
 * renders, rather than duplicating that translation content here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Protocol,
  useProtocols,
  LIFECYCLE_STYLES,
  SOURCE_STYLES,
  CATEGORY_COLORS,
  LIFECYCLE_ORDER,
  LifecycleBadge,
  CoverageBar,
  UploadProtocolModal,
  BuildCustomiseModal,
  protocolGroup,
} from './protocolShared';

// Reuses the same protocolShared.lifecycle.* keys LifecycleBadge already
// renders for these states, so the tracker's step labels stay in sync with
// the badge's wording without duplicating translation content.
const LIFECYCLE_STEP_LABEL_KEY: Partial<Record<Protocol['status'], string>> = {
  draft:     'protocolShared.lifecycle.draft',
  in_review: 'protocolShared.lifecycle.inReview',
  approved:  'protocolShared.lifecycle.approved',
  published: 'protocolShared.lifecycle.published',
};

// protocolGroup()'s return values are a real, closed set of data
// identifiers compared by strict string equality (see protocolShared.tsx);
// only the displayed label is translated.
const GROUP_LABEL_KEY: Record<ReturnType<typeof protocolGroup>, string> = {
  'Surgical Pathology': 'activeProtocolsSection.group.surgicalPathology',
  'Non-GYN Cytology':   'activeProtocolsSection.group.nonGynCytology',
  'GYN Cytology':       'activeProtocolsSection.group.gynCytology',
  'Grossing':           'activeProtocolsSection.group.grossing',
};

// ─── ProtocolCard ─────────────────────────────────────────────────────────────

const ProtocolCard: React.FC<{ protocol: Protocol }> = ({ protocol: p }) => {
  const { t }            = useTranslation();
  const navigate        = useNavigate();
  const [open, setOpen] = useState(false);
  const catColor        = CATEGORY_COLORS[p.category] ?? '#64748b';
  const srcStyle        = SOURCE_STYLES[p.source]     ?? SOURCE_STYLES.Custom;

  const stepIndex = LIFECYCLE_ORDER.indexOf(
    p.status === 'needs_changes' ? 'in_review' : p.status
  );

  return (
    <div className="ps-activeprotocols-card">

      {/* Collapsed row */}
      <div
        onClick={() => setOpen(o => !o)}
        className={`ps-activeprotocols-row${open ? ' ps-activeprotocols-row--open' : ''}`}
      >
        <div className="ps-activeprotocols-cat-bar" style={{ background: catColor }} />

        <div className="ps-activeprotocols-info">
          <div className="ps-activeprotocols-name" data-phi="name">{p.name}</div>
          <div className="ps-activeprotocols-meta">
            <span className="ps-activeprotocols-version">{p.version}</span>
            <span className="ps-activeprotocols-dot">&bull;</span>
            <span className="ps-activeprotocols-source-badge" style={{ background: srcStyle.bg, color: srcStyle.color }}>{p.source}</span>
            <span className="ps-activeprotocols-dot">&bull;</span>
            <span className="ps-activeprotocols-type">{p.type}</span>
          </div>
        </div>

        <LifecycleBadge state={p.status} />
        <span className={`ps-activeprotocols-chevron${open ? ' ps-activeprotocols-chevron--open' : ''}`}>›</span>
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="ps-activeprotocols-panel">

          {/* Stats */}
          <div className="ps-activeprotocols-stats">
            {[
              { label: t('activeProtocolsSection.stats.sections'),     value: Math.max(1, Math.round(p.fields / 7)) },
              { label: t('activeProtocolsSection.stats.fields'),       value: p.fields },
              { label: t('activeProtocolsSection.stats.lastModified'), value: p.lastModified },
              { label: t('activeProtocolsSection.stats.owner'),        value: p.owner },
            ].map(stat => (
              <div key={stat.label}>
                <div className="ps-activeprotocols-stat-value">{stat.value}</div>
                <div className="ps-activeprotocols-stat-label">{stat.label}</div>
              </div>
            ))}
            <div className="ps-activeprotocols-coverage-row">
              <CoverageBar pct={p.snomedPct} label="SNOMED CT" />
              <CoverageBar pct={p.icdPct}    label="ICD-10/11" />
            </div>
          </div>

          {/* Lifecycle tracker */}
          <div className="ps-activeprotocols-lifecycle">
            {LIFECYCLE_ORDER.map((s, i) => {
              const sStyle    = LIFECYCLE_STYLES[s];
              const isCurrent = i === stepIndex;
              const isPast    = i < stepIndex;
              return (
                <React.Fragment key={s}>
                  <div className="ps-activeprotocols-step">
                    <div
                      className={`ps-activeprotocols-step-circle${isPast ? ' ps-activeprotocols-step-circle--past' : ''}`}
                      style={isCurrent && !isPast ? { background: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}` } : undefined}
                    >
                      {isPast ? '✓' : i + 1}
                    </div>
                    <span
                      className={`ps-activeprotocols-step-label${isCurrent ? ' ps-activeprotocols-step-label--current' : isPast ? ' ps-activeprotocols-step-label--past' : ''}`}
                      style={isCurrent ? { color: sStyle.color } : undefined}
                    >
                      {t(LIFECYCLE_STEP_LABEL_KEY[s] ?? 'protocolShared.lifecycle.draft')}
                    </span>
                  </div>
                  {i < LIFECYCLE_ORDER.length - 1 && <span className="ps-activeprotocols-step-sep">—</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Actions */}
          <div className="ps-activeprotocols-actions">
            <ActionBtn color="#38bdf8" bg="rgba(56,189,248,0.1)" border="rgba(56,189,248,0.25)" onClick={() => navigate(`/template-review/${p.id}`)}>👁 {t('activeProtocolsSection.viewProtocolButton')}</ActionBtn>
            <ActionBtn onClick={() => navigate(`/template-editor/${p.id}`)}>📋 {t('common.duplicate')}</ActionBtn>
            <ActionBtn onClick={() => {}}>{'{ }'} {t('activeProtocolsSection.exportJsonButton')}</ActionBtn>
            <ActionBtn onClick={() => navigate(`/template-editor/${p.id}`)}>🔁 {t('activeProtocolsSection.newVersionButton')}</ActionBtn>
            <ActionBtn danger onClick={() => {}}>🗑 {t('common.archive')}</ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ActiveProtocolsSection: React.FC = () => {
  const { t }                         = useTranslation();
  const navigate                      = useNavigate();
  const [search,     setSearch]       = useState('');
  const [showUpload,  setShowUpload]  = useState(false);
  const [showBuild,   setShowBuild]   = useState(false);
  const [groupFilter, setGroupFilter] = useState<'All' | ReturnType<typeof protocolGroup>>('All');

  const protocols = useProtocols(p => p.status === 'published');

  const GROUPS: ('All' | ReturnType<typeof protocolGroup>)[] = ['All', 'Surgical Pathology', 'Non-GYN Cytology', 'GYN Cytology', 'Grossing'];
  const groupCounts = GROUPS.reduce<Record<string, number>>((acc, g) => {
    acc[g] = g === 'All' ? protocols.length : protocols.filter(p => protocolGroup(p) === g).length;
    return acc;
  }, {});

  const byGroup = groupFilter === 'All' ? protocols : protocols.filter(p => protocolGroup(p) === groupFilter);

  const filtered = search.trim()
    ? byGroup.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        p.source.toLowerCase().includes(search.toLowerCase())
      )
    : byGroup;

  const grouped = filtered.reduce<Record<string, Protocol[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* Header + buttons */}
      <div className="ps-activeprotocols-header">
        <div>
          <div className="ps-activeprotocols-title">✅ {t('activeProtocolsSection.title')}</div>
          <p className="ps-activeprotocols-subtitle">{t('activeProtocolsSection.subtitle')}</p>
        </div>
        <div className="ps-activeprotocols-header-actions">
          <OutlineBtn onClick={() => setShowUpload(true)}>📤 {t('activeProtocolsSection.uploadProtocolButton')}</OutlineBtn>
          <TealBtn    onClick={() => setShowBuild(true)}>🔬 {t('activeProtocolsSection.buildCustomiseButton')}</TealBtn>
        </div>
      </div>

      {/* Group filter */}
      <div className="ps-activeprotocols-filter-row">
        {GROUPS.map(g => {
          const active = groupFilter === g;
          return (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={active ? 'ps-tat-filter-btn ps-tat-filter-btn--active' : 'ps-tat-filter-btn'}
            >
              {g === 'All' ? t('activeProtocolsSection.filterAll') : t(GROUP_LABEL_KEY[g])} <span className="ps-activeprotocols-filter-count">({groupCounts[g]})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Groups */}
      {Object.entries(grouped).map(([cat, items]) => (
        <CategoryGroup key={cat} category={cat} count={items.length}>
          {items.map(p => <ProtocolCard key={p.id} protocol={p} />)}
        </CategoryGroup>
      ))}

      {filtered.length === 0 && <EmptyState search={search} />}

      {showUpload && <UploadProtocolModal onClose={() => setShowUpload(false)} />}
      {showBuild && (
        <BuildCustomiseModal
          onClose={() => setShowBuild(false)}
          onBuildBlank={() => { setShowBuild(false); navigate('/template-editor/new'); }}
          onBuildFromTemplate={id => { setShowBuild(false); navigate(`/template-editor/${id}?mode=duplicate`); }}
        />
      )}
    </div>
  );
};

export default ActiveProtocolsSection;

// ─── Shared mini-components (local) ──────────────────────────────────────────

export const ActionBtn: React.FC<{ children: React.ReactNode; onClick: () => void; color?: string; bg?: string; border?: string; danger?: boolean }> = ({ children, onClick, color, bg, border, danger }) => {
  const customVars = (color || bg || border)
    ? ({
        ...(color  ? { '--ps-abtn-color':  color }  : {}),
        ...(bg     ? { '--ps-abtn-bg':     bg }     : {}),
        ...(border ? { '--ps-abtn-border': border } : {}),
      } as React.CSSProperties)
    : undefined;
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`ps-activeprotocols-action-btn${danger ? ' ps-activeprotocols-action-btn--danger' : ''}`}
      style={customVars}
    >{children}</button>
  );
};

export const OutlineBtn: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
  <button onClick={onClick} className="ps-conf-btn-secondary">{children}</button>
);

export const TealBtn: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
  <button onClick={onClick} className="ps-conf-btn-teal-accent">{children}</button>
);

export const SearchBar: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-activeprotocols-search-wrap">
      <span className="ps-activeprotocols-search-icon">🔍</span>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={t('activeProtocolsSection.searchPlaceholder')}
        className="ps-activeprotocols-search-input"
      />
    </div>
  );
};

export const CategoryGroup: React.FC<{ category: string; count: number; children: React.ReactNode }> = ({ category, count, children }) => {
  const { t }    = useTranslation();
  const catColor = CATEGORY_COLORS[category] ?? '#64748b';
  return (
    <div className="ps-activeprotocols-group">
      <div className="ps-activeprotocols-group-header">
        <span className="ps-activeprotocols-group-label" style={{ color: catColor }}>● {category}</span>
        <div className="ps-activeprotocols-group-divider" />
        <span className="ps-activeprotocols-group-count">{t('activeProtocolsSection.protocolCount', { count })}</span>
      </div>
      {children}
    </div>
  );
};

export const EmptyState: React.FC<{ search: string }> = ({ search }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-activeprotocols-empty">
      <div className="ps-activeprotocols-empty-icon">🔍</div>
      <div className="ps-activeprotocols-empty-title">{t('activeProtocolsSection.emptyState.title')}</div>
      <div className="ps-activeprotocols-empty-desc">
        {search ? t('activeProtocolsSection.emptyState.noResultsFor', { query: search }) : t('activeProtocolsSection.emptyState.noneInSection')}
      </div>
    </div>
  );
};
