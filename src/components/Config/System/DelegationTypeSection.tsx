/**
 * DelegationTypeSection.tsx
 * System › Delegation Types
 * System types: toggle only. Custom types: full CRUD.
 *
 * Rewritten to the standard rows-and-columns table pattern (matching
 * ContainerTypesSection.tsx/StainDictionarySection.tsx) — replaces the
 * previous card-grid layout, per direct request: "The UI is frankly
 * off, just different cards. Let's go with the standard rows and
 * columns that is the standard."
 *
 * Real fix in the same pass: the "ID" field's own value used to be
 * silently discarded on save (mockDelegationTypeService.ts's add()
 * always assigned a random 'CUSTOM_' + Date.now() id, regardless of
 * the real, validated, label-derived id shown and editable on
 * screen) — the on-screen "ID already exists" check was validating a
 * value that then never actually got saved. Fixed at the service
 * layer (see IDelegationTypeService.ts's own doc comment) so the
 * real, chosen id is what persists.
 */
import React, { useState, useEffect, useCallback } from 'react';
import '../../../pathscribe.css';
import { mockDelegationTypeService } from '../../../services/delegationTypes/mockDelegationTypeService';
import type { DelegationType } from '../../../services/delegationTypes/IDelegationTypeService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { prepareDuplicate } from '../../../utils/duplicateEntry';
import { findDuplicate } from '../../../utils/validateUnique';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

const PRESET_COLORS = [
  '#0891B2','#6366f1','#f59e0b','#10b981',
  '#8b5cf6','#64748b','#ef4444','#38bdf8',
  '#34d399','#fb923c','#f87171','#e879f9',
];

function generateId(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24);
}

const BLANK = (): DelegationType => ({
  id:'', label:'', description:'', active:true,
  color: PRESET_COLORS[0], transfersOwnership:false,
  requiresNote:false, multiAssign:false,
  isSystem:false, sortOrder:999, cptHint:undefined,
  performingLabFacilityId: undefined,
});

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{checked:boolean; onChange:(v:boolean)=>void; label?:string; disabled?:boolean}> =
({ checked, onChange, label, disabled=false }) => (
  <div className={`ps-sub-toggle-wrap${disabled ? ' ps-sub-toggle-wrap--disabled' : ''}`}>
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={checked ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
    >
      <div className={checked ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
    </div>
    {label && <span className={checked ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>{label}</span>}
  </div>
);

// ── Form modal ────────────────────────────────────────────────────────────────

interface FormProps {
  mode:        'add' | 'edit';
  initial:     DelegationType | null;
  existingEntries: DelegationType[];
  labs:        Facility[];
  onSave:      (dt: DelegationType) => void;
  onCancel:    () => void;
}

const Form: React.FC<FormProps> = ({ mode, initial, existingEntries, labs, onSave, onCancel }) => {
  const isNew = mode === 'add';
  const [form, setForm]         = useState<DelegationType>(initial ?? BLANK());
  const [idTouched, setIdTouched] = useState(mode === 'edit');
  const [errors, setErrors]     = useState<Partial<Record<keyof DelegationType, string>>>({});

  useEffect(() => {
    if (isNew && !idTouched && form.label) setForm(f => ({ ...f, id: generateId(f.label) }));
  }, [form.label, idTouched, isNew]);

  const set = <K extends keyof DelegationType>(k: K, v: DelegationType[K]) =>
    { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  const validate = () => {
    const e: Partial<Record<keyof DelegationType, string>> = {};
    if (!form.label.trim())       e.label       = 'Required';
    if (!form.id.trim())          e.id          = 'Required';
    if (!form.description.trim()) e.description = 'Required';
    // Real, per direct request: "Label and ID should be unique."
    // Include Performing Lab: both checks are scoped by
    // performingLabFacilityId as a compound key — per the same,
    // standard convention as ContainerTypesSection.tsx/PS-75 — only a
    // real collision within the same lab (including two global
    // entries) is blocked; a different lab's own type may legitimately
    // share a label or id.
    const excludeId = mode === 'edit' ? initial?.id : undefined;
    if (form.label.trim() && !e.label) {
      const labelCollision = findDuplicate(existingEntries, { performingLabFacilityId: form.performingLabFacilityId, label: form.label.trim() }, ['performingLabFacilityId', 'label'], excludeId);
      if (labelCollision) e.label = `A delegation type labeled "${labelCollision.label}" already exists${form.performingLabFacilityId ? ' for this performing lab' : ''}.`;
    }
    if (form.id.trim() && !e.id) {
      const idCollision = findDuplicate(existingEntries, { performingLabFacilityId: form.performingLabFacilityId, id: form.id.trim() }, ['performingLabFacilityId', 'id'], excludeId);
      if (idCollision) e.id = `ID "${idCollision.id}" already exists${form.performingLabFacilityId ? ' for this performing lab' : ''}.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div className="ps-conf-backdrop">
      <div className="fm-modal fm-modal--config ps-del-modal" onClick={e => e.stopPropagation()}>
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · Delegation Types</div>
            <h2 className="fm-title ps-del-modal-title">
              {mode === 'edit' ? `Edit — ${initial?.label}` : initial ? `Duplicate — ${initial.label}` : 'Add Delegation Type'}
            </h2>
          </div>
        </div>

        <div className="ps-client-editor-body">

          {/* Label + ID row */}
          <div className="ps-del-form-row-2col">
            <div className="ps-sub-field">
              <label className="ps-sub-label">Label <span className="ps-sub-label-req">*</span></label>
              <input
                className={errors.label ? 'ps-sub-input ps-sub-input--error' : 'ps-sub-input'}
                value={form.label}
                placeholder="e.g. Consult Request"
                onChange={e => set('label', e.target.value)}
              />
              {errors.label && <span className="ps-sub-error">{errors.label}</span>}
            </div>
            <div className="ps-sub-field">
              <label className="ps-sub-label">
                ID {isNew && <span className="ps-sub-label-opt">(auto-derived, editable)</span>}
              </label>
              <input
                className={`ps-sub-input ps-del-id-input${errors.id ? ' ps-sub-input--error' : ''}${!isNew ? ' ps-del-id-input--locked' : ''}`}
                value={form.id}
                disabled={!isNew}
                placeholder="CONSULT_REQUEST"
                onChange={e => { setIdTouched(true); set('id', e.target.value.toUpperCase()); }}
              />
              {errors.id && <span className="ps-sub-error">{errors.id}</span>}
            </div>
          </div>

          {/* Description */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Description <span className="ps-sub-label-req">*</span></label>
            <textarea
              className={`ps-sub-input ps-del-textarea${errors.description ? ' ps-sub-input--error' : ''}`}
              value={form.description}
              rows={2}
              placeholder="Shown to staff during delegation…"
              onChange={e => set('description', e.target.value)}
            />
            {errors.description && <span className="ps-sub-error">{errors.description}</span>}
          </div>

          {/* CPT Hint */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">CPT Hint <span className="ps-sub-label-opt">(optional)</span></label>
            <input
              className="ps-sub-input"
              value={form.cptHint ?? ''}
              placeholder="e.g. 88321–88325"
              onChange={e => set('cptHint', e.target.value || undefined)}
            />
          </div>

          {/* Performing Lab */}
          <div className="ps-sub-field">
            <label className="ps-sub-label" htmlFor="deltype-performing-lab">Performing Lab</label>
            <select id="deltype-performing-lab" className="ps-sub-input"
              value={form.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', (e.target.value || undefined) as any)}>
              <option value="">— All Labs (available to everyone) —</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Colour */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Accent Colour</label>
            <div className="ps-type-color-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={form.color === c ? 'ps-type-color-swatch ps-type-color-swatch--active' : 'ps-type-color-swatch'}
                  style={{ '--swatch-color': c } as React.CSSProperties}
                  onClick={() => set('color', c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                className="ps-type-color-input"
                title="Custom colour"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Options</label>
            <div className="ps-del-toggle-stack">
              <Toggle checked={form.active}               onChange={v => set('active', v)}               label="Active" />
              <Toggle checked={!!form.transfersOwnership} onChange={v => set('transfersOwnership', v)}   label="Transfers Ownership" />
              <Toggle checked={!!form.requiresNote}       onChange={v => set('requiresNote', v)}         label="Requires Note" />
              <Toggle checked={!!form.multiAssign}        onChange={v => set('multiAssign', v)}          label="Allows Multiple Recipients" />
            </div>
          </div>

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div className="ps-del-footer-actions">
            <button onClick={onCancel} className="fm-btn-cancel">Cancel</button>
            <button
              onClick={() => validate() && onSave({ ...form, cptHint: form.cptHint?.trim() || undefined })}
              className="fm-btn-apply"
            >
              {mode === 'edit' ? 'Save Changes' : 'Add Type'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

// ── Main section ──────────────────────────────────────────────────────────────

const DelegationTypeSection: React.FC = () => {
  const [types,         setTypes]         = useState<DelegationType[]>([]);
  const [labs,          setLabs]          = useState<Facility[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [labFilter,     setLabFilter]     = useState<'All' | 'Global' | string>('All');
  const [modal,         setModal]         = useState<{ mode: 'add' | 'edit'; entry?: DelegationType } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await mockDelegationTypeService.getAll();
    if (result.ok) setTypes(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    getActivePerformingLabs().then(setLabs);
  }, [load]);

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'All Labs';

  const handleToggle = async (dt: DelegationType) => {
    await mockDelegationTypeService.update(dt.id, { active: !dt.active });
    await load();
  };

  const handleSave = async (dt: DelegationType) => {
    if (modal?.mode === 'add') {
      const { isSystem: _isSystem, sortOrder: _sortOrder, ...rest } = dt;
      await mockDelegationTypeService.add(rest);
    } else {
      const { id: _id, isSystem: _isSystem, ...rest } = dt;
      await mockDelegationTypeService.update(dt.id, rest);
    }
    setModal(null);
    await load();
  };

  // Opens the Add modal pre-filled with an existing entry's data,
  // matching the same, proven pattern as every other dictionary this
  // session (see PS-73) — NOT an immediate silent save. mode: 'add'
  // is what makes handleSave treat this as a real create() even
  // though entry is populated for prefill. Both label and id get the
  // real, shared "(Copy)"/uniqueness treatment; a duplicated system
  // type becomes a genuinely new custom type, per real isSystem:false.
  const handleClone = (source: DelegationType) => {
    const cloned = prepareDuplicate(source, 'label');
    setModal({ mode: 'add', entry: { ...cloned, id: generateId(cloned.label), isSystem: false } });
  };

  const filtered = types.filter(t => {
    const matchLab = labFilter === 'All'
      || (labFilter === 'Global' ? !t.performingLabFacilityId : t.performingLabFacilityId === labFilter);
    return matchLab;
  });
  const systemTypes = filtered.filter(t =>  t.isSystem).sort((a, b) => a.sortOrder - b.sortOrder);
  const customTypes = filtered.filter(t => !t.isSystem).sort((a, b) => a.sortOrder - b.sortOrder);

  const renderRow = (dt: DelegationType) => (
    <tr key={dt.id} className="ps-conf-tr">
      <td className="ps-conf-td">
        <span className="ps-del-id-badge" style={{ '--del-badge-bg': dt.color + '22', '--del-badge-color': dt.color, '--del-badge-border': dt.color + '44' } as React.CSSProperties}>{dt.id}</span>
      </td>
      <td className="ps-conf-td">
        <div className="ps-conf-identity-name">
          {dt.label}
          {dt.isSystem && <span className="ps-del-tag">🔒 system</span>}
        </div>
        <div className="ps-conf-identity-sub">{dt.description}</div>
      </td>
      <td className="ps-conf-td">
        <div className="ps-del-badge-row">
          {dt.transfersOwnership && <span className="ps-del-tag ps-del-tag--warn">transfers ownership</span>}
          {dt.requiresNote       && <span className="ps-del-tag">requires note</span>}
          {dt.multiAssign        && <span className="ps-del-tag">multi-recipient</span>}
          {dt.cptHint            && <span className="ps-del-tag">CPT {dt.cptHint}</span>}
          {!dt.transfersOwnership && !dt.requiresNote && !dt.multiAssign && !dt.cptHint && '—'}
        </div>
      </td>
      <td className="ps-conf-td">{labName(dt.performingLabFacilityId)}</td>
      <td className="ps-conf-td">
        <Toggle checked={dt.active} onChange={() => handleToggle(dt)} label={dt.active ? 'Active' : 'Inactive'} />
      </td>
      <td className="ps-conf-td">
        <div className="ps-conf-row-actions">
          {!dt.isSystem && (
            <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: dt })}>Edit</button>
          )}
          <button className="ps-conf-btn-row" onClick={() => handleClone(dt)}>Duplicate</button>
          {!dt.isSystem && (
            deleteConfirm === dt.id ? (
              <span className="ps-del-confirm-row">
                <span className="ps-del-confirm-label">Delete?</span>
                <button className="ps-sub-btn-inactivate" onClick={async () => { await mockDelegationTypeService.remove(dt.id); setDeleteConfirm(null); await load(); }}>Yes</button>
                <button className="fm-btn-cancel" onClick={() => setDeleteConfirm(null)}>No</button>
              </span>
            ) : (
              <button className="ps-conf-btn-row ps-del-delete-btn" onClick={() => setDeleteConfirm(dt.id)}>Delete</button>
            )
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="ps-del-shell">

      <div className="ps-del-header">
        <div>
          <h2 className="ps-sub-title">Delegation Types</h2>
          <p className="ps-sub-subtitle">System types can be enabled or disabled, and duplicated into a new custom type. Custom types are fully editable.</p>
        </div>
        <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>
          + Add Type
        </button>
      </div>

      <div className="ps-conf-form-row">
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">All Labs</option>
          <option value="Global">Global only (no lab set)</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {modal && (
        <Form
          mode={modal.mode}
          initial={modal.entry ?? null}
          existingEntries={types}
          labs={labs}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {loading ? (
        <div className="ps-del-loading">Loading…</div>
      ) : (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>
                  {['ID', 'Delegation Type', 'Options', 'Performing Lab', 'Status', 'Actions'].map(h => (
                    <th key={h} className="ps-conf-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {systemTypes.map(renderRow)}
                {customTypes.length === 0 && systemTypes.length === 0 ? (
                  <tr><td className="ps-conf-td ps-del-empty-cell" colSpan={6}>No delegation types yet — create one with the Add Type button.</td></tr>
                ) : customTypes.map(renderRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DelegationTypeSection;
