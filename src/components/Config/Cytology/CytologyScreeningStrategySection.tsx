// src/components/Config/Cytology/CytologyScreeningStrategySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — same real 2-tier cascade UI pattern as
// CytologyNomenclatureSettingsSection.tsx. Real, honest scope: covers
// the base screeningStrategy field only — CytologyScreeningStrategyConfig's
// own optional ageStratifiedRule (Germany's G-BA age-stratified
// protocol) is real, separate, later work, not covered by this pass.
// Real, per direct reminder ("reusing PathScribe CSS objects... no
// inline CSS") — real, named CSS classes throughout, no style={{...}}
// anywhere in this file.
//
// i18n note: `screeningStrategy` ('co_testing'/'primary_hpv_reflex'/
// 'cytology_only') is a real, persisted enum value — the module-level
// `STRATEGIES` array (outside the component, so it can't call
// `useTranslation()` itself) carries a `labelKey` per entry, resolved
// with `t()` at each render site. Same real two-tier cascade pattern
// as the sibling `CytologyNomenclatureSettingsSection.tsx` (batch
// 190) — reuses its exact-text keys throughout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyScreeningStrategyService } from '../../../services/cytology/mockCytologyScreeningStrategyService';
import { mockFacilityCytologyScreeningStrategyOverrideService } from '../../../services/cytology/mockFacilityCytologyScreeningStrategyOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CytologyScreeningStrategy } from '../../../services/cytology/ICytologyScreeningStrategyService';
import type { FacilityCytologyScreeningStrategyOverride } from '../../../services/cytology/IFacilityCytologyScreeningStrategyOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const STRATEGIES: { id: CytologyScreeningStrategy; labelKey: string }[] = [
  { id: 'co_testing', labelKey: 'cytologyScreeningStrategySection.strategies.coTesting' },
  { id: 'primary_hpv_reflex', labelKey: 'cytologyScreeningStrategySection.strategies.primaryHpvReflex' },
  { id: 'cytology_only', labelKey: 'cytologyScreeningStrategySection.strategies.cytologyOnly' },
];

const CytologyScreeningStrategySection: React.FC = () => {
  const { t } = useTranslation();
  const [enterpriseDraft, setEnterpriseDraft] = useState<CytologyScreeningStrategy>('co_testing');
  const [savedEnterprise, setSavedEnterprise] = useState<CytologyScreeningStrategy>('co_testing');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyScreeningStrategyOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; strategy: CytologyScreeningStrategy } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCytologyScreeningStrategyService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.screeningStrategy); setSavedEnterprise(r.data.screeningStrategy); } });
    mockFacilityService.getAll().then(r => {
      if (!r.ok) return;
      setFacilities(r.data);
      Promise.all(r.data.map(f => mockFacilityCytologyScreeningStrategyOverrideService.getForFacility(f.id))).then(overrides => {
        setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyScreeningStrategyOverride } => o.ok && !!o.data).map(o => o.data));
      });
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCytologyScreeningStrategyService.update({ screeningStrategy: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const strategyLabel = (id: CytologyScreeningStrategy) => t(STRATEGIES.find(s => s.id === id)?.labelKey ?? id);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('cytologyScreeningStrategySection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyScreeningStrategySection.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.enterprise.title')}</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CytologyScreeningStrategy)}>
            {STRATEGIES.map(s => (<option key={s.id} value={s.id}>{t(s.labelKey)}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>{t('common.save')}</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</div>}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.facility.title')}</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', strategy: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.screeningStrategy ? strategyLabel(o.overrides.screeningStrategy) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyScreeningStrategyOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
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
              <select className="ps-conf-select" value={addingFacility.strategy} onChange={e => setAddingFacility({ ...addingFacility, strategy: e.target.value as CytologyScreeningStrategy })}>
                {STRATEGIES.map(s => (<option key={s.id} value={s.id}>{t(s.labelKey)}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyScreeningStrategyOverrideService.create(addingFacility.facilityId, { screeningStrategy: addingFacility.strategy });
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

export default CytologyScreeningStrategySection;
