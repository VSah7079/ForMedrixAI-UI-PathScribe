// src/pages/WorklistPage/AmendedAddendaTriageTile.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Amended & Addenda Triage Framework" — high-visibility summary tile
// anchored at the top of the worklist, per spec.
//
// Inclusion criteria (exactly as specified):
//   1. Inbound LIS amendment notices awaiting clinical review.
//   2. Open (draft) amendment records — a real synoptic unlock in progress.
//   3. Open (draft) addendum records — an initialized, un-finalized addendum.
//
// Exit Gate A (clerical): handled elsewhere (SynopticReportPage's Mark
// Reviewed button) — a notice leaving 'pending_review' just means this
// tile's query for it returns nothing next load, no special handling
// needed here.
//
// Exit Gate B (clinical): an open draft keeps a case in this tile
// regardless of anything else — it only leaves once the draft is
// actually released (status flips to 'released' via re-finalize/sign-
// out), same mechanism already built for the real amendment pipeline.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import { lisAmendmentNoticeService, amendmentService } from '@/services';

interface TriageItem {
  caseId: string;
  kind: 'lis_notice' | 'amendment_draft' | 'correction_draft' | 'addendum_draft';
  detail: string;
}

// Real, label-key-maps — the real TriageItem['kind'] value stays
// untouched (used for CSS badge-modifier indexing); only the on-screen
// label/badge text is translated. Resolved at render time (not stored
// on the item, the way the original inline `label` string was) so a
// locale change is reflected immediately, and so `kind` — which
// already fully determines both — is the single source of truth
// rather than being duplicated into a second, parallel string field.
const LABEL_KEY: Record<TriageItem['kind'], string> = {
  lis_notice: 'amendedAddendaTriageTile.label.lis_notice',
  amendment_draft: 'amendedAddendaTriageTile.label.amendment_draft',
  correction_draft: 'amendedAddendaTriageTile.label.correction_draft',
  addendum_draft: 'amendedAddendaTriageTile.label.addendum_draft',
};
const BADGE_KEY: Record<TriageItem['kind'], string> = {
  lis_notice: 'amendedAddendaTriageTile.badge.lis_notice',
  amendment_draft: 'amendedAddendaTriageTile.badge.amendment_draft',
  correction_draft: 'amendedAddendaTriageTile.badge.correction_draft',
  addendum_draft: 'amendedAddendaTriageTile.badge.addendum_draft',
};

export const AmendedAddendaTriageTile: React.FC<{ pathologistId: string }> = ({ pathologistId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<TriageItem[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!pathologistId) return;
    Promise.all([
      lisAmendmentNoticeService.getPendingForPathologist(pathologistId),
      amendmentService.getOpenDraftsForPathologist(pathologistId),
    ]).then(([noticesRes, draftsRes]) => {
      const results: TriageItem[] = [];
      if (noticesRes.ok) {
        for (const n of noticesRes.data) {
          results.push({ caseId: n.caseId, kind: 'lis_notice', detail: n.lisAmendmentSummary });
        }
      }
      if (draftsRes.ok) {
        for (const d of draftsRes.data) {
          const kind: TriageItem['kind'] = d.type === 'amendment' ? 'amendment_draft' : d.type === 'correction' ? 'correction_draft' : 'addendum_draft';
          results.push({
            caseId: d.caseId,
            kind,
            detail: d.explanationOfChange || d.addendumTitle || t('amendedAddendaTriageTile.draftNotReleased'),
          });
        }
      }
      setItems(results);
    });
  }, [pathologistId, t]);

  if (items.length === 0) return null;

  return (
    <div className="ps-triage-tile">
      <button className="ps-triage-tile-header" onClick={() => setExpanded(v => !v)}>
        <span className="ps-triage-tile-title">⚠ {t('amendedAddendaTriageTile.title', { count: items.length })}</span>
        <span className="ps-triage-tile-toggle">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="ps-triage-tile-body">
          {items.map((item, i) => (
            <button
              key={`${item.caseId}-${item.kind}-${i}`}
              className="ps-triage-tile-row"
              onClick={() => navigate(`/case/${item.caseId}/synoptic`)}
            >
              <span className={`ps-triage-tile-badge ps-triage-tile-badge--${item.kind}`}>
                {t(BADGE_KEY[item.kind])}
              </span>
              <span className="ps-triage-tile-case">{item.caseId}</span>
              <span className="ps-triage-tile-label">{t(LABEL_KEY[item.kind])}</span>
              <span className="ps-triage-tile-detail">{item.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
