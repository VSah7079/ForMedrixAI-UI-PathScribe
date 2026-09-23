// src/pages/SynopticReportPage/components/InformalReviewBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix: DelegationRecord.status includes 'completed' as a valid
// lifecycle value, but nothing anywhere in this codebase ever actually
// transitioned a delegation there - every one ever created stayed
// 'pending' forever. That silently broke WorklistPage.tsx's existing
// "Delegated to Me" count (it could only ever grow), and meant
// CONSULTATION_RESPONSE/CONSULTATION_AWAITING TAT calculation
// (components/Contribution/qualityCalculations.ts) had no real
// completion signal to measure against.
//
// This banner is the real, minimal UI closing that gap: when the
// current user has a genuinely pending 'CASUAL_REVIEW' (informal
// review) delegation for this specific case, shows who asked and lets
// them mark it done — the moment they'd naturally be looking at the
// case anyway, not a separate inbox screen.
//
// Deliberately scoped to CASUAL_REVIEW only, per the real distinction
// this app's own delegation-type dictionary already draws between
// 'CASUAL_REVIEW' ("Informal Review") and 'SECOND_OPINION' (the more
// formal path) — see services/delegationTypes/mockDelegationTypeService.ts.
//
// Inline container style promoted to a new .ps-informal-review-banner
// class as part of the i18n sweep's own CSS-cleanup pass; the real,
// verified ps-btn-secondary class (single hyphen - not
// ps-btn--secondary) for the button, matching this codebase's actual
// button-class convention, is unchanged.
//
// i18n note: `requestorName`/`pending.fromUserId` (a real person's
// name/id, used only as a display fallback) and `pending.note` (a
// pathologist's own free-text note) are real data, not UI chrome, so
// they stay untranslated.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getDelegations, completeDelegation, type DelegationRecord } from '@/services/cases/mockCaseService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { userService } from '@/services';
import '@/pathscribe.css';

interface InformalReviewBannerProps {
  caseId?: string;
}

export const InformalReviewBanner: React.FC<InformalReviewBannerProps> = ({ caseId }) => {
  const { t } = useTranslation();
  const [pending, setPending]             = useState<DelegationRecord | null>(null);
  const [requestorName, setRequestorName] = useState<string>('');
  const [completing, setCompleting]       = useState(false);

  const load = useCallback(() => {
    if (!caseId) { setPending(null); return; }
    const user = getSessionUser();
    if (!user) { setPending(null); return; }
    getDelegations(caseId).then(all => {
      const mine = all.find(d =>
        d.delegationType === 'CASUAL_REVIEW' && d.toUserId === user.id && d.status === 'pending'
      );
      setPending(mine ?? null);
      if (mine) {
        userService.getById(mine.fromUserId).then(res => {
          setRequestorName(res.ok ? `${res.data.firstName} ${res.data.lastName}` : mine.fromUserId);
        }).catch(() => setRequestorName(mine.fromUserId));
      }
    }).catch(() => setPending(null));
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  if (!pending) return null;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeDelegation(pending.id);
      setPending(null);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="ps-informal-review-banner">
      <span>
        📋 <Trans
          i18nKey="informalReviewBanner.requestedBy"
          values={{ name: requestorName || pending.fromUserId }}
          components={{ strong: <strong /> }}
        />
        {pending.note ? <>: <em>{pending.note}</em></> : null}
      </span>
      <button className="ps-btn-secondary" disabled={completing} onClick={handleComplete}>
        {completing ? t('informalReviewBanner.markingComplete') : t('informalReviewBanner.markComplete')}
      </button>
    </div>
  );
};
