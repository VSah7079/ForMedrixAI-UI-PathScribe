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
//
// Batch 381 (PS-359): placing and releasing go through
// services/cases/caseHolds.ts, which checks the note (Field Requirements,
// locked), the capability (case:hold:place / :release, seeded to
// every role that could do this before) and the case's current holds, then
// saves and audits. The buttons can also be said ("place hold" /
// "release hold", HOLD_PLACE / HOLD_RELEASE).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import { authorizationService, auditService, actionRegistryService } from '@/services';
import { placeHold, releaseHold } from '@/services/cases/caseHolds';
import { useFieldRequirements } from '@/hooks/useFieldRequirements';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { formatDateTime } from '@/utils/formatDate';
import type { CaseHold, CaseHoldReason } from '@/types/case/CaseHold';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';

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
  onUpdated: (caseHolds: CaseHold[], version?: number) => void;
  onClose: () => void;
}


export const CaseHoldModal: React.FC<CaseHoldModalProps> = ({
  caseId, accession, caseHolds, currentUserId, currentUserName, onUpdated, onClose,
}) => {
  const { t, i18n } = useTranslation();
  const requirements = useFieldRequirements('report');
  const formatTimestamp = (iso: string) => formatDateTime(iso, i18n.language);
  const activeHold = caseHolds.find(h => h.active);
  const pastHolds = caseHolds.filter(h => !h.active).sort((a, b) => b.setAt.localeCompare(a.setAt));

  const [reason, setReason] = useState<CaseHoldReason>('quality_issue');
  const [note, setNote] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [refusal, setRefusal] = useState<string | null>(null);
  const deps = {
    authorization: authorizationService,
    getCase: (id: string) => caseRouter.getCase(id),
    updateCase: (id: string, patch: Parameters<typeof caseRouter.updateCase>[1], version?: number) => caseRouter.updateCase(id, patch, version),
    audit: auditService.logEvent.bind(auditService),
  };
  const actor = { id: currentUserId, name: currentUserName };

  const onPlace = async () => {
    if (busy || !note.trim()) return;
    setBusy(true);
    const r = await placeHold('case', caseId, { reason, note }, actor, requirements, deps);
    setBusy(false);
    if (r.ok === false) { setRefusal(r.reason); return; }
    setRefusal(null);
    onUpdated(r.holds, r.version);
  };

  const onRelease = async () => {
    if (busy || !activeHold || !releaseNote.trim()) return;
    setBusy(true);
    const r = await releaseHold('case', caseId, { releaseNote }, actor, requirements, deps);
    setBusy(false);
    if (r.ok === false) { setRefusal(r.reason); return; }
    setRefusal(null);
    onUpdated(r.holds, r.version);
  };

  // Voice/keyboard "place hold" / "release hold": the same buttons, with the same checks.
  const actRef = useRef<(actionId: string) => void>(() => {});
  actRef.current = (actionId: string) => {
    if (actionId === 'HOLD_PLACE' && !activeHold) void onPlace();
    if (actionId === 'HOLD_RELEASE' && activeHold) void onRelease();
  };
  useEffect(() => actionRegistryService.onAction((actionId: string) => actRef.current(actionId)), []);

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
                <SpellCheckedTextarea
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
                <SpellCheckedTextarea
                  className="ps-conf-input ps-conf-textarea"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('caseHoldModal.notePlaceholder')}
                />
              </div>
            </>
          )}

          {refusal && <p className="ps-field-still-required" role="alert">{t(`holdRefusals.${refusal}`)}</p>}

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
            <CapabilityButton capability="case:hold:release" context={{ caseId }} className="ps-ms-btn-apply" onClick={() => { void onRelease(); }} disabled={busy || !releaseNote.trim()}>
              {t('retentionHoldModal.releaseHoldButton')}
            </CapabilityButton>
          ) : (
            <CapabilityButton capability="case:hold:place" context={{ caseId }} className="ps-ms-btn-apply" onClick={() => { void onPlace(); }} disabled={busy || !note.trim()}>
              {t('retentionHoldModal.placeHoldButton')}
            </CapabilityButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaseHoldModal;
