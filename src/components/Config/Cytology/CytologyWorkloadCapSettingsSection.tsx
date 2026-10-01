// src/components/Config/Cytology/CytologyWorkloadCapSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — same real 3-tier cascade UI pattern as
// CytologyQcSettingsSection.tsx (Enterprise + Facility + Staff),
// adapted to this settings config's own single dailySlideCap field.
// Real, per direct reminder ("reusing PathScribe CSS objects... no
// inline CSS") — real, named CSS classes throughout, no style={{...}}
// anywhere in this file.
//
// i18n note: since this is the same real 3-tier cascade pattern as
// CytologyQcSettingsSection.tsx, five of its exact-text keys are
// reused outright here (enterprise/facility/staff titles, the
// unsaved-change indicator, the empty states, and the "+ Add
// Override" button) rather than duplicated.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyWorkloadCapSettingsService } from '../../../services/cytology/mockCytologyWorkloadCapSettingsService';
import { mockFacilityCytologyWorkloadCapOverrideService } from '../../../services/cytology/mockFacilityCytologyWorkloadCapOverrideService';
import { mockStaffCytologyWorkloadCapOverrideService } from '../../../services/cytology/mockStaffCytologyWorkloadCapOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { mockUserService } from '../../../services/users/mockUserService';
import type { FacilityCytologyWorkloadCapOverride } from '../../../services/cytology/IFacilityCytologyWorkloadCapOverrideService';
import type { StaffCytologyWorkloadCapOverride } from '../../../services/cytology/IStaffCytologyWorkloadCapOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { StaffUser } from '../../../services/users/IUserService';

const CytologyWorkloadCapSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [enterpriseDraft, setEnterpriseDraft] = useState<number>(100);
  const [savedEnterprise, setSavedEnterprise] = useState<number>(100);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyWorkloadCapOverride[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffOverrides, setStaffOverrides] = useState<StaffCytologyWorkloadCapOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; cap: number } | null>(null);
  const [addingStaff, setAddingStaff] = useState<{ staffUserId: string; cap: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    mockCytologyWorkloadCapSettingsService.get().then(r => { if (r.ok) { setEnterpriseDraft(r.data.dailySlideCap); setSavedEnterprise(r.data.dailySlideCap); } });
    mockFacilityService.getAll().then(r => { if (r.ok) setFacilities(r.data); });
    mockUserService.getAll().then(r => { if (r.ok) setStaff(r.data); });
    mockFacilityService.getAll().then(async r => {
      if (!r.ok) return;
      const overrides = await Promise.all(r.data.map(f => mockFacilityCytologyWorkloadCapOverrideService.getForFacility(f.id)));
      setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyWorkloadCapOverride } => o.ok && !!o.data).map(o => o.data));
    });
    mockUserService.getAll().then(async r => {
      if (!r.ok) return;
      const overrides = await Promise.all(r.data.map(u => mockStaffCytologyWorkloadCapOverrideService.getForStaff(u.id)));
      setStaffOverrides(overrides.filter((o): o is { ok: true; data: StaffCytologyWorkloadCapOverride } => o.ok && !!o.data).map(o => o.data));
    });
  };

  useEffect(() => { refresh(); }, []);

  const saveEnterprise = async () => {
    setSaving(true);
    await mockCytologyWorkloadCapSettingsService.update({ dailySlideCap: enterpriseDraft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;
  const staffName = (id: string) => { const s = staff.find(s => s.id === id); return s ? `${s.firstName} ${s.lastName}` : id; };

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('cytologyWorkloadCapSettingsSection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyWorkloadCapSettingsSection.subtitle')}
      </p>

      {/* Tier 1 — Enterprise */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.enterprise.title')}</div>
        <div className="ps-conf-row-actions">
          <input className="ps-conf-input" type="number" min={0} value={enterpriseDraft} onChange={e => setEnterpriseDraft(Number(e.target.value))} />
          <span className="ps-conf-value">{t('cytologyWorkloadCapSettingsSection.unitLabel')}</span>
          <button className="ps-conf-btn-primary" onClick={saveEnterprise} disabled={saving}>{t('common.save')}</button>
        </div>
        {enterpriseDraft !== savedEnterprise && <div className="ps-conf-saving-indicator">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</div>}
      </div>

      {/* Tier 2 — Facility overrides */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.facility.title')}</div>
          {!addingFacility && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', cap: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{facilityName(o.facilityId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.dailySlideCap != null ? t('cytologyWorkloadCapSettingsSection.unitSuffix', { count: o.overrides.dailySlideCap }) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockFacilityCytologyWorkloadCapOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
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
              <input className="ps-conf-input" type="number" min={0} value={addingFacility.cap} onChange={e => setAddingFacility({ ...addingFacility, cap: Number(e.target.value) })} />
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockFacilityCytologyWorkloadCapOverrideService.create(addingFacility.facilityId, { dailySlideCap: addingFacility.cap });
                setAddingFacility(null); refresh();
              }}>{t('common.save')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setAddingFacility(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>

      {/* Tier 3 — Staff overrides */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('cytologyQcSettingsSection.staff.title')}</div>
          {!addingStaff && (
            <button className="ps-conf-btn-secondary" onClick={() => setAddingStaff({ staffUserId: staff[0]?.id ?? '', cap: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>
        <div className="ps-conf-card-description--tight">{t('cytologyWorkloadCapSettingsSection.staffHint')}</div>

        {staffOverrides.map(o => (
          <div key={o.id} className="ps-conf-row">
            <span className="ps-conf-value">{staffName(o.staffUserId)}</span>
            <div className="ps-conf-row-actions">
              <span className="ps-conf-value">{o.overrides.dailySlideCap != null ? t('cytologyWorkloadCapSettingsSection.unitSuffix', { count: o.overrides.dailySlideCap }) : '—'}</span>
              <button className="ps-conf-btn-secondary" onClick={async () => { await mockStaffCytologyWorkloadCapOverrideService.remove(o.staffUserId); refresh(); }}>{t('common.remove')}</button>
            </div>
          </div>
        ))}
        {staffOverrides.length === 0 && !addingStaff && (
          <div className="ps-conf-empty-row">{t('cytologyQcSettingsSection.staff.emptyState')}</div>
        )}

        {addingStaff && (
          <div className="ps-conf-row">
            <select className="ps-conf-select" value={addingStaff.staffUserId} onChange={e => setAddingStaff({ ...addingStaff, staffUserId: e.target.value })}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
            <div className="ps-conf-row-actions">
              <input className="ps-conf-input" type="number" min={0} value={addingStaff.cap} onChange={e => setAddingStaff({ ...addingStaff, cap: Number(e.target.value) })} />
              <button className="ps-conf-btn-primary" onClick={async () => {
                await mockStaffCytologyWorkloadCapOverrideService.create(addingStaff.staffUserId, { dailySlideCap: addingStaff.cap });
                setAddingStaff(null); refresh();
              }}>{t('common.save')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setAddingStaff(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CytologyWorkloadCapSettingsSection;
