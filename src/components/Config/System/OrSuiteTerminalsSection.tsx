// src/components/Config/System/OrSuiteTerminalsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
// Intraoperative/Frozen Section Dashboard — admin CRUD for
// OrSuiteTerminal. Same real list/add-edit-modal/deactivate pattern
// this app's own other dictionaries already use (DpVendorDictionarySection.tsx),
// with the same real facility→location cascade ScanStationsSection.tsx
// already established for a genuinely analogous physical-device binding.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { locationService } from '../../../services';
import { mockOrSuiteTerminalService } from '../../../services/intraopDashboard/mockOrSuiteTerminalService';
import type { OrSuiteTerminal, NewOrSuiteTerminal } from '../../../services/intraopDashboard/IOrSuiteTerminalService';
import type { Location } from '../../../services/locations/ILocationService';

type Draft = NewOrSuiteTerminal;
const emptyDraft = (): Draft => ({ name: '', locationId: '', facilityId: '', canViewMultiSuite: false, status: 'Active' });

const TerminalModal: React.FC<{ mode: 'add' | 'edit'; entry?: OrSuiteTerminal; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  useEffect(() => {
    if (!draft.facilityId) { setLocations([]); return; }
    locationService.listForFacility(draft.facilityId).then(res => { if (res.ok) setLocations(res.data); });
  }, [draft.facilityId]);

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? 'Add OR Suite Terminal' : 'Edit OR Suite Terminal'}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="orterm-name">Terminal / Station Identity</label>
          <input id="orterm-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. OR-Suite-04" />

          <label className="ps-label" htmlFor="orterm-facility">Facility</label>
          <select id="orterm-facility" className="ps-conf-select" value={draft.facilityId}
            onChange={e => setDraft({ ...draft, facilityId: e.target.value, locationId: '' })}>
            <option value="">— select facility —</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <label className="ps-label" htmlFor="orterm-location">Location (OR/Suite)</label>
          <select id="orterm-location" className="ps-conf-select" value={draft.locationId} disabled={!draft.facilityId}
            onChange={e => setDraft({ ...draft, locationId: e.target.value })}>
            <option value="">— select location —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.pointOfCare}{l.room ? ` — ${l.room}` : ''}</option>)}
          </select>

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.canViewMultiSuite} onChange={e => setDraft({ ...draft, canViewMultiSuite: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">Can view Multi-Suite Overview (charge nurse, lab liaison, roving circulator)</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim() || !draft.locationId}>Save</button>
        </div>
      </div>
    </div>
  );
};

const OrSuiteTerminalsSection: React.FC = () => {
  const [entries, setEntries] = useState<OrSuiteTerminal[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: OrSuiteTerminal } | null>(null);

  const refresh = () => { mockOrSuiteTerminalService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.status === 'Active');

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockOrSuiteTerminalService.update(modal.entry.id, draft);
    else await mockOrSuiteTerminalService.add(draft);
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: OrSuiteTerminal) => {
    if (e.status === 'Active') await mockOrSuiteTerminalService.deactivate(e.id);
    else await mockOrSuiteTerminalService.update(e.id, { status: 'Active' });
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">OR Suite Terminals</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            Real, per-OR "Station Identity" displays for the Intraoperative Dashboard — each one bound to a specific,
            existing Location. Two facilities can each have their own "OR 1"; each real terminal here still points at
            its own, uniquely-identified real Location record, never a name collision.
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>+ Add Terminal</button>
      </div>

      <label className="ps-conf-toggle-label-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">Show inactive</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.name}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {e.canViewMultiSuite ? ' · Multi-Suite eligible' : ''}{e.status === 'Inactive' ? ' · Inactive' : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.status === 'Active' ? 'Deactivate' : 'Reactivate'}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">No OR Suite Terminals on file.</div>}
      </div>

      {modal && <TerminalModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default OrSuiteTerminalsSection;
