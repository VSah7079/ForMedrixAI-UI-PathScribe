// src/pages/SynopticReportPage/components/HeaderBar.tsx
// Rich case header — white bar with accession, patient info, progress steps.

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMessaging } from '@/contexts/MessagingContext';
import type { Case } from '@/types/case/Case';
import type { BlockStatus } from '@/types/case/Specimen';
import { getOrgOrchestratorDefault, resolveOrchestratorMode } from '@/components/Config/AI/orchestratorModeConfig';
import { getOrganisationByHospitalId } from '@/services/organisation/organisationService';
import { lisSyncService, flagService } from '@/services';
import type { LisSyncState, LisSyncPendingFlag } from '@/services';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getSessionFlag, clearSessionFlag } from '@/utils/uiPreferences';
import { getCaseStatusLabel, hasDisplayableRevision } from '@/utils/caseRevisionDisplay';
import { useReleaseBufferCountdown } from '../hooks/useReleaseBufferCountdown';
import '@/pathscribe.css';
import SupportReferenceChip from '@/components/Support/SupportReferenceChip';

// i18n note (batch 120): `caseData.order.priority` / `block.priority`
// (CasePriority: 'Routine' | 'Rush' | 'STAT') and `block.status`
// (BlockStatus) are persisted enums rendered directly as text in
// several places in this file — both go through a LABEL_KEY map
// below, same pattern as every other persisted-enum display in this
// codebase (e.g. MaterialTreePanel.tsx's own BLOCK_STATUS_LABEL_KEY,
// CassetteRoutingRulesSection.tsx's own PRIORITY_LABEL_KEY — this file
// reuses their exact wording for consistency, in its own namespace per
// established per-file convention). 'STAT' itself stays literal in
// every locale, matching that same precedent — a fixed clinical
// shorthand, not an ordinary translatable word, unlike 'Routine'/
// 'Rush'. `statusDisplayLabel`/`getCaseStatusLabel()` and
// `CASE_STATE_CLASS` come from this file's own case-status utility,
// already established as translated data upstream — left as-is here
// (not re-translated a second time). Specimen/block labels, stain
// names, and hospital/client names are real persisted case data and
// stay untranslated throughout.
const CASE_PRIORITY_LABEL_KEY: Record<'Routine' | 'Rush' | 'STAT', string> = {
  Routine: 'headerBar.priorityLabels.routine',
  Rush:    'headerBar.priorityLabels.rush',
  STAT:    'headerBar.priorityLabels.stat',
};
const BLOCK_STATUS_LABEL_KEY: Record<BlockStatus, string> = {
  Pending:   'headerBar.blockStatusLabels.pending',
  Grossed:   'headerBar.blockStatusLabels.grossed',
  Embedded:  'headerBar.blockStatusLabels.embedded',
  Exhausted: 'headerBar.blockStatusLabels.exhausted',
  Cancelled: 'headerBar.blockStatusLabels.cancelled',
  Lost:      'headerBar.blockStatusLabels.lost',
  Damaged:   'headerBar.blockStatusLabels.damaged',
};

// ── AI Synthesis Status — Gatekeeper Badge model. Matches the type defined
// in SynopticReportPage.tsx (duplicated here rather than imported to avoid
// a cross-directory type-only import cycle; keep these two in sync if the
// shape changes).
export interface AiSynthesisStatus {
  state: 'none' | 'draft-ready' | 'review-required';
  overallConfidence?:      number;
  flaggedFieldId?:          string;
  flaggedFieldConfidence?:  number;
}

interface HeaderBarProps {
  caseData:      Case | null;
  onSignOut:     () => void;
  onNavigate:    (path: string) => void;
  /**
   * Gatekeeper Badge status — replaces the old flat `aiConfidence` percentage.
   * SHORT-TERM model (per clinical review): conservative binary state — ANY
   * AI-suggested field below the configured confidence threshold trips
   * 'review-required', regardless of which field it is. A true tiered
   * "floor" model (gating only on diagnosis/staging-critical fields) is the
   * intended long-term design, deferred until tier classification can be
   * sourced from the real CAP eCC template schema rather than guessed.
   */
  aiSynthesisStatus?: AiSynthesisStatus;
  /** "Unpacking" — clicking the badge in 'review-required' state should
   *  jump the pathologist straight to the flagged field, not just display
   *  a number. No-op if omitted or if state isn't 'review-required'. */
  onAiStatusClick?: () => void;
  /** Compact single-strip mode — used in Report Draft to maximise editor space */
  compact?:      boolean;
  /**
   * Priority editing — added June 2026 to close a real gap: priority was
   * previously set once at Accession and then had no edit mechanism
   * anywhere else in the app, including here (this badge only ever
   * displayed it read-only). Omit to keep the badge read-only (e.g. on a
   * finalized/closed case, where changing urgency no longer means
   * anything).
   */
  onChangePriority?: (priority: string) => void;
  priorityLevels?: { id: string; label: string; colorHint: string }[];
  /** Deficiency history indicator — see this section's own render comment. */
  deficiencyCount?: number;
  onOpenDeficiencyHistory?: () => void;
  /** Version history indicator — real fix, Phase 5 (Patient/Encounter
   *  Management Subsystem): closes a real gap, same shape as the
   *  deficiency indicator above - reportVersionService.create() has
   *  been called from three real places in SynopticReportPage.tsx for
   *  a while, but nothing anywhere ever read the real history back for
   *  a human to see. Only shown once there's actually something to see
   *  (a case with at least one real signed version). */
  versionCount?: number;
  onOpenVersionHistory?: () => void;
  /** Batch 368 (PS-353): saves recorded in the report's change log. */
  changeCount?: number;
  onOpenChangeHistory?: () => void;
  /** Highlights the matching block chip and shows its status — the
   *  block a Grossing voice command (next/previous/mark grossed) would
   *  currently act on. Undefined outside grossing-relevant contexts. */
  focusedBlockId?: string;
  onOpenBlockEditor?: () => void;
  /** For the CoPilot "Data as of / Check now" indicator — lets HeaderBar
   *  apply any flags a simulated LIS check returns onto the real case.
   *  Omit to leave the indicator read-only (no case mutation possible). */
  onCaseUpdate?: (updatedCase: Case) => void;
  /** User-manual compact toggle -- separate from the automatic
   *  (isOrchestrationMode && leftTab === 'draft') compact trigger. Either
   *  can independently put the header into compact mode; this prop/
   *  callback pair controls only the manual one. Omit to hide the
   *  toggle button entirely (e.g. contexts where shrinking doesn't make
   *  sense). */
  isManuallyCompact?: boolean;
  onToggleManualCompact?: () => void;
}

type StepStatus = 'completed' | 'current' | 'pending' | 'alert';

interface ProgressStep {
  id:     number;
  label:  string;
  status: StepStatus;
}

// ── Status meta ───────────────────────────────────────────────────────────────
const CASE_STATE_CLASS: Record<string, string> = {
  'draft':            'ps-case-status--draft',
  'in-progress':      'ps-case-status--draft',
  'finalized':        'ps-case-status--finalized',
  'pending-review':   'ps-case-status--pending-review',
  /** Real feature, per direct specification: Post-Sign-Out Release
   *  Buffer. Own, distinct amber styling — matches
   *  ReleaseBufferBanner.tsx's own color theme for visual consistency
   *  across the two real, related UI elements. */
  'pending-release':  'ps-case-status--pending-release',
  // Real, per direct guidance ("Yes we should scope 'Return to
  // Trainee'/'Reject with Notes'"): the attending declined to
  // countersign and sent this case back for revision.
  'returned':         'ps-case-status--returned',
};

// ── Step circle class helper ──────────────────────────────────────────────────
function stepClass(status: StepStatus): string {
  return `ps-hb-step-circle ps-hb-step-circle--${status}`;
}

const HeaderBar: React.FC<HeaderBarProps> = ({ caseData, onSignOut: _onSignOut, onNavigate, aiSynthesisStatus, onAiStatusClick, compact = false, onChangePriority, priorityLevels, deficiencyCount, onOpenDeficiencyHistory, versionCount, onOpenVersionHistory, changeCount, onOpenChangeHistory, focusedBlockId, onOpenBlockEditor, onCaseUpdate, onToggleManualCompact }) => {
  const { t } = useTranslation();
  // Real fix, found via a direct audit: this used to call the old,
  // superseded getOrchestratorMode() (org-level only, from the now-
  // dead NarrativeTemplates/index.tsx) instead of the real
  // resolveOrchestratorMode() this file's own AI config module
  // provides — meaning the real, documented per-lab override
  // (Facility.internalAiOrchestratorEnabled) was silently never applied
  // here, even though the admin UI to set it (OrchestratorConfigSection)
  // is real and reachable. Defaults to the sync org-level value first
  // (no blank flash), then resolves the full, per-lab-aware value.
  const [isOrchestration, setIsOrchestration] = useState<boolean>(getOrgOrchestratorDefault);
  useEffect(() => {
    resolveOrchestratorMode(caseData?.order?.facilityId).then(setIsOrchestration).catch(() => {});
  }, [caseData?.order?.facilityId]);

  // CoPilot-only — Orchestration mode is the system of record; there's no
  // separate LIS for anything here to be "as of" relative to.
  const isAssistCase = caseData?.reportingMode === 'assist';
  const [syncState, setSyncState] = useState<LisSyncState | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);

  // "Back to Messages" — this page's own breadcrumb trail is fully
  // separate from AppShell's (see this file's own header comment
  // history), so this needs its own copy of the same reactive
  // sessionStorage check rather than anything AppShell tracks.
  const navigate = useNavigate();
  // Batch 375 (Pete): Add-On Orders is an action on the case, for whoever may open that screen.
  const capabilities = useCapabilities();
  const { setPortalOpen } = useMessaging();
  const [showBackToMessages, setShowBackToMessages] = useState(false);
  useEffect(() => {
    setShowBackToMessages(getSessionFlag('ps_reopen_messages') === '1');
  }, [caseData?.id]);

  useEffect(() => {
    if (!isAssistCase || !caseData?.id) { setSyncState(null); return; }
    let cancelled = false;
    lisSyncService.getSyncState(caseData.id).then(res => {
      if (!cancelled && res.ok) setSyncState(res.data);
    });
    return () => { cancelled = true; };
  }, [isAssistCase, caseData?.id]);

  // Real, confirmed fix (Jira PS-57 + its follow-up "should be able
  // to assign Flags at either a Case or Specimen level"): this used
  // to write LisSyncPendingFlag objects (id/name/lisCode/tagClass/
  // severity) directly onto a case-level specimenFlags field — a
  // third, different shape from the real FlagInstance model
  // (id/flagDefinitionId/appliedAt/source/deletedAt) the only real
  // flag-application workflow (FlagManagerModal/caseFlagsApi.ts)
  // actually uses, into a field that field never even read from or
  // wrote to. Each LIS-reported flag is now resolved against the
  // real flag catalog by lisCode — auto-created there (autoCreated:
  // true, matching this app's own, established pattern for
  // unrecognised LIS codes elsewhere) when no match exists — then
  // applied as a real FlagInstance (source: 'lis', the exact value
  // this field documents itself as existing for) to the correct
  // location: the specific specimen's own specimenFlags when
  // pf.specimenId is present, caseFlags when it's genuinely
  // case-level. Deduplicates against an already-applied, non-deleted
  // instance of the same definition, same real check
  // caseFlagsApi.ts's own applyFlags() uses.
  const resolveOrCreateFlagDefId = async (pf: LisSyncPendingFlag): Promise<string> => {
    const catalog = await flagService.getAll();
    const existing = catalog.ok ? catalog.data.find(f => f.lisCode === pf.lisCode) : undefined;
    if (existing) return existing.id;
    const created = await flagService.add({
      name: pf.name,
      lisCode: pf.lisCode,
      description: `Auto-created from LIS sync (code: ${pf.lisCode})`,
      level: pf.specimenId ? 'Specimen' : 'Case',
      severity: pf.severity,
      status: 'Active',
      tagClass: pf.tagClass,
      autoCreated: true,
    });
    if (created.ok) return created.data.id;
    throw new Error((created as { ok: false; error: string }).error);
  };

  const handleCheckNow = async () => {
    if (!caseData?.id || checkingNow) return;
    setCheckingNow(true);
    try {
      const res = await lisSyncService.checkNow(caseData.id);
      if (res.ok) {
        setSyncState({ lastCheckedAt: res.data.lastCheckedAt });
        // Real flag-adding mechanism (caseFlagsApi / useSynopticFlags) is
        // the actual insertion point for the manual-apply flow —
        // deliberately not duplicated in this mock service, kept as the
        // caller's job per its own header comment. onCaseUpdate applies
        // whatever came back onto the case the same way any other flag
        // addition would, just built as real FlagInstance records here.
        if (res.data.newFlags.length > 0 && onCaseUpdate && caseData) {
          const now = new Date().toISOString();
          let updatedCaseFlags = (caseData.caseFlags ?? []).slice();
          const specimenFlagAdds = new Map<string, any[]>();

          for (const pf of res.data.newFlags) {
            const flagDefinitionId = await resolveOrCreateFlagDefId(pf);
            const inst = {
              id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
              flagDefinitionId,
              appliedAt: now,
              appliedBy: 'LIS Sync',
              source: 'lis' as const,
              deletedAt: null,
              deletedBy: null,
            };
            if (pf.specimenId) {
              const existingOnSpecimen = (caseData.specimens ?? []).find(sp => sp.id === pf.specimenId)?.specimenFlags ?? [];
              const alreadyApplied = existingOnSpecimen.some(f => f.flagDefinitionId === flagDefinitionId && !f.deletedAt);
              if (!alreadyApplied) {
                if (!specimenFlagAdds.has(pf.specimenId)) specimenFlagAdds.set(pf.specimenId, []);
                specimenFlagAdds.get(pf.specimenId)!.push(inst);
              }
            } else {
              const alreadyApplied = updatedCaseFlags.some(f => f.flagDefinitionId === flagDefinitionId && !f.deletedAt);
              if (!alreadyApplied) updatedCaseFlags = [...updatedCaseFlags, inst];
            }
          }

          const updated: Case = {
            ...caseData,
            caseFlags: updatedCaseFlags,
            specimens: (caseData.specimens ?? []).map(sp => {
              const adds = specimenFlagAdds.get(sp.id);
              return adds ? { ...sp, specimenFlags: [...(sp.specimenFlags ?? []), ...adds] } : sp;
            }),
          };
          onCaseUpdate(updated);
        }
      }
    } finally {
      setCheckingNow(false);
    }
  };

  const formatSyncLabel = (iso: string): string => {
    const then = new Date(iso);
    const mins = Math.round((Date.now() - then.getTime()) / 60000);
    const rel = mins < 1
      ? t('headerBar.lisSync.justNow')
      : mins < 60
      ? t('headerBar.lisSync.minsAgo', { count: mins })
      : t('headerBar.lisSync.hrsAgo', { count: Math.round(mins / 60) });
    const clock = then.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return t('headerBar.lisSync.dataAsOf', { clock, rel });
  };

  const accession = caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? '—';
  const patient   = caseData?.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '—';
  const dob       = caseData?.patient?.dateOfBirth
    ? new Date(caseData.patient.dateOfBirth).toLocaleDateString() : '—';
  const mrn       = caseData?.patient?.mrn ?? '—';
  const sex       = caseData?.patient?.sex ?? '—';
  const status    = caseData?.status ?? 'draft';
  const hospital    = getOrganisationByHospitalId(caseData?.originHospitalId ?? '');
  const clientName  = caseData?.order?.facilityName ?? null;
  const isRevisedFinal = hasDisplayableRevision(status, caseData?.lastRevisionType);
  const statusClass  = isRevisedFinal ? 'ps-case-status--amended' : (CASE_STATE_CLASS[status] ?? CASE_STATE_CLASS['draft']);
  const statusDisplayLabel = getCaseStatusLabel(status, caseData?.lastRevisionType, t);
  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer, Phase 3 (spec §13b — "Status Header... Pending Release
  // (MM:SS remaining)"). Shares the exact same live countdown as
  // ReleaseBufferBanner.tsx via the common hook, rather than a second,
  // separately-maintained timer.
  const isPendingRelease = status === 'pending-release';
  const { formatted: pendingReleaseCountdown } = useReleaseBufferCountdown(isPendingRelease ? caseData?.releaseBufferExpiresAt : undefined);

  // ── Mode-aware final step label ───────────────────────────────────────────
  const finalStepLabel = isOrchestration ? t('headerBar.stage.signOut') : t('headerBar.stage.finalise');

  // ── Real, dynamic workflow stage — shared by both compact and full
  // render paths below.
  //
  // FIXED (two layers): (1) the full/non-compact header previously used
  // a completely static progressSteps array, always showing the same
  // fake state regardless of actual case progress. (2) the compact
  // mode's own "already correct" logic turned out to be equally broken
  // -- it read caseData.orchStage, a field that is NEVER SET anywhere
  // in this entire codebase (confirmed via full-repo grep), so it
  // always silently fell back to stage 0 for every case. Both paths
  // now share one real, correctly-sourced computation below.
  //
  // Deliberately mode-aware, not one blended signal: in Orchestration
  // mode, PathScribe owns the full case lifecycle, so caseData.status
  // (a real, well-populated 17-value enum -- see types/case/CaseStatus.ts)
  // is a genuinely accurate signal for all four stages. In CoPilot mode,
  // the LIS owns the case -- PathScribe doesn't reliably track or claim
  // ownership of Grossing/Processing for LIS-owned cases, so those two
  // stages default to complete rather than asserting something
  // PathScribe doesn't actually know. What PathScribe DOES know for
  // certain in either mode is its own synoptic report instance's status
  // (draft/finalized), so that drives the Synoptic/Sign-Out stages for
  // CoPilot cases specifically. Real, granular material-status tracking
  // (block/slide-level, ideally sourced from an actual lab system like
  // Roche Vantage or Leica CEREBRO rather than derived internally) is a
  // deliberately deferred future enhancement, not a current gap -- the
  // existing block.status/stain.status fields give a practical signal
  // today; this is for when real per-touchpoint lab-system integration exists.
  const orchestrationStageMap: Record<string, number> = {
    'draft': 0, 'accessioned': 0,
    'gross-complete': 1, 'intraoperative-complete': 1,
    'pending-review': 2, 'in-progress': 2,
    'pathologist-review': 3, 'finalizing': 3,
    'finalized': 4, 'closed': 4,
  };

  const activeSynopticStatus = (caseData as any)?.synopticReports?.find(
    (r: any) => r.instanceId === (caseData as any)?.activeReportInstanceId
  )?.status ?? (caseData as any)?.synopticReports?.[0]?.status;

  const currentStageIdx = isOrchestration
    ? (orchestrationStageMap[caseData?.status ?? ''] ?? 0)
    : (activeSynopticStatus === 'finalized' ? 4
        : activeSynopticStatus ? 2  // draft/in-progress synoptic exists — Synoptic stage current
        : 2);                        // no synoptic yet — still Synoptic stage (Grossing/Processing default complete for CoPilot)

  const stageLabels = [t('headerBar.stage.grossing'), t('headerBar.stage.processing'), t('headerBar.stage.synoptic'), finalStepLabel];

  const progressSteps: ProgressStep[] = stageLabels.map((label, i) => ({
    id: i + 1,
    label,
    status: (i < currentStageIdx ? 'completed' : i === currentStageIdx ? 'current' : 'pending') as StepStatus,
  }));

  // ── Compact mode — single 36px strip for Report Draft ──────────────────
  if (compact) {

    return (
      <div className="ps-hb-compact">
        {/* Left: accession + patient + priority */}
        <div className="ps-hb-compact-left">
          <span className="ps-hb-compact-acc" data-phi="accession">{accession}</span>
          <span className="ps-hb-compact-sep">·</span>
          <span className="ps-hb-compact-patient" data-phi="name">{patient}</span>
          {caseData?.patient?.dateOfBirth && (
            <>
              <span className="ps-hb-compact-sep">·</span>
              <span className="ps-hb-compact-meta" data-phi="dob">
                {t('headerBar.field.dobInline', { dob, sex })}
              </span>
            </>
          )}
          {caseData?.patient?.mrn && (
            <>
              <span className="ps-hb-compact-sep">·</span>
              <span className="ps-hb-compact-meta" data-phi="mrn">{t('headerBar.field.mrnInline', { mrn })}</span>
            </>
          )}
          {(caseData?.order as any)?.priority && (
            onChangePriority && priorityLevels?.length ? (
              <select
                className={`ps-hb-compact-priority ps-hb-compact-priority--editable${(caseData?.order as any)?.priority === 'STAT' ? ' ps-hb-compact-priority--stat' : (caseData?.order as any)?.priority === 'Rush' ? ' ps-hb-compact-priority--rush' : ' ps-hb-compact-priority--routine'}`}
                value={(caseData?.order as any)?.priority}
                onChange={e => onChangePriority(e.target.value)}
                title={t('headerBar.priorityLabels.changeTitle')}
                aria-label={t('headerBar.priorityLabels.changeTitle')}
              >
                {priorityLevels.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            ) : (
              <span className={`ps-hb-compact-priority${(caseData?.order as any)?.priority === 'STAT' ? ' ps-hb-compact-priority--stat' : (caseData?.order as any)?.priority === 'Rush' ? ' ps-hb-compact-priority--rush' : ' ps-hb-compact-priority--routine'}`}>
                {t(CASE_PRIORITY_LABEL_KEY[(caseData?.order as any)?.priority as 'Routine' | 'Rush' | 'STAT'] ?? CASE_PRIORITY_LABEL_KEY.Routine)}
              </span>
            )
          )}
          {/* Batch 364 (PS-350): the case's support reference, to quote to support instead of the case number. */}
          {caseData?.id && <SupportReferenceChip kind="case" recordId={caseData.id} />}
        </div>

        {/* Centre: workflow stage dots */}
        <div className="ps-hb-compact-stages">
          {stageLabels.map((label, i) => (
            <React.Fragment key={label}>
              <div className="ps-hb-compact-stage">
                <span className={`ps-hb-compact-dot${i < currentStageIdx ? ' done' : i === currentStageIdx ? ' active' : ''}`}>
                  {i < currentStageIdx ? '✓' : i + 1}
                </span>
                <span className={`ps-hb-compact-stage-lbl${i === currentStageIdx ? ' active' : ''}`}>{label}</span>
              </div>
              {i < stageLabels.length - 1 && (
                <div className={`ps-hb-compact-connector${i < currentStageIdx ? ' done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Right: AI synthesis status + breadcrumb nav */}
        <div className="ps-hb-compact-right">
          {aiSynthesisStatus && aiSynthesisStatus.state !== 'none' && (
            aiSynthesisStatus.state === 'review-required' ? (
              <button
                className="ps-hb-compact-conf ps-hb-compact-conf--warn ps-hb-reset-button"
                onClick={onAiStatusClick}
                title={
                  aiSynthesisStatus.flaggedFieldConfidence !== undefined
                    ? t('headerBar.aiStatus.reviewTooltipWithPct', { pct: aiSynthesisStatus.flaggedFieldConfidence })
                    : t('headerBar.aiStatus.reviewTooltip')
                }
              >
                <span className="ps-hb-compact-conf-pct">⚠</span>
                <span className="ps-hb-compact-conf-label">{t('headerBar.aiStatus.reviewPending')}</span>
              </button>
            ) : (
              <span className="ps-hb-compact-conf ps-hb-compact-conf--neutral" title={t('headerBar.aiStatus.draftedTooltip')}>
                <span className="ps-hb-compact-conf-label">{t('headerBar.aiStatus.aiDrafted')}</span>
              </span>
            )
          )}
          <div className="ps-hb-compact-nav-group">
            <button
              className="ps-hb-compact-nav-btn"
              onClick={() => onNavigate('/worklist')}
              title={t('headerBar.nav.backToWorklistTooltip')}
            >← {t('headerBar.breadcrumb.worklist')}</button>
            {onToggleManualCompact && (
              <button
                className="ps-hb-compact-nav-btn"
                onClick={onToggleManualCompact}
                title={t('headerBar.nav.showFullHeaderTooltip')}
              >⌄ {t('headerBar.nav.fullView')}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-hb">

      {/* Breadcrumb */}
      <div className="ps-hb-breadcrumb">
        {showBackToMessages && (
          <>
            <span
              className="ps-hb-crumb ps-hb-crumb--messages"
              onClick={() => { clearSessionFlag('ps_reopen_messages'); setShowBackToMessages(false); setPortalOpen(true); navigate(-1); }}
            >
              ← {t('headerBar.breadcrumb.backToMessages')}
            </span>
            <span className="ps-hb-crumb-sep">│</span>
          </>
        )}
        <span className="ps-hb-crumb" onClick={() => onNavigate('/')}>{t('headerBar.breadcrumb.home')}</span>
        <span className="ps-hb-crumb-sep">›</span>
        <span className="ps-hb-crumb" onClick={() => onNavigate('/worklist')}>{t('headerBar.breadcrumb.worklist')}</span>
        <span className="ps-hb-crumb-sep">›</span>
        <span className="ps-hb-crumb ps-hb-crumb--active">{t('headerBar.breadcrumb.caseReport')}</span>

        {onToggleManualCompact && (
          <button
            className="ps-hb-compact-nav-btn ps-hb-compact-nav-btn--ml-auto"
            onClick={onToggleManualCompact}
            title={t('headerBar.nav.shrinkToCompactTooltip')}
          >⌃ {t('headerBar.nav.compactView')}</button>
        )}

        {isAssistCase && syncState && (
          <div className="ps-hb-lis-sync">
            <span className="ps-hb-lis-sync-label">{formatSyncLabel(syncState.lastCheckedAt)}</span>
            <button
              className="ps-hb-lis-sync-btn"
              disabled={checkingNow}
              onClick={handleCheckNow}
              title={t('headerBar.lisSync.checkNowTooltip')}
            >
              {checkingNow ? t('headerBar.lisSync.checking') : `↻ ${t('headerBar.lisSync.checkNow')}`}
            </button>
          </div>
        )}
      </div>

      {/* Blocks & Stains — generated at Accession from the specimen's
          protocol (or default stains). Click "Edit" to open the real
          manual editor — status, stains, and a per-block priority
          override are all hand-editable there now; this row itself
          stays a read-only summary. */}
      {(caseData?.specimens ?? []).some((sp: any) => sp.blocks?.length) && (
        <div className="ps-hb-blocks-row">
          {(caseData?.specimens ?? []).map((sp: any) => (sp.blocks ?? []).map((block: any) => (
            <span key={block.id} className={`ps-hb-block-chip${block.id === focusedBlockId ? ' ps-hb-block-chip--focused' : ''}`} title={block.sourcePathwayName ?? undefined}>
              <strong>{sp.label}{block.label}</strong>
              {block.sourcePathwayName ? ` (${block.sourcePathwayName})` : ''}
              {' · '}{block.stains.length ? block.stains.map((st: any) => st.stainName).join(', ') : t('headerBar.blocks.noStainsYet')}
              {' · '}<em>{t(BLOCK_STATUS_LABEL_KEY[block.status as BlockStatus] ?? block.status)}</em>
              {block.priority ? <> · <em title={t('headerBar.blocks.priorityOverrideTitle')}>{t(CASE_PRIORITY_LABEL_KEY[block.priority as 'Routine' | 'Rush' | 'STAT'] ?? block.priority)}</em></> : null}
            </span>
          )))}
          {onOpenBlockEditor && (
            <button className="ps-hb-block-edit-btn" onClick={onOpenBlockEditor}>{t('common.edit')}</button>
          )}
          {caseData && capabilities.has('screen:add-on-orders:open') && (
            <button className="ps-hb-block-edit-btn" title={t('headerBar.blocks.addOnOrderTitle')}
              onClick={() => navigate(`/add-on-orders?case=${encodeURIComponent(caseData.id)}`)}>
              {t('headerBar.blocks.addOnOrder')}
            </button>
          )}
        </div>
      )}

      {/* Deficiency history indicator — closes a real gap: getByCaseId()
          already existed on the deficiency service with zero UI ever
          calling it. Only shown when there's actually something to see. */}
      {!!deficiencyCount && onOpenDeficiencyHistory && (
        <div className="ps-hb-blocks-row">
          <button className="ps-hb-deficiency-chip" onClick={onOpenDeficiencyHistory}>
            ⚠ {t('headerBar.blocks.deficiencyChip', { count: deficiencyCount })}
          </button>
        </div>
      )}

      {/* Version history indicator — real fix, Phase 5: same real gap
          as the deficiency indicator above, closed the same way. */}
      {((!!versionCount && onOpenVersionHistory) || (!!changeCount && onOpenChangeHistory)) && (
        <div className="ps-hb-blocks-row">
          {!!versionCount && onOpenVersionHistory && (
            <button className="ps-hb-version-chip" onClick={onOpenVersionHistory}>
              🕐 {t('headerBar.blocks.versionChip', { count: versionCount })}
            </button>
          )}
          {/* Batch 368 (PS-353): the report's change history. */}
          {!!changeCount && onOpenChangeHistory && (
            <button className="ps-hb-version-chip" onClick={onOpenChangeHistory}>
              📝 {t('headerBar.blocks.changeChip', { count: changeCount })}
            </button>
          )}
        </div>
      )}

      {/* Main row */}
      <div className="ps-hb-row">

        {/* Left — accession + patient */}
        <div className="ps-hb-left">

          {/* Accession block */}
          <div className="ps-hb-accession">
            <div className="ps-hb-field-label">{t('headerBar.field.accession')}</div>
            <div className="ps-hb-accession-number" data-phi="accession">{accession}</div>
            {hospital && (
              <div className="ps-hb-hospital-sublabel">
                {hospital.shortName} · {hospital.country === 'UK' ? 'NHS' : hospital.country}
              </div>
            )}
            <div className={`ps-hb-status-pill ${statusClass}`} title={t('headerBar.status.overallStatusTooltip')}>
              <div className="ps-hb-status-dot" />
              <span className="ps-hb-status-text">
                {t('headerBar.status.caseLabel', { status: statusDisplayLabel })}
                {isPendingRelease && ` (${t('headerBar.status.remaining', { countdown: pendingReleaseCountdown })})`}
              </span>
            </div>
          </div>

          <div className="ps-hb-divider" />

          {/* Patient fields */}
          <div className="ps-hb-patient-fields">
            {caseData?.id && (
              <div className="ps-hb-field">
                <div className="ps-hb-field-label">{t('supportReference.chip.fieldLabel')}</div>
                <SupportReferenceChip kind="case" recordId={caseData.id} />
              </div>
            )}
            <div className="ps-hb-field">
              <div className="ps-hb-field-label">{t('headerBar.field.patient')}</div>
              <div className="ps-hb-field-value ps-hb-field-value--lg" data-phi="name">{patient}</div>
            </div>
            <div className="ps-hb-field">
              <div className="ps-hb-field-label">{t('headerBar.field.sex')}</div>
              <div className="ps-hb-field-value">{sex}</div>
            </div>
            <div className="ps-hb-field">
              <div className="ps-hb-field-label">{t('headerBar.field.dateOfBirth')}</div>
              <div className="ps-hb-field-value" data-phi="dob">{dob}</div>
            </div>
            <div className="ps-hb-field">
              <div className="ps-hb-field-label">{t('headerBar.field.mrn')}</div>
              <div className="ps-hb-field-value" data-phi="mrn">{mrn}</div>
            </div>
            {clientName && (
              <div className="ps-hb-field">
                <div className="ps-hb-field-label">{t('headerBar.field.referring')}</div>
                <div className="ps-hb-field-value">{clientName}</div>
              </div>
            )}
          </div>
        </div>

        {/* Centre — progress stepper */}
        <div className="ps-hb-stepper">
          {progressSteps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="ps-hb-step">
                <div className={stepClass(step.status)}>
                  {step.status === 'completed' ? '✓' : step.status === 'alert' ? '⚠' : step.id}
                </div>
                <div className={`ps-hb-step-label ps-hb-step-label--${step.status}`}>
                  {step.label}
                </div>
              </div>
              {idx < progressSteps.length - 1 && (
                <div className={`ps-hb-step-connector${idx < 2 ? ' ps-hb-step-connector--done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Right — AI synthesis status card */}
        <div className="ps-hb-right">
          <div className="ps-hb-confidence-card">
            <div className="ps-hb-confidence-header">
              <span className="ps-hb-confidence-status" title={t('headerBar.status.overallStatusTitle')}>{t('headerBar.status.caseLabel', { status: statusDisplayLabel })}</span>
              <span className="ps-hb-confidence-priority">{t(CASE_PRIORITY_LABEL_KEY[(caseData?.order?.priority as 'Routine' | 'Rush' | 'STAT') ?? 'Routine'])}</span>
            </div>
            {aiSynthesisStatus && aiSynthesisStatus.state !== 'none' ? (
              aiSynthesisStatus.state === 'review-required' ? (
                <button
                  className="ps-hb-confidence-score ps-hb-confidence-score--warn ps-hb-reset-button ps-hb-reset-button--column"
                  onClick={onAiStatusClick}
                  title={t('headerBar.aiStatus.reviewScoreTooltip')}
                >
                  <span className="ps-hb-confidence-pct">⚠ {t('headerBar.aiStatus.reviewPending')}</span>
                  {aiSynthesisStatus.flaggedFieldConfidence !== undefined && (
                    <span className="ps-hb-confidence-label">
                      {t('headerBar.aiStatus.fieldAtConfidence', { pct: aiSynthesisStatus.flaggedFieldConfidence })}
                    </span>
                  )}
                </button>
              ) : (
                <div className="ps-hb-confidence-score ps-hb-confidence-score--neutral">
                  <span className="ps-hb-confidence-pct">{t('headerBar.aiStatus.aiDrafted')}</span>
                  <span className="ps-hb-confidence-label">
                    {t('headerBar.aiStatus.noFieldsBelowThreshold')}
                    {aiSynthesisStatus.overallConfidence !== undefined
                      ? ` · ${t('headerBar.aiStatus.avgConfidence', { pct: aiSynthesisStatus.overallConfidence })}`
                      : ''}
                  </span>
                </div>
              )
            ) : (
              // No AI suggestions exist yet for this case — rather than
              // leaving the card body empty (previously: header strip only,
              // nothing below it), give the case status itself the same
              // visual weight the AI states get, so the card always shows
              // something meaningful instead of looking unfinished/blank.
              <div className="ps-hb-confidence-score ps-hb-confidence-score--status">
                <span className={`ps-hb-confidence-pct ${statusClass}`}>
                  {statusDisplayLabel.toUpperCase()}
                </span>
                <span className="ps-hb-confidence-label">
                  {isPendingRelease ? t('headerBar.status.releasingIn', { countdown: pendingReleaseCountdown }) : t('headerBar.aiStatus.noSuggestionsYet')}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default HeaderBar;
