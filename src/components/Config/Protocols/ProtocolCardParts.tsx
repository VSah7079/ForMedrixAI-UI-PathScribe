/**
 * ProtocolCardParts.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pieces shared by the protocol library screens (Active Protocols, All
 * Protocols, Review Queue). Batch 317 (PS-73) moved them here from
 * ActiveProtocolsSection.tsx and added the real row actions.
 *
 *   ProtocolRowActions  View / Reviewer / Editor / Duplicate / Export JSON /
 *                       New Version / Archive / Restore. Which ones show is
 *                       decided by protocolActions() in
 *                       services/templates/protocolLifecycle.ts; this file
 *                       only renders and dispatches. Before Batch 317,
 *                       Duplicate/Export/New Version/Archive did nothing on
 *                       All Protocols, and on Active Protocols "Duplicate"
 *                       opened the PUBLISHED protocol for direct editing.
 *   LifecycleTracker    the draft → review → approved → published steps.
 *   ActionBtn, OutlineBtn, TealBtn, SearchBar, CategoryGroup, EmptyState.
 *
 * No inline CSS: lifecycle/source colours are CSS classes
 * (.ps-lc-hue--*, .ps-protocol-source--*); a category's colour is the only
 * per-instance value and crosses into markup as --ps-hue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import '../../../pathscribe.css';
import ConfirmModal from '../../Common/ConfirmModal';
import {
  Protocol,
  LIFECYCLE_ORDER,
  lifecycleHueClass,
  categoryHueVar,
} from './protocolShared';
import { protocolActions, buildProtocolExport } from '@/services/templates/protocolLifecycle';
import { getTemplate, archiveTemplate, restoreTemplate } from '@/services/templates/templateService';
import { downloadJson } from '@/utils/downloadJson';
import { formatDateLong } from '@/utils/formatDate';

// Reuses the protocolShared.lifecycle.* keys LifecycleBadge renders, so the
// tracker's step labels match the badge wording.
const LIFECYCLE_STEP_LABEL_KEY: Partial<Record<Protocol['status'], string>> = {
  draft:     'protocolShared.lifecycle.draft',
  in_review: 'protocolShared.lifecycle.inReview',
  approved:  'protocolShared.lifecycle.approved',
  published: 'protocolShared.lifecycle.published',
};

// ─── LifecycleTracker ─────────────────────────────────────────────────────────

export const LifecycleTracker: React.FC<{ protocol: Protocol; showNeedsChanges?: boolean }> = ({ protocol: p, showNeedsChanges }) => {
  const { t } = useTranslation();
  const stepIndex = LIFECYCLE_ORDER.indexOf(p.status === 'needs_changes' ? 'in_review' : p.status);
  return (
    <div className="ps-activeprotocols-lifecycle">
      {LIFECYCLE_ORDER.map((s, i) => {
        const isCurrent = i === stepIndex;
        const isPast    = stepIndex >= 0 && i < stepIndex;
        return (
          <React.Fragment key={s}>
            <div className={`ps-activeprotocols-step ${lifecycleHueClass(s)}`}>
              <div className={`ps-activeprotocols-step-circle${isPast ? ' ps-activeprotocols-step-circle--past' : isCurrent ? ' ps-activeprotocols-step-circle--current' : ''}`}>
                {isPast ? '✓' : i + 1}
              </div>
              <span className={`ps-activeprotocols-step-label${isCurrent ? ' ps-activeprotocols-step-label--current' : isPast ? ' ps-activeprotocols-step-label--past' : ''}`}>
                {t(LIFECYCLE_STEP_LABEL_KEY[s] ?? 'protocolShared.lifecycle.draft')}
              </span>
            </div>
            {i < LIFECYCLE_ORDER.length - 1 && <span className="ps-activeprotocols-step-sep">—</span>}
          </React.Fragment>
        );
      })}
      {showNeedsChanges && p.status === 'needs_changes' && (
        <span className="ps-activeprotocols-needs-changes-pill">↩ {t('protocolShared.lifecycle.needsChanges')}</span>
      )}
    </div>
  );
};

// ─── ProtocolRowActions ───────────────────────────────────────────────────────

export const ProtocolRowActions: React.FC<{ protocol: Protocol; from: 'all' | 'active' }> = ({ protocol: p, from }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const actions = protocolActions(p);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const fromParam = from === 'all' ? '&from=all' : '';

  const run = async (work: () => Promise<unknown>, errorKey: string) => {
    setBusy(true);
    setError(null);
    try { await work(); } catch { setError(t(errorKey)); } finally { setBusy(false); }
  };

  const handleExport = () => run(async () => {
    const detail = await getTemplate(p.id);
    const { filename, data } = buildProtocolExport({ ...detail, supersedesId: p.supersedesId }, detail.template, new Date().toISOString());
    downloadJson(filename, data);
  }, 'protocolActions.errors.exportFailed');

  const handleArchive = () => {
    setConfirmArchive(false);
    return run(() => archiveTemplate(p.id), 'protocolActions.errors.archiveFailed');
  };

  const handleRestore = () => run(() => restoreTemplate(p.id), 'protocolActions.errors.restoreFailed');

  return (
    <>
      {p.status === 'archived' && p.archivedAt && (
        <div className="ps-activeprotocols-archived-note">
          {t('protocolActions.archivedOn', { date: formatDateLong(p.archivedAt, i18n.language) })}
        </div>
      )}
      <div className="ps-activeprotocols-actions">
        {actions.view && (
          <ActionBtn variant="view" onClick={() => navigate(`/template-review/${p.id}`)}>👁 {t('activeProtocolsSection.viewProtocolButton')}</ActionBtn>
        )}
        {actions.openReviewer && (
          <ActionBtn variant="review" onClick={() => navigate(`/template-review/${p.id}`)}>🔍 {t('allProtocolsSection.openReviewerButton')}</ActionBtn>
        )}
        {actions.openEditor && (
          <ActionBtn onClick={() => navigate(`/template-editor/${p.id}?from=${from}`)}>✏️ {t('allProtocolsSection.openEditorButton')}</ActionBtn>
        )}
        {actions.duplicate && (
          <ActionBtn onClick={() => navigate(`/template-editor/${p.id}?mode=duplicate${fromParam}`)}>📋 {t('common.duplicate')}</ActionBtn>
        )}
        {actions.exportJson && (
          <ActionBtn disabled={busy} onClick={handleExport}>{'{ }'} {t('activeProtocolsSection.exportJsonButton')}</ActionBtn>
        )}
        {actions.newVersion && (
          <ActionBtn onClick={() => navigate(`/template-editor/${p.id}?mode=newVersion${fromParam}`)}>🔁 {t('activeProtocolsSection.newVersionButton')}</ActionBtn>
        )}
        {actions.restore && (
          <ActionBtn disabled={busy} onClick={handleRestore}>↺ {t('protocolActions.restoreButton')}</ActionBtn>
        )}
        {actions.archive && (
          <ActionBtn danger disabled={busy} onClick={() => setConfirmArchive(true)}>🗑 {t('common.archive')}</ActionBtn>
        )}
      </div>
      {error && <div className="ps-activeprotocols-action-error">⚠ {error}</div>}
      <ConfirmModal
        show={confirmArchive}
        title={t('protocolActions.archiveConfirm.title')}
        message={t(p.status === 'published' ? 'protocolActions.archiveConfirm.bodyPublished' : 'protocolActions.archiveConfirm.body', { name: p.name, version: p.version })}
        confirmLabel={t('common.archive')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
};

// ─── Shared mini-components ──────────────────────────────────────────────────

export const ActionBtn: React.FC<{ children: React.ReactNode; onClick: () => void; variant?: 'view' | 'review'; danger?: boolean; disabled?: boolean }> = ({ children, onClick, variant, danger, disabled }) => (
  <button
    onClick={e => { e.stopPropagation(); onClick(); }}
    disabled={disabled}
    className={`ps-activeprotocols-action-btn${variant ? ` ps-activeprotocols-action-btn--${variant}` : ''}${danger ? ' ps-activeprotocols-action-btn--danger' : ''}`}
  >{children}</button>
);

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
  const { t } = useTranslation();
  return (
    <div className="ps-activeprotocols-group">
      <div className="ps-activeprotocols-group-header">
        <span className="ps-activeprotocols-group-label" style={categoryHueVar(category)}>● {category}</span>
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
