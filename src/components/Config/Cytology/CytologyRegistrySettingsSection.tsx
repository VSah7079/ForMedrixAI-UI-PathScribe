// src/components/Config/Cytology/CytologyRegistrySettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — same real 2-tier cascade UI pattern as
// CytologyNomenclatureSettingsSection.tsx. Real, per direct reminder
// ("reusing PathScribe CSS objects... no inline CSS") — real, named
// CSS classes throughout, no style={{...}} anywhere in this file.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCytologyRegistrySettingsService } from '../../../services/cytology/mockCytologyRegistrySettingsService';
import { mockFacilityCytologyRegistryOverrideService } from '../../../services/cytology/mockFacilityCytologyRegistryOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CytologyRegistryId } from '../../../services/cytology/ICytologyRegistrySettingsService';
import type { FacilityCytologyRegistryOverride } from '../../../services/cytology/IFacilityCytologyRegistryOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const REGISTRIES: { id: CytologyRegistryId; label: string }[] = [
  { id: 'none', label: 'None — no centralized registry obligation' },
  { id: 'csms_uk', label: 'CSMS (UK — Cervical Screening Management System)' },
  { id: 'cervicalcheck_ireland', label: 'CervicalCheck (Ireland)' },
  { id: 'palga_netherlands', label: 'PALGA (Netherlands)' },
  { id: 'ncsr_australia', label: 'NCSR (Australia)' },
  { id: 'kncsp_kccr_korea', label: 'KNCSP / KCCR (South Korea)' },
];

const CytologyRegistrySettingsSection: React.FC = () => {
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
  const registryLabel = (id: CytologyRegistryId) => REGISTRIES.find(r => r.id === id)?.label ?? id;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">Cytology Registry Reporting</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Which real, national centralized registry a lab's signed-out GYN cytology results are reported to.
        Two-tier cascade — Enterprise default, with an optional Facility override for labs reporting to a
        different real jurisdiction's own registry.
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">Enterprise Default</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CytologyRegistryId)}>
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
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyRegistryOverrideService.remove(o.facilityId); refresh(); }}>Remove</button>
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
              <select className="ps-conf-select" value={addingFacility.registryId} onChange={e => setAddingFacility({ ...addingFacility, registryId: e.target.value as CytologyRegistryId })}>
                {REGISTRIES.map(r => (<option key={r.id} value={r.id}>{r.label}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyRegistryOverrideService.create(addingFacility.facilityId, { registryId: addingFacility.registryId });
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

export default CytologyRegistrySettingsSection;
