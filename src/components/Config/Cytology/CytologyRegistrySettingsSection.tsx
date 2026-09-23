// src/components/Config/Cytology/CytologyRegistrySettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — same real 2-tier cascade UI pattern as
// CytologyNomenclatureSettingsSection.tsx. Real, per direct reminder
// ("reusing PathScribe CSS objects... no inline CSS") — real, named
// CSS classes throughout, no style={{...}} anywhere in this file.
//
// i18n note: `registryId` is a real, persisted enum value — the
// module-level `REGISTRIES` array (outside the component, so it
// can't call `useTranslation()` itself) carries a `labelKey` per
// entry, resolved with `t()` at each render site. Same real two-tier
// cascade pattern as `CytologyNomenclatureSettingsSection.tsx` (batch
// 190) — reuses its exact-text keys throughout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyRegistrySettingsService } from '../../../services/cytology/mockCytologyRegistrySettingsService';
import { mockFacilityCytologyRegistryOverrideService } from '../../../services/cytology/mockFacilityCytologyRegistryOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CytologyRegistryId } from '../../../services/cytology/ICytologyRegistrySettingsService';
import type { FacilityCytologyRegistryOverride } from '../../../services/cytology/IFacilityCytologyRegistryOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const REGISTRIES: { id: CytologyRegistryId; labelKey: string }[] = [
  { id: 'none', labelKey: 'cancerRegistrySection.registries.none' },
  { id: 'csms_uk', labelKey: 'cytologyRegistrySettingsSection.registries.csmsUk' },
  { id: 'cervicalcheck_ireland', labelKey: 'cytologyRegistrySettingsSection.registries.cervicalCheckIreland' },
  { id: 'palga_netherlands', labelKey: 'cytologyRegistrySettingsSection.registries.palgaNetherlands' },
  { id: 'ncsr_australia', labelKey: 'cytologyRegistrySettingsSection.registries.ncsrAustralia' },
  { id: 'kncsp_kccr_korea', labelKey: 'cytologyRegistrySettingsSection.registries.kncspKccrKorea' },
];

const CytologyRegistrySettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [enterpriseDraft, setEnterpriseDraft] = useState<CytologyRegistryId>('none');
  const [savedEnterprise, setSavedEnterprise] = useState<CytologyRegistryId>('none');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyRegistryOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; registryId: CytologyRegistryId } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCytologyRegistrySettingsService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.registryId); setSavedEnterprise(r.data.registryId); } });
    mockFacilityService.getAll().then(r => {
      if (!r.ok) return;
      setFacilities(r.data);
      Promise.all(r.data.map(f => mockFacilityCytologyRegistryOverrideService.getForFacility(f.id))).then(overrides => {
        setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyRegistryOverride } => o.ok && !!o.data).map(o => o.data));
      });
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCytologyRegistrySettingsService.update({ registryId: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const registryLabel = (id: CytologyRegistryId) => t(REGISTRIES.find(r => r.id === id)?.labelKey ?? id);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('cytologyRegistrySettingsSection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyRegistrySettingsSection.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.enterprise.title')}</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CytologyRegistryId)}>
            {REGISTRIES.map(r => (<option key={r.id} value={r.id}>{t(r.labelKey)}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>{t('common.save')}</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</div>}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.facility.title')}</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', registryId: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.registryId ? registryLabel(o.overrides.registryId) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyRegistryOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
            </div>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div className="ps-conf-empty-row">{t('cytologyQcSettingsSection.facility.emptyState')}</div>
        )}

        {addingFacility && (
          <div className="ps-conf-row">
            <select className="ps-conf-select" value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div className="ps-conf-row-actions">
              <select className="ps-conf-select" value={addingFacility.registryId} onChange={e => setAddingFacility({ ...addingFacility, registryId: e.target.value as CytologyRegistryId })}>
                {REGISTRIES.map(r => (<option key={r.id} value={r.id}>{t(r.labelKey)}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyRegistryOverrideService.create(addingFacility.facilityId, { registryId: addingFacility.registryId });
                setAddingFacility(null); refresh();
              }}>{t('common.save')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CytologyRegistrySettingsSection;
