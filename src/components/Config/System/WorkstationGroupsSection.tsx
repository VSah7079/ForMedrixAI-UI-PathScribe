// src/components/Config/System/WorkstationGroupsSection.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { workstationGroupService, actionGroupService } from '../../../services';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import type { WorkstationGroup, WorkstationDiscipline, QcEnforcementMode } from '../../../services/workstationGroups/IWorkstationGroupService';
import { WORKSTATION_DISCIPLINES, FUNCTIONAL_AREAS_BY_DISCIPLINE } from '../../../services/workstationGroups/IWorkstationGroupService';
import type { ActionGroup } from '../../../services/actionGroups/IActionGroupService';
import type { SystemAction } from '../../../services/actionRegistry/IActionRegistryService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

const QC_MODE_OPTIONS: QcEnforcementMode[] = ['Enforced', 'Auto-Resolve', 'Hybrid'];

// Real, persisted enum values ('Enforced' | 'Auto-Resolve' | 'Hybrid') stay
// as the option value/stored data; only the on-screen label is translated —
// same `{ value, labelKey }` split StainDictionarySection.tsx (batch 60)
// already established for this exact QcEnforcementMode type.
const QC_MODE_LABEL_KEY: Record<QcEnforcementMode, string> = {
  'Enforced': 'workstationGroupsSection.modal.qcModes.enforced',
  'Auto-Resolve': 'workstationGroupsSection.modal.qcModes.autoResolve',
  'Hybrid': 'workstationGroupsSection.modal.qcModes.hybrid',
};

// WORKSTATION_DISCIPLINES ('HISTOLOGY'/'CYTOLOGY'/'MOLECULAR'/'AUTOPSY')
// and the functional-area values in FUNCTIONAL_AREAS_BY_DISCIPLINE stay
// untranslated on screen — real schema/data-key identifiers, not display
// copy. This is the same real vocabulary ScanStationsSection.tsx's own
// SCAN_STATION_WORKFLOW_STAGES already left untranslated (batch 79):
// this file's own header comment says Histology "reuses [that] vocabulary
// verbatim," so it's the identical real data, not a second, independent
// piece of UI text.

type Draft = Omit<WorkstationGroup, 'id' | 'createdAt' | 'createdBy' | 'status'> & { active: boolean };
const emptyDraft: Draft = {
  name: '', discipline: 'HISTOLOGY', functionalArea: '', performingLabFacilityId: '',
  qcEnforcementMode: undefined, defaultActionGroupId: undefined, allowedActionGroupIds: undefined,
  defaultActionId: undefined, dedicatedPageRoute: undefined, active: true,
};

interface WorkstationGroupModalProps {
  mode: 'add' | 'edit';
  workstationGroup?: WorkstationGroup;
  labs: Facility[];
  actionGroups: ActionGroup[];
  allActions: SystemAction[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const WorkstationGroupModal: React.FC<WorkstationGroupModalProps> = ({ mode, workstationGroup, labs, actionGroups, allActions, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    workstationGroup ? { ...workstationGroup, active: workstationGroup.status !== 'Inactive' } : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const setDiscipline = (d: WorkstationDiscipline) => {
    // Real — a functionalArea from the PREVIOUS discipline is never
    // honestly valid under a new one; cleared, not carried over.
    setDraft(prev => ({ ...prev, discipline: d, functionalArea: '' }));
  };

  const eligibleAreas = FUNCTIONAL_AREAS_BY_DISCIPLINE[draft.discipline];

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('common.required');
    if (!draft.functionalArea) e.functionalArea = eligibleAreas.length === 0 ? t('workstationGroupsSection.modal.noAreasError', { discipline: draft.discipline }) : t('common.required');
    if (!draft.performingLabFacilityId) e.performingLabFacilityId = t('common.required');
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
        <div className="ps-ms-header">{mode === 'edit' ? t('workstationGroupsSection.modal.editTitle', { name: workstationGroup?.name }) : t('workstationGroupsSection.addButton')}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('workstationGroupsSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('workstationGroupsSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-discipline">{t('workstationGroupsSection.modal.disciplineLabel')}</label>
            <select id="wg-discipline" className="ps-conf-select" value={draft.discipline} onChange={e => setDiscipline(e.target.value as WorkstationDiscipline)}>
              {WORKSTATION_DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-area">{t('workstationGroupsSection.modal.functionalAreaLabel')} <span className="ps-conf-required">*</span></label>
            <select id="wg-area" className={`ps-conf-select ${errors.functionalArea ? 'ps-conf-input--error' : ''}`}
              value={draft.functionalArea} onChange={e => set('functionalArea', e.target.value)} disabled={eligibleAreas.length === 0}>
              <option value="">{eligibleAreas.length === 0 ? t('workstationGroupsSection.modal.noAreasAvailable') : t('workstationGroupsSection.modal.selectAreaPlaceholder')}</option>
              {eligibleAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.functionalArea && <span className="ps-conf-error-text">{errors.functionalArea}</span>}
            {draft.discipline === 'AUTOPSY' && (
              <span className="ps-conf-error-text ps-conf-error-text--warning">
                {t('workstationGroupsSection.modal.autopsyNoAreasHint')}
              </span>
            )}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-facility">{t('workstationGroupsSection.modal.performingLabLabel')} <span className="ps-conf-required">*</span></label>
            <select id="wg-facility" className={`ps-conf-select ${errors.performingLabFacilityId ? 'ps-conf-input--error' : ''}`}
              value={draft.performingLabFacilityId} onChange={e => set('performingLabFacilityId', e.target.value)}>
              <option value="">{t('workstationGroupsSection.modal.selectFacilityPlaceholder')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.performingLabFacilityId && <span className="ps-conf-error-text">{errors.performingLabFacilityId}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-qc-mode">{t('workstationGroupsSection.modal.qcModeLabel')}</label>
            <select id="wg-qc-mode" className="ps-conf-select" value={draft.qcEnforcementMode ?? ''} onChange={e => set('qcEnforcementMode', e.target.value || undefined)}>
              <option value="">{t('workstationGroupsSection.modal.notSetOption')}</option>
              {QC_MODE_OPTIONS.map(m => <option key={m} value={m}>{t(QC_MODE_LABEL_KEY[m])}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-default-group">{t('workstationGroupsSection.modal.defaultActionGroupLabel')}</label>
            <select id="wg-default-group" className="ps-conf-select" value={draft.defaultActionGroupId ?? ''} onChange={e => set('defaultActionGroupId', e.target.value || undefined)}>
              <option value="">{t('workstationGroupsSection.modal.noneOption')}</option>
              {actionGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-default-action">{t('workstationGroupsSection.modal.defaultActionLabel')}</label>
            <select id="wg-default-action" className="ps-conf-select" value={draft.defaultActionId ?? ''} onChange={e => set('defaultActionId', e.target.value || undefined)}>
              <option value="">{t('workstationGroupsSection.modal.noneOption')}</option>
              {allActions.map(a => <option key={a.id} value={a.id}>{a.label ?? a.id}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('workstationGroupsSection.modal.dedicatedPageRouteLabel')}</label>
            <input className="ps-conf-input" value={draft.dedicatedPageRoute ?? ''} onChange={e => set('dedicatedPageRoute', e.target.value || undefined)}
              placeholder={t('workstationGroupsSection.modal.dedicatedPageRoutePlaceholder')} />
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? t('workstationGroupsSection.addButton') : t('workstationGroupsSection.modal.saveChangesButton')}</button>
        </div>
      </div>
    </div>
  );
};

const WorkstationGroupsSection: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<WorkstationGroup[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [actionGroups, setActionGroups] = useState<ActionGroup[]>([]);
  const [allActions, setAllActions] = useState<SystemAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; workstationGroup?: WorkstationGroup } | null>(null);

  useEffect(() => {
    workstationGroupService.getAll().then(res => { if (res.ok) setGroups(res.data); setLoading(false); });
    getActivePerformingLabs().then(setLabs);
    actionGroupService.getAll().then(res => { if (res.ok) setActionGroups(res.data.filter(g => g.status === 'Active')); });
    setAllActions(mockActionRegistryService.getActions());
  }, []);

  const labName = (id: string) => labs.find(l => l.id === id)?.name ?? id;
  const filtered = groups.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.functionalArea.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await workstationGroupService.create({ ...payload, createdBy: 'current-user' });
      if (res.ok) setGroups(prev => [...prev, res.data]);
    } else if (modal?.workstationGroup) {
      const res = await workstationGroupService.update(modal.workstationGroup.id, payload);
      if (res.ok) setGroups(prev => prev.map(g => g.id === res.data.id ? res.data : g));
    }
    setModal(null);
  };

  const handleToggleStatus = async (g: WorkstationGroup) => {
    const res = g.status === 'Active' ? await workstationGroupService.deactivate(g.id) : await workstationGroupService.reactivate(g.id);
    if (res.ok) setGroups(prev => prev.map(x => x.id === g.id ? res.data : x));
  };

  if (loading) return <div className="ps-conf-loading">{t('workstationGroupsSection.loading')}</div>;

  const headers = [
    t('workstationGroupsSection.table.headers.name'),
    t('workstationGroupsSection.table.headers.disciplineArea'),
    t('workstationGroupsSection.table.headers.performingLab'),
    t('workstationGroupsSection.table.headers.qcMode'),
    t('workstationGroupsSection.table.headers.status'),
    t('workstationGroupsSection.table.headers.actions'),
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('workstationGroupsSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('workstationGroupsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ {t('workstationGroupsSection.addButton')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('workstationGroupsSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{headers.map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} className="ps-conf-tr">
                  <td className="ps-conf-td"><div className="ps-conf-identity-name">{g.name}</div></td>
                  <td className="ps-conf-td"><div className="ps-conf-identity-sub">{g.discipline} — {g.functionalArea}</div></td>
                  <td className="ps-conf-td">{labName(g.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">{g.qcEnforcementMode ? t(QC_MODE_LABEL_KEY[g.qcEnforcementMode]) : '\u2014'}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${g.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${g.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{g.status === 'Active' ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', workstationGroup: g })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(g)}>{g.status === 'Active' ? t('common.deactivate') : t('common.reactivate')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>{t('workstationGroupsSection.emptyState')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <WorkstationGroupModal mode={modal.mode} workstationGroup={modal.workstationGroup} labs={labs} actionGroups={actionGroups} allActions={allActions}
          onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default WorkstationGroupsSection;
