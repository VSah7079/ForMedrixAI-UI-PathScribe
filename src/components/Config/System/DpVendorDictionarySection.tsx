// src/components/Config/System/DpVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own DP/AI vendor integration plan's final
// remaining item — "Admin UI: DP vendor dictionary editor." Same real
// list/add-edit-modal/deactivate pattern this app's own other
// dictionaries already use (StaffTab.tsx's own real modal structure:
// ps-conf-backdrop → ps-conf-modal → header/body/footer). Real, named
// CSS classes throughout, no inline styles.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockDpVendorService } from '../../../services/digitalPathology/mockDpVendorService';
import type { DpVendorEntry, NewDpVendorEntry } from '../../../services/digitalPathology/IDpVendorService';

type Draft = NewDpVendorEntry;

const emptyDraft = (): Draft => ({ name: '', productName: '', modality: '', fdaCleared: false, active: true });

const VendorModal: React.FC<{
  mode: 'add' | 'edit';
  entry?: DpVendorEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? 'Add DP Vendor' : 'Edit DP Vendor'}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="dp-vendor-name">Vendor Name</label>
          <input id="dp-vendor-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="dp-vendor-product">Product Name</label>
          <input id="dp-vendor-product" className="ps-conf-input" value={draft.productName} onChange={e => setDraft({ ...draft, productName: e.target.value })} />

          <label className="ps-label" htmlFor="dp-vendor-modality">Modality</label>
          <input id="dp-vendor-modality" className="ps-conf-input" value={draft.modality} onChange={e => setDraft({ ...draft, modality: e.target.value })}
            placeholder="e.g. prostate, cervical_cytology, surgical_pathology_general" />

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.fdaCleared} onChange={e => setDraft({ ...draft, fdaCleared: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">FDA Cleared</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim() || !draft.productName.trim() || !draft.modality.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};

const DpVendorDictionarySection: React.FC = () => {
  const [entries, setEntries] = useState<DpVendorEntry[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: DpVendorEntry } | null>(null);

  const refresh = () => {
    mockDpVendorService.getAll().then(res => { if (res.ok) setEntries(res.data); });
  };

  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.active);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) {
      await mockDpVendorService.update(modal.entry.id, draft);
    } else {
      await mockDpVendorService.add(draft);
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: DpVendorEntry) => {
    if (e.active) await mockDpVendorService.deactivate(e.id);
    else await mockDpVendorService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">Digital Pathology / AI Vendors</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            Real, named computational-pathology AI products this lab may order screening results from — shared
            across cytology and surgical pathology, not scoped to either.
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>+ Add Vendor</button>
      </div>

      <label className="ps-conf-toggle-label-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">Show inactive</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.productName} <em style={{ color: 'var(--ps-conf-text-3, #94a3b8)' }}>({e.name})</em>
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {e.modality}{e.fdaCleared ? ' · FDA Cleared' : ''}{!e.active ? ' · Inactive' : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">No DP vendors on file.</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default DpVendorDictionarySection;
