// src/components/TemplateBuilder/PartLibraryTab.tsx
// Config tab — browse, create, edit and duplicate Report Parts.

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { ReportPart, ReportPartType } from '../../types/reportPart';
import { mockReportPartService, onReportPartsChanged } from '../../services/reportParts/mockReportPartService';
import { getActivePerformingLabs } from '../../utils/performingLabs';
import type { Facility } from '../../services/facilities/IFacilityService';

const svc = mockReportPartService;

// ── Type config (icons only — colours handled via CSS modifier classes) ──

const TYPE_CONFIG: Record<ReportPartType, { icon: string }> = {
  header: { icon: '▲' },
  footer: { icon: '▼' },
  body:   { icon: '▬' },
};

// Real, persisted ReportPartType enum values stay as data; only the
// displayed label is translated (this sweep's usual LABEL_KEY pattern).
// Kept as this file's own singular/plural keys rather than reusing
// PartBuilderPage.tsx's differently-worded "Header Part"/"Footer Part"/
// "Body Part" labels, which serve a different per-instance-type context.
const TYPE_LABEL_KEY: Record<ReportPartType, string> = {
  header: 'partLibraryTab.type.header',
  footer: 'partLibraryTab.type.footer',
  body:   'partLibraryTab.type.body',
};

// Real fix: the original code built the plural via `${label}s`, which
// produced "Bodys" for the body group's plural heading — a genuine
// English grammar bug, not just an i18n gap. Each plural form now has
// its own real, correct translation instead of a suffix rule.
const TYPE_LABEL_PLURAL_KEY: Record<ReportPartType, string> = {
  header: 'partLibraryTab.typePlural.header',
  footer: 'partLibraryTab.typePlural.footer',
  body:   'partLibraryTab.typePlural.body',
};

const EMPTY_GROUP_KEY: Record<ReportPartType, string> = {
  header: 'partLibraryTab.emptyGroup.header',
  footer: 'partLibraryTab.emptyGroup.footer',
  body:   'partLibraryTab.emptyGroup.body',
};

// ReportPartStatus ('draft'/'published'/'archived') is the same real,
// persisted enum as ReportTemplate['status'] (batch 147's TemplateListTab.tsx)
// with identical wording, so this reuses those exact keys rather than
// duplicating the translation content.
const STATUS_LABEL_KEY: Record<ReportPart['status'], string> = {
  published: 'templateListTab.status.published',
  draft: 'templateListTab.status.draft',
  archived: 'templateListTab.status.archived',
};

// ── Protected built-in part IDs ───────────────────────────────────────────────

const PROTECTED = new Set([
  'std_header_page1', 'std_header_p2plus', 'std_footer_page1', 'std_footer_p2plus',
  'std_body_demographics', 'std_body_clinical', 'std_body_specimens', 'std_body_diagnosis',
  'std_body_synoptic', 'std_body_gross', 'std_body_microscopic', 'std_body_ancillary',
  'std_body_comment', 'std_body_signoff',
]);

// ── Part Card ─────────────────────────────────────────────────────────────────

const PartCard: React.FC<{
  part:          ReportPart;
  labName:       string;
  onEdit:        () => void;
  onDuplicate:   () => void;
  onArchive:     () => void;
  isProtected:   boolean;
  isDuplicating: boolean;
}> = ({ part, labName, onEdit, onDuplicate, onArchive, isProtected, isDuplicating }) => {
  const { t } = useTranslation();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const tc = TYPE_CONFIG[part.partType];

  return (
    <div
      className={`ps-plib-card${confirmArchive ? ' confirm-active' : ''}`}
      onMouseLeave={() => setConfirmArchive(false)}
    >
      {/* Type icon */}
      <div className={`ps-plib-card__icon ps-plib-card__icon--${part.partType}`}>
        {tc.icon}
      </div>

      {/* Info */}
      <div className="ps-plib-card__info">
        <div className="ps-plib-card__name-row">
          <span className="ps-plib-card__name">{part.name}</span>
          <span className={`ps-plib-card__badge ps-plib-card__badge--${part.status}`}>
            {t(STATUS_LABEL_KEY[part.status])}
          </span>
          {isProtected && (
            <span className="ps-plib-card__badge ps-plib-card__badge--builtin">{t('casePoolAssignmentSection.rulesTable.builtInBadge')}</span>
          )}
          <span className="ps-plib-card__badge ps-plib-card__badge--lab">{labName}</span>
        </div>
        <div className="ps-plib-card__desc">
          {t(TYPE_LABEL_KEY[part.partType])} · {part.specialty}{part.subspecialty ? ` — ${part.subspecialty}` : ''}
          {part.description && ` · ${part.description}`}
        </div>
      </div>

      {/* Actions — shown on :hover or when confirm-active via CSS */}
      <div className="ps-plib-card__actions">
        {!isProtected && (
          <button onClick={onEdit} className="ps-plib-card__btn ps-plib-card__btn--primary">
            {t('common.edit')}
          </button>
        )}
        <button
          onClick={onDuplicate}
          disabled={isDuplicating}
          className="ps-plib-card__btn ps-plib-card__btn--secondary"
        >
          {isDuplicating ? t('partLibraryTab.duplicatingLabel') : t('common.duplicate')}
        </button>
        {!isProtected && (
          confirmArchive ? (
            <>
              <span className="ps-plib-card__confirm-text">{t('templateListTab.confirmArchiveLabel')}</span>
              <button onClick={onArchive}                    className="ps-plib-card__btn ps-plib-card__btn--danger">{t('common.yes')}</button>
              <button onClick={() => setConfirmArchive(false)} className="ps-plib-card__btn ps-plib-card__btn--cancel">{t('common.no')}</button>
            </>
          ) : (
            <button onClick={() => setConfirmArchive(true)} className="ps-plib-card__btn ps-plib-card__btn--cancel">
              {t('common.archive')}
            </button>
          )
        )}
      </div>
    </div>
  );
};

// ── Main tab ──────────────────────────────────────────────────────────────────

const PartLibraryTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [parts,      setParts]      = useState<ReportPart[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ReportPartType | 'all'>('all');
  const [search,     setSearch]     = useState('');
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [labFilter, setLabFilter] = useState<'all' | 'global' | string>('all');

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('abnormalTriggerRulesSection.global');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await svc.getAll();
    if (r.ok) setParts(r.data.filter((p: any) => p.status !== 'archived'));
    else if (r.ok === false) setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); return onReportPartsChanged(load); }, [load]);

  // The copy's name is marked in the user's own language (PS-73).
  const handleDuplicate = async (part: ReportPart) => {
    const id = part.id;
    setDuplicating(id);
    const r = await svc.clone(id, t('common.copyOfName', { name: part.name }));
    if (r.ok) navigate(`/admin/parts/${r.data.id}/edit`);
    else if (r.ok === false) setError(r.error);
    setDuplicating(null);
  };

  const handleArchive = async (id: string) => {
    const r = await svc.archive(id);
    if (r.ok === false) setError(r.error);
  };

  const filtered = parts
    .filter(p => typeFilter === 'all' || p.partType === typeFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => labFilter === 'all' || (labFilter === 'global' ? !p.performingLabFacilityId : p.performingLabFacilityId === labFilter));

  const grouped: Record<ReportPartType, ReportPart[]> = {
    header: filtered.filter(p => p.partType === 'header'),
    body:   filtered.filter(p => p.partType === 'body'),
    footer: filtered.filter(p => p.partType === 'footer'),
  };

  return (
    <div className="ps-plib">

      {/* Header */}
      <div className="ps-plib__header">
        <div>
          <h2 className="ps-plib__title">{t('templateAssemblyPage.partLibraryTitle')}</h2>
          <p className="ps-plib__subtitle">
            {t('partLibraryTab.subtitle')}
          </p>
        </div>
        <button
          className="ps-conf-btn-primary"
          onClick={() => navigate('/admin/parts/new')}
        >
          + {t('partLibraryTab.newPartButton')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="ps-plib__error">
          {error}
          <button className="ps-plib__error-dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="ps-plib__filters">
        <div className="ps-plib__filter-group">
          {(['all', 'header', 'body', 'footer'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`ps-plib__filter-btn${typeFilter === f ? ' active' : ''}`}
            >
              {f === 'all' ? t('partLibraryTab.filterAll') : `${TYPE_CONFIG[f].icon} ${t(TYPE_LABEL_PLURAL_KEY[f])}`}
            </button>
          ))}
        </div>
        <input
          className="ps-plib__search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('templateAssemblyPage.searchPartsPlaceholder')}
        />
        {labs.length > 0 && (
          <select className="ps-conf-select" value={labFilter} onChange={e => setLabFilter(e.target.value as any)}>
            <option value="all">{t('abnormalTriggerRulesSection.labFilter.all')}</option>
            <option value="global">{t('abnormalTriggerRulesSection.labFilter.globalOnly')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="ps-plib__loading">{t('partLibraryTab.loadingParts')}</div>
      ) : (
        (['header', 'body', 'footer'] as ReportPartType[]).map(type => {
          if (typeFilter !== 'all' && typeFilter !== type) return null;
          const group = grouped[type];
          const tc    = TYPE_CONFIG[type];

          return (
            <div key={type}>
              <div className={`ps-plib__group-header ps-plib__group-header--${type}`}>
                <span className={`ps-plib__group-icon ps-plib__group-icon--${type}`}>
                  {tc.icon}
                </span>
                <span className={`ps-plib__group-label ps-plib__group-label--${type}`}>
                  {t(TYPE_LABEL_PLURAL_KEY[type])}
                </span>
                <span className="ps-plib__group-count">{group.length}</span>
              </div>

              {group.length === 0 ? (
                <div className="ps-plib__empty">
                  {t(EMPTY_GROUP_KEY[type])}
                </div>
              ) : (
                group.map(p => (
                  <PartCard
                    key={p.id}
                    part={p}
                    labName={labName(p.performingLabFacilityId)}
                    isProtected={PROTECTED.has(p.id)}
                    isDuplicating={duplicating === p.id}
                    onEdit={() => navigate(`/admin/parts/${p.id}/edit`)}
                    onDuplicate={() => handleDuplicate(p)}
                    onArchive={() => handleArchive(p.id)}
                  />
                ))
              )}
            </div>
          );
        })
      )}

    </div>
  );
};

export default PartLibraryTab;
