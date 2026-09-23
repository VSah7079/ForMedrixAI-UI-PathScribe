// src/components/Config/System/ContainerTypesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin CRUD screen for the Container Type Dictionary
// (src/services/containerTypes/mockContainerTypeService.ts). Same
// table+modal pattern as DepartmentsSection — full create/edit,
// deactivate rather than delete, not a fixed list with only the
// description editable. A site's real bench may need containers beyond
// the 9 seeded APLIS-standard defaults.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { containerTypeService, fixativeDictionaryService } from '../../../services';
import type { ContainerType, ContainerCategory } from '../../../services/containerTypes/IContainerTypeService';
import type { FixativeDictionaryEntry } from '../../../services/protocols/IPathwayMaterialDictionaryService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { prepareDuplicate } from '../../../utils/duplicateEntry';
import { findDuplicate } from '../../../utils/validateUnique';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

// Real, persisted enum values stay as data — only the display label
// each one maps to gets translated, same `XXX_LABEL_KEY` split this
// sweep already established elsewhere.
const CATEGORY_LABEL_KEY: Record<ContainerCategory, string> = {
  histology: 'containerTypesSection.categoryOptions.histology',
  cytology: 'containerTypesSection.categoryOptions.cytology',
  special_media: 'containerTypesSection.categoryOptions.special_media',
};
const CATEGORY_IDS: ContainerCategory[] = ['histology', 'cytology', 'special_media'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<ContainerType, 'id' | 'status'> & { active: boolean };

const emptyDraft: Draft = {
  name: '', description: '', category: 'histology', aplisMapping: '', systemLogicNotes: '', active: true, performingLabFacilityId: undefined,
};

interface ContainerTypeModalProps {
  mode: 'add' | 'edit';
  containerType?: ContainerType;
  existingEntries: ContainerType[];
  labs: Facility[];
  fixatives: FixativeDictionaryEntry[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ContainerTypeModal: React.FC<ContainerTypeModalProps> = ({ mode, containerType, existingEntries, labs, fixatives, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    containerType
      ? { ...containerType, active: containerType.status !== 'Inactive' }
      : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('common.required');
    // Per direct request: "Each Performing Lab will want their own
    // types. If Performing Lab not defined, it is available for
    // everyone." Uniqueness is scoped by performingLabFacilityId — a
    // real, compound check (both fields must match to be a real
    // collision), same shape as CrosswalkSection.tsx's clientId +
    // externalCode. Per direct confirmation: only checked WITHIN the
    // same lab's own scope (including "both undefined" as its own,
    // real scope) — a different lab's own type, or a global one, may
    // legitimately share the same name/mapping.
    const excludeId = mode === 'edit' ? containerType?.id : undefined;
    if (draft.name.trim()) {
      const nameCollision = findDuplicate(existingEntries, { performingLabFacilityId: draft.performingLabFacilityId, name: draft.name.trim() }, ['performingLabFacilityId', 'name'], excludeId);
      if (nameCollision) {
        e.name = draft.performingLabFacilityId
          ? t('containerTypesSection.modal.nameCollisionForLab', { name: nameCollision.name })
          : t('containerTypesSection.modal.nameCollision', { name: nameCollision.name });
      }
    }
    if (draft.aplisMapping?.trim()) {
      const mappingCollision = findDuplicate(existingEntries, { performingLabFacilityId: draft.performingLabFacilityId, aplisMapping: draft.aplisMapping.trim() }, ['performingLabFacilityId', 'aplisMapping'], excludeId);
      if (mappingCollision) {
        e.aplisMapping = draft.performingLabFacilityId
          ? t('containerTypesSection.modal.aplisMappingCollisionForLab', { mapping: mappingCollision.aplisMapping, name: mappingCollision.name })
          : t('containerTypesSection.modal.aplisMappingCollision', { mapping: mappingCollision.aplisMapping, name: mappingCollision.name });
      }
    }
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? t('containerTypesSection.modal.headerEdit', { name: containerType?.name }) : containerType ? t('containerTypesSection.modal.headerDuplicate', { name: containerType.name }) : t('containerTypesSection.modal.headerAdd')}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('containerTypesSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('containerTypesSection.modal.descriptionPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="container-category">{t('containerTypesSection.modal.categoryLabel')}</label>
            <select id="container-category" className="ps-conf-select" value={draft.category} onChange={e => set('category', e.target.value)}>
              {CATEGORY_IDS.map(id => <option key={id} value={id}>{t(CATEGORY_LABEL_KEY[id])}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.aplisMappingLabel')}</label>
            <input className={`ps-conf-input ${errors.aplisMapping ? 'ps-conf-input--error' : ''}`}
              value={draft.aplisMapping ?? ''} onChange={e => set('aplisMapping', e.target.value)} placeholder={t('containerTypesSection.modal.aplisMappingPlaceholder')} />
            {errors.aplisMapping && <span className="ps-conf-error-text">{errors.aplisMapping}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.capacityLabel')}</label>
            <input type="number" className="ps-conf-input" value={draft.capacityMl ?? ''}
              onChange={e => set('capacityMl', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder={t('containerTypesSection.modal.capacityPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="container-default-fixative">{t('containerTypesSection.modal.defaultFixativeLabel')}</label>
            <select id="container-default-fixative" className="ps-conf-select"
              value={draft.defaultFixativeId ?? ''} onChange={e => set('defaultFixativeId', e.target.value || undefined)}>
              <option value="">{t('containerTypesSection.modal.noFixativeOption')}</option>
              {fixatives.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.prefilledLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('isPrefilled', !draft.isPrefilled)} className={`ps-conf-toggle-track ${draft.isPrefilled ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className="ps-conf-toggle-label">{draft.isPrefilled ? t('containerTypesSection.modal.prefilledYes') : t('containerTypesSection.modal.prefilledNo')}</span>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="container-performing-lab">{t('containerTypesSection.modal.performingLabLabel')}</label>
            <select id="container-performing-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">{t('containerTypesSection.modal.allLabsOption')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.systemLogicNotesLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.systemLogicNotes ?? ''} onChange={e => set('systemLogicNotes', e.target.value)} placeholder={t('containerTypesSection.modal.systemLogicNotesPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('containerTypesSection.modal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('containerTypesSection.modal.addButton') : t('containerTypesSection.modal.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main ContainerTypesSection ────────────────────────────────────────────────
const ContainerTypesSection: React.FC = () => {
  const { t } = useTranslation();
  const [types,        setTypes]        = useState<ContainerType[]>([]);
  const [fixatives,    setFixatives]    = useState<FixativeDictionaryEntry[]>([]);
  const [labs,         setLabs]         = useState<Facility[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [labFilter,    setLabFilter]    = useState<'All' | 'Global' | string>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; containerType?: ContainerType } | null>(null);

  useEffect(() => {
    containerTypeService.getAll().then(res => {
      if (res.ok) setTypes(res.data);
      setLoading(false);
    });
    fixativeDictionaryService.getAll().then(res => { if (res.ok) setFixatives(res.data.filter(f => f.active)); });
    // Same real, shared query every dictionary needing lab-scoping
    // uses now — see utils/performingLabs.ts's own header for why this
    // was extracted (found already independently duplicated).
    getActivePerformingLabs().then(setLabs);
  }, []);

  const categoryLabel = (cat: ContainerCategory) => t(CATEGORY_LABEL_KEY[cat] ?? cat);
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('containerTypesSection.allLabsLabel');

  const filtered = types.filter(ct => {
    const matchSearch = !search || ct.name.toLowerCase().includes(search.toLowerCase()) || (ct.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || ct.status === statusFilter;
    const matchLab = labFilter === 'All'
      || (labFilter === 'Global' ? !ct.performingLabFacilityId : ct.performingLabFacilityId === labFilter);
    return matchSearch && matchStatus && matchLab;
  });

  const handleSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await containerTypeService.create(payload);
      if (res.ok) setTypes(prev => [...prev, res.data]);
    } else if (modal?.containerType) {
      const res = await containerTypeService.update(modal.containerType.id, payload);
      if (res.ok) setTypes(prev => prev.map(ct => ct.id === res.data.id ? res.data : ct));
    }
    setModal(null);
  };

  const handleToggleStatus = async (ct: ContainerType) => {
    const res = ct.status === 'Active' ? await containerTypeService.deactivate(ct.id) : await containerTypeService.reactivate(ct.id);
    if (res.ok) setTypes(prev => prev.map(x => x.id === ct.id ? res.data : x));
  };

  // Opens the Add modal pre-filled with an existing entry's data,
  // matching Protocol Dictionary's proven, confirmed-working pattern —
  // NOT an immediate silent save (see PS-72 for the real bug this
  // pattern replaced). mode: 'add' is what makes handleSave treat this
  // as a real create() even though containerType is populated for
  // prefill.
  const handleClone = (source: ContainerType) => {
    setModal({ mode: 'add', containerType: { ...prepareDuplicate(source, 'name'), id: '__clone__' } });
  };

  if (loading) return <div className="ps-conf-loading">{t('containerTypesSection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('containerTypesSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('containerTypesSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('containerTypesSection.addContainerType')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('containerTypesSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">{t('containerTypesSection.filters.statusAll')}</option>
          <option value="Active">{t('containerTypesSection.filters.statusActive')}</option>
          <option value="Inactive">{t('containerTypesSection.filters.statusInactive')}</option>
        </select>
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">{t('containerTypesSection.filters.labAll')}</option>
          <option value="Global">{t('containerTypesSection.filters.labGlobalOnly')}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {([
                  ['containerType', t('containerTypesSection.headers.containerType')],
                  ['category', t('containerTypesSection.headers.category')],
                  ['aplisMapping', t('containerTypesSection.headers.aplisMapping')],
                  ['performingLab', t('containerTypesSection.headers.performingLab')],
                  ['status', t('containerTypesSection.headers.status')],
                  ['actions', t('containerTypesSection.headers.actions')],
                ] as const).map(([key, label]) => (
                  <th key={key} className="ps-conf-th">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ct => (
                <tr key={ct.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{ct.name}</div>
                    {ct.description && <div className="ps-conf-identity-sub">{ct.description}</div>}
                  </td>
                  <td className="ps-conf-td">{categoryLabel(ct.category)}</td>
                  <td className="ps-conf-td">{ct.aplisMapping || t('containerTypesSection.noMapping')}</td>
                  <td className="ps-conf-td">{labName(ct.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${ct.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${ct.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{ct.status === 'Active' ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', containerType: ct })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleClone(ct)}>{t('common.duplicate')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(ct)}>
                        {ct.status === 'Active' ? t('common.deactivate') : t('common.reactivate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>{t('containerTypesSection.emptyState')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ContainerTypeModal mode={modal.mode} containerType={modal.containerType} existingEntries={types} labs={labs} fixatives={fixatives} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ContainerTypesSection;
