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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 12 }}>
          {t('cytologyScreening.materialDrawer.specimenLabel')}: {specimenDescription}
        </div>
      )}

      {(!decants || decants.length === 0) && (
        <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 14 }}>{t('cytologyScreening.materialDrawer.noDecants')}</div>
      )}

      {(decants ?? []).map(decant => (
        <div key={decant.id} style={{ marginBottom: 16, padding: '10px 12px', background: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#e5e7eb' }}>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onAddDecant('residual_fluid')}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'transparent', border: '1px solid #37415155', borderRadius: 6, cursor: 'pointer' }}>
          + {t('cytologyScreening.materialDrawer.addResidualFluidBtn')}
        </button>
        <button onClick={() => onAddDecant('cell_block')}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          + {t('cytologyScreening.materialDrawer.addCellBlockBtn')}
        </button>
      </div>
    </div>
  );
};

export default CytologyMaterialView;
