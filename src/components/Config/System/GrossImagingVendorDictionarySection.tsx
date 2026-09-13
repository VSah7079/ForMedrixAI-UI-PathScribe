// src/components/Config/System/GrossImagingVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research into point-of-capture gross/macro
// imaging and telepathology vendors. Same real list/add-edit-modal/
// deactivate pattern as every other vendor dictionary in this app.
//
// Converted to useTranslation() per direct follow-up ("No text
// strings in these new page/modals?") — see
// ImageManagementSystemVendorDictionarySection.tsx's own header for
// the full reasoning on why this file is in scope for that fix and
// its pre-existing siblings (DpVendorDictionarySection.tsx etc.) are
// not.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockGrossImagingVendorService } from '../../../services/imageAssociation/mockGrossImagingVendorService';
import type { GrossImagingVendorEntry, NewGrossImagingVendorEntry } from '../../../services/imageAssociation/IGrossImagingVendorService';

type Draft = NewGrossImagingVendorEntry;

const emptyDraft = (): Draft => ({ name: '', authMethod: 'none', baseUrl: '', supportsTelepathology: false, active: true });

const AUTH_METHODS: Draft['authMethod'][] = ['none', 'signed_url', 'oauth2_bearer', 'mtls'];

const VendorModal: React.FC<{
  mode: 'add' | 'edit';
  entry?: GrossImagingVendorEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('grossImagingVendorDictionary.addTitle') : t('grossImagingVendorDictionary.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="gi-name">{t('grossImagingVendorDictionary.nameLabel')}</label>
          <input id="gi-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="gi-auth">{t('grossImagingVendorDictionary.authLabel')}</label>
          <select id="gi-auth" className="ps-conf-input" value={draft.authMethod}
            onChange={e => setDraft({ ...draft, authMethod: e.target.value as Draft['authMethod'] })}>
            {AUTH_METHODS.map(v => <option key={v} value={v}>{t(`grossImagingVendorDictionary.auth.${v}`)}</option>)}
          </select>

          <label className="ps-label" htmlFor="gi-url">{t('grossImagingVendorDictionary.baseUrlLabel')}</label>
          <input id="gi-url" className="ps-conf-input" value={draft.baseUrl} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder={t('grossImagingVendorDictionary.baseUrlPlaceholder')} />

          <label className="ps-conf-toggle-label-row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={draft.supportsTelepathology} onChange={e => setDraft({ ...draft, supportsTelepathology: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('grossImagingVendorDictionary.telepathologyCheckbox')}</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const GrossImagingVendorDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<GrossImagingVendorEntry[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: GrossImagingVendorEntry } | null>(null);

  const refresh = () => {
    mockGrossImagingVendorService.getAll().then(res => { if (res.ok) setEntries(res.data); });
  };

  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.active);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) {
      await mockGrossImagingVendorService.update(modal.entry.id, draft);
    } else {
      await mockGrossImagingVendorService.add(draft);
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: GrossImagingVendorEntry) => {
    if (e.active) await mockGrossImagingVendorService.deactivate(e.id);
    else await mockGrossImagingVendorService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('grossImagingVendorDictionary.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">{t('grossImagingVendorDictionary.description')}</p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('grossImagingVendorDictionary.addVendorBtn')}</button>
      </div>

      <label className="ps-conf-toggle-label-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('common.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.name}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {e.supportsTelepathology ? t('grossImagingVendorDictionary.telepathologyCapable') : t('grossImagingVendorDictionary.staticOnly')}
                {e.baseUrl.trim() ? '' : ` · ${t('imsVendorDictionary.noBaseUrl')}`}
                {!e.active ? ` · ${t('common.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? t('common.deactivate') : t('common.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('common.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('grossImagingVendorDictionary.emptyRow')}</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default GrossImagingVendorDictionarySection;
