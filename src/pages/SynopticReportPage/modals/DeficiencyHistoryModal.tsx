// src/pages/SynopticReportPage/modals/DeficiencyHistoryModal.tsx
// ─────────────────────────────────────────────────────────────
// Read-only view of a case's specimen deficiency history — raised and
// resolved records only, no new deficiencies get created from here.
// Closes a real gap: getByCaseId() already existed on
// ISpecimenDeficiencyService with zero UI ever calling it — both
// Accession and this page only ever wrote deficiency records, never
// read them back. The Config admin log was the only place to see one,
// disconnected from the case itself.
// ─────────────────────────────────────────────────────────────
//
// i18n note: `typeName()`/`resolutionName()` resolve real dictionary
// entries, and `d.comment`/`d.correctiveAction`/`d.resolutionComment`/
// `d.preventiveAction`/`d.verificationComment`/`d.specimenLabel`/
// `d.raisedBy`/`d.resolvedBy`/`d.verifiedBy` are all real case data —
// none of that is translated. The status labels ("Closed"/"Pending
// Verification"/"Open") reuse `auditLog.statusLabels.*` (the same
// generic status vocabulary already shared across the QA/audit-log
// screens); "Case-level" reuses `qualityAssurance.operations
// .caseLevel`; the specimen label reuses `dispatchHistoryTimeline
// .specimenLabel`; "Preventive action:" reuses `qualityAssurance
// .modals.verify.preventiveActionTaken` — all exact-text matches.
import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { SpecimenDeficiency, DeficiencyType, ResolutionType } from '../../../services/deficiencies/IDeficiencyService';

interface Props {
  deficiencies: SpecimenDeficiency[];
  deficiencyTypes: DeficiencyType[];
  resolutionTypes: ResolutionType[];
  onClose: () => void;
}

const formatTimestamp = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};

export const DeficiencyHistoryModal: React.FC<Props> = ({ deficiencies, deficiencyTypes, resolutionTypes, onClose }) => {
  const { t } = useTranslation();
  const typeName = (id: string) => deficiencyTypes.find(t => t.id === id)?.name ?? id;
  const resolutionName = (id?: string) => id ? (resolutionTypes.find(t => t.id === id)?.name ?? id) : '—';

  const sorted = [...deficiencies].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">⚠ {t('deficiencyHistoryModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {t('deficiencyHistoryModal.intro', { count: deficiencies.length })}
          </p>
          {sorted.length === 0 && (
            <div className="ps-cmnt-thread-empty">{t('deficiencyHistoryModal.noneRecorded')}</div>
          )}
          {sorted.map(d => (
            <div key={d.id} className="ps-defichist-item">
              <div className="ps-defichist-header">
                <strong className="ps-defichist-specimen">{d.specimenLabel ? t('dispatchHistoryTimeline.specimenLabel', { label: d.specimenLabel }) : t('qualityAssurance.operations.caseLevel')}</strong>
                <span className={`ps-defichist-status ps-defichist-status--${d.status}`}>
                  {d.status === 'closed' ? `✓ ${t('auditLog.statusLabels.closed')}` : d.status === 'pending-verification' ? `⏳ ${t('auditLog.statusLabels.pendingVerification')}` : `⏳ ${t('auditLog.statusLabels.open')}`}
                </span>
              </div>
              <div className="ps-defichist-row">
                <span className="ps-defichist-label">{t('deficiencyHistoryModal.issueLabel')}</span> {typeName(d.deficiencyTypeId)}
              </div>
              {d.comment && (
                <div className="ps-defichist-row ps-defichist-comment">{d.comment}</div>
              )}
              <div className="ps-defichist-row">
                <span className="ps-defichist-label">{t('deficiencyHistoryModal.raisedByLabel')}</span> {d.raisedBy === 'system' ? t('deficiencyHistoryModal.systemAutoDetected') : d.raisedBy} · {formatTimestamp(d.raisedAt)}
              </div>
              {(d.status === 'pending-verification' || d.status === 'closed') && (
                <div className="ps-defichist-row">
                  <span className="ps-defichist-label">{t('deficiencyHistoryModal.correctiveActionLabel')}</span> {d.correctiveAction || resolutionName(d.resolutionTypeId)} {t('deficiencyHistoryModal.dashByName', { name: d.resolvedBy })} · {formatTimestamp(d.resolvedAt)}
                  {d.resolutionComment && <div className="ps-defichist-comment">{d.resolutionComment}</div>}
                  {d.preventiveAction && <div className="ps-defichist-comment">{t('qualityAssurance.modals.verify.preventiveActionTaken')} {d.preventiveAction}</div>}
                </div>
              )}
              {d.status === 'closed' && d.verifiedBy && (
                <div className="ps-defichist-row">
                  <span className="ps-defichist-label">{t('deficiencyHistoryModal.verifiedEffectiveLabel')}</span> {t('deficiencyHistoryModal.byName', { name: d.verifiedBy })} · {formatTimestamp(d.verifiedAt)}
                  {d.verificationComment && <div className="ps-defichist-comment">{d.verificationComment}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
};
