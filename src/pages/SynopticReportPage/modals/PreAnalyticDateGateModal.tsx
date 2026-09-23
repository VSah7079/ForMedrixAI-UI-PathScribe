// src/pages/SynopticReportPage/modals/PreAnalyticDateGateModal.tsx
// ─────────────────────────────────────────────────────────────
// Blocks case sign-out when a specimen is missing its required
// collection and/or laboratory-receipt date/time — real, per direct
// guidance's own cross-jurisdiction compliance research (UKAS ISO
// 15189 Clause 7.2, CAP/CLIA § 493.1241, RCPath, EU IVDR/ISO 15189,
// IANZ AS ISO 15189:2022, KAZA/KSP/KSLM, NATA/NPAAC — every real
// jurisdiction PathScribe targets is a hard block here, never merely
// advisory; see resolvePreAnalyticDateGateConfig.ts for the full,
// per-country citation/label/disclaimer text). Same real "hard block,
// not a warning, with a genuine last-resort override" shape as
// FixativeTimeGateModal — two legitimate ways to resolve each missing
// date independently:
//   1. Enter the actual documented date/time.
//   2. Confirm it truly isn't recoverable — the jurisdiction's own
//      designated administrative-override label is applied, a
//      mandatory report disclaimer follows, and a real, OPEN
//      SpecimenDeficiency (CAPA) record is raised — deliberately left
//      open, not auto-closed, since this is a genuine Pre-Analytic
//      Non-Conformity warranting real review, not just a documentation
//      fix (see def-missing-preanalytic-date's own doc comment).
// Collection and receipt are independently required — a specimen can
// be missing either one, both, or neither; only the genuinely missing
// field(s) are shown per specimen.
//
// i18n note: `config.standardReference` and
// `config.administrativeOverrideLabel` are real, resolved per-country
// regulatory citation/label text (data, sourced from
// resolvePreAnalyticDateGateConfig.ts) — interpolated into translated
// sentences, never translated themselves. `s.label`/`s.description`
// are likewise real specimen data.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { PreAnalyticDateGateConfig } from '@/services/billing/resolvePreAnalyticDateGateConfig';

export interface PreAnalyticDateGateSpecimen {
  specimenId: string;
  label: string;
  description: string;
  missingCollectedAt: boolean;
  missingReceivedAt: boolean;
}

export interface PreAnalyticDateResolution {
  specimenId: string;
  collectedAt?: string;
  collectedAtAdministrativeOverride?: boolean;
  receivedAt?: string;
  receivedAtAdministrativeOverride?: boolean;
  /** Required whenever either override flag above is true — the real,
   *  audited justification for why neither a documented date nor a
   *  reasonable estimate could be established. */
  overrideComment?: string;
}

interface Props {
  specimens: PreAnalyticDateGateSpecimen[];
  /** Real, resolved per-country config (resolvePreAnalyticDateGateConfig)
   *  for the case's own site/organisation — drives the exact
   *  administrative-override label and standard citation shown here.
   *  Resolved once at the call site, not re-resolved per specimen. */
  config: PreAnalyticDateGateConfig;
  onContinue: (resolutions: PreAnalyticDateResolution[]) => void;
  onCancel: () => void;
}

type FieldState =
  | { mode: 'unset' }
  | { mode: 'time'; value: string }
  | { mode: 'override' };

interface RowState {
  collected: FieldState;
  received: FieldState;
  comment: string;
}

const emptyRow = (): RowState => ({ collected: { mode: 'unset' }, received: { mode: 'unset' }, comment: '' });

export const PreAnalyticDateGateModal: React.FC<Props> = ({ specimens, config, onContinue, onCancel }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, RowState>>(
    Object.fromEntries(specimens.map(s => [s.specimenId, emptyRow()]))
  );

  const patchRow = (id: string, patch: Partial<RowState>) =>
    setRows(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow()), ...patch } }));

  const fieldResolved = (s: PreAnalyticDateGateSpecimen, row: RowState, which: 'collected' | 'received') => {
    const required = which === 'collected' ? s.missingCollectedAt : s.missingReceivedAt;
    if (!required) return true;
    const field = row[which];
    if (field.mode === 'time') return !!field.value;
    if (field.mode === 'override') return true;
    return false;
  };

  const usesOverride = (row: RowState) => row.collected.mode === 'override' || row.received.mode === 'override';

  const allResolved = specimens.every(s => {
    const row = rows[s.specimenId] ?? emptyRow();
    const collectedOk = fieldResolved(s, row, 'collected');
    const receivedOk = fieldResolved(s, row, 'received');
    // A comment is required once any field on this specimen used the
    // administrative override — the real, audited justification.
    const commentOk = usesOverride(row) ? row.comment.trim().length > 0 : true;
    return collectedOk && receivedOk && commentOk;
  });

  const handleContinue = () => {
    const resolutions: PreAnalyticDateResolution[] = specimens.map(s => {
      const row = rows[s.specimenId] ?? emptyRow();
      const resolution: PreAnalyticDateResolution = { specimenId: s.specimenId };
      if (s.missingCollectedAt) {
        if (row.collected.mode === 'time') resolution.collectedAt = new Date(row.collected.value).toISOString();
        else if (row.collected.mode === 'override') resolution.collectedAtAdministrativeOverride = true;
      }
      if (s.missingReceivedAt) {
        if (row.received.mode === 'time') resolution.receivedAt = new Date(row.received.value).toISOString();
        else if (row.received.mode === 'override') resolution.receivedAtAdministrativeOverride = true;
      }
      if (usesOverride(row)) resolution.overrideComment = row.comment.trim();
      return resolution;
    });
    onContinue(resolutions);
  };

  const fieldRow = (
    s: PreAnalyticDateGateSpecimen,
    row: RowState,
    which: 'collected' | 'received',
    label: string
  ) => {
    const required = which === 'collected' ? s.missingCollectedAt : s.missingReceivedAt;
    if (!required) return null;
    const field = row[which];
    return (
      <div className="ps-fixgate-row-fields" key={which}>
        <span className="ps-fixgate-field-label">{label}</span>
        {field.mode !== 'override' ? (
          <>
            <input
              type="datetime-local"
              className="ps-input-dark"
              value={field.mode === 'time' ? field.value : ''}
              onChange={e => patchRow(s.specimenId, { [which]: { mode: 'time', value: e.target.value } } as Partial<RowState>)}
            />
            <button
              className="ps-btn-secondary ps-fixgate-unrecoverable-btn"
              onClick={() => patchRow(s.specimenId, { [which]: { mode: 'override' } } as Partial<RowState>)}
            >
              {t('preAnalyticDateGateModal.notRecoverableApply', { label: config.administrativeOverrideLabel })}
            </button>
          </>
        ) : (
          <>
            <span className="ps-fixgate-unrecoverable-badge">
              {t('preAnalyticDateGateModal.administrativeOverrideBadge', { label: config.administrativeOverrideLabel })}
            </span>
            <button className="ps-btn-secondary" onClick={() => patchRow(s.specimenId, { [which]: { mode: 'unset' } } as Partial<RowState>)}>
              {t('caseTeamModal.dropZone.undoButton')}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">⚠ {t('preAnalyticDateGateModal.header')}</div>
        <div className="ps-ms-body ps-fixgate-body">
          <p className="ps-fixgate-intro">
            {t('preAnalyticDateGateModal.intro', { standardReference: config.standardReference })}
          </p>

          {specimens.map(s => {
            const row = rows[s.specimenId] ?? emptyRow();
            return (
              <div key={s.specimenId} className="ps-fixgate-row">
                <div className="ps-fixgate-row-title">
                  {t('preAnalyticDateGateModal.specimenRowTitle', { label: s.label, description: s.description })}
                </div>
                {fieldRow(s, row, 'collected', t('preAnalyticDateGateModal.collectedLabel'))}
                {fieldRow(s, row, 'received', t('preAnalyticDateGateModal.receivedLabel'))}
                {usesOverride(row) && (
                  <div className="ps-fixgate-row-fields">
                    <input
                      type="text"
                      className="ps-input-dark ps-fixgate-comment-input"
                      placeholder={t('preAnalyticDateGateModal.commentPlaceholder')}
                      value={row.comment}
                      onChange={e => patchRow(s.specimenId, { comment: e.target.value })}
                    />
                  </div>
                )}
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
