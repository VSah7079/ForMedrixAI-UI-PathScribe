// src/components/Config/System/WsiViewerVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "where is the url to the vendor
// configured?" — confirmed directly first: it wasn't. The data layer
// (IWsiViewerVendorService.ts) and the consumer (WsiViewerLaunchButton.tsx)
// existed with no admin screen to actually set a real vendor's real
// launchUrlTemplate. Same real list/add-edit-modal/deactivate pattern
// as DpVendorDictionarySection.tsx (this app's own established
// dictionary-editor shape), not a new one invented for this section.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockWsiViewerVendorService } from '../../../services/digitalPathology/mockWsiViewerVendorService';
import type { WsiViewerVendorEntry, NewWsiViewerVendorEntry } from '../../../services/digitalPathology/IWsiViewerVendorService';

type Draft = NewWsiViewerVendorEntry;

const emptyDraft = (): Draft => ({ name: '', launchUrlTemplate: '', active: true });

const VendorModal: React.FC<{
  mode: 'add' | 'edit';
  entry?: WsiViewerVendorEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const missingPlaceholder = draft.launchUrlTemplate.trim().length > 0 && !draft.launchUrlTemplate.includes('{{wsiUniqueId}}');

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? 'Add WSI Viewer Vendor' : 'Edit WSI Viewer Vendor'}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="wsi-vendor-name">Vendor / Product Name</label>
          <input id="wsi-vendor-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="wsi-vendor-url">Launch URL Template</label>
          <input
            id="wsi-vendor-url" className="ps-conf-input" value={draft.launchUrlTemplate}
            onChange={e => setDraft({ ...draft, launchUrlTemplate: e.target.value })}
            placeholder="https://viewer.yourlab.org/view?slideId={{wsiUniqueId}}"
          />
          <p className="ps-conf-section-subtitle" style={{ marginTop: 4 }}>
            Must contain the literal placeholder <code>{'{{wsiUniqueId}}'}</code> — replaced with the slide's own
            barcode at launch time. Leave blank until this vendor's real viewer URL is known.
          </p>
          {missingPlaceholder && (
            <p className="ps-conf-section-subtitle" style={{ marginTop: 4, color: '#f87171' }}>
              This URL doesn't contain <code>{'{{wsiUniqueId}}'}</code> — launching will fail until it does.
            </p>
          )}
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};

const WsiViewerVendorDictionarySection: React.FC = () => {
  const [entries, setEntries] = useState<WsiViewerVendorEntry[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: WsiViewerVendorEntry } | null>(null);

  const refresh = () => {
    mockWsiViewerVendorService.getAll().then(res => { if (res.ok) setEntries(res.data); });
  };

  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.active);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) {
      await mockWsiViewerVendorService.update(modal.entry.id, draft);
    } else {
      await mockWsiViewerVendorService.add(draft);
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: WsiViewerVendorEntry) => {
    if (e.active) await mockWsiViewerVendorService.deactivate(e.id);
    else await mockWsiViewerVendorService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">WSI Viewer Vendors</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            Real, launchable whole-slide-image viewer platforms — configure each vendor's real launch URL here once
            it's known. PathScribe never renders the slide itself; it opens the vendor's own viewer with the slide's
            barcode substituted into this URL.
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
              {e.name}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {e.launchUrlTemplate.trim() ? e.launchUrlTemplate : 'No launch URL configured yet'}
                {!e.active ? ' · Inactive' : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">No WSI viewer vendors on file.</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default WsiViewerVendorDictionarySection;
