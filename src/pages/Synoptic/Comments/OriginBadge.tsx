// src/pages/Synoptic/Comments/OriginBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared component — CaseCommentModal.tsx and ReportCommentModal.tsx
// each defined this exact badge (component + sync-status label map)
// identically; extracted here once both needed the same i18n conversion,
// so the real per-status label logic lives in one place instead of two
// copies that could silently drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CaseComment } from '../../../types/case/CaseComment';

// Real, label-key-map — the real syncStatus value stays untouched (used
// to index the CSS modifier class below); only the on-screen label is
// translated. Each status keeps its own leading symbol outside the
// translated text, matching this sweep's established emoji convention.
const SYNC_EMOJI: Record<NonNullable<CaseComment['syncStatus']>, string> = {
  pending: '⏳', sent: '↗', acknowledged: '✓', failed: '⚠',
};
const SYNC_LABEL_KEY: Record<NonNullable<CaseComment['syncStatus']>, string> = {
  pending: 'synopticComments.originBadge.pending',
  sent: 'synopticComments.originBadge.sent',
  acknowledged: 'synopticComments.originBadge.acknowledged',
  failed: 'synopticComments.originBadge.failed',
};

const OriginBadge: React.FC<{ comment: CaseComment }> = ({ comment }) => {
  const { t } = useTranslation();
  if (comment.origin === 'lis') {
    return <span className="ps-cmnt-origin-badge ps-cmnt-origin-badge--lis">{t('synopticComments.originBadge.fromLis')}</span>;
  }
  const status = comment.syncStatus ?? 'pending';
  return (
    <span className={`ps-cmnt-origin-badge ps-cmnt-origin-badge--pathscribe ps-cmnt-origin-badge--${status}`}>
      {SYNC_EMOJI[status]} {t(SYNC_LABEL_KEY[status])}
    </span>
  );
};

export { OriginBadge };
