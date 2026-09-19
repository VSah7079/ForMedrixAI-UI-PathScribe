// src/components/Config/System/WorkstationGroupsSection.tsx
import React, { useState, useEffect } from 'react';
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
    if (!draft.name.trim()) e.name = 'Required';
    if (!draft.functionalArea) e.functionalArea = eligibleAreas.length === 0 ? `${draft.discipline} has no real functional areas yet` : 'Required';
    if (!draft.performingLabFacilityId) e.performingLabFacilityId = 'Required';
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
        <div className="ps-ms-header">{mode === 'edit' ? `Edit \u2014 ${workstationGroup?.name}` : 'Add Workstation Group'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Grossing Bench Group" />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-discipline">Discipline</label>
            <select id="wg-discipline" className="ps-conf-select" value={draft.discipline} onChange={e => setDiscipline(e.target.value as WorkstationDiscipline)}>
              {WORKSTATION_DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-area">Functional Area <span className="ps-conf-required">*</span></label>
            <select id="wg-area" className={`ps-conf-select ${errors.functionalArea ? 'ps-conf-input--error' : ''}`}
              value={draft.functionalArea} onChange={e => set('functionalArea', e.target.value)} disabled={eligibleAreas.length === 0}>
              <option value="">{eligibleAreas.length === 0 ? 'None available for this discipline yet' : 'Select an area\u2026'}</option>
              {eligibleAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.functionalArea && <span className="ps-conf-error-text">{errors.functionalArea}</span>}
            {draft.discipline === 'AUTOPSY' && (
              <span className="ps-conf-error-text" style={{ color: 'var(--ps-conf-amber)' }}>
                AUTOPSY has no real, populated functional areas yet \u2014 see PS-261.
              </span>
            )}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-facility">Performing Lab <span className="ps-conf-required">*</span></label>
            <select id="wg-facility" className={`ps-conf-select ${errors.performingLabFacilityId ? 'ps-conf-input--error' : ''}`}
              value={draft.performingLabFacilityId} onChange={e => set('performingLabFacilityId', e.target.value)}>
              <option value="">Select a facility\u2026</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.performingLabFacilityId && <span className="ps-conf-error-text">{errors.performingLabFacilityId}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-qc-mode">QC Enforcement Mode</label>
            <select id="wg-qc-mode" className="ps-conf-select" value={draft.qcEnforcementMode ?? ''} onChange={e => set('qcEnforcementMode', e.target.value || undefined)}>
              <option value="">\u2014 Not set \u2014</option>
              {QC_MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-default-group">Default Action Group</label>
            <select id="wg-default-group" className="ps-conf-select" value={draft.defaultActionGroupId ?? ''} onChange={e => set('defaultActionGroupId', e.target.value || undefined)}>
              <option value="">\u2014 None \u2014</option>
              {actionGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="wg-default-action">Default Action (fires on next scan)</label>
            <select id="wg-default-action" className="ps-conf-select" value={draft.defaultActionId ?? ''} onChange={e => set('defaultActionId', e.target.value || undefined)}>
              <option value="">\u2014 None \u2014</option>
              {allActions.map(a => <option key={a.id} value={a.id}>{a.label ?? a.id}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Dedicated Page Route</label>
            <input className="ps-conf-input" value={draft.dedicatedPageRoute ?? ''} onChange={e => set('dedicatedPageRoute', e.target.value || undefined)}
              placeholder="e.g. /microtomy-workstation \u2014 leave blank until a real bench page exists" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Active</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? 'Add Workstation Group' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

const WorkstationGroupsSection: React.FC = () => {
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

  if (loading) return <div className="ps-conf-loading">Loading workstation groups...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Workstation Groups</h3>
          <p className="ps-conf-section-subtitle">
            Real, first-class functional areas (per PS-289) \u2014 group real ScanStations by discipline and area, scope them to a facility, and set what loads automatically when a technician selects one.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Workstation Group</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by name or functional area..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{['Name', 'Discipline / Area', 'Performing Lab', 'QC Mode', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} className="ps-conf-tr">
                  <td className="ps-conf-td"><div className="ps-conf-identity-name">{g.name}</div></td>
                  <td className="ps-conf-td"><div className="ps-conf-identity-sub">{g.discipline} \u2014 {g.functionalArea}</div></td>
                  <td className="ps-conf-td">{labName(g.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">{g.qcEnforcementMode ?? '\u2014'}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${g.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${g.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{g.status}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', workstationGroup: g })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(g)}>{g.status === 'Active' ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>No workstation groups match the current filter.</td></tr>}
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
