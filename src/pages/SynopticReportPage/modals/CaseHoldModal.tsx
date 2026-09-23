// src/pages/SynopticReportPage/modals/CaseHoldModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "putting a case on Hold at the
// case level makes sense if there is something truly wrong. In that
// case we should add a tile in their worklist for Cases on Hold. Then
// remove the whole deferred bit." See types/case/CaseHold.ts's own
// header for the full reasoning, and why this is a genuinely separate
// concept from RetentionHoldModal.tsx (post-finalization, disposal-
// only) rather than a reuse of it.
//
// Same real UI shell/pattern as RetentionHoldModal.tsx — set/release
// with a required note either way, full history of past holds — the
// two modals read almost identically on purpose: a pathologist who's
// learned one already knows the other.
//
// i18n note: `REASON_LABEL_KEY` below is this file's own on-screen-
// only translation-key map for `CaseHoldReason`; the imported
// `CASE_HOLD_REASON_LABEL` (types/case/CaseHold.ts) stays the literal-
// English source of truth for the type itself and isn't modified —
// same precedent as RetentionHoldModal.tsx's own `REASON_LABEL_KEY`
// (batch 175). Several keys/classes are reused outright from
// `retentionHoldModal.*`/`.ps-intraop-note*`/`.ps-retentionhold-meta`,
// since these two modals were deliberately built to read (and look)
// almost identically.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { CaseHold, CaseHoldReason } from '@/types/case/CaseHold';

const REASON_LABEL_KEY: Record<CaseHoldReason, string> = {
  quality_issue:              'caseHoldModal.reason.qualityIssue',
  awaiting_outside_materials: 'caseHoldModal.reason.awaitingOutsideMaterials',
  clinical_discrepancy:       'caseHoldModal.reason.clinicalDiscrepancy',
  pending_consultation:       'caseHoldModal.reason.pendingConsultation',
  other:                      'intraopQueue.skipReasons.other',
};

interface CaseHoldModalProps {
  caseId: string;
  accession: string;
  caseHolds: CaseHold[];
  currentUserId: string;
  currentUserName: string;
  onUpdated: (caseHolds: CaseHold[]) => void;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

export const CaseHoldModal: React.FC<CaseHoldModalProps> = ({
  caseId, accession, caseHolds, currentUserId, currentUserName, onUpdated, onClose,
}) => {
  const { t } = useTranslation();
  const activeHold = caseHolds.find(h => h.active);
  const pastHolds = caseHolds.filter(h => !h.active).sort((a, b) => b.setAt.localeCompare(a.setAt));

  const [reason, setReason] = useState<CaseHoldReason>('quality_issue');
  const [note, setNote] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [busy, setBusy] = useState(false);

  const placeHold = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const newHold: CaseHold = {
      id: `casehold-${Date.now()}`,
      reason, note: note.trim(),
      setAt: new Date().toISOString(),
      setByUserId: currentUserId, setByUserName: currentUserName,
      active: true,
    };
    const updated = [...caseHolds, newHold];
    await caseRouter.updateCase(caseId, { caseHolds: updated });
    setBusy(false);
    onUpdated(updated);
  };

  const releaseHold = async () => {
    if (!activeHold || !releaseNote.trim()) return;
    setBusy(true);
    const updated = caseHolds.map(h => h.id === activeHold.id ? {
      ...h, active: false,
      releasedAt: new Date().toISOString(),
      releasedByUserId: currentUserId, releasedByUserName: currentUserName,
      releaseNote: releaseNote.trim(),
    } : h);
    await caseRouter.updateCase(caseId, { caseHolds: updated });
    setBusy(false);
    onUpdated(updated);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">⛔ {t('caseHoldModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note ps-mb-16">
            <Trans
              i18nKey="caseHoldModal.intro"
              values={{ accession }}
              components={{ case: <span data-phi="accession" /> }}
            />
          </p>

          {activeHold ? (
            <>
              <div className="ps-intraop-note ps-intraop-note--danger">
                <span className="ps-intraop-note-label ps-intraop-note-label--danger">
                  {t('retentionHoldModal.activeLabel', { reason: t(REASON_LABEL_KEY[activeHold.reason]) })}
                </span>
                {activeHold.note}
                <div className="ps-retentionhold-meta">
                  {t('retentionHoldModal.setByLine', { name: activeHold.setByUserName, timestamp: formatTimestamp(activeHold.setAt) })}
                </div>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('retentionHoldModal.releaseNoteLabel')}</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={releaseNote}
                  onChange={e => setReleaseNote(e.target.value)}
                  placeholder={t('caseHoldModal.releaseNotePlaceholder')}
                />
              </div>
            </>
          ) : (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="case-hold-reason">{t('retentionHoldModal.holdReasonLabel')}</label>
                <select id="case-hold-reason" className="ps-conf-select"
                  value={reason} onChange={e => setReason(e.target.value as CaseHoldReason)}>
                  {(Object.keys(REASON_LABEL_KEY) as CaseHoldReason[]).map(value => (
                    <option key={value} value={value}>{t(REASON_LABEL_KEY[value])}</option>
                  ))}
                </select>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('retentionHoldModal.noteLabel')}</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('caseHoldModal.notePlaceholder')}
                />
              </div>
            </>
          )}

          {pastHolds.length > 0 && (
            <>
              <div className="ps-syn-section-label ps-mt-20">{t('retentionHoldModal.pastHoldsHeading', { count: pastHolds.length })}</div>
              {pastHolds.map(h => (
                <div key={h.id} className="ps-intraop-note ps-intraop-note--dimmed ps-mb-8">
                  <span className="ps-intraop-note-label">{t(REASON_LABEL_KEY[h.reason])}</span>
                  {h.note}
                  <div className="ps-retentionhold-meta">
                    {t('retentionHoldModal.setByLine', { name: h.setByUserName, timestamp: formatTimestamp(h.setAt) })}
                    <br />
                    {t('retentionHoldModal.releasedByLine', { name: h.releasedByUserName, timestamp: h.releasedAt && formatTimestamp(h.releasedAt), note: h.releaseNote })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-btn-secondary" onClick={onClose} disabled={busy}>{t('common.close')}</button>
          {activeHold ? (
            <button className="ps-ms-btn-apply" onClick={releaseHold} disabled={busy || !releaseNote.trim()}>
              {t('retentionHoldModal.releaseHoldButton')}
            </button>
          ) : (
            <button className="ps-ms-btn-apply" onClick={placeHold} disabled={busy || !note.trim()}>
              {t('retentionHoldModal.placeHoldButton')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaseHoldModal;
