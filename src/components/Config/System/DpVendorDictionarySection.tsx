// src/components/Config/System/DpVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own DP/AI vendor integration plan's final
// remaining item — "Admin UI: DP vendor dictionary editor." Same real
// list/add-edit-modal/deactivate pattern this app's own other
// dictionaries already use (StaffTab.tsx's own real modal structure:
// ps-conf-backdrop → ps-conf-modal → header/body/footer). Real, named
// CSS classes throughout, no inline styles.
//
// i18n sweep (batch 41): the vendor/product/modality data entered by
// admins (DpVendorEntry.name/productName/modality) is real free-text
// dictionary content, not app UI chrome — stays as typed, same as
// every other dictionary in this app. Only the surrounding page/modal
// labels and status text go through the new `dpVendorSection`
// namespace. The two remaining hand-rolled inline styles (the
// "(vendor name)" suffix color and the modality/status meta line) are
// now a small `.ps-dpvendor__*` class family; the "Show inactive"
// row's margin-bottom is a modifier combined with the existing
// `.ps-conf-toggle-label-row` base class.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('dpVendorSection.modal.addTitle') : t('dpVendorSection.modal.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="dp-vendor-name">{t('dpVendorSection.modal.vendorNameLabel')}</label>
          <input id="dp-vendor-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="dp-vendor-product">{t('dpVendorSection.modal.productNameLabel')}</label>
          <input id="dp-vendor-product" className="ps-conf-input" value={draft.productName} onChange={e => setDraft({ ...draft, productName: e.target.value })} />

          <label className="ps-label" htmlFor="dp-vendor-modality">{t('dpVendorSection.modal.modalityLabel')}</label>
          <input id="dp-vendor-modality" className="ps-conf-input" value={draft.modality} onChange={e => setDraft({ ...draft, modality: e.target.value })}
            placeholder={t('dpVendorSection.modal.modalityPlaceholder')} />

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.fdaCleared} onChange={e => setDraft({ ...draft, fdaCleared: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('dpVendorSection.status.fdaCleared')}</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('dpVendorSection.modal.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim() || !draft.productName.trim() || !draft.modality.trim()}>{t('dpVendorSection.modal.save')}</button>
        </div>
      </div>
    </div>
  );
};

const DpVendorDictionarySection: React.FC = () => {
  const { t } = useTranslation();
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
          <h2 className="ps-conf-section-title">{t('dpVendorSection.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            {t('dpVendorSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('dpVendorSection.addVendor')}</button>
      </div>

      <label className="ps-conf-toggle-label-row ps-dpvendor__toggle-row">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('dpVendorSection.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.productName} <em className="ps-dpvendor__name-suffix">({e.name})</em>
              <span className="ps-dpvendor__meta">
                {e.modality}{e.fdaCleared ? ` · ${t('dpVendorSection.status.fdaCleared')}` : ''}{!e.active ? ` · ${t('dpVendorSection.status.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? t('dpVendorSection.actions.deactivate') : t('dpVendorSection.actions.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('dpVendorSection.actions.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('dpVendorSection.emptyRow')}</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default DpVendorDictionarySection;
