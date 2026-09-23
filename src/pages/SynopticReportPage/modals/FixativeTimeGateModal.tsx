// src/pages/SynopticReportPage/modals/FixativeTimeGateModal.tsx
// ─────────────────────────────────────────────────────────────
// Blocks case sign-out when a specimen whose dictionary entry has
// requireFixativeTimeBeforeSignout is missing its fixation time —
// cold-ischemia/fixation timing tracked per CAP/ASCO biomarker guidance
// (breast ER/PR/HER2, etc.). Hard block, not a warning — per the design
// decision this was built from — with three legitimate ways to resolve
// each specimen:
//   1. Enter the actual documented time.
//   2. Enter a professional estimate (surgical suite failed to document
//      it) — permanently flagged wherever this time is later shown, not
//      presented as a verified fact.
//   3. Confirm no time or estimate is possible at all — the true
//      last-resort override, audited same as the other two.
// No preliminary-report escape valve yet (not built) — this modal is
// the entire interim safety valve until that exists.
//
// i18n note: `s.label`/`s.description` are real specimen data, never
// translated.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';

export interface FixativeGateSpecimen {
  specimenId: string;
  label: string;
  description: string;
}

export interface FixativeResolution {
  specimenId: string;
  processedAt?: string;          // undefined only for the unrecoverable path
  processedAtIsEstimated: boolean;
  resolutionTypeId: 'res-fixation-documented' | 'res-fixation-estimated' | 'res-fixation-unrecoverable';
  resolutionComment?: string;
}

interface Props {
  specimens: FixativeGateSpecimen[];
  onContinue: (resolutions: FixativeResolution[]) => void;
  onCancel: () => void;
}

type RowState =
  | { mode: 'unset' }
  | { mode: 'time'; value: string; estimated: boolean }
  | { mode: 'unrecoverable'; comment: string };

export const FixativeTimeGateModal: React.FC<Props> = ({ specimens, onContinue, onCancel }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, RowState>>(
    Object.fromEntries(specimens.map(s => [s.specimenId, { mode: 'unset' as const }]))
  );

  const setRow = (id: string, row: RowState) => setRows(prev => ({ ...prev, [id]: row }));

  const allResolved = specimens.every(s => {
    const r = rows[s.specimenId];
    if (!r) return false;
    if (r.mode === 'time') return !!r.value;
    if (r.mode === 'unrecoverable') return true;
    return false;
  });

  const handleContinue = () => {
    const resolutions: FixativeResolution[] = specimens.map(s => {
      const r = rows[s.specimenId];
      if (r.mode === 'time') {
        return {
          specimenId: s.specimenId,
          processedAt: new Date(r.value).toISOString(),
          processedAtIsEstimated: r.estimated,
          resolutionTypeId: r.estimated ? 'res-fixation-estimated' : 'res-fixation-documented',
        };
      }
      return {
        specimenId: s.specimenId,
        processedAtIsEstimated: false,
        resolutionTypeId: 'res-fixation-unrecoverable',
        resolutionComment: (r as any).comment || undefined,
      };
    });
    onContinue(resolutions);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">⚠ {t('fixativeTimeGateModal.header')}</div>
        <div className="ps-ms-body ps-fixgate-body">
          <p className="ps-fixgate-intro">
            {t('fixativeTimeGateModal.intro')}
          </p>

          {specimens.map(s => {
            const row = rows[s.specimenId] ?? { mode: 'unset' as const };
            return (
              <div key={s.specimenId} className="ps-fixgate-row">
                <div className="ps-fixgate-row-title">
                  {t('fixativeTimeGateModal.specimenRowTitle', { label: s.label, description: s.description })}
                </div>

                {row.mode !== 'unrecoverable' && (
                  <div className="ps-fixgate-row-fields">
                    <input
                      type="datetime-local"
                      className="ps-input-dark"
                      value={row.mode === 'time' ? row.value : ''}
                      onChange={e => setRow(s.specimenId, { mode: 'time', value: e.target.value, estimated: row.mode === 'time' ? row.estimated : false })}
                    />
                    <label className="ps-accession-checkbox-row">
                      <input
                        type="checkbox"
                        checked={row.mode === 'time' && row.estimated}
                        disabled={row.mode !== 'time' || !row.value}
                        onChange={e => row.mode === 'time' && setRow(s.specimenId, { ...row, estimated: e.target.checked })}
                      />
                      {t('accessionPage.specimens.processedAtEstimated')}
                    </label>
                  </div>
                )}

                <div className="ps-fixgate-row-actions">
                  {row.mode === 'unrecoverable' ? (
                    <>
                      <span className="ps-fixgate-unrecoverable-badge">{t('fixativeTimeGateModal.unrecoverableBadge')}</span>
                      <button className="ps-btn-secondary" onClick={() => setRow(s.specimenId, { mode: 'unset' })}>{t('caseTeamModal.dropZone.undoButton')}</button>
                    </>
                  ) : (
                    <button
                      className="ps-btn-secondary ps-fixgate-unrecoverable-btn"
                      onClick={() => setRow(s.specimenId, { mode: 'unrecoverable', comment: '' })}
                    >
                      {t('fixativeTimeGateModal.unrecoverableButton')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onCancel}>{t('preAnalyticDateGateModal.cancelButton')}</button>
          <button className="ps-ms-btn-apply" onClick={handleContinue} disabled={!allResolved}>
            {t('preAnalyticDateGateModal.continueButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
