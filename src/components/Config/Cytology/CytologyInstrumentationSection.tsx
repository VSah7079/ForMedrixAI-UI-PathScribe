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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCytologyInstrumentationService } from '../../../services/cytology/mockCytologyInstrumentationService';
import type { CytologyInstrumentationModality } from '../../../services/cytology/ICytologyInstrumentationService';

const MODALITIES: { id: CytologyInstrumentationModality; label: string }[] = [
  { id: 'wsi', label: 'Whole Slide Imaging (WSI)' },
  { id: 'traditional_guided', label: 'Traditional Guided (physical-guided scope)' },
];

const CytologyInstrumentationSection: React.FC = () => {
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
      <h2 className="ps-conf-section-title">Cytology Assisted Instrumentation</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Whether this lab digitizes cervical cytology slides (WSI) or relies on a traditional, physical-guided
        scope. Real, current scope: a single, global setting, not a per-facility cascade — a lab that mixes
        both across facilities isn't covered by this setting yet. WSI-based labs get the "View WSI Slide"
        action and the Scans Completed worklist tile; Traditional Guided labs never see any image-rendering
        UI at all, only real case/order/sign-out tracking.
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">Instrumentation Modality</div>
        <div className="ps-conf-row-actions">
          <select className="ps-conf-select" value={draft} onChange={e => setDraft(e.target.value as CytologyInstrumentationModality)}>
            {MODALITIES.map(m => (<option key={m.id} value={m.id}>{m.label}</option>))}
          </select>
          <button className="ps-conf-btn-primary" onClick={save} disabled={saving}>Save</button>
        </div>
        {draft !== saved && <div className="ps-conf-saving-indicator">Unsaved change</div>}
      </div>
    </div>
  );
};

export default CytologyInstrumentationSection;
