// src/components/Config/System/ImageManagementSystemVendorDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded image/PDF architecture spec — the admin
// screen for configuring where images/PDFs actually resolve from
// (§1.2). Same real list/add-edit-modal/deactivate pattern as
// WsiViewerVendorDictionarySection.tsx / DpVendorDictionarySection.tsx.
//
// Real, per direct follow-up ("No text strings in these new page/
// modals?") — converted to useTranslation() per the standing i18n
// rule (rule #1: any new page or modal ships with this from the
// start). Confirmed directly first: none of this app's existing
// Config/System admin sections (DpVendorDictionarySection.tsx,
// OrSuiteTerminalsSection.tsx, MigrationFieldMappingsSection.tsx) use
// i18n at all — a genuine, accumulated gap in that folder, not a
// deliberate documented exception. This file and its two siblings
// built in the same pass are fixed; the pre-existing files this file
// only ever renders alongside (never edits) stay out of scope, same
// "only what's actually touched" boundary as WorklistPage.tsx
// elsewhere in this app.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockImageManagementSystemVendorService } from '../../../services/imageAssociation/mockImageManagementSystemVendorService';
import type { ImageManagementSystemVendorEntry, NewImageManagementSystemVendorEntry, ImsDeploymentModel, ImsAuthMethod } from '../../../services/imageAssociation/IImageManagementSystemVendorService';

type Draft = NewImageManagementSystemVendorEntry;

const emptyDraft = (): Draft => ({ name: '', deploymentModel: 'enterprise_ims', authMethod: 'oauth2_bearer', baseUrl: '', active: true });

const DEPLOYMENT_MODELS: ImsDeploymentModel[] = ['enterprise_ims', 'on_prem_file_server'];
const AUTH_METHODS: ImsAuthMethod[] = ['none', 'signed_url', 'oauth2_bearer', 'mtls'];

const VendorModal: React.FC<{
  mode: 'add' | 'edit';
  entry?: ImageManagementSystemVendorEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('imsVendorDictionary.addTitle') : t('imsVendorDictionary.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="ims-name">{t('imsVendorDictionary.nameLabel')}</label>
          <input id="ims-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="ims-deployment">{t('imsVendorDictionary.deploymentLabel')}</label>
          <select id="ims-deployment" className="ps-conf-input" value={draft.deploymentModel}
            onChange={e => setDraft({ ...draft, deploymentModel: e.target.value as ImsDeploymentModel })}>
            {DEPLOYMENT_MODELS.map(v => <option key={v} value={v}>{t(`imsVendorDictionary.deployment.${v}`)}</option>)}
          </select>

          <label className="ps-label" htmlFor="ims-auth">{t('imsVendorDictionary.authLabel')}</label>
          <select id="ims-auth" className="ps-conf-input" value={draft.authMethod}
            onChange={e => setDraft({ ...draft, authMethod: e.target.value as ImsAuthMethod })}>
            {AUTH_METHODS.map(v => <option key={v} value={v}>{t(`imsVendorDictionary.auth.${v}`)}</option>)}
          </select>

          <label className="ps-label" htmlFor="ims-url">{t('imsVendorDictionary.baseUrlLabel')}</label>
          <input
            id="ims-url" className="ps-conf-input" value={draft.baseUrl}
            onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder={t('imsVendorDictionary.baseUrlPlaceholder')}
          />
          <p className="ps-conf-section-subtitle" style={{ marginTop: 4 }}>
            {t('imsVendorDictionary.tokenWarning')}
          </p>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const ImageManagementSystemVendorDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ImageManagementSystemVendorEntry[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: ImageManagementSystemVendorEntry } | null>(null);

  const refresh = () => {
    mockImageManagementSystemVendorService.getAll().then(res => { if (res.ok) setEntries(res.data); });
  };

  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.active);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) {
      await mockImageManagementSystemVendorService.update(modal.entry.id, draft);
    } else {
      await mockImageManagementSystemVendorService.add(draft);
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: ImageManagementSystemVendorEntry) => {
    if (e.active) await mockImageManagementSystemVendorService.deactivate(e.id);
    else await mockImageManagementSystemVendorService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('imsVendorDictionary.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">{t('imsVendorDictionary.description')}</p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('imsVendorDictionary.addSystemBtn')}</button>
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
                {t(`imsVendorDictionary.deployment.${e.deploymentModel}`)} · {t(`imsVendorDictionary.auth.${e.authMethod}`)}
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
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('imsVendorDictionary.emptyRow')}</div>}
      </div>

      {modal && <VendorModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ImageManagementSystemVendorDictionarySection;
