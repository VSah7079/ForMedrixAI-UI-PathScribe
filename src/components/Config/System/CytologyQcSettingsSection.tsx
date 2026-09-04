// src/components/Config/System/CytologyQcSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "there is an enterprise setting on the %
// random qc, followed by performing facility override and then Staff
// Member override... These setting could be set near the Pathologist
// QA review settings." A new subtab, adjacent to QA Configuration
// Center in the nav — same real 3-tier cascade UI pattern
// PrintSettingsSection.tsx already established for its own 2-tier
// case, extended with a genuine Tier 3 (per-staff-member override)
// that has no earlier precedent in this app.
//
// Real, per direct correction: "The Cytology System follows two
// types: 1. Cytology GYN Results that are Negative... 2. Cytology GYN
// Non Negatives..." — two real, independent rates, not one. Every
// tier below manages both.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { mockCytologyQcSettingsService } from '../../../services/cytology/mockCytologyQcSettingsService';
import { mockFacilityCytologyQcOverrideService } from '../../../services/cytology/mockFacilityCytologyQcOverrideService';
import { mockStaffCytologyQcOverrideService } from '../../../services/cytology/mockStaffCytologyQcOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { mockUserService } from '../../../services/users/mockUserService';
import type { CytologyQcSettingsConfig } from '../../../services/cytology/ICytologyQcSettingsService';
import type { FacilityCytologyQcOverride } from '../../../services/cytology/IFacilityCytologyQcOverrideService';
import type { StaffCytologyQcOverride } from '../../../services/cytology/IStaffCytologyQcOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { StaffUser } from '../../../services/users/IUserService';

const cardStyle: React.CSSProperties = { border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 20 };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #111827' };
const btnStyle: React.CSSProperties = { padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#e5e7eb', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: 70, padding: '7px 10px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, outline: 'none' };

interface RateDraft { negative: number; nonNegative: number; }

const CytologyQcSettingsSection: React.FC = () => {
  const [enterprise, setEnterprise] = useState<CytologyQcSettingsConfig | null>(null);
  const [enterpriseDraft, setEnterpriseDraft] = useState<RateDraft>({ negative: 10, nonNegative: 10 });
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyQcOverride[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffOverrides, setStaffOverrides] = useState<StaffCytologyQcOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; rate: RateDraft } | null>(null);
  const [addingStaff, setAddingStaff] = useState<{ staffUserId: string; rate: RateDraft } | null>(null);

  const refresh = () => {
    mockCytologyQcSettingsService.get().then(r => { if (r.ok) { setEnterprise(r.data); setEnterpriseDraft({ negative: r.data.negativeRandomSelectionRatePercent, nonNegative: r.data.nonNegativeRandomSelectionRatePercent }); } });
    mockFacilityService.getAll().then(r => { if (r.ok) setFacilities(r.data); });
    mockUserService.getAll().then(r => { if (r.ok) setStaff(r.data); });
    mockFacilityService.getAll().then(async r => {
      if (!r.ok) return;
      const overrides = await Promise.all(r.data.map(f => mockFacilityCytologyQcOverrideService.getForFacility(f.id)));
      setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyQcOverride } => o.ok && !!o.data).map(o => o.data));
    });
    mockUserService.getAll().then(async r => {
      if (!r.ok) return;
      const overrides = await Promise.all(r.data.map(u => mockStaffCytologyQcOverrideService.getForStaff(u.id)));
      setStaffOverrides(overrides.filter((o): o is { ok: true; data: StaffCytologyQcOverride } => o.ok && !!o.data).map(o => o.data));
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    await mockCytologyQcSettingsService.update({ negativeRandomSelectionRatePercent: enterpriseDraft.negative, nonNegativeRandomSelectionRatePercent: enterpriseDraft.nonNegative });
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const staffName = (id: string) => { const s = staff.find(s => s.id === id); return s ? `${s.firstName} ${s.lastName}` : id; };

  const RatePair: React.FC<{ value: RateDraft; onChange: (v: RateDraft) => void }> = ({ value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Negative</span>
        <input type="number" min={0} max={100} style={inputStyle} value={value.negative} onChange={e => onChange({ ...value, negative: Number(e.target.value) })} />
        <span style={{ color: '#9ca3af', fontSize: 13 }}>%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Non-Negative</span>
        <input type="number" min={0} max={100} style={inputStyle} value={value.nonNegative} onChange={e => onChange({ ...value, nonNegative: Number(e.target.value) })} />
        <span style={{ color: '#9ca3af', fontSize: 13 }}>%</span>
      </div>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Cytology QC Random Selection Rates</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, maxWidth: 620 }}>
        Two real, independent rates — the % of Negative GYN results and the % of Non-Negative GYN
        results randomly selected for the QC pool. Three-tier cascade — Enterprise default, with
        optional Facility and Staff Member overrides. Staff overrides win over Facility overrides,
        which win over the Enterprise default.
      </p>

      {/* Tier 1 — Enterprise */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', margin: '0 0 12px' }}>Enterprise Default</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RatePair value={enterpriseDraft} onChange={setEnterpriseDraft} />
          <button style={btnStyle} onClick={saveEnterprise}>Save</button>
          {enterprise && (enterprise.negativeRandomSelectionRatePercent !== enterpriseDraft.negative || enterprise.nonNegativeRandomSelectionRatePercent !== enterpriseDraft.nonNegative) && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>Unsaved change</span>
          )}
        </div>
      </div>

      {/* Tier 2 — Facility overrides */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>Facility Overrides</h3>
          {!addingFacility && (
            <button style={btnStyle} onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', rate: enterpriseDraft })}>+ Add Override</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} style={rowStyle}>
            <span style={{ flex: 1, fontSize: 13, color: '#d1d5db' }}>{facilityName(o.facilityId)}</span>
            <span style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>Neg {o.overrides.negativeRandomSelectionRatePercent}% · Non-Neg {o.overrides.nonNegativeRandomSelectionRatePercent}%</span>
            <button style={btnStyle} onClick={async () => { await mockFacilityCytologyQcOverrideService.remove(o.facilityId); refresh(); }}>Remove</button>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div style={{ fontSize: 12, color: '#4b5563', padding: '8px 0' }}>No facility overrides — every facility uses the Enterprise default.</div>
        )}

        {addingFacility && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <select value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}
              className="ps-conf-select" style={{ flex: 1, minWidth: 160 }}>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <RatePair value={addingFacility.rate} onChange={rate => setAddingFacility({ ...addingFacility, rate })} />
            <button style={btnStyle} onClick={async () => {
              await mockFacilityCytologyQcOverrideService.create(addingFacility.facilityId, { negativeRandomSelectionRatePercent: addingFacility.rate.negative, nonNegativeRandomSelectionRatePercent: addingFacility.rate.nonNegative });
              setAddingFacility(null); refresh();
            }}>Save</button>
            <button style={btnStyle} onClick={() => setAddingFacility(null)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Tier 3 — Staff overrides */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>Staff Member Overrides</h3>
          {!addingStaff && (
            <button style={btnStyle} onClick={() => setAddingStaff({ staffUserId: staff[0]?.id ?? '', rate: enterpriseDraft })}>+ Add Override</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: -6, marginBottom: 12 }}>
          Assign a higher rate for a new employee or student — this wins over any Facility override.
        </p>

        {staffOverrides.map(o => (
          <div key={o.id} style={rowStyle}>
            <span style={{ flex: 1, fontSize: 13, color: '#d1d5db' }}>{staffName(o.staffUserId)}</span>
            <span style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>Neg {o.overrides.negativeRandomSelectionRatePercent}% · Non-Neg {o.overrides.nonNegativeRandomSelectionRatePercent}%</span>
            <button style={btnStyle} onClick={async () => { await mockStaffCytologyQcOverrideService.remove(o.staffUserId); refresh(); }}>Remove</button>
          </div>
        ))}
        {staffOverrides.length === 0 && !addingStaff && (
          <div style={{ fontSize: 12, color: '#4b5563', padding: '8px 0' }}>No staff overrides.</div>
        )}

        {addingStaff && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <select value={addingStaff.staffUserId} onChange={e => setAddingStaff({ ...addingStaff, staffUserId: e.target.value })}
              className="ps-conf-select" style={{ flex: 1, minWidth: 160 }}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
            <RatePair value={addingStaff.rate} onChange={rate => setAddingStaff({ ...addingStaff, rate })} />
            <button style={btnStyle} onClick={async () => {
              await mockStaffCytologyQcOverrideService.create(addingStaff.staffUserId, { negativeRandomSelectionRatePercent: addingStaff.rate.negative, nonNegativeRandomSelectionRatePercent: addingStaff.rate.nonNegative });
              setAddingStaff(null); refresh();
            }}>Save</button>
            <button style={btnStyle} onClick={() => setAddingStaff(null)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CytologyQcSettingsSection;
