// src/pages/CytologyWorklistPage/components/CytologyRoseView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Step 4 ask — lets a real user
// actually record a new ROSE evaluation (one or more real, per-pass
// adequacy assessments), and view this specimen's own prior real
// evaluations. Uses the same real, generic CytologySlideOverDrawer
// shell as the Material and Synoptic drawers.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CytologyRoseEvaluation, CytologyRoseLocation, CytologyRoseAdequacyAssessment } from '@/types/cytology/CytologyRoseEvaluation';

interface DraftPass {
  adequacyAssessment: CytologyRoseAdequacyAssessment;
  preliminaryImpression: string;
}

interface CytologyRoseViewProps {
  roseEvaluations: CytologyRoseEvaluation[] | undefined;
  onRecordEvaluation: (location: CytologyRoseLocation, passes: DraftPass[]) => void;
}

const CytologyRoseView: React.FC<CytologyRoseViewProps> = ({ roseEvaluations, onRecordEvaluation }) => {
  const { t } = useTranslation();
  const [location, setLocation] = useState<CytologyRoseLocation>('radiology');
  const [passes, setPasses] = useState<DraftPass[]>([{ adequacyAssessment: 'adequate', preliminaryImpression: '' }]);

  const updatePass = (index: number, patch: Partial<DraftPass>) => {
    setPasses(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
  };

  const handleSubmit = () => {
    onRecordEvaluation(location, passes);
    setPasses([{ adequacyAssessment: 'adequate', preliminaryImpression: '' }]);
  };

  return (
    <div>
      {(roseEvaluations ?? []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
            {t('cytologyScreening.roseDrawer.priorEvaluations')}
          </div>
          {(roseEvaluations ?? []).map(ev => (
            <div key={ev.id} style={{ padding: '8px 10px', background: '#111827', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 4 }}>
                {new Date(ev.performedAt).toLocaleString()} — {ev.performedBy.userName} — {t(`cytologyScreening.roseDrawer.location.${ev.location}`)}
              </div>
              {ev.passes.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: '#d1d5db' }}>
                  {t('cytologyScreening.roseDrawer.passLabel', { n: p.passNumber })}: <strong>{t(`cytologyScreening.roseDrawer.adequacy.${p.adequacyAssessment}`)}</strong>
                  {p.preliminaryImpression ? ` — ${p.preliminaryImpression}` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
        {t('cytologyScreening.roseDrawer.recordNew')}
      </div>

      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>{t('cytologyScreening.roseDrawer.locationLabel')}</label>
      <select className="ps-conf-select" style={{ width: '100%', marginBottom: 14 }} value={location} onChange={e => setLocation(e.target.value as CytologyRoseLocation)}>
        <option value="radiology">{t('cytologyScreening.roseDrawer.location.radiology')}</option>
        <option value="clinic">{t('cytologyScreening.roseDrawer.location.clinic')}</option>
        <option value="operating_room">{t('cytologyScreening.roseDrawer.location.operating_room')}</option>
        <option value="other">{t('cytologyScreening.roseDrawer.location.other')}</option>
      </select>

      {passes.map((pass, i) => (
        <div key={i} style={{ padding: '10px 12px', background: '#111827', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>{t('cytologyScreening.roseDrawer.passLabel', { n: i + 1 })}</div>
          <select className="ps-conf-select" style={{ width: '100%', marginBottom: 8 }} value={pass.adequacyAssessment} onChange={e => updatePass(i, { adequacyAssessment: e.target.value as CytologyRoseAdequacyAssessment })}>
            <option value="adequate">{t('cytologyScreening.roseDrawer.adequacy.adequate')}</option>
            <option value="inadequate">{t('cytologyScreening.roseDrawer.adequacy.inadequate')}</option>
            <option value="indeterminate">{t('cytologyScreening.roseDrawer.adequacy.indeterminate')}</option>
          </select>
          <textarea className="ps-conf-input" style={{ width: '100%', minHeight: 50 }} value={pass.preliminaryImpression}
            onChange={e => updatePass(i, { preliminaryImpression: e.target.value })}
            placeholder={t('cytologyScreening.roseDrawer.impressionPlaceholder')} />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setPasses(prev => [...prev, { adequacyAssessment: 'adequate', preliminaryImpression: '' }])}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'transparent', border: '1px solid #37415155', borderRadius: 6, cursor: 'pointer' }}>
          + {t('cytologyScreening.roseDrawer.addPassBtn')}
        </button>
        <button onClick={handleSubmit}
          style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {t('cytologyScreening.roseDrawer.saveBtn')}
        </button>
      </div>
    </div>
  );
};

export default CytologyRoseView;
