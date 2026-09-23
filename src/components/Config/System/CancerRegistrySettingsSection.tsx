// src/components/Config/System/CancerRegistrySettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports
// gap — same real 2-tier cascade UI pattern as
// CytologyRegistrySettingsSection.tsx, for the genuinely distinct real
// cancer-registry class (services/cancerRegistry/).
//
// i18n sweep (batch 40): registry display labels resolved via
// REGISTRY_LABEL_KEY + t() — the same "data key stays English, display
// label is translated" shape used for AIContributionTab.tsx's
// SUBSPECIALTY_LABELS (batch 34) and FontsSection.tsx's
// CATEGORY_LABEL_KEY (batch 37). Each registry's real acronym (NAACCR,
// CPAC, COSD, INCa, ADT/GEKID, AIHW, KCCR) is a proper noun and stays
// as-is inside the translated string, matching the "exported/persisted
// data stays English" convention's treatment of real names elsewhere
// (e.g. font names in FontsSection.tsx) — only the surrounding country
// name and the "None" description are actually translated per locale.
// No inline CSS in this file — it already uses the established
// `.ps-conf-*` class family throughout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCancerRegistrySettingsService } from '../../../services/cancerRegistry/mockCancerRegistrySettingsService';
import { mockFacilityCancerRegistryOverrideService } from '../../../services/cancerRegistry/mockFacilityCancerRegistryOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CancerRegistryId } from '../../../services/cancerRegistry/ICancerRegistrySettingsService';
import type { FacilityCancerRegistryOverride } from '../../../services/cancerRegistry/IFacilityCancerRegistryOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const REGISTRIES: CancerRegistryId[] = [
  'none', 'naaccr_us', 'cpac_canada', 'cosd_uk', 'inca_france',
  'adt_gekid_germany', 'aihw_australia', 'nz_cancer_registry', 'kccr_korea',
];

const REGISTRY_LABEL_KEY: Record<CancerRegistryId, string> = {
  none:               'cancerRegistrySection.registries.none',
  naaccr_us:          'cancerRegistrySection.registries.naaccrUs',
  cpac_canada:        'cancerRegistrySection.registries.cpacCanada',
  cosd_uk:            'cancerRegistrySection.registries.cosdUk',
  inca_france:        'cancerRegistrySection.registries.incaFrance',
  adt_gekid_germany:  'cancerRegistrySection.registries.adtGekidGermany',
  aihw_australia:     'cancerRegistrySection.registries.aihwAustralia',
  nz_cancer_registry: 'cancerRegistrySection.registries.nzCancerRegistry',
  kccr_korea:         'cancerRegistrySection.registries.kccrKorea',
};

const CancerRegistrySettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [enterpriseDraft, setEnterpriseDraft] = useState<CancerRegistryId>('none');
  const [savedEnterprise, setSavedEnterprise] = useState<CancerRegistryId>('none');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCancerRegistryOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; registryId: CancerRegistryId } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCancerRegistrySettingsService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.registryId); setSavedEnterprise(r.data.registryId); } });
    mockFacilityService.getAll().then(r => {
      if (!r.ok) return;
      setFacilities(r.data);
      Promise.all(r.data.map(f => mockFacilityCancerRegistryOverrideService.getForFacility(f.id))).then(overrides => {
        setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCancerRegistryOverride } => o.ok && !!o.data).map(o => o.data));
      });
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCancerRegistrySettingsService.update({ registryId: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const registryLabel = (id: CancerRegistryId) => t(REGISTRY_LABEL_KEY[id] ?? id);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('cancerRegistrySection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cancerRegistrySection.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cancerRegistrySection.enterpriseCard.title')}</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CancerRegistryId)}>
            {REGISTRIES.map(id => (<option key={id} value={id}>{t(REGISTRY_LABEL_KEY[id])}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>{t('cancerRegistrySection.save')}</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">{t('cancerRegistrySection.unsavedChange')}</div>}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cancerRegistrySection.facilityCard.title')}</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', registryId: enterpriseDraft })}>{t('cancerRegistrySection.addOverride')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.registryId ? registryLabel(o.overrides.registryId) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCancerRegistryOverrideService.remove(o.facilityId); refresh(); }}>{t('cancerRegistrySection.remove')}</button>
            </div>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div className="ps-conf-empty-row">{t('cancerRegistrySection.noOverrides')}</div>
        )}

        {addingFacility && (
          <div className="ps-conf-row">
            <select className="ps-conf-select" value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div className="ps-conf-row-actions">
              <select className="ps-conf-select" value={addingFacility.registryId} onChange={e => setAddingFacility({ ...addingFacility, registryId: e.target.value as CancerRegistryId })}>
                {REGISTRIES.map(id => (<option key={id} value={id}>{t(REGISTRY_LABEL_KEY[id])}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCancerRegistryOverrideService.create(addingFacility.facilityId, { registryId: addingFacility.registryId });
                setAddingFacility(null); refresh();
              }}>{t('cancerRegistrySection.save')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility(null)}>{t('cancerRegistrySection.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CancerRegistrySettingsSection;
