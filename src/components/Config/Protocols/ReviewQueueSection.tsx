/**
 * ReviewQueueSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders protocols in the pre-publish lifecycle: draft, in_review,
 * needs_changes, approved. Consumed by index.tsx (ProtocolsTab).
 *
 * Shows warning banner with counts, expandable cards with lifecycle
 * tracker, review notes, and context-sensitive action buttons.
 *
 * Navigation:
 *   "Open Reviewer" → /template-review/:id  (TemplateRenderer)
 *   "Open Editor"   → /template-editor/:id  (SynopticEditor)
 *
 * i18n note: `p.name`/`p.version`/`p.source`/`p.type`/`p.owner`/
 * `p.reviewNote` are real protocol data — never translated. Source badge
 * colours are CSS classes (sourceBadgeClass); a category's accent colour is
 * the one per-instance value and crosses into markup only as the --ps-hue
 * custom property (Batch 317 — no inline CSS).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useNavigate } from 'react-router';
import {
  Protocol,
  useProtocols,
  sourceBadgeClass,
  categoryHueVar,
  LifecycleBadge,
  UploadProtocolModal,
  BuildCustomiseModal,
} from './protocolShared';
import {
  OutlineBtn,
  TealBtn,
  SearchBar,
  CategoryGroup,
  EmptyState,
} from './ProtocolCardParts';

// ─── ProtocolCard ─────────────────────────────────────────────────────────────

const ProtocolCard: React.FC<{ protocol: Protocol }> = ({ protocol: p }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Industry standard: clicking the card navigates to the appropriate view
  // based on status — reviewer route for in_review/approved, editor for needs_changes
  const handleCardClick = () => {
    if (p.status === 'needs_changes') {
      navigate(`/template-editor/${p.id}?from=review`);
    } else {
      navigate(`/template-review/${p.id}`);
    }
  };

  const actionLabel = p.status === 'needs_changes'
    ? `✏️ ${t('reviewQueueSection.openEditorToAddressChanges')}`
    : p.status === 'approved'
    ? `🚀 ${t('reviewQueueSection.openReviewerToPublish')}`
    : `🔍 ${t('allProtocolsSection.openReviewerButton')}`;

  return (
    <div
      onClick={handleCardClick}
      className="ps-reviewqueue-card"
      title={actionLabel}
    >
      {/* Category accent */}
      <div className="ps-reviewqueue-card-accent" style={categoryHueVar(p.category)} />

      {/* Name + meta */}
      <div className="ps-reviewqueue-info">
        <div className="ps-reviewqueue-name" data-phi="name">{p.name}</div>
        <div className="ps-reviewqueue-meta">
          <span className="ps-reviewqueue-version">{p.version}</span>
          <span className="ps-reviewqueue-dot">&bull;</span>
          <span className={`ps-reviewqueue-source-badge ${sourceBadgeClass(p.source)}`}>{p.source}</span>
          <span className="ps-reviewqueue-dot">&bull;</span>
          <span className="ps-reviewqueue-meta-text">{p.type}</span>
          {p.owner && <>
            <span className="ps-reviewqueue-dot">&bull;</span>
            <span className="ps-reviewqueue-meta-text">{p.owner}</span>
          </>}
        </div>
        {/* Review note preview if present */}
        {p.reviewNote && (
          <div className={`ps-reviewqueue-note${p.status === 'needs_changes' ? ' ps-reviewqueue-note--needs-changes' : ' ps-reviewqueue-note--warning'}`}>
            <span className="ps-reviewqueue-note-icon">{p.status === 'needs_changes' ? '↩' : '⚠'}</span>
            <span className="ps-reviewqueue-note-text">{p.reviewNote}</span>
          </div>
        )}
      </div>

      <LifecycleBadge state={p.status} />

      {/* Directional cue */}
      <span className="ps-reviewqueue-chevron">›</span>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ReviewQueueSection: React.FC = () => {
  const { t }                       = useTranslation();
  const navigate                    = useNavigate();
  const [search, setSearch]         = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showBuild,  setShowBuild]  = useState(false);

  const protocols = useProtocols(p => p.status === 'in_review' || p.status === 'needs_changes' || p.status === 'approved');

  const inReviewCount     = protocols.filter(p => p.status === 'in_review').length;
  const needsChangesCount = protocols.filter(p => p.status === 'needs_changes').length;
  const approvedCount     = protocols.filter(p => p.status === 'approved').length;

  const filtered = search.trim()
    ? protocols.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        p.source.toLowerCase().includes(search.toLowerCase())
      )
    : protocols;

  const grouped = filtered.reduce<Record<string, Protocol[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="ps-activeprotocols-header">
        <div>
          <div className="ps-activeprotocols-title">🕐 {t('templateRenderer.nav.breadcrumbReviewQueue')}</div>
          <p className="ps-activeprotocols-subtitle">{t('reviewQueueSection.subtitle')}</p>
        </div>
        <div className="ps-activeprotocols-header-actions">
          <OutlineBtn onClick={() => setShowUpload(true)}>📤 {t('activeProtocolsSection.uploadProtocolButton')}</OutlineBtn>
          <TealBtn    onClick={() => setShowBuild(true)}>🔬 {t('activeProtocolsSection.buildCustomiseButton')}</TealBtn>
        </div>
      </div>

      {/* Status summary banner */}
      <div className="ps-reviewqueue-summary-row">
        {[
          { labelKey: 'protocolShared.lifecycle.inReview',     count: inReviewCount,     variant: 'warning' },
          { labelKey: 'protocolShared.lifecycle.needsChanges', count: needsChangesCount, variant: 'error'   },
          { labelKey: 'protocolShared.lifecycle.approved',     count: approvedCount,     variant: 'success' },
        ].map(s => (
          <div key={s.labelKey} className={`ps-reviewqueue-summary-tile ps-reviewqueue-summary-tile--${s.variant}`}>
            <div className="ps-reviewqueue-summary-count">{s.count}</div>
            <div className="ps-reviewqueue-summary-label">{t(s.labelKey)}</div>
          </div>
        ))}
        <div className="ps-reviewqueue-disclaimer">
          <span className="ps-reviewqueue-disclaimer-icon">⚠️</span>
          <span className="ps-reviewqueue-disclaimer-text">{t('reviewQueueSection.coverageDisclaimer')}</span>
        </div>
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

export default ReviewQueueSection;
