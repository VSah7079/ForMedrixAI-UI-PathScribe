/**
 * AllProtocolsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the complete protocol library across all lifecycle states.
 * Consumed by index.tsx (ProtocolsTab).
 *
 * Adds a status filter pill-bar (All / Published / Approved / In Review /
 * Needs Changes / Draft / Archived) above the grouped list. "All" excludes
 * archived protocols (Batch 317). Row actions: ProtocolCardParts.tsx →
 * ProtocolRowActions, rules in services/templates/protocolLifecycle.ts.
 *
 * i18n note: `p.category`/`p.source`/`p.type`/`p.owner`/`p.lastModified`/
 * `p.name`/`p.reviewNote` are persisted mock registry data (protocolShared.
 * tsx's own posture) and stay untouched/English here too. This file reuses
 * the shared, already-translated mini-components in ProtocolCardParts.tsx
 * (SearchBar/CategoryGroup/EmptyState/OutlineBtn/TealBtn, moved there from
 * ActiveProtocolsSection.tsx in Batch 317), the `.ps-activeprotocols-*` CSS class family
 * for the layout this card shares with that file's own, and its exact
 * `protocolShared.lifecycle.*`/`activeProtocolsSection.*` translation keys
 * for the concepts both files display identically, rather than duplicating
 * any of that.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Protocol,
  useProtocols,
  LifecycleState,
  LifecycleBadge,
  CoverageBar,
  UploadProtocolModal,
  BuildCustomiseModal,
  sourceBadgeClass,
  categoryHueVar,
  lifecycleHueClass,
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
import { matchesStatusFilter } from '@/services/templates/protocolLifecycle';

type StatusFilter = 'all' | LifecycleState;

const STATUS_FILTERS: StatusFilter[] = ['all', 'published', 'approved', 'in_review', 'needs_changes', 'draft', 'archived'];

// Reuses the exact protocolShared.lifecycle.* keys LifecycleBadge (and
// ActiveProtocolsSection.tsx's own lifecycle tracker) already render for
// these same states, rather than duplicating this translation content.
const STATUS_FILTER_LABEL_KEY: Record<StatusFilter, string> = {
  all:           'activeProtocolsSection.filterAll',
  published:     'protocolShared.lifecycle.published',
  approved:      'protocolShared.lifecycle.approved',
  in_review:     'protocolShared.lifecycle.inReview',
  needs_changes: 'protocolShared.lifecycle.needsChanges',
  draft:         'protocolShared.lifecycle.draft',
  archived:      'protocolShared.lifecycle.archived',
};

// ─── ProtocolCard (all-protocols variant — shows both reviewer + editor) ──────

const ProtocolCard: React.FC<{ protocol: Protocol }> = ({ protocol: p }) => {
  const { t }            = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="ps-activeprotocols-card">
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
            <span className="ps-activeprotocols-dot">&bull;</span>
            <span className="ps-activeprotocols-type">{p.owner}</span>
          </div>
        </div>
        <LifecycleBadge state={p.status} />
        <span className={`ps-activeprotocols-chevron${open ? ' ps-activeprotocols-chevron--open' : ''}`}>›</span>
      </div>

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

          {/* Review note — p.reviewNote is persisted reviewer-authored
              content and stays untouched; only the 2-state (critical/
              warning) styling is real UI chrome. */}
          {p.reviewNote && (
            <div className={`ps-activeprotocols-review-note${p.status === 'needs_changes' ? ' ps-activeprotocols-review-note--critical' : ' ps-activeprotocols-review-note--warning'}`}>
              <span className="ps-activeprotocols-review-note-icon">{p.status === 'needs_changes' ? '↩️' : '⚠️'}</span>
              {p.reviewNote}
            </div>
          )}

          {/* Lifecycle tracker */}
          <LifecycleTracker protocol={p} showNeedsChanges />

          {/* Actions — which ones show is decided in services/templates/protocolLifecycle.ts */}
          <ProtocolRowActions protocol={p} from="all" />
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const AllProtocolsSection: React.FC = () => {
  const { t }                             = useTranslation();
  const navigate                          = useNavigate();
  const [search,       setSearch]         = useState('');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showBuild,  setShowBuild]  = useState(false);

  const allProtocols = useProtocols();
  const filtered = allProtocols.filter(p => {
    const matchStatus = matchesStatusFilter(p, statusFilter);
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.source.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, Protocol[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="ps-activeprotocols-header">
        <div>
          <div className="ps-activeprotocols-title">📚 {t('allProtocolsSection.title')}</div>
          <p className="ps-activeprotocols-subtitle">{t('allProtocolsSection.subtitle')}</p>
        </div>
        <div className="ps-activeprotocols-header-actions">
          <OutlineBtn onClick={() => setShowUpload(true)}>📤 {t('activeProtocolsSection.uploadProtocolButton')}</OutlineBtn>
          <TealBtn    onClick={() => setShowBuild(true)}>🔬 {t('activeProtocolsSection.buildCustomiseButton')}</TealBtn>
        </div>
      </div>

      {/* Status filter pills — each pill's colour is its lifecycle state's
          CSS hue class (.ps-lc-hue--*); the active pill is tinted from it. */}
      <div className="ps-activeprotocols-filter-row">
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f;
          const count  = allProtocols.filter(p => matchesStatusFilter(p, f)).length;
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`ps-activeprotocols-status-filter-btn ${lifecycleHueClass(f)}${active ? ' ps-activeprotocols-status-filter-btn--active' : ''}`}
            >
              {t(STATUS_FILTER_LABEL_KEY[f])} <span className="ps-activeprotocols-filter-count">({count})</span>
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
          onBuildFromTemplate={id => { setShowBuild(false); navigate(`/template-editor/${id}?mode=duplicate&from=all`); }}
        />
      )}
    </div>
  );
};

export default AllProtocolsSection;
