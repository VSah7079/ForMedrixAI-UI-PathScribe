// src/pages/FullReportPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "It looks like it never got wired
// correctly or just forgotten." This page previously read from
// mock/mockReports.ts — a completely separate, hardcoded dataset with
// no overlap with real Case data (WorklistPage's cases, caseRouter,
// etc.). Confirmed directly: getMockReport() was the only data source,
// no real fallback existed. A real case navigated here would have
// resolved to nothing.
//
// Fixed by loading a real Case via caseRouter.getCase() (the same
// mechanism synopticLoader.ts uses for SynopticReportPage) and
// rendering it with LeftReportPanel — the real, already-working,
// read-only-style report view that already lives inside
// SynopticReportPage itself (it takes a real Case directly, was never
// mock-data-dependent). Reuses this page's own existing, working
// infrastructure (back navigation, InternalNotesDrawer, voice
// overlays, pool claim modal) rather than rebuilding any of it.
//
// Real feature, per direct follow-up: auto-opens Internal Notes on
// arrival from the Informal Review Worklist tile or a message's case
// link — the whole point of routing here for that flow is to publish
// a review, so landing on the drawer already open removes a real,
// unnecessary extra click.
//
// File-by-file cleanup sweep: the access-control check sequence below
// used to be its own copy of exactly what synopticLoader.ts does for
// /synoptic/:caseId — both files' own comments already said these were
// meant to be "the single, real enforcement point." Now both genuinely
// call the one shared resolveCaseAccessGate(). Every visible string also
// goes through useTranslation()/t() (fullReport.* in all five locale
// files) — this page had none before this pass.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import '../pathscribe.css';
import { useParams, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import type { Case } from "@/types/case/Case";
import { caseRouter } from "@/services/cases/CaseRouter";
import { resolveCaseAccessGate } from "@/services/auth/resolveCaseAccessGate";
import { useAuth } from "../contexts/AuthContext";
import { useMessaging } from "../contexts/MessagingContext";
import { PoolClaimModal } from "../components/Worklist/PoolClaimModal";
import LeftReportPanel from "../pages/SynopticReportPage/components/LeftReportPanel";
import { VoiceCommandOverlay } from "../components/Voice/VoiceCommandOverlay";
import { VoiceMissPrompt }     from "../components/Voice/VoiceMissPrompt";
import { mockActionRegistryService } from "../services/actionRegistry/mockActionRegistryService";
import { VOICE_CONTEXT } from "../constants/systemActions";

// react-router's useLocation() always returns Location<any> — there's no
// generic parameter to narrow it at the call site. This describes what
// this page actually expects to find there (set by WorklistPage's row
// click and the Messages portal's case link), so `location.state`
// gets one real assertion to this shape instead of two stacked `any`s
// (the state field itself defaults to `any`, then was being cast to
// `any` again on top of that).
interface FullReportLocationState {
  fromFilter?: string;
  fromMessages?: boolean;
  /** Real feature, per direct follow-up: set true when arriving from
   *  the Informal Review Worklist tile or a message case link — both
   *  contexts where the whole point of being here is to publish a
   *  review, so the notes drawer should already be open. */
  openInternalNotes?: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FullReportPage() {
  const { t } = useTranslation();
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const locationState = location.state as FullReportLocationState | null;
  const fromFilter = locationState?.fromFilter;
  const fromMessages = locationState?.fromMessages;
  const { setPortalOpen } = useMessaging();

  const handleBack = () => {
    if (fromFilter) {
      navigate('/worklist', { state: { restoreFilter: fromFilter } });
    } else if (fromMessages) {
      setPortalOpen(true);
      navigate(-1);
    } else {
      navigate(-1);
    }
  };

  const cleanedCaseId = caseId?.trim() || "";
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);

  useEffect(() => {
    if (!cleanedCaseId) { setLoading(false); return; }
    setLoading(true);
    caseRouter.getCase(cleanedCaseId)
      .then(async c => {
        if (!c) { setCaseData(null); return; }

        // Real, per direct investigation: this page previously loaded and
        // rendered any case unconditionally — same pre-existing gap
        // synopticLoader.ts had. See resolveCaseAccessGate.ts's own header
        // for the full reasoning; this is the second of the two real
        // case-view entry points that needed the same real enforcement,
        // and now genuinely shares its implementation with the first.
        const gate = await resolveCaseAccessGate(user as any, c as any);
        if (!gate.granted) {
          console.warn(`${gate.reason === 'orchestration' ? 'Orchestration' : 'Pediatric'} access denied for case ${cleanedCaseId}: ${gate.detail}`);
          setCaseData(null);
          navigate(`/worklist?accessDenied=${gate.reason}&caseId=${cleanedCaseId}`, { replace: true });
          return;
        }

        setCaseData(c);
      })
      .catch(() => setCaseData(null))
      .finally(() => setLoading(false));
  }, [cleanedCaseId, user, navigate]);

  const isPool = caseData?.status === 'pool';

  // ── Voice: set CASE_VIEW context — this page is outside AppShell so
  //    it needs its own context setting and voice overlay components.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.CASE_VIEW);
    return () => mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
  }, []);

  // ── Voice: case navigation and go back/forward ─────────────────────────────
  useEffect(() => {
    const goBack    = () => navigate(-1);
    const goForward = () => navigate(1);
    const nextCase  = () => navigate(1);   // navigate forward in history
    const prevCase  = () => navigate(-1);  // navigate back in history

    window.addEventListener('PATHSCRIBE_GO_BACK',            goBack);
    window.addEventListener('PATHSCRIBE_GO_FORWARD',         goForward);
    window.addEventListener('PATHSCRIBE_NAV_NEXT_CASE',      nextCase);
    window.addEventListener('PATHSCRIBE_NAV_PREVIOUS_CASE',  prevCase);

    return () => {
      window.removeEventListener('PATHSCRIBE_GO_BACK',            goBack);
      window.removeEventListener('PATHSCRIBE_GO_FORWARD',         goForward);
      window.removeEventListener('PATHSCRIBE_NAV_NEXT_CASE',      nextCase);
      window.removeEventListener('PATHSCRIBE_NAV_PREVIOUS_CASE',  prevCase);
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="ps-report-page">
        <div className="ps-report-bg" />
        <div className="ps-report-bg-grad" />
        <div className="ps-report-content ps-report-notfound">
          <div className="ps-report-notfound-title">{t('fullReport.loading')}</div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="ps-report-page">
        <div className="ps-report-bg" />
        <div className="ps-report-bg-grad" />
        <div className="ps-report-content ps-report-notfound">
          <div className="ps-report-notfound-icon">🔍</div>
          <h1 className="ps-report-notfound-title">
            {t('fullReport.notFoundTitle')}
          </h1>
          <p className="ps-report-notfound-sub">
            {t('fullReport.notFoundCasePrefix')} <code className="ps-report-notfound-code" data-phi="accession">{cleanedCaseId || "—"}</code> {t('fullReport.notFoundCaseSuffix')}
          </p>
          <button onClick={handleBack} className="ps-report-notfound-btn">
            {t('fullReport.goBackBtn')}
          </button>
        </div>
        <VoiceCommandOverlay showSuccess={import.meta.env.DEV} />
        <VoiceMissPrompt />
      </div>
    );
  }

  const poolCaseSummary = `${(caseData as any).patient?.lastName ?? ''}, ${(caseData as any).patient?.firstName ?? ''} — ${(caseData as any).specimens?.[0]?.description ?? ''}`;

  return (
    <div className="ps-report-page">
      <div className="ps-report-bg" />
      <div className="ps-report-bg-grad" />
      <div className="ps-report-content">

        {/* Back + actions */}
        <div className="ps-report-actions-row">
          <button onClick={handleBack} className="ps-report-back-btn">
            {t('fullReport.backBtn')}
          </button>

          {/* Claim button — only visible for pool cases. Internal
              Notes now lives entirely within LeftReportPanel below —
              see the real duplication bug this replaced, in the
              header comment at the top of this file. */}
          {isPool && (
            <div className="ps-report-actions-right">
              <button onClick={() => setClaimOpen(true)} className="ps-report-claim-btn">
                {t('fullReport.claimBtn')}
              </button>
            </div>
          )}
        </div>


        {/* Header card */}
        <div className="ps-report-card ps-report-header-card">
          <div className="ps-report-header-row">
            <div>
              <div className="ps-report-eyebrow">
                {t('fullReport.eyebrow')}
              </div>
              <h1 className="ps-report-accession-title" data-phi="accession">
                {caseData.accession?.fullAccession ?? cleanedCaseId}
              </h1>
            </div>
            <div className="ps-report-header-meta">
              <div className="ps-report-label">{t('fullReport.lastUpdated')}</div>
              <div className="ps-report-header-meta-value">
                {(caseData as any).updatedAt ?? '—'}
              </div>
            </div>
          </div>
        </div>

        <LeftReportPanel caseData={caseData} autoOpenNotes={!!locationState?.openInternalNotes} />
      </div>

      {/* Voice overlays — this page is outside AppShell so mounts them directly */}
      <VoiceCommandOverlay showSuccess={import.meta.env.DEV} />
      <VoiceMissPrompt />

      {/* Pool claim modal — shown when pathologist clicks Claim This Case */}
      <PoolClaimModal
        isOpen={claimOpen}
        caseId={cleanedCaseId}
        caseSummary={poolCaseSummary}
        poolName={(caseData as any).poolName ?? t('fullReport.defaultPoolName')}
        currentUserId={user?.id ?? 'u1'}
        currentUserName={user?.name ?? 'Unknown'}
        continueToReport={true}
        fromFilter={fromFilter ?? 'pool'}
        onAccepted={() => setClaimOpen(false)}
        onPassed={() => { setClaimOpen(false); navigate('/worklist', { state: { restoreFilter: fromFilter ?? 'pool' } }); }}
        onClose={() => setClaimOpen(false)}
      />
    </div>
  );
}
