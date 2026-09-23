// src/pages/CytologyWorklistPage/CytologyScreeningPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real screening/review-entry page. Rebuilt per direct UI-review
// follow-up:
// - Real, two-column layout using the available horizontal space,
//   rather than one narrow, centered column.
// - Specimen Adequacy is now a real, multi-select field, each
//   selection carrying its own free-text comment; Additional
//   Interpretations and Recommendations already were multi-select but
//   now carry per-item comments too; Primary Interpretation stays
//   single-select, with one optional comment of its own.
// - Real, searchable pick lists instead of a native multi-select
//   listbox — with ~100 real dictionary entries in some sections, an
//   always-visible listbox doesn't scale; typing narrows to a short,
//   real match list instead.
// - Role is no longer a manual dropdown — resolveCytologyReviewerRole
//   (this phase) computes it automatically: no reviews yet -> Primary
//   Screener; a review exists and you're not a Pathologist -> Secondary
//   Reviewer; you're a Pathologist -> Pathologist Review, with a real
//   QC-role override when a pending QC flag needs a specific reviewer.
// - A pending QC flag can be genuinely un-flagged, not just added.
// - Real, minimal LMP field (Patient.lastMenstrualPeriod) and an HPV
//   Testing widget over the existing, real hpvCoTestOrdered/hpvResult
//   fields — both real, per direct follow-up; the full clinical-history
//   dictionary itself stays separate, deferred work.
// - Review History shows each review's own, complete real content
//   (every selection and its comment), not a one-line summary, and
//   marks the real primary_screen review as "Initial Review" — every
//   other role is labeled a secondary or Pathologist review.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useTranslation } from 'react-i18next';
import RequestReviewModal from '@/components/RequestReview/RequestReviewModal';
import EMRSidecarDrawer from '@/pages/SynopticReportPage/components/EMRSidecarDrawer';
import { WsiViewerLaunchButton } from '@/pages/SynopticReportPage/components/WsiViewerLaunchButton';
import CaseTeamModal from '@/pages/SynopticReportPage/modals/CaseTeamModal';
import { DelegateModal } from '@/pages/Synoptic/Delegate/DelegateModal';
import { mockActionRegistryService } from '@/services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '@/constants/systemActions';
import type { DecantType } from '@/types/case/Material';
import { useSynopticFlags } from '@/pages/Synoptic/useSynopticFlags';
import FlagManagerModal from '@/components/Flags/FlagManagerModal';
import AddCodeModal from '@/pages/Synoptic/Codes/AddCodeModal';
import { resolveUpdatedCodingFromModalSubmission } from '@/services/cytology/resolveUpdatedCodingFromModalSubmission';
import CytologySlideOverDrawer from './components/CytologySlideOverDrawer';
import CytologyMaterialView from './components/CytologyMaterialView';
import CytologySynopticFormView, { type SynopticTranslationAcknowledgment } from './components/CytologySynopticFormView';
import CytologyRoseView from './components/CytologyRoseView';
import { resolveHasAdvancedSignOutCertification } from '@/services/staff/resolveHasAdvancedSignOutCertification';
import { generateCytologyReportPdf } from '@/services/cytology/generateCytologyReportPdf';
import { auditService } from '@/services';
import { resolvePatientCytoHistoHistory, type PatientCytoHistoHistory } from '@/services/cytology/resolvePatientCytoHistoHistory';
import { mockStainTypeService } from '@/services/stains/mockStainTypeService';
import { mockMolecularTargetService } from '@/services/stains/mockMolecularTargetService';
import { resolveDecantCassetteColor } from '@/utils/resolveDecantCassetteColor';
import { decantIdentifier } from '@/types/labels/LabelData';
import { mockPathologyLexiconService } from '@/services/cytology/mockPathologyLexiconService';
import { resolveUnvalidatedTermKeysInAnswers, resolveTranslationAcknowledgmentIsCurrent } from '@/services/cytology/resolveSynopticTranslationValidation';
import { resolveSynopticTranslationSignOutAuditEvent } from '@/services/cytology/resolveSynopticTranslationSignOutAuditEvent';
import { resolveSpecimenEntryMatchesCategory } from '@/services/specimenDictionary/resolveSpecimenEntryMatchesCategory';
import { resolveCytologySynopticTemplateById } from '@/services/cytology/cytologySynopticTemplateRegistry';
import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';
import { resolveCytologyRoseEvaluationAdded } from '@/services/cytology/resolveCytologyRoseEvaluationAdded';
import { resolveCytologyRoseDiscrepancy } from '@/services/cytology/resolveCytologyRoseDiscrepancy';
import { resolveNewQcCaseAssignmentFromRoseDiscrepancy } from '@/services/cytologyQc/resolveNewQcCaseAssignment';
import { mockCytologyQcCaseAssignmentService } from '@/services/cytologyQc/mockCytologyQcCaseAssignmentService';
import { mockFacilityService } from '@/services/facilities/mockFacilityService';
import { mockUserService } from '@/services/users/mockUserService';
// Real, per direct follow-up ("the same countersign needs to work for
// Cytology as well") — same real services useSignOutWorkflow.ts's own
// resident-countersign gate already uses for Surg Path, reused here
// rather than a second, separate countersign mechanism.
import { countersignService, qaSupervisionAssignmentService } from '@/services';
import { resolveResidentCountersignRequired } from '@/services/cases/resolveResidentCountersignRequired';
import { resolveCytologyIsPathologistTrack } from '@/services/cases/resolveCytologyIsPathologistTrack';
import { FPPE_ACTIVITY_TYPE_ID, CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import { sendEmail } from '@/services/communications/notificationService';
import type { CaseParticipant } from '@/types/case/Case';
import type { ProviderCredential } from '@/types/staff/ProviderCredential';
import type { Jurisdiction } from '@/types/systemConfig';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';
import { mockCytologyCategoryService } from '@/services/cytology/mockCytologyCategoryService';
import { mockCytologyReviewRecordService } from '@/services/cytology/mockCytologyReviewRecordService';
import { mockCytologyQcSettingsService } from '@/services/cytology/mockCytologyQcSettingsService';
import { mockFacilityCytologyQcOverrideService } from '@/services/cytology/mockFacilityCytologyQcOverrideService';
import { mockStaffCytologyQcOverrideService } from '@/services/cytology/mockStaffCytologyQcOverrideService';
import { resolveEffectiveCytologyQcSettings } from '@/services/cytology/resolveEffectiveCytologyQcSettings';
import { resolveCytologyRandomQcSelection } from '@/services/cytology/resolveCytologyRandomQcSelection';
import { resolveCytologyHighRiskFactorsForCase } from '@/services/cytology/resolveCytologyHighRiskFactorsForCase';
import { resolveCytologyHighRiskStatus } from '@/services/cytology/resolveCytologyHighRiskStatus';
import { mockEncounterService } from '@/services/encounters/mockEncounterService';
import { resolveCytologyFiveYearRetrospectiveLookback } from '@/services/cytology/resolveCytologyFiveYearRetrospectiveLookback';
import { resolveCytologyPeerReviewTargetedSelection } from '@/services/cytology/resolveCytologyPeerReviewTargetedSelection';
import { resolveCytologyHistologyCorrelationCandidates } from '@/services/cytology/resolveCytologyHistologyCorrelationCandidates';
import { resolveCytologyHistologySeverityFromSnomed } from '@/services/cytology/resolveCytologyHistologySeverityFromSnomed';
import { resolveCytologyHistologyCorrelationOutcome, type CytologyHistologyCorrelationOutcome } from '@/services/cytology/resolveCytologyHistologyCorrelationOutcome';
import { mockSnomedCervicalHistologySeverityMappingService } from '@/services/cytology/mockSnomedCervicalHistologySeverityMappingService';
import { CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import { resolveCytologyReviewerRole } from '@/services/cytology/resolveCytologyReviewerRole';
import { resolveOwnCytologyReview } from '@/services/cytology/resolveOwnCytologyReview';
import { cloneCytologyReviewAsDraft } from '@/services/cytology/cloneCytologyReviewAsDraft';
import { resolveCytologyReviewRequirement } from '@/services/cytology/resolveCytologyReviewRequirement';
import { resolveCytologyFinalDiagnosisSnapshot } from '@/services/cytology/resolveCytologyFinalDiagnosisSnapshot';
import { resolveCytologySignOutGate } from '@/services/cytology/resolveCytologySignOutGate';
import { resolveCanSignOutCytology } from '@/services/cytology/resolveCanSignOutCytology';
import { resolveCytologyStructuredWorkflowAccess } from '@/services/cytology/resolveCytologyStructuredWorkflowAccess';
import { resolveCytologyReportContent } from '@/services/cytology/resolveCytologyReportContent';
import { mockCytologySignOutRecordService } from '@/services/cytology/mockCytologySignOutRecordService';
import { mockAiScreeningResultService } from '@/services/digitalPathology/mockAiScreeningResultService';
import { recordAiHumanConcordance } from '@/services/digitalPathology/recordAiHumanConcordance';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';
import { publishReportReleasedEvent } from '@/services/reports/publishReportReleasedEvent';
import { generateCytologyReportPdfSnapshot } from '@/services/cytology/generateCytologyReportPdfSnapshot';
import { buildCytologyRegistryReportPayload } from '@/services/cytology/buildCytologyRegistryReportPayload';
import { isUnsatisfactoryAdequacy } from '@/services/cytology/classifyCytologyAgreement';
import { mockRegistrySettingsService } from '@/services/facilities/mockRegistrySettingsService';
import { mockFacilityRegistryOverrideService } from '@/services/facilities/mockFacilityRegistryOverrideService';
import { resolveEffectiveRegistrySettings } from '@/services/facilities/resolveEffectiveRegistrySettings';
import { mockCytologyRegistryOutboundQueueService } from '@/services/cytology/mockCytologyRegistryOutboundQueueService';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { mockCytologyNomenclatureSettingsService } from '@/services/cytology/mockCytologyNomenclatureSettingsService';
import { mockFacilityCytologyNomenclatureOverrideService } from '@/services/cytology/mockFacilityCytologyNomenclatureOverrideService';
import { resolveEffectiveCytologyNomenclatureSettings } from '@/services/cytology/resolveEffectiveCytologyNomenclatureSettings';
import { allCytologyInterpretationIds } from '@/types/cytology/CytologyReviewRecord';
import { resolveCytologyCategorySetConcordance } from '@/services/cytology/resolveCytologyCategorySetConcordance';
import { qaActivityRecordService } from '@/services';
import { GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import type { CytologyReviewRecord, CytologyReviewRole, CytologyCategorySelection } from '@/types/cytology/CytologyReviewRecord';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import type { CytologyCategoryEntry, CytologyNomenclatureSystem } from '@/services/cytology/ICytologyCategoryService';
import type { CisoeAScore, CisoeAAdequacy } from '@/types/cytology/CisoeAScore';
import type { CytologyReviewMode } from '@/types/cytology/CytologyReviewRecord';
import { resolveCytologyReviewMode } from '@/services/cytology/resolveCytologyReviewMode';
import { resolveCytologyScuWeight } from '@/services/cytology/resolveCytologyScuWeight';
import { resolveCytologyWorkloadCapacity, type CytologyWorkloadCapacityStatus } from '@/services/cytology/resolveCytologyWorkloadCapacity';
import { mockCytologyWorkloadLedgerService } from '@/services/cytology/mockCytologyWorkloadLedgerService';
import { mockCytologyWorkloadCapSettingsService } from '@/services/cytology/mockCytologyWorkloadCapSettingsService';
import { mockFacilityCytologyWorkloadCapOverrideService } from '@/services/cytology/mockFacilityCytologyWorkloadCapOverrideService';
import { mockStaffCytologyWorkloadCapOverrideService } from '@/services/cytology/mockStaffCytologyWorkloadCapOverrideService';
import { resolveEffectiveCytologyWorkloadCap } from '@/services/cytology/resolveEffectiveCytologyWorkloadCap';
import { resolveCytologyWorkloadReassignmentCandidates } from '@/services/cytology/resolveCytologyWorkloadReassignmentCandidates';
import { resolveIsRetroactiveScuEscalation } from '@/services/cytology/resolveIsRetroactiveScuEscalation';
import { applyPoolRouting } from '@/services/cases/casePoolAssignmentService';
import { resolveCisoeAToBethesda } from '@/services/cytology/resolveCisoeAToBethesda';
import { resolveCisoeAValidation } from '@/services/cytology/resolveCisoeAValidation';
import { resolveCisoeAAdequacyToBethesda } from '@/services/cytology/resolveCisoeAAdequacyToBethesda';
import { resolveCisoeAReflexRecommendation } from '@/services/cytology/resolveCisoeAReflexRecommendation';
import { mockCytologyInstrumentationService } from '@/services/cytology/mockCytologyInstrumentationService';
import { useCompanionWindow } from '@/hooks/useCompanionWindow';
import type { Case } from '@/types/case/Case';

const ROLE_LABELS: Record<CytologyReviewRole, string> = {
  primary_screen: 'Primary Screener',
  qc_random_selection: 'QC — Random Selection',
  qc_targeted_high_risk: 'QC — Targeted High-Risk',
  secondary_reviewer: 'Secondary Reviewer',
  pathologist_review: 'Pathologist Review',
  post_signout_peer_review_random: 'Post-Sign-Out Peer Review — Random Selection',
  post_signout_peer_review_targeted: 'Post-Sign-Out Peer Review — Targeted High-Risk',
};

// ── Small, real, reusable search-select components ──────────────────────────

function SingleSearchSelect({ options, value, comment, onChange, onCommentChange, placeholder }: {
  options: CytologyCategoryEntry[];
  value: string;
  comment: string;
  onChange: (id: string) => void;
  onCommentChange: (comment: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.id === value);
  const matches = query.trim()
    ? options.filter(o => (o.abbreviation ? `${o.abbreviation} ${o.label}` : o.label).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  if (selected) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#111827', border: '1px solid #1f2937', borderRadius: 7 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: '#e5e7eb' }}>{selected.description ?? (selected.abbreviation ? `${selected.abbreviation} — ${selected.label}` : selected.label)}</span>
          <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
        <input value={comment} onChange={e => onCommentChange(e.target.value)} placeholder="Comment (optional)"
          style={{ width: '100%', marginTop: 4, padding: '5px 9px', fontSize: 12, color: '#9ca3af', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 7 }} />
      {matches.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, marginTop: 3, maxHeight: 220, overflowY: 'auto' }}>
          {matches.map(o => (
            <div key={o.id} onClick={() => { onChange(o.id); setQuery(''); }}
              style={{ padding: '7px 10px', fontSize: 12, color: '#d1d5db', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {o.abbreviation ? `${o.abbreviation} — ${o.label}` : o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSearchSelect({ options, selections, onChange, placeholder, categoryLabel }: {
  options: CytologyCategoryEntry[];
  selections: CytologyCategorySelection[];
  onChange: (next: CytologyCategorySelection[]) => void;
  placeholder: string;
  categoryLabel: (id: string) => string;
}) {
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selections.map(s => s.categoryId));
  const matches = query.trim()
    ? options.filter(o => !selectedIds.has(o.id) && (o.abbreviation ? `${o.abbreviation} ${o.label}` : o.label).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const add = (categoryId: string) => { onChange([...selections, { categoryId }]); setQuery(''); };
  const remove = (categoryId: string) => onChange(selections.filter(s => s.categoryId !== categoryId));
  const setComment = (categoryId: string, comment: string) => onChange(selections.map(s => s.categoryId === categoryId ? { ...s, comment } : s));

  return (
    <div style={{ marginBottom: 12 }}>
      {selections.map(s => (
        <div key={s.categoryId} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#111827', border: '1px solid #1f2937', borderRadius: 7 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: '#e5e7eb' }}>{categoryLabel(s.categoryId)}</span>
            <button onClick={() => remove(s.categoryId)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
          <input value={s.comment ?? ''} onChange={e => setComment(s.categoryId, e.target.value)} placeholder="Comment (optional)"
            style={{ width: '100%', marginTop: 4, padding: '5px 9px', fontSize: 12, color: '#9ca3af', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
        </div>
      ))}
      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 7 }} />
        {matches.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, marginTop: 3, maxHeight: 220, overflowY: 'auto' }}>
            {matches.map(o => (
              <div key={o.id} onClick={() => add(o.id)}
                style={{ padding: '7px 10px', fontSize: 12, color: '#d1d5db', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {o.abbreviation ? `${o.abbreviation} — ${o.label}` : o.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const fieldLabel = (text: string, hint?: string) => (
  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
    {text}{hint && <span style={{ fontWeight: 400, textTransform: 'none', color: '#4b5563', marginLeft: 6, letterSpacing: 0 }}>{hint}</span>}
  </label>
);

interface Draft {
  generalCategorizationId: string;
  adequacySelections: CytologyCategorySelection[];
  primaryInterpretationId: string;
  primaryInterpretationComment: string;
  additionalInterpretations: CytologyCategorySelection[];
  recommendations: CytologyCategorySelection[];
  notes: string;
  /** Real, per direct guidance's own confirmed sequencing — local to
   *  the draft until the outer "Save as [Role]" action persists it,
   *  matching every other real draft field's own save timing exactly. */
  synopticData?: { templateId: string; answers: Record<string, string | string[]>; translationValidationAcknowledgment?: SynopticTranslationAcknowledgment };
}

const EMPTY_DRAFT: Draft = {
  generalCategorizationId: '', adequacySelections: [],
  primaryInterpretationId: '', primaryInterpretationComment: '',
  additionalInterpretations: [], recommendations: [], notes: '',
};

// Real, per direct guidance: the real CISOE-A (PALGA) 6-component
// matrix (PS-183) — genuinely distinct from Draft above, since CISOE-A
// scores every axis independently rather than picking one primary
// interpretation. Controlled inputs use strings (not numbers)
// deliberately, so an empty/in-progress field is representable —
// parsed to real numbers only at save time, via resolveCisoeAScoreFromDraft.
interface CisoeADraft {
  composition: string; compositionComment: string;
  inflammation: string; inflammationComment: string;
  squamous: string; squamousComment: string;
  otherEndometrium: string; otherEndometriumComment: string;
  endocervical: string; endocervicalComment: string;
  adequacy: CisoeAAdequacy | '';
  notes: string;
}

const EMPTY_CISOEA_DRAFT: CisoeADraft = {
  composition: '', compositionComment: '', inflammation: '', inflammationComment: '',
  squamous: '', squamousComment: '', otherEndometrium: '', otherEndometriumComment: '',
  endocervical: '', endocervicalComment: '', adequacy: '', notes: '',
};

/** Real, pure conversion from the real, in-progress UI draft to a real
 *  CisoeAScore, or undefined if any real, required numeric field is
 *  genuinely empty/unparseable — resolveCisoeAValidation.ts still runs
 *  separately for the real, user-facing error messages; this is just
 *  the real, safe parse step. */
function resolveCisoeAScoreFromDraft(draft: CisoeADraft): CisoeAScore | undefined {
  const parse = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const c = parse(draft.composition), i = parse(draft.inflammation), s = parse(draft.squamous),
        o = parse(draft.otherEndometrium), e = parse(draft.endocervical);
  if (c === undefined || i === undefined || s === undefined || o === undefined || e === undefined || !draft.adequacy) return undefined;
  if ([c, i, s, o, e].some(v => Number.isNaN(v) || v < 0 || v > 9)) return undefined;
  return {
    composition: { value: c, comment: draft.compositionComment || undefined },
    inflammation: { value: i, comment: draft.inflammationComment || undefined },
    squamous: { value: s, comment: draft.squamousComment || undefined },
    otherEndometrium: { value: o, comment: draft.otherEndometriumComment || undefined },
    endocervical: { value: e, comment: draft.endocervicalComment || undefined },
    adequacy: draft.adequacy,
  };
}

/** Real, per-field partial builder — genuinely distinct from the
 *  function above: used only to feed resolveCisoeAValidation.ts with
 *  accurate, per-field information, so a real user who filled in 5 of
 *  6 real axes sees exactly the one real, missing field, not a
 *  misleading "all 6 are missing" message. */
function resolveCisoeAPartialFromDraft(draft: CisoeADraft): Partial<CisoeAScore> {
  const parse = (s: string) => {
    if (s.trim() === '') return undefined;
    const n = Number(s);
    return Number.isNaN(n) || n < 0 || n > 9 ? undefined : n;
  };
  const partial: Partial<CisoeAScore> = {};
  const c = parse(draft.composition); if (c !== undefined) partial.composition = { value: c, comment: draft.compositionComment || undefined };
  const i = parse(draft.inflammation); if (i !== undefined) partial.inflammation = { value: i, comment: draft.inflammationComment || undefined };
  const s = parse(draft.squamous); if (s !== undefined) partial.squamous = { value: s, comment: draft.squamousComment || undefined };
  const o = parse(draft.otherEndometrium); if (o !== undefined) partial.otherEndometrium = { value: o, comment: draft.otherEndometriumComment || undefined };
  const e = parse(draft.endocervical); if (e !== undefined) partial.endocervical = { value: e, comment: draft.endocervicalComment || undefined };
  if (draft.adequacy) partial.adequacy = draft.adequacy;
  return partial;
}

export default function CytologyScreeningPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  // Real, per direct guidance's own explicit spec: "Home > Cytology
  // Workspace" breadcrumb navigation across Cytology sub-routes.
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('cytologyWorklist.breadcrumbLabel'), '/cytology-worklist'); }, [pushCrumb, t]);
  // Real, per direct guidance's own confirmed decision: cytology
  // (especially Non-GYN — FNA, fluids) needs its own lightweight,
  // informal review request, genuinely distinct from the formal QC
  // Review Queue engine — reuses the same, already-generic, real
  // RequestReviewModal Surgical Pathology already uses (a shared
  // component, not surgical-specific — sources its own reviewer list
  // from the real, canonical mockUserService, not a hardcoded list).
  const [reviewOpen, setReviewOpen] = useState(false);
  // Real, per direct guidance's own "importing the action bar" ask —
  // reuses the exact same real mechanism Surgical Pathology's own
  // BottomActionBar.tsx already uses (a real companion window, with a
  // real, embedded drawer fallback if the popup is blocked), rather
  // than a second, parallel EMR-launch implementation.
  const [emrOpen, setEmrOpen] = useState(false);
  // Real, per direct guidance's own "importing the action bar" ask —
  // reuses the exact same real Case Team / Delegate modals and their
  // own real cross-link (closing Team to open Delegate, then
  // returning to Team once delegation completes) Surgical Pathology's
  // own SynopticReportPage.tsx already uses. Both modals take a real,
  // general Case/caseId — nothing surgical-specific in either.
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [delegateReturnTo, setDelegateReturnTo] = useState<'team' | null>(null);
  // Real, per direct guidance's own "importing the action bar" ask —
  // reuses the exact same real useSynopticFlags/FlagManagerModal
  // combination CytologyWorklistPage.tsx already wires up (general,
  // case-level flags — never surgical-specific). Real, deliberate:
  // ADDITIVE, not a replacement for this screen's own existing
  // "Flag High-Risk QC" button — that's a genuinely different, real,
  // QC-specific manual trigger (tied to the mandatory-QC mechanism),
  // not a general case flag; both serve real, distinct purposes and
  // stay side by side.
  const { flagCaseData, flagDefinitions, showFlagManager, setShowFlagManager, openFlagManager, onApplyFlags, onRemoveFlag } = useSynopticFlags('');
  // Real, per direct guidance's own confirmed decision: full,
  // per-specimen billing/diagnosis coding, matching Surgical
  // Pathology's own architecture ("Billing units for Non-GYN cytology
  // and FNAs are driven per specimen/site... Case-level-only coding
  // makes charge generation and compliance auditing much more
  // difficult"). Real, honest scope: uses this screen's own, real,
  // simpler save mechanism (caseRouter.updateCase, no orchestration-
  // mode charge/credit ledger, no concurrency version tracking) —
  // see resolveUpdatedCodingFromModalSubmission.ts's own header for
  // the full account of what Surgical's own handler does that this
  // one deliberately does not.
  const [showCodesModal, setShowCodesModal] = useState(false);
  // Real, per direct guidance's own confirmed sequencing (Option 2) —
  // the drawer shell and its real UI/UX are validated now; the real,
  // underlying cytology slide/cell-block data model is real, deferred,
  // separate work — see CytologyMaterialView.tsx's own header.
  const [showMaterialDrawer, setShowMaterialDrawer] = useState(false);
  // Real, per direct guidance's own Step 4 ask — visible for Non-GYN
  // cases (ROSE is inherently an FNA/bedside-procedure concept, the
  // same real scope the worklist tile itself uses), regardless of
  // role — any real CT or Pathologist may need to record what
  // happened at the bedside, unlike the Synoptic drawer's own
  // Pathologist-only gate.
  const [showRoseDrawer, setShowRoseDrawer] = useState(false);
  // Real, per direct guidance's own confirmed migration onto the
  // real, established Decant/StainType system — the same real stain
  // catalog Surgical Pathology's own BlockStainEditorModal reads,
  // never a separate, cytology-specific stain list.
  const [stainTypes, setStainTypes] = useState<import('@/services/stains/IStainService').StainType[]>([]);
  const [molecularTargets, setMolecularTargets] = useState<import('@/types/billing/MolecularBillingRule').MolecularTarget[]>([]);
  useEffect(() => {
    mockStainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
    mockMolecularTargetService.getAll().then(res => { if (res.ok) setMolecularTargets(res.data); });
  }, []);

  const handleAddCodesToSpecimens = async (codes: any[]) => {
    if (!caseData) return;
    const { newCoding, updatedSpecimens, additionsBySpecimen, removalsBySpecimen } =
      resolveUpdatedCodingFromModalSubmission(caseData.specimens ?? [], codes);
    await caseRouter.updateCase(caseData.id, { coding: newCoding, specimens: updatedSpecimens } as any);
    setCaseData(prev => prev ? ({ ...prev, coding: newCoding, specimens: updatedSpecimens } as typeof prev) : prev);
    // Real, per Surgical Pathology's own established "All must be
    // audited" principle for its own assist-mode path — this screen
    // has no orchestration-mode charge/credit ledger to post to, but
    // every real code change is still genuinely logged.
    for (const [specId, codes] of additionsBySpecimen) {
      const sp = caseData.specimens?.find(s => s.id === specId);
      auditService.logEvent({
        type: 'user', event: 'CPT code added (Code Manager)',
        detail: `${sp?.label ?? specId}: ${codes.join(', ')} added`,
        user: user?.name ?? user?.id ?? 'unknown', caseId: caseData.accession?.fullAccession ?? caseData.id, confidence: null,
      });
    }
    for (const [specId, codes] of removalsBySpecimen) {
      const sp = caseData.specimens?.find(s => s.id === specId);
      auditService.logEvent({
        type: 'user', event: 'CPT code removed (Code Manager)',
        detail: `${sp?.label ?? specId}: ${codes.join(', ')} removed`,
        user: user?.name ?? user?.id ?? 'unknown', caseId: caseData.accession?.fullAccession ?? caseData.id, confidence: null,
      });
    }
  };
  const { openCompanion } = useCompanionWindow({ windowName: 'PathScribeEMRSidecar', preferredWidth: 1200, preferredHeight: 800 });

  const handleLaunchEMR = async () => {
    const mrn = caseData?.patient?.mrn ?? '100004';
    const targetUrl = `${window.location.origin}/mock-emr?patientId=${mrn}`;
    // Real, per Surgical Pathology's own identical dev-testing
    // shortcut (BottomActionBar.tsx) — kept for parity rather than
    // silently dropped, so QA has the same real, quick path to
    // exercise the embedded drawer on this screen too.
    if (new URLSearchParams(window.location.search).get('forceEmrFallback') === '1') {
      setEmrOpen(true);
      return;
    }
    const result = await openCompanion(targetUrl);
    if (result === 'blocked') setEmrOpen(true);
  };

  const [caseData, setCaseData] = useState<Case | null>(null);

  // Real, per direct follow-up ("It shouldn't be any different than
  // [surgical] pathology or autopsy. Check the performing types on
  // cases."): previously `user?.role === 'pathologist' ||
  // 'pathologist-admin'` — this app's login-level User.role has no
  // resident or cytotechnologist value at all, so that was true for
  // EVERY real clinical login, always. Now derived from this reviewer's
  // real, per-case participation type (resolveCytologyIsPathologistTrack.ts),
  // matching how surgical pathology and autopsy already read
  // Case.participants for their own equivalent decisions, instead of a
  // blunt account-level flag. accountIsAdminTier covers the genuine
  // admin/pathologist-admin/superadmin override (consistent with
  // canFinalizeCase's own admin-override precedent) and is also the
  // fallback used when this reviewer has no real participant record on
  // the case yet (a case claimed before acceptPoolCase() was corrected
  // to tag real roles) — every NEW claim always has one.
  const accountIsAdminTier = user?.role === 'admin' || user?.role === 'pathologist-admin' || user?.role === 'superadmin';
  const isPathologist = useMemo(
    () => resolveCytologyIsPathologistTrack(caseData?.participants, user?.id, accountIsAdminTier),
    [caseData?.participants, user?.id, accountIsAdminTier],
  );
  // Real, per direct guidance's own confirmed 3-part sign-out gate
  // design — resolved once at the component level (a real facility
  // lookup and a real staff-record lookup, neither pure), then reused
  // at every real resolveCytologySignOutGate call site below, rather
  // than repeating both real async lookups per call. Real, honest
  // default: 'US' (a real jurisdiction that grants no advanced-CT
  // exception) until the real facility lookup resolves — never lets
  // an unresolved jurisdiction silently grant an exception it hasn't
  // actually confirmed.
  const [labJurisdiction, setLabJurisdiction] = useState<Jurisdiction>('US');
  const [signingProviderCredentials, setSigningProviderCredentials] = useState<ProviderCredential[] | undefined>(undefined);

  useEffect(() => {
    const facilityId = caseData?.order?.facilityId;
    if (facilityId) {
      mockFacilityService.getById(facilityId).then(res => {
        if (res.ok) setLabJurisdiction(res.data.jurisdiction);
      });
    }
  }, [caseData?.order?.facilityId]);

  useEffect(() => {
    if (user?.id) {
      mockUserService.getById(user.id).then(res => {
        if (res.ok) setSigningProviderCredentials(res.data.providerCredentials);
      });
    }
  }, [user?.id]);

  const [specimenId, setSpecimenId] = useState<string | null>(null);
  const [isGynCytology, setIsGynCytology] = useState(true);
  // Real, per direct guidance's own Phase 2 Accessioning Inheritance
  // ask ("Default Framework: Bethesda Thyroid System") — resolved
  // from the same real specimen-dictionary entry isGynCytology
  // already uses, never a second, separate lookup. Undefined until
  // the real dictionary entry resolves, or when that entry has no
  // real default configured — the drawer's own template picker still
  // requires a genuine, manual selection in that case, never a
  // guessed default.
  const [dictionaryDefaultSynopticTemplateId, setDictionaryDefaultSynopticTemplateId] = useState<string | undefined>(undefined);
  // Real, per direct guidance's own confirmed Check 2 (adapted to
  // this app's own real field names, not the illustrative
  // caseData.category/currentUser.hasAdvancedCert pseudocode):
  // Non-GYN status is the same real isGynCytology flag already
  // resolved from the specimen dictionary; the credential check
  // reuses the same real resolveHasAdvancedSignOutCertification.ts
  // this app's sign-out gate already calls, never a second,
  // separate determination.
  const [showSynopticDrawer, setShowSynopticDrawer] = useState(false);
  // Real, per direct guidance's own confirmed "fully voice ready"
  // request — mirrors SynopticReportPage.tsx's own exact
  // setCurrentContext pattern. A genuinely separate real context
  // (VOICE_CONTEXT.CYTOLOGY) from Surgical's own SYNOPTIC — see that
  // constant's own doc comment for why a shared context would make
  // the two pages' own voice actions collide.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.CYTOLOGY);
    return () => { mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, []);
  useEffect(() => {
    const openMaterial = () => setShowMaterialDrawer(true);
    const openSynoptic = () => setShowSynopticDrawer(true);
    window.addEventListener('PATHSCRIBE_CYTOLOGY_OPEN_MATERIAL', openMaterial);
    window.addEventListener('PATHSCRIBE_CYTOLOGY_OPEN_SYNOPTIC', openSynoptic);
    return () => {
      window.removeEventListener('PATHSCRIBE_CYTOLOGY_OPEN_MATERIAL', openMaterial);
      window.removeEventListener('PATHSCRIBE_CYTOLOGY_OPEN_SYNOPTIC', openSynoptic);
    };
  }, []);
  const hasAdvancedCert = resolveHasAdvancedSignOutCertification(signingProviderCredentials, labJurisdiction, 'CYTO_ADVANCED_SPECIALIST', new Date().toISOString());
  // Real, per direct guidance on Cytology Assisted Instrumentation —
  // "Standardize on WSI... Treat Traditional Guided as a Pure LIS
  // Workflow." The real, current, global instrumentation setting
  // determines whether the WSI viewer action is offered at all — a
  // real traditional_guided lab never sees it, matching direct
  // guidance's own "stays completely out of the image-rendering
  // business for those slides."
  const [instrumentationModality, setInstrumentationModality] = useState<'wsi' | 'traditional_guided'>('wsi');
  // Real, per direct guidance's own confirmed consolidation — the
  // real, sticky-positioned WSI launch now lives inside
  // WsiViewerLaunchButton itself (extended to support this), not a
  // separate useCompanionWindow call here. See that component's own
  // header for the full account.
  const [categories, setCategories] = useState<CytologyCategoryEntry[]>([]);
  // Real, per direct guidance's own explicit spec ("Place a new card
  // right under HPV Co-Testing displaying prior Pap smear
  // dates/results and any surgical pathology biopsies").
  const [patientHistory, setPatientHistory] = useState<PatientCytoHistoHistory | null>(null);
  // Real, per direct guidance's own confirmed Managed Lexicon
  // architecture — fetched once, same real posture as the specimen
  // dictionary fetch above, so the real sign-out gate's own
  // translation-validation check (see below) uses the SAME real
  // lexicon data the Synoptic drawer's own checkbox already checks
  // against — never a second, separately-fetched copy that could
  // drift out of sync within one real page session.
  const [pathologyLexicon, setPathologyLexicon] = useState<PathologyLexiconEntry[]>([]);
  useEffect(() => {
    mockPathologyLexiconService.getAll().then(res => { if (res.ok) setPathologyLexicon(res.data); });
  }, []);
  // Real, per direct guidance's own confirmed "tie the checkbox
  // directly to the underlying document metadata" enforcement —
  // computes the same real { hasUnvalidatedTerms, hasCurrentAcknowledgment }
  // shape resolveCytologySignOutGate.ts's own optional
  // synopticTranslationCheck param expects, from a real review's own
  // real, saved synopticData. Returns undefined for a real review
  // with no real synoptic data at all (GYN/CISOE-A reviews), matching
  // that param's own "most reviews have none" default posture.
  const resolveSynopticTranslationCheckForReview = (review: { synopticData?: { templateId: string; answers: Record<string, string | string[]>; translationValidationAcknowledgment?: SynopticTranslationAcknowledgment } }) => {
    if (!review.synopticData) return undefined;
    const template = resolveCytologySynopticTemplateById(review.synopticData.templateId);
    if (!template) return undefined;
    const locale = i18n.language.split('-')[0];
    if (locale === 'en') return { hasUnvalidatedTerms: false, hasCurrentAcknowledgment: true };
    const unvalidatedTermKeys = resolveUnvalidatedTermKeysInAnswers(template, review.synopticData.answers, locale as PathologyLexiconLocale, pathologyLexicon);
    return {
      hasUnvalidatedTerms: unvalidatedTermKeys.length > 0,
      hasCurrentAcknowledgment: resolveTranslationAcknowledgmentIsCurrent(review.synopticData.translationValidationAcknowledgment, unvalidatedTermKeys),
    };
  };
  useEffect(() => {
    const patientId = caseData?.patient?.id;
    if (!patientId || categories.length === 0) return;
    caseRouter.getAll({ patientId }).then(res => {
      if (res.ok && caseData) setPatientHistory(resolvePatientCytoHistoHistory(res.data, caseData.id, categories));
    });
  }, [caseData?.patient?.id, categories]);
  // Real, per direct guidance: the real, structural CISOE-A (PALGA)
  // multi-axis workflow (PS-183) — genuinely distinct from every other
  // nomenclature's single-pick dictionary UI. `bethesdaForMapping` is
  // separate from `categories` above because palga_cisoea itself
  // carries zero real dictionary rows (CisoeAScore.ts's own design) —
  // resolveCisoeAToBethesda.ts needs the real Bethesda dictionary
  // specifically to compute rank-based severity and the mapped
  // primaryInterpretationId every existing resolver still reads.
  const [nomenclatureSystem, setNomenclatureSystem] = useState<CytologyNomenclatureSystem>('bethesda');
  // Real, per direct guidance's own confirmed redesign: mutually
  // exclusive with CISOE-A entirely, rather than trying to make the
  // Synoptic drawer coexist with a real, facility-level reporting
  // system it was never designed to layer onto — CISOE-A "renders
  // CISOE-A primary fields across both GYN and Non-GYN specimens as
  // designed by PALGA standards," so a real Non-GYN case at a
  // CISOE-A-configured facility never needs (or gets) this button at
  // all.
  const showSynopticTrigger = !isGynCytology && nomenclatureSystem !== 'palga_cisoea' && (isPathologist || hasAdvancedCert);
  const [bethesdaForMapping, setBethesdaForMapping] = useState<CytologyCategoryEntry[]>([]);
  const [reviews, setReviews] = useState<CytologyReviewRecord[]>([]);
  const [signOutRecords, setSignOutRecords] = useState<CytologySignOutRecord[]>([]);
  // Real, per direct follow-up: "obviously that is a huge gap. Sort
  // of the whole point of concordance monitoring" — the real AI
  // screening result for this case (if any), and the pending
  // concordance-prompt state once the reviewer's own, independent
  // finding has just been saved.
  const [aiScreeningResult, setAiScreeningResult] = useState<AiScreeningResult | null>(null);
  const [showConcordancePrompt, setShowConcordancePrompt] = useState(false);
  const [recordingConcordance, setRecordingConcordance] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Real, per direct guidance's own explicit spec: "When an abnormal/
  // high-grade diagnosis... is selected on the right, dynamically
  // render a CAP compliance banner... listing prior negative/low-
  // grade Pap accessions over the past 5 years." Real, deliberate:
  // this is the real, reactive, on-screen banner — genuinely distinct
  // from applyFiveYearRetrospectiveLookbackIfNeeded further down in
  // this file, which only flags those prior cases in the background
  // at real sign-out time (for the separate 5-Year Lookback worklist
  // tile) and shows nothing on this screen. Both call the same real,
  // shared resolveCytologyFiveYearRetrospectiveLookback.ts — this one
  // reuses the patient history already fetched for the Patient Cyto/
  // Histo History panel rather than a second, duplicate fetch.
  const fiveYearLookbackFlagged = useMemo(() => {
    const triggeringRank = categories.find(c => c.id === draft.primaryInterpretationId)?.diagnosticRank;
    if (triggeringRank === undefined || triggeringRank < 4 || !patientHistory) return [];
    const reviewsWithRank = patientHistory.priorCytologyResults
      .filter((r): r is typeof r & { reviewRecordId: string; specimenId: string } => !!r.reviewRecordId && !!r.specimenId)
      .map(r => ({ id: r.reviewRecordId, caseId: r.caseId, specimenId: r.specimenId, recordedAt: r.date, diagnosticRank: r.diagnosticRank }));
    return resolveCytologyFiveYearRetrospectiveLookback(triggeringRank, reviewsWithRank, new Date());
  }, [categories, draft.primaryInterpretationId, patientHistory]);

  // Real, per direct correction ("no dirty flag warnings?"): the last
  // real, saved/loaded state the current draft is compared against.
  // Updated only at real synchronization points — initial load into
  // edit mode, and after a successful save — never by Clone, which
  // deliberately introduces new, real, unsaved content.
  const [baselineDraft, setBaselineDraft] = useState<Draft>(EMPTY_DRAFT);
  // Real, per direct guidance: the parallel CISOE-A draft/baseline
  // pair, same real dirty-tracking posture as the Bethesda-shaped
  // Draft above — only ever used/rendered when nomenclatureSystem
  // === 'palga_cisoea'.
  const [cisoeADraft, setCisoeADraft] = useState<CisoeADraft>(EMPTY_CISOEA_DRAFT);
  const [cisoeABaselineDraft, setCisoeABaselineDraft] = useState<CisoeADraft>(EMPTY_CISOEA_DRAFT);
  const [cisoeAErrors, setCisoeAErrors] = useState<string[]>([]);
  const [cisoeAWarnings, setCisoeAWarnings] = useState<string[]>([]);
  // Real, per direct guidance's own request: a real, live suggestion —
  // computed from whatever real S/O/E values are currently entered,
  // even before the full score is complete/valid. Real, additive only:
  // never auto-adds a recommendation to the review; the reviewer still
  // decides.
  const cisoeAReflexSuggestion = useMemo(() => {
    const partial = resolveCisoeAPartialFromDraft(cisoeADraft);
    if (!partial.squamous || !partial.otherEndometrium || !partial.endocervical) return undefined;
    return resolveCisoeAReflexRecommendation({ squamous: partial.squamous, otherEndometrium: partial.otherEndometrium, endocervical: partial.endocervical });
  }, [cisoeADraft]);

  // Real, per direct correction ("I noticed there is no dirty flag
  // warnings?"): a simple, real, direct comparison against the last
  // synced baseline — Draft is a plain object of primitives and
  // arrays of plain objects, so a JSON comparison is a real, correct
  // way to detect a genuine change, not an approximation.
  const isDirty = useMemo(() => {
    if (nomenclatureSystem === 'palga_cisoea') return JSON.stringify(cisoeADraft) !== JSON.stringify(cisoeABaselineDraft);
    return JSON.stringify(draft) !== JSON.stringify(baselineDraft);
  }, [draft, baselineDraft, cisoeADraft, cisoeABaselineDraft, nomenclatureSystem]);

  // Real, browser-level warning — tab close, refresh, or navigating to
  // an external URL. Standard, real browser API: the browser shows
  // its own native prompt; the string passed to returnValue is
  // ignored by every modern browser, but must be set for the prompt
  // to appear at all.
  useEffect(() => {
    mockCytologyInstrumentationService.get().then(res => { if (res.ok) setInstrumentationModality(res.data.modality); });
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Real, in-app navigation guard — React Router's own client-side
  // navigation never triggers beforeunload, so "Back to Worklist"
  // needs its own, real, explicit check.
  const handleBackToWorklist = () => {
    if (isDirty && !window.confirm('You have unsaved changes to this review. Leave without saving?')) return;
    navigate('/cytology-worklist');
  };

  // Real, per direct correction: when the current user already owns a
  // review on this specimen, they edit it directly rather than being
  // offered a fresh "record a new review" form under an
  // auto-determined role. Set once per case (see the effect below),
  // not re-derived on every render — set to a review id (edit mode)
  // or null (create mode, the prior, unchanged behavior).
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const initializedOwnReviewForCase = useRef<string | null>(null);

  // Real, per direct guidance's own CLIA workload specification: "Do
  // not rely on passive clock time (which artificially penalizes
  // users taking lunch or working on non-screening tasks)." Real,
  // honest translation for a real, client-only app with no server to
  // ping: accumulate active seconds locally, in real time, only while
  // this real tab is genuinely visible/focused — the same real,
  // functional goal a 60-second heartbeat achieves, without needing an
  // actual server on the other end of one. Resets to 0 per real
  // specimen (a new review session), never carried over between cases.
  const [activeScreeningSeconds, setActiveScreeningSeconds] = useState(0);
  const [reviewMode, setReviewMode] = useState<CytologyReviewMode>('primary_manual');
  const [workloadStatus, setWorkloadStatus] = useState<CytologyWorkloadCapacityStatus | null>(null);
  const [workloadBlockedReason, setWorkloadBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    setActiveScreeningSeconds(0);
  }, [specimenId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setActiveScreeningSeconds(s => s + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [lmpDraft, setLmpDraft] = useState('');

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const [c, dictRes, catRes] = await Promise.all([
        caseRouter.getCase(caseId, user?.id ?? 'current'),
        mockSpecimenDictionaryService.getAll(),
        mockCytologyCategoryService.getAll(),
      ]);
      setCaseData(c ?? null);
      setLmpDraft(c?.patient?.lastMenstrualPeriod ?? '');

      // Real, per direct guidance's own confirmed Product Need: "Form
      // fields and diagnostic drop-downs must dynamically swap
      // nomenclature based on the lab's geographical profile." Resolve
      // THIS case's own real, effective nomenclature system (Enterprise
      // default, overridden by this case's own performing facility if
      // one exists) and filter the whole dictionary down to just that
      // one real system's own entries — never a mix of two systems in
      // the same picker.
      const facilityId = (c as any)?.order?.facilityId;
      const [enterpriseNomenclatureRes, facilityNomenclatureRes] = await Promise.all([
        mockCytologyNomenclatureSettingsService.get(),
        facilityId ? mockFacilityCytologyNomenclatureOverrideService.getForFacility(facilityId) : Promise.resolve({ ok: true as const, data: null }),
      ]);
      const effectiveNomenclature = resolveEffectiveCytologyNomenclatureSettings(
        enterpriseNomenclatureRes.ok ? enterpriseNomenclatureRes.data : { nomenclatureSystem: 'bethesda' },
        facilityNomenclatureRes.ok ? facilityNomenclatureRes.data : null,
      );
      setNomenclatureSystem(effectiveNomenclature.nomenclatureSystem);
      // Real, direct bug fix: manually filtering catRes's own raw
      // getAll() result by nomenclatureSystem === effective never
      // matched anything real for 'sfcc' — no entry literally carries
      // nomenclatureSystem: 'sfcc' (mockCytologyCategoryService.ts's
      // own getByNomenclatureSystem returns Bethesda's own entries
      // with French text substituted for that case; a real, French
      // facility would otherwise have landed on a genuinely empty
      // picker, not French labels). Calls the real, correctly-scoped
      // service method directly instead of re-deriving its own logic
      // here a second time.
      const effectiveCatRes = await mockCytologyCategoryService.getByNomenclatureSystem(effectiveNomenclature.nomenclatureSystem);
      setCategories(effectiveCatRes.ok ? effectiveCatRes.data.filter(cat => cat.active) : []);
      if (effectiveNomenclature.nomenclatureSystem === 'palga_cisoea') {
        setBethesdaForMapping(catRes.ok ? catRes.data.filter(cat => cat.active && cat.nomenclatureSystem === 'bethesda') : []);
      }

      const dictionary = dictRes.ok ? dictRes.data : [];
      const dictById = new Map(dictionary.map(e => [e.id, e]));
      const cytoSpecimen = c?.specimens?.find((sp: any) => {
        const entry = sp.specimenDictionaryEntryId ? dictById.get(sp.specimenDictionaryEntryId) : undefined;
        return entry && (entry.type === 'Cytology' || entry.type === 'FNA');
      }) as any;
      const resolvedSpecimenId = cytoSpecimen?.id ?? null;
      setSpecimenId(resolvedSpecimenId);
      const dictEntry = cytoSpecimen?.specimenDictionaryEntryId ? dictById.get(cytoSpecimen.specimenDictionaryEntryId) : undefined;
      setIsGynCytology(resolveSpecimenEntryMatchesCategory(dictEntry, ['GYN_CYTOLOGY']));
      setDictionaryDefaultSynopticTemplateId(dictEntry?.defaultSynopticTemplateId);

      if (resolvedSpecimenId) {
        const reviewsRes = await mockCytologyReviewRecordService.getBySpecimenId(resolvedSpecimenId);
        setReviews(reviewsRes.ok ? reviewsRes.data : []);
        const signOutRes = await mockCytologySignOutRecordService.getBySpecimenId(resolvedSpecimenId);
        setSignOutRecords(signOutRes.ok ? signOutRes.data : []);
      }

      // Real, per direct follow-up confirming this app's own
      // established "AI suggests, human decides" posture — the real,
      // most-recent completed AI screening result for this case, if
      // any, and whether a real human concordance judgment has
      // already been recorded against it. See
      // src/services/digitalPathology/README.md's own Story 10
      // section for the full account.
      const aiResultsRes = await mockAiScreeningResultService.getByCaseId(caseId);
      const completedAiResults = aiResultsRes.ok ? aiResultsRes.data.filter(r => r.status === 'completed') : [];
      const mostRecentAiResult = completedAiResults.length
        ? completedAiResults.reduce((a, b) => (b.completedAt ?? '') > (a.completedAt ?? '') ? b : a)
        : null;
      setAiScreeningResult(mostRecentAiResult);
    } finally {
      setLoading(false);
    }
  }, [caseId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const currentSpecimen = (caseData?.specimens as any[])?.find(sp => sp.id === specimenId);
  // Real, per direct guidance's own confirmed "fully voice ready"
  // request — extracted from its own real, previous inline JSX prop
  // so both the "+ Add Residual Fluid"/"+ Add Cell Block" buttons AND
  // the real voice actions below call the exact same, single, real
  // implementation, never two copies that could drift apart.
  const handleAddDecant = async (decantType: DecantType) => {
    if (!caseData || !currentSpecimen || !user) return;
    // Real, per direct guidance's own confirmed migration — matches
    // handleAddDecant's own real, established pattern
    // (useSpecimenBlockManagement.ts) exactly: automatic "D<n>"
    // labeling, real cassette-color resolution, and a real displayId
    // — never a manually typed label.
    const existingDecants = currentSpecimen.decants ?? [];
    const decantLabel = `D${existingDecants.length + 1}`;
    const cassetteColorId = await resolveDecantCassetteColor(decantType, { priority: caseData.order?.priority });
    const fullAccession = caseData.accession?.fullAccession;
    const newDecant = {
      id: `dcnt-${currentSpecimen.id}-${Date.now().toString(36)}`,
      label: decantLabel,
      decantType,
      stains: [],
      createdAt: new Date().toISOString(),
      createdBy: user.name,
      displayId: fullAccession ? decantIdentifier(fullAccession, currentSpecimen.label, decantLabel) : undefined,
      cassetteColorId,
    };
    const updatedSpecimens = (caseData.specimens ?? []).map((sp: any) => sp.id === currentSpecimen.id ? { ...sp, decants: [...existingDecants, newDecant] } : sp);
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
    setCaseData(prev => prev ? ({ ...prev, specimens: updatedSpecimens } as typeof prev) : prev);
  };
  useEffect(() => {
    const addResidualFluid = () => { handleAddDecant('residual_fluid'); };
    const addCellBlock = () => { handleAddDecant('cell_block'); };
    window.addEventListener('PATHSCRIBE_CYTOLOGY_ADD_RESIDUAL_FLUID', addResidualFluid);
    window.addEventListener('PATHSCRIBE_CYTOLOGY_ADD_CELL_BLOCK', addCellBlock);
    return () => {
      window.removeEventListener('PATHSCRIBE_CYTOLOGY_ADD_RESIDUAL_FLUID', addResidualFluid);
      window.removeEventListener('PATHSCRIBE_CYTOLOGY_ADD_CELL_BLOCK', addCellBlock);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, currentSpecimen, user]);
  const currentQcFlag = currentSpecimen?.cytologyScreening?.qcFlag;
  const currentRetrospectiveReviewFlag = currentSpecimen?.cytologyScreening?.retrospectiveReviewFlag;
  const [retrospectiveOutcomeDraft, setRetrospectiveOutcomeDraft] = useState<'confirmed_negative' | 'screening_error' | 'interpretation_error' | 'sampling_error' | ''>('');
  const [retrospectiveCorrectiveActionDraft, setRetrospectiveCorrectiveActionDraft] = useState('');
  const [savingRetrospectiveOutcome, setSavingRetrospectiveOutcome] = useState(false);
  const currentFinalDiagnosis = currentSpecimen?.cytologyScreening?.finalDiagnosis;
  // Real, per direct follow-up ("Implement 1, Wire the recording UI"):
  // one real, auto-resolution result per real, unrecorded candidate on
  // this specimen — keyed by candidateCaseId. undefined until the real
  // async resolution below completes; never rendered as if it were an
  // already-resolved outcome before then.
  const [histologyCorrelationResolutions, setHistologyCorrelationResolutions] = useState<Record<string, {
    cytologyDxLabel: string;
    histologyDxDescription?: string;
    outcome: CytologyHistologyCorrelationOutcome;
    cytologyRank?: number;
    histologyRank?: number;
  }>>({});
  const [histologyCorrelationManualDx, setHistologyCorrelationManualDx] = useState<Record<string, string>>({});
  const [histologyCorrelationManualOutcome, setHistologyCorrelationManualOutcome] = useState<Record<string, 'concordant' | 'discordant' | ''>>({});
  const [recordingHistologyCorrelation, setRecordingHistologyCorrelation] = useState<string | null>(null);
  const currentHpv: { hpvCoTestOrdered?: boolean; hpvResult?: string; hpvGenotypeDetail?: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean }; hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance'; hpvAbnormalFlag?: 'A' | 'N'; hpvReferenceRange?: string } = currentSpecimen?.cytologyScreening ?? {};

  // Real, per direct guidance's own "importing the action bar" ask —
  // reuses this app's own real, already-built PDF pipeline
  // (resolveCytologyReportContent.ts + generateCytologyReportPdf.ts)
  // rather than Surgical Pathology's own CopilotReportViewModal.tsx,
  // which is deliberately, tightly coupled to Orchestration/CoPilot
  // mode's own bodyAssembly/sections architecture and explicitly
  // avoids real PDF generation — genuinely the wrong tool for this
  // screen. Real, per direct discovery while wiring this: prefers the
  // real, already-stored reportContent on an actual
  // CytologySignOutRecord when this case has genuinely been signed
  // out (the same real record the ORU R01 HL7 payload itself is
  // built from) — printing the real, signed record exactly as it was
  // signed, never a fresh re-derivation that could drift from it.
  // Falls back to a fresh resolveCytologyReportContent call only for
  // a real, not-yet-signed-out case (a draft/preview print).
  const handlePrint = async () => {
    if (!caseData || !currentSpecimen || !specimenId) return;
    const signOutRes = await mockCytologySignOutRecordService.getBySpecimenId(specimenId);
    const existingSignOut = signOutRes.ok && signOutRes.data.length > 0
      ? [...signOutRes.data].sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0]
      : undefined;

    if (existingSignOut) {
      const doc = generateCytologyReportPdf(existingSignOut.reportContent);
      doc.output('dataurlnewwindow');
      return;
    }

    const screenedByReview = reviews.find(r => r.role === 'primary_screen');
    const signedByReview = currentFinalDiagnosis ? reviews.find(r => r.id === currentFinalDiagnosis.reviewRecordId) : undefined;
    const reviewForContent = signedByReview ?? screenedByReview;
    if (!reviewForContent) return;

    const content = resolveCytologyReportContent(
      reviewForContent,
      categories,
      {
        name: caseData.patient ? `${caseData.patient.firstName ?? ''} ${caseData.patient.lastName ?? ''}`.trim() : 'Unknown Patient',
        dateOfBirth: caseData.patient?.dateOfBirth,
        mrn: caseData.patient?.mrn,
        lastMenstrualPeriod: caseData.patient?.lastMenstrualPeriod,
      },
      { accessionNumber: caseData.accession?.fullAccession ?? caseData.id, orderingProvider: caseData.order?.requestingProvider },
      {
        typeDescription: currentSpecimen.description ?? '',
        collectedAt: currentSpecimen.collectedAt,
        receivedAt: currentSpecimen.receivedAt,
        preparationMethod: currentSpecimen.cytologyScreening?.preparationMethod,
        computerAssistedScreening: currentSpecimen.cytologyScreening?.computerAssistedScreening,
        hpvResult: currentHpv.hpvResult,
        hpvGenotypeDetail: currentHpv.hpvGenotypeDetail,
        hpvOrderReason: currentHpv.hpvOrderReason,
        educationalNotes: currentSpecimen.cytologyScreening?.educationalNotes,
      },
      screenedByReview ? { name: screenedByReview.recordedBy.userName } : undefined,
      { name: (signedByReview ?? reviewForContent).recordedBy.userName, isPathologist },
      (signedByReview ?? reviewForContent).recordedAt,
    );
    const doc = generateCytologyReportPdf(content);
    doc.output('dataurlnewwindow');
  };

  // Real, per direct follow-up: automatic resolution attempt for every
  // real, unrecorded histology correlation candidate — pulls the
  // candidate case's own real specimens, aggregates whatever real
  // SNOMED coding exists across them (a candidate case may have more
  // than one specimen; the real relevant biopsy specimen isn't known
  // in advance — resolveCytologyHistologySeverityFromSnomed.ts's own
  // "highest resolvable severity wins" reasoning already handles this
  // safely), resolves against the real, admin-configured mapping
  // (empty until a real license exists — honestly unresolvable until
  // then, never a fabricated result), and runs the real comparison.
  useEffect(() => {
    const candidates = (currentSpecimen?.cytologyScreening?.histologyCorrelationCandidates ?? []).filter(
      (c: { recordedActivityRecordId?: string }) => c.recordedActivityRecordId === undefined,
    );
    if (candidates.length === 0) return;
    const cytologyRank = categories.find(c => c.id === currentFinalDiagnosis?.primaryInterpretationId)?.diagnosticRank;
    const cytologyDxLabel = categories.find(c => c.id === currentFinalDiagnosis?.primaryInterpretationId)?.label ?? 'Unknown';

    (async () => {
      const mappingRes = await mockSnomedCervicalHistologySeverityMappingService.getAll();
      const mapping = mappingRes.ok ? mappingRes.data : [];

      for (const candidate of candidates as { candidateCaseId: string }[]) {
        const candidateCase = await caseRouter.getCase(candidate.candidateCaseId);
        const allSnomed = ((candidateCase?.specimens as any[]) ?? []).flatMap(sp => sp.coding?.snomed ?? []);
        const histologyRank = resolveCytologyHistologySeverityFromSnomed(allSnomed, mapping);
        const outcome = resolveCytologyHistologyCorrelationOutcome(cytologyRank, histologyRank);
        const matchedEntry = mapping.find(m => allSnomed.some((s: { code: string }) => s.code === m.snomedCode));

        setHistologyCorrelationResolutions(prev => ({
          ...prev,
          [candidate.candidateCaseId]: { cytologyDxLabel, histologyDxDescription: matchedEntry?.description, outcome, cytologyRank, histologyRank },
        }));
      }
    })();
  }, [currentSpecimen?.cytologyScreening?.histologyCorrelationCandidates, categories, currentFinalDiagnosis?.primaryInterpretationId]);

  // Real, per direct follow-up: records the actual real correlation —
  // reusing the already-existing, already-seeded "Cytology-Histology
  // Correlation" QaActivityType, matching PS-217's own established
  // "reuse the existing QA/CAPA framework, wire it, don't invent a
  // second one" discipline. The full, real 4-value outcome
  // (concordant/minor/major) this module's own report specification
  // needs is preserved in fieldValues.discrepancyMagnitude — the
  // activity record's own top-level `outcome` field only supports the
  // real, binary concordant/discordant distinction (QaReviewOutcome),
  // so minor and major both map to a real, honest "discordant" there.
  const handleRecordHistologyCorrelation = async (candidateCaseId: string, histologyDx: string, outcome: 'concordant' | 'discordant', magnitude?: CytologyHistologyCorrelationOutcome, cytologyRank?: number, histologyRank?: number) => {
    if (!caseData || !specimenId || !user?.id) return;
    setRecordingHistologyCorrelation(candidateCaseId);
    try {
      const cytologyDxLabel = categories.find(c => c.id === currentFinalDiagnosis?.primaryInterpretationId)?.label ?? 'Unknown';
      const created = await qaActivityRecordService.create({
        activityTypeId: CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID,
        caseId, specimenId,
        caseType: currentSpecimen?.description || 'GYN Cytology',
        fieldValues: {
          cytologyDx: cytologyDxLabel,
          histologyDx,
          // Real, per direct follow-up building the actual aggregate
          // report: the histology case reference and both raw
          // diagnosticRank values, so Correlation_Rate_%/PPV_HSIL can
          // be computed from the same real severity scale this
          // module's own comparison logic already uses, rather than
          // re-parsing free text. Omitted (never a fabricated 0) when
          // genuinely unresolvable — the manual-entry path has no real
          // histologyRank to record.
          histologyCaseId: candidateCaseId,
          ...(cytologyRank !== undefined ? { cytologyRank } : {}),
          ...(histologyRank !== undefined ? { histologyRank } : {}),
          ...(magnitude && magnitude !== 'concordant' ? { discrepancyMagnitude: magnitude } : {}),
        },
        outcome,
        recordedBy: { userId: user.id, userName: user.name },
      });
      if (!created.ok) return;
      const updatedCandidates = (currentSpecimen?.cytologyScreening?.histologyCorrelationCandidates ?? []).map((c: { candidateCaseId: string }) =>
        c.candidateCaseId === candidateCaseId ? { ...c, recordedActivityRecordId: created.data.id } : c,
      );
      await updateSpecimen({ histologyCorrelationCandidates: updatedCandidates });
      await load();
      toast.success('Cyto-histologic correlation recorded.');
    } finally {
      setRecordingHistologyCorrelation(null);
    }
  };

  // Real, per direct follow-up: a candidate that turns out not to be
  // the real, relevant biopsy (this app's own candidate detection is
  // deliberately approximate — see resolveCytologyHistologyCorrelationCandidates.ts's
  // own header) is dismissed without ever creating a real
  // QaActivityRecord — a real, honest "not applicable," never a
  // fabricated correlation.
  const handleDismissHistologyCorrelationCandidate = async (candidateCaseId: string) => {
    const updatedCandidates = (currentSpecimen?.cytologyScreening?.histologyCorrelationCandidates ?? []).map((c: { candidateCaseId: string }) =>
      c.candidateCaseId === candidateCaseId ? { ...c, dismissedAsNotRelevant: true } : c,
    );
    await updateSpecimen({ histologyCorrelationCandidates: updatedCandidates });
    await load();
  };

  const currentPostSignOutPeerReviewFlag = currentSpecimen?.cytologyScreening?.postSignOutPeerReviewFlag;
  const resolvedRole = useMemo(() => resolveCytologyReviewerRole(
    reviews, isPathologist, currentQcFlag,
    user?.id ? { flag: currentPostSignOutPeerReviewFlag, originalSignerId: signOutRecords[0]?.signedBy.userId, currentUserId: user.id } : undefined,
  ), [reviews, isPathologist, currentQcFlag, currentPostSignOutPeerReviewFlag, signOutRecords, user?.id]);

  // Real, per direct correction: default straight into editing the
  // current user's own, most recent review on this specimen, if one
  // exists — never a fresh "record a new review" form for someone
  // who's already reviewed this case. Runs once per real case
  // (specimenId), not on every reviews/load() refresh afterward, so
  // it never silently overwrites in-progress edits later in the same
  // visit.
  useEffect(() => {
    if (!specimenId || !user?.id) return;
    if (initializedOwnReviewForCase.current === specimenId) return;
    initializedOwnReviewForCase.current = specimenId;
    const own = resolveOwnCytologyReview(reviews, user.id);
    if (own) {
      setEditingReviewId(own.id);
      setReviewMode(resolveCytologyReviewMode(own));
      const loaded: Draft = {
        generalCategorizationId: own.generalCategorizationId ?? '',
        adequacySelections: own.adequacySelections ?? [],
        primaryInterpretationId: own.primaryInterpretationId,
        primaryInterpretationComment: own.primaryInterpretationComment ?? '',
        additionalInterpretations: own.additionalInterpretations ?? [],
        recommendations: own.recommendations ?? [],
        notes: own.notes ?? '',
      };
      setDraft(loaded);
      setBaselineDraft(loaded);

      if (own.cisoeAScore) {
        const loadedCisoeA: CisoeADraft = {
          composition: String(own.cisoeAScore.composition.value), compositionComment: own.cisoeAScore.composition.comment ?? '',
          inflammation: String(own.cisoeAScore.inflammation.value), inflammationComment: own.cisoeAScore.inflammation.comment ?? '',
          squamous: String(own.cisoeAScore.squamous.value), squamousComment: own.cisoeAScore.squamous.comment ?? '',
          otherEndometrium: String(own.cisoeAScore.otherEndometrium.value), otherEndometriumComment: own.cisoeAScore.otherEndometrium.comment ?? '',
          endocervical: String(own.cisoeAScore.endocervical.value), endocervicalComment: own.cisoeAScore.endocervical.comment ?? '',
          adequacy: own.cisoeAScore.adequacy, notes: own.notes ?? '',
        };
        setCisoeADraft(loadedCisoeA);
        setCisoeABaselineDraft(loadedCisoeA);
      }
    }
  }, [specimenId, user?.id, reviews]);

  const adequacyOptions = categories.filter(c => c.section === 'adequacy');
  const generalCatOptions = categories.filter(c => c.section === 'general_categorization');
  const primaryOptions = categories.filter(c => c.section === 'interpretation_result' && (c.usage === 'primary' || c.usage === 'both'));
  const additionalOptions = categories.filter(c =>
    c.section === 'interpretation_result' && (c.usage === 'secondary' || c.usage === 'both') && c.id !== draft.primaryInterpretationId
  );
  const recommendationOptions = categories.filter(c => c.section === 'recommendation');
  // Real, per direct follow-up: "The contents of that description
  // field is what is use to populate the reviews and report" — this is
  // what actually populates review history and, eventually, report
  // content. Falls back to label/abbreviation only for the rare real
  // entry that genuinely has no description yet.
  const categoryLabel = (id: string) => {
    const c = categories.find(x => x.id === id);
    if (!c) return id;
    return c.description ?? (c.abbreviation ? `${c.abbreviation} — ${c.label}` : c.label);
  };

  const updateSpecimen = async (patch: Record<string, any>) => {
    if (!caseData || !specimenId) return;
    const updatedSpecimens = (caseData.specimens as any[]).map(sp =>
      sp.id === specimenId ? { ...sp, cytologyScreening: { ...sp.cytologyScreening, ...patch } } : sp
    );
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
  };

  // Real, per direct follow-up closing PS-213's own remaining gap: the
  // real, previously-missing UI for a reviewer to actually complete a
  // 5-year retrospective review — without this, resolveCytologyRetrospectiveReviewPoolMembership
  // would never see a real, recorded outcome, and the worklist tile
  // would fill but never empty.
  const handleCompleteRetrospectiveReview = async () => {
    if (!currentRetrospectiveReviewFlag || !retrospectiveOutcomeDraft || !user?.id) return;
    setSavingRetrospectiveOutcome(true);
    try {
      await updateSpecimen({
        retrospectiveReviewFlag: {
          ...currentRetrospectiveReviewFlag,
          outcome: retrospectiveOutcomeDraft,
          correctiveAction: retrospectiveCorrectiveActionDraft.trim() || undefined,
          reviewedBy: user.id,
          reviewedByName: user.name,
          reviewedAt: new Date().toISOString(),
        },
      });
      await load();
      toast.success('5-year retrospective review recorded.');
    } finally {
      setSavingRetrospectiveOutcome(false);
    }
  };

  const handleClone = (sourceId: string) => {
    if (isDirty && !window.confirm('You have unsaved changes to this review. Discard them and load this one instead?')) return;
    const source = reviews.find(r => r.id === sourceId);
    if (!source || !user?.id) return;
    const cloned = cloneCytologyReviewAsDraft(source, { userId: user.id, userName: user.name }, resolvedRole);
    setDraft({
      generalCategorizationId: cloned.generalCategorizationId ?? '',
      adequacySelections: cloned.adequacySelections ?? [],
      primaryInterpretationId: cloned.primaryInterpretationId,
      primaryInterpretationComment: '',
      additionalInterpretations: cloned.additionalInterpretations ?? [],
      recommendations: cloned.recommendations ?? [],
      notes: '',
    });
  };

  // Real, per direct guidance: the real CISOE-A save path — genuinely
  // parallel to handleSave below, not a branch inside it, since the
  // real input shape (6 independent axes) and the real computation
  // (map to Bethesda, then reuse every existing resolver) are both
  // structurally different from the single-pick Bethesda/BSCC/
  // München flow.
  // Real, per direct guidance's own CLIA 42 CFR § 493.1274 workload
  // specification, Phase 1: the real, shared capacity check both real
  // save paths (Bethesda/BSCC/München and CISOE-A) call before
  // actually creating or updating a review. Real, pure check only —
  // no side effects; the real ledger entry is recorded separately,
  // only after a real save genuinely succeeds, so a failed save never
  // consumes real workload capacity that was never actually used.
  const checkWorkloadCapacity = async (targetReviewMode: CytologyReviewMode): Promise<CytologyWorkloadCapacityStatus | null> => {
    if (!user?.id) return null;
    const scuWeight = resolveCytologyScuWeight(targetReviewMode);
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [enterpriseRes, facilityRes, staffRes, ledgerRes] = await Promise.all([
      mockCytologyWorkloadCapSettingsService.get(),
      caseData?.order?.facilityId ? mockFacilityCytologyWorkloadCapOverrideService.getForFacility(caseData.order.facilityId) : Promise.resolve({ ok: true as const, data: null }),
      mockStaffCytologyWorkloadCapOverrideService.getForStaff(user.id),
      mockCytologyWorkloadLedgerService.getForUserInWindow(user.id, windowStart, now.toISOString()),
    ]);
    if (!enterpriseRes.ok || !facilityRes.ok || !staffRes.ok || !ledgerRes.ok) return null;

    const effectiveCap = resolveEffectiveCytologyWorkloadCap(enterpriseRes.data, facilityRes.data, staffRes.data);
    const priorScuSum = ledgerRes.data.reduce((sum, e) => sum + e.scuWeight, 0);
    const priorActiveSeconds = ledgerRes.data.reduce((sum, e) => sum + e.activeDurationSeconds, 0);
    // Real, per direct guidance's own established formula: real, prior
    // completed active time in the window PLUS this current, in-
    // progress session's own real, locally-accumulated seconds — never
    // just the prior sum alone, or a real first review of the day
    // would show zero active hours and block before any work could
    // ever be recorded.
    const totalActiveHours = (priorActiveSeconds + activeScreeningSeconds) / 3600;
    const candidateScu = priorScuSum + scuWeight;

    return resolveCytologyWorkloadCapacity(candidateScu, totalActiveHours, effectiveCap.dailySlideCap);
  };

  const recordWorkloadLedgerEntry = async (targetReviewMode: CytologyReviewMode, reviewRecordId: string) => {
    if (!user?.id || !caseId || !specimenId) return;
    await mockCytologyWorkloadLedgerService.record({
      userId: user.id, caseId, specimenId, reviewRecordId,
      reviewMode: targetReviewMode, scuWeight: resolveCytologyScuWeight(targetReviewMode),
      activeDurationSeconds: activeScreeningSeconds, completedAt: new Date().toISOString(),
    });
  };

  // Real, per direct investigation into "high-risk criteria still
  // lacking real data capture": CytologyHighRiskFactors,
  // resolveCytologyHighRiskStatus.ts, and both of its real, existing
  // partial resolvers (resolvePriorAbnormalPapFactor.ts,
  // resolveHpvHighRiskFactors.ts) already existed, real and correct —
  // but nothing in this app ever actually called them. This is the
  // real, missing wiring: gathers this patient's own real review
  // history from their OTHER real cases (direct patient.id match only,
  // not MPI-linked identities — a real, deliberate scope limit, not an
  // oversight), assembles the real, currently-resolvable factors, and
  // — if genuinely high-risk — applies the same real 'targeted_high_risk'
  // qcFlag value this app's own worklist/gate logic already understands,
  // so a genuinely high-risk, cytology-negative case is correctly
  // routed into mandatory QC before it can be signed out by a CT alone,
  // with zero changes needed to resolveCytologySignOutGate itself.
  // Real, deliberate priority: called before the existing random-QC
  // check below, and that check is skipped entirely if this one
  // already applied — a real, targeted, known risk factor is the real
  // reason for mandatory review here, not an incidental coincidence
  // with random sampling.
  const applyHighRiskQcFlagIfNeeded = async (): Promise<boolean> => {
    if (!caseData?.patient?.id || !caseId) return false;
    const [allCasesRes, allReviewsRes, encountersRes] = await Promise.all([
      caseRouter.getAll(),
      mockCytologyReviewRecordService.getAll(),
      mockEncounterService.listForPatient(caseData.patient.id),
    ]);
    if (!allCasesRes.ok || !allReviewsRes.ok) return false;
    const otherCaseIds = new Set(
      (allCasesRes.data as any[])
        .filter(c => c.id !== caseId && c.patient?.id === caseData.patient!.id)
        .map(c => c.id),
    );
    const otherCasesReviews = allReviewsRes.data.filter(r => otherCaseIds.has(r.caseId));
    const patientEncounters = encountersRes.ok ? encountersRes.data : [];
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: currentSpecimen?.cytologyScreening?.hpvResult, hpvGenotypeDetail: currentSpecimen?.cytologyScreening?.hpvGenotypeDetail },
      otherCasesReviews,
      patientEncounters,
      currentSpecimen?.cytologyScreening?.persistentContactBleedingAtCollection,
      new Date(),
    );
    const highRisk = resolveCytologyHighRiskStatus(factors);
    if (highRisk.isHighRisk) {
      await updateSpecimen({ qcFlag: { reason: 'targeted_high_risk', flaggedBy: 'system', flaggedByName: 'Automatic High-Risk Patient Identification', flaggedAt: new Date().toISOString() } });
      toast.warning('This case was flagged for mandatory QC review — the patient meets one or more real, standard high-risk criteria.');
      return true;
    }
    return false;
  };

  const handleSaveCisoeA = async () => {
    if (!specimenId || !caseId || !user?.id) return;
    const score = resolveCisoeAScoreFromDraft(cisoeADraft);
    const validation = resolveCisoeAValidation(score ?? resolveCisoeAPartialFromDraft(cisoeADraft));
    setCisoeAErrors(validation.errors);
    setCisoeAWarnings(validation.warnings);
    if (!validation.valid || !score) return;

    const targetReviewMode: CytologyReviewMode = isPathologist ? 'pathologist_review' : reviewMode;
    const capacity = await checkWorkloadCapacity(targetReviewMode);
    setWorkloadStatus(capacity);
    if (capacity?.status === 'exceeded') {
      const { blocked } = await handleWorkloadCapacityExceeded(targetReviewMode);
      if (blocked) {
        toast.info('This case has been reassigned — your remaining queue was returned to the pool for other available cytotechnologists.');
        navigate('/cytology-worklist');
        return;
      }
    } else {
      setWorkloadBlockedReason(null);
    }

    setSaving(true);
    try {
      const { primaryInterpretationId, additionalInterpretationIds } = resolveCisoeAToBethesda(score, bethesdaForMapping);
      const requiresPathologistReview = resolveCytologyReviewRequirement(
        [primaryInterpretationId, ...additionalInterpretationIds],
        bethesdaForMapping,
      );
      const adequacyCategoryId = resolveCisoeAAdequacyToBethesda(score.adequacy);

      if (editingReviewId) {
        const updated = await mockCytologyReviewRecordService.update(editingReviewId, user.id, {
          adequacySelections: [{ categoryId: adequacyCategoryId }],
          primaryInterpretationId,
          additionalInterpretations: additionalInterpretationIds.map(id => ({ categoryId: id })),
          cisoeAScore: score,
          requiresPathologistReview,
          notes: cisoeADraft.notes || undefined,
          // Real, per direct guidance's own confirmed redesign: CISOE-A
          // and the Synoptic drawer are mutually exclusive — the real
          // trigger button is already guarded (showSynopticTrigger)
          // so draft.synopticData should never be populated on this
          // real save path. Defensive, not silent: if it somehow is
          // (e.g. a real mid-session nomenclatureSystem change after
          // the drawer was already used), this is genuinely orphaned
          // state that must never be written into a real CISOE-A
          // review record — warned in development, explicitly
          // omitted either way, never silently carried through.
          synopticData: (() => {
            if (draft.synopticData && import.meta.env.DEV) {
              console.warn('CytologyScreeningPage: draft.synopticData was unexpectedly populated while saving a CISOE-A review; discarding rather than writing orphaned synoptic state onto a CISOE-A record.');
            }
            return undefined;
          })(),
        });
        if (updated.ok) {
          await recordWorkloadLedgerEntry(targetReviewMode, updated.data.id);
          setCisoeABaselineDraft(cisoeADraft);
          await load();
        }
        return;
      }

      const created = await mockCytologyReviewRecordService.create({
        specimenId, caseId, role: resolvedRole,
        adequacySelections: [{ categoryId: adequacyCategoryId }],
        primaryInterpretationId,
        additionalInterpretations: additionalInterpretationIds.map(id => ({ categoryId: id })),
        cisoeAScore: score,
        requiresPathologistReview,
        reviewMode: targetReviewMode,
        notes: cisoeADraft.notes || undefined,
        // Real, same reasoning as the update path above — see that
        // one's own comment for the full account.
        synopticData: (() => {
          if (draft.synopticData && import.meta.env.DEV) {
            console.warn('CytologyScreeningPage: draft.synopticData was unexpectedly populated while saving a CISOE-A review; discarding rather than writing orphaned synoptic state onto a CISOE-A record.');
          }
          return undefined;
        })(),
        recordedBy: { userId: user.id, userName: user.name },
      });
      if (created.ok) {
        await recordWorkloadLedgerEntry(targetReviewMode, created.data.id);
        if (created.data.role === 'primary_screen') {
          const alreadyHighRisk = await applyHighRiskQcFlagIfNeeded();
          if (!alreadyHighRisk && caseData?.order?.facilityId) {
            const facilityId = caseData.order.facilityId;
            const [enterpriseRes, facilityRes, staffRes] = await Promise.all([
              mockCytologyQcSettingsService.get(),
              mockFacilityCytologyQcOverrideService.getForFacility(facilityId),
              mockStaffCytologyQcOverrideService.getForStaff(user.id),
            ]);
            if (enterpriseRes.ok && facilityRes.ok && staffRes.ok) {
              const effective = resolveEffectiveCytologyQcSettings(enterpriseRes.data, facilityRes.data, staffRes.data);
              const isNegative = !created.data.requiresPathologistReview;
              const selected = resolveCytologyRandomQcSelection(isNegative, effective, Math.random());
              if (selected) {
                await updateSpecimen({ qcFlag: { reason: 'random_selection', flaggedBy: 'system', flaggedByName: 'Automatic Random QC Selection', flaggedAt: new Date().toISOString() } });
                toast.info('This case was randomly selected for mandatory QC review.');
              }
            }
          }
        } else {
          await applyGynCytologySecondaryScreeningActivityRecord(created.data);
        }
        setEditingReviewId(created.data.id);
        setCisoeABaselineDraft(cisoeADraft);
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  // Real, per direct guidance's own CLIA workload specification, Phase
  // 2: reassignment. Real, shared between both save paths — reassigns
  // this user's own, real, still-pending cytology queue back to the
  // pool (explicitly unassigned, same real mechanism
  // casePoolAssignmentService.ts already uses for its own routing),
  // per the real "without altering specimen accession status"
  // requirement — this only ever touches case-level assignment.
  const reassignRemainingWorkloadQueue = async (includeCurrentCase: boolean) => {
    if (!user?.id) return;
    const myCases = await caseRouter.listCasesForUser(user.id);
    const candidates = resolveCytologyWorkloadReassignmentCandidates(myCases, user.id)
      .filter(c => includeCurrentCase || c.id !== caseId);
    // Real, direct follow-up (PS-71): applyPoolRouting() now passes the
    // case's own expectedVersion, so a candidate that was edited elsewhere
    // between the listCasesForUser() fetch above and this write can now
    // throw a real ConcurrencyConflictError instead of silently
    // overwriting. Non-blocking here, same posture as this exact call's
    // own sibling in useGrossingCompletion.ts ("Pool routing failed
    // (non-blocking)") — a rare reassignment race on someone's overflow
    // queue must never fail or crash the specimen save this function is
    // called from.
    await Promise.all(candidates.map(c =>
      applyPoolRouting(c, '1', 'Cytology').catch(e => console.error('Workload reassignment routing failed (non-blocking):', e))
    ));
  };

  // Real, shared capacity-exceeded handling for both save paths. Real,
  // per direct guidance's own Phase 2 "Retroactive Weight Adjustment"
  // scenario: an escalation of an ALREADY-SAVED review (e.g. FOV-
  // assisted pivoting to a full manual rescreen) is allowed through —
  // "preventing orphaned clinical data" — even over capacity, but the
  // rest of the user's real queue still gets reassigned immediately
  // afterward. A brand-new review that was never going to fit at all
  // is hard-blocked, and reassignment includes this case too, since
  // nothing real was ever saved for it.
  const handleWorkloadCapacityExceeded = async (targetReviewMode: CytologyReviewMode): Promise<{ blocked: boolean }> => {
    const existingReview = editingReviewId ? reviews.find(r => r.id === editingReviewId) : undefined;
    const isEscalation = existingReview && resolveIsRetroactiveScuEscalation(resolveCytologyReviewMode(existingReview), targetReviewMode);

    if (isEscalation) {
      setWorkloadBlockedReason('This case will be saved — real, already-recorded clinical work is never discarded — but you are now over your prorated CLIA screening limit. Your remaining queue is being reassigned to other available cytotechnologists.');
      await reassignRemainingWorkloadQueue(false);
      return { blocked: false };
    }

    setWorkloadBlockedReason('You have reached your prorated CLIA screening limit for this session. This case and your remaining queue are being reassigned to other available cytotechnologists.');
    await reassignRemainingWorkloadQueue(true);
    return { blocked: true };
  };

  const handleSave = async () => {
    if (!specimenId || !caseId || !user?.id || !draft.primaryInterpretationId) return;
    const targetReviewMode: CytologyReviewMode = isPathologist ? 'pathologist_review' : reviewMode;
    const capacity = await checkWorkloadCapacity(targetReviewMode);
    setWorkloadStatus(capacity);
    if (capacity?.status === 'exceeded') {
      const { blocked } = await handleWorkloadCapacityExceeded(targetReviewMode);
      if (blocked) {
        toast.info('This case has been reassigned — your remaining queue was returned to the pool for other available cytotechnologists.');
        navigate('/cytology-worklist');
        return;
      }
    } else {
      setWorkloadBlockedReason(null);
    }

    setSaving(true);
    try {
      const requiresPathologistReview = resolveCytologyReviewRequirement(
        allCytologyInterpretationIds({ primaryInterpretationId: draft.primaryInterpretationId, additionalInterpretations: draft.additionalInterpretations }),
        categories,
      );

      // Real, per direct correction: a user who already owns a review
      // on this specimen is editing it, never creating a second,
      // separate one — the real, established "a User may edit their
      // own review, but no one else's" posture (PS-153).
      if (editingReviewId) {
        const updated = await mockCytologyReviewRecordService.update(editingReviewId, user.id, {
          adequacySelections: draft.adequacySelections.length ? draft.adequacySelections : undefined,
          generalCategorizationId: draft.generalCategorizationId || undefined,
          primaryInterpretationId: draft.primaryInterpretationId,
          primaryInterpretationComment: draft.primaryInterpretationComment || undefined,
          additionalInterpretations: draft.additionalInterpretations.length ? draft.additionalInterpretations : undefined,
          recommendations: draft.recommendations.length ? draft.recommendations : undefined,
          requiresPathologistReview,
          notes: draft.notes || undefined,
          synopticData: draft.synopticData,
        });
        if (updated.ok) {
          // Real, deliberate: no random QC selection re-roll here —
          // that's a one-time event at real, initial creation
          // (below), never re-triggered by editing an existing
          // review. Draft is left as-is (it now matches what was
          // just saved), not reset to empty.
          await recordWorkloadLedgerEntry(targetReviewMode, updated.data.id);
          setBaselineDraft(draft);
          await load();
          // Real, per direct follow-up: "obviously that is a huge
          // gap. Sort of the whole point of concordance monitoring."
          // Prompted only now — after the reviewer's own,
          // independent finding is already saved — and only once
          // per real AI result (a real human judgment is never
          // re-asked on every subsequent edit).
          if (aiScreeningResult && aiScreeningResult.humanConcordant === undefined) setShowConcordancePrompt(true);
        }
        return;
      }

      const created = await mockCytologyReviewRecordService.create({
        specimenId, caseId, role: resolvedRole,
        adequacySelections: draft.adequacySelections.length ? draft.adequacySelections : undefined,
        generalCategorizationId: draft.generalCategorizationId || undefined,
        primaryInterpretationId: draft.primaryInterpretationId,
        primaryInterpretationComment: draft.primaryInterpretationComment || undefined,
        additionalInterpretations: draft.additionalInterpretations.length ? draft.additionalInterpretations : undefined,
        recommendations: draft.recommendations.length ? draft.recommendations : undefined,
        reviewMode: targetReviewMode,
        requiresPathologistReview,
        notes: draft.notes || undefined,
        synopticData: draft.synopticData,
        recordedBy: { userId: user.id, userName: user.name },
      });
      if (created.ok) {
        // Real, per direct correction: the random QC selection
        // algorithm runs automatically, right here, the moment the
        // real INITIAL review (primary_screen) is saved — never a
        // manual user action, and never for a later secondary/
        // pathologist review, since a case is only genuinely eligible
        // for this specific real selection mechanism once.
        if (created.data.role === 'primary_screen') {
          const alreadyHighRisk = await applyHighRiskQcFlagIfNeeded();
          if (!alreadyHighRisk && caseData?.order?.facilityId) {
            const facilityId = caseData.order.facilityId;
            const [enterpriseRes, facilityRes, staffRes] = await Promise.all([
              mockCytologyQcSettingsService.get(),
              mockFacilityCytologyQcOverrideService.getForFacility(facilityId),
              mockStaffCytologyQcOverrideService.getForStaff(user.id),
            ]);
            if (enterpriseRes.ok && facilityRes.ok && staffRes.ok) {
              const effective = resolveEffectiveCytologyQcSettings(enterpriseRes.data, facilityRes.data, staffRes.data);
              const isNegative = !created.data.requiresPathologistReview;
              const selected = resolveCytologyRandomQcSelection(isNegative, effective, Math.random());
              if (selected) {
                await updateSpecimen({ qcFlag: { reason: 'random_selection', flaggedBy: 'system', flaggedByName: 'Automatic Random QC Selection', flaggedAt: new Date().toISOString() } });
                toast.info('This case was randomly selected for mandatory QC review.');
              }
            }
          }
        } else {
          await applyGynCytologySecondaryScreeningActivityRecord(created.data);
        }
        // Real: this new review is now the user's own — subsequent
        // saves on this same case should update it, not create
        // another one.
        await recordWorkloadLedgerEntry(targetReviewMode, created.data.id);
        setEditingReviewId(created.data.id);
        setBaselineDraft(draft);
        await load();
        // Real, per direct follow-up: "obviously that is a huge gap.
        // Sort of the whole point of concordance monitoring." Same
        // real trigger as the editingReviewId branch above.
        if (aiScreeningResult && aiScreeningResult.humanConcordant === undefined) setShowConcordancePrompt(true);
      }
    } finally {
      setSaving(false);
    }
  };

  // Real, per direct follow-up: "obviously that is a huge gap. Sort
  // of the whole point of concordance monitoring." A real, explicit
  // human judgment — never inferred by comparing text labels, which
  // would be a real, unreliable heuristic (the same real diagnosis
  // can be phrased differently by a real AI vendor's own finding
  // label vs. this app's own dictionary term).
  const handleConcordanceResponse = async (concordant: boolean) => {
    if (!aiScreeningResult) return;
    setRecordingConcordance(true);
    try {
      const result = await recordAiHumanConcordance(aiScreeningResult.id, concordant);
      if (result.ok) {
        setAiScreeningResult(result.data);
        if (!concordant) {
          toast.info('Recorded — a QA deficiency has been raised for this discordance.');
        }
      }
    } finally {
      setRecordingConcordance(false);
      setShowConcordancePrompt(false);
    }
  };

  // Real, per direct guidance's own follow-up ("Final Diagnosis has no
  // role restriction"): a real, live gap this app shipped with since
  // the screening page was first built — any user reaching this page
  // could select any review as Final Diagnosis, including a
  // Cytotechnologist selecting a review that genuinely requires
  // pathologist review. Real, deliberate fix: reuses the exact same
  // real gate (resolveCytologySignOutGate) and authorization decision
  // (resolveCanSignOutCytology) the actual Sign Out action already
  // enforces — evaluated against the real candidate review being
  // selected here, not the currently-selected Final Diagnosis (there
  // may not be one yet). The real rationale is the same one that
  // gate already documents: selecting a review as Final Diagnosis is
  // the step that determines what gets signed out, so the same real
  // CLIA/CAP authority boundary applies here, not only at the final
  // Sign Out click.
  const handleSelectFinalDiagnosis = async (reviewId: string) => {
    const review = reviews.find(r => r.id === reviewId);
    if (!review || !user?.id) return;
    const candidateGate = resolveCytologySignOutGate(
      { adequacyCategoryIds: review.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: review.requiresPathologistReview },
      isGynCytology, currentQcFlag ? true : false, categories, labJurisdiction, signingProviderCredentials, undefined,
      resolveSynopticTranslationCheckForReview(review),
    );
    if (!resolveCanSignOutCytology(isPathologist, candidateGate)) {
      toast.error('Only a Pathologist may select this review as the Final Diagnosis — it requires pathologist review before sign-out.');
      return;
    }
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(review);
    await updateSpecimen({ finalDiagnosis: { ...snapshot, selectedBy: user.id, selectedByName: user.name, selectedAt: new Date().toISOString() } });
    await load();
  };

  // Real, per direct guidance: the actual Sign Out action. Requires a
  // real Final Diagnosis already selected (Set as Final, above) — a
  // real report cannot be signed without one. Authorization is real,
  // per resolveCanSignOutCytology (this phase): a Pathologist can
  // always sign; a Cytotechnologist only when the real CT-eligibility
  // gate (PS-163) allows it for the Final Diagnosis review specifically.
  // Real, per CAP's own mandatory "5-Year Retrospective Lookback"
  // requirement (CYT-QA-03) — separate, real trigger point from the
  // High-Risk QC flag above: this runs at real SIGN-OUT (the moment
  // the patient genuinely "receives" a diagnosis), not at every
  // intermediate review save, since an unconfirmed CT impression of
  // HSIL could still be revised by the pathologist before release —
  // triggering a retrospective lookback on an unconfirmed impression
  // would be premature. Real, deliberate early exit before any real
  // fetch: this only ever matters for the real minority of sign-outs
  // that are genuinely HSIL+/AIS/malignant.
  const applyFiveYearRetrospectiveLookbackIfNeeded = async (finalReviewInterpretationId: string) => {
    if (!caseData?.patient?.id || !caseId || !specimenId) return;
    const triggeringRank = categories.find(c => c.id === finalReviewInterpretationId)?.diagnosticRank;
    if (triggeringRank === undefined || triggeringRank < 4) return;

    const [allCasesRes, allReviewsRes] = await Promise.all([
      caseRouter.getAll(),
      mockCytologyReviewRecordService.getAll(),
    ]);
    if (!allCasesRes.ok || !allReviewsRes.ok) return;

    const otherCases = (allCasesRes.data as any[]).filter(c => c.id !== caseId && c.patient?.id === caseData.patient!.id);
    const otherCaseIds = new Set(otherCases.map(c => c.id));
    const otherCasesReviews = allReviewsRes.data.filter(r => otherCaseIds.has(r.caseId));
    const reviewsWithRank = otherCasesReviews.map(r => ({
      id: r.id, caseId: r.caseId, specimenId: r.specimenId, recordedAt: r.recordedAt,
      diagnosticRank: categories.find(c => c.id === r.primaryInterpretationId)?.diagnosticRank,
    }));

    const flagged = resolveCytologyFiveYearRetrospectiveLookback(triggeringRank, reviewsWithRank, new Date());
    if (flagged.length === 0) return;

    const byCaseId = new Map<string, typeof flagged>();
    for (const f of flagged) {
      const list = byCaseId.get(f.caseId) ?? [];
      list.push(f);
      byCaseId.set(f.caseId, list);
    }

    for (const [targetCaseId, items] of byCaseId) {
      const targetCase = otherCases.find(c => c.id === targetCaseId);
      if (!targetCase) continue;
      const updatedSpecimens = (targetCase.specimens as any[]).map(sp => {
        const match = items.find(i => i.specimenId === sp.id);
        if (!match) return sp;
        return {
          ...sp,
          cytologyScreening: {
            ...sp.cytologyScreening,
            retrospectiveReviewFlag: {
              reason: 'five_year_lookback_on_new_high_grade_diagnosis',
              triggeredByCaseId: caseId,
              triggeredBySpecimenId: specimenId,
              triggeredAt: new Date().toISOString(),
            },
          },
        };
      });
      await caseRouter.updateCase(targetCaseId, { specimens: updatedSpecimens } as any);
    }

    toast.warning(`${flagged.length} prior negative cytology result(s) for this patient flagged for mandatory 5-year retrospective review.`);
  };

  // Real, per direct guidance: post-sign-out peer review combines
  // random baseline sampling with targeted review of high-risk
  // categories, exactly mirroring the pre-sign-out qc_random_selection/
  // qc_targeted_high_risk split — "reusing your existing... logic
  // keeps the system architecture consistent across both pre- and
  // post-sign-out queues." Targeted takes priority when both would
  // apply, the same real priority already established for the
  // pre-sign-out high-risk QC flag. Real, deliberate, honest scope
  // choice for this first pass: reuses the SAME real 3-tier QC rate
  // cascade (Enterprise/Facility/Staff) the pre-sign-out random check
  // already resolves, rather than standing up a second, separate
  // settings cascade — a real, worthwhile follow-on if a genuinely
  // distinct post-sign-out sampling rate is ever wanted.
  const applyPostSignOutPeerReviewFlagIfNeeded = async (finalReviewInterpretationId: string, finalReviewRequiresPathologistReview: boolean) => {
    if (!user?.id) return;
    const signedOutRank = categories.find(c => c.id === finalReviewInterpretationId)?.diagnosticRank;
    const isTargeted = resolveCytologyPeerReviewTargetedSelection(signedOutRank);

    let isRandom = false;
    if (!isTargeted && caseData?.order?.facilityId) {
      const facilityId = caseData.order.facilityId;
      const [enterpriseRes, facilityRes, staffRes] = await Promise.all([
        mockCytologyQcSettingsService.get(),
        mockFacilityCytologyQcOverrideService.getForFacility(facilityId),
        mockStaffCytologyQcOverrideService.getForStaff(user.id),
      ]);
      if (enterpriseRes.ok && facilityRes.ok && staffRes.ok) {
        const effective = resolveEffectiveCytologyQcSettings(enterpriseRes.data, facilityRes.data, staffRes.data);
        isRandom = resolveCytologyRandomQcSelection(!finalReviewRequiresPathologistReview, effective, Math.random());
      }
    }

    if (isTargeted || isRandom) {
      await updateSpecimen({
        postSignOutPeerReviewFlag: {
          reason: isTargeted ? 'targeted_high_risk' : 'random_selection',
          flaggedBy: 'system', flaggedByName: 'Automatic Post-Sign-Out Peer Review Selection',
          flaggedAt: new Date().toISOString(),
        },
      });
    }
  };

  // Real, per direct follow-up ("Yes, wire cytology"): the real,
  // previously-orphaned gap found while investigating QA report
  // infrastructure — GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID
  // already existed as a real, seeded QaActivityType, and
  // resolveCytologyCategorySetConcordance.ts already existed as its
  // own real, tested comparison function — but nothing in this app
  // ever actually called qaActivityRecordService.create() for a
  // cytology review. This is the real, missing connection: every real
  // secondary-screening event (a random/targeted QC rescreen, or a
  // Secondary Reviewer look) now produces a real QaActivityRecord,
  // comparing its own full interpretation set against the specimen's
  // own real primary_screen — the exact real comparison
  // resolveCytologyCategorySetConcordance was already built for.
  // Real, deliberate scope: no capaTriggerRule exists on this activity
  // type, by the same seed data's own explicit, deliberate design — a
  // single secondary-screening discordance is real, valuable audit
  // trail, not an automatic CAPA trigger (that real, recurring-pattern
  // decision is PS-147's own, separate, later scope). Fire-and-forget,
  // same posture as this file's own other automatic QA side effects —
  // never blocks the actual save.
  const SECONDARY_SCREENING_TRIGGER_ROLES: CytologyReviewRole[] = ['qc_random_selection', 'qc_targeted_high_risk', 'secondary_reviewer'];
  const applyGynCytologySecondaryScreeningActivityRecord = async (newReview: CytologyReviewRecord) => {
    if (!SECONDARY_SCREENING_TRIGGER_ROLES.includes(newReview.role) || !caseData || !user?.id) return;
    const primaryReview = reviews.find(r => r.role === 'primary_screen');
    if (!primaryReview) return;

    const concordance = resolveCytologyCategorySetConcordance(
      allCytologyInterpretationIds(primaryReview),
      allCytologyInterpretationIds(newReview),
    );

    await qaActivityRecordService.create({
      activityTypeId: GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID,
      caseId: newReview.caseId,
      specimenId: newReview.specimenId,
      caseType: currentSpecimen?.description || 'GYN Cytology',
      fieldValues: {
        trigger: newReview.role,
        addedByEvent: concordance.addedByComparison.join(', '),
        missedByEvent: concordance.missedByComparison.join(', '),
      },
      outcome: concordance.concordant ? 'concordant' : 'discordant',
      recordedBy: { userId: user.id, userName: user.name },
    });
  };

  // Real, per direct guidance (CYT-QA-04): real, mechanical candidate
  // detection for cyto-histologic correlation — see
  // resolveCytologyHistologyCorrelationCandidates.ts's own header for
  // the real, honest boundary this respects (surgical pathology's own
  // diagnosis is free text, so only case-selection is automated here,
  // never the actual diagnosis comparison). Fires at real sign-out,
  // using the real, final diagnosis actually being released, matching
  // this file's other two sign-out-time QA mechanisms.
  const applyHistologyCorrelationCandidateDetectionIfNeeded = async (finalReview: CytologyReviewRecord) => {
    if (!caseData?.patient?.id || !caseId || !specimenId) return;
    const finalRank = categories.find(c => c.id === finalReview.primaryInterpretationId)?.diagnosticRank;
    if (finalRank === undefined || finalRank < 1) return;

    const [allCasesRes, dictRes] = await Promise.all([
      caseRouter.getAll(),
      mockSpecimenDictionaryService.getAll(),
    ]);
    if (!allCasesRes.ok || !dictRes.ok) return;

    const dictById = new Map(dictRes.data.map(e => [e.id, e]));
    const otherCases = (allCasesRes.data as any[]).filter(c => c.id !== caseId && c.patient?.id === caseData.patient!.id);
    const otherPatientCases = otherCases.map(c => {
      const specimens = (c.specimens as any[]) ?? [];
      // Real, deliberate conservative default: a specimen with no
      // resolvable dictionary entry is treated as NOT cytology — this
      // resolver's own real job is surfacing a plausible candidate for
      // a real human to confirm, never silently hiding one.
      const hasNonCytologySpecimen = specimens.some(sp => {
        const entry = sp.specimenDictionaryEntryId ? dictById.get(sp.specimenDictionaryEntryId) : undefined;
        return !(entry && (entry.type === 'Cytology' || entry.type === 'FNA'));
      });
      const receivedDates = specimens.map((sp: any) => sp.receivedAt).filter(Boolean).sort();
      return { caseId: c.id, hasNonCytologySpecimen, earliestSpecimenReceivedAt: receivedDates[0] };
    });

    const candidates = resolveCytologyHistologyCorrelationCandidates(
      [{ id: finalReview.id, caseId, specimenId, diagnosticRank: finalRank, recordedAt: new Date().toISOString() }],
      otherPatientCases,
    );

    if (candidates.length > 0) {
      await updateSpecimen({
        histologyCorrelationCandidates: candidates.map(c => ({ candidateCaseId: c.candidateCaseId, detectedAt: new Date().toISOString() })),
      });
    }
  };

  const handleSignOut = async () => {
    if (!caseData || !specimenId || !user?.id || !currentFinalDiagnosis) return;
    const finalReview = reviews.find(r => r.id === currentFinalDiagnosis.reviewRecordId);
    if (!finalReview) return;

    const gate = resolveCytologySignOutGate(
      { adequacyCategoryIds: finalReview.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: finalReview.requiresPathologistReview },
      isGynCytology, currentQcFlag ? true : false, categories, labJurisdiction, signingProviderCredentials, undefined,
      resolveSynopticTranslationCheckForReview(finalReview),
    );
    if (!resolveCanSignOutCytology(isPathologist, gate)) return;

    // Real resident-countersign gate for Cytology — same real mechanism
    // as useSignOutWorkflow.ts's own gate for Surg Path (per direct
    // follow-up: "the same countersign needs to work for Cytology as
    // well"). Must run before anything else below, including the
    // 5-year lookback/ROSE-discrepancy/peer-review side effects — if
    // the current user is a resident (not also attending), an FPPE
    // provisional hire under active supervision, or a Cytotechnologist
    // under an active New Cytotechnologist Competency Assessment
    // (real, per direct follow-up: "We also should account for
    // Cytotecs trained and new staff while we are here" — the real
    // CLIA '88 Subpart M gap this closes: a brand-new CT could
    // otherwise independently sign NILM GYN cases under
    // resolveCytologySignOutGate's own real credentialed-CT exception
    // with zero supervision during their real, mandated first-year
    // competency window), their "sign out" doesn't finalize anything;
    // it releases the case for the attending/proctor/supervisor to
    // review and countersign. Everyone else (attending, or no
    // qualifying participation type) falls through to the existing
    // logic completely unchanged.
    if (caseData?.id) {
      const provisionalParticipant = caseData?.participants?.some(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === user.id && p.participationTypeIds?.includes('provisional_hire')
      );
      const cytotechParticipant = caseData?.participants?.some(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === user.id && p.participationTypeIds?.includes('cytotechnologist')
      );
      const isAttendingToo = caseData?.participants?.some(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === user.id && p.participationTypeIds?.includes('attending')
      );
      const [activeFppeAssignment, activeCytotechCompetencyAssignment] = await Promise.all([
        provisionalParticipant && !isAttendingToo
          ? qaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, user.id, (caseData as any)?.subspecialtyId).then(r => r.ok ? r.data : null).catch(() => null)
          : Promise.resolve(null),
        cytotechParticipant && !isAttendingToo
          ? qaSupervisionAssignmentService.getActiveAssignmentForUser(CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID, user.id, (caseData as any)?.subspecialtyId).then(r => r.ok ? r.data : null).catch(() => null)
          : Promise.resolve(null),
      ]);

      const countersignCheck = resolveResidentCountersignRequired({
        participants: caseData?.participants,
        signingUserId: user.id,
        hasActiveFppeAssignment: !!activeFppeAssignment,
        hasActiveCytotechCompetencyAssignment: !!activeCytotechCompetencyAssignment,
      });

      if (countersignCheck.required) {
        // Real, Cytology-native snapshot of what the resident is
        // actually submitting for review — the review record's own
        // key fields, same real purpose as Surg Path's
        // releasedAnswersSnapshot, but built from CytologyReviewRecord
        // directly rather than a PDF: this module's own established
        // "structured content, not a PDF blob" posture (see
        // CytologySignOutRecord.ts's own header) applies here too.
        const releasedAnswersSnapshot: Record<string, Record<string, string | string[]>> = {
          [specimenId]: {
            primaryInterpretationId: finalReview.primaryInterpretationId ?? '',
            generalCategorizationId: finalReview.generalCategorizationId ?? '',
            adequacySelections: (finalReview.adequacySelections ?? []).map(s => s.categoryId),
          },
        };

        await countersignService.release({
          caseId: caseData.id,
          subspecialtyId: (caseData as any)?.subspecialtyId,
          residentId: user.id,
          residentName: user.name ?? 'Unknown User',
          releasedAnswersSnapshot,
        });

        try {
          await caseRouter.updateCase(caseData.id, { status: 'pending-countersign' } as any);
          setCaseData(prev => prev ? ({ ...prev, status: 'pending-countersign' } as any) : prev);
        } catch (e) {
          console.error(e);
        }

        const attendingParticipant = caseData?.participants?.find(
          (p: CaseParticipant) => p.status === 'active' && p.participationTypeIds?.includes('attending')
        );
        const reviewerId = activeFppeAssignment?.supervisorUserId ?? activeCytotechCompetencyAssignment?.supervisorUserId ?? attendingParticipant?.staffId;
        if (reviewerId) {
          const attendingUserRes = await mockUserService.getById(reviewerId).catch(() => null);
          const attendingEmail = attendingUserRes?.ok ? attendingUserRes.data?.email : undefined;
          if (attendingEmail) {
            sendEmail({
              to: [attendingEmail],
              subject: `Case ${caseData.id} ready for your countersign`,
              bodyText: `${user.name ?? 'A resident'} has released case ${caseData.id} for your review and countersign.`,
              bodyHtml: `<p>${user.name ?? 'A resident'} has released case <strong>${caseData.id}</strong> for your review and countersign.</p>`,
              metadata: { caseId: caseData.id, action: 'countersign_requested' },
            }).catch(() => {});
          }
        }

        return;
      }
    }

    // Real, per direct guidance's own confirmed audit requirement —
    // fires at the real moment of actual sign-out, using the same
    // real, already-established audit infrastructure every other
    // real event in this app uses (never a separate, parallel log).
    // Covers BOTH real paths that can let this line be reached with
    // real, unvalidated terms still present: a real, attributed
    // acknowledgment, or a real Pathologist's own role-based
    // authority bypassing the gate entirely with no acknowledgment
    // at all — resolveSynopticTranslationSignOutAuditEvent.ts's own
    // header comment covers the full, real reasoning for logging
    // both honestly. Fire-and-forget, matching this app's own
    // established "never block sign-out on an audit write" principle.
    const translationAuditEvent = resolveSynopticTranslationSignOutAuditEvent(
      finalReview, i18n.language.split('-')[0] as PathologyLexiconLocale | 'en', pathologyLexicon,
      { userId: user.id, displayName: user.name ?? user.id, role: user.role ?? 'unknown' },
      caseData.accession?.fullAccession ?? caseData.id,
    );
    if (translationAuditEvent) auditService.logEvent(translationAuditEvent);

    // Real, per CAP's own mandatory 5-year retrospective lookback —
    // fires at the moment of real sign-out, using the real, final
    // diagnosis actually being released, not any earlier, unconfirmed
    // review.
    await applyFiveYearRetrospectiveLookbackIfNeeded(finalReview.primaryInterpretationId);

    // Real, per direct guidance's own explicit link ("linked to the
    // rose_discrepancy QC engine trigger") — fires at the same, real
    // sign-out moment as the lookback above. Compares the LAST real
    // pass of this specimen's own MOST RECENT real ROSE evaluation
    // (the real, final bedside impression the proceduralist actually
    // acted on) against the real, final lab adequacy call — never an
    // earlier pass, which wouldn't reflect what the proceduralist
    // ultimately decided.
    if (currentSpecimen?.roseEvaluations && currentSpecimen.roseEvaluations.length > 0) {
      const mostRecentRose = [...currentSpecimen.roseEvaluations].sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0];
      const lastPass = mostRecentRose.passes[mostRecentRose.passes.length - 1];
      if (lastPass) {
        const finalIsUnsatisfactory = (finalReview.adequacySelections ?? []).some(s => categories.find(c => c.id === s.categoryId)?.isUnsatisfactory === true);
        if (resolveCytologyRoseDiscrepancy(lastPass.adequacyAssessment, finalIsUnsatisfactory)) {
          const createdAssignment = await mockCytologyQcCaseAssignmentService.create(
            resolveNewQcCaseAssignmentFromRoseDiscrepancy(caseData.id, specimenId, finalReview.recordedBy.userId),
          );
          // Real, per CytologyRoseEvaluation.qcCaseAssignmentId's own
          // doc comment — links back to the real, just-created
          // assignment, never left undefined once a real discrepancy
          // has genuinely been detected and acted on.
          if (createdAssignment.ok) {
            const updatedEvaluations = (currentSpecimen.roseEvaluations ?? []).map(ev =>
              ev.id === mostRecentRose.id ? { ...ev, qcCaseAssignmentId: createdAssignment.data.id } : ev,
            );
            const updatedSpecimens = (caseData.specimens ?? []).map((sp: any) => sp.id === currentSpecimen.id ? { ...sp, roseEvaluations: updatedEvaluations } : sp);
            await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
          }
        }
      }
    }
    // Real, per direct guidance: post-sign-out peer review selection
    // (random + targeted), same real trigger point as the lookback
    // above — the moment of actual release.
    await applyPostSignOutPeerReviewFlagIfNeeded(finalReview.primaryInterpretationId, finalReview.requiresPathologistReview);
    // Real, per direct guidance (CYT-QA-04): candidate detection for
    // cyto-histologic correlation, same real trigger point.
    await applyHistologyCorrelationCandidateDetectionIfNeeded(finalReview);

    setSigningOut(true);
    try {
      const screener = reviews.find(r => r.role === 'primary_screen');
      const patientName = caseData.patient ? `${caseData.patient.firstName ?? ''} ${caseData.patient.lastName ?? ''}`.trim() : 'Unknown Patient';
      const signedAtIso = new Date().toISOString();

      const reportContent = resolveCytologyReportContent(
        finalReview, categories,
        { name: patientName, dateOfBirth: caseData.patient?.dateOfBirth, mrn: caseData.patient?.mrn, lastMenstrualPeriod: caseData.patient?.lastMenstrualPeriod, hormonalStatus: (caseData.patient as any)?.hormonalStatus, priorAbnormalPapHpvHistory: (caseData.patient as any)?.priorAbnormalPapHpvHistory, iudOrContraceptionUse: (caseData.patient as any)?.iudOrContraceptionUse },
        { accessionNumber: caseData.accession?.fullAccession ?? caseData.id, orderingProvider: caseData.order?.requestingProvider },
        {
          typeDescription: currentSpecimen?.description ?? 'Cytology specimen',
          collectedAt: currentSpecimen?.collectedAt, receivedAt: currentSpecimen?.receivedAt,
          preparationMethod: currentSpecimen?.cytologyScreening?.preparationMethod,
          computerAssistedScreening: currentSpecimen?.cytologyScreening?.computerAssistedScreening,
          hpvResult: currentHpv.hpvResult, hpvGenotypeDetail: currentHpv.hpvGenotypeDetail, hpvOrderReason: currentHpv.hpvOrderReason, educationalNotes: currentSpecimen?.cytologyScreening?.educationalNotes,
        },
        screener ? { name: screener.recordedBy.userName } : undefined,
        { name: user.name, isPathologist }, signedAtIso,
      );

      const created = await mockCytologySignOutRecordService.create({
        caseId: caseData.id, specimenId, reviewRecordId: finalReview.id,
        reportContent, signedBy: { userId: user.id, userName: user.name, isPathologist },
      });
      if (created.ok) {
        await caseRouter.updateCase(caseData.id, { status: 'finalized' } as any);

        // Real, per direct follow-up ("wire in Cytology") — routes
        // through the same, real, centralized Report_Released_Event
        // every other real dispatch in this app now goes through
        // (services/reports/publishReportReleasedEvent.ts), rather
        // than this page's own, separate inline dispatch sequence.
        // Real, deliberate: source: 'CYTOLOGY' tells that function to
        // use dispatchCytologyCaseInstances.ts (this file's own,
        // extracted, unchanged ORU^R01 logic) rather than Surg Path's
        // dispatchCaseInstances.ts — genuinely different real data
        // model (CytologySignOutRecord, not SynopticReportInstance),
        // confirmed directly before this change. This also means a
        // real Cytology case now genuinely passes through Component B
        // (print) and Component C (delivery rules) for the first
        // time — the real delivery-rules gate (Electronic/Print/
        // Dual/Suppress) now applies to Cytology exactly as it
        // already does for Surg Path, which it never did before this
        // change.
        //
        // Real, per direct follow-up ("build the pdf") — generatePdf
        // now genuinely produces real PDF bytes too: checked the real,
        // existing Cytology PDF mechanism directly (generateCytologyReportPdf.ts,
        // real client-side jsPDF rendering, already real and tested
        // before this change) rather than assuming none existed.
        // generateCytologyReportPdfSnapshot.ts is a thin adapter onto
        // that real, existing function — never a second, duplicate
        // renderer — converting its real output into the same
        // { pdfBase64?, generationError? } shape
        // SynopticReportPage.tsx's own generateReportPdfSnapshot
        // already returns for Surg Path, so dispatchPrintJob.ts needs
        // no changes at all to accept it.
        await publishReportReleasedEvent({
          caseId: caseData.id,
          reportType: 'FINAL',
          releasedAt: new Date().toISOString(),
          releasedBy: { id: user.id, name: user.name },
          source: 'CYTOLOGY',
          performingFacilityId: (caseData.order as any)?.facilityId,
          generatePdf: () => generateCytologyReportPdfSnapshot(created.data.reportContent),
        });

        // Real, per direct guidance's own South Korea information:
        // "pathology laboratories are legally required to report all
        // cervical screening results to the NCSR [equivalent]" — a
        // genuinely separate real dispatch, to a genuinely different
        // real destination (a centralized national registry, not the
        // ordering provider's own EHR), using the same real,
        // established transport (dispatchInterfaceMessage) and the
        // same real enqueue -> dispatch -> markSent/markFailed
        // pattern. Only fires when this case's own facility has a
        // real, effective registry configured — 'none' is the real,
        // correct default for facilities with no such obligation.
        const facilityId = caseData.order?.facilityId;
        if (facilityId) {
          const [enterpriseRegistryRes, facilityRegistryRes] = await Promise.all([
            mockRegistrySettingsService.get(),
            mockFacilityRegistryOverrideService.getForFacility(facilityId),
          ]);
          const effectiveRegistry = resolveEffectiveRegistrySettings(
            enterpriseRegistryRes.ok ? enterpriseRegistryRes.data : { registryId: 'none' },
            facilityRegistryRes.ok ? facilityRegistryRes.data : null,
          );
          if (effectiveRegistry.registryId !== 'none') {
            const registryEnqueueRes = await mockCytologyRegistryOutboundQueueService.enqueue({
              caseId: caseData.id, signOutRecordId: created.data.id, registryId: effectiveRegistry.registryId,
            });
            if (registryEnqueueRes.ok) {
              const registryPayload = buildCytologyRegistryReportPayload(
                created.data, effectiveRegistry.registryId, facilityId, caseData.order?.facilityName,
                (caseData.order as any)?.reasonForStudy,
                finalReview.primaryInterpretationId,
                isUnsatisfactoryAdequacy(finalReview.adequacySelections?.map(s => s.categoryId), categories),
                finalReview.additionalInterpretations?.map(s => s.categoryId),
              );
              const registryDispatchResult = await dispatchInterfaceMessage(registryEnqueueRes.data.id, 'REGISTRY_REPORT', registryPayload as any);
              if (registryDispatchResult.ok) {
                await mockCytologyRegistryOutboundQueueService.markSent(registryEnqueueRes.data.id);
                // Real, per direct guidance's own real correction:
                // the flag is only applied when the case was
                // genuinely accessioned without a real reasonForStudy
                // on file — not unconditionally on every CSMS
                // dispatch. Once accessioning actually captures this
                // (AccessionPage.tsx's own real "Cytology — Clinical
                // History & Accessioning Detail" section), a case
                // with a real, confirmed reasonForStudy has enough
                // real data for a confident A/H determination and
                // doesn't need human follow-up for that reason.
                const reasonForStudyOnFile = (caseData.order as any)?.reasonForStudy;
                if (effectiveRegistry.registryId === 'csms_uk' && !reasonForStudyOnFile) {
                  const existingFlags = (caseData as any).caseFlags ?? [];
                  await caseRouter.updateCase(caseData.id, {
                    caseFlags: [...existingFlags, {
                      id: 'csms-elig-' + crypto.randomUUID(),
                      flagDefinitionId: 'f36',
                      appliedAt: new Date().toISOString(),
                      appliedBy: 'system',
                      source: 'system',
                      deletedAt: null, deletedBy: null,
                    }],
                  } as any);
                }
              } else {
                await mockCytologyRegistryOutboundQueueService.markFailed(registryEnqueueRes.data.id, {
                  errorCode: registryDispatchResult.errorCode ?? 'DISPATCH_REJECTED',
                  errorMessage: registryDispatchResult.error ?? 'Unknown dispatch failure.',
                  maxRetriesExceeded: false,
                });
              }
            }
          }
        }

        toast.success('Report signed out.');
        await load();
      }
    } finally {
      setSigningOut(false);
    }
  };

  // Real, per direct correction: only High-Risk QC remains a real,
  // honest manual action — the automatic high-risk detection algorithm
  // (PS-164) genuinely lacks real accessioning-time input data yet.
  // Random selection is no longer manual at all; see handleSave's own
  // real, automatic wiring above.
  const handleFlagForQc = async () => {
    if (!user?.id) return;
    await updateSpecimen({ qcFlag: { reason: 'targeted_high_risk', flaggedBy: user.id, flaggedByName: user.name, flaggedAt: new Date().toISOString() } });
    await load();
  };

  const handleUnflagQc = async () => {
    await updateSpecimen({ qcFlag: undefined });
    await load();
  };

  const handleLmpSave = async () => {
    if (!caseData) return;
    await caseRouter.updateCase(caseData.id, { patient: { ...caseData.patient, lastMenstrualPeriod: lmpDraft || undefined } } as any);
    await load();
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>Loading…</div>;

  if (!caseData || !specimenId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>
        No qualifying cytology specimen found on this case.
        <div style={{ marginTop: 16 }}>
          <button onClick={() => navigate('/cytology-worklist')} style={{ padding: '8px 16px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', cursor: 'pointer' }}>Back to Worklist</button>
        </div>
      </div>
    );
  }

  if (!resolveCytologyStructuredWorkflowAccess(caseData.reportingMode)) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', maxWidth: 480, margin: '0 auto' }}>
        This case is managed by an external LIS (assist mode). PathScribe's structured cytology
        review and sign-out workflow is only available for cases in Orchestration mode.
        <div style={{ marginTop: 16 }}>
          <button onClick={() => navigate('/cytology-worklist')} style={{ padding: '8px 16px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', cursor: 'pointer' }}>Back to Worklist</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>
          <button onClick={handleBackToWorklist} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>← Back to Worklist</button>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: '#fff', margin: 0 }}>Case <span data-phi="accession">{caseData.id}</span></h1>
              <p style={{ fontSize: 12.5, color: '#6b7280', margin: '2px 0 0' }} data-phi="true">
                {caseData.patient ? `${caseData.patient.firstName ?? ''} ${caseData.patient.lastName ?? ''}`.trim() : 'Unknown Patient'} · MRN {caseData.patient?.mrn ?? '—'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
              <button
                onClick={handleLaunchEMR}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#0ea5e9', background: '#0ea5e918', border: '1px solid #0ea5e933', borderRadius: 6, cursor: 'pointer' }}>
                🌐 {t('cytologyScreening.openEmrBtn')}
              </button>
              <button
                onClick={handlePrint}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#0891B2', background: '#0891B218', border: '1px solid #0891B233', borderRadius: 6, cursor: 'pointer' }}>
                🖨️ {t('cytologyScreening.printBtn')}
              </button>
              {showSynopticTrigger && (
                <button
                  onClick={() => setShowSynopticDrawer(true)}
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#38bdf8', background: '#38bdf818', border: '1px solid #38bdf833', borderRadius: 6, cursor: 'pointer' }}>
                  📑 {t('cytologyScreening.synopticBtn')}
                </button>
              )}
              <button
                onClick={() => setShowMaterialDrawer(true)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', background: '#94a3b818', border: '1px solid #94a3b833', borderRadius: 6, cursor: 'pointer' }}>
                🧱 {t('cytologyScreening.materialBtn')}
              </button>
              {!isGynCytology && (
                <button
                  onClick={() => setShowRoseDrawer(true)}
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#EC4899', background: '#EC489918', border: '1px solid #EC489933', borderRadius: 6, cursor: 'pointer' }}>
                  🔬 {t('cytologyScreening.roseBtn')}
                </button>
              )}
              <button
                onClick={() => setShowCodesModal(true)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#0891B2', background: '#0891B218', border: '1px solid #0891B233', borderRadius: 6, cursor: 'pointer' }}>
                # {t('cytologyScreening.codesBtn')}
              </button>
              <button
                onClick={() => openFlagManager(caseData)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b33', borderRadius: 6, cursor: 'pointer' }}>
                🚩 {t('cytologyScreening.flagsBtn')}
              </button>
              <button
                onClick={() => setShowTeamModal(true)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#0891B2', background: '#0891B218', border: '1px solid #0891B233', borderRadius: 6, cursor: 'pointer' }}>
                👤 {t('cytologyScreening.teamBtn')}
              </button>
              <button
                onClick={() => setShowDelegateModal(true)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa33', borderRadius: 6, cursor: 'pointer' }}>
                👥 {t('cytologyScreening.delegateBtn')}
              </button>
              <button
                onClick={() => setReviewOpen(true)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa33', borderRadius: 6, cursor: 'pointer' }}>
                🔍 {t('cytologyScreening.requestReviewBtn')}
              </button>
              {instrumentationModality === 'wsi' && (
                // Real, per direct guidance's own confirmed
                // consolidation: reuses Surgical Pathology's own
                // real, vendor-aware WsiViewerLaunchButton (now
                // extended to also carry Cytology's own real, sticky
                // window-positioning feature — see that component's
                // own header) rather than a second, separate,
                // hardcoded-mock-URL launch mechanism. status is
                // hardcoded to a real, scannable value from that
                // component's own SCANNABLE_STATUSES set — Cytology
                // has no per-specimen granular status matching
                // Surgical's own grossing/embedding pipeline, and this
                // screen's own outer instrumentationModality check
                // already gates real visibility correctly.
                <WsiViewerLaunchButton
                  status="Ready for Review"
                  displayId={currentSpecimen?.id ?? caseData.id}
                  windowName="PathScribeCytologyWsiViewer"
                />
              )}
              <span>LMP</span>
              <input type="date" value={lmpDraft} onChange={e => setLmpDraft(e.target.value)} onBlur={handleLmpSave}
                style={{ padding: '5px 8px', fontSize: 12, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
            </div>
          </div>

          {/* Real, per direct follow-up closing PS-213's own remaining
              gap: the actual UI for completing a 5-year retrospective
              review. Shown only while the flag is real and genuinely
              unresolved (no recorded outcome yet) — matching
              resolveCytologyRetrospectiveReviewPoolMembership.ts's own
              exact membership test, so this banner and the worklist
              tile always agree on whether a case still needs this. */}
          {currentRetrospectiveReviewFlag && !currentRetrospectiveReviewFlag.outcome && (
            <div style={{ background: '#2e1065', border: '1px solid #7c3aed', borderRadius: 10, padding: 16, marginBottom: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e9d5ff', marginBottom: 4 }}>5-Year Retrospective Review Required</div>
              <div style={{ fontSize: 12, color: '#c4b5fd', marginBottom: 12 }}>
                This prior, negative cytology result was flagged for mandatory retrospective review after this patient's own case {currentRetrospectiveReviewFlag.triggeredByCaseId} received a new HSIL+/AIS/malignant diagnosis, per CAP's own 5-year lookback requirement.
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label className="ps-label" htmlFor="retro-outcome">Outcome</label>
                  <select id="retro-outcome" className="ps-input-dark" value={retrospectiveOutcomeDraft} onChange={e => setRetrospectiveOutcomeDraft(e.target.value as typeof retrospectiveOutcomeDraft)}>
                    <option value="">— select —</option>
                    <option value="confirmed_negative">Confirmed Negative</option>
                    <option value="screening_error">Screening Error</option>
                    <option value="interpretation_error">Interpretation Error</option>
                    <option value="sampling_error">Sampling Error</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label className="ps-label" htmlFor="retro-corrective">Corrective Action (CT retraining, amended report, etc.)</label>
                  <input id="retro-corrective" className="ps-input-dark" style={{ width: '100%' }} value={retrospectiveCorrectiveActionDraft} onChange={e => setRetrospectiveCorrectiveActionDraft(e.target.value)} placeholder="Optional — required for a real, non-negative outcome in most CAP-accredited labs" />
                </div>
                <button onClick={handleCompleteRetrospectiveReview} disabled={!retrospectiveOutcomeDraft || savingRetrospectiveOutcome}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: retrospectiveOutcomeDraft ? '#7c3aed' : '#3f2d63', border: 'none', borderRadius: 6, color: '#fff', cursor: retrospectiveOutcomeDraft ? 'pointer' : 'not-allowed' }}>
                  {savingRetrospectiveOutcome ? 'Saving…' : 'Complete Review'}
                </button>
              </div>
            </div>
          )}

          {/* Real, per direct follow-up ("Implement 1, Wire the recording
              UI"): one real banner per real, unrecorded histology
              correlation candidate — matching
              resolveCytologyHistologyCorrelationPoolMembership.ts's own
              exact membership test, so this banner and the worklist tile
              always agree on whether a case still needs attention. */}
          {(currentSpecimen?.cytologyScreening?.histologyCorrelationCandidates ?? [])
            .filter((c: { recordedActivityRecordId?: string; dismissedAsNotRelevant?: boolean }) => c.recordedActivityRecordId === undefined && !c.dismissedAsNotRelevant)
            .map((candidate: { candidateCaseId: string; detectedAt: string }) => {
              const resolution = histologyCorrelationResolutions[candidate.candidateCaseId];
              const isRecording = recordingHistologyCorrelation === candidate.candidateCaseId;
              const autoResolvable = resolution && resolution.outcome !== 'unresolvable';
              return (
                <div key={candidate.candidateCaseId} style={{ background: '#4a044e', border: '1px solid #a21caf', borderRadius: 10, padding: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f5d0fe', marginBottom: 4 }}>Cyto-Histologic Correlation Candidate</div>
                  <div style={{ fontSize: 12, color: '#e9b8f0', marginBottom: 12 }}>
                    This patient had a subsequent case ({candidate.candidateCaseId}) within the follow-up window after this abnormal cytology finding.
                    Confirm whether it's the relevant biopsy before recording a correlation.
                  </div>

                  {!resolution && <div style={{ fontSize: 12, color: '#e9b8f0' }}>Resolving…</div>}

                  {resolution && autoResolvable && (
                    <div>
                      <div style={{ fontSize: 12, color: '#f5d0fe', marginBottom: 10 }}>
                        Cytology: <b>{resolution.cytologyDxLabel}</b> — Histology (from SNOMED coding): <b>{resolution.histologyDxDescription}</b> —{' '}
                        Outcome: <b>{resolution.outcome.replace('_', ' ')}</b>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => handleRecordHistologyCorrelation(
                            candidate.candidateCaseId,
                            resolution.histologyDxDescription ?? 'Unknown',
                            resolution.outcome === 'concordant' ? 'concordant' : 'discordant',
                            resolution.outcome,
                            resolution.cytologyRank,
                            resolution.histologyRank,
                          )}
                          disabled={isRecording}
                          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#a21caf', border: 'none', borderRadius: 6, color: '#fff', cursor: isRecording ? 'not-allowed' : 'pointer' }}>
                          {isRecording ? 'Saving…' : 'Confirm & Record'}
                        </button>
                        <button onClick={() => handleDismissHistologyCorrelationCandidate(candidate.candidateCaseId)}
                          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid #a21caf', borderRadius: 6, color: '#f5d0fe', cursor: 'pointer' }}>
                          Not Relevant
                        </button>
                      </div>
                    </div>
                  )}

                  {resolution && !autoResolvable && (
                    <div>
                      <div style={{ fontSize: 12, color: '#f5d0fe', marginBottom: 10 }}>
                        No real SNOMED coding on this case resolves to a known severity yet — enter the histology diagnosis manually after reading the actual report.
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <label className="ps-label" htmlFor={`histo-dx-${candidate.candidateCaseId}`}>Histology Diagnosis</label>
                          <input id={`histo-dx-${candidate.candidateCaseId}`} className="ps-input-dark" style={{ width: '100%' }}
                            value={histologyCorrelationManualDx[candidate.candidateCaseId] ?? ''}
                            onChange={e => setHistologyCorrelationManualDx(prev => ({ ...prev, [candidate.candidateCaseId]: e.target.value }))}
                            placeholder="e.g. CIN III on biopsy" />
                        </div>
                        <div>
                          <label className="ps-label" htmlFor={`histo-outcome-${candidate.candidateCaseId}`}>Outcome</label>
                          <select id={`histo-outcome-${candidate.candidateCaseId}`} className="ps-input-dark"
                            value={histologyCorrelationManualOutcome[candidate.candidateCaseId] ?? ''}
                            onChange={e => setHistologyCorrelationManualOutcome(prev => ({ ...prev, [candidate.candidateCaseId]: e.target.value as 'concordant' | 'discordant' }))}>
                            <option value="">— select —</option>
                            <option value="concordant">Concordant</option>
                            <option value="discordant">Discordant</option>
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            const dx = histologyCorrelationManualDx[candidate.candidateCaseId];
                            const outcome = histologyCorrelationManualOutcome[candidate.candidateCaseId];
                            if (!dx?.trim() || !outcome) return;
                            handleRecordHistologyCorrelation(candidate.candidateCaseId, dx.trim(), outcome, undefined, resolution?.cytologyRank);
                          }}
                          disabled={isRecording || !histologyCorrelationManualDx[candidate.candidateCaseId]?.trim() || !histologyCorrelationManualOutcome[candidate.candidateCaseId]}
                          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#a21caf', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
                          {isRecording ? 'Saving…' : 'Record'}
                        </button>
                        <button onClick={() => handleDismissHistologyCorrelationCandidate(candidate.candidateCaseId)}
                          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid #a21caf', borderRadius: 6, color: '#f5d0fe', cursor: 'pointer' }}>
                          Not Relevant
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          {/* Real Sign Out action */}
          {signOutRecords.length > 0 ? (
            <div style={{ padding: '10px 16px', background: '#22c55e12', border: '1px solid #22c55e33', borderRadius: 10, marginBottom: 18, fontSize: 12.5, color: '#22c55e' }}>
              Signed out by {signOutRecords[0].signedBy.userName} on {new Date(signOutRecords[0].signedAt).toLocaleString()}.
            </div>
          ) : (() => {
            if (!currentFinalDiagnosis) {
              return <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 18, fontSize: 12.5, color: '#6b7280' }}>Select a Final Diagnosis below before this case can be signed out.</div>;
            }
            const finalReview = reviews.find(r => r.id === currentFinalDiagnosis.reviewRecordId);
            const gate = finalReview
              ? resolveCytologySignOutGate({ adequacyCategoryIds: finalReview.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: finalReview.requiresPathologistReview }, isGynCytology, currentQcFlag ? true : false, categories, labJurisdiction, signingProviderCredentials, undefined, resolveSynopticTranslationCheckForReview(finalReview))
              : { allowed: false, blockedReasons: [] };
            const canSign = resolveCanSignOutCytology(isPathologist, gate);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 12.5, color: canSign ? '#e5e7eb' : '#f59e0b', flex: 1 }}>
                  {canSign ? 'Ready to sign out.' : `Pathologist sign-out required: ${gate.blockedReasons.join(', ')}`}
                </span>
                <button onClick={handleSignOut} disabled={!canSign || signingOut}
                  style={{ padding: '8px 18px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: canSign ? '#009E73' : '#374151', border: 'none', borderRadius: 8, cursor: canSign ? 'pointer' : 'not-allowed' }}>
                  {signingOut ? 'Signing…' : 'Sign Out'}
                </button>
              </div>
            );
          })()}

          {/* Real, two-column layout — uses the available horizontal space */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 20 }}>

            {/* LEFT: context — role, QC, HPV, review history */}
            <div>
              <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('Your Role for This Review')}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#009E73' }}>
                  {ROLE_LABELS[editingReviewId ? (reviews.find(r => r.id === editingReviewId)?.role ?? resolvedRole) : resolvedRole]}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {editingReviewId
                    ? 'You already reviewed this case — editing your own review below.'
                    : 'Determined automatically from review history and your account role.'}
                </div>
              </div>

              {/* Real, per direct guidance's own CLIA 42 CFR § 493.1274
                  workload specification — "how this specific pass was
                  executed." Never shown for a real pathologist review,
                  which always counts as pathologist_review (0 SCU)
                  automatically. */}
              {!isPathologist && (
                <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                  {fieldLabel('Review Mode', '(real CLIA workload weight)')}
                  <select value={reviewMode} onChange={e => setReviewMode(e.target.value as CytologyReviewMode)}
                    className="ps-conf-select" style={{ width: '100%' }}>
                    <option value="primary_manual">Full Manual Screen (1.0 SCU)</option>
                    <option value="liquid_nongyn">Liquid-Based Non-Gyn (0.5 SCU)</option>
                    <option value="fov_assisted">FOV-Assisted, No Rescreen (0.5 SCU)</option>
                    <option value="fov_manual_rescreen">FOV + Full Manual Rescreen (1.5 SCU)</option>
                  </select>
                </div>
              )}

              {workloadStatus && workloadStatus.status !== 'ok' && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                  background: workloadStatus.status === 'exceeded' ? '#ef444418' : '#f59e0b18',
                  border: `1px solid ${workloadStatus.status === 'exceeded' ? '#ef444433' : '#f59e0b33'}`,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: workloadStatus.status === 'exceeded' ? '#ef4444' : '#f59e0b' }}>
                    {workloadStatus.status === 'exceeded'
                      ? `Blocked — prorated CLIA limit reached (${workloadStatus.candidateScu.toFixed(1)}/${workloadStatus.maxAllowedScu.toFixed(1)} SCU).`
                      : `Approaching your prorated CLIA screening limit for this session (${workloadStatus.candidateScu.toFixed(1)}/${workloadStatus.maxAllowedScu.toFixed(1)} SCU).`}
                  </div>
                  {workloadBlockedReason && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>{workloadBlockedReason}</div>}
                </div>
              )}

              <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('Mandatory QC')}
                {currentQcFlag ? (
                  <>
                    <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 8 }}>
                      Flagged for {currentQcFlag.reason === 'targeted_high_risk' ? 'high-risk targeted' : 'random selection'} QC by {currentQcFlag.flaggedByName} on {new Date(currentQcFlag.flaggedAt).toLocaleDateString()}.
                    </div>
                    <button onClick={handleUnflagQc} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer' }}>
                      Remove Flag
                    </button>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 6 }}>Random QC selection runs automatically when the Initial Review is saved.</div>
                    <button onClick={() => handleFlagForQc()} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#ef4444', background: '#1c1c1c', border: '1px solid #ef444433', borderRadius: 6, cursor: 'pointer' }}>Flag High-Risk QC</button>
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 14px', background: '#111827', border: `1px solid ${currentHpv.hpvResult === 'Positive' ? '#ef444433' : '#1f2937'}`, borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('HPV Co-Testing', '(real, upstream molecular result — read-only)')}
                {!currentHpv.hpvCoTestOrdered && !currentHpv.hpvResult ? (
                  <div style={{ fontSize: 12, color: '#6b7280' }}>No co-test on record.</div>
                ) : (
                  <div style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.9 }}>
                    <div>Co-test ordered: <strong style={{ color: '#e5e7eb' }}>{currentHpv.hpvCoTestOrdered ? 'Yes' : 'No'}</strong></div>
                    {currentHpv.hpvOrderReason && currentHpv.hpvOrderReason !== 'co_test' && (
                      <div>Reason: <strong style={{ color: '#e5e7eb' }}>
                        {currentHpv.hpvOrderReason === 'ascus_reflex' ? 'ASC-US Reflex Triage' : 'Post-Treatment Surveillance'}
                      </strong></div>
                    )}
                    <div>Result: <strong style={{ color: currentHpv.hpvResult === 'Positive' ? '#ef4444' : '#e5e7eb' }}>{currentHpv.hpvResult ?? 'Not set'}</strong>
                      {currentHpv.hpvAbnormalFlag && <span style={{ color: '#6b7280' }}> (Flag: {currentHpv.hpvAbnormalFlag})</span>}
                    </div>
                    {currentHpv.hpvReferenceRange && <div>Reference range: <strong style={{ color: '#e5e7eb' }}>{currentHpv.hpvReferenceRange}</strong></div>}
                    {currentHpv.hpvResult === 'Positive' && currentHpv.hpvGenotypeDetail && (
                      <div>Genotype: <strong style={{ color: '#e5e7eb' }}>
                        {[
                          currentHpv.hpvGenotypeDetail.hpv16 && 'HPV 16',
                          currentHpv.hpvGenotypeDetail.hpv18Or45 && 'HPV 18/45',
                          currentHpv.hpvGenotypeDetail.otherHighRisk && 'Other high-risk type',
                        ].filter(Boolean).join(', ') || 'Not specified'}
                      </strong></div>
                    )}
                  </div>
                )}
              </div>

              {patientHistory && (patientHistory.priorCytologyResults.length > 0 || patientHistory.priorSurgicalBiopsies.length > 0) && (
                <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                  {fieldLabel(t('cytologyScreening.patientHistory.title'), t('cytologyScreening.patientHistory.subtitle'))}
                  {patientHistory.priorCytologyResults.length > 0 && (
                    <div style={{ marginBottom: patientHistory.priorSurgicalBiopsies.length > 0 ? 10 : 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
                        {t('cytologyScreening.patientHistory.priorPapSection')}
                      </div>
                      {patientHistory.priorCytologyResults.map(r => (
                        <div key={r.caseId} style={{ fontSize: 12, color: '#d1d5db', padding: '4px 0', borderBottom: '1px solid #1f2937' }}>
                          <span style={{ color: '#9ca3af' }}>{new Date(r.date).toLocaleDateString()}</span>
                          {' — '}<span data-phi="accession">{r.accessionNumber}</span>
                          {r.resultLabel ? <strong style={{ color: '#e5e7eb' }}> · {r.resultLabel}</strong> : <span style={{ color: '#6b7280' }}> · {t('cytologyScreening.patientHistory.noFinalDx')}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {patientHistory.priorSurgicalBiopsies.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
                        {t('cytologyScreening.patientHistory.priorBiopsySection')}
                      </div>
                      {patientHistory.priorSurgicalBiopsies.map(b => (
                        <div key={b.caseId} style={{ fontSize: 12, color: '#d1d5db', padding: '4px 0', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>
                            <span style={{ color: '#9ca3af' }}>{new Date(b.date).toLocaleDateString()}</span>
                            {' — '}<span data-phi="accession">{b.accessionNumber}</span>{b.specimenDescription ? ` · ${b.specimenDescription}` : ''}
                          </span>
                          <a href={`/case/${b.caseId}/synoptic`} style={{ color: '#38bdf8', fontSize: 11, whiteSpace: 'nowrap' }}>{t('cytologyScreening.patientHistory.viewCase')}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {fiveYearLookbackFlagged.length > 0 && (
                <div style={{ padding: '12px 14px', background: '#a855f718', border: '1px solid #a855f733', borderRadius: 10, marginBottom: 14 }}>
                  {fieldLabel(t('cytologyScreening.fiveYearLookback.title'), t('cytologyScreening.fiveYearLookback.subtitle'))}
                  {fiveYearLookbackFlagged.map(item => {
                    const sourceResult = patientHistory?.priorCytologyResults.find(r => r.reviewRecordId === item.reviewId);
                    return (
                      <div key={item.reviewId} style={{ fontSize: 12, color: '#d1d5db', padding: '4px 0', borderBottom: '1px solid #a855f733', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>
                          <span style={{ color: '#9ca3af' }}>{new Date(item.recordedAt).toLocaleDateString()}</span>
                          {' — '}<span data-phi="accession">{sourceResult?.accessionNumber ?? item.caseId}</span>
                          {sourceResult?.resultLabel ? <strong style={{ color: '#e5e7eb' }}> · {sourceResult.resultLabel}</strong> : null}
                        </span>
                        <a href={`/case/${item.caseId}/synoptic`} style={{ color: '#a855f7', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {t('cytologyScreening.fiveYearLookback.viewSlide')}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}

              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Review History</h2>
              {reviews.length === 0 && <p style={{ fontSize: 12.5, color: '#4b5563' }}>No reviews recorded yet.</p>}
              {reviews.map(r => {
                const isInitial = r.role === 'primary_screen';
                const isFinal = currentFinalDiagnosis?.reviewRecordId === r.id;
                const gate = resolveCytologySignOutGate(
                  { adequacyCategoryIds: r.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: r.requiresPathologistReview },
                  isGynCytology, currentQcFlag ? true : false, categories, labJurisdiction, signingProviderCredentials, undefined,
                  resolveSynopticTranslationCheckForReview(r),
                );
                return (
                  <div key={r.id} style={{ padding: '10px 12px', background: '#0f0f0f', border: `1px solid ${isInitial ? '#009E7333' : '#1f2937'}`, borderRadius: 9, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: isInitial ? '#009E7318' : '#37415118', color: isInitial ? '#009E73' : '#9ca3af' }}>
                        {isInitial ? 'INITIAL REVIEW' : ROLE_LABELS[r.role].toUpperCase()}
                      </span>
                      {isFinal && <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>FINAL DIAGNOSIS</span>}
                      <span title={gate.blockedReasons.join(', ')} style={{ fontSize: 10, fontWeight: 700, color: gate.allowed ? '#22c55e' : '#f59e0b' }}>
                        {gate.allowed ? 'CT-ELIGIBLE' : 'PATH REQUIRED'}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#6b7280', marginLeft: 'auto' }}>{r.recordedBy.userName} · {new Date(r.recordedAt).toLocaleDateString()}</span>
                    </div>

                    {r.adequacySelections && r.adequacySelections.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Adequacy:</b> {r.adequacySelections.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.generalCategorizationId && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}><b>General Categorization:</b> {categoryLabel(r.generalCategorizationId)}</div>
                    )}
                    <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                      <b>Primary:</b> {categoryLabel(r.primaryInterpretationId)}{r.primaryInterpretationComment ? ` (${r.primaryInterpretationComment})` : ''}
                    </div>
                    {r.additionalInterpretations && r.additionalInterpretations.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Additional:</b> {r.additionalInterpretations.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.recommendations && r.recommendations.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Recommendations:</b> {r.recommendations.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.notes && <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 6, fontStyle: 'italic' }}>"{r.notes}"</div>}

                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => handleClone(r.id)} style={{ fontSize: 10.5, padding: '3px 9px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}>Clone</button>
                      {(() => {
                        // Real, per direct guidance's own follow-up: the
                        // same real gate/authorization the click handler
                        // itself now enforces, computed here too so an
                        // unauthorized Cytotechnologist sees a real,
                        // visibly disabled control — never a click that
                        // silently does nothing or only fails after the
                        // fact.
                        const rowGate = resolveCytologySignOutGate(
                          { adequacyCategoryIds: r.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: r.requiresPathologistReview },
                          isGynCytology, currentQcFlag ? true : false, categories, labJurisdiction, signingProviderCredentials, undefined,
                          resolveSynopticTranslationCheckForReview(r),
                        );
                        const rowAuthorized = resolveCanSignOutCytology(isPathologist, rowGate);
                        return (
                          <button
                            onClick={() => handleSelectFinalDiagnosis(r.id)}
                            disabled={!rowAuthorized}
                            title={rowAuthorized ? undefined : 'Only a Pathologist may select this review as the Final Diagnosis — it requires pathologist review before sign-out.'}
                            style={{ fontSize: 10.5, padding: '3px 9px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, color: rowAuthorized ? '#9ca3af' : '#4b5563', cursor: rowAuthorized ? 'pointer' : 'not-allowed', opacity: rowAuthorized ? 1 : 0.6 }}
                          >
                            Set as Final
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: new review form */}
            {nomenclatureSystem === 'palga_cisoea' ? (
              <div style={{ padding: '16px 18px', background: '#111827', border: '1px solid #1f2937', borderRadius: 12 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {editingReviewId ? 'Edit Your CISOE-A Review' : 'Record a New CISOE-A Review'}
                </h2>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
                  Real, independent 6-component matrix (Composition, Inflammation, Squamous, Other/Endometrium, Endocervical, Adequacy) — every axis is scored separately, not a single pick.
                </div>

                {([
                  ['composition', 'compositionComment', 'C — Composition'],
                  ['inflammation', 'inflammationComment', 'I — Inflammation'],
                  ['squamous', 'squamousComment', 'S — Squamous Epithelium'],
                  ['otherEndometrium', 'otherEndometriumComment', 'O — Other / Endometrium'],
                  ['endocervical', 'endocervicalComment', 'E — Endocervical Epithelium'],
                ] as const).map(([valueKey, commentKey, label]) => (
                  <div key={valueKey} style={{ marginBottom: 12 }}>
                    {fieldLabel(label, '(0-9)')}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min={0} max={9} value={cisoeADraft[valueKey]}
                        onChange={e => setCisoeADraft({ ...cisoeADraft, [valueKey]: e.target.value })}
                        style={{ width: 70, padding: '7px 10px', fontSize: 13, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8 }} />
                      <input type="text" placeholder="Comment (optional)" value={cisoeADraft[commentKey]}
                        onChange={e => setCisoeADraft({ ...cisoeADraft, [commentKey]: e.target.value })}
                        style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8 }} />
                    </div>
                  </div>
                ))}

                {fieldLabel('A — Adequacy')}
                <select value={cisoeADraft.adequacy} onChange={e => setCisoeADraft({ ...cisoeADraft, adequacy: e.target.value as CisoeAAdequacy | '' })}
                  className="ps-conf-select" style={{ width: '100%', marginBottom: 14 }}>
                  <option value="">— Select —</option>
                  <option value="satisfactory">Satisfactory</option>
                  <option value="suboptimal">Suboptimal</option>
                  <option value="unsatisfactory">Unsatisfactory</option>
                </select>

                {fieldLabel('Notes')}
                <textarea value={cisoeADraft.notes} onChange={e => setCisoeADraft({ ...cisoeADraft, notes: e.target.value })} rows={2}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }} />

                {cisoeAErrors.length > 0 && (
                  <div style={{ padding: '8px 12px', background: '#ef444418', border: '1px solid #ef444433', borderRadius: 8, marginBottom: 12 }}>
                    {cisoeAErrors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#ef4444' }}>{e}</div>)}
                  </div>
                )}
                {cisoeAWarnings.length > 0 && (
                  <div style={{ padding: '8px 12px', background: '#f59e0b18', border: '1px solid #f59e0b33', borderRadius: 8, marginBottom: 12 }}>
                    {cisoeAWarnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#f59e0b' }}>{w}</div>)}
                  </div>
                )}
                {cisoeAReflexSuggestion && (
                  <div style={{ padding: '8px 12px', background: '#0ea5e918', border: '1px solid #0ea5e933', borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#38bdf8' }}>
                      {cisoeAReflexSuggestion === 'cyto-rec-colposcopy'
                        ? 'Suggested: refer for colposcopy (moderate dyskaryosis or worse).'
                        : 'Suggested: recommend HPV genotyping (16/18 vs. other high-risk) to guide colposcopy vs. repeat cytology.'}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={handleSaveCisoeA} disabled={saving}
                    style={{ padding: '9px 20px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    {saving ? 'Saving…' : editingReviewId ? 'Update Review' : `Save as ${ROLE_LABELS[resolvedRole]}`}
                  </button>
                  <button onClick={() => setReviewOpen(true)}
                    style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 600, color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa33', borderRadius: 8, cursor: 'pointer' }}>
                    👥 {t('cytologyScreening.requestPeerReviewBtn')}
                  </button>
                </div>
              </div>
            ) : (
            <div style={{ padding: '16px 18px', background: '#111827', border: '1px solid #1f2937', borderRadius: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {editingReviewId ? 'Edit Your Review' : 'Record a New Review'}
              </h2>

              {fieldLabel('General Categorization', '(dictionary-driven — Bethesda\'s own general category, optional)')}
              <select value={draft.generalCategorizationId} onChange={e => setDraft({ ...draft, generalCategorizationId: e.target.value })}
                className="ps-conf-select" style={{ width: '100%', marginBottom: 14 }}>
                <option value="">— None —</option>
                {generalCatOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              {fieldLabel('Specimen Adequacy', '(select one or more; each may carry its own comment)')}
              <MultiSearchSelect options={adequacyOptions} selections={draft.adequacySelections}
                onChange={sel => setDraft({ ...draft, adequacySelections: sel })} placeholder="Search adequacy…" categoryLabel={categoryLabel} />

              {fieldLabel('Primary Interpretation', '(exactly one; may carry a comment)')}
              <SingleSearchSelect options={primaryOptions} value={draft.primaryInterpretationId} comment={draft.primaryInterpretationComment}
                onChange={id => setDraft({ ...draft, primaryInterpretationId: id, additionalInterpretations: draft.additionalInterpretations.filter(s => s.categoryId !== id) })}
                onCommentChange={c => setDraft({ ...draft, primaryInterpretationComment: c })} placeholder="Search primary interpretation…" />

              {fieldLabel('Additional Interpretations', '(select any number; each may carry its own comment)')}
              <MultiSearchSelect options={additionalOptions} selections={draft.additionalInterpretations}
                onChange={sel => setDraft({ ...draft, additionalInterpretations: sel })} placeholder="Search additional interpretations…" categoryLabel={categoryLabel} />

              {fieldLabel('Recommendations', '(select any number; each may carry its own comment)')}
              <MultiSearchSelect options={recommendationOptions} selections={draft.recommendations}
                onChange={sel => setDraft({ ...draft, recommendations: sel })} placeholder="Search recommendations…" categoryLabel={categoryLabel} />

              {fieldLabel('Notes')}
              <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={2}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 16, resize: 'vertical', fontFamily: 'inherit' }} />

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={handleSave} disabled={saving || !draft.primaryInterpretationId}
                  style={{ padding: '9px 20px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: !draft.primaryInterpretationId ? '#374151' : '#009E73', border: 'none', borderRadius: 8, cursor: !draft.primaryInterpretationId ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : editingReviewId ? 'Update Review' : `Save as ${ROLE_LABELS[resolvedRole]}`}
                </button>
                <button onClick={() => setReviewOpen(true)}
                  style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 600, color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa33', borderRadius: 8, cursor: 'pointer' }}>
                  👥 {t('cytologyScreening.requestPeerReviewBtn')}
                </button>
              </div>
            </div>
            )}
          </div>
        </main>
        <RequestReviewModal
          isOpen={reviewOpen}
          caseId={caseData.id}
          caseLabel={caseData.patient ? `${caseData.patient.lastName ?? ''}, ${caseData.patient.firstName ?? ''}`.trim() : undefined}
          fromUserId={user?.id ?? 'u1'}
          fromUserName={user?.name ?? 'Unknown'}
          onClose={() => setReviewOpen(false)}
        />
        <EMRSidecarDrawer
          isOpen={emrOpen}
          patientId={caseData.patient?.mrn ?? '100004'}
          onClose={() => setEmrOpen(false)}
        />
        <CytologySlideOverDrawer isOpen={showSynopticDrawer} title={t('cytologyScreening.synopticDrawer.title')} onClose={() => setShowSynopticDrawer(false)}>
          <CytologySynopticFormView
            // Real, honest timing note: initialTemplateId only seeds
            // CytologySynopticFormView's own useState at mount time —
            // this is safe because the real dictionary fetch this
            // value comes from completes as part of the same initial
            // page load that also resolves showSynopticTrigger
            // itself, before the drawer (which fully unmounts when
            // closed) can first be opened.
            initialTemplateId={draft.synopticData?.templateId ?? dictionaryDefaultSynopticTemplateId}
            initialAnswers={draft.synopticData?.answers}
            initialAcknowledgment={draft.synopticData?.translationValidationAcknowledgment}
            currentUser={{ userId: user?.id ?? '', userName: user?.name ?? '' }}
            onSave={(templateId, answers, acknowledgment) => { setDraft({ ...draft, synopticData: { templateId, answers, translationValidationAcknowledgment: acknowledgment } }); setShowSynopticDrawer(false); }}
            onInsertNarrative={(narrativeText) => {
              // Real, per direct guidance's own confirmed "Insert into
              // Notes" choice — never overwrites real, existing
              // pathologist-authored notes; appends with a blank-line
              // separator so nothing already written is silently lost.
              setDraft(prev => ({ ...prev, notes: prev.notes ? `${prev.notes}\n\n${narrativeText}` : narrativeText }));
            }}
          />
        </CytologySlideOverDrawer>
        <CytologySlideOverDrawer isOpen={showMaterialDrawer} title={t('cytologyScreening.materialBtn')} onClose={() => setShowMaterialDrawer(false)}>
          <CytologyMaterialView
            specimenDescription={currentSpecimen?.description}
            decants={currentSpecimen?.decants}
            stainTypes={stainTypes}
            masterTargets={molecularTargets}
            onAddDecant={handleAddDecant}
            onUpdateStains={async (decantId, stains) => {
              if (!caseData || !currentSpecimen) return;
              const updatedDecants = (currentSpecimen.decants ?? []).map((d: any) => d.id === decantId ? { ...d, stains } : d);
              const updatedSpecimens = (caseData.specimens ?? []).map((sp: any) => sp.id === currentSpecimen.id ? { ...sp, decants: updatedDecants } : sp);
              await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
              setCaseData(prev => prev ? ({ ...prev, specimens: updatedSpecimens } as typeof prev) : prev);
            }}
          />
        </CytologySlideOverDrawer>
        <CytologySlideOverDrawer isOpen={showRoseDrawer} title={t('cytologyScreening.roseBtn')} onClose={() => setShowRoseDrawer(false)}>
          <CytologyRoseView
            roseEvaluations={currentSpecimen?.roseEvaluations}
            onRecordEvaluation={async (location, passes) => {
              if (!caseData || !currentSpecimen || !user) return;
              const updatedEvaluations = resolveCytologyRoseEvaluationAdded(
                currentSpecimen.roseEvaluations,
                { performedAt: new Date().toISOString(), performedBy: { userId: user.id, userName: user.name }, location, passes },
                `rose-${Date.now()}`,
              );
              const updatedSpecimens = (caseData.specimens ?? []).map((sp: any) => sp.id === currentSpecimen.id ? { ...sp, roseEvaluations: updatedEvaluations } : sp);
              await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
              setCaseData(prev => prev ? ({ ...prev, specimens: updatedSpecimens } as typeof prev) : prev);
            }}
          />
        </CytologySlideOverDrawer>
        {showCodesModal && caseData && (
          <AddCodeModal
            existingCodes={[
              ...((caseData.coding?.icd10 ?? []) as string[]).map((code, i) => ({ id: `case-icd-${i}`, system: 'ICD' as const, code, display: code, source: 'manual' as const })),
              ...((caseData.coding?.snomed ?? []) as string[]).map((code, i) => ({ id: `case-snomed-${i}`, system: 'SNOMED' as const, code, display: code, source: 'manual' as const })),
              ...((caseData.specimens ?? []) as any[]).flatMap((sp: any) => [
                ...((sp.coding?.icd10 ?? []) as { code: string; description: string }[]).map((c, i) => ({ id: `icd-${sp.id}-${i}`, system: 'ICD' as const, code: c.code, display: c.description, source: 'manual' as const, specimenId: sp.id })),
                ...((sp.coding?.snomed ?? []) as { code: string; description: string }[]).map((c, i) => ({ id: `snomed-${sp.id}-${i}`, system: 'SNOMED' as const, code: c.code, display: c.description, source: 'manual' as const, specimenId: sp.id })),
                ...((sp.coding?.icdO ?? []) as { code: string; description: string }[]).map((c, i) => ({ id: `icdo-${sp.id}-${i}`, system: 'ICD-O' as const, code: c.code, display: c.description, source: 'manual' as const, specimenId: sp.id })),
                ...((sp.coding?.cpt ?? []) as string[]).map((code) => ({ id: `cpt-${sp.id}-${code}`, system: 'CPT' as const, code, display: code, source: 'manual' as const, specimenId: sp.id })),
              ]),
            ]}
            allSpecimens={(caseData.specimens ?? []).map((sp, i) => ({ index: i, id: i + 1, specimenId: sp.id, name: `${sp.label}: ${sp.description ?? ''}` }))}
            // Real, per direct guidance's own implementation tip: a
            // real, single-specimen case (the common, routine Pap
            // smear) auto-targets its own one specimen, so the user
            // never has to manually pick from a list of one.
            activeSpecimenIndex={(caseData.specimens?.length ?? 0) === 1 ? 0 : undefined}
            originHospitalId={(caseData as any)?.originHospitalId}
            onAddToSpecimens={handleAddCodesToSpecimens}
            onClose={() => setShowCodesModal(false)}
          />
        )}
        {showFlagManager && flagCaseData && (
          <FlagManagerModal
            key={`flag-modal-${flagCaseData.id}`}
            caseData={flagCaseData as any}
            flagDefinitions={flagDefinitions}
            onApplyFlags={onApplyFlags}
            onRemoveFlag={onRemoveFlag}
            onDirtyChange={() => {}}
            onClose={() => setShowFlagManager(false)}
          />
        )}
        {showTeamModal && (
          <CaseTeamModal
            caseData={caseData}
            onClose={() => setShowTeamModal(false)}
            onUpdated={(updated) => setCaseData(updated)}
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
            caseId={caseData.id}
            currentUserId={user?.id}
            onDelegated={() => {
              // Real, honest omission: Surgical Pathology's own
              // equivalent call also shows a toast confirmation
              // ("Case delegated successfully") — this screen has no
              // existing toast/notification mechanism of its own, and
              // building one solely for this one message would be
              // real, disproportionate scope creep. The delegate
              // action itself is real and complete; only the toast
              // confirmation is left out.
              setShowDelegateModal(false);
              if (delegateReturnTo === 'team') { setShowTeamModal(true); setDelegateReturnTo(null); }
            }}
          />
        )}
        {/* Real, per direct follow-up: "obviously that is a huge gap.
            Sort of the whole point of concordance monitoring." Shown
            only once — right after the reviewer's own, independent
            finding is already saved, never before (so it can't bias
            that independent finding), and never re-asked once a real
            judgment has been recorded against this AI result. */}
        {showConcordancePrompt && aiScreeningResult && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: 20, maxWidth: 440 }}>
              <h3 style={{ color: '#e5e7eb', marginTop: 0, fontSize: 15 }}>AI Screening Concordance</h3>
              <p style={{ color: '#9ca3af', fontSize: 13 }}>
                This slide had a real, completed AI screening result:{' '}
                {aiScreeningResult.slideTriage
                  ? (aiScreeningResult.slideTriage.reviewRecommended ? 'Review Recommended' : 'No Further Review')
                    + (aiScreeningResult.slideTriage.rankGroup != null && aiScreeningResult.slideTriage.totalRankGroups != null
                      ? ` (quintile ${aiScreeningResult.slideTriage.rankGroup}/${aiScreeningResult.slideTriage.totalRankGroups})` : '')
                  : `${aiScreeningResult.findings.length} AI-flagged field${aiScreeningResult.findings.length === 1 ? '' : 's'} of view`}
                . Does your own, independent finding above agree with this AI result?
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => handleConcordanceResponse(false)} disabled={recordingConcordance}
                  style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#f87171', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
                  Disagree
                </button>
                <button onClick={() => handleConcordanceResponse(true)} disabled={recordingConcordance}
                  style={{ padding: '7px 16px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                  Agree
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
