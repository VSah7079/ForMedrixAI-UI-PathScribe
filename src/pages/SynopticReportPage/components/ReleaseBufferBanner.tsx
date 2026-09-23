// src/pages/SynopticReportPage/components/ReleaseBufferBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: Post-Sign-Out Release Buffer.
// Shown while a case is genuinely 'pending-release' — a live countdown
// to real, automatic release, and, for the real signing pathologist
// only, the prominent "Recall Report" action to pull the report back
// for edits without triggering a formal amendment.
//
// Real, genuine bug found and fixed in Phase 4 (spec §15b — trainees
// and attendings can VIEW a Pending Release report; spec §10 — only
// "the signing pathologist" may recall it): the props here used to be
// named signingUserId/signingUserName but actually held whoever is
// CURRENTLY VIEWING the page (SynopticReportPage.tsx's own
// useAuth().user) — meaning ANY viewer, including a trainee with no
// part in signing this specific case out, saw a fully functional
// Recall button. Renamed to currentUserId/currentUserName to make that
// honest, and gated the actual button to isRealSigner
// (caseData.finalizedBy === currentUserId) — a non-signer still sees
// the real countdown and status (the real, intended "educational
// access"), just not an action that was never theirs to take. Defense
// in depth: mockReportReleaseService.recall() itself now also refuses
// a mismatched performedBy.userId, so this UI gate isn't the only
// thing standing between a non-signer and a real recall.
//
// Real, honest architectural note (see services/reportRelease/'s own
// README): the countdown firing checkAndReleaseIfExpired() here is the
// client-side simulation of the real, deferred release job described in
// the spec — correct and real for this open tab, but not yet backed by
// a real, server-side scheduler that would also release a case nobody
// has this page open for. Flagged honestly, not hidden.
//
// Matched this folder's own established banner pattern
// (InformalReviewBanner.tsx, still unconverted) at the time this file
// was written — a self-contained component, inline styles (no
// dedicated banner CSS class family existed for these one-offs at the
// time), ps-btn-secondary for actions. This i18n/cleanup sweep gave it
// its own new `.ps-release-buffer-*` class family instead, matching
// how batch 168's TerminologyAlertBanner.tsx (also fully inline
// originally) was handled — InformalReviewBanner.tsx can reuse or
// mirror this pattern once its own batch comes up.
//
// i18n note: `result.reason` (from mockReportReleaseService.recall(),
// a shared, multi-consumer service) stays literal English — same
// precedent as leaving referenceCheckService.ts's own reference labels
// untranslated in batch 178, since converting one shared .ts service's
// return strings is out of scope for a single component's batch.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { Case } from '@/types/case/Case';
import { mockReportReleaseService } from '@/services/reportRelease/mockReportReleaseService';
import { useReleaseBufferCountdown, formatRemaining } from '../hooks/useReleaseBufferCountdown';

interface ReleaseBufferBannerProps {
  caseData: Case | null | undefined;
  /** The user genuinely viewing this page right now — NOT necessarily
   *  who signed this specific case out. See this file's own header
   *  comment for the real bug that naming confusion caused. */
  currentUserId?: string;
  currentUserName?: string;
  setCaseData: (updater: (prev: Case | null | undefined) => Case | null | undefined) => void;
  showToast?: (message: string) => void;
}

export const ReleaseBufferBanner: React.FC<ReleaseBufferBannerProps> = ({
  caseData, currentUserId, currentUserName, setCaseData, showToast,
}) => {
  const { t } = useTranslation();
  const [recalling, setRecalling] = useState(false);
  const releasingRef = useRef(false);

  const isPendingRelease = caseData?.status === 'pending-release';
  const expiresAt = caseData?.releaseBufferExpiresAt;
  const { remainingMs } = useReleaseBufferCountdown(isPendingRelease ? expiresAt : undefined);
  // Real feature, per direct specification, Phase 4 — see this file's
  // own header comment for the real bug this closes.
  const isRealSigner = !!caseData?.finalizedBy && caseData.finalizedBy === currentUserId;


  // Real, client-side simulation of the real, deferred release job —
  // see this file's own header comment for the honest scope of what
  // this can and can't guarantee.
  useEffect(() => {
    if (!isPendingRelease || !caseData?.id || remainingMs > 0 || releasingRef.current) return;
    releasingRef.current = true;
    mockReportReleaseService.checkAndReleaseIfExpired(caseData.id).then(result => {
      if (result.released) {
        setCaseData(prev => prev ? ({ ...prev, status: 'finalized' as const, releasedAt: new Date().toISOString(), releaseBufferExpiresAt: undefined, releaseBufferDurationMinutes: undefined, preReleaseBufferStatus: undefined }) : prev);
        showToast?.(t('releaseBufferBanner.releaseExpiredToast'));
      }
      releasingRef.current = false;
    });
  }, [isPendingRelease, caseData?.id, remainingMs, setCaseData, showToast]);

  const handleRecall = useCallback(async () => {
    if (!caseData?.id) return;
    setRecalling(true);
    try {
      const result = await mockReportReleaseService.recall(caseData.id, {
        userId: currentUserId ?? 'unknown',
        userName: currentUserName ?? 'Unknown User',
      });
      if (result.ok) {
        setCaseData(prev => prev ? ({
          ...prev,
          status: prev.preReleaseBufferStatus ?? 'in-progress',
          releaseBufferExpiresAt: undefined,
          releaseBufferDurationMinutes: undefined,
          preReleaseBufferStatus: undefined,
        }) : prev);
        showToast?.(t('releaseBufferBanner.recalledToast'));
      } else {
        showToast?.((result as { ok: false; reason: string }).reason);
      }
    } finally {
      setRecalling(false);
    }
  }, [caseData?.id, currentUserId, currentUserName, setCaseData, showToast]);

  // Real, per direct follow-up ("the actions list is out of sync...
  // voice control... has to be flawless"): the real, other half of the
  // RECALL_REPORT action registered in mockActionRegistryService.ts —
  // that side dispatches this same event (see SynopticReportPage.tsx's
  // own onAction switch), this side is what actually calls the real
  // handler. Safe to wire globally, not gated on isRealSigner here
  // too — mockReportReleaseService.recall() itself already refuses a
  // mismatched performedBy.userId independently of this component's
  // own UI-level button gating (see that service's own doc comment).
  useEffect(() => {
    const handler = () => { handleRecall(); };
    window.addEventListener('PATHSCRIBE_RECALL_REPORT', handler);
    return () => window.removeEventListener('PATHSCRIBE_RECALL_REPORT', handler);
  }, [handleRecall]);

  if (!isPendingRelease || !expiresAt) return null;

  return (
    <div className="ps-release-buffer-banner">
      {isRealSigner ? (
        <>
          <span>
            ⏳{' '}
            <Trans
              i18nKey="releaseBufferBanner.signerMessage"
              values={{ status: t('searchPage.statusLabelKey.pendingRelease'), time: formatRemaining(remainingMs) }}
              components={{ bold: <strong />, countdown: <strong className="ps-release-buffer-countdown" /> }}
            />
          </span>
          <button className="ps-btn-secondary" disabled={recalling} onClick={handleRecall}>
            {recalling ? t('releaseBufferBanner.recallingLabel') : t('releaseBufferBanner.recallButtonLabel')}
          </button>
        </>
      ) : (
        // Real feature, per direct specification, Phase 4 (spec §15b —
        // real, intended "educational access": viewing stays open to
        // anyone, including trainees, but the recall action itself
        // was never theirs to take).
        <span>
          ⏳{' '}
          <Trans
            i18nKey="releaseBufferBanner.nonSignerMessage"
            values={{ status: t('searchPage.statusLabelKey.pendingRelease'), time: formatRemaining(remainingMs) }}
            components={{ bold: <strong />, countdown: <strong className="ps-release-buffer-countdown" /> }}
          />
        </span>
      )}
    </div>
  );
};
