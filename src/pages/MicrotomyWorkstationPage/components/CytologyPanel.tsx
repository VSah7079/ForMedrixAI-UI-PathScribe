// src/pages/MicrotomyWorkstationPage/components/CytologyPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284's own "4. Cytology & Decanting Workflow Support":
// Specimen Fluid/Decant Panel (Total Volume, Appearance, Yield/Pellet
// Size) + Dynamic Preparation Rules. See computeCytologyPrepSuggestions.ts's
// own header for the honest scope note on the suggestion logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Decant } from '@/types/case/Material';
import { computeCytologyPrepSuggestions } from '@/services/cytology/computeCytologyPrepSuggestions';

export interface CytologyPanelProps {
  decant: Decant;
  onUpdateFields: (fields: { totalVolumeMl?: number; appearance?: Decant['appearance']; yieldPelletSize?: Decant['yieldPelletSize'] }) => void;
  onApplySuggestions: (suggestions: ReturnType<typeof computeCytologyPrepSuggestions>) => void;
}

const CytologyPanel: React.FC<CytologyPanelProps> = ({ decant, onUpdateFields, onApplySuggestions }) => {
  const { t } = useTranslation();
  const [volumeInput, setVolumeInput] = useState(decant.totalVolumeMl?.toString() ?? '');

  const suggestions = useMemo(
    () => computeCytologyPrepSuggestions({ totalVolumeMl: decant.totalVolumeMl, yieldPelletSize: decant.yieldPelletSize }),
    [decant.totalVolumeMl, decant.yieldPelletSize],
  );

  return (
    <div className="ps-microtomy-panel ps-mb-14">
      <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.cytology.title')}</p>
      <div className="ps-microtomy-cytology-grid">
        <div>
          <label className="ps-microtomy-field-label">{t('microtomyWorkstation.cytology.volume')}</label>
          <input
            type="number" min={0} className="ps-microtomy-field-input" value={volumeInput}
            onChange={e => setVolumeInput(e.target.value)}
            onBlur={() => onUpdateFields({ totalVolumeMl: volumeInput === '' ? undefined : Number(volumeInput) })}
          />
        </div>
        <div>
          <label className="ps-microtomy-field-label">{t('microtomyWorkstation.cytology.appearance')}</label>
          <select
            className="ps-microtomy-field-select" value={decant.appearance ?? ''}
            onChange={e => onUpdateFields({ appearance: (e.target.value || undefined) as Decant['appearance'] })}
          >
            <option value="">—</option>
            <option value="Clear">{t('microtomyWorkstation.cytology.appearanceOption.Clear')}</option>
            <option value="Bloody">{t('microtomyWorkstation.cytology.appearanceOption.Bloody')}</option>
            <option value="Turbid">{t('microtomyWorkstation.cytology.appearanceOption.Turbid')}</option>
          </select>
        </div>
        <div>
          <label className="ps-microtomy-field-label">{t('microtomyWorkstation.cytology.yield')}</label>
          <select
            className="ps-microtomy-field-select" value={decant.yieldPelletSize ?? ''}
            onChange={e => onUpdateFields({ yieldPelletSize: (e.target.value || undefined) as Decant['yieldPelletSize'] })}
          >
            <option value="">—</option>
            <option value="Low">{t('microtomyWorkstation.cytology.yieldOption.Low')}</option>
            <option value="Moderate">{t('microtomyWorkstation.cytology.yieldOption.Moderate')}</option>
            <option value="High">{t('microtomyWorkstation.cytology.yieldOption.High')}</option>
          </select>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="ps-microtomy-prep-suggestion-box">
          <div>
            {t('microtomyWorkstation.cytology.suggestionIntro')}{' '}
            {suggestions.map(s => `${s.count}× ${t(`microtomyWorkstation.cytology.prepMethod.${s.preparationMethod.replace(/[^A-Za-z]/g, '')}`)}`).join(', ')}
          </div>
          <button type="button" className="ps-btn-secondary ps-mt-8" onClick={() => onApplySuggestions(suggestions)}>
            {t('microtomyWorkstation.cytology.acceptSuggestion')}
          </button>
        </div>
      )}
    </div>
  );
};

export default CytologyPanel;
