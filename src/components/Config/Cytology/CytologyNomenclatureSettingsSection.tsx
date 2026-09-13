// src/components/Config/Cytology/CytologyNomenclatureSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — closing a real, confirmed gap: the
// two-tier cascade (Enterprise default + Facility override) and its
// read-only consumer (CytologyScreeningPage.tsx) both already existed,
// but nothing let an admin actually set either tier. Same real
// 2-tier cascade UI pattern CytologyQcSettingsSection.tsx already
// established for its own 3-tier case, minus the Staff tier — a
// facility's own reporting nomenclature is a real, facility-level
// choice, never a per-staff-member one.
//
// Real, per direct reminder ("reusing PathScribe CSS objects... no
// inline CSS"): rewritten to use real, named CSS classes throughout
// (pathscribe.css) — no style={{...}} anywhere in this file, same
// real fix PrintSettingsSection.tsx's own header already documents.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCytologyNomenclatureSettingsService } from '../../../services/cytology/mockCytologyNomenclatureSettingsService';
import { mockFacilityCytologyNomenclatureOverrideService } from '../../../services/cytology/mockFacilityCytologyNomenclatureOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CytologyNomenclatureSystem } from '../../../services/cytology/ICytologyCategoryService';
import type { FacilityCytologyNomenclatureOverride } from '../../../services/cytology/IFacilityCytologyNomenclatureOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const SYSTEMS: { id: CytologyNomenclatureSystem; label: string }[] = [
  { id: 'bethesda', label: 'Bethesda System' },
  { id: 'bscc_rcpath', label: 'BSCC / RCPath (UK, Scotland, Ireland)' },
  { id: 'munchen_iiib', label: 'München III (Germany)' },
  { id: 'sfcc', label: 'SFCC (France — French-labeled Bethesda)' },
  { id: 'palga_cisoea', label: 'PALGA CISOE-A (Netherlands)' },
];

const CytologyNomenclatureSettingsSection: React.FC = () => {
  const [enterpriseDraft, setEnterpriseDraft] = useState<CytologyNomenclatureSystem>('bethesda');
  const [savedEnterprise, setSavedEnterprise] = useState<CytologyNomenclatureSystem>('bethesda');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyNomenclatureOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; system: CytologyNomenclatureSystem } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCytologyNomenclatureSettingsService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.nomenclatureSystem); setSavedEnterprise(r.data.nomenclatureSystem); } });
    mockFacilityService.getAll().then(r => {
      if (!r.ok) return;
      setFacilities(r.data);
      Promise.all(r.data.map(f => mockFacilityCytologyNomenclatureOverrideService.getForFacility(f.id))).then(overrides => {
        setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyNomenclatureOverride } => o.ok && !!o.data).map(o => o.data));
      });
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCytologyNomenclatureSettingsService.update({ nomenclatureSystem: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const systemLabel = (id: CytologyNomenclatureSystem) => SYSTEMS.find(s => s.id === id)?.label ?? id;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">Cytology Nomenclature System</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Which real reporting terminology a lab's interpretation dropdowns use. Two-tier cascade — Enterprise
        default, with an optional Facility override for labs reporting under a different real jurisdiction's
        own standard nomenclature.
      </p>

      {/* Tier 1 — Enterprise */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">Enterprise Default</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={enterpriseDraft} onChange={e => setEnterpriseDraft(e.target.value as CytologyNomenclatureSystem)}>
            {SYSTEMS.map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>Save</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">Unsaved change</div>}
      </div>

      {/* Tier 2 — Facility overrides */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">Facility Overrides</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', system: enterpriseDraft })}>+ Add Override</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.nomenclatureSystem ? systemLabel(o.overrides.nomenclatureSystem) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyNomenclatureOverrideService.remove(o.facilityId); refresh(); }}>Remove</button>
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
              <select className="ps-conf-select" value={addingFacility.system} onChange={e => setAddingFacility({ ...addingFacility, system: e.target.value as CytologyNomenclatureSystem })}>
                {SYSTEMS.map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
              </select>
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyNomenclatureOverrideService.create(addingFacility.facilityId, { nomenclatureSystem: addingFacility.system });
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

export default CytologyNomenclatureSettingsSection;
