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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { CaseHold, CaseHoldReason } from '@/types/case/CaseHold';
import { CASE_HOLD_REASON_LABEL } from '@/types/case/CaseHold';

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
        <div className="ps-ms-header">⛔ Case Hold</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note" style={{ marginBottom: 16 }}>
            Case <span data-phi="accession">{accession}</span> — a hold means something genuinely needs resolving before this case can move
            forward. It blocks finalize until explicitly released. For a case that's simply waiting on routine
            ancillary results (IHC, molecular), leave it as a normal in-progress case instead — a hold is for
            something actually wrong.
          </p>

          {activeHold ? (
            <>
              <div className="ps-intraop-note" style={{ borderColor: 'rgba(248,113,113,0.4)' }}>
                <span className="ps-intraop-note-label" style={{ color: '#f87171' }}>
                  Active — {CASE_HOLD_REASON_LABEL[activeHold.reason]}
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
                  placeholder='Specific explanation — e.g. "Re-cut received from histology, block 2 now adequate for diagnosis."'
                />
              </div>
            </>
          ) : (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="case-hold-reason">Hold Reason</label>
                <select id="case-hold-reason" className="ps-conf-select"
                  value={reason} onChange={e => setReason(e.target.value as CaseHoldReason)}>
                  {Object.entries(CASE_HOLD_REASON_LABEL).map(([value, label]) => (
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
                  placeholder='Specific explanation — e.g. "Block 2 tissue fragmented on sectioning, re-cut requested from histology."'
                />
              </div>
            </>
          )}

          {pastHolds.length > 0 && (
            <>
              <div className="ps-syn-section-label" style={{ marginTop: 20 }}>Past Holds ({pastHolds.length})</div>
              {pastHolds.map(h => (
                <div key={h.id} className="ps-intraop-note" style={{ opacity: 0.75, marginBottom: 8 }}>
                  <span className="ps-intraop-note-label">{CASE_HOLD_REASON_LABEL[h.reason]}</span>
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

export default CaseHoldModal;
