// src/components/Config/Cytology/NonGynCytologyCategoriesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Non-GYN Cytology Classification
// Systems gap — admin CRUD for the Milan and Paris (urinary) category
// dictionaries. Same real list/add-edit-modal pattern this app's own
// other cytology dictionaries already use.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockNonGynCytologyCategoryService } from '../../../services/cytology/mockNonGynCytologyCategoryService';
import type { NonGynCytologyCategoryEntry, NewNonGynCytologyCategoryEntry, NonGynCytologySystem } from '../../../services/cytology/INonGynCytologyCategoryService';

type Draft = NewNonGynCytologyCategoryEntry;
const emptyDraft = (system: NonGynCytologySystem): Draft => ({ system, categoryNumber: '', label: '', requiresPathologistReview: true, active: true });

const SYSTEM_LABEL: Record<NonGynCytologySystem, string> = {
  milan: 'Milan System (Salivary Gland Cytology)',
  paris_urinary: 'Paris System (Urinary Tract Cytology)',
};

const CategoryModal: React.FC<{ mode: 'add' | 'edit'; system: NonGynCytologySystem; entry?: NonGynCytologyCategoryEntry; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, system, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft(system));

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? 'Add Category' : 'Edit Category'} — {SYSTEM_LABEL[system]}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="ngc-category-number">Category Number</label>
          <input id="ngc-category-number" className="ps-conf-input" value={draft.categoryNumber} onChange={e => setDraft({ ...draft, categoryNumber: e.target.value })} placeholder="e.g. IVA" />

          <label className="ps-label" htmlFor="ngc-label">Label</label>
          <input id="ngc-label" className="ps-conf-input" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />

          <label className="ps-label" htmlFor="ngc-abbreviation">Abbreviation (optional)</label>
          <input id="ngc-abbreviation" className="ps-conf-input" value={draft.abbreviation ?? ''} onChange={e => setDraft({ ...draft, abbreviation: e.target.value })} placeholder="e.g. SUMP" />

          <label className="ps-label" htmlFor="ngc-description">Description</label>
          <textarea id="ngc-description" className="ps-conf-input" rows={3} value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />

          <label className="ps-label" htmlFor="ngc-rom">Risk of Malignancy % (optional)</label>
          <input id="ngc-rom" className="ps-conf-input" type="number" min={0} max={100} value={draft.riskOfMalignancyPercent ?? ''}
            onChange={e => setDraft({ ...draft, riskOfMalignancyPercent: e.target.value === '' ? undefined : Number(e.target.value) })} />

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.requiresPathologistReview} onChange={e => setDraft({ ...draft, requiresPathologistReview: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">Requires pathologist review</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.categoryNumber.trim() || !draft.label.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};

const NonGynCytologyCategoriesSection: React.FC = () => {
  const [entries, setEntries] = useState<NonGynCytologyCategoryEntry[]>([]);
  const [system, setSystem] = useState<NonGynCytologySystem>('milan');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: NonGynCytologyCategoryEntry } | null>(null);

  const refresh = () => { mockNonGynCytologyCategoryService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => e.system === system && (showInactive || e.active));

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockNonGynCytologyCategoryService.update(modal.entry.id, draft);
    else await mockNonGynCytologyCategoryService.add(draft);
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: NonGynCytologyCategoryEntry) => {
    if (e.active) await mockNonGynCytologyCategoryService.deactivate(e.id);
    else await mockNonGynCytologyCategoryService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">Non-GYN Cytology Classification Systems</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            Real, admin-editable diagnostic category dictionaries for the Milan System (salivary gland FNA) and the
            Paris System (urinary tract cytology, second edition/TPS 2.0) — genuinely separate from the GYN cervical
            cytology dictionary, since each has its own real, single-axis diagnostic category structure.
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>+ Add Category</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(Object.keys(SYSTEM_LABEL) as NonGynCytologySystem[]).map(s => (
          <button key={s} className={system === s ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setSystem(s)}>{SYSTEM_LABEL[s]}</button>
        ))}
      </div>

      <label className="ps-conf-toggle-label-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">Show inactive</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.categoryNumber}. {e.label}{e.abbreviation ? ` (${e.abbreviation})` : ''}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {e.riskOfMalignancyPercent !== undefined ? `ROM ~${e.riskOfMalignancyPercent}%` : ''}{!e.active ? ' · Inactive' : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">No categories on file for this system.</div>}
      </div>

      {modal && <CategoryModal mode={modal.mode} system={system} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default NonGynCytologyCategoriesSection;
