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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { RetentionHold, RetentionHoldReason } from '@/types/case/RetentionHold';
import { RETENTION_HOLD_REASON_LABEL } from '@/types/case/RetentionHold';

interface RetentionHoldModalProps {
  caseId: string;
  accession: string;
  retentionHolds: RetentionHold[];
  currentUserId: string;
  currentUserName: string;
  onUpdated: (retentionHolds: RetentionHold[]) => void;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

export const RetentionHoldModal: React.FC<RetentionHoldModalProps> = ({
  caseId, accession, retentionHolds, currentUserId, currentUserName, onUpdated, onClose,
}) => {
  const activeHold = retentionHolds.find(h => h.active);
  const pastHolds = retentionHolds.filter(h => !h.active).sort((a, b) => b.setAt.localeCompare(a.setAt));

  const [reason, setReason] = useState<RetentionHoldReason>('patient_requested_retention');
  const [note, setNote] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [busy, setBusy] = useState(false);

  const placeHold = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const newHold: RetentionHold = {
      id: `hold-${Date.now()}`,
      reason, note: note.trim(),
      setAt: new Date().toISOString(),
      setByUserId: currentUserId, setByUserName: currentUserName,
      active: true,
    };
    const updated = [...retentionHolds, newHold];
    await caseRouter.updateCase(caseId, { retentionHolds: updated });
    setBusy(false);
    onUpdated(updated);
  };

  const releaseHold = async () => {
    if (!activeHold || !releaseNote.trim()) return;
    setBusy(true);
    const updated = retentionHolds.map(h => h.id === activeHold.id ? {
      ...h, active: false,
      releasedAt: new Date().toISOString(),
      releasedByUserId: currentUserId, releasedByUserName: currentUserName,
      releaseNote: releaseNote.trim(),
    } : h);
    await caseRouter.updateCase(caseId, { retentionHolds: updated });
    setBusy(false);
    onUpdated(updated);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">🔒 Retention Hold</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note" style={{ marginBottom: 16 }}>
            Case <span data-phi="accession">{accession}</span> — a hold blocks this case's own material from ever reaching disposal eligibility,
            regardless of retention period, until it's explicitly released.
          </p>

          {activeHold ? (
            <>
              <div className="ps-intraop-note" style={{ borderColor: 'rgba(248,113,113,0.4)' }}>
                <span className="ps-intraop-note-label" style={{ color: '#f87171' }}>
                  Active — {RETENTION_HOLD_REASON_LABEL[activeHold.reason]}
                </span>
                {activeHold.note}
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Set by {activeHold.setByUserName} — {formatTimestamp(activeHold.setAt)}
                </div>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Release Note — required</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={releaseNote}
                  onChange={e => setReleaseNote(e.target.value)}
                  placeholder='Specific explanation — e.g. "Patient confirmed no further need for specimen return, 2026-09-01."'
                />
              </div>
            </>
          ) : (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="retention-hold-reason">Hold Reason</label>
                <select id="retention-hold-reason" className="ps-conf-select"
                  value={reason} onChange={e => setReason(e.target.value as RetentionHoldReason)}>
                  {Object.entries(RETENTION_HOLD_REASON_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Note — required</label>
                <textarea
                  className="ps-conf-input ps-conf-textarea"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder='Specific explanation — e.g. "Patient called 2026-08-15 requesting blocks returned for a second opinion at City Hospital"'
                />
              </div>
            </>
          )}

          {pastHolds.length > 0 && (
            <>
              <div className="ps-syn-section-label" style={{ marginTop: 20 }}>Past Holds ({pastHolds.length})</div>
              {pastHolds.map(h => (
                <div key={h.id} className="ps-intraop-note" style={{ opacity: 0.75, marginBottom: 8 }}>
                  <span className="ps-intraop-note-label">{RETENTION_HOLD_REASON_LABEL[h.reason]}</span>
                  {h.note}
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                    Set by {h.setByUserName} — {formatTimestamp(h.setAt)}
                    <br />
                    Released by {h.releasedByUserName} — {h.releasedAt && formatTimestamp(h.releasedAt)}: {h.releaseNote}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-btn-secondary" onClick={onClose} disabled={busy}>Close</button>
          {activeHold ? (
            <button className="ps-ms-btn-apply" onClick={releaseHold} disabled={busy || !releaseNote.trim()}>
              Release Hold
            </button>
          ) : (
            <button className="ps-ms-btn-apply" onClick={placeHold} disabled={busy || !note.trim()}>
              Place Hold
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetentionHoldModal;
