// src/pages/AccessionPage/IntraopMergePromptModal.tsx
// ─────────────────────────────────────────────────────────────
// Closes the loop the original Intraop spec described — "when the
// formal order finally arrives from the LIS, PathScribe should look
// for a match." A newly-accessioned case *is* that moment; this modal
// surfaces the match right here rather than requiring someone to
// separately remember to check the Intraop Queue page later.
//
// Non-blocking by design, same philosophy as the rest of this
// feature — merging now is one click, but declining doesn't lose
// anything. The entry stays in the queue exactly as it would have if
// this prompt didn't exist at all.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import '../../pathscribe.css';
import type { EntryMatch } from '@/types/intraop/IntraoperativeEntry';

interface Props {
  caseId: string;
  match: EntryMatch;
  onMergeNow: () => void;
  onGoToQueueLater: () => void;
  onDismiss: () => void;
}

export const IntraopMergePromptModal: React.FC<Props> = ({ caseId, match, onMergeNow, onGoToQueueLater, onDismiss }) => {
  const { entry, matchType, matchReason, confidence } = match;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Intraoperative Entry Found</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-merge-intro">
            An unlinked intraoperative entry looks like it belongs to case {caseId}.
          </p>

          <div className="ps-intraop-candidate-row">
            <span className="ps-intraop-candidate-case" data-phi="name">{entry.patientMatch.patientName}</span>
            <span className={`ps-intraop-candidate-badge ps-intraop-candidate-badge--${confidence}`}>
              {matchType === 'mrn_exact' ? 'MRN match' : `Fuzzy · ${confidence}`}
            </span>
          </div>
          <div className="ps-intraop-candidate-reason">{matchReason}</div>

          <div className="ps-conf-form-field ps-intraop-note-group">
            <div className="ps-intraop-note">
              <span className="ps-intraop-note-label">{entry.orNumber} · {entry.surgeon} · {entry.specimens.length} specimen{entry.specimens.length === 1 ? '' : 's'}</span>
            </div>
            {entry.specimens.map(spec => (
              <div key={spec.id} className="ps-intraop-note">
                <span className="ps-intraop-note-label">{spec.specimenLabel}</span>
                {spec.quickGrossDictation || '(no Quick Gross logged)'}
              </div>
            ))}
          </div>

          <p className="ps-intraop-merge-intro ps-intraop-merge-intro--footer">
            Merging appends this to the case's Gross Description / Clinical History and attaches any mobile photos to the media gallery.
          </p>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onDismiss}>Not this case</button>
          <button className="ps-ms-btn-cancel" onClick={onGoToQueueLater}>Review in Intraop Queue</button>
          <button className="ps-ms-btn-apply" onClick={onMergeNow}>Merge Now</button>
        </div>
      </div>
    </div>
  );
};
