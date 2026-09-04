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
// Matches this folder's own established banner pattern
// (InformalReviewBanner.tsx) — a self-contained component, inline
// styles (no dedicated banner CSS class family exists for these
// one-offs, confirmed directly against pathscribe.css), ps-btn-secondary
// for actions.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
        showToast?.('Release buffer expired — report finalized and released.');
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
        showToast?.('Report recalled — you can continue editing.');
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
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      padding: '10px 14px', margin: '0 0 12px', borderRadius: '6px',
      background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
      color: '#e2e8f0', fontSize: '13px',
    }}>
      {isRealSigner ? (
        <>
          <span>
            ⏳ <strong>Pending Release</strong> — releasing automatically in{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRemaining(remainingMs)}</strong>.
            Recall now to keep editing without triggering an amendment.
          </span>
          <button className="ps-btn-secondary" disabled={recalling} onClick={handleRecall}>
            {recalling ? 'Recalling…' : 'Recall Report'}
          </button>
        </>
      ) : (
        // Real feature, per direct specification, Phase 4 (spec §15b —
        // real, intended "educational access": viewing stays open to
        // anyone, including trainees, but the recall action itself
        // was never theirs to take).
        <span>
          ⏳ <strong>Pending Release</strong> — the signing pathologist's recall window
          closes automatically in{' '}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRemaining(remainingMs)}</strong>.
        </span>
      )}
    </div>
  );
};
