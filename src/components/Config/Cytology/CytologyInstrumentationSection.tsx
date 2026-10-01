// src/components/Config/Cytology/CytologyInstrumentationSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — closes the real gap flagged when this
// service was first built: a real modality existed, defaulting to
// 'wsi', with no way for an admin to actually change it.
//
// **Updated, high priority, per direct follow-up** ("each performing
// facility could identify their own mode... is it possible that an
// individual system could have both types?" — given multi-facility
// support): this was originally a single, global setting, explicitly
// disclosed as a real, current limit at the time. Now a real, genuine
// 2-tier cascade — Enterprise default (Tier 1, unchanged service
// below) with an optional per-Facility override (Tier 2, new) — the
// same real cascade shape this Cytology config family already
// established for nomenclature/registry/routing/QC settings. A real,
// direct consequence: a system can now genuinely run BOTH modalities
// at once, resolved independently per facility.
//
// Real, per direct reminder ("reusing PathScribe CSS objects... no
// inline CSS") — real, named CSS classes throughout, no style={{...}}
// anywhere in this file. Tier 2's own layout reuses the `.ps-cytqc__*`
// class family directly (same Cytology-config-cascade shape as
// CytologyQcSettingsSection.tsx's own Tier 2 block) rather than
// duplicating an identical, parallel set of classes under a new name.
//
// i18n note: `CytologyInstrumentationModality` is a real, persisted
// enum ('wsi' | 'traditional_guided') — only its displayed label is
// translated, via `MODALITY_LABEL_KEY`. The page title reuses
// `configSearchIndex.entries.cyt-instrumentation.label` (exact-text
// match). "Save"/"Remove"/"Cancel" reuse `common.*`; "+ Add Override"
// reuses `cytologyQcSettingsSection.addOverrideBtn`; "Unsaved change"
// reuses `cytologyQcSettingsSection.enterprise.unsavedChange` (same
// Cytology config family, exact-text match throughout).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyInstrumentationService } from '../../../services/cytology/mockCytologyInstrumentationService';
import { mockFacilityCytologyInstrumentationOverrideService } from '../../../services/cytology/mockFacilityCytologyInstrumentationOverrideService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CytologyInstrumentationModality } from '../../../services/cytology/ICytologyInstrumentationService';
import type { FacilityCytologyInstrumentationOverride } from '../../../services/cytology/IFacilityCytologyInstrumentationOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const MODALITY_LABEL_KEY: Record<CytologyInstrumentationModality, string> = {
  wsi: 'cytologyInstrumentationSection.modality.wsi',
  traditional_guided: 'cytologyInstrumentationSection.modality.traditionalGuided',
};

const MODALITIES: CytologyInstrumentationModality[] = ['wsi', 'traditional_guided'];

const CytologyInstrumentationSection: React.FC = () => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CytologyInstrumentationModality>('wsi');
  const [saved, setSaved] = useState<CytologyInstrumentationModality>('wsi');
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityOverrides, setFacilityOverrides] = useState<FacilityCytologyInstrumentationOverride[]>([]);
  const [addingFacility, setAddingFacility] = useState<{ facilityId: string; modality: CytologyInstrumentationModality } | null>(null);

  const refresh = () => {
    mockCytologyInstrumentationService.get().then(r => { if (r.ok) { setDraft(r.data.modality); setSaved(r.data.modality); } });
    mockFacilityService.getAll().then(async r => {
      if (!r.ok) return;
      setFacilities(r.data);
      const overrides = await Promise.all(r.data.map(f => mockFacilityCytologyInstrumentationOverrideService.getForFacility(f.id)));
      setFacilityOverrides(overrides.filter((o): o is { ok: true; data: FacilityCytologyInstrumentationOverride } => o.ok && !!o.data).map(o => o.data));
    });
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setSaving(true);
    await mockCytologyInstrumentationService.update({ modality: draft });
    setSaving(false);
    refresh();
  };

  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? id;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('configSearchIndex.entries.cyt-instrumentation.label')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyInstrumentationSection.subtitle')}
      </p>

      {/* Tier 1 — Enterprise default */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('cytologyInstrumentationSection.modalityCardTitle')}</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={draft} onChange={e => setDraft(e.target.value as CytologyInstrumentationModality)}>
            {MODALITIES.map(id => (<option key={id} value={id}>{t(MODALITY_LABEL_KEY[id])}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={save} disabled={saving}>{t('common.save')}</button>
        </div>
        {draft !== saved && <div className="ps-conf-saving-indicator">{t('cytologyQcSettingsSection.enterprise.unsavedChange')}</div>}
      </div>

      {/* Tier 2 — Facility overrides */}
      <div className="ps-cytqc__card">
        <div className="ps-cytqc__card-header">
          <h3 className="ps-cytqc__card-title ps-cytqc__card-title--no-margin">{t('cytologyInstrumentationSection.facility.title')}</h3>
          {!addingFacility && (
            <button className="ps-cytqc__btn" onClick={() => setAddingFacility({ facilityId: facilities[0]?.id ?? '', modality: draft })}>{t('cytologyQcSettingsSection.addOverrideBtn')}</button>
          )}
        </div>

        {facilityOverrides.map(o => (
          <div key={o.id} className="ps-cytqc__row">
            <span className="ps-cytqc__row-name">{facilityName(o.facilityId)}</span>
            <span className="ps-cytqc__row-summary">{o.overrides.modality ? t(MODALITY_LABEL_KEY[o.overrides.modality]) : ''}</span>
            <button className="ps-cytqc__btn" onClick={async () => { await mockFacilityCytologyInstrumentationOverrideService.remove(o.facilityId); refresh(); }}>{t('common.remove')}</button>
          </div>
        ))}
        {facilityOverrides.length === 0 && !addingFacility && (
          <div className="ps-cytqc__empty-state">{t('cytologyInstrumentationSection.facility.emptyState')}</div>
        )}

        {addingFacility && (
          <div className="ps-cytqc__add-row">
            <select value={addingFacility.facilityId} onChange={e => setAddingFacility({ ...addingFacility, facilityId: e.target.value })}
              className="ps-conf-select ps-cytqc__add-select">
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select className="ps-conf-select" value={addingFacility.modality} onChange={e => setAddingFacility({ ...addingFacility, modality: e.target.value as CytologyInstrumentationModality })}>
              {MODALITIES.map(id => (<option key={id} value={id}>{t(MODALITY_LABEL_KEY[id])}</option>))}
            </select>
            <button className="ps-cytqc__btn" onClick={async () => {
              await mockFacilityCytologyInstrumentationOverrideService.create(addingFacility.facilityId, { modality: addingFacility.modality });
              setAddingFacility(null); refresh();
            }}>{t('common.save')}</button>
            <button className="ps-cytqc__btn" onClick={() => setAddingFacility(null)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CytologyInstrumentationSection;
