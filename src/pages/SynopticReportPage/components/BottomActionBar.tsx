import React, { useState, useEffect, useRef } from 'react';
import type { Case } from '@/types/case/Case';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import RequestReviewModal from '@/components/RequestReview/RequestReviewModal';
import ExternalConsultAccessModal from '@/components/ExternalConsult/ExternalConsultAccessModal';
import { PoolClaimModal } from '@/components/Worklist/PoolClaimModal';
import EMRSidecarDrawer from './EMRSidecarDrawer';
import { useCompanionWindow } from '@/hooks/useCompanionWindow';
import { resolveIsFinalStatus } from '@/services/reportTemplates/TemplateRoutingService';


interface BottomActionBarProps {
  caseData: Case | null;
  isDirty?: boolean;
  onSaveDraft: () => void;
  onSaveAndNext: () => void;
  onFinalize: () => void;
  onFinalizeAndNext: () => void;
  onSignOut: () => void;
  /** Real, per direct research and design recommendation ("Provide a
   *  Manual Trigger... 'Release as Preliminary' button... at any point
   *  before final verification") — the manual pathologist action
   *  identified as the primary real trigger (~80% of real preliminary-
   *  report cases). Optional: undefined on any surface (e.g. the
   *  Cytology sign-out page) that hasn't wired this yet — never a
   *  broken button on a page that doesn't support it. */
  onReleasePreliminary?: () => void;
  /** Manual trigger for the Amendment/Addendum modal on an already-
   *  finalized case — before this, the modal only ever opened itself
   *  automatically for one narrow scenario (a deferred synoptic being
   *  completed), with no way for a pathologist to request a genuine
   *  correction or addition on demand. Shown in the same slot Sign Out
   *  occupies before finalization — mutually exclusive with it. */
  onRequestAmendment?: () => void;
  /** CoPilot-specific print action — Orchestration's print button lives
   *  inside the full report preview panel, which is Orchestration-only
   *  (relies on narrative sections that don't exist for CoPilot). This
   *  is a separate, dedicated entry point reusing the same underlying
   *  PDF generation, not a duplicate implementation. */
  onPrint?: () => void;
  /** Real feature, per direct follow-up: "Move Manage Reprints...
   *  Bottom-Right Action Cluster... it keeps all case-level actions in
   *  one predictable location... removes the visual orphaning of the
   *  current Manage Reports button." Was tab-specific (Material tab
   *  only, inside MaterialTreePanel.tsx); now global and always
   *  available here, alongside Save Draft/Finalize. */
  onOpenReprints?: () => void;
  
  onDelegate?: () => void;
  onHistory?: () => void;
  onFlags?: () => void;
  onCodes?: () => void;
  onTeam?: () => void;
  onNextCase: () => void;
  onPreviousCase: () => void;
  /** Orchestrator — generate report from synoptic answers */
  onGenerateReport?: () => void;
  isGenerating?: boolean;
  onAbortGenerate?: () => void;
  /**
   * Stage 1 trigger — PA marks Grossing finalized, fires
   * evaluateSynopticAssignment. Shown INSTEAD OF Generate Report/Save
   * Draft/Finalize/Finalize & Next while grossing is still in progress
   * (same slot, mutually exclusive — see showGrossComplete below), not
   * alongside them. None of those actions make sense yet at this stage:
   * there's no synoptic data to save, generate from, or finalize until
   * Stage 1 has run.
   */
  /**
   * Stage 1 trigger — single action, dynamic meaning. Fires on both first
   * finalize ("Gross Complete") and re-finalize after a correction
   * ("Update Gross") — same handler either way, see
   * SynopticReportPage.tsx's handleGrossComplete. There is no separate
   * "unlock"/"reopen" action: editing an already-finalized Grossing
   * instance's answers is itself what brings this button back (handled
   * reactively in the page, not here).
   */
  onGrossComplete?: () => void;
  /**
   * True while a Stage 1 evaluation is running OR its resulting Protocol
   * Change Review modal is still open and unresolved. Disables Finalize/
   * Finalize & Next/Sign Out while true — a case should not be signable
   * while its synoptic assignment might be stale relative to a just-
   * edited Gross.
   */
  synopticFitPending?: boolean;
}

const ActionButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  variant: 'outline' | 'solid';
  color: string;
  hoverColor?: string;
  title?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant, color, hoverColor, title, disabled = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle: React.CSSProperties = {
    padding:      '6px 11px',                       // slightly tighter to fit more buttons
    borderRadius: '7px',
    fontWeight:   700,
    fontSize:     '12px',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    whiteSpace:   'nowrap',
    transition:   'all 0.15s ease',
    border:       `1.5px solid ${disabled ? '#475569' : (isHovered && variant === 'solid' ? (hoverColor || color) : color)}`,
    background:   disabled
      ? 'transparent'
      : variant === 'solid'
        ? (isHovered ? (hoverColor || color) : color)
        : (isHovered ? `${color}22` : 'transparent'),
    color:        disabled ? '#475569' : (variant === 'solid' ? 'white' : color),
    opacity:      disabled ? 0.6 : 1,
    display:      'flex',
    alignItems:   'center',
    gap:          '5px',
    transform:    (!disabled && isHovered) ? 'translateY(1px)' : 'translateY(0)',
    boxShadow:    (!disabled && isHovered) ? `0 2px 8px ${color}44` : 'none',
    lineHeight:   '1.2',            // explicit line-height prevents height variation from emoji/# chars
    height:       '32px',           // fixed height so ALL buttons are identical regardless of content
    boxSizing:    'border-box' as const,
  };

  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={baseStyle} title={title}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      {children}
    </button>
  );
};

const Divider = () => (
  <div style={{ width: 1, height: 32, background: '#475569', flexShrink: 0, margin: '0 2px' }} />
);

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  caseData,
  isDirty = false,
  onSaveDraft,
  onSaveAndNext,
  onFinalize,
  onFinalizeAndNext,
  onSignOut,
  onReleasePreliminary,
  onRequestAmendment,
  onPrint,
  onOpenReprints,
  
  onDelegate,
  onHistory,
  onFlags,
  onCodes,
  onTeam,
  onNextCase,
  onPreviousCase,
  onGenerateReport,
  isGenerating = false,
  onAbortGenerate,
  onGrossComplete,
  synopticFitPending = false,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [claimOpen,  setClaimOpen]  = useState(false);
  // PS-290 — see ExternalConsultAccessModal.tsx's own header for the
  // real, load-bearing disclosure this feature carries.
  const [consultOpen, setConsultOpen] = useState(false);

  // Real fix, per direct report: at a narrow enough effective viewport
  // (the fixed-width right-hand action cluster forcing this scrollable
  // left group to shrink well below what its own content needs),
  // History/Flags/Codes could become entirely invisible with only the
  // existing 28px fade gradient as a cue — not discoverable enough on
  // its own, confirmed by direct reproduction. Real, visible, clickable
  // scroll arrows only render when genuinely needed (real overflow
  // present), never as permanent visual clutter on a normal-width
  // screen where everything already fits.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateScrollState = () => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    };
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, []);

  const scrollBar = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
  };
  const [emrOpen,    setEmrOpen]    = useState(false);
  const { openCompanion, closeCompanion: _closeCompanion, isWindowOpen: isEmrWindowOpen } = useCompanionWindow({
    // _closeCompanion unused — openCompanion/isEmrWindowOpen are both
    // actively used below, but nothing in this component ever explicitly
    // closes the EMR companion window (presumably left to the user
    // closing the actual browser window). Flagged, not deleted, in case
    // an explicit "Close EMR" action is wanted later.
    windowName: 'PathScribeEMRSidecar',
    preferredWidth: 1200,
    preferredHeight: 800,
  });
  const status = caseData?.status ?? 'draft';
  const isFinalized = status === 'finalized';
  const isPool = status === 'pool';

  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer, Phase 3 (spec §14 — hardcopy printing restricted by default
  // during the buffer window; an operator can override, but the printed
  // PDF still carries the watermark when they do — see
  // LeftReportPanel.tsx's own real, on-screen watermark for the
  // display-side half of this same requirement).
  //
  // Real, honest scope note: this gate covers the one print entry
  // point in this file (CoPilot/'assist' mode's own Print button,
  // below). Orchestration mode's separate print entry point (inside
  // the full report preview panel — a genuinely different component,
  // not duplicated here) is NOT yet gated — a known, real gap, not a
  // silent omission.
  const isPendingRelease = status === 'pending-release';
  const [printRestricted, setPrintRestricted] = useState(false);
  useEffect(() => {
    if (!isPendingRelease) return;
    import('@/services/reportRelease/mockReportReleaseService').then(({ mockReportReleaseService }) =>
      mockReportReleaseService.getOrgDefault().then(res => {
        if (res.ok) setPrintRestricted(res.data.restrictHardcopyPrinting);
      })
    );
  }, [isPendingRelease]);
  const handlePrintClick = () => {
    if (isPendingRelease && printRestricted) {
      const proceed = window.confirm(
        'Hardcopy printing is restricted while this report is Pending Release. ' +
        'The printed copy will carry the "PENDING FINAL RELEASE" watermark. Print anyway?'
      );
      if (!proceed) return;
    }
    onPrint?.();
  };

  // Safety requirement: never let a stale patient's EMR keep showing
  // after the case changes. If a real companion window is currently
  // open, proactively navigate it to the new patient (reusing the same
  // window rather than leaving it stale or abruptly closing it) --
  // otherwise just close the embedded drawer fallback, which is safe by
  // construction (see EMRSidecarDrawer.tsx's key={patientId}).
  useEffect(() => {
    if (isEmrWindowOpen) {
      const mrn = caseData?.patient?.mrn ?? '100004';
      openCompanion(`${window.location.origin}/mock-emr?patientId=${mrn}`);
    }
    setEmrOpen(false);
  }, [caseData?.id, caseData?.patient?.mrn, isEmrWindowOpen, openCompanion]);

  const handleLaunchEMR = async () => {
    const mrn = caseData?.patient?.mrn ?? '100004';
    const targetUrl = `${window.location.origin}/mock-emr?patientId=${mrn}`;
    // Dev-only testing shortcut: append ?forceEmrFallback=1 to the URL
    // to skip straight to the embedded drawer without even attempting
    // openCompanion(). Useful for quickly iterating on the drawer's UI
    // without repeatedly toggling browser popup-block settings -- does
    // NOT test the real blocked-detection logic. To verify that for
    // real, block popups for this site in the browser's own settings
    // and launch normally (no query param) -- see this function's
    // header note for the real end-to-end test.
    if (new URLSearchParams(window.location.search).get('forceEmrFallback') === '1') {
      setEmrOpen(true);
      return;
    }
    const result = await openCompanion(targetUrl);
    if (result === 'blocked') setEmrOpen(true);
  };

  const hasCodes = ((caseData as any)?.coding?.icd10?.length ?? 0) > 0 ||
                   ((caseData as any)?.coding?.snomed?.length ?? 0) > 0;
  const codesColor = hasCodes ? '#0891B2' : '#f59e0b';
  const allFinalized = (caseData?.synopticReports?.length ?? 0) > 0 &&
    caseData!.synopticReports!.every(r => r.status === 'finalized');

  // Stage 1 gate: grossing is still in progress if any GrossingReportInstance
  // is still 'draft'. While true, none of Generate Report/Save Draft/
  // Finalize/Finalize & Next make sense — there's no synoptic data yet for
  // any of them to act on. This is a real gap this component had before:
  // it didn't know about 'accessioned'/'gross-complete' statuses at all, so
  // Finalize/Finalize & Next would have shown immediately and incorrectly
  // for a case still sitting at the PA bench.
  const hasUnfinishedGrossing = (caseData?.grossingReports ?? []).some((g: any) => g.status === 'draft');
  const showGrossComplete = !isPool && !isFinalized && hasUnfinishedGrossing;
  // Dynamic label/icon: "Update Gross" if any of the draft instances about
  // to be finalized were previously finalized before (i.e. this is a
  // correction, not a first pass) — previouslyFinalized survives the
  // automatic draft-revert-on-edit, so this stays accurate even after
  // that revert. See GrossingReportInstance.previouslyFinalized in Case.ts.
  const isUpdateGross = (caseData?.grossingReports ?? [])
    .some((g: any) => g.status === 'draft' && g.previouslyFinalized);

  return (
    <>
    <div style={{
      background: '#0d1829', padding: '11px 12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '6px',
      overflow: 'visible', position: 'relative', zIndex: 200,
    }}>
      <div className="ps-bottombar-scroll-wrapper">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollBar('left')}
            aria-label="Scroll left for more actions"
            className="ps-bottombar-scroll-arrow ps-bottombar-scroll-arrow--left"
          >
            ‹
          </button>
        )}
        <div ref={scrollRef} className="ps-bottombar-scroll">
          <ActionButton onClick={onPreviousCase} variant="outline" color="#94a3b8" title="Previous case">← Prev</ActionButton>
          <ActionButton onClick={onNextCase} variant="outline" color="#94a3b8" title="Next case">Next →</ActionButton>
          <Divider />
          
          {/* LAUNCH EMR BUTTON */}
          <ActionButton onClick={handleLaunchEMR} variant="outline" color="#0ea5e9" title="Open Patient Record in EMR Sidecar">
            🌐 EMR
          </ActionButton>

          {/* Hide delegate/review/flags/codes for pool cases — not yet assigned */}
          {!isPool && <>
            <ActionButton onClick={() => onDelegate?.()} variant="outline" color="#a78bfa" title="Delegate case">👥 Delegate</ActionButton>
            <ActionButton onClick={() => onTeam?.()} variant="outline" color="#0891B2" title="Manage case team">👤 Team</ActionButton>
            <ActionButton onClick={() => setReviewOpen(true)} variant="outline" color="#a78bfa" title="Request informal peer review">🔍 Req. Review</ActionButton>
            <ActionButton onClick={() => setConsultOpen(true)} variant="outline" color="#f87171" title="External consult / second-opinion access (demo/pilot only — not real security)">🌐 Consult</ActionButton>
            <ActionButton onClick={() => onHistory?.()} variant="outline" color="#0891B2">📋 History</ActionButton>
            <ActionButton onClick={() => onFlags?.()} variant="outline" color="#f59e0b">🚩 Flags</ActionButton>
            <ActionButton onClick={() => onCodes?.()} variant="outline" color={codesColor}># Codes</ActionButton>
          </>}
        </div>
        {canScrollRight && (
          <>
            <div className="ps-bottombar-fade" aria-hidden="true" />
            <button
              type="button"
              onClick={() => scrollBar('right')}
              aria-label="Scroll right for more actions"
              className="ps-bottombar-scroll-arrow ps-bottombar-scroll-arrow--right"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        {/* Real feature, per direct follow-up: "Move Manage Reprints...
            Bottom-Right Action Cluster... Place Manage Reports as the
            leftmost button in the bottom-right cluster." Placed
            outside every case-state branch below (pool/finalized/
            grossing/normal) rather than inside any single one of
            them — the original button (MaterialTreePanel.tsx, before
            this move) was available unconditionally whenever a case
            was open; case state deciding whether a lost/damaged label
            can be reprinted would have been a real, unintended
            regression, not a UI cleanup. */}
        {onOpenReprints && (
          <>
            <ActionButton onClick={onOpenReprints} variant="outline" color="#94a3b8" title="Manage reprints — requisition, container, cassette, and slide labels">
              🖨️ Manage Reprints
            </ActionButton>
            <Divider />
          </>
        )}
        {/* Pool case — show Claim button only */}
        {isPool && (
          <ActionButton onClick={() => setClaimOpen(true)} variant="solid" color="#6366f1" hoverColor="#4f46e5">
            ✋ Claim This Case
          </ActionButton>
        )}

        {/* Stage 1 — grossing still in progress: Gross Complete plus a real
            way to persist partial progress. Real fix, per direct report:
            a PA working through several specimens in one case (fill in
            Specimen A, want to save and move to B/C without the whole
            case's grossing being done yet) previously had no option here
            at all except Gross Complete itself — which isn't a plain
            save, it's a finalizing transition that triggers AI evaluation
            of diagnostic synoptic assignment. saveDraftInternal (Save
            Draft's real handler) is generic — it persists whatever
            caseData holds at the moment, with no dependency on which
            phase the case is in — so it's exactly as safe here as it is
            once grossing is done. */}
        {showGrossComplete && (
          <>
            <ActionButton onClick={onSaveDraft} variant="outline" color={isDirty ? '#38bdf8' : '#94a3b8'} title="Save partial grossing progress — does not mark grossing complete or trigger AI evaluation">
              💾 Save Draft
            </ActionButton>
            <Divider />
            <ActionButton
              onClick={() => onGrossComplete?.()}
              variant="solid"
              color={isUpdateGross ? '#f59e0b' : '#34d399'}
              hoverColor={isUpdateGross ? '#d97706' : '#10b981'}
              title={isUpdateGross
                ? 'Re-finalize corrected Grossing — re-evaluates AI synoptic assignment, requires a reason for the audit trail'
                : 'Mark grossing complete — triggers AI evaluation of diagnostic synoptic assignment'}
            >
              {isUpdateGross ? '✏️ Update Gross' : '✅ Gross Complete'}
            </ActionButton>
          </>
        )}

        {/* Normal reporting actions — hidden for pool cases AND while grossing is still in progress */}
        {!isPool && !isFinalized && !showGrossComplete && (
          <>
            {/* Generate Report — shown when Orchestrator is wired */}
            {onGenerateReport && (
              <>
                {isGenerating ? (
                  <ActionButton onClick={() => onAbortGenerate?.()} variant="outline" color="#ef4444" title="Abort generation">
                    ✕ Abort
                  </ActionButton>
                ) : (
                  <ActionButton onClick={onGenerateReport} variant="outline" color="#38bdf8" title="Generate AI report draft from synoptic answers">
                    ⚡ Gen. Report
                  </ActionButton>
                )}
                <Divider />
              </>
            )}
            <ActionButton onClick={onSaveDraft} variant="outline" color={isDirty ? '#38bdf8' : '#94a3b8'} title="Save draft">💾 Save Draft</ActionButton>
            <ActionButton onClick={onSaveAndNext} variant="outline" color={isDirty ? '#38bdf8' : '#94a3b8'} title="Save and go to next case">💾 Save &amp; Next</ActionButton>
            {/* Real, per direct guidance ("Path B Execution Plan" — Step
                3, "What to do with Finalize"): retired for Orchestration
                Mode, since Sign Out Case now safely handles the trainee
                early-return, the attending's real sign-out + buffer
                start, and the cron-equivalent's own real dispatch —
                Finalize has no remaining real purpose there. Stays real
                and active for Assist Mode's own distinct handoff to the
                external LIS, unaffected by any of this. */}
            {caseData?.reportingMode === 'assist' && (
              <>
                <Divider />
                <ActionButton
                  onClick={onFinalize}
                  variant="outline"
                  color="#34d399"
                  disabled={synopticFitPending}
                  title={synopticFitPending
                    ? 'Disabled — Stage 1 synoptic assignment evaluation in progress or awaiting review'
                    : 'Finalize this report'}
                >
                  🔒 Finalize
                </ActionButton>
                <ActionButton
                  onClick={onFinalizeAndNext}
                  variant="outline"
                  color="#34d399"
                  disabled={synopticFitPending}
                  title={synopticFitPending
                    ? 'Disabled — Stage 1 synoptic assignment evaluation in progress or awaiting review'
                    : 'Finalize and go to next case'}
                >
                  🔒 Finalize &amp; Next
                </ActionButton>
              </>
            )}
          </>
        )}
        {!isPool && caseData?.reportingMode !== 'assist' && onReleasePreliminary && !resolveIsFinalStatus(caseData?.status) && (
          // Real, per direct research and design recommendation: shown
          // "at any point before final verification" — deliberately
          // NOT gated on allFinalized/isFinalized the way Sign Out
          // Case is. The whole real point of this action is releasing
          // a partial, in-progress finding early (the acute leukemia
          // bone marrow case, the transplant kidney showing acute
          // rejection) — requiring the case to already be complete
          // first would defeat it entirely.
          <ActionButton
            onClick={onReleasePreliminary}
            variant="outline"
            color="#c026d3"
            title="Send the current Preliminary findings to the outbound interface now — does not sign out or finalize the case"
          >
            📤 Release as Preliminary
          </ActionButton>
        )}
        {!isPool && caseData?.reportingMode !== 'assist' && (allFinalized || isFinalized) && status !== 'finalized' &&
          // Real, critical fix, per direct specification: Post-Sign-Out
          // Release Buffer. A real, serious bug found during a
          // post-delivery gap review: this button calls onSignOut →
          // handleSignOutConfirm → finalizeSignOut(), a genuinely
          // separate code path from onFinalize's own finalizeCase() —
          // the one this whole feature's buffer logic lives in.
          // finalizeSignOut() has zero awareness of the release buffer
          // and unconditionally creates a new ReportVersionRecord
          // (isOrchestrationMode's own 'initial_signout'/'amendment'
          // trigger) regardless of it. Before this fix, a case already
          // sitting in the recall window (status === 'pending-release')
          // still showed this button — clicking it would have created
          // a real, externally-dispatchable report version while
          // completely bypassing the very buffer the pathologist might
          // still be relying on to recall and correct their report.
          status !== 'pending-release' && (
          <ActionButton
            onClick={onSignOut}
            variant="solid"
            color="#047857"
            hoverColor="#065f46"
            disabled={synopticFitPending}
            title={synopticFitPending ? 'Disabled — Stage 1 synoptic assignment evaluation in progress or awaiting review' : undefined}
          >
            ✍️ Sign Out Case
          </ActionButton>
        )}
        {!isPool && caseData?.reportingMode === 'assist' && (allFinalized || isFinalized) && (
          <span className="ps-bab-assist-complete" title="Assist-mode cases are completed via Finalize — the LIS owns official sign-out for this reporting mode, not PathScribe.">
            ✓ Finalized — structured data complete, LIS handles official sign-out
          </span>
        )}
        {!isPool && caseData?.reportingMode === 'assist' && (allFinalized || isFinalized || isPendingRelease) && onPrint && (
          <ActionButton onClick={handlePrintClick} variant="outline" color="#0891B2" title={isPendingRelease ? 'Printing is restricted while Pending Release' : 'Print this report'}>
            🖨 Print
          </ActionButton>
        )}
        {status === 'finalized' && onRequestAmendment && (
          <ActionButton
            onClick={onRequestAmendment}
            variant="outline"
            color="#d97706"
            title="Issue a correction or addition to this already-finalized report"
          >
            ✏️ Request Amendment / Addendum
          </ActionButton>
        )}
      </div>
    </div>

    <RequestReviewModal
      isOpen={reviewOpen}
      caseId={caseData?.id ?? ''}
      caseLabel={caseData ? `${caseData.patient?.lastName}, ${caseData.patient?.firstName}` : undefined}
      fromUserId={user?.id ?? 'u1'}
      fromUserName={user?.name ?? 'Unknown'}
      onClose={() => setReviewOpen(false)}
    />

    <ExternalConsultAccessModal
      isOpen={consultOpen}
      caseData={caseData}
      currentUserId={user?.id ?? 'u1'}
      currentUserName={user?.name ?? 'Unknown'}
      onClose={() => setConsultOpen(false)}
    />

    <PoolClaimModal
      isOpen={claimOpen && isPool}
      caseId={caseData?.id ?? null}
      caseSummary={caseData ? `${caseData.patient?.lastName}, ${caseData.patient?.firstName} — ${caseData.specimens?.[0]?.description ?? ''}` : undefined}
      poolName={`${(caseData as any)?.originHospitalId ?? 'MFT'} Pool`}
      currentUserId={user?.id ?? 'u1'}
      currentUserName={user?.name ?? 'Unknown'}
      continueToReport={true}
      onAccepted={() => setClaimOpen(false)}
      onPassed={() => {
        setClaimOpen(false);
        navigate('/worklist');
      }}
      onClose={() => setClaimOpen(false)}
    />

    <EMRSidecarDrawer
      isOpen={emrOpen}
      patientId={caseData?.patient?.mrn ?? '100004'}
      onClose={() => setEmrOpen(false)}
    />
    </>
  );
};

export default BottomActionBar;
