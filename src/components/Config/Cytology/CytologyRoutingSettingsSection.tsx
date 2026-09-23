// src/components/Config/Cytology/CytologyRoutingSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — same real 2-tier cascade UI pattern as
// CytologyNomenclatureSettingsSection.tsx. This is PS-158's own,
// original real cascade — every other Cytology cascade in this module
// (Nomenclature, Registry, Screening Strategy) was explicitly modeled
// on this one's real shape. Real, per direct reminder ("reusing
// PathScribe CSS objects... no inline CSS") — real, named CSS classes
// throughout, no style={{...}} anywhere in this file.
// ─────────────────────────────────────────────────────────────────────────────

//
// i18n note: `nonGynCytologyRouting` is a real, persisted enum value —
// the module-level `ROUTES` array (outside the component, so it
// can't call `useTranslation()` itself) carries a `labelKey` per
// entry, resolved with `t()` at each render site. Same real two-tier
// cascade pattern as `CytologyNomenclatureSettingsSection.tsx` (batch
// 190) — reuses its exact-text keys throughout.

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyRoutingSettingsService } from '../../../services/cytology/mockCytologyRoutingSettingsService';
import { mockFacilityCytologyRoutingOverrideService } from '../../../services/cytology/mockFacilityCytologyRoutingOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { NonGynCytologyRouting } from '../../../services/cytology/ICytologyRoutingSettingsService';
import type { FacilityCytologyRoutingOverride } from '../../../services/cytology/IFacilityCytologyRoutingOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const ROUTES: { id: NonGynCytologyRouting; labelKey: string }[] = [
  { id: 'surgical_pathology_worklist', labelKey: 'cytologyRoutingSettingsSection.routes.surgicalPathologyWorklist' },
  { id: 'cytology_worklist', labelKey: 'cytologyRoutingSettingsSection.routes.cytologyWorklist' },
];

const CytologyRoutingSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [enterpriseDraft, setEnterpriseDraft] = useState<NonGynCytologyRouting>('surgical_pathology_worklist');
  const [savedEnterprise, setSavedEnterprise] = useState<NonGynCytologyRouting>('surgical_pathology_worklist');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyRoutingOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; routing: NonGynCytologyRouting } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCytologyRoutingSettingsService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.nonGynCytologyRouting); setSavedEnterprise(r.data.nonGynCytologyRouting); } });
    mockFacilityService.getAll().then(r => {
      if (!r.ok) return;
      setFacilities(r.data);
      Promise.all(r.data.map(f => mockFacilityCytologyRoutingOverrideService.getForFacility(f.id))).then(overrides => {
        setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyRoutingOverride } => o.ok && !!o.data).map(o => o.data));
      });
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCytologyRoutingSettingsService.update({ nonGynCytologyRouting: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const routeLabel = (id: NonGynCytologyRouting) => t(ROUTES.find(r => r.id === id)?.labelKey ?? id);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('cytologyRoutingSettingsSection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyRoutingSettingsSection.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.enterprise.title')}</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as NonGynCytologyRouting)}>
            {ROUTES.map(r => (<option key={r.id} value={r.id}>{t(r.labelKey)}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>{t('common.save')}</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</div>}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.facility.title')}</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', routing: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.nonGynCytologyRouting ? routeLabel(o.overrides.nonGynCytologyRouting) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyRoutingOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
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
              <select className="ps-conf-select" value={addingFacility.routing} onChange={e => setAddingFacility({ ...addingFacility, routing: e.target.value as NonGynCytologyRouting })}>
                {ROUTES.map(r => (<option key={r.id} value={r.id}>{t(r.labelKey)}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyRoutingOverrideService.create(addingFacility.facilityId, { nonGynCytologyRouting: addingFacility.routing });
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

export default CytologyRoutingSettingsSection;
