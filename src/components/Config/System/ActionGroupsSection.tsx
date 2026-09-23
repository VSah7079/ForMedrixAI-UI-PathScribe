// src/components/Config/System/ActionGroupsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin CRUD screen for ActionGroup (services/actionGroups/) — real, per
// PS-289's own comment thread. A real, named, reusable bundle of
// SystemAction ids. Same table+modal pattern as ContainerTypesSection/
// ReagentLotsSection.
//
// i18n sweep (batch 52): real, admin-entered data (action group name,
// the resolved actionLabel() display, and the modal's edit-title
// interpolated group name) stays as typed/stored — only page chrome
// is translated. `g.status`/`draft.active` remain the real, internal
// 'Active' | 'Inactive' values used for logic; only their on-screen
// text now resolves through `common.active`/`common.inactive`.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { actionGroupService } from '../../../services';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import type { ActionGroup } from '../../../services/actionGroups/IActionGroupService';
import type { SystemAction } from '../../../services/actionRegistry/IActionRegistryService';

type Draft = Omit<ActionGroup, 'id' | 'createdAt' | 'createdBy' | 'status'> & { active: boolean };
const emptyDraft: Draft = { name: '', actionIds: [], active: true };

interface ActionGroupModalProps {
  mode: 'add' | 'edit';
  actionGroup?: ActionGroup;
  allActions: SystemAction[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ActionGroupModal: React.FC<ActionGroupModalProps> = ({ mode, actionGroup, allActions, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(actionGroup ? { ...actionGroup, active: actionGroup.status !== 'Inactive' } : emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [search, setSearch] = useState('');

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const handleSave = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('actionGroupsSection.errors.required');
    if (draft.actionIds.length === 0) e.actionIds = t('actionGroupsSection.errors.selectAtLeastOne');
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  const filteredActions = allActions.filter(a =>
    !search || a.label?.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'edit' ? t('actionGroupsSection.modal.editTitle', { name: actionGroup?.name }) : t('actionGroupsSection.modal.addTitle')}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('actionGroupsSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('actionGroupsSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('actionGroupsSection.modal.actionsLabel')} <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input ps-mb-8" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('actionGroupsSection.modal.actionsSearchPlaceholder')} />
            <div className="ps-batch-reagent-lot-list ps-actiongroups__action-list">
              {filteredActions.map(a => {
                const checked = draft.actionIds.includes(a.id);
                return (
                  <label key={a.id} className="ps-batch-reagent-lot-row">
                    <input type="checkbox" checked={checked}
                      onChange={() => set('actionIds', checked ? draft.actionIds.filter(id => id !== a.id) : [...draft.actionIds, a.id])} />
                    {a.label ?? a.id} <span className="ps-actiongroups__action-category">({a.category})</span>
                  </label>
                );
              })}
              {filteredActions.length === 0 && <div className="ps-conf-error-text ps-actiongroups__no-actions">{t('actionGroupsSection.modal.noActionsMatch')}</div>}
            </div>
            {errors.actionIds && <span className="ps-conf-error-text">{errors.actionIds}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('common.active')}</label>
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? t('actionGroupsSection.modal.addBtn') : t('actionGroupsSection.modal.saveChangesBtn')}</button>
        </div>
      </div>
    </div>
  );
};

const ActionGroupsSection: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<ActionGroup[]>([]);
  const [allActions, setAllActions] = useState<SystemAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; actionGroup?: ActionGroup } | null>(null);

  useEffect(() => {
    actionGroupService.getAll().then(res => { if (res.ok) setGroups(res.data); setLoading(false); });
    setAllActions(mockActionRegistryService.getActions());
  }, []);

  const filtered = groups.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()));

  const actionLabel = (id: string) => allActions.find(a => a.id === id)?.label ?? id;

  const handleSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await actionGroupService.create({ ...payload, createdBy: 'current-user' });
      if (res.ok) setGroups(prev => [...prev, res.data]);
    } else if (modal?.actionGroup) {
      const res = await actionGroupService.update(modal.actionGroup.id, payload);
      if (res.ok) setGroups(prev => prev.map(g => g.id === res.data.id ? res.data : g));
    }
    setModal(null);
  };

  const handleToggleStatus = async (g: ActionGroup) => {
    const res = g.status === 'Active' ? await actionGroupService.deactivate(g.id) : await actionGroupService.reactivate(g.id);
    if (res.ok) setGroups(prev => prev.map(x => x.id === g.id ? res.data : x));
  };

  if (loading) return <div className="ps-conf-loading">{t('actionGroupsSection.loading')}</div>;

  const tableHeaders = [
    t('actionGroupsSection.table.name'),
    t('actionGroupsSection.table.actions'),
    t('actionGroupsSection.table.status'),
    t('actionGroupsSection.table.actions'),
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('actionGroupsSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('actionGroupsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('actionGroupsSection.addBtn')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('actionGroupsSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{tableHeaders.map((h, i) => <th key={i} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} className="ps-conf-tr">
                  <td className="ps-conf-td"><div className="ps-conf-identity-name">{g.name}</div></td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-sub">{g.actionIds.slice(0, 3).map(actionLabel).join(', ')}{g.actionIds.length > 3 ? ` ${t('actionGroupsSection.moreActions', { count: g.actionIds.length - 3 })}` : ''}</div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${g.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${g.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{g.status === 'Active' ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', actionGroup: g })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(g)}>{g.status === 'Active' ? t('common.deactivate') : t('common.reactivate')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={4}>{t('actionGroupsSection.emptyRow')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ActionGroupModal mode={modal.mode} actionGroup={modal.actionGroup} allActions={allActions} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ActionGroupsSection;
