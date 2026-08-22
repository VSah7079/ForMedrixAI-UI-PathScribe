// src/pages/SynopticReportPage/SynopticReportPage.tsx
// ─────────────────────────────────────────────────────────────
// Orchestrator — assembles the full clinical workspace shell:
//
//   ┌─ NavBar ──────────────────────────────────────────────────┐
//   ├─ HeaderBar (accession, patient, sign-out) ────────────────┤
//   ├─ Sidebar │ LeftReportPanel │ RightSynopticPanel ──────────┤
//   └─ BottomActionBar ─────────────────────────────────────────┘
//
// RightSynopticPanel owns all synoptic state and rendering.
// This file is intentionally thin — layout + modal wiring only.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useVoice } from '@/contexts/VoiceProvider';
import { useFootPedal } from '@/hooks/useFootPedal';
import { useAudioSegmentRecorder } from '@/hooks/useAudioSegmentRecorder';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import AddSynopticModal       from './components/AddSynopticModal';
import SpecimenEditModal      from './modals/SpecimenEditModal';
import CreateBiopsyArrayModal from './modals/CreateBiopsyArrayModal';
import MatrixBlockEditorModal from './modals/MatrixBlockEditorModal';
import AddOrdersModal, { type OrderTab } from './modals/AddOrdersModal';
import NavBar             from '@/components/NavBar/NavBar';
import HeaderBar          from './components/HeaderBar';
import Sidebar            from './components/Sidebar';
import MaterialTreePanel  from './components/MaterialTreePanel';
import LeftReportPanel    from './components/LeftReportPanel';
import { AmendmentStatusBanner } from './components/AmendmentStatusBanner';
// Real fix, per direct follow-up: "I want informal reviews to be
// handled differently than delegations types, so remove the informal
// action from that workflow." InformalReviewBanner.tsx was built
// around DelegationRecord.delegationType === 'CASUAL_REVIEW' -
// removed along with that whole approach. Replaced by a real, separate
// InformalReviewRequest system - see the "Internal Notes" button
// effect below, and the new "Informal Review" Worklist tile.
import { ReleaseBufferBanner } from './components/ReleaseBufferBanner';
import { AmendmentDraftBanner } from './components/AmendmentDraftBanner';
import RightSynopticPanel, { type RightSynopticPanelHandle, type AiSuggestion } from './components/RightSynopticPanel';
import MicroscopicEntryPanel from './components/MicroscopicEntryPanel';
import { useMicroscopicEntry } from './hooks/useMicroscopicEntry';
import BottomActionBar    from './components/BottomActionBar';

import AmendmentModal        from './modals/AmendmentModal';
import { CaseCommentModal }   from '../Synoptic/Comments/CaseCommentModal';
import { RetentionHoldModal } from './modals/RetentionHoldModal';
import { CaseHoldModal } from './modals/CaseHoldModal';
import PatientHistoryModal    from '../../components/PatientHistory/PatientHistoryModal';
import FlagManagerModal       from '../../components/Flags/FlagManagerModal';
import { AddCodeModal }       from '../Synoptic/Codes/AddCodeModal';
import { ReportCommentModal } from '../Synoptic/Comments/ReportCommentModal';
import CaseSignOutModal      from './modals/CaseSignOutModal';
import { DiscordanceReconciliationModal } from './modals/DiscordanceReconciliationModal';
import { CopilotReportViewModal } from './modals/CopilotReportViewModal';
import { useLisIntegration } from './hooks/useLisIntegration';
import { MATERIAL_SCAN_UPDATED_EVENT } from '@/hooks/useGlobalMaterialScanTracking';
import { getEffectiveScanStationId } from '@/utils/effectiveScanStation';
import { useSpecimenBlockManagement } from './hooks/useSpecimenBlockManagement';
import { useEffectiveScanStation } from '@/hooks/useEffectiveScanStation';
import { useReportGeneration } from './hooks/useReportGeneration';
import { useAmendmentWorkflow } from './hooks/useAmendmentWorkflow';
import { useGrossingCompletion } from './hooks/useGrossingCompletion';
import { useOrchestratorDraft, writeCaseDraft } from './hooks/useOrchestratorDraft';
import { useSignOutWorkflow } from './hooks/useSignOutWorkflow';
import FinalizeSynopticModal from './modals/FinalizeSynopticModal';
import LogoutWarningModal    from '@/components/Common/LogoutWarningModal';
import UnsavedWarningModal   from './modals/UnsavedWarningModal';
import DraftRecoveryModal    from '@/components/Common/DraftRecoveryModal';
import { ManageReprintsModal } from './modals/ManageReprintsModal';
import { printRequisitionLabel, printContainerLabel, printDecantContainerLabel } from '@/utils/labels/printRequisitionAndContainerLabels';

import { useSynopticFinalize } from '../Synoptic/useSynopticFinalize';
import { useSynopticModals }   from '../Synoptic/useSynopticModals';
import { useSynopticToast }    from '../Synoptic/useSynopticToast';
import { useSynopticFlags }    from '../Synoptic/useSynopticFlags';
import { SaveToast }           from '../Synoptic/UI/SaveToast';

import { caseRouter } from '@/services/cases/CaseRouter';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { priorityService } from '@/services';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import { intraoperativeService } from '@/services';
import { IntraopMergePromptModal } from '@/pages/AccessionPage/IntraopMergePromptModal';
import type { EntryMatch } from '@/types/intraop/IntraoperativeEntry';
import { amendmentService, reportVersionService } from '@/services';
import type { ReportVersionRecord } from '@/types/reports/ReportVersionRecord';
import { VOICE_CONTEXT } from '@/constants/systemActions';
import { deficiencyTypeService, resolutionTypeService } from '@/services';
import type { SpecimenDeficiency, DeficiencyType, ResolutionType } from '@/services/deficiencies/IDeficiencyService';
import { DeficiencyHistoryModal } from './modals/DeficiencyHistoryModal';
import { VersionHistoryModal } from './modals/VersionHistoryModal';
import { BlockStainEditorModal } from './modals/BlockStainEditorModal';
import type { CaseComment } from '@/types/case/CaseComment';
import { specimenDeficiencyService } from '@/services';
import { useSpecimenDictionary } from '@/components/Config/System/useSpecimenDictionary';
import { FixativeTimeGateModal, type FixativeGateSpecimen, type FixativeResolution } from './modals/FixativeTimeGateModal';
import SynopticSidebar    from '../../components/Synoptic/SynopticSidebar';
import { useDirtyState } from '@/contexts/DirtyStateContext';
import { useLogout } from '@/hooks/useLogout';
import { useDraftCache } from '@/hooks/useDraftCache';
import { computeDraftDiff } from '@/utils/computeDraftDiff';
import '@/pathscribe.css';

import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import { AiReviewModal }  from './modals/AiReviewModal';
import { DelegateModal }  from '../Synoptic/Delegate/DelegateModal';
import CaseTeamModal            from './modals/CaseTeamModal';
import { PreFinalisationModal } from './modals/PreFinalisationModal';
import { ProtocolChangeModal }     from './modals/ProtocolChangeModal';
// ProtocolChange moved to Case.ts — see comment there. (ProtocolChangeModal.tsx
// still re-exports it for backward compat, but importing it from its real
// home directly here, alongside Case/SynopticReportInstance below.)
import { mockActionRegistryService } from '@/services/actionRegistry/mockActionRegistryService';
import { useAuditLog } from '@/components/Audit/useAuditLog';

// ── Orchestrator ───────────────────────────────────────────────
import OrchestratorSectionEditor from './components/OrchestratorSectionEditor';
import type { OrchestratorSection } from './components/OrchestratorSectionEditor';
import ReportPreviewRenderer, { getInstitution, buildRenderScope } from '@/pages/ReportPreview/ReportPreviewRenderer';
import SequencerPanel from './components/SequencerPanel';
import { buildContext, resolveAnswers } from '@/orchestrator/contextBuilder';
import type { StructuredContext } from '@/orchestrator/contextBuilder';
import { aiBehaviorService } from '@/services';


// Report PDF generation — Firebase Cloud Function (Python/ReportLab), see
// functions-render-report/main.py. Not secret (it's a function URL, not a
// key), so VITE_-prefixed is fine here — unlike the API key issue found
// and fixed elsewhere in this codebase.
//
// Local default is 'http://localhost:8080/' — NOT '.../render_report'.
// `functions-framework --target=render_report --port=8080` serves the
// target function at the root of that port; --target only selects which
// Python function runs, it isn't a URL path segment. Once deployed to
// Firebase, set VITE_REPORT_PDF_ENDPOINT to the full URL Firebase gives
// you for the function (the function name is already part of that
// hostname/path) — don't append /render_report to it either.
const REPORT_PDF_ENDPOINT =
  (import.meta as any).env?.VITE_REPORT_PDF_ENDPOINT ?? 'http://localhost:8080/';

// ── AI Synthesis Status — Gatekeeper Badge model (see Dr. Carter's review,
// applied in SynopticReportPage below). 'none' = no AI suggestions exist
// yet for this case; 'draft-ready' = no Tier 1 field is under threshold;
// 'review-required' = at least one Tier 1 field is under threshold and
// flaggedFieldId/flaggedFieldConfidence identify which one for "unpacking."
export interface AiSynthesisStatus {
  state: 'none' | 'draft-ready' | 'review-required';
  overallConfidence?:      number; // informational only — never drives `state`
  flaggedFieldId?:          string;
  flaggedFieldConfidence?:  number;
}

const SynopticReportPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { user: signingUser } = useAuth();
  const { log }   = useAuditLog();
  const navigate   = useNavigate();
  const location   = useLocation();
  const handleLogout = useLogout();

  // ── Worklist state ─────────────────────────────────────────
  const routerWorklistIds: string[] = (location.state as any)?.worklistCaseIds ?? [];

  // Track whether this case was opened from Search or Worklist.
  // sessionStorage key is set by SearchPage / WorklistTable before navigation.
  const navSource: 'search' | 'worklist' = React.useMemo(() => {
    return sessionStorage.getItem('pathscribe:navFrom') === 'search' ? 'search' : 'worklist';
  }, []);

  const backPath = navSource === 'search' ? '/search' : '/worklist';

  // ── Foot pedal — real feature, per direct follow-up: "Foot pedal
  //    support specifically." The Grossing spec's own real 3-pedal
  //    scheme, wired to real, existing capabilities rather than new,
  //    parallel ones: Pedal 1 toggles the same real voice-listening
  //    state the mic button itself controls; Pedal 2 fires the same
  //    real PATHSCRIBE_NEXT_UNANSWERED event the "Next Unanswered"
  //    button already dispatches. Pedal 3 is genuinely two related
  //    actions on one button, chosen by real, current state — Pause
  //    while actively listening, Replay once already paused, since a
  //    single pedal press can only ever mean one or the other at any
  //    given moment. ──────────────────────────────────────────────
  const { isListening, toggleVoice, stopListening } = useVoice();
  const audioSegments = useAudioSegmentRecorder();
  const wasListeningRef = useRef(false);

  // Starts/stops the real, parallel audio-segment recorder in step
  // with the real dictation lifecycle — a new segment begins each
  // time listening (re)starts, so "the last segment" always means
  // whatever was most recently, actually dictated.
  useEffect(() => {
    if (isListening && !wasListeningRef.current) {
      audioSegments.startSegment();
    } else if (!isListening && wasListeningRef.current) {
      audioSegments.stopCapture();
    }
    wasListeningRef.current = isListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  useFootPedal({
    actions: {
      pedal1_pushToTalk: () => toggleVoice(),
      pedal2_nextField: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_NEXT_UNANSWERED')),
      pedal3_pauseReplay: () => {
        if (isListening) stopListening();
        else audioSegments.replayLastSegment();
      },
    },
  });

  // ── Case data ──────────────────────────────────────────────
  const [caseData, setCaseData]     = useState<Case | null>(null);
  // Real optimistic-concurrency baseline — the version this session last
  // knew about, either from initial load or this session's own last
  // successful save. Passed as expectedVersion on every write; the server
  // (or mock service, locally) performs the actual atomic compare-and-swap
  // — this ref only needs to remember what THIS session last saw, not
  // perform the check itself. A ref, not state, since it's read at save
  // time and updated after saves, never needs to trigger a render.
  const knownVersionRef = useRef<number>(0);
  const [concurrencyConflict, setConcurrencyConflict] = useState<{ actualVersion: number; blockOverride?: boolean } | null>(null);

  // Real conflict-resolution actions. "Reload" deliberately does a full page
  // reload rather than trying to reconstruct orchSections from a fresh fetch
  // in place — this file's initial-load derivation logic is complex enough
  // that duplicating it inline risks a subtly wrong reconstruction, and a
  // full reload guarantees correctness at the cost of losing this session's
  // own unsaved local changes, which is the whole point of choosing this
  // option (someone else's saved changes win).
  const handleConcurrencyReload = () => {
    window.location.reload();
  };
  const handleConcurrencyForceSave = async () => {
    if (!caseData?.id || !concurrencyConflict) { setConcurrencyConflict(null); return; }
    try {
      // Deliberately omits expectedVersion — bypasses the check entirely
      // rather than racing to guess the current version, matching "Save
      // Mine Anyway"'s actual intent (overwrite regardless of what's
      // there). The service still increments version normally; this
      // session's known baseline is set from the conflict's own
      // actualVersion (not a blind +1 on whatever this session last
      // knew), since other writes may have landed between the conflict
      // being detected and this force-save actually running.
      await writeCaseDraft(caseData, caseId, orchSections);
      knownVersionRef.current = concurrencyConflict.actualVersion + 1;
      clearDirty();
      showToast('Draft saved — your version overwrote the other change');
    } catch (e) { console.error(e); }
    setConcurrencyConflict(null);
  };

  // Phase 2 of the Inactivity Timeout & Draft Recovery spec. Caches the FULL case (not just synoptic answers --
  // this page has 18 distinct dirty-able things per its own markDirty()
  // call sites, from Priority to Case comments to Codes; an earlier,
  // narrower version of this only caught synoptic answers and would have
  // silently lost everything else). EXCLUDES `patient` specifically --
  // pure read-only master data from the LIS/EHR (name/DOB/MRN), never
  // edited on this page, and re-fetched fresh on restore rather than
  // risking overwriting updated demographics with a stale cached copy.
  // Moved up from its original location further down this file —
  // draftableCaseSlice, immediately below, needs it, and hooks can't
  // reference a const declared later in the same render pass. The
  // initializer itself ([]) has no dependency on anything declared
  // between here and its original position, so this move is safe.
  const [orchSections,    setOrchSections]    = useState<OrchestratorSection[]>([]);

  // Local-only restore -- no auto-persist to the server; see the restore
  // handler below.
  //
  // Real fix, per direct report: "draft not persistent (lost on
  // navigation/refresh)." Traced precisely — orchSections is genuinely
  // separate, local component state (useState below), never merged into
  // caseData at all, so it was never part of what this cache saved or
  // restored, even though every other one of this page's 18 dirty-able
  // things already was. Included here under a real, dedicated key
  // (never a real Case field, so it can't collide with one) — the
  // restore handler below extracts it back out separately rather than
  // spreading it into caseData.
  const draftableCaseSlice = useMemo(() => {
    if (!caseData) return null;
    const { patient: _patient, ...rest } = caseData as any;
    return { ...rest, __orchSectionsDraft: orchSections };
  }, [caseData, orchSections]);

  const { hasExistingDraft, existingDraftPayload, existingDraftSavedAt, confirmRestore, discardDraft } = useDraftCache(
    signingUser?.id ?? null,
    caseId ?? null,
    draftableCaseSlice,
  );

  // Real feature, per direct follow-up: "I thought we were display the
  // changes that would be applied to the case." draftableCaseSlice and
  // existingDraftPayload are the exact same shape (both caseData minus
  // patient, plus __orchSectionsDraft) — the real, apples-to-apples
  // comparison this needs, not a re-derivation of either side.
  const draftDiff = React.useMemo(
    () => computeDraftDiff(draftableCaseSlice as any, existingDraftPayload as any),
    [draftableCaseSlice, existingDraftPayload],
  );

  // ── Voice context activation ────────────────────────────────────────────────
  // This page — the entire SynopticReportPage tree, including whatever's
  // rendered while filling out a Grossing-flavored synoptic instance —
  // never called setCurrentContext at all. Worth being precise about
  // what was actually wrong: it's not that REPORTING-category commands
  // were built and dormant — checked directly, zero live SystemAction
  // records anywhere use category 'REPORTING'. The real 24 actions
  // already built for this page use category 'SYNOPTIC', which wasn't
  // even in the VOICE_CONTEXT enum until this fix. Whatever context the
  // previous page (almost always Worklist) last set just stayed stuck
  // the entire time anyone was on this page — same one-line pattern
  // every other page already uses, just never added to this one.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.SYNOPTIC);
    return () => { mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, []);

  const [isLoaded, setIsLoaded]     = useState(false);
  const [caseNotFound, setCaseNotFound] = useState(false);
  const [activeTab, setActiveTab]       = useState('tumor');
  const { isDirty: hasUnsavedData, setDirty: setHasUnsavedData, pendingPath, confirmNavigate: confirmContextNavigate, cancelNavigate: cancelContextNavigate, registerSaveHandler, registerDiscardHandler } = useDirtyState();
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());

  const markDirty = React.useCallback((section: string) => {
    setHasUnsavedData(true);
    setDirtySections(prev => new Set(prev).add(section));
  }, [setHasUnsavedData]);

  // Phase 2 (Step B) restore handler -- local-only, no auto-persist (see
  // the hook-setup block above for why). Marks a single generic section
  // dirty rather than trying to detect exactly which of this page's 18
  // dirty-able things changed -- matches the simplified (non-diffing)
  // recovery design.
  const handleRestoreDraft = useCallback(() => {
    if (!caseData || !existingDraftPayload) return;
    // Real fix, per direct report: "draft not persistent (lost on
    // navigation/refresh)." __orchSectionsDraft isn't a real Case field
    // — pulled out separately here and applied via setOrchSections,
    // rather than spread into caseData where it would just become a
    // stray, meaningless property.
    const { __orchSectionsDraft, ...caseFields } = existingDraftPayload as any;
    setCaseData({ ...caseData, ...caseFields } as typeof caseData);
    if (Array.isArray(__orchSectionsDraft)) setOrchSections(__orchSectionsDraft);
    markDirty('Restored draft');
    confirmRestore();
  }, [caseData, existingDraftPayload, markDirty, confirmRestore]);

  const clearDirty = React.useCallback(() => {
    setHasUnsavedData(false);
    setDirtySections(new Set());
  }, [setHasUnsavedData]);

  // Lets FlagManagerModal/CaseTeamModal (and similar action-modals)
  // report their own local draft's dirty state into the SAME
  // dirtySections mechanism content fields already use -- critical that
  // this ADDS/REMOVES just its own named entry and recomputes
  // hasUnsavedData from the total remaining set, rather than blindly
  // setting true/false, otherwise closing a clean modal could wrongly
  // clear a warning that's still legitimately active for an unrelated
  // dirty content field.
  const setSectionDirty = React.useCallback((section: string, dirty: boolean) => {
    setDirtySections(prev => {
      const next = new Set(prev);
      dirty ? next.add(section) : next.delete(section);
      setHasUnsavedData(next.size > 0);
      return next;
    });
  }, [setHasUnsavedData]);

  // Stable references for the two action-modals below (FlagManagerModal,
  // CaseTeamModal) — a real, confirmed bug, not a style nit: these were
  // previously inline arrow functions created fresh on every render.
  // FlagManagerModal's own dirty-tracking useEffect has onDirtyChange in
  // its dependency array, so a fresh reference every render meant that
  // effect re-firing -> calling back into setSectionDirty -> this
  // component re-rendering -> a new onDirtyChange reference -> the
  // effect re-firing again, forever. Confirmed via live reproduction:
  // "Maximum update depth exceeded" thrown directly from
  // FlagManagerModal, with the modal's DOM elements continuously
  // detaching/remounting under the load. This is almost certainly the
  // real root cause behind the reported Flag Manager save/discard bug —
  // a component stuck re-rendering in a tight loop cannot reliably
  // process a click or keep its own state consistent.
  const handleFlagsDirtyChange = React.useCallback(
    (dirty: boolean) => setSectionDirty('Flags', dirty), [setSectionDirty]);
  const handleTeamDirtyChange = React.useCallback(
    (dirty: boolean) => setSectionDirty('Team', dirty), [setSectionDirty]);

  const [activeSpecimenId, setActiveSpecimenId] = useState<string>('');
  const [showCaseCommentModal, setShowCaseCommentModal] = useState(false);
  const [showRetentionHoldModal, setShowRetentionHoldModal] = useState(false);
  const [showCaseHoldModal, setShowCaseHoldModal] = useState(false);
  const [showSpecimenCommentModal, setShowSpecimenCommentModal] = useState(false);
  const [activeSpecimenCommentId, setActiveSpecimenCommentId] = useState<string>('');
  const caseComments: CaseComment[] = useMemo(() => (caseData as any)?.order?.caseComments ?? [], [caseData]);
  const hasCaseComment = caseComments.length > 0;
  // Fixed June 2026 — this used to be its own useState<Record<string,string>>,
  // never actually populated from caseData and never persisted anywhere,
  // meaning specimen comments didn't survive so much as a page refresh.
  // Derived directly from the real Specimen.comment field instead of
  // parallel state that could drift from it.
  const specimenComments = useMemo(() => {
    const map: Record<string, CaseComment[]> = {};
    (caseData?.specimens ?? []).forEach((sp: any) => { map[sp.id] = sp.comments ?? []; });
    return map;
  }, [caseData?.specimens]);

  // ── Fixation-time signout gate ──────────────────────────────────────────────
  const { dictionary: specimenDictionary } = useSpecimenDictionary();
  const [fixativeGateSpecimens, setFixativeGateSpecimens] = useState<FixativeGateSpecimen[] | null>(null);
  // Remembers what finalizeCase was originally called with, so once the
  // gate is resolved we can retry with the exact same arguments rather
  // than losing e.g. which synoptic instances were excluded.
  const [pendingFinalizeArgs, setPendingFinalizeArgs] = useState<string[]>([]);

  // ── Priority editing ─────────────────────────────────────────────────────────
  // Closes a real gap: priority was set once at Accession with no edit
  // mechanism anywhere else in the app. Gated off once the case is
  // finalized/closed — changing urgency no longer means anything once a
  // case is signed out.
  const [priorityLevels, setPriorityLevels] = useState<{ id: string; label: string; colorHint: string }[]>([]);
  useEffect(() => {
    priorityService.getAll().then(res => { if (res.ok) setPriorityLevels(res.data.filter(p => p.isActive)); });
  }, []);
  const canEditPriority = caseData && caseData.status !== 'finalized' && caseData.status !== 'closed';
  const handleChangePriority = useCallback(async (newPriority: string) => {
    if (!caseData?.id) return;
    const patch = { order: { ...caseData.order, priority: newPriority as any } };
    try {
      await caseRouter.updateCase(caseData.id, patch as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, ...patch } as typeof prev) : prev);
      markDirty('Priority');
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        return;
      }
      console.error('[Priority] Failed to persist:', e);
    }
  }, [caseData, markDirty]);

  // ── Deficiency history ──────────────────────────────────────────────────────
  // getByCaseId() already existed on ISpecimenDeficiencyService with zero
  // UI ever calling it — both this page and Accession only ever wrote
  // deficiency records, never read them back. Fetched once the case
  // loads; deliberately not re-fetched on every render since deficiency
  // history for an already-loaded case doesn't change from anything this
  // page itself does (both pages only write at accession/sign-out time).
  const [caseDeficiencies, setCaseDeficiencies] = useState<SpecimenDeficiency[]>([]);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [resolutionTypes, setResolutionTypes] = useState<ResolutionType[]>([]);
  const [showDeficiencyModal, setShowDeficiencyModal] = useState(false);
  // Real fix, Phase 5: real version history — see VersionHistoryModal.tsx's
  // own header comment. Fetched on real case load (for the chip's initial
  // count) AND re-fetched whenever the modal opens (for freshness) - unlike
  // deficiencies above, THIS page is itself the real source of new versions
  // (every sign-out/amendment release creates one), so a load-time-only
  // fetch would miss a version created earlier in the current session.
  const [caseVersions, setCaseVersions] = useState<ReportVersionRecord[]>([]);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  // Real feature, per direct follow-up: "decant-level linking UI. In
  // the same UI we add specimens, blocks stains, protocols?" Real,
  // simple, id-based sibling to focusedBlockIndex — a decant never
  // needed the same index-based next/previous voice-command
  // navigation blocks have, so a plain id is enough.
  const [focusedDecantId, setFocusedDecantId] = useState<string | null>(null);
  useEffect(() => {
    if (!caseData?.id) return;
    specimenDeficiencyService.getByCaseId(caseData.id).then(res => { if (res.ok) setCaseDeficiencies(res.data); });
  }, [caseData?.id]);
  useEffect(() => {
    if (!caseData?.id) return;
    reportVersionService.getByCaseId(caseData.id).then(res => { if (res.ok) setCaseVersions(res.data); });
  }, [caseData?.id, showVersionHistoryModal]);
  useEffect(() => {
    deficiencyTypeService.getAll().then(res => { if (res.ok) setDeficiencyTypes(res.data); });
    resolutionTypeService.getAll().then(res => { if (res.ok) setResolutionTypes(res.data); });
  }, []);

  const [showAddSynopticModal,  setShowAddSynopticModal]  = useState(false);
  const [showSpecimenEdit,      setShowSpecimenEdit]      = useState(false);
  const [showCreateBiopsyArrayModal, setShowCreateBiopsyArrayModal] = useState(false);
  // Real, architectural fix, per direct follow-up: "the matrix block
  // itself is the tracked asset." Renamed from
  // editingBiopsyArrayCassetteId — now holds the real, internal
  // MatrixBlock.id, not the human-typed cassette label (those are
  // separate fields now; see types/case/MatrixBlock.ts).
  const [editingMatrixBlockId, setEditingMatrixBlockId] = useState<string | null>(null);
  // Real, separate state for the new, real status/piece editor
  // (MatrixBlockEditorModal.tsx) — distinct from editingMatrixBlockId
  // above, which drives the membership editor (CreateBiopsyArrayModal
  // in edit mode). Opening the status/piece editor doesn't imply
  // editing membership, and vice versa.
  const [viewingMatrixBlockId, setViewingMatrixBlockId] = useState<string | null>(null);
  const [editingSpecimen,       setEditingSpecimen]        = useState<import('@/types/case/Specimen').Specimen | null>(null);
  const [showAddOrdersModal,    setShowAddOrdersModal]     = useState(false);
  const [addOrdersInitialTab,   setAddOrdersInitialTab]     = useState<OrderTab | undefined>(undefined);

  const { toastMsg, toastVisible, showToast } = useSynopticToast();

  const {
    sendMaterialOrderToLis,
    sendSynopticReportToLis,
    handleSendStainOrder,
    showCopilotReportView, setShowCopilotReportView,
    pendingLisNotice, setPendingLisNotice,
    handleMarkReviewedNoChanges,
    simulateLisAmendmentReceived,
    simulateBlockExceptionReceived,
    simulateMaterialLocationReceived,
    simulateCassetteDispatchOutcomeReceived,
    simulateFullMaterialTreeLocationUpdate,
    copilotReportInstances,
    openCopilotReportView,
  } = useLisIntegration({ caseData, setCaseData, signingUser, showToast });

  // Real fix, per direct follow-up: "the tracking event should occur
  // no matter what page your on in pathscribe, just need access to
  // the NavBar Scan." The real scan-matching/dispatch logic moved to
  // useGlobalMaterialScanTracking.ts, mounted once at the app root
  // (MaterialScanTrackingBridge, App.tsx) — never tied to this page
  // being open at all. This page only listens for that hook's own
  // real "a scan just updated some case's material" notification and
  // refreshes + shows a toast when — and only when — it's genuinely
  // about the exact case currently open here; a scan tracked while
  // viewing a different case (or no case at all) correctly does
  // nothing on this page.
  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ caseId: string; targetDescription: string; stationName: string }>).detail;
      if (!detail || !caseData || detail.caseId !== caseData.id) return;
      caseRouter.getCase(caseData.id).then(refreshed => {
        if (refreshed) setCaseData(refreshed);
      });
      showToast(`📍 ${detail.targetDescription} scanned at "${detail.stationName}" — location updated and sent to the engine.`);
    };
    window.addEventListener(MATERIAL_SCAN_UPDATED_EVENT, listener);
    return () => window.removeEventListener(MATERIAL_SCAN_UPDATED_EVENT, listener);
  }, [caseData, setCaseData, showToast]);

  // Real fix, per direct follow-up: "I would like to support both
  // slide engraving and printed labels." Resolved here, once, and
  // passed into useSpecimenBlockManagement as a plain value — see
  // that hook's own UseSpecimenBlockManagementParams doc comment for
  // why useSpecimenBlockManagement itself never calls
  // useEffectiveScanStation() directly.
  const { effectiveStationId } = useEffectiveScanStation();

  const {
    allBlocks,
    allDecants,
    setFocusedBlockIndex,
    focusedBlockEntry,
    handleAdvanceFocusedBlockStatus,
    handleConfirmTriage,
    handleUpdateBlock,
    handleCancelBlock,
    handleCreateSpareSlide,
    handleOrderRestain,
    handleAddBlock,
    handleReleaseGrossingBlocks,
    handleRemovePendingBlock,
    handleAddDecant,
    handleUpdateDecant,
    handleCreateBiopsyArray,
    handleUpdateBiopsyArray,
    handleDissolveBiopsyArray,
    handleUpdateMatrixBlock,
    printCassetteForBlock,
    printMatrixCassette,
    printSlideForStain,
    handleBatchPrintSlides,
    handleBatchPrintCassettes,
    batchPrintBlocked,
    pendingCassetteVerification,
  } = useSpecimenBlockManagement({
    caseData, setCaseData, signingUser, markDirty, knownVersionRef,
    setConcurrencyConflict, sendMaterialOrderToLis, showToast,
    effectiveStationId,
  });

  // Real feature, per direct follow-up: "proceed with the decant
  // container label." Defined here (not inside useSpecimenBlockManagement)
  // since it's purely a print action with no case-state mutation —
  // same real reasoning as the existing onReprintContainer handler a
  // few hundred lines below, just promoted to a real, named,
  // reusable handler since BlockStainEditorModal.tsx's own decant
  // card needs it directly, not only ManageReprintsModal.
  const handlePrintDecantContainerLabel = useCallback(async (specimenId: string, decantId: string) => {
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find(s => s.id === specimenId);
    const decant = specimen?.decants?.find(d => d.id === decantId);
    if (!specimen || !decant) return;
    const ok = await printDecantContainerLabel(caseData, specimen.label, specimen.description, decant);
    if (!ok) showToast(`Failed to print container label for decant ${specimen.label}${decant.label}.`);
  }, [caseData, showToast]);


  // ── Voice action execution — moved further down in this file, see the ──────
  // ── comment at its new location for why (allBlocks/handleAdvanceFocused- ──
  // ── BlockStatus/handleConfirmTriage were fine here, but this listener ──────
  // ── now also needs openFlagManager, showTeamModal, etc., which aren't ──────
  // ── declared until much later). ──────────────────────────────────────────

  const [activeReportInstanceId, setActiveReportInstanceId] = useState<string>('');
  const [activeReportType, setActiveReportType] = useState<'grossing' | 'microscopic' | 'synoptic'>('synoptic');
  const [isAlertExpanded, setIsAlertExpanded] = useState(false);
  const [isSimilarCasesOpen, setIsSimilarCasesOpen] = useState(false);
  const [showCodesModal, setShowCodesModal] = useState(false);
  // Real feature, per direct follow-up: "Move Manage Reprints...
  // Bottom-Right Action Cluster... removes the visual orphaning of
  // the current Manage Reports button." Lifted here from
  // MaterialTreePanel.tsx — a global, always-available case action in
  // BottomActionBar.tsx now, not something that only existed while
  // the Material tab happened to be open.
  const [showReprintModal, setShowReprintModal] = useState(false);
  // Real fix: which specimen (if any) the codes modal should be
  // pre-targeted at - set when opened via a specimen's own contextual
  // "+Code" button, null when opened via the general "Codes" toolbar
  // button (case-level default, unchanged existing behavior).
  const [codesModalTargetSpecimenIndex, setCodesModalTargetSpecimenIndex] = useState<number | null>(null);
  // User-manual toggle for HeaderBar's compact mode -- see the render's
  // own comment for why this shares the existing compact render path
  // rather than building a new shrink mechanism from scratch. Sticky
  // (persists across cases/sessions via localStorage) since this is a
  // display preference, not clinical data -- matches the pathscribe_*
  // naming convention so it's correctly caught by the existing Demo
  // Reset prefix catch-all.
  const [isHeaderCompactManual, setIsHeaderCompactManual] = useState<boolean>(() => {
    try { return localStorage.getItem('pathscribe_header_compact_manual') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('pathscribe_header_compact_manual', isHeaderCompactManual ? '1' : '0'); } catch {}
  }, [isHeaderCompactManual]);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  // Honest signal for when the AI's cited source couldn't actually be
  // located in the report text — see LeftReportPanel's matchResult.
  const [highlightNotFound, setHighlightNotFound] = useState(false);
  const [worklistCases, setWorklistCases] = useState<string[]>([]);
  const [worklistIndex, setWorklistIndex] = useState(0);
  const [alertFieldId, setAlertFieldId] = useState<string | null>(null);
  const [availableProtocols, setAvailableProtocols] = useState<{id:string;name:string}[]>([]);
  const [pendingNavigation,  setPendingNavigation]  = useState<string | null>(null);
  // For orchestration mode: tab switch that needs unsaved-draft confirmation
  const [pendingTabSwitch,   setPendingTabSwitch]   = useState<string | null>(null);
  const [showDelegateModal, setShowDelegateModal]   = useState(false);
  const [delegateReturnTo,  setDelegateReturnTo]    = useState<'team' | null>(null);
  const [showTeamModal,     setShowTeamModal]       = useState(false);

  // computationalFlags / refreshCompFlags removed along with the
  // Computational tab — this function only ever fed the flag catalog
  // list and a preliminary case fetch, both now unnecessary; the real
  // case load happens right after, in the effect below.

  // ── Left panel tab + Orchestrator state ───────────────────
  const [leftTab, setLeftTab] = useState<'draft' | 'sequencer' | 'report' | 'material'>('report');
  const [showSequencer, setShowSequencer] = useState(false);
  // Real fix, per direct follow-up: "we are not displaying all the
  // available buttons in the synoptic report page." Confirmed
  // directly, live: with a third dev-only Sim button added
  // (Sim Block Exception), the row of Sim buttons + Sequencer
  // genuinely overflowed the tabbar's available width — the last
  // button(s) were visually clipped at the panel boundary, not just
  // scrolled out of reach. Consolidating every dev-only Sim trigger
  // into one compact dropdown fixes this now and scales cleanly as
  // more get added later — the row only ever has one, fixed-width
  // trigger regardless of how many simulations exist behind it.
  const [showDevToolsMenu, setShowDevToolsMenu] = useState(false);
  // Real fix, per direct report, screenshots in hand: "when selecting
  // Dev Tools, its items are hidden behind the left pane." Confirmed
  // directly: a real regression from this same session's own earlier
  // fix — .ps-syn-tabbar (this button's own ancestor) picked up
  // overflow-y: hidden there to stop the tabbar's content bleeding
  // horizontally into the adjacent pane, but that same rule clips
  // ANY child that needs to visually extend past the tabbar's own
  // short height — including this dropdown, which opens downward
  // below its trigger button. Same real "portal to document.body so
  // it renders outside the [ancestor's] stacking context" pattern
  // NavBar.tsx's own system-info modal already uses — but a portaled
  // dropdown loses the position:absolute/top:100% trick that anchored
  // it to its trigger via CSS alone, so its real screen position has
  // to be computed here instead, from the trigger button's own
  // getBoundingClientRect() at the moment it opens.
  const devToolsBtnRef = useRef<HTMLButtonElement>(null);
  const [devToolsMenuPos, setDevToolsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('ps_sidebar_collapsed') === 'true'
  );

  // Orchestration mode = PathScribe owns the report.
  // CoPilot mode = LIS owns the report; PathScribe feeds structured data back.
  // Orchestration mode = PathScribe owns the report (Outreach/O26- cases).
  // Real fix, per direct follow-up: "the case prefix can't determine
  // assist vs. orchestration case, we need to use a real flag."
  // Confirmed directly: reportingModeRouting.ts's own header comment
  // already establishes that Case.reportingMode is the real,
  // authoritative field — isOrchCaseId() (the id-prefix check) is
  // narrowly justified ONLY for CaseRouter's own routing problem
  // (which backend to even ask, before the case object exists to read
  // a field from at all) — never a substitute for the real field once
  // the case object is actually loaded, which it already is here.
  // Same real "no reportingMode must NOT default to orchestration
  // mode" safety this line's own prior comment already established —
  // a genuinely undefined/missing reportingMode (a real, older or
  // LIS-owned record) stays Assist mode, never guessed otherwise.
  const isOrchestrationMode = caseData?.reportingMode === 'orchestrator';

  // ── Three-column Orchestration layout state ─────────────────────────────────
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // ── User-configurable tab width — persisted across sessions ────────────────
  const [tabWidthChars, setTabWidthChars] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pathscribe-tab-width');
      return saved ? parseInt(saved, 10) : 4;
    } catch { return 4; }
  });
  const handleTabWidthChange = useCallback((chars: number) => {
    setTabWidthChars(chars);
    try { localStorage.setItem('pathscribe-tab-width', String(chars)); } catch { /* ignore */ }
  }, []);

  // ── Print the formatted centre pane report ───────────────────────────────
  // handleOrchPrint itself is defined further down, after orchSections,
  // resolvedContext, resolvedTemplateName, resolvedBy, and showToast are
  // all declared — it depends on every one of them, so it can't live here
  // (its dependency array would reference consts not yet initialized in
  // this render pass).

  useEffect(() => {
    localStorage.setItem('ps_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // LIS cases must never show the draft tab — reset if somehow set
  useEffect(() => {
    if (!isOrchestrationMode && leftTab === 'draft') setLeftTab('report');
  }, [isOrchestrationMode, leftTab]);
  
  // orchSections itself now declared earlier, alongside draftableCaseSlice
  // above, which needs it — see that block's own comment for why.
  // Holds the StructuredContext from the most recent buildContext() call —
  // ReportPreviewRenderer needs narrativeTemplate.bodyAssembly (the real
  // Parts/Assembly tree) and synoptic.answers to render the structural body
  // Parts that orchSections never carried (see contextBuilder.ts /
  // ReportPreviewRenderer.tsx changes). Previously this was a disposable
  // local variable inside handleGenerateReport — those Parts had nowhere
  // to be read from after the function returned.
  const [resolvedContext, setResolvedContext] = useState<StructuredContext | null>(null);

  // Must be after isOrchestrationMode, leftTab, hasUnsavedData AND orchSections
  const safeSetLeftTab = React.useCallback((tab: string) => {
    if (
      isOrchestrationMode &&
      leftTab === 'draft' &&
      hasUnsavedData &&
      orchSections.some(s => s.text)
    ) {
      setPendingTabSwitch(tab);
    } else {
      setLeftTab(tab as any);
    }
  }, [isOrchestrationMode, leftTab, hasUnsavedData, orchSections]);

  // Real fix: 'latest ref' for safeSetLeftTab - a real, genuine
  // stale-closure bug was found here: the PATHSCRIBE_JUMP_TO_FIELD
  // handler below (mount-only, deliberately empty deps, since it's a
  // global window listener that shouldn't tear down/re-subscribe on
  // every render) was calling safeSetLeftTab directly, capturing
  // whatever hasUnsavedData/leftTab/orchSections values were true at
  // MOUNT time - meaning a user with real, unsaved changes jumping to
  // a field later could silently skip the "confirm before switching
  // tabs" warning safeSetLeftTab exists to provide. This ref is kept
  // current by a real, but cheap, effect (just a ref assignment, not a
  // global listener re-subscription) so the handler always calls the
  // real, latest version.
  const safeSetLeftTabRef = React.useRef(safeSetLeftTab);
  React.useEffect(() => { safeSetLeftTabRef.current = safeSetLeftTab; }, [safeSetLeftTab]);

  const {
    saveDraftInternal,
    handleSectionTextChange,
    handleAcceptSection,
    handleAcceptDraft,
    handleKeepVersion,
    handleAcceptAllSections,
  } = useOrchestratorDraft({
    caseData, setCaseData, caseId, orchSections, setOrchSections,
    activeSectionId, setActiveSectionId, isOrchestrationMode, leftTab,
    knownVersionRef, setConcurrencyConflict, clearDirty, discardDraft, showToast,
  });

  // Real fix, per direct follow-up: "1. Save & Switch: Flushes
  // pending dictation/synoptic data to Station 2, then updates
  // workspace to Station 3." Registers the exact same real
  // saveDraftInternal() every other real save trigger on this page
  // already uses — a global handler with zero page-specific
  // knowledge (useGlobalStationSwitch.ts) can call whatever's
  // currently registered here without needing to know this page, or
  // this save function, exist at all. Unregisters on unmount so a
  // scan that arrives after navigating away from this page correctly
  // finds nothing registered (matching isDirty itself also resetting
  // whenever nothing owns it).
  useEffect(() => {
    registerSaveHandler(saveDraftInternal);
    return () => registerSaveHandler(null);
  }, [registerSaveHandler, saveDraftInternal]);

  // Real feature, per direct follow-up: "2. Discard & Switch: Clears
  // uncommitted entries and switches context." Same real
  // registration as the save handler above, for the real, existing
  // discardDraft() (useDraftCache.ts) — see registerSaveHandler's own
  // comment for the full reasoning.
  useEffect(() => {
    registerDiscardHandler(discardDraft);
    return () => registerDiscardHandler(null);
  }, [registerDiscardHandler, discardDraft]);


  const [_resolvedTemplateId,   setResolvedTemplateId]   = useState<string>('tmpl-gold-standard');
  // _resolvedTemplateId is write-only — setResolvedTemplateId is called
  // twice elsewhere with real, deliberately-resolved data
  // (ctx.narrativeTemplate.templateId), but the value itself is never
  // read anywhere in this file. Flagged as a likely real gap (this looks
  // like it should feed into which physical report template renders, or
  // the print/PDF flow) rather than silently deleted.
  const [resolvedTemplateName, setResolvedTemplateName] = useState<string>('Gold Standard — General Surgical Pathology');
  const [resolvedBy,           setResolvedBy]           = useState<string>('gold-standard');
  const [overrideTemplateId,   setOverrideTemplateId]   = useState<string | null>(null);

  // ── Auto-resolve StructuredContext on load ──────────────────────────────
  // Bug found in testing: bodyAssembly (which gates whether the report
  // preview/print shows anything) previously only got populated by
  // clicking "Generate Report" in the current session. But orchSections
  // (AI text) can also arrive via the restoration effect above, from a
  // PRIOR session — so a case could have real generated text sitting in
  // orchSections while bodyAssembly was still empty, showing "No report
  // sections yet" despite there being content. Resolving context as soon
  // as the case loads — independent of AI generation — fixes that, and is
  // also the architecturally correct behaviour: most body Parts
  // (demographics, specimens, sign-off) are auto-populated from data and
  // were never meant to be gated behind an AI-generation button at all.
  useEffect(() => {
    if (!caseData || !isOrchestrationMode) return;
    let cancelled = false;
    buildContext(caseData, signingUser, overrideTemplateId || undefined)
      .then(ctx => {
        if (cancelled) return;
        setResolvedContext(ctx);
        // Only set these on initial load if generation hasn't already run
        // this session — don't clobber a result handleGenerateReport just
        // produced with the same auto-resolve values.
        setResolvedTemplateId(prev => prev === 'tmpl-gold-standard' ? ctx.narrativeTemplate.templateId : prev);
        setResolvedTemplateName(curr =>
          curr === 'Gold Standard — General Surgical Pathology' ? ctx.narrativeTemplate.templateName : curr
        );
      })
      .catch(e => {
        if (!cancelled) console.warn('Auto-resolve of StructuredContext failed on load:', e);
      });
    return () => { cancelled = true; };
    // caseData.id (not the whole object) — caseData can get new object
    // identity on unrelated updates without this needing to re-resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.id, isOrchestrationMode, overrideTemplateId]);

  // ── Centre pane header state — template picker, lifted here so it can be
  //    shared between both layout instances (primary + expanded) ───────────
  const [centreTemplates, setCentreTemplates] = useState<{ id: string; name: string; specialty?: string }[]>([]);
  const [showCentreTemplatePicker, setShowCentreTemplatePicker] = useState(false);
  useEffect(() => {
    import('@/services/reportTemplates/mockReportTemplateService').then(({ mockReportTemplateService }) => {
      (mockReportTemplateService as any).getAll?.().then((r: any) => {
        if (r?.ok) setCentreTemplates(r.data ?? []);
      }).catch(() => {});
    });
  }, []);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);

  // ── Dirty-state timing guards ──────────────────────────────────────────
  // Track when hasUnsavedData first becomes true relative to case load.
  // Changes that fire within 1200 ms of load are from component initialisation
  // (e.g. RightSynopticPanel seeding form values) — not real user edits.
  const caseLoadedAt = React.useRef<number>(Date.now());
  const dirtySetAt   = React.useRef<number | null>(null);

  // AI suggestions lifted from RightSynopticPanel
  const [aiSuggestions,        setAiSuggestions]        = useState<Record<string, AiSuggestion>>({});
  // Computational Results was deliberately replaced by Biomarkers — this
  // state, and its downstream usages (the generateAiSuggestionsForReport
  // call, a useCallback dependency, and a prop passed to
  // RightSynopticPanel), were all leftover from the superseded feature,
  // permanently stuck at {} since nothing ever populated it. Removed
  // rather than left as dead weight — generateAiSuggestionsForReport's
  // own computationalResults parameter is optional, so omitting it here
  // entirely is safe and doesn't change what the AI suggestion flow
  // actually does today.

  // ── AI Synthesis Status — fed to HeaderBar's badge ───────────────────────
  // SHORT-TERM SAFE FALLBACK, per Dr. Carter's review: a true tiered
  // "floor" model (Tier 1 diagnosis/staging fields gating the badge,
  // Tier 2/3 not) is the right long-term design — but classifying tiers by
  // regex-matching field ID strings (the only metadata AiSuggestion
  // carries today) is a silent-failure risk: an unexpected ID like
  // `txt_tmr_typ_01` would slip past the patterns and a genuinely critical
  // field could fail to gate the badge. That's worse than the flat-average
  // bug this whole thing started as fixing.
  //
  // Until tier classification is sourced from the real CAP eCC template
  // schema (EditorField/EditorSection's actual "Must Have" / required
  // metadata — the same schema RightSynopticPanel renders from, not
  // available in this file), the badge uses a deliberately conservative
  // binary rule instead: ANY field below the confidence threshold trips
  // the warning, regardless of which field it is. Over-warning is the
  // correct failure mode here, not over-assuring.
  //
  // TODO (long-term fix): once tier metadata is wired in from the CAP
  // schema, replace this with real floor logic restricted to Tier 1
  // fields, matching the design discussed but not shipped here.
  //
  // Real fix, found via a direct audit: this used to hardcode
  // REVIEW_THRESHOLD = 80 as its own, second, independently-maintained
  // copy of the confidence threshold, separate from the one
  // RightSynopticPanel.tsx actually uses to decide which AI suggestions
  // are "above threshold" (which defaults to 75, not 80, and is loaded
  // from the real, admin-configurable aiBehaviorService — Config > AI
  // Provider Settings). The two were already disagreeing by default,
  // not just at risk of drifting apart later — the exact class of
  // duplicated-constant bug the O26- prefix had. Now loaded from the
  // same real source, same default fallback, so the two can't
  // independently disagree anymore.
  const [reviewThreshold, setReviewThreshold] = React.useState(75);
  React.useEffect(() => {
    aiBehaviorService.get().then(res => {
      if (res.ok) setReviewThreshold(res.data.confidenceThreshold ?? 75);
    }).catch(() => {});
  }, []);

  const REVIEW_THRESHOLD = reviewThreshold;

  const aiSynthesisStatus = React.useMemo<AiSynthesisStatus>(() => {
    const entries = Object.entries(aiSuggestions)
      .filter((e): e is [string, AiSuggestion] => typeof e[1]?.confidence === 'number');
    if (entries.length === 0) return { state: 'none' };

    const overallConfidence = Math.round(
      entries.reduce((sum, [, s]) => sum + s.confidence, 0) / entries.length
    );

    // ROOT FIX — this previously flagged the lowest-confidence field
    // across ALL suggestions regardless of verification status, so a
    // field the pathologist had already confirmed or overridden (e.g.
    // via a Delta-table override during an amendment, which sets
    // verification: 'disputed') kept triggering "Review Pending"
    // forever based on its original, now-irrelevant AI confidence
    // score. Only fields still genuinely 'unverified' — i.e. actually
    // pending review — should be able to trip this.
    const unreviewed = entries.filter(([, s]) => s.verification === 'unverified');

    let flagged: [string, AiSuggestion] | null = null;
    for (const entry of unreviewed) {
      if (!flagged || entry[1].confidence < flagged[1].confidence) flagged = entry;
    }

    const state: AiSynthesisStatus['state'] =
      flagged && flagged[1].confidence < REVIEW_THRESHOLD ? 'review-required' : 'draft-ready';

    return {
      state,
      overallConfidence,
      flaggedFieldId: flagged?.[0],
      flaggedFieldConfidence: flagged?.[1].confidence,
    };
  }, [aiSuggestions, REVIEW_THRESHOLD]);

  // "Unpacking" — clicking the badge in a 'review-required' state jumps
  // straight to the Tier 1 field that dragged the status down, reusing the
  // same scrollToField mechanism RightSynopticPanel already exposes (see
  // alertFieldId below) rather than building a second navigation path.
  const handleAiStatusReviewClick = React.useCallback(() => {
    if (!aiSynthesisStatus.flaggedFieldId) return;
    safeSetLeftTab('report');
    setAlertFieldId(aiSynthesisStatus.flaggedFieldId);
  }, [aiSynthesisStatus.flaggedFieldId, safeSetLeftTab]);


  useEffect(() => {
    if (!caseId) return;

    // Reset dirty-timing refs for each fresh case load
    caseLoadedAt.current = Date.now();
    dirtySetAt.current   = null;

    // ── Worklist for Previous / Next ──────────────────────────
    if (routerWorklistIds.length > 0) {
      // Arrived via case-to-case navigation (prev/next already carried the list)
      setWorklistCases(routerWorklistIds);
      setWorklistIndex(routerWorklistIds.indexOf(caseId));
    } else if (navSource === 'search') {
      // Arrived from Search results — use the saved search result order
      try {
        const searchIds: string[] = JSON.parse(
          sessionStorage.getItem('pathscribe:searchResultIds') ?? '[]'
        );
        if (searchIds.length > 0) {
          setWorklistCases(searchIds);
          setWorklistIndex(searchIds.indexOf(caseId ?? ''));
        }
      } catch { /* malformed storage — ignore */ }
    } else {
      // Arrived from regular Worklist
      caseRouter.listCasesForUser('current').then((cases: any[]) => {
        const ids = cases.map((c: any) => c.id);
        setWorklistCases(ids);
        setWorklistIndex(ids.indexOf(caseId));
      }).catch(() => {});
    }

    setHasUnsavedData(false);
    caseRouter.getCase(caseId).then(c => {
      if (!c) { setCaseNotFound(true); setIsLoaded(true); return; }
      setCaseData(c);
      knownVersionRef.current = (c as any).version ?? 0;
      // Real fix: records the real, genuine first-open moment for the
      // FIRST_TOUCH TAT calculation (components/Contribution/
      // qualityCalculations.ts) - idempotent, only ever set once. Fire-
      // and-forget: this shouldn't block the case from opening, and a
      // failed write here just means one case's first-touch metric is
      // missing, not a broken load. Updates knownVersionRef so a real
      // edit made later in this same session isn't rejected against a
      // version this write has already advanced past.
      if (!(c as any).firstOpenedAt) {
        caseRouter.updateCase(caseId, { firstOpenedAt: new Date().toISOString() } as any, knownVersionRef.current)
          .then(() => { knownVersionRef.current = knownVersionRef.current + 1; })
          .catch(() => {});
      }
      if (c.specimens?.length) setActiveSpecimenId(c.specimens[0].id);
      // Real fix, per direct spec: a case still at the grossing stage
      // should default to showing its already-assigned Grossing
      // report in the right panel — not the diagnostic Synoptic
      // template picker, which was the previous, unconditional
      // default regardless of the case's actual stage. Checked
      // directly: this effect only ever looked at synopticReports,
      // never grossingReports, so a case with zero synoptic reports
      // but a real, unfinished grossing report (exactly the state a
      // freshly-accessioned case is in) fell through to the
      // hardcoded activeReportType default ('synoptic') and an empty
      // activeReportInstanceId, landing on "no template attached"
      // instead of the grossing work actually waiting to be done.
      // Mirrors hasUnfinishedGrossing's own definition elsewhere in
      // this codebase (BottomActionBar.tsx) for consistency.
      //
      // Real, genuine gap found in that same fix via direct report,
      // screenshots in hand: it only ever covered a DRAFT grossing
      // report. A case already at Gross Complete (every real
      // grossingReports[] entry status: 'finalized') with no
      // synoptic report started yet — the exact state a case sits in
      // right after Grossing wraps up and before a pathologist has
      // picked a diagnostic template — fell through BOTH branches
      // below, landing right back on the unconditional 'synoptic'/''
      // default this fix's own comment above already explains is
      // wrong. Real fix: fall back to the FIRST grossing report
      // (matching the sidebar's own display order) regardless of its
      // status, whenever no synoptic report exists yet — there's
      // real, meaningful content already on the case either way; an
      // empty template picker is never the more useful default over
      // it.
      const unfinishedGrossing = (c.grossingReports ?? []).find(g => g.status === 'draft');
      if (unfinishedGrossing) {
        setActiveReportType('grossing');
        setActiveReportInstanceId(unfinishedGrossing.instanceId);
      } else if (c.synopticReports?.length) {
        setActiveReportInstanceId(c.synopticReports[0].instanceId);
      } else if (c.grossingReports?.length) {
        setActiveReportType('grossing');
        setActiveReportInstanceId(c.grossingReports[0].instanceId);
      }
      // Automatic merge-on-claim check — same "when the formal order
      // finally arrives, look for a match" moment AccessionPage's
      // post-submit check covers, but for the two cases that flow
      // doesn't reach: a case claimed from Pool, or a case opened
      // directly that was never freshly accessioned in this session
      // (e.g. re-opened later, or arrived via FHIR feed rather than
      // manual accessioning). Safe on every load — findMatchesForNewCase
      // only ever returns still-pending entries, so an already-merged
      // match never re-surfaces this prompt.
      {
        const patientFamilyNames = (c as any)?.patient?.familyNames as string | undefined;
        const patientGivenNames  = (c as any)?.patient?.givenNames as string | undefined;
        const patientMrn         = (c as any)?.patient?.mrn as string | undefined;
        const requestingProvider = (c as any)?.order?.requestingProvider as string | undefined;
        const accessionedAt      = (c as any)?.accession?.accessionedAt as string | undefined;
        if (patientFamilyNames && patientGivenNames && patientMrn && accessionedAt) {
          intraoperativeService.findMatchesForNewCase({
            patientName: `${patientFamilyNames}, ${patientGivenNames}`,
            mrn: patientMrn,
            surgeon: requestingProvider ?? '',
            accessionedAt,
          }).then(res => {
            if (res.ok && res.data.length > 0) setIntraopMatch(res.data[0]);
          }).catch(() => {});
        }
      }
      import('@/services/templates/templateService').then(m =>
        m.listTemplates('published').then(templates =>
          setAvailableProtocols(templates.map((t: any) => ({ id: t.id, name: t.name })))
        )
      );
      // Case comments are derived directly from caseData.order.caseComments
      // (a real append-only thread, June 2026 — previously a single string
      // that lived in localStorage and was never actually shared across
      // users/devices) — no separate load-on-mount state to sync here
      // anymore, since there's nothing to keep in sync with.
      // Reopen Patient History modal if navigated back via breadcrumb (?history=1)
      if (new URLSearchParams(window.location.search).get('history') === '1') {
        setIsSimilarCasesOpen(true);
        window.history.replaceState({}, '', window.location.pathname);
      }
      setIsLoaded(true);
    }).catch(() => { setCaseNotFound(true); setIsLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real, honest justification: this effect is deliberately gated on [caseId] alone - it's expensive (loads full case data) and must only re-run when actually navigating to a different case. navSource (a useMemo with its own empty deps, stable forever) and setHasUnsavedData (a stable setter) would both be safe to add individually, but routerWorklistIds (`(location.state as any)?.worklistCaseIds ?? []`) has a genuinely unstable reference - a fresh [] on every render whenever location.state lacks that field - and adding it here risks this case-load effect re-running on every render, not just real case navigation. All three are intentionally read once, at case-load time, not meant to be reactive triggers.
  }, [caseId]);

  // Track when dirty state was first set relative to case load
  React.useEffect(() => {
    if (hasUnsavedData) {
      if (dirtySetAt.current === null) dirtySetAt.current = Date.now();
    } else {
      dirtySetAt.current = null;
    }
  }, [hasUnsavedData]);

  // Returns true only when dirty state originated from a real user edit
  // (not from component initialisation shortly after case load).
  //
  // Real bug found via a direct report: clicking "Previous"/"Next" case
  // incorrectly warned about unsaved changes on a case nobody had
  // touched yet. Traced to this window being too short, not to the
  // case-load reset itself — caseLoadedAt.current IS correctly reset on
  // every caseId change (see the useEffect above), so that part already
  // worked. The actual problem: RightSynopticPanel.tsx's initial-load
  // chain (fetch template detail -> fetch AI suggestions ->
  // apply prefill -> call onCaseUpdate) is a real sequential async
  // chain, and can legitimately take longer than 1200ms to settle —
  // especially case-to-case, where it's competing with the outer case
  // fetch that just fired from the same navigation. When it does, the
  // resulting markDirty() call lands just outside the old window and
  // gets misread as a genuine user edit. Widened to a value that
  // comfortably covers that real chain rather than the bare minimum —
  // still a heuristic, not a deterministic fix (see below), but a
  // meaningfully safer one.
  //
  // The fully robust fix would replace this elapsed-time guess with an
  // explicit "initial load still in flight" flag, set true at
  // navigation start and cleared only once every initialization effect
  // (case load, template load, AI suggestions load) has genuinely
  // settled — not attempted here, flagged as a real follow-up if a
  // slower network ever pushes real initialization past this new
  // window too.
  const shouldWarnDirty = React.useCallback((): boolean => {
    if (!hasUnsavedData) return false;
    const likelyInit = dirtySetAt.current !== null &&
      (dirtySetAt.current - caseLoadedAt.current) < 4000;
    return !likelyInit;
  }, [hasUnsavedData]);

  // ── Hooks ──────────────────────────────────────────────────
  const {
    showFinalizeModal,  setShowFinalizeModal,
    finalizePassword,   setFinalizePassword,
    finalizeError,
    showSignOutModal,   setShowSignOutModal,
    signOutUser,        setSignOutUser,
    signOutPassword,    setSignOutPassword,
    signOutError,
    setCaseSigned,
    showAmendmentModal, setShowAmendmentModal,
    amendmentText,      setAmendmentText,
    amendmentMode,      setAmendmentMode,
  } = useSynopticFinalize();

  // Real countersign feedback capture — local state, deliberately not
  // added to the shared useSynopticFinalize hook since it's specific to
  // this one flow and doesn't need to be shared with other components.
  const [countersignFeedback, setCountersignFeedback] = useState('');

  const {
    showLogoutModal,  setShowLogoutModal,
    isProfileOpen,    setIsProfileOpen,
  } = useSynopticModals();


  // ── Print the formatted centre pane report ───────────────────────────────
  // Calls the render_report Cloud Function (Python/ReportLab) for a real
  // structured PDF, built from the same resolvedContext/orchSections the
  // on-screen preview renders — falls back to the old DOM-print path if
  // the function call fails for any reason. Relocated here (was near the
  // top of the component) because it depends on orchSections,
  // resolvedContext, resolvedTemplateName, resolvedBy, and showToast, none
  // of which exist yet earlier in this render pass.
  const [isPrinting, setIsPrinting] = useState(false);
  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer, closing a known gap flagged in Phase 3's own delivery
  // notes. BottomActionBar.tsx's CoPilot print button was gated to
  // this same restriction; this file's own, separate Orchestration
  // print handler (handleOrchPrint, below) was not — a real,
  // previously-undiscovered second print entry point outside that
  // component's own scope. Same real pattern: fetched only when
  // genuinely relevant (case is pending-release), never a silent
  // block — a real confirmation naming the watermark, not a
  // disabled button with no explanation.
  const [orchPrintRestricted, setOrchPrintRestricted] = useState(false);
  useEffect(() => {
    if (caseData?.status !== 'pending-release') return;
    import('@/services/reportRelease/mockReportReleaseService').then(({ mockReportReleaseService }) =>
      mockReportReleaseService.getOrgDefault().then(res => {
        if (res.ok) setOrchPrintRestricted(res.data.restrictHardcopyPrinting);
      })
    );
  }, [caseData?.status]);
  // Automatic merge-on-claim trigger — unifies "claimed from Pool" and
  // "opened directly" into one check, since PoolClaimModal already
  // navigates here after a successful claim. Set once per case-load
  // (see caseRouter.getCase(...).then(...) below) if a pending intraop
  // entry matches this case's own patient/mrn/surgeon/accession info.
  const [intraopMatch, setIntraopMatch] = useState<EntryMatch | null>(null);

  // Previously an anonymous inline closure on IntraopMergePromptModal's
  // onMergeNow JSX prop. The JSX conditional ({intraopMatch && caseData &&
  // ...}) that used to guarantee both were non-null no longer applies once
  // extracted, hence the explicit guard here.
  const handleIntraopMergeNow = useCallback(async () => {
    if (!intraopMatch || !caseData) return;
    await intraoperativeService.merge(intraopMatch.entry.id, caseData.id, {
      matchType: intraopMatch.matchType,
      confidence: intraopMatch.confidence,
      wasManualOverride: false, // this modal only offers Merge Now / Go to Queue Later / Dismiss — no manual case-ID entry
      performedBy: signingUser?.name ?? 'Unknown User',
    });
    showToast(`Intraoperative entry merged into ${caseData.id}`);
    setIntraopMatch(null);
  }, [intraopMatch, caseData, signingUser, showToast]);

  // Previously an anonymous inline closure on AddOrdersModal's onAddBlock
  // JSX prop — a genuinely separate flow from useSpecimenBlockManagement's
  // handleAddBlock (that one's the Material Tree Panel's direct add; this
  // one is the Add Orders modal's cassette-label + note flow).
  const handleAddBlockWithCassette = useCallback(async (specimenId: string, cassetteLabel: string, note: string) => {
    if (!caseData) return;
    const nowIso = new Date().toISOString();

    // Append to the case-level narrative — this is what actually
    // feeds generateAiSuggestionsForReport and the assembled
    // report document, per the earlier discussion on where this
    // text needs to land to have real downstream effect.
    const existingGross = caseData.diagnostic?.grossDescription ?? '';
    const updatedGross = existingGross ? `${existingGross}\n\n${note}` : note;

    // Mirror into the specimen's own grossing instance too, for
    // local per-specimen context — bump total_cassettes and
    // append the cassette label to cassette_key if the specimen
    // already has a grossing report; append the note to its
    // comments field either way.
    const grossingReports = ((caseData as any).grossingReports ?? []).map((g: any) => {
      if (g.specimenId !== specimenId) return g;
      const prevCount = Number(g.answers?.total_cassettes ?? 0) || 0;
      const prevKey   = g.answers?.cassette_key ?? '';
      return {
        ...g,
        answers: {
          ...g.answers,
          total_cassettes: prevCount + 1,
          cassette_key: prevKey ? `${prevKey}, ${cassetteLabel}` : cassetteLabel,
        },
        comments: g.comments ? `${g.comments}\n${note}` : note,
        updatedAt: nowIso,
      };
    });

    const updated = {
      ...caseData,
      diagnostic: { ...caseData.diagnostic, grossDescription: updatedGross },
      grossingReports,
      updatedAt: nowIso,
    } as any;
    setCaseData(updated);
    try {
      await caseRouter.updateCase(caseData.id, { diagnostic: updated.diagnostic, grossingReports } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        return;
      }
      console.error(e);
    }
    markDirty('Gross description');
    showToast('Block/recut added');
    setShowAddOrdersModal(false);
  }, [caseData, setCaseData, knownVersionRef, setConcurrencyConflict, markDirty, showToast, setShowAddOrdersModal]);

  // Previously an anonymous inline closure on AddSynopticModal's onAdd JSX
  // prop — adds new synoptic report instances, and if the case is already
  // finalized, starts a real amendment draft so the triage tile can track
  // it (see handleFinalizeConfirm for where it's actually released).
  const handleAddSynopticReports = useCallback(async (newInstances: any[], updatedCase: Case) => {
    markDirty('Synoptic reports');
    setActiveReportInstanceId(newInstances[0].instanceId);
    setActiveSpecimenId(newInstances[0].specimenId);

    // Real gap, caught directly: this flow never touched
    // amendmentService at all — meaning the triage tile (which
    // only queries amendmentService) had no way to see or track
    // an addendum created this way, even though this is the
    // actual mechanism a real addendum uses. Fixed: create a
    // real draft record here, mark this specific instance with
    // pendingAddendumId, and release it only when that instance
    // is actually finalized (see handleFinalizeConfirm) — not
    // immediately, so it genuinely stays visible in triage
    // until sign-out, for both modes, not just CoPilot.
    let finalCaseData = updatedCase;
    if (caseData?.status === 'finalized' && caseData?.id) {
      const draftRes = await amendmentService.startDraft({
        caseId: caseData.id, type: 'addendum',
        authoringPathologist: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
      });
      if (draftRes.ok) {
        const markedReports = ((updatedCase as any).synopticReports ?? []).map((r: any) =>
          r.instanceId === newInstances[0].instanceId ? { ...r, pendingAddendumId: draftRes.data.id } : r
        );
        finalCaseData = { ...updatedCase, synopticReports: markedReports } as any;
      }

      // No send here — transmission happens at actual
      // finalization of this instance (see handleFinalizeConfirm),
      // not at creation. Sending here, before any real content
      // exists or the pathologist has finished it, was the same
      // "clear before confirmed" ordering mistake already fixed
      // for amendments.
    }
    setCaseData(finalCaseData);
  }, [markDirty, caseData, signingUser, setCaseData]);

  // Previously an anonymous inline closure on CaseCommentModal's
  // onAddComment JSX prop — append-only case-level comment.
  const handleAddCaseComment = useCallback(async (text: string) => {
    // Append-only — a new CaseComment record, never overwriting
    // anything already posted. Fixed June 2026: this used to be
    // a single string, silently overwritten by whoever saved
    // last, with no record of who wrote what or when.
    if (!caseData?.id) return;
    const newComment: CaseComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorId: signingUser?.id ?? 'unknown',
      authorName: signingUser?.name ?? 'Unknown User',
      text,
      createdAt: new Date().toISOString(),
      origin: 'pathscribe',
      syncStatus: 'pending',
      // Real feature, per direct follow-up: "Stamp every saved
      // draft... with... station_id captured at the exact moment of
      // saving."
      stationId: getEffectiveScanStationId(),
    };
    const updatedComments = [...caseComments, newComment];
    const patch = { order: { ...caseData.order, caseComments: updatedComments } };
    try {
      await caseRouter.updateCase(caseData.id, patch as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, ...patch } as typeof prev) : prev);
      markDirty('Case comment');
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        // Comments are naturally append-only, so an actual field-
        // level merge (union both comment lists rather than
        // whole-array reload-or-override) would avoid needing
        // user intervention at all here — worth building later,
        // not attempted in this pass. Standard treatment for now,
        // consistent with everything else.
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        return;
      }
      console.error('[CaseComment] Failed to persist:', e);
    }
  }, [caseData, signingUser, caseComments, setCaseData, markDirty, knownVersionRef, setConcurrencyConflict]);

  // Previously an anonymous inline closure on ReportCommentModal's
  // onAddComment JSX prop — append-only specimen-level comment.
  const handleAddSpecimenComment = useCallback(async (text: string) => {
    // Append-only — fixed June 2026, same reasoning as the case
    // comment thread: this used to be a single string, silently
    // overwritten by whoever saved last, with no author or
    // timestamp recorded at all.
    if (!caseData?.id) return;
    const newComment: CaseComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorId: signingUser?.id ?? 'unknown',
      authorName: signingUser?.name ?? 'Unknown User',
      text,
      createdAt: new Date().toISOString(),
      origin: 'pathscribe',
      syncStatus: 'pending',
      // Real feature, per direct follow-up: "Stamp every saved
      // draft... with... station_id captured at the exact moment of
      // saving... specimen-log."
      stationId: getEffectiveScanStationId(),
    };
    const patchedSpecimens = (caseData.specimens ?? []).map((sp: any) =>
      sp.id === activeSpecimenCommentId ? { ...sp, comments: [...(sp.comments ?? []), newComment] } : sp
    );
    const patch = { specimens: patchedSpecimens };
    try {
      await caseRouter.updateCase(caseData.id, patch as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, ...patch } as typeof prev) : prev);
      markDirty('Specimen comment');
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        return;
      }
      console.error('[SpecimenComment] Failed to persist:', e);
    }
  }, [caseData, signingUser, activeSpecimenCommentId, setCaseData, markDirty, knownVersionRef, setConcurrencyConflict]);


  const handleOrchPrint = useCallback(async () => {
    // Real feature, per direct specification: Post-Sign-Out Release
    // Buffer, closing a known gap flagged in Phase 3. Same real gate
    // as BottomActionBar.tsx's CoPilot print button — a confirmation
    // naming the watermark, never a silent block.
    if (caseData?.status === 'pending-release' && orchPrintRestricted) {
      const proceed = window.confirm(
        'Hardcopy printing is restricted while this report is Pending Release. ' +
        'The printed copy will carry the "PENDING FINAL RELEASE" watermark. Print anyway?'
      );
      if (!proceed) return;
    }
    if (!caseData) { window.print(); return; }
    setIsPrinting(true);
    const accession = caseData.accession?.fullAccession
      ?? caseData.accession?.accessionNumber ?? '';
    try {
      const patient = caseData.patient
        ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '';
      // Amendment/addendum data added to the payload so a server-side
      // renderer CAN draw the banner — but the ReportLab service that
      // actually turns this payload into the PDF page is a separate
      // Python service outside this codebase. This field being present
      // here does not guarantee it's drawn; that requires a
      // corresponding update on the PDF generation side, which isn't
      // something verifiable from this React app.
      const amendmentRes = caseData.id ? await amendmentService.getByCaseId(caseData.id) : { ok: false as const };
      const releasedAmendments = amendmentRes.ok ? amendmentRes.data.filter(r => r.status === 'released') : [];

      // Real feature, per direct specification: Post-Sign-Out Release
      // Buffer. This is a real, separate PDF payload construction from
      // generateReportPdfSnapshot()'s own — that one already carries
      // this field (Phase 3); this one, reached only via the
      // Orchestration print button above, did not until now.
      let watermarkText: string | undefined;
      if (caseData.status === 'pending-release') {
        const { mockReportReleaseService } = await import('@/services/reportRelease/mockReportReleaseService');
        const cfg = await mockReportReleaseService.getOrgDefault();
        if (cfg.ok) watermarkText = cfg.data.watermarkText;
      }

      const payload = {
        templateName: resolvedTemplateName,
        resolvedBy,
        institution: getInstitution(caseData.originHospitalId),
        caseHeader: {
          accession,
          patient,
          mrn: caseData.patient?.mrn ?? '',
          dob: caseData.patient?.dateOfBirth
            ? new Date(caseData.patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
            : '',
          referring: caseData.order?.clientName ?? '',
          clinician: caseData.order?.requestingProvider ?? '',
        },
        // Same data ReportPreviewRenderer already renders on screen — the
        // PDF and the live preview are built from one resolved context,
        // not two independently-derived views of the case.
        bodyAssembly:    resolvedContext?.narrativeTemplate.bodyAssembly ?? [],
        headerAssembly:  resolvedContext?.narrativeTemplate.headerAssembly ?? [],
        footerAssembly:  resolvedContext?.narrativeTemplate.footerAssembly ?? [],
        sections:        orchSections,
        renderScope:     buildRenderScope(caseData),
        synopticAnswers: resolvedContext?.synoptics?.flatMap(s => s.answers) ?? [],
        amendments:      releasedAmendments,
        // Same caveat as bodyAssembly/sections above: sent so a
        // server-side renderer CAN draw it, but this React app can't
        // verify the separate PDF service actually reads it — that's
        // a corresponding change on that side, not this one.
        documentStyle:   resolvedContext?.narrativeTemplate.documentStyle,
        // Same real, honest caveat as documentStyle above — genuinely
        // absent (not sent as an empty string) for any case that isn't
        // 'pending-release'.
        watermarkText,
      };

      const resp = await fetch(REPORT_PDF_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(`Report PDF generation failed (${resp.status})`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Popup blocked — download directly rather than leaving the
        // pathologist with no way to get the PDF at all.
        const a = document.createElement('a');
        a.href = url;
        a.download = `${accession || 'report'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Revoke once the new tab/download has had time to load the blob —
      // too soon and an opened tab can lose the document mid-render.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) {
      showToast(`PDF generation failed (${e?.message ?? 'unknown error'}) — printing from screen instead`);
      // Fall back to the old DOM-print path rather than leaving the
      // pathologist with no way to print if the Cloud Function is down.
      const pageEl = document.querySelector('.rp-page') as HTMLElement | null;
      if (!pageEl) { window.print(); return; }
      // Size to most of the available screen rather than a small fixed
      // popup — Chrome's print preview renders inside this window, so a
      // cramped window makes the preview look cramped too, right when the
      // pathologist is checking the report's actual printed appearance.
      const winWidth  = Math.round(window.screen.availWidth  * 0.9);
      const winHeight = Math.round(window.screen.availHeight * 0.9);
      const winLeft   = Math.round((window.screen.availWidth  - winWidth)  / 2);
      const winTop    = Math.round((window.screen.availHeight - winHeight) / 2);
      const win = window.open('', '_blank', `width=${winWidth},height=${winHeight},left=${winLeft},top=${winTop}`);
      if (!win) { window.print(); return; }
      win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${accession} — PathScribe Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt;
         line-height: 1.6; color: #1a1a1a; background: white; }
  @page { size: A4; margin: 18mm 20mm 22mm 20mm;
    @top-left   { content: "${accession}"; font-size: 8pt; color: #666; font-family: Arial, sans-serif; }
    @top-right  { content: "CONFIDENTIAL — CLINICAL RECORD"; font-size: 8pt; color: #666; font-family: Arial, sans-serif; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #666; font-family: Arial, sans-serif; }
  }
  .rp-section-badge { display: none; }
  .rp-section-heading { font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; border-left: 3px solid #333; padding: 6px 0 6px 10px;
    margin-bottom: 8pt; }
  .rp-section-body { font-size: 11pt; line-height: 1.7; padding-left: 13px; }
  .rp-section-body p { margin-bottom: 6pt; orphans: 3; widows: 3; }
  .rp-section { margin-bottom: 18pt; }
  .rp-footer-conf, .rp-footer { font-size: 8pt; }
</style></head><body>${pageEl.outerHTML}</body></html>`);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); win.close(); };
    } finally {
      setIsPrinting(false);
    }
  }, [caseData, resolvedContext, orchSections, resolvedTemplateName, resolvedBy, showToast, orchPrintRestricted]);

  // caseComputationalFlags removed along with the Computational tab —
  // this derivation only ever fed that tab's flag list.

  // ps:suggest-protocols listener removed — nothing dispatches this
  // event anymore. It was fired by the old order-placement flow
  // (Flag.defaultProtocolIds), removed along with the rest of the
  // ordering/result apparatus.

  // Computational voice actions (open/close sidecar, read result,
  // next/prev assay, computational tab, order modal) removed along
  // with the Sidecar, the ordering apparatus, and the Computational
  // tab. Checked every event individually — zero remaining listeners
  // for any of them before removing this block.

  // ── Keyboard shortcuts for Report Draft (Orchestration mode) ──────────────
  useEffect(() => {
    if (!isOrchestrationMode) return;
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const tag  = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl+S — Save Draft
      if (ctrl && e.key === 's' && leftTab === 'draft') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_SAVE_DRAFT'));
        return;
      }
      // Ctrl+G — Generate Report
      if (ctrl && e.key === 'g' && leftTab === 'draft') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_GENERATE_REPORT'));
        return;
      }
      // Ctrl+Shift+D — Switch to Report Draft
      if (ctrl && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        safeSetLeftTab('draft');
        return;
      }
      // Ctrl+Shift+F — Switch to Full Report
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        safeSetLeftTab('report');
        return;
      }
      // Ctrl+Shift+Q — Switch to Sequencer
      if (ctrl && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        safeSetLeftTab('sequencer');
        return;
      }
      // Alt+1–4 — Jump to section by number (fires custom event for OrchestratorSectionEditor)
      if (e.altKey && !inInput && leftTab === 'draft') {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_JUMP_SECTION', { detail: { index: num - 1 } }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOrchestrationMode, leftTab, safeSetLeftTab]);

  // ── Voice actions for Report Draft ──────────────────────────────────────────
  useEffect(() => {
    if (!isOrchestrationMode) return;
    const actions = [
      { id: 'orch_open_draft',     phrases: ['open report draft', 'show report draft', 'go to draft'],              handler: () => safeSetLeftTab('draft')        },
      { id: 'orch_open_report',    phrases: ['open full report', 'show full report', 'view report'],                  handler: () => safeSetLeftTab('report')   },
      { id: 'orch_open_sequencer', phrases: ['open sequencer', 'show sequencer', 'synoptic fields'],                  handler: () => safeSetLeftTab('sequencer')    },
      { id: 'orch_save_draft',     phrases: ['save draft', 'save report', 'save my work'],                           handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_SAVE_DRAFT'))        },
      { id: 'orch_generate',       phrases: ['generate report', 'generate narrative', 'create report', 'generate'],  handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_GENERATE_REPORT'))    },
      { id: 'orch_regen',          phrases: ['regenerate report', 'regenerate all', 'redo report'],                   handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_REGEN_ALL'))                       },
      { id: 'orch_next_section',   phrases: ['next section', 'go to next section'],                                   handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_NEXT_SECTION'))                   },
      { id: 'orch_prev_section',   phrases: ['previous section', 'go back', 'prior section'],                         handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_PREV_SECTION'))                   },
      { id: 'orch_section_1',      phrases: ['go to section one', 'section one', 'first section'],                   handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_JUMP_SECTION', { detail: { index: 0 } })) },
      { id: 'orch_section_2',      phrases: ['go to section two', 'section two', 'second section'],                  handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_JUMP_SECTION', { detail: { index: 1 } })) },
      { id: 'orch_section_3',      phrases: ['go to section three', 'section three', 'third section'],               handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_JUMP_SECTION', { detail: { index: 2 } })) },
      { id: 'orch_section_4',      phrases: ['go to section four', 'section four', 'fourth section'],                handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_JUMP_SECTION', { detail: { index: 3 } })) },

      // ── Dictation actions ────────────────────────────────────────────────
      // "Dictate [section name]" → jump cursor + register dictation target.
      // Pathologist then activates the NavBar mic to start speaking.
      // Section names are matched by partial label — "dictate gross" matches
      // "Specimen & Gross Description", "dictate admin" matches "Administrative
      // & Clinical Header", etc.
      { id: 'orch_dictate_admin',    phrases: ['dictate administrative', 'dictate admin', 'dictate clinical header', 'dictate header'],
        handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 0 } })) },
      { id: 'orch_dictate_gross',    phrases: ['dictate gross', 'dictate gross description', 'dictate specimen', 'dictate macroscopic'],
        handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 1 } })) },
      { id: 'orch_dictate_synoptic', phrases: ['dictate synoptic', 'dictate synoptic summary', 'dictate summary'],
        handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 2 } })) },
      { id: 'orch_dictate_diagnosis', phrases: ['dictate diagnosis', 'dictate ancillary', 'dictate final diagnosis', 'dictate conclusion'],
        handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 3 } })) },
      // Generic — "dictate section two" etc mirrors existing jump pattern
      { id: 'orch_dictate_section_1', phrases: ['dictate section one', 'dictate first section'],   handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 0 } })) },
      { id: 'orch_dictate_section_2', phrases: ['dictate section two', 'dictate second section'],  handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 1 } })) },
      { id: 'orch_dictate_section_3', phrases: ['dictate section three', 'dictate third section'], handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 2 } })) },
      { id: 'orch_dictate_section_4', phrases: ['dictate section four', 'dictate fourth section'], handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_DICTATE_SECTION', { detail: { sectionIndex: 3 } })) },
      { id: 'orch_dark_mode',      phrases: ['dark mode', 'toggle dark mode', 'night mode'],                          handler: () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_TOGGLE_DARK'))                     },
    ];

    const eventListeners: [string, EventListener][] = [];
    actions.forEach(a => {
      (mockActionRegistryService as any).registerAction?.({
        id: a.id, label: a.phrases[0], phrases: a.phrases,
        event: `PATHSCRIBE_${a.id.toUpperCase()}`, context: 'ORCHESTRATOR', category: 'Report Draft',
      });
      const listener = a.handler as EventListener;
      window.addEventListener(`PATHSCRIBE_${a.id.toUpperCase()}`, listener);
      eventListeners.push([`PATHSCRIBE_${a.id.toUpperCase()}`, listener]);
    });

    return () => eventListeners.forEach(([event, fn]) => window.removeEventListener(event, fn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrchestrationMode, leftTab]);

  // useSidecar's selectedFlag/isOpen effect removed — it switched
  // leftTab to 'results', a tab that no longer exists (removed along
  // with the Computational tab earlier), on top of depending on the
  // Sidecar itself, which is now gone too. Doubly dead code.

 const {
    flagCaseData, setFlagCaseData: _setFlagCaseData,
    flagDefinitions,
    showFlagManager, setShowFlagManager,
    openFlagManager,
    onApplyFlags,
    onRemoveFlag,
  } = useSynopticFlags(caseId ?? '');

  // ── Voice action execution ───────────────────────────────────────────────────
  // The context activation earlier in this component makes voice
  // recognition correctly match a spoken phrase to one of the SYNOPTIC
  // actions and dispatch it — but dispatching an event that nothing
  // listens for still does nothing. This used to only wire the 4
  // Grossing actions; the other 24 SYNOPTIC actions were recognized by
  // voice but genuinely inert. 20 of those 24 are wired for real below —
  // 4 more (DELEGATE_PEER_REVIEW/FORMAL_CONSULT/FULL_TRANSFER/CONFIRM)
  // are wired inside DelegateModal.tsx directly, since the delegation-
  // type and confirm state live there, not here.
  //
  // Genuinely NOT wired, on purpose — not silently skipped:
  //   POOL_ACCEPT_CASE / POOL_PASS_CASE — these describe a pool case
  //   before it's been claimed. This page only ever opens an already-
  //   assigned case; there's no "unclaimed pool case" state reachable
  //   from here at all, so wiring these here would be unreachable and
  //   meaningless. They belong on WorklistPage.tsx if built at all.
  //   COMP_ORDER_PLACE / COMP_ORDER_CANCEL — these need to reach inside
  //   whatever renders the actual computational order modal once open
  //   (the "results" tab's own internal state), which wasn't located/
  //   verified this pass. Left inert rather than guessed at.
  //
  // Placed here, after openFlagManager/showTeamModal/etc. are all
  // actually declared, for the same reason as the comment that used to
  // sit above the old, Grossing-only version of this listener: an
  // earlier attempt referencing dependencies before they existed threw
  // on every load. Not repeating that.
  useEffect(() => {
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      switch (actionId) {
        // ── Grossing (already wired) ──────────────────────────────────────
        case 'GROSSING_NEXT_BLOCK':
          setFocusedBlockIndex(i => Math.min(i + 1, allBlocks.length - 1));
          break;
        case 'GROSSING_PREVIOUS_BLOCK':
          setFocusedBlockIndex(i => Math.max(i - 1, 0));
          break;
        case 'GROSSING_MARK_GROSSED':
          handleAdvanceFocusedBlockStatus();
          break;
        case 'GROSSING_CONFIRM_TRIAGE':
          handleConfirmTriage();
          break;

        // ── Delegation entry point (the 4 sub-actions live inside ──────────
        // ── DelegateModal.tsx itself, wired separately) ────────────────────
        case 'OPEN_DELEGATE_MODAL':
        case 'DELEGATE_CONSULTATION':
          setShowDelegateModal(true);
          break;

        // ── AI Review — this modal already has its own window-event ───────
        // ── listener for these exact 4 events; just dispatching them, ──────
        // ── not duplicating the logic. ─────────────────────────────────────
        case 'AI_REVIEW_CONFIRM':
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_AI_REVIEW_CONFIRM'));
          break;
        case 'AI_REVIEW_OVERRIDE':
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_AI_REVIEW_OVERRIDE'));
          break;
        case 'AI_REVIEW_SKIP':
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_AI_REVIEW_SKIP'));
          break;
        case 'AI_REVIEW_CANCEL':
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_AI_REVIEW_CANCEL'));
          break;

        // ── Case Team — CASE_TEAM_ADD/ASSIGN match the existing window- ────
        // ── event scope already in this file: they open the modal, they ───
        // ── don't yet pre-select a specific member or role within it. ──────
        case 'OPEN_CASE_TEAM':
        case 'CASE_TEAM_ADD':
        case 'CASE_TEAM_ASSIGN':
          setShowTeamModal(true);
          break;

        // Computational Sidecar voice cases (COMP_OPEN_SIDECAR,
        // COMP_ORDER_OPEN) removed — both dispatched events with zero
        // remaining listeners, tied to the Sidecar/order apparatus
        // removed elsewhere.

        // ── Flags — FLAG_APPLY_STAT opens the manager rather than ──────────
        // ── attempting a direct apply; ApplyFlagPayload's exact shape ──────
        // ── (case vs. specimen scoping) wasn't verified this pass, and a ───
        // ── wrong guess here risks a silent, wrong flag application — ──────
        // ── opening the manager for a real, deliberate click is safer. ─────
        case 'FLAG_OPEN_MANAGER':
        case 'FLAG_APPLY_STAT':
          openFlagManager(caseData);
          break;

        // ── Add Orders — four separate ids so "add block" lands directly
        // on that tab rather than opening generically and requiring a
        // manual tab click, same reasoning as the FLAG_APPLY_STAT
        // comment above but the opposite conclusion: here there's no
        // ambiguous-shape risk, just which tab opens first, so going
        // straight there is safe.
        case 'ADD_ORDERS':
          setAddOrdersInitialTab(undefined);
          setShowAddOrdersModal(true);
          break;
        case 'ADD_ORDERS_BLOCK':
          setAddOrdersInitialTab('blocks');
          setShowAddOrdersModal(true);
          break;
        case 'ADD_ORDERS_STAIN':
          setAddOrdersInitialTab('stains');
          setShowAddOrdersModal(true);
          break;
        case 'ADD_ORDERS_SPECIMEN':
          setAddOrdersInitialTab('specimens');
          setShowAddOrdersModal(true);
          break;

        // ── Save/Discard — reuses the real, existing save mechanism ────────
        // ── (the same one Ctrl+S and the Save Draft button use), not a ─────
        // ── new one. Scoped to Orchestration-mode cases specifically: the ──
        // ── PATHSCRIBE_ORCH_SAVE_DRAFT listener is only ever registered ────
        // ── when isOrchestrationMode is true, matching "Report Draft" ──────
        // ── being an orchestration-mode concept. Discard reloads from the ──
        // ── last saved state rather than trying to manually unwind local ───
        // ── React state, which is safer given how many places touch it. ────
        case 'SAVE_DRAFT':
          window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_SAVE_DRAFT'));
          break;
        case 'DISCARD_CHANGES':
          clearDirty();
          window.location.reload();
          break;

        case 'TEMPLATE_SELECT':
          setShowCentreTemplatePicker(true);
          break;
      }
    });
    return unsubscribe;
  }, [
    allBlocks.length, handleAdvanceFocusedBlockStatus, handleConfirmTriage, setFocusedBlockIndex,
    openFlagManager, clearDirty, caseData,
  ]);


  // Tracks whether onApplyFlags/onRemoveFlag fired during this modal session
  // Watch caseFlags/specimenFlags — set dirty any time they change after initial load.
  // Works regardless of which modal or callback applied the change.
  const initialFlagsKey = React.useRef<string | null>(null);

  // When caseFlags or specimenFlags change after load → mark dirty
  React.useEffect(() => {
    if (!isLoaded || !caseData) return;
    const key = JSON.stringify([
      ((caseData as any).caseFlags ?? []).map((f: any) => f.id ?? f.lisCode),
      (caseData.specimens ?? []).map((sp: any) => ((sp as any).specimenFlags ?? []).map((f: any) => f.id ?? f.lisCode)),
    ]);
    if (initialFlagsKey.current === null) {
      initialFlagsKey.current = key;
      return;
    }
    if (key !== initialFlagsKey.current) {
      markDirty('Flags');
      initialFlagsKey.current = key;
    }
  }); // intentionally no dep array — runs after every render but only acts when key changes

  // Note: computational tab (results) is freely accessible regardless of unsaved state.
  // The unsaved state warning fires at finalize/navigate time instead.

  const guard = useCallback((path: string, state?: object) => {
    // Remap /worklist → /search when the user arrived from a search result
    const dest = (path === '/worklist' && navSource === 'search') ? '/search' : path;
    // Tell SearchPage to restore previous results when returning to it
    if (dest === '/search') sessionStorage.setItem('pathscribe:searchReturn', '1');
    if (shouldWarnDirty()) { setPendingNavigation(dest); return; }
    navigate(dest, state ? { state } : undefined);
  }, [shouldWarnDirty, navSource, navigate]);

  // ── Jump to field — Cannot Finalise + PreFinalisationModal ─────────────────
  // Uses the existing scrollToField/alertFieldId mechanism in RightSynopticPanel
  // which has fieldRefs wired to actual DOM elements via useImperativeHandle.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const { fieldKey } = (e as CustomEvent).detail ?? {};
      if (!fieldKey) return;
      safeSetLeftTabRef.current('draft');
      // Small delay to let the tab switch render before scrolling
      setTimeout(() => setAlertFieldId(fieldKey), 100);
    };
    window.addEventListener('PATHSCRIBE_JUMP_TO_FIELD', handler);
    return () => window.removeEventListener('PATHSCRIBE_JUMP_TO_FIELD', handler);
  }, []);

  React.useEffect(() => {
    const openTeam = () => setShowTeamModal(true);
    window.addEventListener('PATHSCRIBE_OPEN_CASE_TEAM',   openTeam);
    window.addEventListener('PATHSCRIBE_CASE_TEAM_ADD',    openTeam);
    window.addEventListener('PATHSCRIBE_CASE_TEAM_ASSIGN', openTeam);
    return () => {
      window.removeEventListener('PATHSCRIBE_OPEN_CASE_TEAM',   openTeam);
      window.removeEventListener('PATHSCRIBE_CASE_TEAM_ADD',    openTeam);
      window.removeEventListener('PATHSCRIBE_CASE_TEAM_ASSIGN', openTeam);
    };
  }, []);

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedData) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedData]);

  // Block browser back/forward button when dirty.
  // BrowserRouter doesn't support useBlocker, so we use popstate instead.
  React.useEffect(() => {
    if (!hasUnsavedData) return;
    // Push a sentinel so the back button has somewhere to go
    window.history.pushState(null, '', window.location.href);
    const handlePop = () => {
      // Push again to keep the user on this page
      window.history.pushState(null, '', window.location.href);
      setPendingNavigation('__back__');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [hasUnsavedData]);

  const navigateToCase = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' ? worklistIndex + 1 : worklistIndex - 1;
    if (newIndex >= 0 && newIndex < worklistCases.length) {
      navigate(`/case/${worklistCases[newIndex]}/synoptic`, {
        state: { worklistCaseIds: worklistCases },
      });
    }
  }, [worklistCases, worklistIndex, navigate]);

  // Previously an anonymous inline closure on UnsavedWarningModal's
  // onSaveAndLeave JSX prop — saves the draft via the shared
  // saveDraftInternal, then resumes whichever navigation was pending.
  const handleSaveAndLeave = useCallback(async () => {
    // This previously just cleared the dirty flag and showed a
    // "Draft saved" toast without ever actually calling
    // caseRouter.updateCase or writing the localStorage backup —
    // the toast was lying, and navigating away right after threw
    // away orchSections for real, since nothing had persisted it
    // anywhere. Now routed through the same shared saveDraftInternal
    // every other save trigger uses.
    const saved = await saveDraftInternal();
    if (!saved) return; // held by a real conflict — don't proceed with navigation
    if (pendingPath) confirmContextNavigate();
    const dest = pendingNavigation;
    setPendingNavigation(null);
    if (dest === 'next') navigateToCase('next');
    else if (dest === 'prev') navigateToCase('prev');
    else if (dest === '__back__') {
      if (backPath === '/search') sessionStorage.setItem('pathscribe:searchReturn', '1');
      navigate(backPath);
    }
    else if (dest) navigate(dest);
  }, [saveDraftInternal, pendingPath, confirmContextNavigate, pendingNavigation, setPendingNavigation, navigateToCase, backPath, navigate]);

  // Previously an anonymous inline closure on the "required fields
  // incomplete" alert banner's onClick — decides whether to jump
  // straight to the unanswered field, or confirm first if there's an
  // unsaved AI draft that a tab switch would risk losing.
  const handleAlertBannerClick = useCallback(() => {
    if (isOrchestrationMode && leftTab === 'draft') {
      // Switch to Full Report (shows synoptic panel) then scroll to first required field
      // If unsaved draft, confirm first
      if (hasUnsavedData && orchSections.some(s => s.text)) {
        setPendingTabSwitch('report_and_scroll');
      } else {
        safeSetLeftTab('report');
        setTimeout(() => setAlertFieldId('scroll_to_unanswered'), 150);
      }
    } else {
      setAlertFieldId('scroll_to_unanswered');
    }
  }, [isOrchestrationMode, leftTab, hasUnsavedData, orchSections, setPendingTabSwitch, safeSetLeftTab, setAlertFieldId]);

  // Previously an anonymous inline closure on Sidebar's onEditSpecimen
  // JSX prop — looks up the specimen and opens the edit modal on it.
  const handleEditSpecimen = useCallback((specimenId: string) => {
    const sp = caseData?.specimens?.find(s => s.id === specimenId);
    setEditingSpecimen(sp ?? null);
    setShowSpecimenEdit(true);
  }, [caseData, setEditingSpecimen, setShowSpecimenEdit]);

  // Previously an anonymous inline closure on Sidebar's onDeleteReport
  // JSX prop — removes a synoptic report instance and, if it was the
  // currently active one, falls back to whatever report is now first.
  const handleDeleteReport = useCallback((instanceId: string) => {
    if (!caseData) return;
    const remaining = (caseData.synopticReports ?? []).filter(r => r.instanceId !== instanceId);
    const updated: Case = { ...caseData, synopticReports: remaining, updatedAt: new Date().toISOString() };
    setCaseData(updated);
    markDirty('Synoptic reports');
    if (activeReportInstanceId === instanceId) {
      setActiveReportInstanceId(remaining[0]?.instanceId ?? '');
      setActiveSpecimenId(remaining[0]?.specimenId ?? '');
    }
  }, [caseData, setCaseData, markDirty, activeReportInstanceId, setActiveReportInstanceId, setActiveSpecimenId]);

  // Previously an anonymous inline closure on each "Cannot Finalise"
  // missing-field card's onClick — closes the modal, switches to the
  // Draft tab if in Orchestration mode, and scrolls to the field.
  // Previously an anonymous inline closure on the pending-tab-switch
  // confirmation's "Discard & Switch" button — abandons unsaved changes
  // and completes whichever tab switch was pending.
  const handleDiscardAndSwitchTab = useCallback(() => {
    const dest = pendingTabSwitch;
    setPendingTabSwitch(null);
    // Discard and switch
    clearDirty();
    const tab = dest === 'report_and_scroll' ? 'report' : dest as any;
    safeSetLeftTab(tab);
    if (dest === 'report_and_scroll') {
      setTimeout(() => setAlertFieldId('scroll_to_unanswered'), 150);
    }
  }, [pendingTabSwitch, setPendingTabSwitch, clearDirty, safeSetLeftTab, setAlertFieldId]);

  // Previously an anonymous inline closure on the pending-tab-switch
  // confirmation's "Save & Switch" button — saves via the shared
  // saveDraftInternal first, then completes the pending tab switch.
  const handleSaveAndSwitchTab = useCallback(async () => {
    // Save then switch
    const dest = pendingTabSwitch;
    setPendingTabSwitch(null);
    const saved = await saveDraftInternal();
    if (!saved) return; // held by a real conflict — don't proceed with the tab switch
    const tab = dest === 'report_and_scroll' ? 'report' : dest as any;
    safeSetLeftTab(tab);
    if (dest === 'report_and_scroll') {
      setTimeout(() => setAlertFieldId('scroll_to_unanswered'), 150);
    }
  }, [pendingTabSwitch, setPendingTabSwitch, saveDraftInternal, safeSetLeftTab, setAlertFieldId]);

  const [pendingReconciliation, setPendingReconciliation] = React.useState<{
    specimenId: string; caseType: string; frozenCategory: import('@/types/intraop/IntraoperativeEntry').FrozenCategory; frozenDx: string;
  } | null>(null);


  const generateReportPdfSnapshot = useCallback(async (): Promise<{ pdfBase64?: string; generationError?: string }> => {
    if (!caseData) return { generationError: 'No case data available.' };
    try {
      const accession = caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? '';
      const patient = caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '';

      // Real bug, confirmed directly: resolvedContext is only ever set
      // when isOrchestrationMode is true (see the useEffect that calls
      // buildContext — it returns immediately otherwise). That means
      // every field pulling from it here — bodyAssembly, synopticAnswers
      // — was silently an empty array for CoPilot, producing a blank
      // PDF with a real HTTP 200 response, not an error. For CoPilot,
      // build the answers directly from the case's own synopticReports,
      // resolving each instance's own template — same resolveAnswers
      // function Orchestration already uses, not a separate, lesser
      // implementation.
      let copilotSynopticAnswers: any[] = [];
      if (!isOrchestrationMode) {
        const templateModule = await import('@/services/templates/templateService');
        const instances = caseData.synopticReports ?? [];
        const resolved = await Promise.all(instances.map(async (inst: any) => {
          const detail = await templateModule.getTemplate(inst.templateId);
          if (!detail) return [];
          return resolveAnswers(inst.answers ?? {}, detail.template);
        }));
        copilotSynopticAnswers = resolved.flat();
      }

      // Real feature, per direct specification: Post-Sign-Out Release
      // Buffer, Phase 3 (spec §14b — a printed/generated PDF during the
      // buffer window carries the real, configured watermark). Only
      // fetched when genuinely relevant — a case that isn't
      // 'pending-release' never pays this extra lookup.
      let watermarkText: string | undefined;
      if (caseData.status === 'pending-release') {
        const { mockReportReleaseService } = await import('@/services/reportRelease/mockReportReleaseService');
        const cfg = await mockReportReleaseService.getOrgDefault();
        if (cfg.ok) watermarkText = cfg.data.watermarkText;
      }

      const payload = {
        templateName: resolvedTemplateName,
        resolvedBy,
        institution: getInstitution(caseData.originHospitalId),
        caseHeader: {
          accession, patient,
          mrn: caseData.patient?.mrn ?? '',
          dob: caseData.patient?.dateOfBirth
            ? new Date(caseData.patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
            : '',
          referring: caseData.order?.clientName ?? '',
          clinician: caseData.order?.requestingProvider ?? '',
        },
        bodyAssembly:    resolvedContext?.narrativeTemplate.bodyAssembly ?? [],
        headerAssembly:  resolvedContext?.narrativeTemplate.headerAssembly ?? [],
        footerAssembly:  resolvedContext?.narrativeTemplate.footerAssembly ?? [],
        sections:        orchSections,
        renderScope:     buildRenderScope(caseData),
        synopticAnswers: isOrchestrationMode ? (resolvedContext?.synoptics?.flatMap(s => s.answers) ?? []) : copilotSynopticAnswers,
        // Same caveat as bodyAssembly/sections above: sent so a
        // server-side renderer CAN draw it, but this React app can't
        // verify the separate PDF service actually reads it — that's
        // a corresponding change on that side, not this one.
        documentStyle:   resolvedContext?.narrativeTemplate.documentStyle,
        // Same real, honest caveat as documentStyle above — genuinely
        // absent (not sent as an empty string) for any case that isn't
        // 'pending-release'.
        watermarkText,
      };
      const resp = await fetch(REPORT_PDF_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!resp.ok) return { generationError: `Report PDF generation failed (${resp.status})` };
      const blob = await resp.blob();
      const pdfBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { pdfBase64 };
    } catch (e: any) {
      return { generationError: e?.message ?? 'Unknown error generating PDF snapshot.' };
    }
  }, [caseData, resolvedTemplateName, resolvedBy, resolvedContext, orchSections, isOrchestrationMode]);



  const synopticPanelRef = React.useRef<RightSynopticPanelHandle>(null);
  const {
    releasePendingAmendmentOrAddendum,
    alertAdminsOfUnresolvedDrift,
    showProtoReview, setShowProtoReview,
    protoChanges,
    handleProtocolChangesDetected,
    handleProtoCommit,
    showGrossingProtoReview, setShowGrossingProtoReview,
    grossingProtoChanges,
    handleGrossingProtocolChangesDetected,
    handleGrossingProtoCommit,
    setAmendmentDraftId,
    amendmentSequenceNumber,
    amendmentSubmitError, setAmendmentSubmitError,
    versionHistory,
    resumingAmendment, setResumingAmendment,
    openAmendmentDraft,
    handleFieldOverridesConfirmed,
    handleRequestAmendment,
    handleAmendmentSubmit,
  } = useAmendmentWorkflow({
    caseData, setCaseData, signingUser, showToast, activeReportInstanceId,
    knownVersionRef, setConcurrencyConflict, sendSynopticReportToLis,
    generateReportPdfSnapshot, pendingLisNotice, setPendingLisNotice,
    amendmentMode, amendmentText, setAmendmentText, setAmendmentMode,
    setShowAmendmentModal, log,
  });
  // Stage 1: tracks whether a Stage 1 evaluation call is currently in
  // flight. Combined with showProtoReview (above) to gate Finalize/
  // Finalize & Next/Sign Out in BottomActionBar — see handleGrossComplete.
  // Per-instance snapshot of answers at the moment each GrossingReportInstance
  // was last finalized — set in handleGrossComplete, read by the drift-
  // detection useEffect right after it. Ref, not state: pure bookkeeping,
  // shouldn't trigger renders on its own.
  const grossingSnapshotRef = React.useRef<Map<string, string>>(new Map());
  const { isEvaluatingSynopticFit, handleGrossComplete } = useGrossingCompletion({
    caseData, setCaseData, showToast, log, knownVersionRef,
    setConcurrencyConflict, grossingSnapshotRef, handleProtocolChangesDetected,
    handleGrossingProtocolChangesDetected,
    orchSections,
  });

  const microscopicEntry = useMicroscopicEntry({
    caseData, setCaseData, knownVersionRef, setConcurrencyConflict, showToast,
    handleProtocolChangesDetected,
  });

  // Previously an anonymous inline closure on SequencerPanel's onSave JSX
  // prop — reorders specimens and their synoptic reports per the
  // pathologist's drag-to-reorder choice.
  const handleSequencerSave = useCallback((specimenOrder: string[], synopticOrders: Record<string, string[]>) => {
    setCaseData(prev => {
      if (!prev) return prev;
      // Reorder specimens
      const specimenMap = Object.fromEntries((prev.specimens ?? []).map(s => [s.id, s]));
      const reorderedSpecimens = specimenOrder.map(id => specimenMap[id]).filter(Boolean);
      // Reorder synoptic reports within each specimen
      const synopticMap = Object.fromEntries(((prev as any).synopticReports ?? []).map((r: any) => [r.instanceId, r]));
      const reorderedReports: any[] = [];
      specimenOrder.forEach(spId => {
        (synopticOrders[spId] ?? []).forEach(instId => {
          if (synopticMap[instId]) reorderedReports.push(synopticMap[instId]);
        });
      });
      return { ...prev, specimens: reorderedSpecimens, synopticReports: reorderedReports } as any;
    });
    markDirty('Report sequence');
    showToast('Sequence saved');
  }, [setCaseData, markDirty, showToast]);

  // Previously an anonymous inline closure on HeaderBar's onCaseUpdate JSX
  // prop — persists specimenFlags updates from the header's flag editor.
  const handleHeaderCaseUpdate = useCallback(async (updated: Case) => {
    try {
      await caseRouter.updateCase(updated.id, { specimenFlags: (updated as any).specimenFlags } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(updated);
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        return;
      }
      console.error(e);
    }
  }, [setCaseData, knownVersionRef, setConcurrencyConflict]);

  // Previously an anonymous inline closure on SpecimenEditModal's onSave
  // JSX prop — handles post-hoc correction audit trail, persisting the
  // saved specimen, and (for newly-added specimens) auto-assigning a
  // grossing template so the new specimen isn't invisible in the
  // Sidebar's unified editor.
  const handleSpecimenSave = useCallback(async (saved: Specimen) => {
    // Post-Hoc Correction audit trail — deliberately generated
    // here, in the existing save path, rather than via a
    // separate correction-only modal. SpecimenEditModal already
    // covers every field someone would realistically need to
    // fix; building a second modal for the same fields would
    // just confuse people with two ways to do the same thing.
    // Only fires for genuine edits (editingSpecimen was set),
    // never for a newly-added specimen — there's no "before"
    // value to compare against for something that didn't exist
    // a moment ago, so nothing here is actually a correction.
    if (editingSpecimen && caseData?.id) {
      const before = editingSpecimen;
      const fieldsToCheck: { key: string; label: string; oldVal: string; newVal: string }[] = [
        { key: 'label', label: 'Specimen Label', oldVal: before.label ?? '', newVal: saved.label ?? '' },
        { key: 'description', label: 'Description', oldVal: before.description ?? '', newVal: saved.description ?? '' },
        { key: 'bodySite', label: 'Body Site', oldVal: (before as any).collection?.bodySite ?? '', newVal: (saved as any).collection?.bodySite ?? '' },
        { key: 'laterality', label: 'Laterality', oldVal: (before as any).collection?.laterality ?? '', newVal: (saved as any).collection?.laterality ?? '' },
        { key: 'containerType', label: 'Container Type', oldVal: (before as any).container?.type ?? '', newVal: (saved as any).container?.type ?? '' },
      ];
      fieldsToCheck.filter(f => f.oldVal.trim() !== f.newVal.trim()).forEach(f => {
        specimenDeficiencyService.raiseAndResolve(
          {
            caseId: caseData.id, specimenId: saved.id, specimenLabel: saved.label,
            deficiencyTypeId: 'def-post-hoc-correction',
            comment: `${f.label}: "${f.oldVal || '(blank)'}" → "${f.newVal || '(blank)'}"`,
            raisedBy: signingUser?.id ?? 'unknown',
          },
          { resolutionTypeId: 'res-value-corrected', resolvedBy: signingUser?.id ?? 'unknown' }
        ).catch(err => console.error('[PostHocCorrection] Failed to record:', err));
      });
    }

    // Real feature, per direct follow-up: "Specimen/Decant-level
    // foreign ID... the actual cytology fluid case." Audit Trail
    // Tracking — same real, merged pre/post-state check as
    // handleUpdateBlock/handleUpdateMatrixBlock's own identical fix
    // earlier this session (see those comments for the full
    // reasoning on why a naive "both fields present together" check
    // isn't enough on its own). Deliberately NOT gated on
    // `editingSpecimen` the way the Post-Hoc Correction block above
    // is — a brand-new specimen can genuinely be created with its
    // own foreign id already filled in (a PA who knows upfront this
    // is received, foreign-labeled fluid), and that's still a real,
    // new binding worth logging, not just a value that happened to
    // already be there.
    if (caseData?.id) {
      const beforeExternalId = editingSpecimen?.externalId;
      const beforeExternalIdSource = editingSpecimen?.externalIdSource;
      const wasComplete = !!beforeExternalId && !!beforeExternalIdSource;
      const isNowComplete = !!saved.externalId && !!saved.externalIdSource;
      if (isNowComplete && (!wasComplete || saved.externalId !== beforeExternalId)) {
        mockAuditService.logEvent({
          type: 'system', event: 'Foreign ID Bound',
          detail: `Specimen ${saved.label} bound to foreign id "${saved.externalId}" (source: ${saved.externalIdSource}).`,
          user: signingUser?.id ?? 'unknown', caseId: caseData.id, confidence: null,
        }).catch(err => console.error('[Grossing] Failed to log Foreign ID Bound audit entry:', err));
      }
    }

    if (!caseData) return;
    const isNewSpecimen = (prev => (prev.specimens ?? []).findIndex(s => s.id === saved.id) < 0)(caseData!);
    const existingIdx = (caseData!.specimens ?? []).findIndex(s => s.id === saved.id);
    const nextSpecimens = existingIdx >= 0
      ? (caseData!.specimens ?? []).map(s => s.id === saved.id ? saved : s)
      : [...(caseData!.specimens ?? []), saved];
    setCaseData(prev => prev ? ({ ...prev, specimens: nextSpecimens }) : prev);
    try {
      await caseRouter.updateCase(caseData!.id, { specimens: nextSpecimens } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
      } else {
        console.error('[PostHocCorrection] Failed to persist specimen:', e);
      }
    }

    // A specimen added mid-workflow (not at accession) never
    // goes through evaluateGrossingTemplateAssignment, so it
    // would otherwise have zero grossingReports — invisible in
    // the Sidebar's unified editor and permanently blocking
    // Gross Complete's per-specimen check with no way to
    // resolve it. Run the exact same evaluation accession uses,
    // so this specimen gets a real, fillable draft grossing
    // entry immediately, same as if it had existed from the
    // start.
    if (isNewSpecimen) {
      (async () => {
        try {
          const templateModule = await import('@/services/templates/templateService');
          const { grossingRoutingOverrideService } = await import('@/services');
          const { evaluateGrossingTemplateAssignment } = await import('@/services/cases/mockCaseService');

          const allTemplates = await templateModule.listTemplates('published');
          const availableTemplates = (allTemplates as any[])
            .filter(t => t.isDiagnostic === false)
            .map(t => ({ id: t.id, name: t.name, category: t.category }));

          const overridesRes = await grossingRoutingOverrideService.getAll();
          const routingOverrides = (overridesRes.ok ? overridesRes.data : [])
            .filter((o: any) => o.active)
            .map((o: any) => ({ clientId: o.clientId, specimenType: o.specimenType, grossingTemplateId: o.grossingTemplateId }));

          const evalResult = await evaluateGrossingTemplateAssignment({
            specimens: [{
              specimenId: saved.id,
              specimenLabel: saved.label,
              specimenDesc: saved.description,
              specimenType: (saved as any)._entry?.type,
              bodySite: (saved as any)._entry?.site,
              laterality: (saved as any)._entry?.laterality,
            }],
            clinicalIndication: caseData?.order?.clinicalIndication,
            caseContext: { clientId: caseData?.order?.clientId },
            availableTemplates,
            routingOverrides,
          } as any);

          const assignment = evalResult.assignments?.[0];
          const newGrossingReport = {
            instanceId: `${saved.id}_grossing_${Math.random().toString(36).slice(2, 10)}`,
            specimenId: saved.id,
            templateId: assignment?.templateId ?? 'grossing_standard_tissue',
            templateName: assignment?.templateName ?? 'Standard Tissue Grossing (Gold Standard) — Route A',
            status: 'draft' as const,
            answers: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const nextGrossingReports = [...((caseData as any)!.grossingReports ?? []), newGrossingReport];
          setCaseData(prev => prev ? ({ ...prev, grossingReports: nextGrossingReports } as any) : prev);
          try {
            await caseRouter.updateCase(caseData!.id, { grossingReports: nextGrossingReports } as any, knownVersionRef.current);
            knownVersionRef.current = knownVersionRef.current + 1;
          } catch (e) {
            if (e instanceof ConcurrencyConflictError) {
              setConcurrencyConflict({ actualVersion: e.actualVersion });
              return;
            }
            console.error(e);
          }
          markDirty('Specimens');
        } catch (err) {
          console.error('[AddSpecimen] Grossing template auto-assignment failed:', err);
          showToast('Specimen added, but automatic Grossing template assignment failed — assign one manually');
        }
      })();
    }
    markDirty('Specimens');
    setShowSpecimenEdit(false);
    setEditingSpecimen(null);
  }, [editingSpecimen, caseData, signingUser, setCaseData, knownVersionRef, setConcurrencyConflict, markDirty, showToast, setShowSpecimenEdit, setEditingSpecimen]);




  // ── Stage 1: unified Grossing finalize/re-finalize action ──────────────────
  // Single handler covers both "Gross Complete" (first time) and "Update
  // Gross" (correcting something already finalized) — they're the same
  // event from evaluateSynopticAssignment's point of view: it already
  // takes currentSynoptics and decides replace/add/remove against whatever
  // is already assigned, so re-finalizing after a correction is just
  // calling it again, not a special case. No separate "unlock" action
  // exists — editing a finalized instance's answers is itself what
  // reopens it (see the snapshot-diff useEffect below); this handler only
  // fires on the explicit finalize click.
  //
  // isEvaluatingSynopticFit (below) gates Finalize/Finalize & Next/Sign Out
  // in BottomActionBar while this is running and while any resulting
  // ProtocolChangeModal review is still open (showProtoReview) — a case
  // should not be signable while its synoptic assignment might be stale
  // relative to a just-edited Gross.



  // ── Detects edits to an already-finalized Grossing instance ────────────────
  // Editing IS the reopen action — no separate "unlock" button. Compares
  // each finalized instance's current answers against the snapshot taken
  // at the moment it was last finalized (grossingSnapshotRef, set in
  // handleGrossComplete above). A mismatch means the PA edited a field
  // after finalizing — flip that instance back to 'draft' automatically,
  // which makes BottomActionBar's existing hasUnfinishedGrossing check
  // true again and brings the action button back (labeled "Update Gross",
  // since previouslyFinalized survives the revert).
  //
  // Deliberately reacts to DATA (caseData.grossingReports), not to a
  // specific editing component's onChange — robust regardless of which UI
  // path actually writes the edit (RightSynopticPanel, voice input, AI
  // suggestion acceptance, etc.), though it depends on that edit actually
  // reaching caseData. Grossing-answer editing is new enough in this app
  // (added this conversation) that the real save/autosave wiring for it
  // hasn't been independently confirmed — worth verifying this effect
  // actually fires once there's a running app to test against.

  useEffect(() => {
    if (!caseData?.grossingReports?.length) return;

    const drifted = caseData.grossingReports.filter(g => {
      if (g.status !== 'finalized') return false;
      const snapshot = grossingSnapshotRef.current.get(g.instanceId);
      return snapshot !== undefined && snapshot !== JSON.stringify(g.answers);
    });
    if (drifted.length === 0) return;

    const driftedIds = new Set(drifted.map(g => g.instanceId));
    const nowIso = new Date().toISOString();
    const grossingReports = caseData.grossingReports.map(g =>
      driftedIds.has(g.instanceId)
        ? { ...g, status: 'draft' as const, updatedAt: nowIso } // previouslyFinalized stays true
        : g
    );

    // Real telemetry, independent of the write's outcome — this is the
    // actual "how often does this happen at all" signal. The write below
    // also produces case.write/case.write.conflict events via
    // CaseRouter's own audit logging, but those are generic across every
    // write in this file; this entry is what makes drift specifically
    // attributable when reviewing the audit log later, not just visible
    // as an undifferentiated conflict count. No answer content included
    // — instance IDs and a count only, per this audit trail's PHI-safe
    // detail requirement.
    mockAuditService.logEvent({
      type: 'system',
      event: 'Post-Finalization Drift Detected',
      detail: `${drifted.length} finalized grossing report(s) drifted from their finalized snapshot (instance IDs: ${drifted.map(g => g.instanceId).join(', ')}) — reverting to draft`,
      user: signingUser?.id ?? 'system',
      caseId: caseData.id,
      confidence: null,
    }).catch(() => {}); // never let a telemetry failure block the real correction below

    (async () => {
      try {
        await caseRouter.updateCase(caseData.id, { grossingReports } as any, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
        // Both the snapshot clear AND the local optimistic update are
        // deliberately gated on write success now — not just the
        // snapshot. If setCaseData ran unconditionally (the first pass
        // at this fix), the local view would flip to 'draft' regardless
        // of whether the server write actually landed. That's a second,
        // related bug: the detection filter above requires
        // status === 'finalized', so once local state optimistically
        // moved past that condition, this instance could never be
        // re-examined again — even with the snapshot preserved — because
        // the thing that triggers detection had already been masked
        // locally. Gating both on success means a failed write leaves
        // local state exactly matching server truth (still finalized,
        // still drifted), so detection genuinely re-fires and retries
        // the next time grossingReports changes for any reason, instead
        // of silently diverging into a state nothing will ever revisit.
        drifted.forEach(g => grossingSnapshotRef.current.delete(g.instanceId));
        setCaseData(prev => prev ? ({ ...prev, grossingReports } as typeof prev) : prev);
        mockAuditService.logEvent({
          type: 'system',
          event: 'Post-Finalization Drift Auto-Corrected',
          detail: `${drifted.length} report(s) reverted to draft and saved successfully`,
          user: signingUser?.id ?? 'system',
          caseId: caseData.id,
          confidence: null,
        }).catch(() => {});
      } catch (e) {
        // Deliberately silent to the USER, unlike every user-initiated
        // write elsewhere in this file — this effect runs automatically
        // in the background, not from something the pathologist clicked.
        // A blocking "someone else changed this case" modal popping up
        // unprompted would be jarring and confusing. Local state is
        // deliberately left untouched on failure (see above) so this
        // effect genuinely retries on a future render, instead of just
        // claiming to.
        //
        // NOT silent to telemetry, though — this is the real production
        // signal for "drift was detected but the correction hasn't
        // landed yet," distinct from both a successful correction and a
        // genuine unexpected error, so someone reviewing the audit log
        // can tell the difference between "rare, self-healed quickly"
        // and "detected often, frequently deferred" without having to
        // correlate against generic case.write.conflict counts from
        // every other write in this file.
        //
        // Real admin alert, not just an audit entry, for these two
        // outcomes specifically — this is the one place in the whole
        // drift-correction flow where NOBODY has any visibility at all,
        // not even the pathologist actively viewing this case. Local
        // state stays untouched on failure by design (see above), so
        // there's no visible signal in the UI that anything happened —
        // an audit log entry is real, but only useful to someone who
        // goes looking. A finalized report sitting with unresolved,
        // silently-drifted content until someone happens to check is a
        // real compliance exposure, not a hypothetical one.
        if (e instanceof ConcurrencyConflictError) {
          mockAuditService.logEvent({
            type: 'system',
            event: 'Post-Finalization Drift Correction Deferred',
            detail: `${drifted.length} report(s) detected drifted, but the correction write hit a version conflict — will retry on next change`,
            user: signingUser?.id ?? 'system',
            caseId: caseData.id,
            confidence: null,
          }).catch(() => {});
          alertAdminsOfUnresolvedDrift(caseData.id, drifted.length, 'deferred (version conflict)');
        } else {
          console.error(e);
          mockAuditService.logEvent({
            type: 'system',
            event: 'Post-Finalization Drift Correction Failed',
            detail: `${drifted.length} report(s) detected drifted; correction write failed with an unexpected error`,
            user: signingUser?.id ?? 'system',
            caseId: caseData.id,
            confidence: null,
          }).catch(() => {});
          alertAdminsOfUnresolvedDrift(caseData.id, drifted.length, 'failed (unexpected error)');
        }
      }
    })();
  }, [caseData?.grossingReports, alertAdminsOfUnresolvedDrift, caseData?.id, signingUser]);

  const {
    finalizeSignOut,
    handleSignOutConfirm,
    finalizeCase,
    missingFields,
    showMissingWarning, setShowMissingWarning,
    reviewFields,
    showAiReview, setShowAiReview,
    finalizeAndNextPending,
    showPreFinalise, setShowPreFinalise,
    preFinalSynoptics,
    handleRequestFinalize,
    handlePreFinalConfirm,
    handleFinalizeConfirm,
  } = useSignOutWorkflow({
    caseData, setCaseData, signingUser, showToast, activeReportInstanceId,
    knownVersionRef, setConcurrencyConflict, sendSynopticReportToLis,
    generateReportPdfSnapshot, isOrchestrationMode, orchSections,
    setCaseSigned, setShowSignOutModal, setPendingReconciliation,
    countersignFeedback, specimenDictionary, setFixativeGateSpecimens,
    setPendingFinalizeArgs, synopticPanelRef, setAlertFieldId, safeSetLeftTab, setAmendmentMode,
    setActiveSpecimenId, setActiveReportType,
    setShowAmendmentModal, setShowFinalizeModal, openAmendmentDraft,
    releasePendingAmendmentOrAddendum, log,
  });

  // Previously an anonymous inline closure on each "Cannot Finalise"
  // missing-field card's onClick — closes the modal, switches to the
  // Draft tab if in Orchestration mode, and scrolls to the field.
  const handleMissingFieldClick = useCallback((fieldId: string) => {
    setShowMissingWarning(false);
    if (isOrchestrationMode) safeSetLeftTab('draft');
    setTimeout(() => setAlertFieldId(fieldId), 100);
  }, [isOrchestrationMode, safeSetLeftTab, setAlertFieldId, setShowMissingWarning]);

  // Previously an anonymous inline closure on FixativeTimeGateModal's
  // onContinue JSX prop — persists the pathologist's fixation-time
  // resolutions, then resumes whichever finalize path was gated by them.
  const handleFixativeGateContinue = useCallback(async (resolutions: FixativeResolution[]) => {
    if (!caseData) return;
    const patchedSpecimens = (caseData.specimens ?? []).map((sp: any) => {
      const res = resolutions.find(r => r.specimenId === sp.id);
      if (!res) return sp;
      return {
        ...sp,
        processing: {
          ...sp.processing,
          ...(res.processedAt ? { processedAt: res.processedAt, processedAtIsEstimated: res.processedAtIsEstimated } : {}),
        },
      };
    });

    try {
      await caseRouter.updateCase(caseData.id, { specimens: patchedSpecimens } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData(prev => prev ? ({ ...prev, specimens: patchedSpecimens } as typeof prev) : prev);

      // Audit trail — one SpecimenDeficiency per resolved specimen,
      // same pattern as the order-import dictionary-match
      // deficiency (raised and resolved together, since detection
      // and resolution happen in the same sitting here too).
      await Promise.all(resolutions.map(res => {
        const sp = caseData.specimens?.find((s: any) => s.id === res.specimenId);
        if (!sp) return Promise.resolve();
        return specimenDeficiencyService.raiseAndResolve(
          {
            caseId: caseData.id,
            specimenId: res.specimenId,
            specimenLabel: sp.label,
            deficiencyTypeId: 'def-missing-fixation-time',
            comment: `Fixation time not documented for Specimen ${sp.label} at sign-out.`,
            raisedBy: 'system',
          },
          {
            resolutionTypeId: res.resolutionTypeId,
            resolutionComment: res.resolutionComment,
            resolvedBy: signingUser?.id ?? 'unknown',
          }
        );
      }));

      showToast('Fixation time recorded');
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        // Same reasoning as finalizeSignOut/handleAmendmentSubmit —
        // this gates entry into the finalize flow, so a stale
        // version here shouldn't silently proceed toward signing
        // out a report built against outdated specimen data.
        setConcurrencyConflict({ actualVersion: err.actualVersion, blockOverride: true });
        return;
      }
      console.error('[FixativeGate] Failed to persist resolutions:', err);
      showToast('Could not save fixation time — please try again');
      return;
    }

    setFixativeGateSpecimens(null);
    const args = pendingFinalizeArgs;
    setPendingFinalizeArgs([]);
    // Same gap as the other two finalize paths — fixed the same way.
    (async () => {
      const succeeded = await finalizeCase(args);
      if (succeeded) await releasePendingAmendmentOrAddendum();
    })();
  }, [caseData, knownVersionRef, setCaseData, signingUser, showToast, setConcurrencyConflict, setFixativeGateSpecimens, pendingFinalizeArgs, setPendingFinalizeArgs, finalizeCase, releasePendingAmendmentOrAddendum]);

  // Previously an anonymous inline closure on AddCodeModal's
  // onAddToSpecimens JSX prop — merges new ICD/SNOMED/CPT codes into the
  // case, routing each CPT code to its own specimen's coding.cpt.
  const handleAddCodesToSpecimens = useCallback(async (codes: any[], _specimenIndices: unknown) => {
    if (!caseData) return;
    const newIcd    = codes.filter(c => c.system === 'ICD');
    const newSnomed = codes.filter(c => c.system === 'SNOMED');
    const newCoding = {
      icd10:  [...(((caseData as any).coding?.icd10  ?? []) as any[]), ...newIcd],
      snomed: [...(((caseData as any).coding?.snomed ?? []) as any[]), ...newSnomed],
    };
    // Real fix, Phase 1 of specimen-level CPT association: a real
    // LIS assigns base surgical pathology CPT codes per specimen,
    // not as one flat, undifferentiated case-level list (see
    // types/case/Specimen.ts's own doc comment on
    // Specimen.coding.cpt for the fuller reasoning). The modal
    // already tells us which real specimen each code was applied
    // to via c.specimenId — routes each new CPT code to its own
    // real specimen's coding.cpt.
    const newCptBySpecimenId = new Map<string, string[]>();
    codes.filter(c => c.system === 'CPT').forEach(c => {
      const specId = (c as any).specimenId;
      if (!specId) return; // a CPT code with no real specimen target isn't meaningful to apply
      if (!newCptBySpecimenId.has(specId)) newCptBySpecimenId.set(specId, []);
      newCptBySpecimenId.get(specId)!.push(c.code);
    });
    const updatedSpecimens = (caseData.specimens ?? []).map((sp: any) => {
      const additions = newCptBySpecimenId.get(sp.id);
      if (!additions || additions.length === 0) return sp;
      return { ...sp, coding: { ...(sp.coding ?? {}), cpt: [...((sp.coding?.cpt ?? []) as string[]), ...additions] } };
    });
    try {
      await caseRouter.updateCase(caseData.id, { coding: newCoding, specimens: updatedSpecimens } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        setConcurrencyConflict({ actualVersion: e.actualVersion });
        throw e; // keep the modal open/showing an error, matching the existing "stays open on rejection" contract noted above
      }
      throw e;
    }
    setCaseData(prev => prev ? ({ ...prev, coding: newCoding, specimens: updatedSpecimens } as typeof prev) : prev);
    markDirty('Codes');
  }, [caseData, knownVersionRef, setConcurrencyConflict, setCaseData, markDirty]);

  // ── Orchestrator handlers ──────────────────────────────────
  const {
    isOrchestrating,
    pendingAutoGenerate,
    handleGenerateReport,
    handleStartManualEntry,
    handleAbortGenerate,
    handleRegenerateSection,
    cancelAutoGenerate,
  } = useReportGeneration({
    caseData, signingUser, showToast, orchSections, setOrchSections,
    overrideTemplateId, safeSetLeftTab, leftTab, isOrchestrationMode,
    synopticPanelRef, caseId,
    setResolvedContext, setResolvedTemplateId, setResolvedTemplateName, setResolvedBy,
    setLastGeneratedAt,
  });

  // Real fix, per direct UX simplification: "if they are accessing
  // the Report Draft without touching the template, I think it is
  // safe to assume that... the intent is to dictate." Rather than
  // making every PA click "Start writing manually" every time,
  // auto-opens the same blank, dictation-ready sections the moment
  // they land on Report Draft with the active report genuinely
  // untouched (zero answered fields) — no extra click needed. Two
  // real guards keep this from ever clobbering something real:
  // orchSections.length > 0 (already has content — from a prior
  // Generate/manual start — never auto-replace real work) and the
  // "untouched" check itself, which only looks at the *currently
  // active* report (grossing or synoptic, whichever this stage of
  // the case is actually on) — a PA who went the synoptic-first
  // route and has real answers still sees the normal two-choice
  // empty state instead, since their intent is genuinely ambiguous
  // in that case, not inferrable.
  useEffect(() => {
    if (!isOrchestrationMode || leftTab !== 'draft') return;
    if (orchSections.length > 0) return; // already has content — never auto-clobber
    if (!caseData) return;

    const activeReports = activeReportType === 'grossing'
      ? (caseData.grossingReports ?? [])
      : (caseData.synopticReports ?? []);
    const activeInstance = activeReports.find(r => r.instanceId === activeReportInstanceId);
    const isUntouched = !activeInstance || Object.keys(activeInstance.answers ?? {}).length === 0;

    if (isUntouched) handleStartManualEntry();
  }, [leftTab, isOrchestrationMode, orchSections.length, caseData, activeReportType, activeReportInstanceId, handleStartManualEntry]);


  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  // ── Case not found ─────────────────────────────────────────────────────────
  if (isLoaded && caseNotFound) {
    return (
      <div className="ps-case-not-found">
        <div className="ps-case-not-found-icon">🔍</div>
        <div className="ps-case-not-found-title">Case not found</div>
        <div className="ps-case-not-found-subtitle">No case exists with ID <code className="ps-case-not-found-id">{caseId}</code></div>
        <button
          onClick={() => navigate('/')}
          className="ps-btn-primary ps-case-not-found-button"
        >
          ← Back to Worklist
        </button>
      </div>
    );
  }

  return (
    <div className={`ps-synrp-root ${isLoaded ? 'ps-synrp-root--loaded' : ''}`}>
      {/* Background */}
      <div className="ps-synrp-bg-image" />
      <div className="ps-synrp-bg-overlay" />
      <div className="ps-synrp-bg-gradient" />

      {/* Toast */}
      <SaveToast message={toastMsg} visible={toastVisible} />

      {/* Auto-generate-once confirmation toast — cancelable window before
          a draft is silently created from completed synoptic data. */}
      {pendingAutoGenerate && (
        <div className="ps-autogen-toast">
          <span className="ps-autogen-toast-spinner" />
          <span className="ps-autogen-toast-text">
            Synoptic complete — generating narrative draft…
          </span>
          <button
            onClick={cancelAutoGenerate}
            className="ps-autogen-toast-cancel"
          >Cancel</button>
        </div>
      )}

      {/* Shell */}
      <div className="ps-synrp-shell" role="main">

        {/* NavBar */}
        <NavBar
          onLogoClick={() => guard('/')}
          onLogout={() => setShowLogoutModal(true)}
          onProfileClick={() => setIsProfileOpen(!isProfileOpen)}
        />

        {/* HeaderBar — compact single-strip when in Report Draft (maximises
            editor space), or when the user manually toggles it via the new
            Compact/Full view buttons -- either trigger independently puts
            the header into the same, already-existing compact render path. */}
        <HeaderBar
          caseData={caseData}
          onNavigate={guard}
          onSignOut={() => setShowSignOutModal(true)}
          aiSynthesisStatus={aiSynthesisStatus}
          onAiStatusClick={handleAiStatusReviewClick}
          compact={(isOrchestrationMode && leftTab === 'draft') || isHeaderCompactManual}
          isManuallyCompact={isHeaderCompactManual}
          onToggleManualCompact={() => setIsHeaderCompactManual(v => !v)}
          onChangePriority={canEditPriority ? handleChangePriority : undefined}
          priorityLevels={priorityLevels}
          deficiencyCount={caseDeficiencies.length}
          onOpenDeficiencyHistory={() => setShowDeficiencyModal(true)}
          versionCount={caseVersions.length}
          onOpenVersionHistory={() => setShowVersionHistoryModal(true)}
          focusedBlockId={focusedBlockEntry?.block.id}
          onOpenBlockEditor={() => setShowBlockEditor(true)}
          onCaseUpdate={handleHeaderCaseUpdate}
        />

        {/* Alert bar */}
        {(() => {
          const reports = caseData?.synopticReports ?? [];
          const activeReport = activeReportInstanceId
            ? reports.find(r => r.instanceId === activeReportInstanceId)
            : reports[0];
          const answers = activeReport?.answers ?? caseData?.synopticAnswers ?? {};
          void answers;
          const templateId = activeReport?.templateId ?? caseData?.synopticTemplateId;
          if (!templateId) return null;
          return (
            <div className="ps-alert-banner">
              <div
                onClick={handleAlertBannerClick}
                className="ps-alert-banner-row"
              >
                <div className="ps-alert-banner-text">
                  ⚠️ Alert — Some required fields are incomplete.{' '}
                  <span className="ps-alert-banner-link">
                    {isOrchestrationMode && leftTab === 'draft' ? 'Review required fields →' : 'Click to review →'}
                  </span>
                </div>
                <span
                  className={`ps-alert-chevron${isAlertExpanded ? ' ps-alert-chevron--expanded' : ''}`}
                  onClick={e => { e.stopPropagation(); setIsAlertExpanded(a => !a); }}
                >▼</span>
              </div>
              {isAlertExpanded && (
                <div className="ps-alert-banner-detail">
                  Review all <strong>required fields</strong> marked with * in the synoptic checklist. Ensure all required data elements are completed before finalizing.
                </div>
              )}
            </div>
          );
        })()}

        {/* Main body */}
        <div className="ps-synrp-main-body">

          {/* Sidebar */}
          <SynopticSidebar>
            <Sidebar
              caseData={caseData}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              activeSpecimenId={activeSpecimenId}
              onSelectSpecimen={setActiveSpecimenId}
              onAddSynoptic={() => setShowAddSynopticModal(true)}
              onAddMicroscopic={(specimenId) => {
                setActiveSpecimenId(specimenId);
                setActiveReportType('microscopic');
              }}
              onEditSpecimen={handleEditSpecimen}
              onOpenCaseComment={() => setShowCaseCommentModal(true)}
              onOpenSpecimenComment={(id) => { setActiveSpecimenCommentId(id); setShowSpecimenCommentModal(true); }}
              hasCaseComment={hasCaseComment}
              onOpenRetentionHold={() => setShowRetentionHoldModal(true)}
              hasActiveRetentionHold={(caseData?.retentionHolds ?? []).some(h => h.active)}
              onOpenCaseHold={() => setShowCaseHoldModal(true)}
              hasActiveCaseHold={(caseData?.caseHolds ?? []).some(h => h.active)}
              specimenComments={specimenComments}
              activeReportInstanceId={activeReportInstanceId}
              onSelectReport={(instanceId, specimenId, reportType) => {
                setActiveReportInstanceId(instanceId);
                setActiveSpecimenId(specimenId);
                setActiveReportType(reportType);
              }}
              onDeleteReport={handleDeleteReport}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(v => !v)}
            />
          </SynopticSidebar>

          {/* Left panel — tabbed ──────────────────────────────────────────── */}
          <div className="ps-syn-left-panel-wrap">

            {/* Collapsed sidebar nav strip */}
            {sidebarCollapsed && (() => {
              const allSynoptics = (caseData?.specimens ?? []).flatMap(sp =>
                (caseData?.synopticReports ?? [])
                  .filter(r => r.specimenId === sp.id)
                  .map(r => ({ ...r, specimenLabel: sp.label, specimenDesc: sp.description }))
              );
              const idx     = allSynoptics.findIndex(r => r.instanceId === activeReportInstanceId);
              const current = allSynoptics[idx];
              const prev    = allSynoptics[idx - 1];
              const next    = allSynoptics[idx + 1];
              return (
                <div className="ps-syn-nav-strip">
                  <button
                    className="ps-syn-nav-strip-btn"
                    onClick={() => prev && (setActiveReportInstanceId(prev.instanceId), setActiveSpecimenId(prev.specimenId))}
                    disabled={!prev}
                  >‹</button>
                  <div className="ps-syn-nav-strip-text">
                    {current ? (
                      <>
                        <span className="ps-syn-nav-strip-letter">{current.specimenLabel}:</span>
                        {' '}{current.specimenDesc}
                        <span className="ps-syn-nav-strip-sep">›</span>
                        <span className="ps-syn-nav-strip-name">{current.templateName}</span>
                        <span className="ps-syn-nav-strip-count">{idx + 1} / {allSynoptics.length}</span>
                      </>
                    ) : (
                      <span className="ps-syn-nav-strip-empty">No synoptic selected</span>
                    )}
                  </div>
                  <button
                    className="ps-syn-nav-strip-btn"
                    onClick={() => next && (setActiveReportInstanceId(next.instanceId), setActiveSpecimenId(next.specimenId))}
                    disabled={!next}
                  >›</button>
                </div>
              );
            })()}

            {/* Tab bar */}
            <div className="ps-syn-tabbar">
              {(['draft', 'report', 'material'] as const)
                .filter(tab => tab !== 'draft' || isOrchestrationMode)
                .map(tab => {
                const label = tab === 'draft' ? '✍️ Report Draft' : tab === 'report' ? '📑 Synoptic Reporting' : '🧱 Material';
                const isActive = leftTab === tab;
                const st2 = caseData?.status ?? 'draft';
                // 'pending-countersign' is a per-synoptic-instance status (SynopticReportInstance),
                // not a CaseStatus value — check whether any instance on this case needs it.
                const needsCountersign2 = (caseData?.synopticReports ?? []).some(r => r.status === 'pending-countersign');
                const dot2Class = st2 === 'finalized' ? 'ps-syn-tab-dot--finalized'
                  : st2 === 'pending-review' || needsCountersign2 ? 'ps-syn-tab-dot--pending'
                  : st2 === 'in-progress' ? 'ps-syn-tab-dot--in-progress'
                  : 'ps-syn-tab-dot--draft';
                return (
                  <button
                    key={tab}
                    onClick={() => safeSetLeftTab(tab)}
                    className={`ps-syn-tab-btn${isActive ? ' ps-syn-tab-btn--active' : ''}`}
                  >
                    {label}
                    {tab === 'draft' && isOrchestrationMode && (
                      <span
                        title={`Report status: ${String(st2)}`}
                        className={`ps-syn-tab-dot ${dot2Class}`}
                      />
                    )}
                  </button>
                );
              })}

              {/* Sequencer + DEV tools — right side of tab bar.
                  Hidden in Orchestration draft mode — these move into the
                  centre Full Report pane's own header there instead, since
                  they're document-level controls, not tab-bar navigation. */}
              {!(isOrchestrationMode && leftTab === 'draft') && (
              <div className="ps-syn-tabbar-tools">
                {import.meta.env.DEV && caseData && (
                  <div className="ps-syn-devmenu-wrap">
                    <button
                      ref={devToolsBtnRef}
                      onClick={() => {
                        if (!showDevToolsMenu && devToolsBtnRef.current) {
                          const r = devToolsBtnRef.current.getBoundingClientRect();
                          setDevToolsMenuPos({ top: r.bottom + 4, left: r.left });
                        }
                        setShowDevToolsMenu(v => !v);
                      }}
                      className="ps-syn-dev-btn ps-syn-dev-btn--microscopic"
                      title="DEV ONLY (not visible in production): simulation triggers for testing real workflows without needing the real external event that normally triggers them."
                    >
                      🛠️ Dev Tools {showDevToolsMenu ? '▴' : '▾'}
                    </button>
                    {showDevToolsMenu && devToolsMenuPos && ReactDOM.createPortal(
                      <div className="ps-syn-devmenu ps-syn-devmenu--portaled" style={{ top: devToolsMenuPos.top, left: devToolsMenuPos.left }}>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); handleProtocolChangesDetected([{
                            id: 'demo-proto-1',
                            specimenId:           caseData.specimens?.[0]?.id ?? 'sp-1',
                            specimenLabel:        (caseData.specimens?.[0] as any)?.label ?? 'A',
                            specimenDesc:         caseData.specimens?.[0]?.description ?? 'Core biopsy',
                            currentTemplateId:    'breast_core_general',
                            currentTemplateName:  'Breast Core Biopsy (General)',
                            proposedTemplateId:   'breast_invasive_carcinoma',
                            proposedTemplateName: 'Breast Invasive Carcinoma',
                            reason:               'Microscopic shows invasive ductal carcinoma, nuclear grade 2, tubule formation score 3.',
                            confidence:           92,
                          }]); }}
                          title="Simulates a microscopic review finding invasive ductal carcinoma, prompting the real Protocol Change modal to switch this case from a general Breast Core Biopsy template to Breast Invasive Carcinoma — tests that workflow without needing real microscopic findings."
                        >
                          ⚡ Sim Microscopic
                        </button>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); simulateLisAmendmentReceived(); }}
                          title="Simulates the LIS notifying PathScribe that this case was corrected directly in the LIS, outside PathScribe — creates a real LIS Amendment Notice and sends the signing pathologist an urgent message to review whether their own synoptic report also needs amending. Tests that notification workflow without a real, external LIS integration."
                        >
                          ⚡ Sim LIS Amendment
                        </button>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); simulateBlockExceptionReceived(); }}
                          title="Simulates a real inbound BlockExceptionEventPayload — exactly what a real LIS/middleware integration engine would eventually send — marking this case's first block Damaged through the real, working ingestion service (processBlockExceptionEvent). Tests that pipeline without a real, external LIS integration."
                        >
                          ⚡ Sim Block Exception
                        </button>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); simulateMaterialLocationReceived(); }}
                          title="Simulates a real inbound MaterialLocationEventPayload — exactly what a real LIS/middleware integration engine would eventually send — updating this case's first block's real, displayed location through the real, working ingestion service (processMaterialLocationEvent). Tests that pipeline without a real, external LIS integration."
                        >
                          ⚡ Sim Location Update
                        </button>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); simulateCassetteDispatchOutcomeReceived(); }}
                          title="Simulates a real inbound CassetteDispatchOutcomeEventPayload — exactly what a real Cassette Engine would eventually report back — a Green/Mesh hopper empty, falling back to White, through the real, working ingestion service (processCassetteDispatchOutcomeEvent). Tests the real fallback/hopper-empty notification without real hardware."
                        >
                          ⚡ Sim Cassette Dispatch
                        </button>
                        <button
                          className="ps-syn-devmenu-item"
                          onClick={() => { setShowDevToolsMenu(false); simulateFullMaterialTreeLocationUpdate(); }}
                          title="Walks EVERY real material item on this case (every specimen, block, slide, decant, and decant slide) and fires a real, individually-idempotent MaterialLocationEventPayload for each through the same real ingestion service (processMaterialLocationEvent) — leaves every item with a genuine lastKnownLocation, cycling through the real workflow-stage vocabulary so it looks like a case mid-workflow. For testing the tracking UI with full coverage, not just one item."
                        >
                          ⚡ Sim ALL Locations
                        </button>
                      </div>,
                      document.body,
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowSequencer(true)}
                  title="Open report sequencer"
                  className="ps-syn-sequencer-btn"
                >
                  🔀 Sequencer ↗
                </button>
              </div>
              )}

            </div>

            {/* Tab content */}
            <div className="ps-syn-tab-content">
              {/* Report Draft — three-column Orchestration layout (O26- cases only)
                  Navigator (foldable) | Full Report (centre, read-only) | Section Editor (right)
                  All three share activeSectionId — clicking in any pane updates the other two. */}
              {isOrchestrationMode && (
              <div className={`ps-syn-tab-panel ps-syn-tab-panel--dark${leftTab === 'draft' ? ' ps-syn-tab-panel--visible-flex' : ''}`}>

                {/* ── CENTRE: Full Report — read-only formatted preview ───────
                    Has its own sticky header for document-level controls:
                    template identity/selector, Sim Microscopic, Sequencer,
                    Print. These are properties of the DOCUMENT, not the
                    editor — they don't belong in the right-hand editor's
                    toolbar, which is reserved for editing actions only. */}
                <div className="ps-ose-centre-pane-wrap">
                  <div className="ps-ose-centre-header">
                    <div className="ps-ose-centre-header-left">
                      <span className="ps-ose-centre-tmpl-name">{resolvedTemplateName ?? 'Gold Standard — General Surgical Pathology'}</span>
                      <span className="ps-ose-centre-tmpl-by">
                        {overrideTemplateId ? 'pathologist override' : `by ${(resolvedBy ?? 'gold-standard').replace(/-/g, ' ')}`}
                      </span>
                      <div className="ps-ose-tmpl-change-wrap">
                        <button className="ps-ose-centre-btn" onClick={() => setShowCentreTemplatePicker(v => !v)}>Change ▾</button>
                        {showCentreTemplatePicker && (
                          <div className="ps-ose-tmpl-picker">
                            <div className="ps-ose-tmpl-picker-title">Select report template</div>
                            {orchSections.some(s => s.text) && (
                              <div className="ps-ose-tmpl-picker-warn">⚠️ Changing template will regenerate all sections.</div>
                            )}
                            {centreTemplates.map(t => (
                              <div
                                key={t.id}
                                className={`ps-ose-tmpl-option${(overrideTemplateId ?? '') === t.id ? ' ps-ose-tmpl-option--active' : ''}`}
                                onClick={() => { setOverrideTemplateId(t.id); setShowCentreTemplatePicker(false); }}
                              >
                                <span className="ps-ose-tmpl-option-name">{t.name}</span>
                                {t.specialty && <span className="ps-ose-tmpl-option-meta">{t.specialty}</span>}
                              </div>
                            ))}
                            <div className="ps-ose-tmpl-option" onClick={() => { setOverrideTemplateId(null); setShowCentreTemplatePicker(false); }}>
                              <span className="ps-ose-tmpl-option-name">↺ System-resolved</span>
                              <span className="ps-ose-tmpl-option-meta">{resolvedTemplateName ?? 'Gold Standard'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ps-ose-centre-header-right">
                      {import.meta.env.DEV && caseData && (
                        <button
                          className="ps-ose-centre-btn ps-ose-centre-btn--sim"
                          onClick={() => handleProtocolChangesDetected([{
                            id: 'demo-proto-1',
                            specimenId:           caseData.specimens?.[0]?.id ?? 'sp-1',
                            specimenLabel:        (caseData.specimens?.[0] as any)?.label ?? 'A',
                            specimenDesc:         caseData.specimens?.[0]?.description ?? 'Core biopsy',
                            currentTemplateId:    'breast_core_general',
                            currentTemplateName:  'Breast Core Biopsy (General)',
                            proposedTemplateId:   'breast_invasive_carcinoma',
                            proposedTemplateName: 'Breast Invasive Carcinoma',
                            reason:               'Microscopic shows invasive ductal carcinoma, nuclear grade 2, tubule formation score 3.',
                            confidence:           92,
                          }])}
                          title="DEV ONLY (not visible in production): simulates a microscopic review finding invasive ductal carcinoma, prompting the real Protocol Change modal to switch this case from a general Breast Core Biopsy template to Breast Invasive Carcinoma — tests that workflow without needing real microscopic findings."
                        >⚡ Sim Microscopic</button>
                      )}
                      <button className="ps-ose-centre-btn" onClick={() => setShowSequencer(true)} title="Open report sequencer">
                        🔀 Sequencer ↗
                      </button>
                      <button className="ps-ose-centre-btn" onClick={handleOrchPrint} disabled={isPrinting} title="Print report">
                        {isPrinting ? '🖨 Printing…' : '🖨 Print'}
                      </button>
                    </div>
                  </div>
                  <div className="ps-ose-centre-pane">
                    <ReportPreviewRenderer
                      sections={orchSections}
                      bodyAssembly={resolvedContext?.narrativeTemplate.bodyAssembly ?? []}
                      headerAssembly={resolvedContext?.narrativeTemplate.headerAssembly ?? []}
                      footerAssembly={resolvedContext?.narrativeTemplate.footerAssembly ?? []}
                      structuredContext={resolvedContext}
                      caseData={caseData}
                      templateName={resolvedTemplateName}
                      resolvedBy={resolvedBy}
                      activeSectionId={activeSectionId}
                      onSectionClick={setActiveSectionId}
                      documentStyle={resolvedContext?.narrativeTemplate.documentStyle}
                    />
                  </div>
                </div>

                {/* ── RIGHT: Section editor ────────────────────────────────── */}
                <div className="ps-ose-right-pane">
                  <OrchestratorSectionEditor
                    tabWidthChars={tabWidthChars}
                    onTabWidthChange={handleTabWidthChange}
                    sections={orchSections}
                    isGenerating={isOrchestrating}
                    lastGeneratedAt={lastGeneratedAt}
                    caseData={caseData}
                    resolvedTemplateName={resolvedTemplateName}
                    resolvedBy={resolvedBy}
                    overrideTemplateId={overrideTemplateId}
                    onOverrideTemplate={setOverrideTemplateId}
                    activeSectionId={activeSectionId}
                    onActiveSectionChange={setActiveSectionId}
                    onSectionChange={handleSectionTextChange}
                    onAcceptSection={handleAcceptSection}
                    onAcceptDraft={handleAcceptDraft}
                    onKeepVersion={handleKeepVersion}
                    onRegenerateSection={handleRegenerateSection}
                    onAcceptAll={handleAcceptAllSections}
                    onGenerateReport={isOrchestrationMode ? handleGenerateReport : undefined}
                    onStartManualEntry={isOrchestrationMode ? handleStartManualEntry : undefined}
                    documentStyle={resolvedContext?.narrativeTemplate.documentStyle}
                  />
                </div>
              </div>
              )}

              {/* Sequencer — now a modal, triggered by tab button */}
              <SequencerPanel
                show={showSequencer}
                onClose={() => setShowSequencer(false)}
                onSave={handleSequencerSave}
                caseData={caseData}
                activeReportInstanceId={activeReportInstanceId}
                onSelectReport={(instanceId, specimenId, reportType) => {
                  setActiveReportInstanceId(instanceId);
                  setActiveSpecimenId(specimenId);
                  setActiveReportType(reportType);
                }}
              />

              {/* Full Report — LIS-sourced for CoPilot mode; for
                  Orchestration mode, caseData.diagnostic is kept synced
                  from orchSections (see syncOrchSectionsToDiagnostic above
                  — runs both on orchSections change and explicitly on
                  switching onto this tab), so LeftReportPanel reflects the
                  current draft without needing a different renderer here.
                  Keeping LeftReportPanel for both modes preserves the
                  field-label "click to highlight source in report"
                  feature (RightSynopticPanel's onHighlight callback only
                  ever targeted LeftReportPanel's highlightText prop). */}
              <div className={`ps-syn-tab-panel ps-syn-tab-panel--scroll${leftTab === 'report' ? ' ps-syn-tab-panel--visible-block' : ''}`}>
                {pendingLisNotice && (
                  <div className="ps-lis-triage-banner">
                    <div>
                      <div className="ps-lis-triage-title">⚠ LIS Amendment — Review Required</div>
                      <p className="ps-lis-triage-summary">{pendingLisNotice.lisAmendmentSummary}</p>
                    </div>
                    <button className="ps-conf-btn-primary" onClick={handleMarkReviewedNoChanges}>
                      Mark Reviewed — No PathScribe Changes Required
                    </button>
                  </div>
                )}
                <AmendmentDraftBanner caseData={caseData} activeReportInstanceId={activeReportInstanceId} onEdit={handleRequestAmendment} />
                <AmendmentStatusBanner caseId={caseData?.id} synopticReports={caseData?.synopticReports} />

                <ReleaseBufferBanner
                  caseData={caseData}
                  currentUserId={signingUser?.id}
                  currentUserName={signingUser?.name}
                  setCaseData={setCaseData}
                  showToast={showToast}
                />
                {(caseData as any)?.status === 'pending-countersign' && (() => {
                  const residentP = (caseData as any)?.participants?.find((p: any) => p.status === 'active' && p.participationTypeIds?.includes('resident'));
                  const attendingP = (caseData as any)?.participants?.find((p: any) => p.status === 'active' && p.participationTypeIds?.includes('attending'));
                  const viewerIsResident = residentP?.staffId === signingUser?.id;
                  return (
                    <div className="ps-defic-review-banner" style={{ marginBottom: 12, borderColor: 'rgba(96,165,250,0.4)' }}>
                      <span>
                        🎓 {viewerIsResident
                          ? `Released for countersign — awaiting ${attendingP?.staffName ?? 'the attending'}'s review.`
                          : `Released by ${residentP?.staffName ?? 'the resident'} — your countersign is pending.`}
                      </span>
                    </div>
                  );
                })()}
                <LeftReportPanel caseData={caseData} highlightText={highlightText ?? undefined} onMatchResolved={found => setHighlightNotFound(!found)} />
              </div>
              <div className={`ps-syn-tab-panel${leftTab === 'material' ? ' ps-syn-tab-panel--visible-block' : ''}`}>
                <MaterialTreePanel
                  caseData={caseData}
                  activeSpecimenId={activeSpecimenId}
                  onOpenBlockEditor={(blockOrDecantId) => {
                    // Real bug fix, per direct follow-up: "decant-level
                    // linking UI." MaterialTreePanel.tsx's own decant
                    // slide row already called this same callback with
                    // a real decant's own id — previously, allBlocks
                    // never matched it, silently failing to focus
                    // anything while still opening the modal, which
                    // then showed every ordinary block with nothing
                    // decant-related in it at all. Checks blocks first
                    // (the common case), falls through to decants.
                    const blockIdx = allBlocks.findIndex(b => b.block.id === blockOrDecantId);
                    if (blockIdx >= 0) {
                      setFocusedBlockIndex(blockIdx);
                      setFocusedDecantId(null);
                    } else if (allDecants.some(d => d.decant.id === blockOrDecantId)) {
                      setFocusedDecantId(blockOrDecantId);
                    }
                    setShowBlockEditor(true);
                  }}
                  onOpenMatrixBlockEditor={(matrixBlockId) => setViewingMatrixBlockId(matrixBlockId)}
                  onAddSpecimen={() => { setEditingSpecimen(null); setShowSpecimenEdit(true); }}
                  onAddBlock={handleAddBlock}
                  onUpdateBlock={handleUpdateBlock}
                  onReleaseGrossingBlocks={handleReleaseGrossingBlocks}
                  onRemovePendingBlock={handleRemovePendingBlock}
                  onAddDecant={handleAddDecant}
                  onAssignBaseCode={(_specimenId, specimenIndex) => {
                    setCodesModalTargetSpecimenIndex(specimenIndex);
                    setShowCodesModal(true);
                    log('codes_modal_opened', { caseId: caseId ?? '' });
                  }}
                  onCreateBiopsyArray={() => setShowCreateBiopsyArrayModal(true)}
                  onEditBiopsyArray={(matrixBlockId) => setEditingMatrixBlockId(matrixBlockId)}
                  onBatchPrintCassettes={handleBatchPrintCassettes}
                  onReprintAllSlides={handleBatchPrintSlides}
                  pendingCassetteVerification={pendingCassetteVerification}
                  isOrchestrationMode={isOrchestrationMode}
                />
              </div>

              {/* Computational */}
            </div>
          </div>


          {/* Right panel — hidden in orchestration draft mode (Sequencer provides synoptic access) */}
          <div className={`ps-syn-right-panel${isOrchestrationMode && leftTab === 'draft' ? ' ps-syn-right-panel--collapsed' : ''}`}>
            <div className="ps-syn-right-panel-scroll">
              {activeReportType === 'microscopic' && activeSpecimenId ? (
                <MicroscopicEntryPanel
                  specimenId={activeSpecimenId}
                  specimenLabel={caseData?.specimens?.find(sp => sp.id === activeSpecimenId)?.label ?? ''}
                  specimenDesc={caseData?.specimens?.find(sp => sp.id === activeSpecimenId)?.description}
                  instance={microscopicEntry.getInstance(activeSpecimenId)}
                  onSaveDraft={microscopicEntry.saveDraft}
                  onConfirmAndSave={microscopicEntry.confirmAndSave}
                  onClearAndSave={microscopicEntry.clearAndSave}
                />
              ) : (
              <RightSynopticPanel
                ref={synopticPanelRef}
                caseData={caseData}
                activeTab={activeTab}
                activeReportInstanceId={activeReportInstanceId}
                activeReportType={activeReportType === 'microscopic' ? 'synoptic' : activeReportType}
                activeSpecimenId={activeSpecimenId}
                onReportInstanceChange={setActiveReportInstanceId}
                onReportTypeChange={setActiveReportType}
                onCaseUpdate={(updated) => { setCaseData(updated); markDirty('Synoptic fields'); }}
                isDirty={hasUnsavedData}
                scrollToField={alertFieldId}
                onScrollComplete={() => setAlertFieldId(null)}
                onHighlight={setHighlightText}
                highlightNotFound={highlightNotFound}
                onAiSuggestionsUpdate={setAiSuggestions}
              />
              )}
            </div>
          </div>
        </div>


        {/* Bottom action bar */}
        <BottomActionBar
          caseData={caseData}
          isDirty={hasUnsavedData}
          onSaveDraft={async () => {
            await saveDraftInternal();
          }}
          onSaveAndNext={async () => {
            const saved = await saveDraftInternal();
            if (!saved) return; // held by a real conflict — don't proceed to the next case
            navigateToCase('next');
          }}
          onFinalize={() => handleRequestFinalize(false)}
          onFinalizeAndNext={() => handleRequestFinalize(true)}
          onSignOut={() => { if (caseData?.reportingMode !== 'assist') setShowSignOutModal(true); }}
          onRequestAmendment={handleRequestAmendment}
          onPrint={openCopilotReportView}
          onOpenReprints={() => setShowReprintModal(true)}
          
          onHistory={() => setIsSimilarCasesOpen(true)}
          onFlags={() => { openFlagManager(caseData); log('flag_manager_opened', { caseId: caseId ?? '' }); }}
          onDelegate={() => setShowDelegateModal(true)}
          onTeam={() => { setShowTeamModal(true); log('team_modal_opened', { caseId: caseId ?? '' }); }}
          onCodes={() => { setCodesModalTargetSpecimenIndex(null); setShowCodesModal(true); log('codes_modal_opened', { caseId: caseId ?? '' }); }}
          onNextCase={() => { if (shouldWarnDirty()) { setPendingNavigation('next'); } else { navigateToCase('next'); } }}
          onPreviousCase={() => { if (shouldWarnDirty()) { setPendingNavigation('prev'); } else { navigateToCase('prev'); } }}
          onGenerateReport={isOrchestrationMode ? handleGenerateReport : undefined}
          onGrossComplete={isOrchestrationMode ? handleGrossComplete : undefined}
          synopticFitPending={isEvaluatingSynopticFit || showProtoReview || showGrossingProtoReview}
          isGenerating={isOrchestrating}
          onAbortGenerate={handleAbortGenerate}
        />
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}

      <CaseSignOutModal
        show={showSignOutModal}
        accession={caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? ''}
        signOutUser={signOutUser}
        signOutPassword={signOutPassword}
        signOutError={signOutError}
        onClose={() => setShowSignOutModal(false)}
        onUserChange={setSignOutUser}
        onPasswordChange={setSignOutPassword}
        onConfirm={handleSignOutConfirm}
        isCountersign={(caseData as any)?.status === 'pending-countersign'}
        residentName={(caseData as any)?.participants?.find((p: any) => p.status === 'active' && p.participationTypeIds?.includes('resident'))?.staffName}
        countersignFeedback={countersignFeedback}
        onCountersignFeedbackChange={setCountersignFeedback}
        specimens={caseData?.specimens as any}
        onAssignBaseCode={(_specimenId, specimenIndex) => {
          setCodesModalTargetSpecimenIndex(specimenIndex);
          setShowCodesModal(true);
          log('codes_modal_opened', { caseId: caseId ?? '' });
        }}
      />

      {concurrencyConflict && (
        <div data-capture-hide="true" className="ps-overlay">
          <div className="ps-modal-dark ps-modal-dark--sm ps-modal-dark--centered">
            <div className="ps-modal-dark-emoji">⚠️</div>
            <div className="ps-modal-dark-header ps-modal-dark-header--center">
              <span className="ps-modal-dark-title">Someone else changed this case</span>
            </div>
            <p className="ps-modal-dark-body ps-modal-dark-body--center">
              This case was updated by someone else since you opened it (their version is #{concurrencyConflict.actualVersion}) —
              after you opened it. {concurrencyConflict.blockOverride
                ? 'This action affects the finalized report, so it can only proceed against the current version — reload to see their changes before continuing.'
                : 'Your unsaved changes here haven\'t been lost yet, but saving now would overwrite theirs.'}
            </p>
            {!concurrencyConflict.blockOverride && (
              <p className="ps-modal-dark-hint ps-modal-dark-hint--center">
                Reload to see their version (your local changes here will be lost), or save yours anyway and overwrite theirs.
              </p>
            )}
            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="ps-btn-ghost-dark" onClick={() => setConcurrencyConflict(null)}>Keep Working — Decide Later</button>
              <button className="ps-btn-ghost-dark" onClick={handleConcurrencyReload}>Reload Their Version</button>
              {!concurrencyConflict.blockOverride && (
                <button className="ps-btn-amber" onClick={handleConcurrencyForceSave}>Save Mine Anyway</button>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingReconciliation && caseData && (
        <DiscordanceReconciliationModal
          caseId={caseData.id}
          specimenId={pendingReconciliation.specimenId}
          caseType={pendingReconciliation.caseType}
          frozenCategory={pendingReconciliation.frozenCategory}
          frozenDx={pendingReconciliation.frozenDx}
          performedBy={{ userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' }}
          draftedBy={(() => {
            // A resident/fellow participant whose draft is being
            // reconciled by whoever is currently signing out — undefined
            // for the common non-teaching path (no resident on the team,
            // or the signing pathologist IS the resident themselves,
            // which isn't a teaching relationship).
            const resident = (caseData as any)?.participants?.find(
              (p: any) => p.status === 'active' && p.participationTypeIds?.includes('resident') && p.staffId !== signingUser?.id
            );
            return resident ? { userId: resident.staffId, userName: resident.staffName } : undefined;
          })()}
          subspecialtyId={(caseData as any)?.subspecialtyId}
          onDone={finalizeSignOut}
        />
      )}

      {intraopMatch && caseData && (
        <IntraopMergePromptModal
          caseId={caseData.id}
          match={intraopMatch}
          onMergeNow={handleIntraopMergeNow}
          onGoToQueueLater={() => { setIntraopMatch(null); navigate('/intraop-queue'); }}
          onDismiss={() => setIntraopMatch(null)}
        />
      )}

      <CopilotReportViewModal
        show={showCopilotReportView}
        onClose={() => setShowCopilotReportView(false)}
        accession={caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? ''}
        patient={caseData?.patient ? `${caseData.patient.familyNames ?? caseData.patient.lastName}, ${caseData.patient.givenNames ?? caseData.patient.firstName}` : ''}
        mrn={caseData?.patient?.mrn ?? ''}
        instances={copilotReportInstances}
      />

      {showAiReview && (
        <AiReviewModal
          fields={reviewFields}
          finalizeAndNext={finalizeAndNextPending}
          onConfirm={(fieldId: string) => synopticPanelRef.current?.setFieldVerification(fieldId, 'verified')}
          onOverride={(fieldId: string) => synopticPanelRef.current?.setFieldVerification(fieldId, 'disputed')}
          onSkip={(_fieldId: string) => { /* stays unverified */ }}
          onComplete={(summary) => {
            console.info('[PathScribe] AI review summary:', summary);
            setShowAiReview(false);
            setShowFinalizeModal(true);
          }}
          onCancel={() => setShowAiReview(false)}
        />
      )}

      {showMissingWarning && (
        <div className="ps-cannot-fin-overlay" onClick={() => setShowMissingWarning(false)}>
          <div className="ps-cannot-fin-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-cannot-fin-header">
              <span className="ps-cannot-fin-header-icon">⚠️</span>
              <div>
                <div className="ps-cannot-fin-header-tag">Cannot Finalise</div>
                <div className="ps-cannot-fin-header-title">Required Fields Incomplete</div>
              </div>
            </div>
            <div className="ps-cannot-fin-body">
              <p className="ps-cannot-fin-desc">
                The following required fields must be completed before this report can be finalised:
              </p>
              <div className="ps-cannot-fin-list">
                {missingFields.map((f, i) => (
                  <button
                    key={i}
                    className="ps-cannot-fin-card"
                    title="Click to jump to this field"
                    onClick={() => handleMissingFieldClick(f.fieldId)}
                  >
                    <span className="ps-cannot-fin-card-x">✗</span>
                    <div className="ps-cannot-fin-card-body">
                      <div className="ps-cannot-fin-card-label">{f.fieldLabel}</div>
                      <div className="ps-cannot-fin-card-section">{f.sectionTitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="ps-cannot-fin-footer">
              <span className="ps-cannot-fin-footer-count">{missingFields.length} field{missingFields.length !== 1 ? 's' : ''} need attention</span>
              <button className="ps-btn-primary" onClick={() => setShowMissingWarning(false)}>
                Return and Fix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-finalisation review — two-pane: specimen list + Q&A preview + signing */}
      <PreFinalisationModal
        show={showPreFinalise}
        onJumpToField={(_instanceId, fieldKey) => {
          setShowPreFinalise(false);
          safeSetLeftTab('draft');
          setTimeout(() => setAlertFieldId(fieldKey), 100);
        }}
        caseAccession={caseData?.accession?.fullAccession ?? ''}
        patientName={`${caseData?.patient?.firstName ?? ''} ${caseData?.patient?.lastName ?? ''}`.trim()}
        reportingMode={caseData?.reportingMode === 'assist' ? 'assisted' : 'pathscribe'}
        synoptics={preFinalSynoptics}
        userId={(caseData as any)?.order?.assignedTo ?? 'current'}
        userDisplayName={(caseData as any)?.assignedPathologistName ?? 'Pathologist'}
        userCredentials=""
        finalizeAndNext={finalizeAndNextPending}
        onConfirm={handlePreFinalConfirm}
        onCancel={() => setShowPreFinalise(false)}
      />

      {/* Legacy per-synoptic password confirm — kept for deferred/amendment flow */}
      <FinalizeSynopticModal
        show={showFinalizeModal}
        activeSynoptic={null}
        finalizePassword={finalizePassword}
        finalizeError={finalizeError}
        finalizeAndNext={false}
        onClose={() => setShowFinalizeModal(false)}
        onPasswordChange={setFinalizePassword}
        onConfirm={handleFinalizeConfirm}
      />

      {/* Protocol change review — AI proposes after microscopic received */}
      <ProtocolChangeModal
        show={showProtoReview}
        changes={protoChanges}
        onCommit={handleProtoCommit}
        onCancel={() => setShowProtoReview(false)}
      />

      {/* Real feature, per direct follow-up: "there is kind of a workflow
          that allows the Gross to be dictated and on submission, the AI
          reads the Text, and updates the template... Not sure if there is
          bearing here." Real bearing — this is that same real, proven
          ProtocolChangeModal component, reused as-is (its own props are
          genuinely generic, nothing Synoptic-specific), now also reviewing
          real Grossing Template fit changes proposed after Gross
          Description dictation. Deliberately a second, separate instance
          from the Synoptic one above, not a shared one — a single Gross
          Complete can propose real changes to both independently; see
          useAmendmentWorkflow.ts's own comment on showGrossingProtoReview
          for why conflating them would be worse, not simpler. */}
      <ProtocolChangeModal
        show={showGrossingProtoReview}
        changes={grossingProtoChanges}
        onCommit={handleGrossingProtoCommit}
        onCancel={() => setShowGrossingProtoReview(false)}
      />

      <AmendmentModal
        show={showAmendmentModal}
        amendmentMode={amendmentMode}
        amendmentText={amendmentText}
        activeSynopticTitle={(() => {
          const r = caseData?.synopticReports?.find(rr => rr.instanceId === activeReportInstanceId);
          if (!r) return caseData?.accession?.fullAccession ?? 'Case';
          const specimen = caseData?.specimens?.find((s: any) => s.id === r.specimenId);
          return specimen ? `Specimen ${specimen.label}: ${r.templateName}` : r.templateName;
        })()}
        sequenceNumber={amendmentSequenceNumber}
        amendedByName={signingUser?.name ?? 'Unknown User'}
        versionHistory={versionHistory}
        resuming={resumingAmendment}
        orderingPhysicianName={caseData?.order?.requestingProvider}
        onModeChange={setAmendmentMode}
        onTextChange={setAmendmentText}
        onClose={() => { setShowAmendmentModal(false); setAmendmentDraftId(null); setAmendmentSubmitError(null); setResumingAmendment(undefined); }}
        onSubmit={handleAmendmentSubmit}
        onFieldOverridesConfirmed={handleFieldOverridesConfirmed}
        submitError={amendmentSubmitError}
      />

      <LogoutWarningModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onLogout={() => { setShowLogoutModal(false); handleLogout(); }}
      />

      <AddOrdersModal
        show={showAddOrdersModal}
        caseData={caseData}
        activeSpecimenId={activeSpecimenId}
        initialTab={addOrdersInitialTab}
        onClose={() => setShowAddOrdersModal(false)}
        onGoToAddSpecimen={() => {
          setShowAddOrdersModal(false);
          setEditingSpecimen(null);
          setShowSpecimenEdit(true);
        }}
        onGoToAddStain={() => {
          setShowAddOrdersModal(false);
          // openFlagManager doesn't currently support pre-scoping to a
          // specimen — opens at its own default (Case) scope, same as
          // the toolbar Flags button. A real specimen-preselect would
          // mean touching useSynopticFlags/FlagManagerModal's internal
          // state, which is working, tested code — not risking that
          // for this.
          openFlagManager(caseData);
          log('flag_manager_opened', { caseId: caseId ?? '', source: 'add_orders_modal' });
        }}
        onAddBlock={handleAddBlockWithCassette}
      />

      {showSpecimenEdit && caseData && (
        <SpecimenEditModal
          specimen={editingSpecimen}
          nextLabel={String.fromCharCode(65 + (caseData.specimens?.length ?? 0))}
          existingSpecimens={caseData.specimens ?? []}
          isOrchestrationMode={isOrchestrationMode}
          onClose={() => { setShowSpecimenEdit(false); setEditingSpecimen(null); }}
          onSave={handleSpecimenSave}
        />
      )}

      {showCreateBiopsyArrayModal && caseData && (
        <CreateBiopsyArrayModal
          specimens={caseData.specimens ?? []}
          onClose={() => setShowCreateBiopsyArrayModal(false)}
          onSave={async (specimenIds, cassetteLabel) => {
            await handleCreateBiopsyArray(specimenIds, cassetteLabel);
            setShowCreateBiopsyArrayModal(false);
          }}
        />
      )}

      {editingMatrixBlockId && caseData && (() => {
        // Real, architectural fix, per direct follow-up: completes the
        // Biopsy Array feature — computes the current selection (in
        // real position order) from the real MatrixBlock's own
        // participants[], so the edit modal opens pre-populated with
        // what's really linked right now, not a guess.
        const matrixBlockId = editingMatrixBlockId;
        const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === matrixBlockId);
        if (!matrixBlock) return null;
        const linked = matrixBlock.participants.slice().sort((a, b) => a.positionInBlock - b.positionInBlock);
        return (
          <CreateBiopsyArrayModal
            specimens={caseData.specimens ?? []}
            existingCassetteId={matrixBlock.label}
            initialSelectedIds={linked.map(l => l.specimenId)}
            onClose={() => setEditingMatrixBlockId(null)}
            onSave={async (specimenIds) => {
              await handleUpdateBiopsyArray(matrixBlockId, specimenIds);
              setEditingMatrixBlockId(null);
            }}
            onDissolve={async () => {
              await handleDissolveBiopsyArray(matrixBlockId);
              setEditingMatrixBlockId(null);
              setViewingMatrixBlockId(null);
            }}
          />
        );
      })()}

      {/* Real, architectural fix, per direct follow-up: "the matrix
          block itself is the tracked asset." The real, dedicated
          status/piece-tracking editor for a MatrixBlock — distinct
          from the membership editor above. */}
      {viewingMatrixBlockId && caseData && (() => {
        const matrixBlock = (caseData.matrixBlocks ?? []).find(m => m.id === viewingMatrixBlockId);
        if (!matrixBlock) return null;
        return (
          <MatrixBlockEditorModal
            matrixBlock={matrixBlock}
            specimens={caseData.specimens ?? []}
            fullAccession={caseData.accession?.fullAccession ?? caseData.id}
            onUpdate={handleUpdateMatrixBlock}
            onPrintCassette={() => printMatrixCassette?.(matrixBlock.id)}
            onEditMembership={() => { setEditingMatrixBlockId(matrixBlock.id); setViewingMatrixBlockId(null); }}
            onClose={() => setViewingMatrixBlockId(null)}
          />
        );
      })()}

      {showAddSynopticModal && (
        <AddSynopticModal
          caseData={caseData}
          availableProtocols={availableProtocols}
          onClose={() => setShowAddSynopticModal(false)}
          onAdd={handleAddSynopticReports}
        />
      )}

      {showCaseCommentModal && (
        <CaseCommentModal
          accession={caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? ''}
          comments={caseComments}
          currentUserId={signingUser?.id ?? 'unknown'}
          currentUserName={signingUser?.name ?? 'Unknown User'}
          onAddComment={handleAddCaseComment}
          onClose={() => setShowCaseCommentModal(false)}
        />
      )}

      {showRetentionHoldModal && caseData && (
        <RetentionHoldModal
          caseId={caseData.id}
          accession={caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? ''}
          retentionHolds={caseData.retentionHolds ?? []}
          currentUserId={signingUser?.id ?? 'unknown'}
          currentUserName={signingUser?.name ?? 'Unknown User'}
          onUpdated={updated => setCaseData(prev => prev ? { ...prev, retentionHolds: updated } : prev)}
          onClose={() => setShowRetentionHoldModal(false)}
        />
      )}

      {showCaseHoldModal && caseData && (
        <CaseHoldModal
          caseId={caseData.id}
          accession={caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? ''}
          caseHolds={caseData.caseHolds ?? []}
          currentUserId={signingUser?.id ?? 'unknown'}
          currentUserName={signingUser?.name ?? 'Unknown User'}
          onUpdated={updated => setCaseData(prev => prev ? { ...prev, caseHolds: updated } : prev)}
          onClose={() => setShowCaseHoldModal(false)}
        />
      )}

      {showSpecimenCommentModal && activeSpecimenCommentId && (
        <ReportCommentModal
          specimenName={
            caseData?.specimens?.find(s => s.id === activeSpecimenCommentId)
              ? `Specimen ${caseData.specimens.find(s => s.id === activeSpecimenCommentId)!.label} › ${caseData.specimens.find(s => s.id === activeSpecimenCommentId)!.description}`
              : 'Specimen'
          }
          specimenId={activeSpecimenCommentId}
          comments={specimenComments[activeSpecimenCommentId] ?? []}
          isFinalized={false}
          currentUserId={signingUser?.id ?? 'unknown'}
          currentUserName={signingUser?.name ?? 'Unknown User'}
          onAddComment={handleAddSpecimenComment}
          onClose={() => setShowSpecimenCommentModal(false)}
        />
      )}

      {showDeficiencyModal && (
        <DeficiencyHistoryModal
          deficiencies={caseDeficiencies}
          deficiencyTypes={deficiencyTypes}
          resolutionTypes={resolutionTypes}
          onClose={() => setShowDeficiencyModal(false)}
        />
      )}

      {showVersionHistoryModal && (
        <VersionHistoryModal
          versions={caseVersions}
          onClose={() => setShowVersionHistoryModal(false)}
        />
      )}

      {showBlockEditor && caseData && (
        <BlockStainEditorModal
          blocks={allBlocks}
          decants={allDecants}
          casePriority={(caseData as any)?.order?.priority ?? 'Routine'}
          fullAccession={caseData.accession?.fullAccession ?? caseData.id}
          onUpdateBlock={handleUpdateBlock}
          onUpdateDecant={handleUpdateDecant}
          onPrintDecantContainerLabel={handlePrintDecantContainerLabel}
          onSendStainOrder={handleSendStainOrder}
          onCancelBlock={handleCancelBlock}
          onCreateSpareSlide={handleCreateSpareSlide}
          onOrderRestain={handleOrderRestain}
          onClose={() => { setShowBlockEditor(false); setFocusedDecantId(null); }}
          initialFocusBlockId={focusedDecantId ? undefined : focusedBlockEntry?.block.id}
          initialFocusDecantId={focusedDecantId ?? undefined}
        />
      )}

      {fixativeGateSpecimens && caseData && (
        <FixativeTimeGateModal
          specimens={fixativeGateSpecimens}
          onCancel={() => { setFixativeGateSpecimens(null); setPendingFinalizeArgs([]); }}
          onContinue={handleFixativeGateContinue}
        />
      )}

      {isSimilarCasesOpen && caseData && (
        <PatientHistoryModal
          patientName={`${caseData.patient.lastName}, ${caseData.patient.firstName}`}
          mrn={caseData.patient.mrn ?? ''}
          dateOfBirth={caseData.patient.dateOfBirth ?? ''}
          patientId={caseData.patient.id}
          currentCaseId={caseData.id}
          onClose={() => setIsSimilarCasesOpen(false)}
        />
      )}

      {showCodesModal && caseData && (
        <AddCodeModal
          existingCodes={[
            ...(((caseData as any).coding?.icd10 ?? []) as any[]),
            ...(((caseData as any).coding?.snomed ?? []) as any[]),
            // Real fix, Phase 1 of specimen-level CPT association: reads
            // real CPT codes from each real specimen's own coding.cpt
            // (bare code strings, matching what computeWorkRvuForCodes
            // already expects), not a flat, case-level array. Attaches
            // the real specimenId so the modal's existing left-panel
            // grouping-by-specimen logic (already used for ICD/SNOMED)
            // works correctly for CPT too. The modal's own live CPT
            // search shows the real description when re-selecting.
            ...((caseData.specimens ?? []) as any[]).flatMap((sp: any) =>
              ((sp.coding?.cpt ?? []) as string[]).map((code: string) => ({
                id: `cpt-${sp.id}-${code}`, system: 'CPT' as const, code, display: code, source: 'manual' as const, specimenId: sp.id,
              }))
            ),
          ]}
          allSpecimens={(caseData.specimens ?? []).map((sp, i) => ({
            index: i, id: i + 1,
            name: `${sp.label}: ${sp.description ?? ''}`,
          }))}
          clientId={caseData.order?.clientId}
          caseText={{
            gross:       caseData.diagnostic?.grossDescription ?? '',
            microscopic: caseData.diagnostic?.microscopicDescription ?? '',
            ancillary:   caseData.diagnostic?.ancillaryStudies ?? '',
          }}
          synopticAnswers={
            (activeReportInstanceId
              ? caseData.synopticReports?.find(r => r.instanceId === activeReportInstanceId)?.answers
              : caseData.synopticReports?.[0]?.answers
            ) ?? caseData.synopticAnswers ?? {}
          }
          templateName={
            (activeReportInstanceId
              ? caseData.synopticReports?.find(r => r.instanceId === activeReportInstanceId)?.templateName
              : caseData.synopticReports?.[0]?.templateName
            ) ?? ''
          }
          narrativeText={
            (caseData.synopticReports?.find(r => r.instanceId === activeReportInstanceId) as any)?.narrativeContent ?? undefined
          }
          onAddToSpecimens={handleAddCodesToSpecimens}
          onClose={() => { setShowCodesModal(false); setCodesModalTargetSpecimenIndex(null); }}
          originHospitalId={caseData?.originHospitalId}
          activeSpecimenIndex={codesModalTargetSpecimenIndex ?? undefined}
          initialSystem={codesModalTargetSpecimenIndex !== null ? 'CPT' : undefined}
        />
      )}

      {showFlagManager && flagCaseData && (
        <FlagManagerModal
          key={`flag-modal-${flagCaseData.id}`}
          caseData={{
            ...flagCaseData,
            accession: (flagCaseData.accession as any)?.fullAccession ?? (flagCaseData.accession as any)?.accessionNumber ?? flagCaseData.accession ?? '',
            flags: (flagCaseData as any).flags ?? [],
          } as any}
          flagDefinitions={flagDefinitions}
          onApplyFlags={async (...args: Parameters<typeof onApplyFlags>) => { await onApplyFlags(...args); }}
          onRemoveFlag={async (...args: Parameters<typeof onRemoveFlag>) => { await onRemoveFlag(...args); }}
          onDirtyChange={handleFlagsDirtyChange}
          onClose={() => {
            // FlagManagerModal now edits a local draft internally and
            // only calls the real onApplyFlags/onRemoveFlag from its own
            // Save button -- by the time onClose fires, flagCaseData
            // (kept in sync by those calls) is always accurate, whether
            // Save ran or Cancel closed with nothing changed. Safe to
            // sync unconditionally.
            if (flagCaseData && caseData) {
              setCaseData(prev => prev ? {
                ...prev,
                caseFlags: (flagCaseData as any).flags ?? [],
                specimens: prev.specimens?.map(sp => {
                  const updated = flagCaseData.specimens?.find((s: any) => s.id === sp.id);
                  return updated ? { ...sp, specimenFlags: (updated as any).flags ?? [] } : sp;
                }),
              } : prev);
            }
            setShowFlagManager(false);
          }}
        />
      )}

      {showTeamModal && caseData && (
        <CaseTeamModal
          caseData={caseData}
          onClose={() => setShowTeamModal(false)}
          onUpdated={(updated) => { setCaseData(updated); }}
          onDirtyChange={handleTeamDirtyChange}
          onDelegate={() => { setShowTeamModal(false); setDelegateReturnTo('team'); setShowDelegateModal(true); }}
        />
      )}

      {showDelegateModal && (
        <DelegateModal
          isOpen={showDelegateModal}
          onClose={() => {
            setShowDelegateModal(false);
            if (delegateReturnTo === 'team') { setShowTeamModal(true); setDelegateReturnTo(null); }
          }}
          registry={mockActionRegistryService}
          caseId={caseId}
          currentUserId={signingUser?.id}
          onDelegated={() => {
            setShowDelegateModal(false);
            showToast('Case delegated successfully');
            if (delegateReturnTo === 'team') { setShowTeamModal(true); setDelegateReturnTo(null); }
          }}
          synopticInstances={(caseData?.synopticReports ?? []).map(r => ({
            instanceId: r.instanceId,
            specimenDescription: caseData?.specimens?.find(s => s.id === r.specimenId)?.description ?? r.specimenId,
            templateName: r.templateName,
          }))}
        />
      )}

      {/* Tab-switch unsaved draft confirmation — orchestration mode only */}
      {pendingTabSwitch && (
        <div className="ps-tabswitch-overlay">
          <div className="ps-tabswitch-modal">
            <div className="ps-tabswitch-title">
              Unsaved draft changes
            </div>
            <div className="ps-tabswitch-body">
              You have unsaved changes in the report draft. Would you like to save before switching tabs?
            </div>
            <div className="ps-tabswitch-footer">
              <button
                onClick={() => setPendingTabSwitch(null)}
                className="ps-tabswitch-btn ps-tabswitch-btn--cancel"
              >Cancel</button>
              <button
                onClick={handleDiscardAndSwitchTab}
                className="ps-tabswitch-btn ps-tabswitch-btn--discard"
              >Discard &amp; Switch</button>
              <button
                onClick={handleSaveAndSwitchTab}
                className="ps-tabswitch-btn ps-tabswitch-btn--save"
              >Save &amp; Switch</button>
            </div>
          </div>
        </div>
      )}

      {hasExistingDraft && existingDraftSavedAt && (
        <DraftRecoveryModal
          savedAt={existingDraftSavedAt}
          onRestore={handleRestoreDraft}
          onDiscard={discardDraft}
          changes={draftDiff}
        />
      )}

      {showReprintModal && caseData && (
        <ManageReprintsModal
          caseData={caseData}
          onClose={() => setShowReprintModal(false)}
          onReprintRequisition={() => printRequisitionLabel(caseData)}
          onReprintContainer={specimenLabel => {
            const sp = (caseData.specimens ?? []).find((s: any) => s.label === specimenLabel);
            if (sp) { printContainerLabel(caseData, sp).catch(console.error); }
          }}
          onReprintCassette={(specimenLabel, blockLabel) => printCassetteForBlock?.(specimenLabel, blockLabel)}
          onReprintSlide={printSlideForStain}
          batchPrintBlocked={batchPrintBlocked ?? false}
          isOrchestrationMode={!!isOrchestrationMode}
        />
      )}

      <UnsavedWarningModal
        show={!!pendingNavigation || !!pendingPath}
        dirtySections={Array.from(dirtySections)}
        onCancel={() => {
          setPendingNavigation(null);
          cancelContextNavigate();
        }}
        onSaveAndLeave={handleSaveAndLeave}
        onConfirm={() => {
          clearDirty();
          if (pendingPath) confirmContextNavigate();
          const dest = pendingNavigation;
          setPendingNavigation(null);
          if (dest === 'next') navigateToCase('next');
          else if (dest === 'prev') navigateToCase('prev');
          else if (dest === '__back__') {
            if (backPath === '/search') sessionStorage.setItem('pathscribe:searchReturn', '1');
            navigate(backPath);
          }
          else if (dest) navigate(dest);
        }}
      />
    </div>
  );
};

export default SynopticReportPage;
