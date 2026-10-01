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
 * Row actions (View, Duplicate, Export JSON, New Version, Archive) come from
 * ProtocolCardParts.tsx → ProtocolRowActions; which ones show, and what each
 * does, is in services/templates/protocolLifecycle.ts (Batch 317, PS-73).
 *   "View Protocol" → /template-review/:id                  (read-only)
 *   "Duplicate"     → /template-editor/:id?mode=duplicate    (new protocol)
 *   "New Version"   → /template-editor/:id?mode=newVersion   (next version;
 *                     publishing it archives this one)
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
import { useNavigate } from 'react-router';
import {
  Protocol,
  useProtocols,
  LifecycleBadge,
  CoverageBar,
  UploadProtocolModal,
  BuildCustomiseModal,
  protocolGroup,
  sourceBadgeClass,
  categoryHueVar,
} from './protocolShared';
import {
  LifecycleTracker,
  ProtocolRowActions,
  OutlineBtn,
  TealBtn,
  SearchBar,
  CategoryGroup,
  EmptyState,
} from './ProtocolCardParts';

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
  const [open, setOpen] = useState(false);
  return (
    <div className="ps-activeprotocols-card">

      {/* Collapsed row */}
      <div
        onClick={() => setOpen(o => !o)}
        className={`ps-activeprotocols-row${open ? ' ps-activeprotocols-row--open' : ''}`}
      >
        <div className="ps-activeprotocols-cat-bar" style={categoryHueVar(p.category)} />

        <div className="ps-activeprotocols-info">
          <div className="ps-activeprotocols-name" data-phi="name">{p.name}</div>
          <div className="ps-activeprotocols-meta">
            <span className="ps-activeprotocols-version">{p.version}</span>
            <span className="ps-activeprotocols-dot">&bull;</span>
            <span className={`ps-activeprotocols-source-badge ${sourceBadgeClass(p.source)}`}>{p.source}</span>
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
          <LifecycleTracker protocol={p} />

          {/* Actions */}
          <ProtocolRowActions protocol={p} from="active" />
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
