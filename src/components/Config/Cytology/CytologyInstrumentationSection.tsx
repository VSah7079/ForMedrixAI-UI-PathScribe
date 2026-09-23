// src/components/Config/Cytology/CytologyInstrumentationSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("build all the Cytology Admin screens
// that are still pending") — closes the real gap flagged when this
// service was first built: a real modality existed, defaulting to
// 'wsi', with no way for an admin to actually change it. Real,
// deliberate scope: a single, global setting, not a facility cascade
// — stated plainly as this service's own real, current limit, not
// silently assumed sufficient for every real, multi-facility lab.
// Real, per direct reminder ("reusing PathScribe CSS objects... no
// inline CSS") — real, named CSS classes throughout, no style={{...}}
// anywhere in this file.
//
// i18n note: `CytologyInstrumentationModality` is a real, persisted
// enum ('wsi' | 'traditional_guided') — only its displayed label is
// translated, via `MODALITY_LABEL_KEY`. The page title reuses
// `configSearchIndex.entries.cyt-instrumentation.label` (exact-text
// match). "Save" reuses `common.save`; "Unsaved change" reuses
// `cytologyQcSettingsSection.enterprise.unsavedChange` (same Cytology
// config family, exact-text match).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyInstrumentationService } from '../../../services/cytology/mockCytologyInstrumentationService';
import type { CytologyInstrumentationModality } from '../../../services/cytology/ICytologyInstrumentationService';

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

  const refresh = () => {
    mockCytologyInstrumentationService.get().then(r => { if (r.ok) { setDraft(r.data.modality); setSaved(r.data.modality); } });
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setSaving(true);
    await mockCytologyInstrumentationService.update({ modality: draft });
    setSaving(false);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('configSearchIndex.entries.cyt-instrumentation.label')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('cytologyInstrumentationSection.subtitle')}
      </p>

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
    </div>
  );
};

export default CytologyInstrumentationSection;
