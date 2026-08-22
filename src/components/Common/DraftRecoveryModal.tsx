// src/components/Common/DraftRecoveryModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 of the Inactivity Timeout & Draft Recovery spec.
//
// Real feature, per direct follow-up: "I thought we were display the
// changes that would be applied to the case." This was this
// component's own, honestly-documented Phase 1 gap — now closed. See
// utils/computeDraftDiff.ts for why the diff itself is a curated,
// top-level comparison rather than a full recursive one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { DraftDiffEntry } from '@/utils/computeDraftDiff';

interface DraftRecoveryModalProps {
  savedAt:     string;
  onRestore:   () => void;
  onDiscard:   () => void;
  /** Real, computed list of what actually differs between the cached
   *  draft and the case as it currently stands — empty/omitted falls
   *  back to the original, undifferentiated copy rather than showing
   *  a misleading "no changes" for a real diff that just couldn't be
   *  computed (e.g. before the current case has finished loading). */
  changes?: DraftDiffEntry[];
}

const DraftRecoveryModal: React.FC<DraftRecoveryModalProps> = ({ savedAt, onRestore, onDiscard, changes }) => {
  const savedDate = new Date(savedAt);
  const formatted = savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' at ' + savedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const hasComputedChanges = Array.isArray(changes);

  return (
    <div className="ps-overlay" style={{ zIndex: 50000 }}>
      <div className="ps-modal-dark" style={{ width: hasComputedChanges ? 480 : 440, textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </div>
        <span className="ps-modal-dark-title">Unsaved Draft Found</span>
        <p className="ps-modal-dark-body">
          We recovered changes from your previous session, saved {formatted}.
          {hasComputedChanges ? '' : ' Would you like to restore them?'}
        </p>
        {hasComputedChanges && (
          changes!.length > 0 ? (
            <div className="ps-draftrecovery-diff-list">
              <div className="ps-draftrecovery-diff-header">Restoring will apply these changes:</div>
              {changes!.map(c => (
                <div key={c.field} className="ps-draftrecovery-diff-row">
                  <span className="ps-draftrecovery-diff-label">{c.label}</span>
                  <span className="ps-draftrecovery-diff-summary">{c.summary}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ps-draftrecovery-diff-empty">
              No differences found from the case as it currently stands.
            </p>
          )
        )}
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onDiscard}>Discard Draft</button>
          <button className="ps-btn-primary" onClick={onRestore} autoFocus>Restore</button>
        </div>
      </div>
    </div>
  );
};

export default DraftRecoveryModal;
