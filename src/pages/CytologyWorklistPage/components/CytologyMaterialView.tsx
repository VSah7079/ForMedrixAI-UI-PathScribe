// src/pages/CytologyWorklistPage/components/CytologyMaterialView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction: rewired onto
// the real, established Decant/StainOrder/StainType system Surgical
// Pathology already uses (types/case/Material.ts, Specimen.decants,
// services/stains/) — replacing the earlier, separate
// CytologyCellBlock model this component used before. Reuses
// StainMultiSelect (exported from BlockStainEditorModal.tsx) directly
// — the exact same real stain-search-by-name-or-category component
// Surgical uses, not a cytology-specific look-alike. Decant labels
// ("D1", "D2") are fully automatic, matching handleAddDecant's own
// real numbering — no manual label entry anywhere in this component.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StainMultiSelect } from '@/pages/SynopticReportPage/modals/BlockStainEditorModal';
import type { Decant, DecantType } from '@/types/case/Material';
import type { StainType } from '@/services/stains/IStainService';
import type { MolecularTarget } from '@/types/billing/MolecularBillingRule';

interface CytologyMaterialViewProps {
  specimenDescription?: string;
  decants: Decant[] | undefined;
  stainTypes: StainType[];
  masterTargets: MolecularTarget[];
  onAddDecant: (decantType: DecantType) => void;
  onUpdateStains: (decantId: string, stains: Decant['stains']) => void;
}

const CytologyMaterialView: React.FC<CytologyMaterialViewProps> = ({ specimenDescription, decants, stainTypes, masterTargets, onAddDecant, onUpdateStains }) => {
  const { t } = useTranslation();

  return (
    <div>
      {specimenDescription && (
        <div className="ps-cytmaterial-specimen-label">
          {t('cytologyScreening.materialDrawer.specimenLabel')}: {specimenDescription}
        </div>
      )}

      {(!decants || decants.length === 0) && (
        <div className="ps-cytmaterial-no-decants">{t('cytologyScreening.materialDrawer.noDecants')}</div>
      )}

      {(decants ?? []).map(decant => (
        <div key={decant.id} className="ps-cytmaterial-decant-card">
          <div className="ps-cytmaterial-decant-header">
            <div className="ps-cytmaterial-decant-label">
              {decant.label} — {t(`cytologyScreening.materialDrawer.decantType.${decant.decantType}`)}
            </div>
          </div>
          <StainMultiSelect
            stainTypes={stainTypes}
            stains={decant.stains}
            onChange={(stains) => onUpdateStains(decant.id, stains as Decant['stains'])}
            masterTargets={masterTargets}
          />
        </div>
      ))}

      <div className="ps-flex-row-gap-8 ps-mt-8">
        <button onClick={() => onAddDecant('residual_fluid')}
          className="ps-cytmaterial-add-btn">
          + {t('cytologyScreening.materialDrawer.addResidualFluidBtn')}
        </button>
        <button onClick={() => onAddDecant('cell_block')}
          className="ps-cytmaterial-add-btn--primary">
          + {t('cytologyScreening.materialDrawer.addCellBlockBtn')}
        </button>
      </div>
    </div>
  );
};

export default CytologyMaterialView;
