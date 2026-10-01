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
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';

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
        <div className="ps-mb-18">
          <div className="ps-roseview-section-title">
            {t('cytologyScreening.roseDrawer.priorEvaluations')}
          </div>
          {(roseEvaluations ?? []).map(ev => (
            <div key={ev.id} className="ps-roseview-eval-card">
              <div className="ps-roseview-eval-meta">
                {new Date(ev.performedAt).toLocaleString()} — {ev.performedBy.userName} — {t(`cytologyScreening.roseDrawer.location.${ev.location}`)}
              </div>
              {ev.passes.map((p, i) => (
                <div key={i} className="ps-roseview-eval-pass">
                  {t('cytologyScreening.roseDrawer.passLabel', { n: p.passNumber })}: <strong>{t(`cytologyScreening.roseDrawer.adequacy.${p.adequacyAssessment}`)}</strong>
                  {p.preliminaryImpression ? ` — ${p.preliminaryImpression}` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="ps-roseview-section-title">
        {t('cytologyScreening.roseDrawer.recordNew')}
      </div>

      <label className="ps-cytosynform-label">{t('cytologyScreening.roseDrawer.locationLabel')}</label>
      <select className="ps-conf-select ps-roseview-location-select" value={location} onChange={e => setLocation(e.target.value as CytologyRoseLocation)}>
        <option value="radiology">{t('cytologyScreening.roseDrawer.location.radiology')}</option>
        <option value="clinic">{t('cytologyScreening.roseDrawer.location.clinic')}</option>
        <option value="operating_room">{t('cytologyScreening.roseDrawer.location.operating_room')}</option>
        <option value="other">{t('cytologyScreening.roseDrawer.location.other')}</option>
      </select>

      {passes.map((pass, i) => (
        <div key={i} className="ps-roseview-pass-card">
          <div className="ps-roseview-pass-title">{t('cytologyScreening.roseDrawer.passLabel', { n: i + 1 })}</div>
          <select className="ps-conf-select ps-roseview-pass-select" value={pass.adequacyAssessment} onChange={e => updatePass(i, { adequacyAssessment: e.target.value as CytologyRoseAdequacyAssessment })}>
            <option value="adequate">{t('cytologyScreening.roseDrawer.adequacy.adequate')}</option>
            <option value="inadequate">{t('cytologyScreening.roseDrawer.adequacy.inadequate')}</option>
            <option value="indeterminate">{t('cytologyScreening.roseDrawer.adequacy.indeterminate')}</option>
          </select>
          <SpellCheckedTextarea className="ps-conf-input ps-roseview-pass-textarea" value={pass.preliminaryImpression}
            onChange={e => updatePass(i, { preliminaryImpression: e.target.value })}
            placeholder={t('cytologyScreening.roseDrawer.impressionPlaceholder')} />
        </div>
      ))}

      <div className="ps-roseview-actions-row">
        <button onClick={() => setPasses(prev => [...prev, { adequacyAssessment: 'adequate', preliminaryImpression: '' }])}
          className="ps-cytosynform-insert-btn">
          + {t('cytologyScreening.roseDrawer.addPassBtn')}
        </button>
        <button onClick={handleSubmit}
          className="ps-roseview-save-btn">
          {t('cytologyScreening.roseDrawer.saveBtn')}
        </button>
      </div>
    </div>
  );
};

export default CytologyRoseView;
