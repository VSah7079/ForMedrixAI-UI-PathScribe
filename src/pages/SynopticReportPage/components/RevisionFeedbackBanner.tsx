// src/pages/SynopticReportPage/components/RevisionFeedbackBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Continue" — a real, genuine gap found
// while double-checking the just-built "Return to Trainee"/"Reject
// with Notes" feature, not something asked for directly): confirmed
// directly, before building this, that countersignService.getForCase()
// was never called ANYWHERE in this app — meaning attendingFeedback,
// real since this whole countersign workflow was first built, had
// never actually been shown to a resident in context, for either the
// original countersign() (accept) path or this session's own new
// reject() path. The only place attendingFeedback was ever displayed
// at all was CountersignTurnaroundTab.tsx, a QA/management dashboard
// (turnaround metrics, Excel export) — not something a resident would
// naturally open while actively trying to fix their own returned case.
//
// This banner closes that gap for the real, more urgent side of it —
// a returned case genuinely blocks the resident from making progress
// without knowing what to fix, unlike the accept path, where the case
// is already done and the feedback is more of a learning note
// reasonably reviewed later via the QA dashboard.
//
// Matches this folder's own established banner pattern
// (ReleaseBufferBanner.tsx). Inline styles promoted to a new
// .ps-revision-feedback-banner class as part of the i18n sweep's own
// CSS-cleanup pass.
//
// i18n note: `record.attendingName` and `record.attendingFeedback`
// (a pathologist's own free-text feedback) are real case data, not
// UI chrome, so they stay untranslated; the "the attending" fallback
// text (shown only when no name is on record) is this file's own UI
// copy and is translated.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { countersignService } from '@/services';
import type { CountersignRecord } from '@/types/case/CountersignRecord';
import '@/pathscribe.css';

interface RevisionFeedbackBannerProps {
  caseId?: string;
  /** Real, per direct guidance: only genuinely relevant while the case
   *  is actually sitting in 'returned' — the parent already knows this
   *  from real, existing Case.status, no reason to duplicate that
   *  check inside this component's own data-fetch logic. */
  isReturned: boolean;
}

export const RevisionFeedbackBanner: React.FC<RevisionFeedbackBannerProps> = ({ caseId, isReturned }) => {
  const { t } = useTranslation();
  const [record, setRecord] = useState<CountersignRecord | null>(null);

  useEffect(() => {
    if (!caseId || !isReturned) { setRecord(null); return; }
    countersignService.getForCase(caseId).then(res => {
      if (res.ok && res.data?.status === 'returned') setRecord(res.data);
      else setRecord(null);
    }).catch(() => setRecord(null));
  }, [caseId, isReturned]);

  if (!isReturned || !record) return null;

  return (
    <div className="ps-revision-feedback-banner">
      <span>
        ↩️ <Trans
          i18nKey="revisionFeedbackBanner.returnedMessage"
          values={{ name: record.attendingName ?? t('revisionFeedbackBanner.theAttendingFallback') }}
          components={{ strong: <strong /> }}
        />
      </span>
      {record.attendingFeedback && (
        <span className="ps-revision-feedback-quote">
          "{record.attendingFeedback}"
        </span>
      )}
    </div>
  );
};
