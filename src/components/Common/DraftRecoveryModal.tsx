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
//
// i18n note: `computeDraftDiff.ts` returns translation keys (+
// interpolation params) rather than rendered strings — see that
// file's own i18n note — so this component does the actual `t()`
// resolution for each diff entry's label/summary. "Restore" reuses
// `appShell.messageList.restoreButton` (exact-text match).

import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const savedDate = new Date(savedAt);
  const formatted = savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' at ' + savedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const hasComputedChanges = Array.isArray(changes);

  return (
    <div className="ps-overlay ps-overlay--draft-recovery">
      <div className={`ps-modal-dark ps-modal-dark--draft-recovery${hasComputedChanges ? ' ps-modal-dark--draft-recovery-wide' : ''}`}>
        <div className="ps-draftrecovery-icon-wrap">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </div>
        <span className="ps-modal-dark-title">{t('draftRecoveryModal.title')}</span>
        <p className="ps-modal-dark-body">
          {hasComputedChanges
            ? t('draftRecoveryModal.recoveredMessage', { time: formatted })
            : t('draftRecoveryModal.recoveredMessageWithPrompt', { time: formatted })}
        </p>
        {hasComputedChanges && (
          changes!.length > 0 ? (
            <div className="ps-draftrecovery-diff-list">
              <div className="ps-draftrecovery-diff-header">{t('draftRecoveryModal.diffHeader')}</div>
              {changes!.map(c => (
                <div key={c.field} className="ps-draftrecovery-diff-row">
                  <span className="ps-draftrecovery-diff-label">{c.labelKey ? t(c.labelKey) : c.labelFallback}</span>
                  <span className="ps-draftrecovery-diff-summary">{t(c.summaryKey, c.summaryParams)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ps-draftrecovery-diff-empty">
              {t('draftRecoveryModal.noDifferencesFound')}
            </p>
          )
        )}
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onDiscard}>{t('draftRecoveryModal.discardDraftButton')}</button>
          <button className="ps-btn-primary" onClick={onRestore} autoFocus>{t('appShell.messageList.restoreButton')}</button>
        </div>
      </div>
    </div>
  );
};

export default DraftRecoveryModal;
