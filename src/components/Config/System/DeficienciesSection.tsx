// src/components/Config/System/DeficienciesSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin config for the Specimen/Requisition Deficiency pattern —
// Deficiency Types and Resolution Types are one section with tabs, not
// two sidebar entries, because Resolution Type has no independent use
// anywhere else in the app (unlike e.g. Department, which Facility/
// TAT/Routing all reference on their own — that pairing gets separate
// sidebar entries; this one doesn't need to).
//
// Built with CSS classes (pathscribe.css), not inline style objects —
// deliberately not following PhysiciansSection.tsx/Departments
// Section.tsx's older inline-style-constant convention, since
// modalStyles.ts (which those lean on) is itself marked deprecated in
// favor of the .ps-ms-* classes used here.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import {
  deficiencyTypeService, resolutionTypeService,
} from '../../../services';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { findDuplicate } from '../../../utils/validateUnique';

// ─── Shared type-dictionary tab (Deficiency Types / Resolution Types) ────────

interface TypeDictItem { id: string; name: string; description?: string; status: 'Active' | 'Inactive'; level?: 'case' | 'specimen' | 'both'; performingLabFacilityId?: string }
interface TypeDictService {
  getAll(): Promise<{ ok: boolean; data?: TypeDictItem[] }>;
  add(item: { name: string; description?: string; status: 'Active' | 'Inactive'; level?: 'case' | 'specimen' | 'both'; performingLabFacilityId?: string }): Promise<{ ok: boolean; data?: TypeDictItem }>;
  update(id: string, changes: Partial<{ name: string; description?: string; status: 'Active' | 'Inactive'; level: 'case' | 'specimen' | 'both'; performingLabFacilityId?: string }>): Promise<{ ok: boolean; data?: TypeDictItem }>;
  deactivate(id: string): Promise<{ ok: boolean; data?: TypeDictItem }>;
  reactivate(id: string): Promise<{ ok: boolean; data?: TypeDictItem }>;
}

/** showLevel: only true for the Deficiency Types tab — Resolution
 *  Types has no equivalent concept (a resolution describes how
 *  something got fixed, not what kind of thing it is or where it
 *  applies), so this stays entirely absent from that tab's table and
 *  form rather than showing an irrelevant field.
 *
 *  tabKey replaces the old noun/addLabel string props — every sentence
 *  in this component is a fully-authored, per-locale lookup under
 *  `deficienciesSection.${tabKey}.*` rather than an English template
 *  with `.toLowerCase()`/concatenation, which doesn't translate safely
 *  (German capitalizes nouns mid-sentence, so a translated noun's
 *  lowercase form isn't `translatedNoun.toLowerCase()`). */
const TypeDictionaryTab: React.FC<{ service: TypeDictService; tabKey: 'deficiencyType' | 'resolutionType'; showLevel?: boolean }> = ({ service, tabKey, showLevel }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<TypeDictItem[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [labFilter, setLabFilter] = useState<'All' | 'Global' | string>('All');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: TypeDictItem } | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; active: boolean; level: 'case' | 'specimen' | 'both'; performingLabFacilityId: string }>({ name: '', description: '', active: true, level: 'both', performingLabFacilityId: '' });
  const [nameError, setNameError] = useState('');

  const load = () => { service.getAll().then(res => { if (res.ok && res.data) setItems(res.data); setLoading(false); }); };
  useEffect(load, [service]);
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  useEffect(() => {
    if (modal?.mode === 'edit' && modal.item) {
      setDraft({ name: modal.item.name, description: modal.item.description ?? '', active: modal.item.status === 'Active', level: modal.item.level ?? 'both', performingLabFacilityId: modal.item.performingLabFacilityId ?? '' });
    } else if (modal?.mode === 'add') {
      setDraft({ name: '', description: '', active: true, level: 'both', performingLabFacilityId: '' });
    }
    setNameError('');
  }, [modal]);

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('deficienciesSection.global');

  const filteredItems = items.filter(item =>
    labFilter === 'All' || (labFilter === 'Global' ? !item.performingLabFacilityId : item.performingLabFacilityId === labFilter)
  );

  const handleSave = async () => {
    if (!draft.name.trim()) { setNameError(t('common.required')); return; }
    // Real, same shape as ContainerType/DelegationType's own uniqueness
    // check: only a real collision WITHIN the same scope (same lab, or
    // both Global) blocks the save — a different lab's own type, or a
    // Global one, may legitimately share the same name.
    const excludeId = modal?.mode === 'edit' ? modal.item?.id : undefined;
    const collision = findDuplicate(items, { performingLabFacilityId: draft.performingLabFacilityId || undefined, name: draft.name.trim() }, ['performingLabFacilityId', 'name'], excludeId);
    if (collision) {
      // Two full, separately-translated sentences rather than splicing a
      // translated fragment onto a translated stem — this message never
      // mentions the noun (Deficiency Type / Resolution Type), so it's a
      // shared, tabKey-independent key pair.
      setNameError(
        draft.performingLabFacilityId
          ? t('deficienciesSection.duplicateErrorForLab', { name: collision.name })
          : t('deficienciesSection.duplicateErrorGlobal', { name: collision.name })
      );
      return;
    }

    const payload = {
      name: draft.name.trim(), description: draft.description.trim() || undefined,
      status: (draft.active ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
      performingLabFacilityId: draft.performingLabFacilityId || undefined,
      ...(showLevel ? { level: draft.level } : {}),
    };
    if (modal?.mode === 'add') {
      const res = await service.add(payload);
      if (res.ok && res.data) setItems(prev => [...prev, res.data!]);
    } else if (modal?.item) {
      const res = await service.update(modal.item.id, payload);
      if (res.ok && res.data) setItems(prev => prev.map(i => i.id === res.data!.id ? res.data! : i));
    }
    setModal(null);
  };

  const handleToggleActive = async (item: TypeDictItem) => {
    const res = item.status === 'Active' ? await service.deactivate(item.id) : await service.reactivate(item.id);
    if (res.ok && res.data) setItems(prev => prev.map(i => i.id === item.id ? res.data! : i));
  };

  if (loading) return <div className="ps-defic-loading">{t(`deficienciesSection.${tabKey}.loading`)}</div>;

  return (
    <div>
      <div className="ps-defic-tab-header">
        <p className="ps-defic-tab-desc">{t(`deficienciesSection.${tabKey}.tabDesc`)}</p>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ {t(`deficienciesSection.${tabKey}.addLabel`)}</button>
      </div>

      {labs.length > 0 && (
        <div className="ps-conf-form-row">
          <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
            <option value="All">{t('deficienciesSection.labFilter.allLabs')}</option>
            <option value="Global">{t('deficienciesSection.labFilter.globalOnly')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="ps-defic-table-wrap">
        <table className="ps-defic-table">
          <thead>
            <tr>
              <th>{t(`deficienciesSection.${tabKey}.columnHeader`)}</th>
              <th>{t('deficienciesSection.table.headers.description')}</th>
              {showLevel && <th>{t('deficienciesSection.table.headers.level')}</th>}
              {labs.length > 0 && <th>{t('deficienciesSection.table.headers.performingLab')}</th>}
              <th>{t('deficienciesSection.table.headers.status')}</th>
              <th>{t('deficienciesSection.table.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id}>
                <td className="ps-defic-cell-name">{item.name}</td>
                <td className="ps-defic-cell-desc">{item.description || '—'}</td>
                {showLevel && (
                  <td>
                    {item.level === 'case' ? t('deficienciesSection.levelLabels.case') : item.level === 'specimen' ? t('deficienciesSection.levelLabels.specimen') : t('deficienciesSection.levelLabels.both')}
                  </td>
                )}
                {labs.length > 0 && <td>{labName(item.performingLabFacilityId)}</td>}
                <td>
                  <span className={`ps-defic-status-badge ${item.status === 'Active' ? 'ps-defic-status-badge--active' : 'ps-defic-status-badge--inactive'}`}>
                    {item.status === 'Active' ? t('common.active') : t('common.inactive')}
                  </span>
                </td>
                <td>
                  <div className="ps-defic-row-actions">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', item })}>{t('common.edit')}</button>
                    <button className="ps-conf-btn-row" onClick={() => handleToggleActive(item)}>
                      {item.status === 'Active' ? t('common.deactivate') : t('deficienciesSection.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr><td colSpan={(showLevel ? 1 : 0) + (labs.length > 0 ? 1 : 0) + 4} className="ps-defic-empty">{t(`deficienciesSection.${tabKey}.emptyState`)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="ps-ms-overlay" onClick={() => setModal(null)}>
          <div className="ps-ms-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ms-header">{modal.mode === 'add' ? t(`deficienciesSection.${tabKey}.addLabel`) : t(`deficienciesSection.${tabKey}.editTitle`)}</div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">{t('deficienciesSection.modal.nameLabel')}</label>
              <input className="ps-ms-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder={t('deficienciesSection.modal.namePlaceholder')} />
              {nameError && <span className="ps-conf-error-text">{nameError}</span>}
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">{t('deficienciesSection.modal.descriptionLabel')}</label>
              <textarea className="ps-ms-textarea" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder={t('deficienciesSection.modal.descriptionPlaceholder')} />
            </div>
            {showLevel && (
              <div className="ps-ms-field-group">
                <label className="ps-ms-label">{t('deficienciesSection.modal.levelLabel')}</label>
                <select className="ps-ms-select" value={draft.level} onChange={e => setDraft(d => ({ ...d, level: e.target.value as 'case' | 'specimen' | 'both' }))}>
                  <option value="specimen">{t('deficienciesSection.modal.levelOptions.specimen')}</option>
                  <option value="case">{t('deficienciesSection.modal.levelOptions.case')}</option>
                  <option value="both">{t('deficienciesSection.modal.levelOptions.both')}</option>
                </select>
              </div>
            )}
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">{t('deficienciesSection.modal.performingLabLabel')}</label>
              <select className="ps-ms-select" value={draft.performingLabFacilityId} onChange={e => setDraft(d => ({ ...d, performingLabFacilityId: e.target.value }))}>
                <option value="">{t('deficienciesSection.modal.globalOption')}</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">{t('deficienciesSection.modal.statusLabel')}</label>
              <select className="ps-ms-select" value={draft.active ? 'active' : 'inactive'} onChange={e => setDraft(d => ({ ...d, active: e.target.value === 'active' }))}>
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
              </select>
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setModal(null)}>{t('common.cancel')}</button>
              <button className="ps-ms-btn-apply" onClick={handleSave}>{modal.mode === 'add' ? t('deficienciesSection.modal.addButton') : t('deficienciesSection.modal.saveChangesButton')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// The Deficiency Log tab that used to live here has been removed —
// superseded by the dedicated Deficiencies page (src/pages/
// QualityAssurancePage.tsx, reachable from Home), which does everything
// this tab did (view the log) plus what it never could (actually
// resolve an open item). Config now only holds the two things that
// genuinely belong here: the Deficiency Type and Resolution Type
// dictionaries — vocabulary configuration, not operational data. A
// list of actual deficiency records doesn't belong in Config any more
// than a list of actual cases would.

// ─── Main section ─────────────────────────────────────────────────────────

type DeficienciesTab = 'types' | 'resolutions';

const DeficienciesSection: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DeficienciesTab>('types');

  return (
    <div className="ps-defic-section">
      <h3 className="ps-defic-title">{t('deficienciesSection.title')}</h3>
      <p className="ps-defic-subtitle">{t('deficienciesSection.subtitle')}</p>

      <div className="ps-tab-bar ps-defic-tabs">
        <button className={`ps-tab-btn ${tab === 'types' ? 'active' : ''}`} onClick={() => setTab('types')}>{t('deficienciesSection.tabs.deficiencyTypes')}</button>
        <button className={`ps-tab-btn ${tab === 'resolutions' ? 'active' : ''}`} onClick={() => setTab('resolutions')}>{t('deficienciesSection.tabs.resolutionTypes')}</button>
      </div>

      {tab === 'types' && <TypeDictionaryTab service={deficiencyTypeService} tabKey="deficiencyType" showLevel />}
      {tab === 'resolutions' && <TypeDictionaryTab service={resolutionTypeService} tabKey="resolutionType" />}
    </div>
  );
};

export default DeficienciesSection;
