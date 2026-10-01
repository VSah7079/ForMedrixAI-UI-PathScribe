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
//
// i18n sweep (batch 54): real, admin-entered/resolved data
// (facilityName(), staffName(), and the real numeric override
// percentages themselves) stays as typed/stored — only page chrome
// is translated.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

interface RateDraft { negative: number; nonNegative: number; }

const CytologyQcSettingsSection: React.FC = () => {
  const { t } = useTranslation();
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
    <div className="ps-cytqc__rate-pair">
      <div className="ps-cytqc__rate-field">
        <span className="ps-cytqc__rate-label">{t('cytologyQcSettingsSection.ratePair.negativeLabel')}</span>
        <input type="number" min={0} max={100} className="ps-cytqc__input" value={value.negative} onChange={e => onChange({ ...value, negative: Number(e.target.value) })} />
        <span className="ps-cytqc__rate-pct">%</span>
      </div>
      <div className="ps-cytqc__rate-field">
        <span className="ps-cytqc__rate-label">{t('cytologyQcSettingsSection.ratePair.nonNegativeLabel')}</span>
        <input type="number" min={0} max={100} className="ps-cytqc__input" value={value.nonNegative} onChange={e => onChange({ ...value, nonNegative: Number(e.target.value) })} />
        <span className="ps-cytqc__rate-pct">%</span>
      </div>
    </div>
  );

  const rateSummary = (neg: number, nonNeg: number) => t('cytologyQcSettingsSection.rateSummary', { neg, nonNeg });

  return (
    <div className="ps-cytqc__page">
      <h1 className="ps-cytqc__title">{t('cytologyQcSettingsSection.title')}</h1>
      <p className="ps-cytqc__subtitle">
        {t('cytologyQcSettingsSection.subtitle')}
      </p>

      {/* Tier 1 — Enterprise */}
      <div className="ps-cytqc__card">
        <h3 className="ps-cytqc__card-title">{t('cytologyQcSettingsSection.enterprise.title')}</h3>
        <div className="ps-cytqc__enterprise-row">
          <RatePair value={enterpriseDraft} onChange={setEnterpriseDraft} />
          <button className="ps-cytqc__btn" onClick={saveEnterprise}>{t('common.save')}</button>
          {enterprise && (enterprise.negativeRandomSelectionRatePercent !== enterpriseDraft.negative || enterprise.nonNegativeRandomSelectionRatePercent !== enterpriseDraft.nonNegative) && (
            <span className="ps-cytqc__unsaved">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</span>
          )}
        </div>
      </div>

      {/* Tier 2 — Facility overrides */}
      <div className="ps-cytqc__card">
        <div className="ps-cytqc__card-header">
          <h3 className="ps-cytqc__card-title ps-cytqc__card-title--no-margin">{t('cytologyQcSettingsSection.facility.title')}</h3>
          {!addingFacility && (
            <button className="ps-cytqc__btn" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', rate: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-cytqc__row">
            <span className="ps-cytqc__row-name">{facilityName(o.facilityId)}</span>
            <span className="ps-cytqc__row-summary">{rateSummary(o.overrides.negativeRandomSelectionRatePercent, o.overrides.nonNegativeRandomSelectionRatePercent)}</span>
            <button className="ps-cytqc__btn" onClick={async () => { await mockFacilityCytologyQcOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div className="ps-cytqc__empty-state">{t('cytologyQcSettingsSection.facility.emptyState')}</div>
        )}

        {addingFacility && (
          <div className="ps-cytqc__add-row">
            <select value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}
              className="ps-conf-select ps-cytqc__add-select">
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <RatePair value={addingFacility.rate} onChange={rate => setAddingFacility({ ...addingFacility, rate })} />
            <button className="ps-cytqc__btn" onClick={async () => {
              await mockFacilityCytologyQcOverrideService.create(addingFacility.facilityId, { negativeRandomSelectionRatePercent: addingFacility.rate.negative, nonNegativeRandomSelectionRatePercent: addingFacility.rate.nonNegative });
              setAddingFacility(null); refresh();
            }}>{t('common.save')}</button>
            <button className="ps-cytqc__btn" onClick={() => setAddingFacility(null)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>

      {/* Tier 3 — Staff overrides */}
      <div className="ps-cytqc__card">
        <div className="ps-cytqc__card-header">
          <h3 className="ps-cytqc__card-title ps-cytqc__card-title--no-margin">{t('cytologyQcSettingsSection.staff.title')}</h3>
          {!addingStaff && (
            <button className="ps-cytqc__btn" onClick={() => setAddingStaff({ staffUserId: staff[0]?.id ?? '', rate: enterpriseDraft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>
        <p className="ps-cytqc__staff-hint">
          {t('cytologyQcSettingsSection.staff.hint')}
        </p>

        {staffOverrides.map(o => (
          <div key={o.id} className="ps-cytqc__row">
            <span className="ps-cytqc__row-name">{staffName(o.staffUserId)}</span>
            <span className="ps-cytqc__row-summary">{rateSummary(o.overrides.negativeRandomSelectionRatePercent, o.overrides.nonNegativeRandomSelectionRatePercent)}</span>
            <button className="ps-cytqc__btn" onClick={async () => { await mockStaffCytologyQcOverrideService.remove(o.staffUserId); refresh(); }}>{t('common.remove')}</button>
          </div>
        ))}
        {staffOverrides.length === 0 && !addingStaff && (
          <div className="ps-cytqc__empty-state">{t('cytologyQcSettingsSection.staff.emptyState')}</div>
        )}

        {addingStaff && (
          <div className="ps-cytqc__add-row">
            <select value={addingStaff.staffUserId} onChange={e => setAddingStaff({ ...addingStaff, staffUserId: e.target.value })}
              className="ps-conf-select ps-cytqc__add-select">
              {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
            <RatePair value={addingStaff.rate} onChange={rate => setAddingStaff({ ...addingStaff, rate })} />
            <button className="ps-cytqc__btn" onClick={async () => {
              await mockStaffCytologyQcOverrideService.create(addingStaff.staffUserId, { negativeRandomSelectionRatePercent: addingStaff.rate.negative, nonNegativeRandomSelectionRatePercent: addingStaff.rate.nonNegative });
              setAddingStaff(null); refresh();
            }}>{t('common.save')}</button>
            <button className="ps-cytqc__btn" onClick={() => setAddingStaff(null)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CytologyQcSettingsSection;
