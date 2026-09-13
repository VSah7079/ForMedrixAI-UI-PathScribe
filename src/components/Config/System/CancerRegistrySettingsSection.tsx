// src/components/Config/System/CancerRegistrySettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports
// gap — same real 2-tier cascade UI pattern as
// CytologyRegistrySettingsSection.tsx, for the genuinely distinct real
// cancer-registry class (services/cancerRegistry/).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCancerRegistrySettingsService } from '../../../services/cancerRegistry/mockCancerRegistrySettingsService';
import { mockFacilityCancerRegistryOverrideService } from '../../../services/cancerRegistry/mockFacilityCancerRegistryOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CancerRegistryId } from '../../../services/cancerRegistry/ICancerRegistrySettingsService';
import type { FacilityCancerRegistryOverride } from '../../../services/cancerRegistry/IFacilityCancerRegistryOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const REGISTRIES: { id: CancerRegistryId; label: string }[] = [
  { id: 'none', label: 'None — no centralized registry obligation' },
  { id: 'naaccr_us', label: 'NAACCR (United States)' },
  { id: 'cpac_canada', label: 'CPAC (Canada)' },
  { id: 'cosd_uk', label: 'COSD (United Kingdom)' },
  { id: 'inca_france', label: 'INCa (France)' },
  { id: 'adt_gekid_germany', label: 'ADT/GEKID (Germany)' },
  { id: 'aihw_australia', label: 'AIHW (Australia)' },
  { id: 'nz_cancer_registry', label: 'NZ Cancer Registry (New Zealand)' },
  { id: 'kccr_korea', label: 'KCCR (Korea)' },
];

const CancerRegistrySettingsSection: React.FC = () => {
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
  const registryLabel = (id: CancerRegistryId) => REGISTRIES.find(r => r.id === id)?.label ?? id;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">Cancer Registry Reporting</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Which real, national central cancer registry a facility's confirmed surgical pathology diagnoses are
        reported to. Genuinely separate from Cytology Registry Reporting — a cytology screening result never
        triggers a cancer-registry report, only a confirmed surgical pathology sign-out does. Two-tier cascade —
        Enterprise default, with an optional Facility override for labs reporting to a different real
        jurisdiction's own registry.
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">Enterprise Default</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CancerRegistryId)}>
            {REGISTRIES.map(r => (<option key={r.id} value={r.id}>{r.label}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>Save</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">Unsaved change</div>}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">Facility Overrides</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', registryId: enterpriseDraft })}>+ Add Override</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.registryId ? registryLabel(o.overrides.registryId) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCancerRegistryOverrideService.remove(o.facilityId); refresh(); }}>Remove</button>
            </div>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div className="ps-conf-empty-row">No facility overrides — every facility uses the Enterprise default.</div>
        )}

        {addingFacility && (
          <div className="ps-conf-row">
            <select className="ps-conf-select" value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div className="ps-conf-row-actions">
              <select className="ps-conf-select" value={addingFacility.registryId} onChange={e => setAddingFacility({ ...addingFacility, registryId: e.target.value as CancerRegistryId })}>
                {REGISTRIES.map(r => (<option key={r.id} value={r.id}>{r.label}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCancerRegistryOverrideService.create(addingFacility.facilityId, { registryId: addingFacility.registryId });
                setAddingFacility(null); refresh();
              }}>Save</button>
              <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CancerRegistrySettingsSection;
