// src/pages/SynopticReportPage/modals/VersionHistoryModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix: closes two real, related gaps found while building Phase 5
// of the Patient/Encounter Management Subsystem (PatientEncounterSnapshot).
// Before this, ReportVersionRecord's real history (version number,
// trigger, who signed, the real generated PDF, and now the real,
// immutable patient/encounter snapshot) was write-only from the UI's
// perspective - reportVersionService.create() was called from three
// real places in SynopticReportPage.tsx, but nothing anywhere ever
// read it back for a human to see. Read-only, matching the established
// DeficiencyHistoryModal pattern exactly (same modal shell, same
// "raised and resolved, read-only" framing applied here as "signed and
// recorded, read-only").
//
// i18n note: `v.createdBy.userName`, `v.generationError`,
// `s.encounterClass`/`.encounterStatus`/`.facility`/`.attendingProvider`/
// ward/room/bed are all real snapshot/version data, never translated.
// `TRIGGER_LABEL_KEY` below is this file's own on-screen-only
// translation-key map for the `trigger` field.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import '../../../pathscribe.css';
import type { ReportVersionRecord } from '@/types/reports/ReportVersionRecord';
import type { PatientEncounterSnapshot } from '@/types/reports/PatientEncounterSnapshot';

interface Props {
  versions: ReportVersionRecord[];
  onClose: () => void;
}

const formatTimestamp = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};

const TRIGGER_LABEL_KEY: Record<string, string> = {
  initial_signout: 'versionHistoryModal.trigger.initialSignout',
  amendment: 'versionHistoryModal.trigger.amendment',
};

/** Real, honest field list - only genuinely present snapshot fields
 *  are shown; a version created before this field existed (or where
 *  capture failed) shows the real, honest "not available" message
 *  below instead, never a grid of blanks. */
function snapshotFields(s: PatientEncounterSnapshot, t: TFunction): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [
    { label: t('reportPreviewRenderer.fieldPatient'), value: `${s.lastName}, ${s.firstName}` },
    { label: t('reportPreviewRenderer.fieldMrn'), value: s.mrn },
    { label: t('reportPreviewRenderer.fieldDob'), value: s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : '—' },
  ];
  if (s.encounterNumber) fields.push({ label: t('versionHistoryModal.snapshotField.encounterNumber'), value: s.encounterNumber });
  if (s.encounterClass) fields.push({ label: t('versionHistoryModal.snapshotField.encounterClass'), value: s.encounterClass });
  if (s.encounterStatus) fields.push({ label: t('versionHistoryModal.snapshotField.encounterStatus'), value: s.encounterStatus });
  if (s.facility) fields.push({ label: t('searchPage.sections.facility'), value: s.facility });
  const location = [s.ward, s.room, s.bed].filter(Boolean).join(' / ');
  if (location) fields.push({ label: t('disposalReport.columns.location'), value: location });
  if (s.attendingProvider) fields.push({ label: t('countersignTurnaroundTab.headers.attending'), value: s.attendingProvider });
  return fields;
}

/** Real, direct base64 → blob conversion, then the same real
 *  createObjectURL/window.open pattern the live print pipeline
 *  already uses (SynopticReportPage.tsx) - falls back to a direct
 *  download if the popup is blocked, same fallback the live pipeline
 *  already has. */
function openHistoricalPdf(pdfBase64: string, versionNumber: number) {
  const byteChars = atob(pdfBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `version-${versionNumber}.pdf`;
    a.click();
  }
}

export const VersionHistoryModal: React.FC<Props> = ({ versions, onClose }) => {
  const { t } = useTranslation();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">🕐 {t('versionHistoryModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {t('versionHistoryModal.intro', { count: versions.length })}
          </p>
          {sorted.length === 0 && (
            <div className="ps-cmnt-thread-empty">{t('versionHistoryModal.emptyState')}</div>
          )}
          {sorted.map(v => {
            const snapshot = v.patientEncounterSnapshot;
            return (
              <div key={v.id} className="ps-verhist-item">
                <div className="ps-verhist-header">
                  <strong className="ps-verhist-version-label">{t('versionHistoryModal.versionLabel', { number: v.versionNumber })}</strong>
                  <span className={`ps-verhist-trigger ps-verhist-trigger--${v.trigger}`}>
                    {TRIGGER_LABEL_KEY[v.trigger] ? t(TRIGGER_LABEL_KEY[v.trigger]) : v.trigger}
                  </span>
                </div>
                <div className="ps-verhist-row">
                  <span className="ps-verhist-label">{t('versionHistoryModal.signedByLabel')}</span> {v.createdBy.userName} · {formatTimestamp(v.createdAt)}
                </div>

                {snapshot ? (
                  <div className="ps-verhist-snapshot">
                    <div className="ps-verhist-snapshot-title">{t('versionHistoryModal.snapshotTitle')}</div>
                    <div className="ps-verhist-snapshot-grid">
                      {snapshotFields(snapshot, t).map(f => (
                        <div key={f.label}>
                          <span className="ps-verhist-snapshot-field-label">{f.label}: </span>
                          <span className="ps-verhist-snapshot-field-value" data-phi="true">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ps-verhist-snapshot-missing">
                    {t('versionHistoryModal.snapshotMissing')}
                  </div>
                )}

                {v.generationError && (
                  <div className="ps-verhist-pdf-error">{t('versionHistoryModal.generationErrorPrefix', { error: v.generationError })}</div>
                )}
                {v.pdfBase64 && (
                  <button
                    type="button"
                    className="ps-verhist-pdf-link"
                    onClick={() => {
                      setPdfError(null);
                      try { openHistoricalPdf(v.pdfBase64!, v.versionNumber); }
                      catch { setPdfError(t('versionHistoryModal.pdfOpenError')); }
                    }}
                  >
                    {t('versionHistoryModal.viewPdfButton')}
                  </button>
                )}
              </div>
            );
          })}
          {pdfError && <div className="ps-verhist-pdf-error">{pdfError}</div>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
};
