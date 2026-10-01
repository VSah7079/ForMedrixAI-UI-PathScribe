// src/components/Config/System/JurisdictionPaymentMappingSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.2 + "Step 1
// should be under System / Financial"): admin CRUD for the per-country
// local-scheme mappings, each pointing at a real Master Payment Type.
//
// i18n sweep (batch 50): real, admin-entered data (countryCode,
// localSchemeCode, localDisplayTerminology, primaryOutboundFormat,
// notes, and the resolved masterTypeName() display) stays as typed/
// stored — only the surrounding page chrome (headers, labels,
// buttons, placeholders) goes through the new
// `jurisdictionPaymentMappingSection` namespace.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockJurisdictionPaymentMappingService } from '../../../services/billing/mockJurisdictionPaymentMappingService';
import { mockMasterPaymentTypeService } from '../../../services/billing/mockMasterPaymentTypeService';
import type { JurisdictionPaymentMapping } from '../../../types/billing/JurisdictionPaymentMapping';
import type { MasterPaymentType } from '../../../types/billing/MasterPaymentType';

function blankDraft(): Partial<JurisdictionPaymentMapping> {
  return { countryCode: '', localSchemeCode: '', localDisplayTerminology: '', masterPaymentTypeId: '', primaryOutboundFormat: '', notes: '' };
}

const JurisdictionPaymentMappingSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<JurisdictionPaymentMapping[]>([]);
  const [masterTypes, setMasterTypes] = useState<MasterPaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: JurisdictionPaymentMapping } | null>(null);
  const [draft, setDraft] = useState<Partial<JurisdictionPaymentMapping>>(blankDraft());

  const refresh = () => {
    setLoading(true);
    Promise.all([mockJurisdictionPaymentMappingService.getAll(), mockMasterPaymentTypeService.getAll()]).then(([mapRes, typeRes]) => {
      if (mapRes.ok) setEntries(mapRes.data);
      if (typeRes.ok) setMasterTypes(typeRes.data);
      setLoading(false);
    });
  };
  useEffect(refresh, []);

  const masterTypeName = (id: string) => masterTypes.find(t => t.id === id)?.displayName ?? id;

  const openAdd = () => { setDraft(blankDraft()); setModal({ mode: 'add' }); };
  const openEdit = (e: JurisdictionPaymentMapping) => { setDraft(e); setModal({ mode: 'edit', entry: e }); };

  const canSave = !!draft.countryCode?.trim() && !!draft.localSchemeCode?.trim()
    && !!draft.localDisplayTerminology?.trim() && !!draft.masterPaymentTypeId && !!draft.primaryOutboundFormat?.trim();

  const handleSave = async () => {
    if (!canSave) return;
    const payload = {
      countryCode: draft.countryCode!.trim().toUpperCase(),
      localSchemeCode: draft.localSchemeCode!.trim().toUpperCase(),
      localDisplayTerminology: draft.localDisplayTerminology!.trim(),
      masterPaymentTypeId: draft.masterPaymentTypeId!,
      primaryOutboundFormat: draft.primaryOutboundFormat!.trim(),
      notes: draft.notes?.trim() || undefined,
    };
    const res = modal?.mode === 'add'
      ? await mockJurisdictionPaymentMappingService.add(payload)
      : await mockJurisdictionPaymentMappingService.update(modal!.entry!.id, payload);
    if (!res.ok) { alert((res as any).error); return; }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: JurisdictionPaymentMapping) => {
    const res = e.active ? await mockJurisdictionPaymentMappingService.deactivate(e.id) : await mockJurisdictionPaymentMappingService.reactivate(e.id);
    if (res.ok) refresh();
  };

  const countries = Array.from(new Set(entries.map(e => e.countryCode))).sort();
  const displayed = entries
    .filter(e => showInactive || e.active)
    .filter(e => !countryFilter || e.countryCode === countryFilter)
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.localSchemeCode.localeCompare(b.localSchemeCode));

  if (loading) return <div className="ps-conf-loading">{t('jurisdictionPaymentMappingSection.loading')}</div>;

  return (
    <div>
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">🌍 {t('jurisdictionPaymentMappingSection.title')}</h2>
        <p className="ps-defic-page-subtitle">
          {t('jurisdictionPaymentMappingSection.subtitle')}
        </p>
      </div>

      <div className="ps-jpm__toolbar">
        <div className="ps-jpm__toolbar-left">
          <select className="ps-conf-select" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">{t('jurisdictionPaymentMappingSection.filters.allCountries')}</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="ps-sub-toggle-wrap ps-jpm__toggle-wrap">
            <div onClick={() => setShowInactive(v => !v)} className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}>
              <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
            </div>
            <span className="ps-tat-hint-text">{t('common.showInactive')}</span>
          </label>
        </div>
        <button className="ps-conf-btn-primary" onClick={openAdd}>{t('jurisdictionPaymentMappingSection.addMappingBtn')}</button>
      </div>

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.country')}</th>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.localScheme')}</th>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.localTerminology')}</th>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.masterPaymentType')}</th>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.outboundFormat')}</th>
              <th className="ps-conf-th">{t('jurisdictionPaymentMappingSection.table.status')}</th>
              <th className="ps-conf-th"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>{t('jurisdictionPaymentMappingSection.emptyRow')}</td></tr>}
            {displayed.map(e => (
              <tr key={e.id} className={e.active ? '' : 'ps-jpm__row--inactive'}>
                <td className="ps-conf-td">{e.countryCode}</td>
                <td className="ps-conf-td"><code className="ps-jpm__scheme-code">{e.localSchemeCode}</code></td>
                <td className="ps-conf-td">{e.localDisplayTerminology}</td>
                <td className="ps-conf-td">{masterTypeName(e.masterPaymentTypeId)}</td>
                <td className="ps-conf-td">{e.primaryOutboundFormat}</td>
                <td className="ps-conf-td">{e.active ? t('common.active') : t('common.inactive')}</td>
                <td className="ps-conf-td ps-jpm__actions-cell">
                  <button className="ps-conf-btn-secondary ps-jpm__edit-btn" onClick={() => openEdit(e)}>{t('common.edit')}</button>
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
            <div className="ps-ose-quicktext-title">{modal.mode === 'add' ? t('jurisdictionPaymentMappingSection.modal.addTitle') : t('jurisdictionPaymentMappingSection.modal.editTitle', { scheme: modal.entry?.localSchemeCode })}</div>

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.countryCodeLabel')}</label>
            <input className="ps-conf-input" value={draft.countryCode ?? ''} onChange={e => setDraft(d => ({ ...d, countryCode: e.target.value }))}
              placeholder={t('jurisdictionPaymentMappingSection.modal.countryCodePlaceholder')} />

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.localSchemeCodeLabel')}</label>
            <input className="ps-conf-input" value={draft.localSchemeCode ?? ''} onChange={e => setDraft(d => ({ ...d, localSchemeCode: e.target.value }))}
              placeholder={t('jurisdictionPaymentMappingSection.modal.localSchemeCodePlaceholder')} />

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.localTerminologyLabel')}</label>
            <input className="ps-conf-input" value={draft.localDisplayTerminology ?? ''} onChange={e => setDraft(d => ({ ...d, localDisplayTerminology: e.target.value }))}
              placeholder={t('jurisdictionPaymentMappingSection.modal.localTerminologyPlaceholder')} />

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.masterPaymentTypeLabel')}</label>
            <select className="ps-conf-select" value={draft.masterPaymentTypeId ?? ''} onChange={e => setDraft(d => ({ ...d, masterPaymentTypeId: e.target.value }))}>
              <option value="">{t('jurisdictionPaymentMappingSection.modal.selectPlaceholder')}</option>
              {masterTypes.filter(t2 => t2.active).map(t2 => <option key={t2.id} value={t2.id}>{t2.displayName}</option>)}
            </select>

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.outboundFormatLabel')}</label>
            <input className="ps-conf-input" value={draft.primaryOutboundFormat ?? ''} onChange={e => setDraft(d => ({ ...d, primaryOutboundFormat: e.target.value }))}
              placeholder={t('jurisdictionPaymentMappingSection.modal.outboundFormatPlaceholder')} />

            <label className="ps-conf-label">{t('jurisdictionPaymentMappingSection.modal.notesLabel')}</label>
            <input className="ps-conf-input" value={draft.notes ?? ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />

            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setModal(null)}>{t('common.cancel')}</button>
              <button className="ps-conf-btn-primary" disabled={!canSave} onClick={handleSave}>{modal.mode === 'add' ? t('jurisdictionPaymentMappingSection.modal.createBtn') : t('jurisdictionPaymentMappingSection.modal.saveChangesBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JurisdictionPaymentMappingSection;
