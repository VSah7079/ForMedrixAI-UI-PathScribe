// src/components/TemplateBuilder/TemplateListTab.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ReportTemplate } from '../../types/reportPart';
import {
  mockReportTemplateService,
  onReportTemplatesChanged,
  STANDARD_TEMPLATE_ID,
} from '../../services/reportTemplates/mockReportTemplateService';

const svc = mockReportTemplateService;

// Real, persisted ReportTemplate.status enum values stay as data; only the
// displayed label is translated (this sweep's usual LABEL_KEY pattern).
const STATUS_LABEL_KEY: Record<ReportTemplate['status'], string> = {
  published: 'templateListTab.status.published',
  draft: 'templateListTab.status.draft',
  archived: 'templateListTab.status.archived',
};

// ── Status badge ───────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ReportTemplate['status'] }> = ({ status }) => {
  const { t } = useTranslation();
  return <span className={`tmpl-badge tmpl-badge--${status}`}>{t(STATUS_LABEL_KEY[status])}</span>;
};

// ── Empty state ────────────────────────────────────────────────

const EmptyState: React.FC<{ onBlank: () => void; onStandard: () => void }> = ({ onBlank, onStandard }) => {
  const { t } = useTranslation();
  return (
    <div className="tmpl-empty">
      <div className="tmpl-empty__icon">⊞</div>
      <div className="tmpl-empty__title">{t('templateListTab.emptyState.title')}</div>
      <div className="tmpl-empty__desc">
        {t('templateListTab.emptyState.description')}
      </div>
      <div className="tmpl-empty__actions">
        <button onClick={onStandard} className="ps-btn-ghost-teal">{t('templateListTab.useStandardTemplateButton')}</button>
        <button onClick={onBlank}    className="ps-btn-ghost-teal">{t('templateListTab.startBlankButton')}</button>
      </div>
    </div>
  );
};

// ── Template row ───────────────────────────────────────────────

const TemplateRow: React.FC<{
  template:      ReportTemplate;
  onEdit:        () => void;
  onDuplicate:   () => void;
  onDelete:      () => void;
  isDeleting:    boolean;
  isDuplicating: boolean;
}> = ({ template, onEdit, onDuplicate, onDelete, isDeleting, isDuplicating }) => {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isStandard = template.id === STANDARD_TEMPLATE_ID;
  const isDraft = template.status === 'draft';

  const nodeCount = countNodes(template);
  const updatedAt = new Date(template.updatedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div
      onMouseLeave={() => setConfirmDelete(false)}
      className="tmpl-row"
    >
      {/* Icon */}
      <div className={`tmpl-row-icon${isStandard ? ' tmpl-row-icon--standard' : ''}`}>
        ⊞
      </div>

      {/* Name + meta */}
      <div className="tmpl-row-info">
        <div className="tmpl-row-title-row">
          <span className="tmpl-row-name">
            {template.name}
          </span>
          <StatusBadge status={template.status} />
          {template.orchestrationEnabled && <span className="tmpl-badge tmpl-badge--ai">{t('templateListTab.aiBadge')}</span>}
          {isStandard && <span className="tmpl-badge tmpl-badge--standard">{t('templateListTab.standardBadge')}</span>}
        </div>
        <div className="tmpl-row-meta">
          {template.specialty && (
            <span>{template.specialty}{template.subspecialty ? ` — ${template.subspecialty}` : ''}</span>
          )}
          {template.standard && <span>{template.standard}</span>}
          <span>{t('templateListTab.activeSlots', { count: nodeCount })}</span>
          <span>{t('templateListTab.updatedAt', { time: updatedAt })}</span>
        </div>
      </div>

      {/* Actions — shown via CSS :hover on .tmpl-row */}
      <div className="tmpl-row-actions">
          {!isStandard && (
            <button onClick={onEdit} className="tmpl-row-btn tmpl-row-btn--edit">{t('common.edit')}</button>
          )}
          <button onClick={onDuplicate} disabled={isDuplicating} className="tmpl-row-btn">
            {isDuplicating ? '…' : t('common.duplicate')}
          </button>
          {!isStandard && (
            confirmDelete ? (
              <>
                <span className="tmpl-delete-confirm-label">{isDraft ? t('templateListTab.confirmDeleteLabel') : t('templateListTab.confirmArchiveLabel')}</span>
                <button onClick={onDelete} disabled={isDeleting} className="tmpl-row-btn tmpl-row-btn--confirm-delete">
                  {isDeleting ? '…' : t('common.yes')}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="tmpl-row-btn">{t('common.no')}</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="tmpl-row-btn tmpl-row-btn--delete">
                {isDraft ? t('common.delete') : t('common.archive')}
              </button>
            )
          )}
        </div>
    </div>
  );
};

// ── Main tab ───────────────────────────────────────────────────

const TemplateListTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates]           = useState<ReportTemplate[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [filter, setFilter]                 = useState<'all' | ReportTemplate['status']>('all');
  const [search, setSearch]                 = useState('');
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await svc.getAll();
      if (result.ok) setTemplates(result.data);
      else if (result.ok === false) setError(result.error);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? t('templateListTab.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    return onReportTemplatesChanged(load);
  }, [load]);

  const handleCreate = async (fromStandardId?: string) => {
    if (fromStandardId) {
      // Stored as the new template's name, so it comes from the user's language.
      const result = await svc.clone(fromStandardId, t('templateListTab.defaultCustomTemplateName'));
      if (result.ok) navigate(`/admin/templates/${result.data.id}/edit`);
      else if (result.ok === false) setError(result.error);
    } else {
      navigate('/admin/templates/new');
    }
  };

  // The copy's name is marked in the user's own language (PS-73).
  const handleDuplicate = async (tpl: ReportTemplate) => {
    const id = tpl.id;
    setDuplicatingId(id);
    try {
      const result = await svc.clone(id, t('common.copyOfName', { name: tpl.name }));
      if (result.ok) navigate(`/admin/templates/${result.data.id}/edit`);
      else if (result.ok === false) setError(result.error);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? t('templateListTab.errors.duplicateFailed'));
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const target = templates.find(tpl => tpl.id === id);
      // Only a template that's still a pure Draft could never have produced
      // a real generated report — safe to hard-delete. Anything that has
      // ever been Published must be archived instead, so its structure
      // remains inspectable for as long as a report generated from it exists.
      const result = target?.status === 'draft'
        ? await svc.remove(id)
        : await svc.archive(id);
      if (result.ok === false) setError(result.error);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? t('templateListTab.errors.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = templates
    .filter(tpl => filter === 'all' || tpl.status === filter)
    .filter(tpl => !search ||
      tpl.name.toLowerCase().includes(search.toLowerCase()) ||
      (tpl.specialty ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const counts = {
    all:       templates.length,
    published: templates.filter(tpl => tpl.status === 'published').length,
    draft:     templates.filter(tpl => tpl.status === 'draft').length,
    archived:  templates.filter(tpl => tpl.status === 'archived').length,
  };

  return (
    <div className="tmpl-list-root">

      {/* Header */}
      <div className="tmpl-list-header">
        <div>
          <h2 className="tmpl-list-title">{t('templateListTab.title')}</h2>
          <p className="tmpl-list-subtitle">
            {t('templateListTab.subtitle')}
          </p>
        </div>
        <div className="tmpl-header-actions">
          <button
            onClick={() => handleCreate(STANDARD_TEMPLATE_ID)}
            className="ps-conf-btn-secondary"
            title={t('templateListTab.fromStandardTooltip')}
          >
            {t('templateListTab.fromStandardButton')}
          </button>
          <button onClick={() => handleCreate()} className="ps-conf-btn-primary">
            + {t('templateListTab.newTemplateButton')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="tmpl-error">
          {error}
          <button onClick={() => setError(null)}
className="tmpl-error-dismiss">✕</button>
        </div>
      )}

      {/* Filter + search */}
      {!loading && templates.length > 0 && (
        <div className="tmpl-filter-row">
          <div className="tmpl-filter-bar">
            {(['all', 'published', 'draft', 'archived'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`tmpl-filter-btn${filter === f ? ' active' : ''}`}>
                {f === 'all' ? t('templateListTab.filterAll') : t(STATUS_LABEL_KEY[f])}{counts[f] > 0 && <span className="tmpl-filter-count"> ({counts[f]})</span>}
              </button>
            ))}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('templateListTab.searchPlaceholder')}
            className="tmpl-search"
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="tmpl-loading">{t('templateListTab.loadingTemplates')}
        </div>
      ) : filtered.length === 0 && templates.length === 0 ? (
        <EmptyState
          onBlank={() => handleCreate()}
          onStandard={() => handleCreate(STANDARD_TEMPLATE_ID)}
        />
      ) : filtered.length === 0 ? (
        <div className="tmpl-loading">{t('templateListTab.noSearchMatch')}
        </div>
      ) : (
        <div className="tmpl-list-body">
          {filtered.map(tpl => (
            <TemplateRow
              key={tpl.id}
              template={tpl}
              onEdit={() => navigate(`/admin/templates/${tpl.id}/edit`)}
              onDuplicate={() => handleDuplicate(tpl)}
              onDelete={() => handleDelete(tpl.id)}
              isDeleting={deletingId === tpl.id}
              isDuplicating={duplicatingId === tpl.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplateListTab;

// ── Helpers ────────────────────────────────────────────────────

function countNodes(template: ReportTemplate): number {
  return template.assembly?.filter(s => s.enabled).length ?? 0;
}

