// src/components/Config/System/ReagentLotsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin CRUD screen for the Reagent and Solution Lot Registry
// (src/services/reagentLots/mockReagentLotService.ts) — real, per direct
// requirements ("PathScribe Stain & Quality Control Module" §2.1). Same
// table+modal pattern as ContainerTypesSection. A lot references exactly
// one of a real StainType (IHC antibody / special stain kit) or a real,
// closed RoutineStainComponentType (H&E line reagent with no orderable
// StainType of its own) — see IReagentLotService.ts's own header for the
// full reasoning behind that split.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { reagentLotService } from '../../../services';
import { mockStainTypeService } from '../../../services/stains/mockStainTypeService';
import type { ReagentLot, ReagentLotQcStatus, RoutineStainComponentType } from '../../../services/reagentLots/IReagentLotService';
import { ROUTINE_STAIN_COMPONENT_TYPES } from '../../../services/reagentLots/IReagentLotService';
import type { StainType } from '../../../services/stains/IStainService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

const ROUTINE_COMPONENT_LABEL: Record<RoutineStainComponentType, string> = {
  HEMATOXYLIN: 'Hematoxylin', EOSIN: 'Eosin', BLUING_REAGENT: 'Bluing Reagent',
  DIFFERENTIATOR: 'Differentiator', DEHYDRANT_ALCOHOL: 'Dehydrant (Alcohol)',
  CLEARANT_XYLENE: 'Clearant (Xylene)', MOUNTING_MEDIUM: 'Mounting Medium',
};

const QC_STATUS_OPTIONS: ReagentLotQcStatus[] = ['Pending', 'Passed', 'Failed'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type ReferenceMode = 'stain_type' | 'routine_component';
type Draft = Omit<ReagentLot, 'id' | 'createdAt' | 'createdBy'> & { active: boolean; referenceMode: ReferenceMode };

const emptyDraft: Draft = {
  referenceMode: 'stain_type', stainTypeId: undefined, routineComponentType: undefined,
  lotNumber: '', expirationDate: '', vendor: '', qcStatus: 'Pending', status: 'Active', active: true,
  performingLabFacilityId: undefined, receivedDate: '',
};

interface ReagentLotModalProps {
  mode: 'add' | 'edit';
  reagentLot?: ReagentLot;
  stainTypes: StainType[];
  labs: Facility[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ReagentLotModal: React.FC<ReagentLotModalProps> = ({ mode, reagentLot, stainTypes, labs, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(
    reagentLot
      ? { ...reagentLot, active: reagentLot.status !== 'Inactive', referenceMode: reagentLot.routineComponentType ? 'routine_component' : 'stain_type' }
      : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const setReferenceMode = (m: ReferenceMode) => {
    setDraft(prev => ({ ...prev, referenceMode: m, stainTypeId: m === 'stain_type' ? prev.stainTypeId : undefined, routineComponentType: m === 'routine_component' ? prev.routineComponentType : undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (draft.referenceMode === 'stain_type' && !draft.stainTypeId) e.stainTypeId = 'Required';
    if (draft.referenceMode === 'routine_component' && !draft.routineComponentType) e.routineComponentType = 'Required';
    if (!draft.lotNumber.trim()) e.lotNumber = 'Required';
    if (!draft.expirationDate) e.expirationDate = 'Required';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  // Real, per direct guidance — IHC/Special Stain (and every other
  // non-Routine category) are real, orderable catalog stains a lot can
  // genuinely be for. 'Routine' itself is excluded here since H&E's own
  // line reagents are handled via the separate routineComponentType
  // path, not by picking the H&E StainType entry directly.
  const eligibleStainTypes = stainTypes.filter(s => s.category !== 'Routine' && s.active);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? `Edit \u2014 ${reagentLot?.lotNumber}` : 'Add Reagent Lot'}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">This lot is for</label>
            <div className="ps-qa-tab-toolbar">
              <button type="button" className={draft.referenceMode === 'stain_type' ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setReferenceMode('stain_type')}>
                Catalog Stain (IHC / Special Stain)
              </button>
              <button type="button" className={draft.referenceMode === 'routine_component' ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setReferenceMode('routine_component')}>
                Routine H&E Line Reagent
              </button>
            </div>
          </div>

          {draft.referenceMode === 'stain_type' ? (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="lot-stain-type">Stain <span className="ps-conf-required">*</span></label>
              <select id="lot-stain-type" className={`ps-conf-select ${errors.stainTypeId ? 'ps-conf-input--error' : ''}`}
                value={draft.stainTypeId ?? ''} onChange={e => set('stainTypeId', e.target.value || undefined)}>
                <option value="">Select a stain\u2026</option>
                {eligibleStainTypes.map(s => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
              </select>
              {errors.stainTypeId && <span className="ps-conf-error-text">{errors.stainTypeId}</span>}
            </div>
          ) : (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="lot-routine-component">Line Reagent <span className="ps-conf-required">*</span></label>
              <select id="lot-routine-component" className={`ps-conf-select ${errors.routineComponentType ? 'ps-conf-input--error' : ''}`}
                value={draft.routineComponentType ?? ''} onChange={e => set('routineComponentType', e.target.value || undefined)}>
                <option value="">Select a line reagent\u2026</option>
                {ROUTINE_STAIN_COMPONENT_TYPES.map(c => <option key={c} value={c}>{ROUTINE_COMPONENT_LABEL[c]}</option>)}
              </select>
              {errors.routineComponentType && <span className="ps-conf-error-text">{errors.routineComponentType}</span>}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Lot Number <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.lotNumber ? 'ps-conf-input--error' : ''}`}
              value={draft.lotNumber} onChange={e => set('lotNumber', e.target.value)} placeholder="e.g. KI67-24601A" />
            {errors.lotNumber && <span className="ps-conf-error-text">{errors.lotNumber}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Expiration Date <span className="ps-conf-required">*</span></label>
            <input type="date" className={`ps-conf-input ${errors.expirationDate ? 'ps-conf-input--error' : ''}`}
              value={draft.expirationDate} onChange={e => set('expirationDate', e.target.value)} />
            {errors.expirationDate && <span className="ps-conf-error-text">{errors.expirationDate}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Received Date</label>
            <input type="date" className="ps-conf-input" value={draft.receivedDate ?? ''} onChange={e => set('receivedDate', e.target.value)} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Vendor</label>
            <input className="ps-conf-input" value={draft.vendor ?? ''} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Ventana" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="lot-qc-status">QC Status</label>
            <select id="lot-qc-status" className="ps-conf-select" value={draft.qcStatus} onChange={e => set('qcStatus', e.target.value)}>
              {QC_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="lot-performing-lab">Performing Lab</label>
            <select id="lot-performing-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''} onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">\u2014 All Labs (shared stock) \u2014</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? 'Add Reagent Lot' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main ReagentLotsSection ────────────────────────────────────────────────────
const ReagentLotsSection: React.FC = () => {
  const [lots,         setLots]         = useState<ReagentLot[]>([]);
  const [stainTypes,   setStainTypes]   = useState<StainType[]>([]);
  const [labs,         setLabs]         = useState<Facility[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [qcFilter,     setQcFilter]     = useState<'All' | ReagentLotQcStatus>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; reagentLot?: ReagentLot } | null>(null);

  useEffect(() => {
    reagentLotService.getAll().then(res => {
      if (res.ok) setLots(res.data);
      setLoading(false);
    });
    mockStainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
    getActivePerformingLabs().then(setLabs);
  }, []);

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'All Labs';
  const referenceLabel = (lot: ReagentLot) => {
    if (lot.stainTypeId) return stainTypes.find(s => s.id === lot.stainTypeId)?.name ?? lot.stainTypeId;
    if (lot.routineComponentType) return ROUTINE_COMPONENT_LABEL[lot.routineComponentType];
    return '\u2014';
  };

  const filtered = lots.filter(l => {
    const matchSearch = !search || l.lotNumber.toLowerCase().includes(search.toLowerCase()) || referenceLabel(l).toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || l.status === statusFilter;
    const matchQc = qcFilter === 'All' || l.qcStatus === qcFilter;
    return matchSearch && matchStatus && matchQc;
  });

  const handleSave = async (draft: Draft) => {
    const { active, referenceMode, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await reagentLotService.create({ ...payload, createdBy: 'current-user' });
      if (res.ok) setLots(prev => [...prev, res.data]);
    } else if (modal?.reagentLot) {
      const res = await reagentLotService.update(modal.reagentLot.id, payload);
      if (res.ok) setLots(prev => prev.map(l => l.id === res.data.id ? res.data : l));
    }
    setModal(null);
  };

  const handleToggleStatus = async (l: ReagentLot) => {
    const res = l.status === 'Active' ? await reagentLotService.deactivate(l.id) : await reagentLotService.reactivate(l.id);
    if (res.ok) setLots(prev => prev.map(x => x.id === l.id ? res.data : x));
  };

  if (loading) return <div className="ps-conf-loading">Loading reagent lots...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Reagent & Solution Lot Registry</h3>
          <p className="ps-conf-section-subtitle">
            Real lot tracking for IHC antibodies, special stain kits, and routine H&E line reagents \u2014 lot number, expiration, and QC status.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Reagent Lot</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by lot number or stain..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select value={qcFilter} onChange={e => setQcFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All QC States</option>
          {QC_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Reagent / Stain', 'Lot Number', 'Expiration', 'QC Status', 'Performing Lab', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{referenceLabel(l)}</div>
                    {l.vendor && <div className="ps-conf-identity-sub">{l.vendor}</div>}
                  </td>
                  <td className="ps-conf-td">{l.lotNumber}</td>
                  <td className="ps-conf-td">{l.expirationDate}</td>
                  <td className="ps-conf-td">{l.qcStatus}</td>
                  <td className="ps-conf-td">{labName(l.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${l.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${l.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{l.status}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', reagentLot: l })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(l)}>
                        {l.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={7}>No reagent lots match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ReagentLotModal mode={modal.mode} reagentLot={modal.reagentLot} stainTypes={stainTypes} labs={labs} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ReagentLotsSection;
