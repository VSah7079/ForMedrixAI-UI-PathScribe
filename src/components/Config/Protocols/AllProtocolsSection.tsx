/**
 * AllProtocolsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the complete protocol library across all lifecycle states.
 * Consumed by index.tsx (ProtocolsTab).
 *
 * Adds a status filter pill-bar (All / Draft / In Review / Needs Changes /
 * Approved / Published) above the grouped list.
 *
 * i18n note: `p.category`/`p.source`/`p.type`/`p.owner`/`p.lastModified`/
 * `p.name`/`p.reviewNote` are persisted mock registry data (protocolShared.
 * tsx's own posture) and stay untouched/English here too. This file reuses
 * several of ActiveProtocolsSection.tsx's (batch 148) already-translated
 * shared mini-components (SearchBar/CategoryGroup/EmptyState/ActionBtn/
 * OutlineBtn/TealBtn) as-is, its `.ps-activeprotocols-*` CSS class family
 * for the layout this card shares with that file's own, and its exact
 * `protocolShared.lifecycle.*`/`activeProtocolsSection.*` translation keys
 * for the concepts both files display identically, rather than duplicating
 * any of that.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Protocol,
  useProtocols,
  LifecycleState,
  LIFECYCLE_STYLES,
  SOURCE_STYLES,
  CATEGORY_COLORS,
  LIFECYCLE_ORDER,
  LifecycleBadge,
  CoverageBar,
  UploadProtocolModal,
  BuildCustomiseModal,
} from './protocolShared';
import {
  ActionBtn,
  OutlineBtn,
  TealBtn,
  SearchBar,
  CategoryGroup,
  EmptyState,
} from './ActiveProtocolsSection';

type StatusFilter = 'all' | LifecycleState;

const STATUS_FILTERS: StatusFilter[] = ['all', 'published', 'approved', 'in_review', 'needs_changes', 'draft'];

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
};

// Same reasoning/reuse as ActiveProtocolsSection.tsx's own identical map:
// LIFECYCLE_ORDER only ever contains these four real stages.
const LIFECYCLE_STEP_LABEL_KEY: Partial<Record<Protocol['status'], string>> = {
  draft:     'protocolShared.lifecycle.draft',
  in_review: 'protocolShared.lifecycle.inReview',
  approved:  'protocolShared.lifecycle.approved',
  published: 'protocolShared.lifecycle.published',
};

// ─── ProtocolCard (all-protocols variant — shows both reviewer + editor) ──────

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
            {p.status === 'needs_changes' && (
              <span className="ps-activeprotocols-needs-changes-pill">↩ {t('protocolShared.lifecycle.needsChanges')}</span>
            )}
          </div>

          {/* Actions */}
          <div className="ps-activeprotocols-actions">
            {p.status === 'published'
              ? <ActionBtn color="#38bdf8" bg="rgba(56,189,248,0.1)" border="rgba(56,189,248,0.25)" onClick={() => navigate(`/template-review/${p.id}`)}>👁 {t('activeProtocolsSection.viewProtocolButton')}</ActionBtn>
              : <ActionBtn color="#0891B2" bg="rgba(8,145,178,0.15)" border="rgba(8,145,178,0.35)" onClick={() => navigate(`/template-review/${p.id}`)}>🔍 {t('allProtocolsSection.openReviewerButton')}</ActionBtn>
            }
            {p.status !== 'published' && <ActionBtn onClick={() => navigate(`/template-editor/${p.id}?from=all`)}>✏️ {t('allProtocolsSection.openEditorButton')}</ActionBtn>}
            <ActionBtn onClick={() => {}}>📋 {t('common.duplicate')}</ActionBtn>
            <ActionBtn onClick={() => {}}>{'{ }'} {t('activeProtocolsSection.exportJsonButton')}</ActionBtn>
            {p.status === 'published' && <ActionBtn onClick={() => {}}>🔁 {t('activeProtocolsSection.newVersionButton')}</ActionBtn>}
            <ActionBtn danger onClick={() => {}}>🗑 {t('common.archive')}</ActionBtn>
          </div>
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
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
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

      {/* Status filter pills — active color is genuinely per-status data
          (LIFECYCLE_STYLES), so it's set via CSS custom properties on a
          fixed-layout class, same technique as ActionBtn's own
          --ps-abtn-* overrides. */}
      <div className="ps-activeprotocols-filter-row">
        {STATUS_FILTERS.map(f => {
          const active   = statusFilter === f;
          const lcStyle  = f !== 'all' ? LIFECYCLE_STYLES[f as LifecycleState] : null;
          const count    = f === 'all' ? allProtocols.length : allProtocols.filter(p => p.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="ps-activeprotocols-status-filter-btn"
              style={active ? ({
                '--ps-statusfilter-bg':     lcStyle ? lcStyle.bg     : 'rgba(8,145,178,0.15)',
                '--ps-statusfilter-color':  lcStyle ? lcStyle.color  : '#0891B2',
                '--ps-statusfilter-border': lcStyle ? lcStyle.border : 'rgba(8,145,178,0.3)',
              } as React.CSSProperties) : undefined}
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
