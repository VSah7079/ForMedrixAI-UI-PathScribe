// src/components/Config/System/WsiViewerVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "where is the url to the vendor
// configured?" — confirmed directly first: it wasn't. The data layer
// (IWsiViewerVendorService.ts) and the consumer (WsiViewerLaunchButton.tsx)
// existed with no admin screen to actually set a real vendor's real
// launchUrlTemplate. Same real list/add-edit-modal/deactivate pattern
// as DpVendorDictionarySection.tsx (this app's own established
// dictionary-editor shape), not a new one invented for this section.
//
// i18n sweep (batch 44): real dictionary content (vendor/product name,
// the launch URL template itself, which is a real, admin-entered
// technical value) stays as typed/stored — same convention as
// DpVendorDictionarySection.tsx (batch 41). Only the surrounding page/
// modal chrome goes through the new `wsiViewerVendorSection` namespace.
// The recurring "toggle-row margin"/"meta line" inline-style pair seen
// in DpVendorDictionarySection.tsx and OrSuiteTerminalsSection.tsx
// (batches 41/43) showed up here a third time — real enough repetition
// to converge into two new SHARED classes on the base `.ps-conf-*`
// family (`.ps-conf-toggle-label-row--gap-below`,
// `.ps-conf-row-meta`) rather than adding yet another one-off
// `.ps-wsivendor__*` pair; those earlier two files' own per-file
// classes are left as-is (out of this batch's scope), but any future
// file hitting the same pattern should reach for these shared ones
// directly. The hint/warning paragraph's `marginTop: 4` inline style
// was also a genuine exact match for the already-existing
// `.ps-conf-section-subtitle--top-gap` modifier — reused directly,
// combined with a new `--danger` color modifier for the warning state.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const missingPlaceholder = draft.launchUrlTemplate.trim().length > 0 && !draft.launchUrlTemplate.includes('{{wsiUniqueId}}');

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('wsiViewerVendorSection.modal.addTitle') : t('wsiViewerVendorSection.modal.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="wsi-vendor-name">{t('wsiViewerVendorSection.modal.nameLabel')}</label>
          <input id="wsi-vendor-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="wsi-vendor-url">{t('wsiViewerVendorSection.modal.urlLabel')}</label>
          <input
            id="wsi-vendor-url" className="ps-conf-input" value={draft.launchUrlTemplate}
            onChange={e => setDraft({ ...draft, launchUrlTemplate: e.target.value })}
            placeholder="https://viewer.yourlab.org/view?slideId={{wsiUniqueId}}"
          />
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
            <Trans i18nKey="wsiViewerVendorSection.modal.urlHint" values={{ placeholder: '{{wsiUniqueId}}' }} components={{ code: <code /> }} />
          </p>
          {missingPlaceholder && (
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap ps-conf-section-subtitle--danger">
              <Trans i18nKey="wsiViewerVendorSection.modal.urlWarning" values={{ placeholder: '{{wsiUniqueId}}' }} components={{ code: <code /> }} />
            </p>
          )}
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('wsiViewerVendorSection.modal.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>{t('wsiViewerVendorSection.modal.save')}</button>
        </div>
      </div>
    </div>
  );
};

const WsiViewerVendorDictionarySection: React.FC = () => {
  const { t } = useTranslation();
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
          <h2 className="ps-conf-section-title">{t('wsiViewerVendorSection.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            {t('wsiViewerVendorSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('wsiViewerVendorSection.addVendor')}</button>
      </div>

      <label className="ps-conf-toggle-label-row ps-conf-toggle-label-row--gap-below">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('wsiViewerVendorSection.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.name}
              <span className="ps-conf-row-meta">
                {e.launchUrlTemplate.trim() ? e.launchUrlTemplate : t('wsiViewerVendorSection.noUrlConfigured')}
                {!e.active ? ` · ${t('wsiViewerVendorSection.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? t('wsiViewerVendorSection.actions.deactivate') : t('wsiViewerVendorSection.actions.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('wsiViewerVendorSection.actions.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('wsiViewerVendorSection.emptyRow')}</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default WsiViewerVendorDictionarySection;
