// src/components/Config/System/GrossingRouteOverridesSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin screen for Grossing Route overrides (S0-CF-12) — the piece
// that was genuinely missing before. AccessionPage.tsx always passed
// routingOverrides: [] to evaluateGrossingTemplateAssignment because
// there was no way to create an override; the evaluation function's
// own consuming logic (mockCaseService.ts) was already real and
// correct. This screen is the missing data-entry side, not new
// evaluation logic.
//
// specimenType is a free-text field, not a dropdown against Specimen
// Categories — checked the real Pass G0 matching code in
// mockCaseService.ts directly rather than assume: it compares by exact
// string equality against GrossingEvaluationSpecimen.specimenType
// (sp._entry?.type from the Specimen Dictionary), which is a finer,
// genuinely free-text field, not the coarser 4-value Category
// dictionary. A dropdown against Categories would have looked correct
// but silently never matched anything real.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { grossingRoutingOverrideService, facilityService, specimenDictionaryService } from '../../../services';
import type { GrossingRoutingOverrideEntry } from '../../../services/grossingRoutingOverrides/IGrossingRoutingOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';

// Same three Gold Standard routes as DepartmentsSection.tsx —
// same pragmatic hardcode-rather-than-fetch call, same reason.
const GROSSING_TEMPLATES: { id: string; name: string }[] = [
  { id: 'grossing_standard_tissue', name: 'Standard Tissue Grossing (Route A)' },
  { id: 'grossing_fluid_cytology',  name: 'Fluid / Cell Block Grossing (Route B)' },
  { id: 'grossing_histology_only',  name: 'Histology-Only / Direct Triage (Route C)' },
];

type Draft = Omit<GrossingRoutingOverrideEntry, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft = (facilities: Facility[]): Draft => ({
  clientId: facilities[0]?.id ?? '',
  specimenType: '',
  grossingTemplateId: 'grossing_standard_tissue',
  active: true,
});

interface OverrideModalProps {
  mode: 'add' | 'edit';
  entry?: GrossingRoutingOverrideEntry;
  facilities: Facility[];
  knownSpecimenTypes: string[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const OverrideModal: React.FC<OverrideModalProps> = ({ mode, entry, facilities, knownSpecimenTypes, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ?? emptyDraft(facilities));
  const [error, setError] = useState('');
  const set = (k: keyof Draft, v: any) => setDraft(prev => ({ ...prev, [k]: v }));

  const handleSave = () => {
    if (!draft.specimenType.trim()) { setError('Required'); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? 'Add Grossing Route Override' : 'Edit Override'}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gro-facility">Facility <span className="ps-conf-required">*</span></label>
            <select id="gro-facility" className="ps-conf-select" value={draft.clientId} onChange={e => set('clientId', e.target.value)}>
              {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Specimen Type <span className="ps-conf-required">*</span></label>
            <input
              className={`ps-conf-input ${error ? 'ps-conf-input--error' : ''}`}
              list="ps-gro-known-types"
              value={draft.specimenType}
              onChange={e => { set('specimenType', e.target.value); setError(''); }}
              placeholder="e.g. Kidney — must match the Specimen Dictionary's type field exactly"
            />
            <datalist id="ps-gro-known-types">
              {knownSpecimenTypes.map(t => <option key={t} value={t} />)}
            </datalist>
            {error && <span className="ps-conf-error-text">{error}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gro-template">Override Route <span className="ps-conf-required">*</span></label>
            <select id="gro-template" className="ps-conf-select" value={draft.grossingTemplateId} onChange={e => set('grossingTemplateId', e.target.value)}>
              {GROSSING_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
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
            {mode === 'add' ? 'Add Override' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const GrossingRouteOverridesSection: React.FC = () => {
  const [overrides, setOverrides] = useState<GrossingRoutingOverrideEntry[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [knownSpecimenTypes, setKnownSpecimenTypes] = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<{ mode: 'add' | 'edit'; entry?: GrossingRoutingOverrideEntry } | null>(null);

  const loadAll = () => {
    Promise.all([
      grossingRoutingOverrideService.getAll(),
      facilityService.getAll(),
      specimenDictionaryService.getAll(),
    ]).then(([overridesRes, facilitiesRes, entriesRes]) => {
      if (overridesRes.ok) setOverrides(overridesRes.data);
      if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
      if (entriesRes.ok) {
        const types = Array.from(new Set(entriesRes.data.map((e: SpecimenEntry) => e.type).filter(Boolean)));
        setKnownSpecimenTypes(types);
      }
      setLoading(false);
    });
  };

  useEffect(() => { loadAll(); }, []);

  const resolveFacilityName = (id: string) => facilities.find(c => c.id === id)?.name ?? id;
  const templateName = (id: string) => GROSSING_TEMPLATES.find(t => t.id === id)?.name ?? id;

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      const res = await grossingRoutingOverrideService.add(draft);
      if (res.ok) setOverrides(prev => [...prev, res.data]);
    } else if (modal?.entry) {
      const res = await grossingRoutingOverrideService.update(modal.entry.id, draft);
      if (res.ok) setOverrides(prev => prev.map(o => o.id === res.data.id ? res.data : o));
    }
    setModal(null);
  };

  const handleRemove = async (id: string) => {
    await grossingRoutingOverrideService.remove(id);
    setOverrides(prev => prev.filter(o => o.id !== id));
  };

  if (loading) return <div className="ps-conf-loading">Loading grossing route overrides...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Grossing Route Overrides</h3>
          <p className="ps-conf-section-subtitle">
            Per-facility exceptions to which Grossing Route a specimen type gets — for a facility whose actual handling
            needs differ from the usual default. Specimen Type must match the Specimen Dictionary's own type field
            exactly; everything not listed here uses the normal, unoverridden routing.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Override</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Facility', 'Specimen Type', 'Override Route', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overrides.map(o => (
                <tr key={o.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{resolveFacilityName(o.clientId)}</td>
                  <td className="ps-conf-td">{o.specimenType}</td>
                  <td className="ps-conf-td">{templateName(o.grossingTemplateId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${o.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${o.active ? 'ps-conf-status-text--active' : ''}`}>{o.active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: o })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleRemove(o.id)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {overrides.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>No overrides configured — every facility uses the normal, unoverridden routing.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <OverrideModal
          mode={modal.mode}
          entry={modal.entry}
          facilities={facilities}
          knownSpecimenTypes={knownSpecimenTypes}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default GrossingRouteOverridesSection;
