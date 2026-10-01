// src/components/Config/System/MasterPaymentTypeDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.1 + "Step 1
// should be under System / Financial"): admin CRUD for the
// jurisdiction-agnostic Master Payment Type dictionary. Registered
// under the existing 'Financial & Revenue Lookups' sidebar group
// (Config/System/index.tsx) alongside Billing Dictionary/RVU Code
// Map/NCCI Edit Rules — a real, established group this app already
// has, not a new one invented for this feature.
//
// i18n sweep (batch 55): real, admin-entered data (category `id`,
// `displayName`, `subscriberIdLabel`, `notes`) stays as typed/stored
// — only page chrome is translated. `requiresGuarantor` remains the
// real internal 'required' | 'optional' | 'not_required' value used
// for logic; only its on-screen text now resolves through a
// `GUARANTOR_LABEL_KEY` map (reusing `common.required`/
// `common.optional` where the wording matches exactly).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockMasterPaymentTypeService } from '../../../services/billing/mockMasterPaymentTypeService';
import type { MasterPaymentType, GuarantorRequirement } from '../../../types/billing/MasterPaymentType';

const GUARANTOR_LABEL_KEY: Record<GuarantorRequirement, string> = {
  required: 'common.required',
  optional: 'common.optional',
  not_required: 'masterPaymentTypeDictionarySection.notRequired',
};

function blankDraft(): Partial<MasterPaymentType> {
  return {
    id: '', displayName: '', requiresSubscriberId: false, subscriberIdLabel: '',
    requiresGuarantor: 'not_required', supportsSplitBilling: false, notes: '',
  };
}

const MasterPaymentTypeDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MasterPaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: MasterPaymentType } | null>(null);
  const [draft, setDraft] = useState<Partial<MasterPaymentType>>(blankDraft());

  const refresh = () => {
    setLoading(true);
    mockMasterPaymentTypeService.getAll().then(res => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  };
  useEffect(refresh, []);

  const openAdd = () => { setDraft(blankDraft()); setModal({ mode: 'add' }); };
  const openEdit = (e: MasterPaymentType) => { setDraft(e); setModal({ mode: 'edit', entry: e }); };

  const canSave = !!draft.id?.trim() && !!draft.displayName?.trim()
    && (modal?.mode === 'edit' || !entries.some(e => e.id === draft.id?.trim().toUpperCase().replace(/\s+/g, '_')));

  const handleSave = async () => {
    if (!canSave) return;
    if (modal?.mode === 'add') {
      const res = await mockMasterPaymentTypeService.add({
        id: draft.id!.trim().toUpperCase().replace(/\s+/g, '_'),
        displayName: draft.displayName!.trim(),
        requiresSubscriberId: !!draft.requiresSubscriberId,
        subscriberIdLabel: draft.requiresSubscriberId ? (draft.subscriberIdLabel?.trim() || undefined) : undefined,
        requiresGuarantor: draft.requiresGuarantor ?? 'not_required',
        supportsSplitBilling: !!draft.supportsSplitBilling,
        notes: draft.notes?.trim() || undefined,
      });
      if (!res.ok) { alert((res as any).error); return; }
    } else if (modal?.entry) {
      const res = await mockMasterPaymentTypeService.update(modal.entry.id, {
        displayName: draft.displayName!.trim(),
        requiresSubscriberId: !!draft.requiresSubscriberId,
        subscriberIdLabel: draft.requiresSubscriberId ? (draft.subscriberIdLabel?.trim() || undefined) : undefined,
        requiresGuarantor: draft.requiresGuarantor ?? 'not_required',
        supportsSplitBilling: !!draft.supportsSplitBilling,
        notes: draft.notes?.trim() || undefined,
      });
      if (!res.ok) { alert((res as any).error); return; }
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: MasterPaymentType) => {
    const res = e.active ? await mockMasterPaymentTypeService.deactivate(e.id) : await mockMasterPaymentTypeService.reactivate(e.id);
    if (res.ok) refresh();
  };

  const displayed = entries.filter(e => showInactive || e.active);

  if (loading) return <div className="ps-conf-loading">{t('masterPaymentTypeDictionarySection.loading')}</div>;

  return (
    <div>
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">💳 {t('masterPaymentTypeDictionarySection.title')}</h2>
        <p className="ps-defic-page-subtitle">
          {t('masterPaymentTypeDictionarySection.subtitle')}
        </p>
      </div>

      <div className="ps-mptd__toolbar">
        <label className="ps-sub-toggle-wrap ps-mptd__toggle-wrap">
          <div onClick={() => setShowInactive(v => !v)} className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}>
            <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
          </div>
          <span className="ps-tat-hint-text">{t('common.showInactive')}</span>
        </label>
        <button className="ps-conf-btn-primary" onClick={openAdd}>{t('masterPaymentTypeDictionarySection.addBtn')}</button>
      </div>

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.categoryId')}</th>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.displayName')}</th>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.subscriberId')}</th>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.guarantor')}</th>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.splitBilling')}</th>
              <th className="ps-conf-th">{t('masterPaymentTypeDictionarySection.table.status')}</th>
              <th className="ps-conf-th"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>{t('masterPaymentTypeDictionarySection.emptyRow')}</td></tr>}
            {displayed.map(e => (
              <tr key={e.id} className={e.active ? '' : 'ps-mptd__row--inactive'}>
                <td className="ps-conf-td"><code className="ps-mptd__id-code">{e.id}</code></td>
                <td className="ps-conf-td">{e.displayName}</td>
                <td className="ps-conf-td">{e.requiresSubscriberId ? (e.subscriberIdLabel ? t('masterPaymentTypeDictionarySection.requiredWithLabel', { label: e.subscriberIdLabel }) : t('common.required')) : t(GUARANTOR_LABEL_KEY.not_required)}</td>
                <td className="ps-conf-td">{t(GUARANTOR_LABEL_KEY[e.requiresGuarantor])}</td>
                <td className="ps-conf-td">{e.supportsSplitBilling ? t('common.yes') : t('common.no')}</td>
                <td className="ps-conf-td">{e.active ? t('common.active') : t('common.inactive')}</td>
                <td className="ps-conf-td ps-mptd__actions-cell">
                  <button className="ps-conf-btn-secondary ps-mptd__edit-btn" onClick={() => openEdit(e)}>{t('common.edit')}</button>
                  <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? t('common.deactivate') : t('common.reactivate')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="ps-conf-backdrop" onClick={() => setModal(null)}>
          <div className="ps-macro-import-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">{modal.mode === 'add' ? t('masterPaymentTypeDictionarySection.modal.addTitle') : t('masterPaymentTypeDictionarySection.modal.editTitle', { name: modal.entry?.displayName })}</div>

            <label className="ps-conf-label">{t('masterPaymentTypeDictionarySection.modal.categoryIdLabel')} {modal.mode === 'edit' && <span className="ps-mptd__locked-hint">{t('masterPaymentTypeDictionarySection.modal.categoryIdLockedHint')}</span>}</label>
            <input className="ps-conf-input" value={draft.id ?? ''} disabled={modal.mode === 'edit'}
              onChange={e => setDraft(d => ({ ...d, id: e.target.value }))} placeholder={t('masterPaymentTypeDictionarySection.modal.categoryIdPlaceholder')} />

            <label className="ps-conf-label">{t('masterPaymentTypeDictionarySection.modal.displayNameLabel')}</label>
            <input className="ps-conf-input" value={draft.displayName ?? ''} onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))} />

            <label className="ps-conf-label ps-mptd__checkbox-label">
              <input type="checkbox" checked={!!draft.requiresSubscriberId} onChange={e => setDraft(d => ({ ...d, requiresSubscriberId: e.target.checked }))} />
              {t('masterPaymentTypeDictionarySection.modal.requiresSubscriberIdLabel')}
            </label>
            {draft.requiresSubscriberId && (
              <input className="ps-conf-input" value={draft.subscriberIdLabel ?? ''} onChange={e => setDraft(d => ({ ...d, subscriberIdLabel: e.target.value }))}
                placeholder={t('masterPaymentTypeDictionarySection.modal.subscriberIdLabelPlaceholder')} />
            )}

            <label className="ps-conf-label">{t('masterPaymentTypeDictionarySection.modal.requiresGuarantorLabel')}</label>
            <select className="ps-conf-select" value={draft.requiresGuarantor ?? 'not_required'} onChange={e => setDraft(d => ({ ...d, requiresGuarantor: e.target.value as GuarantorRequirement }))}>
              <option value="not_required">{t(GUARANTOR_LABEL_KEY.not_required)}</option>
              <option value="optional">{t(GUARANTOR_LABEL_KEY.optional)}</option>
              <option value="required">{t(GUARANTOR_LABEL_KEY.required)}</option>
            </select>

            <label className="ps-conf-label ps-mptd__checkbox-label ps-mptd__checkbox-label--gap-top">
              <input type="checkbox" checked={!!draft.supportsSplitBilling} onChange={e => setDraft(d => ({ ...d, supportsSplitBilling: e.target.checked }))} />
              {t('masterPaymentTypeDictionarySection.modal.supportsSplitBillingLabel')}
            </label>

            <label className="ps-conf-label">{t('masterPaymentTypeDictionarySection.modal.notesLabel')}</label>
            <input className="ps-conf-input" value={draft.notes ?? ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />

            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setModal(null)}>{t('common.cancel')}</button>
              <button className="ps-conf-btn-primary" disabled={!canSave} onClick={handleSave}>{modal.mode === 'add' ? t('common.create') : t('masterPaymentTypeDictionarySection.modal.saveChangesBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterPaymentTypeDictionarySection;
