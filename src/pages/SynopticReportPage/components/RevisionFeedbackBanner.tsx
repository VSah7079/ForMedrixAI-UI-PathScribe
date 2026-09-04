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
// (ReleaseBufferBanner.tsx/InformalReviewBanner.tsx) — a self-contained
// component, inline styles (no dedicated banner CSS class family exists
// for these one-offs, confirmed directly against pathscribe.css, same
// as those two files' own header comments already establish).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { countersignService } from '@/services';
import type { CountersignRecord } from '@/types/case/CountersignRecord';

interface RevisionFeedbackBannerProps {
  caseId?: string;
  /** Real, per direct guidance: only genuinely relevant while the case
   *  is actually sitting in 'returned' — the parent already knows this
   *  from real, existing Case.status, no reason to duplicate that
   *  check inside this component's own data-fetch logic. */
  isReturned: boolean;
}

export const RevisionFeedbackBanner: React.FC<RevisionFeedbackBannerProps> = ({ caseId, isReturned }) => {
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
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
      padding: '10px 14px', margin: '0 0 12px', borderRadius: '6px',
      background: 'rgba(120,53,15,0.10)', border: '1px solid rgba(120,53,15,0.35)',
      color: '#e2e8f0', fontSize: '13px',
    }}>
      <span>
        ↩️ <strong>Returned for Revision</strong> by {record.attendingName ?? 'the attending'} —
        please address the feedback below and re-submit.
      </span>
      {record.attendingFeedback && (
        <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>
          "{record.attendingFeedback}"
        </span>
      )}
    </div>
  );
};
