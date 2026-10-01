// src/pages/SynopticReportPage/modals/RetentionHoldModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Retention Hold UI on
// AccessionPage — not wired." Investigated directly before building:
// that specific claim was stale — AccessionPage.tsx already has a
// real, complete, working checkbox/reason/note flow for placing a
// hold at the moment a case is created (types/case/RetentionHold.ts's
// own header even quotes the original request for it: "The hold
// Retention flag should be also on the accession screen").
//
// The real, remaining gap this modal closes: that accession-time flow
// is the ONLY place a hold could ever be set — nothing let a tech
// place one on an ALREADY-accessioned case (a patient calling weeks
// later, litigation surfacing after the fact), and there was no
// release mechanism anywhere at all, despite RetentionHold's own type
// being fully designed for one (active/releasedAt/releasedByUserId/
// releaseNote). Confirmed directly (grepped every real reference)
// before writing this — zero release call sites existed anywhere.
//
// Deliberately its own small modal, not folded into Case Comment —
// same real reasoning RetentionHold.ts's own header already gives for
// not folding this into the generic Flag/SpecimenFlag systems: this
// gates a real, irreversible physical action (disposal), and needs
// its own explicit, always-checkable state, not buried in a thread of
// unrelated remarks.
//
// i18n note: `REASON_LABEL_KEY` below is this file's own on-screen-
// only translation-key map for `RetentionHoldReason`; the imported
// `RETENTION_HOLD_REASON_LABEL` (types/case/RetentionHold.ts) stays
// the literal-English source of truth for the type itself and isn't
// modified. `accession`/`activeHold.note`/`.setByUserName`/
// `h.releaseNote`/`.releasedByUserName` are all real case/hold data.
//
// Batch 381 (PS-359): placing and releasing go through
// services/cases/caseHolds.ts, which checks the note (Field Requirements,
// locked), the capability (case:retention-hold:place / :release, seeded to
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
import type { RetentionHold, RetentionHoldReason } from '@/types/case/RetentionHold';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';

const REASON_LABEL_KEY: Record<RetentionHoldReason, string> = {
  patient_requested_retention: 'retentionHoldModal.reason.patientRequestedRetention',
  litigation_hold:             'retentionHoldModal.reason.litigationHold',
  research_hold:               'retentionHoldModal.reason.researchHold',
  other:                       'intraopQueue.skipReasons.other',
};

interface RetentionHoldModalProps {
  caseId: string;
  accession: string;
  retentionHolds: RetentionHold[];
  currentUserId: string;
  currentUserName: string;
  onUpdated: (retentionHolds: RetentionHold[], version?: number) => void;
  onClose: () => void;
}


export const RetentionHoldModal: React.FC<RetentionHoldModalProps> = ({
  caseId, accession, retentionHolds, currentUserId, currentUserName, onUpdated, onClose,
}) => {
  const { t, i18n } = useTranslation();
  const requirements = useFieldRequirements('report');
  const formatTimestamp = (iso: string) => formatDateTime(iso, i18n.language);
  const activeHold = retentionHolds.find(h => h.active);
  const pastHolds = retentionHolds.filter(h => !h.active).sort((a, b) => b.setAt.localeCompare(a.setAt));

  const [reason, setReason] = useState<RetentionHoldReason>('patient_requested_retention');
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
    const r = await placeHold('retention', caseId, { reason, note }, actor, requirements, deps);
    setBusy(false);
    if (r.ok === false) { setRefusal(r.reason); return; }
    setRefusal(null);
    onUpdated(r.holds, r.version);
  };

  const onRelease = async () => {
    if (busy || !activeHold || !releaseNote.trim()) return;
    setBusy(true);
    const r = await releaseHold('retention', caseId, { releaseNote }, actor, requirements, deps);
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
        <div className="ps-ms-header">🔒 {t('sidebar.retentionHold.label')}</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note ps-mb-16">
            <Trans
              i18nKey="retentionHoldModal.intro"
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
                  placeholder={t('retentionHoldModal.releaseNotePlaceholder')}
                />
              </div>
            </>
          ) : (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="retention-hold-reason">{t('retentionHoldModal.holdReasonLabel')}</label>
                <select id="retention-hold-reason" className="ps-conf-select"
                  value={reason} onChange={e => setReason(e.target.value as RetentionHoldReason)}>
                  {(Object.keys(REASON_LABEL_KEY) as RetentionHoldReason[]).map(value => (
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
                  placeholder={t('retentionHoldModal.notePlaceholder')}
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
            <CapabilityButton capability="case:retention-hold:release" context={{ caseId }} className="ps-ms-btn-apply" onClick={() => { void onRelease(); }} disabled={busy || !releaseNote.trim()}>
              {t('retentionHoldModal.releaseHoldButton')}
            </CapabilityButton>
          ) : (
            <CapabilityButton capability="case:retention-hold:place" context={{ caseId }} className="ps-ms-btn-apply" onClick={() => { void onPlace(); }} disabled={busy || !note.trim()}>
              {t('retentionHoldModal.placeHoldButton')}
            </CapabilityButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetentionHoldModal;
