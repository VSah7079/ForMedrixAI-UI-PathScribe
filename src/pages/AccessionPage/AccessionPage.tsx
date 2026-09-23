// src/pages/AccessionPage/AccessionPage.tsx
// ─────────────────────────────────────────────────────────────
// Orchestration Stage 0 entry point — Stage 0 Requirements §6.1.
// Captures patient/case info and specimen list, then on submit:
//   1. Generates an O26- case ID (temporary scheme — see ID generation
//      note below; superseded once the Case Registry, S0-CF-08/09/10,
//      exists)
//   2. Calls evaluateGrossingTemplateAssignment() to pick a Grossing
//      Route (A/B/C) per specimen
//   3. Builds a GrossingReportInstance per specimen, status 'draft'
//   4. Creates the Case via caseRouter.createCase() with
//      status: 'accessioned'
//
// SPECIMEN MODEL — Name (read-only, from dictionary) / Description
// (editable, pre-filled from dictionary) / Comment (free text). Each row
// is populated from useSpecimenDictionary's SpecimenEntry — the same
// dictionary SpecimenEditModal.tsx already uses elsewhere in the app.
// That dictionary already carries type/site/laterality/procedure per
// entry, which directly satisfies S0-CF-01–03's "structured specimen
// data" requirement — those fields were not actually unbuilt, just not
// wired into this page. A specimen can still be entered manually
// ("— Custom specimen —") for anything not yet in the dictionary, same
// allowance SpecimenEditModal gives.
//
// SKELETON SCOPE — explicitly deferred to later Stage 0 build-order steps:
//   - Accession Number mask config (S0-CF-07) — uses a simple max+1 scheme.
//   - Pass G0 client override admin UI (S0-CF-12) — routingOverrides is
//     passed as empty; the evaluation function already accepts it.
//   - Per-field aiSuggestions pre-population on the created
//     GrossingReportInstance (S0-FR-03's "where the template has fields
//     the AI can already answer") — left empty; the seed mock data (Stage
//     0 §5) shows the target shape but synthesizing it from arbitrary
//     real specimen descriptions per template is real per-template-field
//     mapping work, not part of this skeleton.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PhiToastMessage } from '@/components/Common/PhiToastMessage';

import { caseRouter } from '@/services/cases/CaseRouter';
import { ORCH_ID_PREFIX, isOrchCaseId, formatOrchCaseId } from '@/services/cases/reportingModeRouting';
import { evaluateGrossingTemplateAssignment } from '@/services/cases/mockCaseService';
import { mockFacilityService, type Facility } from '@/services/facilities/mockFacilityService';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { locationService } from '@/services';
import type { Location as LocationRecord } from '@/services/locations/ILocationService';
import { mockDepartmentService } from '@/services/departments/mockDepartmentService';
import type { Department } from '@/services/departments/IDepartmentService';
import { mockUserService } from '@/services/users/mockUserService';
import type { StaffUser } from '@/services/users/IUserService';
import type { Case, GrossingReportInstance } from '@/types/case/Case';
import type { RecordedClinicalHistoryEntry, ClinicalHistoryCategoryCode } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';
import ClinicalHistoryEntryPanel from './ClinicalHistory/ClinicalHistoryEntryPanel';
import { mockClinicalHistoryDictionaryService } from '@/services/clinicalHistory/mockClinicalHistoryDictionaryService';
import { resolveAccessionValidation, type AccessionValidationResult } from '@/services/accessioning/resolveAccessionValidation';
import { mockAccessionOutboundQueueService } from '@/services/accessioning/mockAccessionOutboundQueueService';
import { mockMolecularOrderOutboundQueueService } from '@/services/molecularOrders/mockMolecularOrderOutboundQueueService';
import { resolveOutboundMolecularAssaysForProtocol } from '@/utils/resolveOutboundMolecularAssaysForProtocol';
import type { HistologyBlock, Specimen } from '@/types/case/Specimen';
import { generateDefaultMaterial } from '@/utils/generateDefaultMaterial';
import { findForeignIdCollision, findWithinDraftForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision, WithinDraftForeignIdCollision } from '@/utils/foreignIdCollision';
import type { CaseComment } from '@/types/case/CaseComment';
import { deficiencyTypeService } from '@/services';
import { resolveProviderName } from '@/services/physicians/resolveProviderName';
import { physicianService } from '@/services';
import type { Physician } from '@/services/physicians/IPhysicianService';
import { initials, avatarColorClass, contactRowsFor } from '@/utils/physicianDisplay';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import { protocolService } from '@/services';
import { grossingRoutingOverrideService, containerTypeService, intraoperativeService } from '@/services';
import type { Protocol } from '@/services/protocols/IProtocolService';
import { diagnosisCodesService } from '@/services';
import type { Icd10Code } from '@/services/diagnosisCodes/IDiagnosisCodesService';
import type { DeficiencyType } from '@/services/deficiencies/IDeficiencyService';
import { ReportDeficiencyModal } from './ReportDeficiencyModal';
import { IntraopMergePromptModal } from './IntraopMergePromptModal';
import { OrderLookupModal } from './OrderLookupModal';
import { PatientLinkSearch } from './PatientLinkSearch';
import ConfirmModal from '@/components/Common/ConfirmModal';
import type { EntryMatch } from '@/types/intraop/IntraoperativeEntry';
import { getSpecimenLabel } from '@/utils/specimenLabeling';
import type { GrossingTemplateAssignment } from '@/services/grossing/IGrossingEvaluationService';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { getFacilityDateParts } from '@/utils/facilityTime';
import { useSpecimenDictionary } from '@/components/Config/System/useSpecimenDictionary';
import { orderIntakeService } from '@/services';
import type { IncomingOrder } from '@/services';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { dobIncludesQuery, dobExactlyMatches } from '@/utils/isoDateForSearch';
import { normalizeIdForSearch } from '@/utils/normalizeIdForSearch';
import { isEncounterActive } from '@/utils/isEncounterActive';
import { inferLateralityFromText } from '@/utils/inferLateralityFromText';
import { parseScannedPayload } from '@/utils/parseScannedPayload';
import { playScanBeep } from '@/utils/playScanBeep';
import { mockInterfaceEngineService } from '@/services/interfaceEngine/mockInterfaceEngineService';
import { buildOrderCreationPayload } from '@/services/interfaceEngine/buildOrderCreationPayload';
import { applyGrossingRefinement, markGrossingRefinementFailed } from '@/utils/applyGrossingRefinement';
import { PatientIdStatusDot } from '@/components/Common/PatientIdStatusDot';
import { dateFormatHint } from '@/utils/formatDate';
import { specimenDeficiencyService } from '@/services';
import { priorityService } from '@/services';
import type { PriorityLevel } from '@/services';
import type { CasePriority } from '@/services/cases/ICaseService';
import { SuffixSelect } from '@/components/Common/SuffixSelect';
import { formatFullDisplayName } from '@/utils/personName';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useDirtyState } from '@/contexts/DirtyStateContext';
import { getHospitalIdForOrganisation, getOrganisationDisplayName, getOrganisationByHospitalId, resolveMpiScopeEnterpriseId } from '@/services/organisation/organisationService';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { mockEncounterService } from '@/services/encounters/mockEncounterService';
import type { Encounter } from '@/services/encounters/IEncounterService';
import { mockCaseMaskService } from '@/services/caseRegistry/mockCaseMaskService';
import { resolveCaseMaskScopeCandidates } from '@/services/caseRegistry/resolveCaseMaskScopeCandidates';
import { resolveTenantFacility } from '@/services/auth/resolveTenantFacility';
import type { CaseMask } from '@/types/config/CaseMask';
import { PATIENT_ID_BY_JURISDICTION } from '@/types/systemConfig';
import { SpecimenDictionaryPicker } from '@/components/SpecimenPicker/SpecimenDictionaryPicker';
import { CaseCommentModal } from '@/pages/Synoptic/Comments/CaseCommentModal';
import { ReportCommentModal } from '@/pages/Synoptic/Comments/ReportCommentModal';
import { mockActionRegistryService } from '@/services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '@/constants/systemActions';
import { BREAK_GLASS_REASON_CODES } from '@/types/patients/BreakGlassReasonCode';
import type { OutsidePatientFinancialData } from '@/types/billing/OutsidePatientFinancialData';
import { mockMasterPaymentTypeService } from '@/services/billing/mockMasterPaymentTypeService';
import { mockJurisdictionPaymentMappingService } from '@/services/billing/mockJurisdictionPaymentMappingService';
import type { MasterPaymentType } from '@/types/billing/MasterPaymentType';
import type { JurisdictionPaymentMapping } from '@/types/billing/JurisdictionPaymentMapping';
import { resolveAutopsyIntakeFormValidation, type AutopsyIntakeFormState } from '@/services/autopsy/resolveAutopsyIntakeFormValidation';
import { buildAutopsyCaseDetailsFromIntakeForm } from '@/services/autopsy/buildAutopsyCaseDetailsFromIntakeForm';
import { JURISDICTION_LABELS, type Jurisdiction as AutopsyJurisdiction } from '@/types/systemConfig';
import type { AutopsyCaseAuthority } from '@/types/autopsy/AutopsyCaseDetails';
import { resolveSpecimenEntryMatchesCategory } from '@/services/specimenDictionary/resolveSpecimenEntryMatchesCategory';
import type { AutopsyOrganCode } from '@/types/autopsy/AutopsyOrganCode';
import { AUTOPSY_ORGAN_TO_SECTION } from '@/types/autopsy/AutopsyOrganCode';
import { classifyAutopsyOrganCodeFromSiteText } from '@/services/autopsy/classifyAutopsyOrganCodeFromSiteText';
import { formatConsentingRelativePriorityHint } from '@/services/autopsy/formatConsentingRelativePriorityHint';

/** Real, UI-presentation-only grouping for the Autopsy organ picker
 *  below — deliberately kept out of AutopsyOrganCode.ts itself, which
 *  stays a domain-level organ->section fact, not a display concern.
 *  Section titles here match data/templates/Autopsy/
 *  autopsy_gross_examination.json's own real section titles exactly,
 *  so a picked organ's group name is recognizable against the actual
 *  synoptic section it will reveal. */
// Real, i18n sweep (batch 10) — sectionTitle/autopsyOrganCodeLabel were
// static English text generated algorithmically from the organ code
// itself; converted to the same label-key-map pattern used throughout
// this sweep (real value/id untouched, only the displayed label is a
// translation key, resolved with t() at the render site).
const AUTOPSY_ORGAN_PICKER_GROUPS: { sectionId: string; titleKey: string; organs: AutopsyOrganCode[] }[] = (() => {
  const sectionTitleKeyById: Record<string, string> = {
    head_and_neck: 'accessionPage.autopsy.section.headAndNeck',
    cardiovascular_system: 'accessionPage.autopsy.section.cardiovascular',
    respiratory_system: 'accessionPage.autopsy.section.respiratory',
    gastrointestinal_hepatobiliary: 'accessionPage.autopsy.section.gastrointestinalHepatobiliary',
    genitourinary_endocrine: 'accessionPage.autopsy.section.genitourinaryEndocrine',
    musculoskeletal_hematopoietic: 'accessionPage.autopsy.section.musculoskeletalHematopoietic',
  };
  const bySectionId = new Map<string, AutopsyOrganCode[]>();
  for (const [organ, sectionId] of Object.entries(AUTOPSY_ORGAN_TO_SECTION) as [AutopsyOrganCode, string][]) {
    if (!bySectionId.has(sectionId)) bySectionId.set(sectionId, []);
    bySectionId.get(sectionId)!.push(organ);
  }
  return Object.entries(sectionTitleKeyById).map(([sectionId, titleKey]) => ({
    sectionId, titleKey, organs: bySectionId.get(sectionId) ?? [],
  }));
})();

const AUTOPSY_ORGAN_LABEL_KEY: Record<AutopsyOrganCode, string> = {
  brain: 'accessionPage.autopsy.organLabel.brain', pituitary: 'accessionPage.autopsy.organLabel.pituitary',
  eyes: 'accessionPage.autopsy.organLabel.eyes', spinal_cord: 'accessionPage.autopsy.organLabel.spinalCord',
  thyroid: 'accessionPage.autopsy.organLabel.thyroid', parathyroid: 'accessionPage.autopsy.organLabel.parathyroid',
  larynx_trachea: 'accessionPage.autopsy.organLabel.larynxTrachea',
  heart: 'accessionPage.autopsy.organLabel.heart', pericardium: 'accessionPage.autopsy.organLabel.pericardium',
  aorta: 'accessionPage.autopsy.organLabel.aorta', major_vessels: 'accessionPage.autopsy.organLabel.majorVessels',
  right_lung: 'accessionPage.autopsy.organLabel.rightLung', left_lung: 'accessionPage.autopsy.organLabel.leftLung',
  pleura: 'accessionPage.autopsy.organLabel.pleura',
  tracheobronchial_tree: 'accessionPage.autopsy.organLabel.tracheobronchialTree',
  esophagus: 'accessionPage.autopsy.organLabel.esophagus', stomach: 'accessionPage.autopsy.organLabel.stomach',
  duodenum: 'accessionPage.autopsy.organLabel.duodenum', small_intestine: 'accessionPage.autopsy.organLabel.smallIntestine',
  large_intestine: 'accessionPage.autopsy.organLabel.largeIntestine', appendix: 'accessionPage.autopsy.organLabel.appendix',
  liver: 'accessionPage.autopsy.organLabel.liver', gallbladder_biliary: 'accessionPage.autopsy.organLabel.gallbladderBiliary',
  pancreas: 'accessionPage.autopsy.organLabel.pancreas', peritoneum_omentum: 'accessionPage.autopsy.organLabel.peritoneumOmentum',
  right_kidney: 'accessionPage.autopsy.organLabel.rightKidney', left_kidney: 'accessionPage.autopsy.organLabel.leftKidney',
  adrenal_glands: 'accessionPage.autopsy.organLabel.adrenalGlands', bladder: 'accessionPage.autopsy.organLabel.bladder',
  ureters: 'accessionPage.autopsy.organLabel.ureters', prostate: 'accessionPage.autopsy.organLabel.prostate',
  uterus_adnexa: 'accessionPage.autopsy.organLabel.uterusAdnexa', testes: 'accessionPage.autopsy.organLabel.testes',
  spleen: 'accessionPage.autopsy.organLabel.spleen', lymph_nodes: 'accessionPage.autopsy.organLabel.lymphNodes',
  bone_marrow: 'accessionPage.autopsy.organLabel.boneMarrow', skin_subcutis: 'accessionPage.autopsy.organLabel.skinSubcutis',
  musculoskeletal_specimen: 'accessionPage.autopsy.organLabel.musculoskeletalSpecimen',
};

// ── Local form types ────────────────────────────────────────────────────────

interface SpecimenDraft {
  label: string;              // auto-assigned A, B, C…
  dictionaryEntryId: string;  // '' = manual / not yet picked ("— Custom specimen —")
  description: string;        // editable; pre-filled from the dictionary entry on pick
  comments: CaseComment[];    // append-only thread, separate from description
  /**
   * Real, per direct guidance's own real LIS/cytology data-modeling
   * follow-up — additive, specimen-specific clinical history for a
   * genuinely multi-specimen case (e.g. Part A: Right Pleural Fluid,
   * Part B: Left Pleural Fluid), same real shape as Specimen.ts's own
   * clinicalHistory field this flows into on save. Distinct from the
   * case-level clinicalHistoryEntries state above — never a
   * replacement for it.
   */
  clinicalHistory: RecordedClinicalHistoryEntry[];
  /**
   * A manually-reported deficiency for this specimen — distinct from
   * needsDictionaryResolution (auto-detected on order import). Not
   * every real specimen issue is a dictionary mismatch — container
   * damage, insufficient volume, a labeling discrepancy noticed by the
   * accessioner — none of those get auto-detected, so there needs to be
   * a way to flag one manually. Raised (not raised-and-resolved) at
   * submit time — a manually-reported issue isn't something the
   * accessioner necessarily has the answer to on the spot, unlike the
   * auto-detected dictionary mismatch, which gets resolved in the same
   * sitting it's found.
   */
  /** Real fix, per direct follow-up: "You can have one Deficiency, but
   *  in the real world you may have multiple." Confirmed directly: the
   *  underlying storage (services/deficiencies/ — SpecimenDeficiency,
   *  getBySpecimenId returning an array, raise() creating an
   *  independent record each time) already fully supported multiple
   *  deficiencies per specimen — this form's own draft state was the
   *  actual, narrowly-scoped gap, holding a single optional object
   *  that a second report would silently overwrite. Now a real array. */
  manualDeficiencies: { deficiencyTypeId: string; comment: string }[];
  /** Set only when this specimen came from "Import from Order" — the
   *  Department that resolveOrder() matched it to (crosswalk or
   *  auto-created), shown as an informational note. Not sent anywhere on
   *  submit; evaluateGrossingTemplateAssignment still does its own
   *  independent AI reasoning per specimen. */
  resolvedDepartmentName?: string;
  departmentWasAutoCreated?: boolean;
  /** True if the imported order's dictionaryEntryId came from
   *  findOrCreateByName's fallback (a brand-new pending Specimen
   *  Dictionary entry) rather than an existing crosswalk match — same
   *  role departmentWasAutoCreated plays for the department. */
  dictionaryEntryWasAutoCreated?: boolean;

  /**
   * True when this specimen came from an imported order whose text
   * didn't exactly match any Specimen Dictionary entry. Deliberately no
   * AI/fuzzy-matching here, and no auto-created pending entry — the
   * Specimen Dictionary has no unique key to dedupe against (unlike NPI
   * for Physician or code for Facility/Department), so auto-creating on a
   * near-miss just produces near-duplicate entries for someone to clean
   * up later. This is the specimen-requisition-deficiency case instead:
   * the accessioner — who has the actual specimen and order in front of
   * them — resolves it directly, either by picking the correct existing
   * entry or explicitly confirming no match exists. Blocks submission
   * (specimensValid) until resolved either way.
   */
  needsDictionaryResolution?: boolean;
  /** The order's original specimen text, kept for display in the
   *  resolution prompt even if the editable description field changes.
   *  Also doubles as "this specimen had a deficiency raised against it
   *  at some point" — checked at submit time to decide whether a
   *  SpecimenDeficiency record needs writing, even after resolution. */
  unmatchedOrderText?: string;
  /** Set once needsDictionaryResolution is cleared — which
   *  ResolutionType.id applies, so the eventual SpecimenDeficiency
   *  record reflects how it was actually resolved. */
  resolutionTypeId?: string;

  // ── Timing / processing (Specimen.collection/processing/container) ──────
  // Three distinct moments, not one — see the design discussion this was
  // built from. collectedAt starts the cold-ischemia clock; processedAt
  // (fixative added) ends it — the gap between them is what CAP/ASCO
  // biomarker guidance (breast ER/PR/HER2 etc.) actually constrains.
  // receivedAt is when the lab got it, a separate fact from either.
  /** When the specimen was actually taken from the patient. Left blank by
   *  default — collection almost always happened before accessioning, so
   *  defaulting to "now" would be actively wrong, not just imprecise. */
  collectedAt: string;
  /** When fixative was added — the cold-ischemia end point. Also blank by
   *  default; see processedAtIsEstimated below for what happens when the
   *  real time was never documented. */
  processedAt: string;
  /** True when processedAt is a professional estimate, not a directly
   *  documented time — see Specimen.ts's SpecimenProcessing.
   *  processedAtIsEstimated for the full reasoning. */
  processedAtIsEstimated: boolean;
  /** When the lab received the specimen — the one moment the accessioner
   *  is actually present for, so this alone defaults to "now". */
  receivedAt: string;

  // ── Manual override fields for custom (non-dictionary) specimens ────────
  // Pre-filled from the matched dictionary entry when one is picked
  // (site/laterality), but editable — the requisition may state these
  // more precisely than the dictionary's own defaults, and a custom
  // specimen has no dictionary entry to pull them from at all.
  containerType: string;
  /** Real, per direct request — the real, actual fixative volume for
   *  this specific specimen. Defaulted from the selected container
   *  type's own capacityMl when one is chosen, but editable — see
   *  SpecimenContainer.fixativeVolumeMl's own doc comment for the
   *  full reasoning. Empty string (not 0) is the real "not entered"
   *  state, same convention as every other blank-by-default numeric-
   *  as-string field in this draft. */
  fixativeVolumeMl: string;
  anatomicSite: string;
  laterality: string;
  /** Real, per direct guidance's own confirmed two-tier
   *  specimen-to-organ mapping strategy (Tier 1: Explicit Entry via
   *  this UI picker) — mirrors Specimen.ts's own real organCodes
   *  field exactly. Only ever shown/editable for a specimen whose own
   *  dictionary entry is genuinely Autopsy-category
   *  (resolveSpecimenEntryMatchesCategory); every other specimen
   *  leaves this undefined, never an empty array standing in for "not
   *  applicable." */
  organCodes?: AutopsyOrganCode[];
  /** Real feature, per direct follow-up: "I would like to include the
   *  AI badge, confidence on fields being suggested." True only when
   *  the current laterality value came from
   *  inferLateralityFromText.ts — never a real AI/LLM confidence
   *  score, a deterministic keyword match, so it's honestly labeled
   *  "Suggested," never given a fabricated percentage. Cleared the
   *  moment the accessioner edits the field by hand, matching the
   *  Synoptic report's own AI badges' "overridden" behavior. */
  lateralityInferred: boolean;

  /**
   * Real feature, per direct follow-up: "Accessioning isn't wired to
   * the foreign-ID collision check... I would assume that support for
   * Foreign ID is complete." Confirmed directly it wasn't — this is
   * the real, missing piece: accessioning is exactly where a
   * received, foreign-labeled specimen (the original "cytology fluid"
   * case this whole feature traces back to) first gets entered, and
   * SpecimenDraft had no externalId/externalIdSource fields at all
   * until now. Same real shape as Specimen.externalId/externalIdSource
   * — propagated onto the real record at submit time.
   */
  externalId: string;
  externalIdSource: string;
}


// Auto-generates Block A with stain orders from the matched dictionary
// entry's defaultStains — falls back to H&E if unset, which is most
// entries today (defaultStains was added to the SpecimenEntry type but
// never backfilled onto real seed data). Built for a same-week
// end-to-end demo (Accession → Grossing Template → Blocks/Stains →
// Worklist → Synoptic → sign-out) — deliberately minimal, see
// Specimen.blocks's own doc comment (types/case/Specimen.ts) for full
// scope reasoning and what's explicitly cut for time.
// Auto-generates blocks/stains from the matched dictionary entry.
//
// Two paths, branching on whether the entry has a protocolId resolving
// to a real Protocol (services/protocols/IProtocolService.ts — a
// standalone, referenceable dictionary; multiple unrelated specimen
// types can map to the same Protocol record):
//
//   - Protocol configured (e.g. Medical Renal → LM/IF/EM): one block
//     PER PATHWAY, each carrying that pathway's own fixative/format/
//     decal requirement — a real fix for the flat "one specimen, one
//     block" assumption this started as, for the specimen types where
//     that assumption was actually wrong (a kidney biopsy splitting
//     into three genuinely different processing streams isn't three
//     blocks of the same thing).
//   - No protocol (still true for most specimen types — this is new,
//     opt-in, nothing regresses for anything without one configured):
//     unchanged, original single-block behavior from defaultStains/H&E.
//
// Built for a same-week end-to-end demo originally; still deliberately
// minimal beyond the protocol rewire — no editing UI yet, no block-
// level priority, no full exception-status lifecycle. See
// Specimen.blocks's own doc comment (types/case/Specimen.ts) for the
// original scope reasoning, still true for what's not covered here.
// ── ICD-10 diagnosis code picker — search + multi-select, same pattern as ──
// ── the Protocol editor's stain picker, for the same scalability reason: ───
// ── even this deliberately small seed set shouldn't be a static list. ──────
const Icd10Picker: React.FC<{
  allCodes: Icd10Code[];
  selected: Icd10Code[];
  onChange: (codes: Icd10Code[]) => void;
}> = ({ allCodes, selected, onChange }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matches = allCodes
    .filter(c => !selected.some(s => s.code === c.code))
    .filter(c => {
      const q = query.trim().toLowerCase();
      return !q || c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    })
    .slice(0, 20);

  const add = (c: Icd10Code) => { onChange([...selected, c]); setQuery(''); };
  const remove = (code: string) => onChange(selected.filter(s => s.code !== code));

  return (
    <div className="ps-protocol-stainselect" ref={wrapRef}>
      {selected.length > 0 && (
        <div className="ps-protocol-stainselect-chips">
          {selected.map(c => (
            <span key={c.code} className="ps-protocol-stainselect-chip">
              {c.code} — {c.description}
              <button type="button" onClick={() => remove(c.code)} className="ps-protocol-stainselect-chip-remove">×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="ps-input-dark"
        placeholder={t('accessionPage.icd10.searchPlaceholder')}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && matches.length > 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          {matches.map(c => (
            <div key={c.code} className="ps-protocol-stainselect-option" onMouseDown={() => add(c)}>
              <span>{c.code}</span>
              <span className="ps-protocol-stainselect-option-cat">{c.description}</span>
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          <div className="ps-protocol-stainselect-empty">{t('accessionPage.icd10.noMatches')}</div>
        </div>
      )}
    </div>
  );
};

// generateDefaultMaterial — the pathway-driven block/decant generation
// this accessioning flow uses at specimen-creation time — now lives in
// utils/generateDefaultMaterial.ts, extracted out of this file so it's
// directly, independently testable (see that module's own header for
// the full reasoning). Imported below.

function emptySpecimen(label: string): SpecimenDraft {
  return {
    label, dictionaryEntryId: '', description: '', comments: [], clinicalHistory: [],
    collectedAt: '', processedAt: '', processedAtIsEstimated: false,
    // receivedAt defaults to "now" — the one moment the accessioner is
    // actually present for. Formatted for a datetime-local input.
    receivedAt: new Date().toISOString().slice(0, 16),
    containerType: '', fixativeVolumeMl: '', anatomicSite: '', laterality: '', lateralityInferred: false,
    manualDeficiencies: [],
    externalId: '', externalIdSource: '',
  };
}

// ── Component ────────────────────────────────────────────────────────────

type TabKey = 'case' | 'specimens' | 'outside_patient';

const AccessionPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { config } = useSystemConfig();
  // Real fix, per direct follow-up: "Does the DOB take into account
  // locality? UK vs. US." — it didn't; the omnibox's DOB search and
  // placeholder both hardcoded US-style mm/dd/yyyy. This app already
  // has a real, established per-facility jurisdiction concept
  // (Facility.jurisdiction — see IFacilityService.ts's own doc
  // comment) that drives exactly this elsewhere (patient ID format,
  // terminology, date locale). The omnibox runs before a facility is
  // necessarily selected at all — often the search IS how the
  // accessioner finds/confirms the facility in the first place — so
  // this uses config.jurisdiction, the same system-level fallback
  // Facility.jurisdiction's own doc comment names for exactly this
  // "no facility resolved yet" situation, rather than reading
  // selectedFacility (which is both frequently empty at search time and
  // defined later in this file, so referencing it here would hit a
  // real TS2448 block-scope ordering error).
  //
  // searchDobFormat is the explicit 'MM/DD/YYYY' | 'DD/MM/YYYY' hint
  // itself — passed directly to isoDateForSearch. Deliberately not a
  // BCP-47 locale string fed through toLocaleDateString the way
  // formatDate.ts's own display formatting works: confirmed live that
  // real ICU locale data disagrees with this app's own
  // JURISDICTION_LOCALE table for at least 'en-CA' (formats as ISO
  // yyyy-mm-dd via toLocaleDateString, not the dd/mm/yyyy
  // JURISDICTION_LOCALE.CA declares) — see isoDateForSearch.ts's own
  // header comment for the full story. Building the string directly
  // from this app's own explicit format hint sidesteps that risk
  // entirely for search-matching, where correctness matters more than
  // for display.
  //
  // dateFormatHint() itself is typed to return a bare `string` (a
  // pre-existing, shared utility other code already depends on — not
  // narrowed here to avoid any ripple effect on those other callers).
  // Narrowed explicitly at this one call site instead: real,
  // confirmed safe given JURISDICTION_LOCALE's own table (this
  // function's only real source of values, plus its own 'MM/DD/YYYY'
  // fallback) never produces anything outside this exact union.
  const searchJurisdiction = config.jurisdiction;
  const searchDobFormat = dateFormatHint(searchJurisdiction) as 'MM/DD/YYYY' | 'DD/MM/YYYY';
  const searchDobFormatHint = searchDobFormat.toLowerCase();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('accessionPage.page.title'), '/accession'); }, [pushCrumb, t]);

  const [tab, setTab] = useState<TabKey>('case');
  const [submitting, setSubmitting] = useState(false);

  // ── Reference data ──────────────────────────────────────────────────────
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [pathologists, setPathologists] = useState<StaffUser[]>([]);
  const [pendingOrders, setPendingOrders] = useState<IncomingOrder[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const departmentsById = useMemo(() => new Map(departments.map(c => [c.id, c])), [departments]);

  const loadPendingOrders = () => {
    orderIntakeService.listPendingOrders().then(res => { if (res.ok) setPendingOrders(res.data); });
  };

  useEffect(() => {
    mockFacilityService.getAll().then(res => { if (res.ok) setFacilities(res.data.filter(c => c.status === 'Active')); });
    mockUserService.getAll().then(res => {
      if (res.ok) setPathologists(res.data.filter(u => u.status === 'Active' && u.roles.includes('Pathologist')));
    });
    mockDepartmentService.getAll().then(res => { if (res.ok) setDepartments(res.data); });
    loadPendingOrders();
  }, []);

  // ── Patient / case fields ───────────────────────────────────────────────
  // Prefix/Given/Family/Preferred/Suffix instead of rigid First/Last —
  // see utils/personName.ts. givenNames/familyNames are the real data;
  // Case.patient.firstName/lastName get mirrored from them at submit
  // time for backward compatibility with Worklist/report-rendering/etc.
  const [namePrefix, setNamePrefix] = useState('');
  const [givenNames, setGivenNames] = useState('');
  const [familyNames, setFamilyNames] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nameSuffix, setNameSuffix] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<'M' | 'F' | 'U'>('F');
  // Real, per direct guidance's own prior requirement ("The User may
  // need to see the LMP and other clinical history dictionaries
  // entries") plus its own direct follow-up: LMP and the three
  // real Bethesda §1 fields once flagged as a real, honest gap
  // (CytologyReportContent.ts) — now captured here, at real
  // accessioning, alongside the rest of this page's own patient
  // demographic fields. Shown only when the case includes a real
  // cytology/FNA specimen — see cytologyRelevant below.
  const [lmp, setLmp] = useState('');
  const [hormonalStatus, setHormonalStatus] = useState<'' | 'premenopausal' | 'perimenopausal' | 'postmenopausal' | 'pregnant'>('');
  const [iudOrContraceptionUse, setIudOrContraceptionUse] = useState('');
  // Real, per the uploaded "Structured Clinical History Dictionary &
  // Accessioning Integration" spec's own User Story 3, Acceptance
  // Criteria 3 ("Category 1 (SCR): Prompts for LMP and
  // prior_hpv_result") — a new, simple, categorical field, same real
  // treatment as hormonalStatus above (a current-state fact, not a
  // dated event, so it doesn't belong in the structured dictionary —
  // see the direct "why is LMP a dictionary?" discussion this
  // decision follows from).
  const [priorHpvResult, setPriorHpvResult] = useState<'' | 'positive' | 'negative' | 'unknown' | 'not_tested'>('');
  // Real, per the same spec's own Acceptance Criteria 4 ("Multi-Category
  // Entry") — the real, structured entries an accessioner has attached
  // via ClinicalHistoryEntryPanel before saving.
  const [clinicalHistoryEntries, setClinicalHistoryEntries] = useState<RecordedClinicalHistoryEntry[]>([]);
  // Real, per direct guidance ("New tab, only would be used for
  // Cytology cases") — a real, local tab switch, shown only when
  // cytologyRelevant (declared below); 'main' stays the real default
  // so every non-cytology accession behaves exactly as it always has.
  const [accessionTab, setAccessionTab] = useState<'main' | 'clinical_history'>('main');
  // Real, per direct guidance ("Check the actions ts as that is where
  // we are wiring keyboard shortcuts") — bridges the real
  // accession.clinicalHistoryCategoryN action dispatch (handled below,
  // in this page's own existing onAction subscription) down to
  // ClinicalHistoryEntryPanel, which isn't itself subscribed to the
  // registry. A plain counter-plus-category pair, not just the
  // category alone, so the panel's own useEffect fires even when the
  // same category is requested twice in a row.
  const [requestedClinicalHistoryCategory, setRequestedClinicalHistoryCategory] = useState<{ category: ClinicalHistoryCategoryCode; nonce: number } | null>(null);
  // Real, per direct follow-up closing PS-211's own remaining gap:
  // the one real half of CytologyHighRiskFactors.abnormalExamFindings
  // that can only ever be a real, manual, collection-time observation
  // — see CytologyScreeningRecord.persistentContactBleedingAtCollection's
  // own doc comment (types/case/Specimen.ts).
  const [persistentContactBleedingAtCollection, setPersistentContactBleedingAtCollection] = useState(false);
  const [reasonForStudy, setReasonForStudy] = useState<'' | 'nhs_programme_invited' | 'private_or_opportunistic'>('');
  const [mrn, setMrn] = useState('');
  const [encounterNumber, setEncounterNumber] = useState('');
  // Real feature, per direct, detailed specification: "Encounter
  // Selector & Auto-Fill." linkedEncounter is the real Encounter this
  // case's form fields were populated from — kept even after the
  // fields themselves are edited, so the confirmation badge/unlink
  // control below has something real to point at and clear.
  // encounterCandidates holds every real, currently-active encounter
  // for the selected patient when there's more than one (the real
  // "Encounter Selection Dropdown" case) — empty otherwise.
  // encounterLookupState distinguishes "haven't looked yet," "actively
  // fetching" (the spec's own <300ms target — real, not decorative:
  // the UI needs to know whether to show a brief loading state), and
  // "looked, found nothing real to offer."
  const [linkedEncounter, setLinkedEncounter] = useState<Encounter | null>(null);
  const [encounterCandidates, setEncounterCandidates] = useState<Encounter[]>([]);
  const [encounterLookupState, setEncounterLookupState] = useState<'idle' | 'loading' | 'done'>('idle');

  // Real feature, per direct confirmation, building Phase B of the
  // "Interface Exception & Case-Binding Module": a real, explicit way
  // to mark a new accession as a temporary/downtime placeholder
  // identity — never inferred from a name pattern (a real patient
  // could legitimately be named "John Doe").
  //
  // Real, per direct guidance ("replace the checkbox with an explicit
  // Patient Origin / Intake Type selector"): what used to be a single,
  // secondary downtime checkbox is now this real, explicit three-way
  // selector — the checkbox's own real submit behavior for Downtime
  // mode (isDowntimeRecord/downtimeReasonCode passed to
  // resolveOrCreatePatient) is completely unchanged, just now driven
  // by intakeType === 'downtime' instead of a checked boolean.
  // 'outside' is the new Outside/Contract Case mode (Outside Client
  // Support & International Financial Class Architecture
  // Specification). Real, deliberate scope boundary, confirmed
  // directly before building: "completely bypassing the identity
  // reconciliation queue" for Outside Patient cases is NOT implemented
  // here — mockPatientIndexService.resolveOrCreatePatient()'s result
  // feeds directly into Encounter resolution immediately after it
  // returns, and into the Case record itself further down, so a real
  // bypass means deciding what an Outside Patient case's own
  // patientId/encounter linkage actually IS instead of that real MPI
  // resolution, not just skipping a function call. That's real,
  // separate, larger work; for now, an Outside/Contract Case still
  // goes through the same real MPI resolution every other accession
  // does, and additionally activates the real Outside Patient Data tab
  // below to capture jurisdiction/financial-class data.
  const [intakeType, setIntakeType] = useState<'standard' | 'downtime' | 'outside'>('standard');
  const isDowntimeAccession = intakeType === 'downtime';

  // Real, defensive fix: if the admin switches intakeType away from
  // 'outside' while actively viewing the Outside Patient Data tab
  // (whose own button just disappeared above), fall back to the Case
  // & Patient tab rather than leaving `tab` pointing at a real tab key
  // with no matching button or content rendered anymore.
  useEffect(() => {
    if (intakeType !== 'outside' && tab === 'outside_patient') setTab('case');
  }, [intakeType, tab]);
  const [downtimeReasonCode, setDowntimeReasonCode] = useState('');

  // Real, per direct guidance: the real Outside Patient Data tab's own
  // captured fields — see types/billing/OutsidePatientFinancialData.ts
  // for the full, field-by-field account of what each one means and
  // why it isn't just a duplicate of a Case & Patient tab field.
  const [outsidePatientData, setOutsidePatientData] = useState<OutsidePatientFinancialData>({});

  // Real, per direct guidance: the two Financial Class dictionaries
  // (Step 1 of the Outside Client Support & International Financial
  // Class Architecture Specification) — loaded once, filtered/derived
  // in the Outside Patient Data tab's own render below.
  const [masterPaymentTypes, setMasterPaymentTypes] = useState<MasterPaymentType[]>([]);
  const [jurisdictionMappings, setJurisdictionMappings] = useState<JurisdictionPaymentMapping[]>([]);
  useEffect(() => {
    if (intakeType !== 'outside') return;
    mockMasterPaymentTypeService.getAll().then(res => { if (res.ok) setMasterPaymentTypes(res.data.filter(mpt => mpt.active)); });
    mockJurisdictionPaymentMappingService.getAll().then(res => { if (res.ok) setJurisdictionMappings(res.data.filter(m => m.active)); });
  }, [intakeType]);

  // Origin Hospital is derived from the accessioning user's own
  // organisation, not a free-pick dropdown — see organisationService.ts's
  // getHospitalIdForOrganisation() doc comment for why. Falls back to
  // 'HOSP-001' only if the session has no resolvable organisationId
  // (matches the deny-by-default posture elsewhere; a case created under
  // an unresolvable org will itself be inaccessible to everyone except
  // superadmin, which is the correct fail-safe rather than guessing).
  const originHospitalId = (user?.organisationId && getHospitalIdForOrganisation(user.organisationId)) || 'HOSP-001';
  // Real sites for the resolved organisation — e.g. MFT has three
  // (Manchester Royal Infirmary, Wythenshawe, North Manchester General),
  // each potentially routing to a different local Vantage/Cerebro
  // hardware endpoint (see ModeAInterfaceService.resolveModeAOrgContext).
  // Single-site organisations get no selector at all — nothing to choose.
  const originOrganisation = useMemo(() => getOrganisationByHospitalId(originHospitalId), [originHospitalId]);
  // Real feature, per direct specification: the new "Order Lookup &
  // Patient Verification" modal needs a real MPI scope to search
  // against the moment it opens — before the accessioner has
  // necessarily selected a client/facility on the form at all. Same,
  // real computation the submit handler already does further down
  // (resolveMpiScopeEnterpriseId(originOrganisation) — see that call
  // site's own comment for the full "MPI, not EMPI" reasoning), just
  // available upfront here instead of only deep inside the submit
  // path, since search needs to work before submission, not after.
  const mpiScopeOrgId = useMemo(() => resolveMpiScopeEnterpriseId(originOrganisation), [originOrganisation]);

  // Real, per direct guidance ("should the accession do this as they
  // go rather than the current process"; and per direct follow-up,
  // generalized to every intake type — a maiden/married name change
  // can happen on any ordinary accession, not just an Outside/Contract
  // Case): the real, confirmed-candidate state for the same_person
  // link. The actual search/debounce logic itself lives in the shared
  // PatientLinkSearch.tsx component. Deliberately doesn't change how
  // patient resolution itself works for anyone — resolveOrCreatePatient()
  // still runs exactly as it does for every accession; this only adds
  // the opportunity to explicitly confirm a real link immediately
  // after, in the same accessioning transaction, rather than depending
  // on a separate, easy-to-forget later step.
  //
  // Real, per direct follow-up ("not sure if there is a point to this
  // at accession unless it's the maiden/married name scenario"): a
  // family_relation field was briefly added here and removed again in
  // the same pass. Its one motivating real scenario — a newborn
  // accessioned under their mother's identity before getting their own
  // real MRN — turns out to already have a real, dedicated fix
  // elsewhere: moveCaseToPatient() (HL7 A43), triggered by the real
  // inbound ADT event once the newborn's own identity actually exists,
  // not something an accessioner is in a position to act on at THIS
  // moment, before that identity exists at all. Real, separate,
  // next-step work: proactively exposing moveCaseToPatient() from
  // SearchPage.tsx for cases where no ADT feed will ever send that A43
  // in the first place (an Outside/Contract Case's own referring EMR
  // has no awareness of this lab's records to reassign against).
  const [samePersonLinkConfirmed, setSamePersonLinkConfirmed] = useState<MasterPatientRecord | null>(null);

  // Real, per direct guidance — Phase 3 of the Organisation/Site ->
  // Facility migration (originSiteId step). Was `originOrganisation?.sites
  // ?? []` (Organisation.sites[], the old Site system) — now resolves
  // the real origin Enterprise Facility via the same
  // resolveTenantFacility() bridge Phase 1 built for tenant isolation,
  // then finds its real, child performing-lab Facilities (parentId).
  // originHospitalId itself stays untouched until Phase 3's own,
  // separate, later step — this only changes the site picker's real
  // data source underneath it.
  const originEnterpriseFacility = useMemo(
    () => resolveTenantFacility(originHospitalId, facilities.filter(f => f.isEnterprise)),
    [facilities, originHospitalId]
  );
  const originSites = useMemo(
    () => facilities.filter(f => f.parentId === originEnterpriseFacility?.id),
    [facilities, originEnterpriseFacility]
  );
  const [originSiteId, setOriginSiteId] = useState('');
  // Defaults to the first site the moment the org's sites resolve, same
  // fallback resolveModeAOrgContext already applies server-side — this
  // just makes that default visible and overridable instead of silent.
  useEffect(() => {
    if (!originSiteId && originSites.length > 0) setOriginSiteId(originSites[0].id);
  }, [originSites, originSiteId]);
  const [priority, setPriority] = useState<CasePriority>('Routine');
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);
  useEffect(() => {
    priorityService.getAll().then(res => { if (res.ok) setPriorityLevels(res.data.filter(p => p.isActive)); });
  }, []);

  const [containerTypes, setContainerTypes] = useState<import('@/services/containerTypes/IContainerTypeService').ContainerType[]>([]);
  useEffect(() => {
    containerTypeService.getAll().then(res => { if (res.ok) setContainerTypes(res.data.filter(c => c.status === 'Active')); });
  }, []);

  const [intraopMatch, setIntraopMatch] = useState<{ caseId: string; match: EntryMatch } | null>(null);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [deficiencyModalOpenForIdx, setDeficiencyModalOpenForIdx] = useState<number | null>(null);
  const [caseDeficiencyModalOpen, setCaseDeficiencyModalOpen] = useState(false);
  const [caseManualDeficiencies, setCaseManualDeficiencies] = useState<{ deficiencyTypeId: string; comment: string }[]>([]);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [allIcd10Codes, setAllIcd10Codes] = useState<Icd10Code[]>([]);
  useEffect(() => {
    protocolService.getAll().then(res => { if (res.ok) setProtocols(res.data.filter(p => p.active)); });
    diagnosisCodesService.getAll().then(res => { if (res.ok) setAllIcd10Codes(res.data); });
  }, []);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
  }, []);
  const [requestingProvider, setRequestingProvider] = useState('');
  // Real, per PS-81 (Jira) — reuses the exact, already-proven "search
  // staff, pick a real match, fall back to free text" picker pattern
  // first built and user-tested in AmendmentModal.tsx (see that
  // file's own "FR feedback #3" / "per feedback" comments), rather
  // than inventing structured name-part fields or leaving this a
  // plain free-text input. When a real physician is picked,
  // selectedProvider carries the full, real record directly — no
  // resolveProviderName call is needed at submission, since there's
  // no ambiguity left once a real record is chosen. Falls back to the
  // existing resolveProviderName(string, ...) path, unchanged, when
  // no real match exists (a genuinely new/outside physician).
  const [providerQuery, setProviderQuery] = useState('');
  const [filteredProviders, setFilteredProviders] = useState<Physician[]>([]);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Physician | undefined>(undefined);

  useEffect(() => {
    if (!showProviderDropdown) return;
    const handle = setTimeout(() => {
      physicianService.search(providerQuery).then(res => {
        if (res.ok) setFilteredProviders(res.data);
      }).catch(() => setFilteredProviders([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [providerQuery, showProviderDropdown]);

  const [clientId, setClientId] = useState('');

  useEffect(() => {
    // Real, per direct guidance (per-facility Specimen Deficiencies):
    // a deficiency type can be scoped to one performing lab
    // (DeficiencyType.performingLabFacilityId, same Global/scoped
    // convention as Container Types/Delegation Types) — resolved from
    // this case's own ordering facility (clientId), never a direct
    // field read, same as Case Routing's own resolveCasePerformingLab.
    // Re-resolves whenever clientId changes, since the accessioner may
    // pick the facility after this page has already loaded. Cancelled
    // on a fast clientId change so a slow, stale resolution can never
    // overwrite a newer one.
    let cancelled = false;
    (async () => {
      const typesRes = await deficiencyTypeService.getAll();
      if (!typesRes.ok || cancelled) return;
      let performingLabFacilityId: string | undefined;
      if (clientId) {
        const facilityRes = await mockFacilityService.getById(clientId);
        if (facilityRes.ok) performingLabFacilityId = resolvePerformingLabFacilityId(facilityRes.data);
      }
      if (!cancelled) {
        setDeficiencyTypes(typesRes.data.filter(dt => !dt.performingLabFacilityId || dt.performingLabFacilityId === performingLabFacilityId));
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Real feature, per direct confirmation: "add the Client and
  // Location as fields to be seen in the accession page." Facility-
  // scoped — repopulated below whenever clientId changes, and reset
  // to '' if the newly-selected facility doesn't have this location.
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [icd10Codes, setIcd10Codes] = useState<Icd10Code[]>([]);
  // General accessioning note — distinct from Clinical Indication (the
  // clinical reason, feeds Grossing Route AI). This is a whole-case
  // note, same reasoning as the specimen-level Comment field, just at
  // case scope — e.g. "STAT per phone call with Dr. Smith."
  const [caseComments, setCaseComments] = useState<CaseComment[]>([]);
  const addCaseComment = (text: string) => {
    setCaseComments(prev => [...prev, {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorId: user?.id ?? 'unknown',
      authorName: user?.name ?? 'Unknown User',
      text,
      createdAt: new Date().toISOString(),
      // Anything typed through PathScribe's own composer is, by
      // definition, PathScribe-originated — this isn't a user choice.
      origin: 'pathscribe',
      syncStatus: 'pending',
    }]);
  };
  const [assignedTo, setAssignedTo] = useState('');

  // Default "assign to" to the logged-in user if they're a pathologist —
  // most accessions in practice are logged by/for the pathologist on call.
  useEffect(() => {
    if (user?.role === 'pathologist' || user?.role === 'pathologist-admin' || user?.role === 'superadmin') {
      setAssignedTo(prev => prev || user.id);
    }
  }, [user]);

  // ── Specimens ────────────────────────────────────────────────────────────
  const { dictionary } = useSpecimenDictionary();
  const [specimens, setSpecimens] = useState<SpecimenDraft[]>([emptySpecimen('A')]);
  // Real fix (PS-297) — scroll a newly-added specimen row into view;
  // see addSpecimen's own comment below for the full reasoning.
  // lastSpecimenRowRef always points at whichever row is currently
  // last (re-assigned via the map's own ref callback each render);
  // justAddedSpecimenRef is a plain ref (not state) specifically so
  // setting it never triggers its own extra re-render — it only needs
  // to survive from the click handler to the effect that runs right
  // after specimens actually re-renders with the new row mounted.
  const lastSpecimenRowRef = useRef<HTMLDivElement | null>(null);
  const justAddedSpecimenRef = useRef(false);
  useEffect(() => {
    if (justAddedSpecimenRef.current) {
      justAddedSpecimenRef.current = false;
      lastSpecimenRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [specimens.length]);
  // Real, per direct guidance's own confirmed integration — the same
  // real form state/validation/build functions
  // components/Autopsy/AutopsyIntakeForm.tsx already used as a
  // standalone form, now driving a real, conditional section of this
  // page instead (per direct guidance's own "should these additional
  // fields become visible when an autopsy specimen has been picked").
  const [autopsyForm, setAutopsyForm] = useState<AutopsyIntakeFormState>({
    jurisdiction: '', caseAuthority: '', authorityType: '', authorityName: '',
    verbalOrderReceivedAt: '', verbalOrderReceivedFrom: '',
    consentingRelativeName: '', consentingRelativeRelationship: '',
  });
  // Real, per direct guidance's own confirmed generalization: both
  // checks now key off the real, closed, dictionary-level
  // specimenCategory (specimenDictionary/specimenTypes.ts) via the
  // one, real, shared resolveSpecimenEntryMatchesCategory.ts —
  // never free-text type/name matching. A real customer can name
  // either dictionary entry anything, in any real language.
  const cytologyRelevant = specimens.some(s => {
    const entry = s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId) : undefined;
    return resolveSpecimenEntryMatchesCategory(entry, ['GYN_CYTOLOGY', 'NON_GYN_CYTOLOGY']);
  });

  const autopsyRelevant = specimens.some(s => {
    const entry = s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId) : undefined;
    return resolveSpecimenEntryMatchesCategory(entry, ['AUTOPSY']);
  });
  const autopsyFormValidation = resolveAutopsyIntakeFormValidation(autopsyForm);

  const addSpecimen = () => {
    setSpecimens(prev => [...prev, emptySpecimen(getSpecimenLabel(prev.length, selectedFacility?.specimenLabelStyle))]);
    // Real fix (PS-297 — "adding a specimen doesn't auto-scroll... the
    // whole panel is [not] visible"): the new row is appended to the
    // BOTTOM of a list that's already taller than the viewport on any
    // real multi-specimen case, so it rendered entirely off-screen
    // with nothing on screen changing — confirmed the likely real
    // cause of this same ticket's other complaint too ("must fill in
    // Specimen A before adding a second"): nothing here has ever
    // actually required that (addSpecimen has no such gate), it just
    // LOOKED that way when the newly-added Specimen B was invisible
    // below the fold and the still-visible, still-incomplete Specimen
    // A was the only thing on screen. Flagged for scroll-into-view
    // below, once the new row has actually mounted.
    justAddedSpecimenRef.current = true;
  };
  const removeSpecimen = (idx: number) => {
    setSpecimens(prev =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, label: getSpecimenLabel(i, selectedFacility?.specimenLabelStyle) }))
    );
  };
  const updateSpecimen = (idx: number, description: string) => {
    setSpecimens(prev => prev.map((s, i) => (i === idx ? { ...s, description } : s)));
  };
  const addSpecimenComment = (idx: number, text: string) => {
    const newComment: CaseComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorId: user?.id ?? 'unknown',
      authorName: user?.name ?? 'Unknown User',
      text,
      createdAt: new Date().toISOString(),
      origin: 'pathscribe',
      syncStatus: 'pending',
    };
    setSpecimens(prev => prev.map((s, i) => (i === idx ? { ...s, comments: [...s.comments, newComment] } : s)));
  };
  const updateSpecimenField = <K extends keyof SpecimenDraft>(idx: number, field: K, value: SpecimenDraft[K]) => {
    setSpecimens(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      // Real feature, per direct follow-up: once the accessioner
      // manually edits laterality, it's no longer a "suggestion" —
      // clear the badge, matching the Synoptic report's own AI badges'
      // real "overridden" behavior (never show a stale suggestion
      // badge next to a value the user just typed themselves).
      const clearsSuggestion = field === 'laterality' && s.lateralityInferred;
      return { ...s, [field]: value, ...(clearsSuggestion ? { lateralityInferred: false } : {}) };
    }));
  };

  // Real feature, per direct follow-up: "Accessioning isn't wired to
  // the foreign-ID collision check." Same real, on-blur pattern as
  // SpecimenEditModal.tsx/BlockStainEditorModal.tsx's own identical
  // fields — checked keyed by draft index (idx), not a real record id,
  // since a draft specimen genuinely has none yet; nothing to exclude
  // via findForeignIdCollision's own excludeRecordId, since this can
  // never collide with "itself" the way editing an existing record can.
  const [specimenForeignIdCollisions, setSpecimenForeignIdCollisions] = useState<Record<number, ForeignIdCollision | WithinDraftForeignIdCollision | null>>({});

  const checkSpecimenForeignIdCollision = async (idx: number) => {
    const s = specimens[idx];
    if (!s.externalId.trim() || !s.externalIdSource.trim()) {
      setSpecimenForeignIdCollisions(prev => ({ ...prev, [idx]: null }));
      return;
    }
    // Real fix, per direct reminder: "no business logic in the UI
    // code." The within-draft collision check itself now lives in
    // utils/foreignIdCollision.ts — this component only calls it and
    // handles the UI-level result.
    const withinDraftMatch = findWithinDraftForeignIdCollision(specimens, idx);
    if (withinDraftMatch) {
      setSpecimenForeignIdCollisions(prev => ({ ...prev, [idx]: withinDraftMatch }));
      return;
    }
    const result = await findForeignIdCollision(s.externalIdSource, s.externalId, undefined);
    setSpecimenForeignIdCollisions(prev => ({ ...prev, [idx]: result }));
  };

  // Applying a dictionary entry pre-fills Description from the entry
  // (editable afterward) — same mapping SpecimenEditModal.tsx uses
  // elsewhere in the app. Name stays locked to the entry once picked;
  // switching back to "— Custom specimen —" clears it for manual entry.
  // Either path also resolves a pending needsDictionaryResolution flag —
  // picking a real entry is itself the resolution.
  const applyDictionaryEntry = (idx: number, entryId: string) => {
    if (!entryId) {
      setSpecimens(prev => prev.map((s, i) => (i === idx ? { ...s, dictionaryEntryId: '' } : s)));
      return;
    }
    const entry = dictionary.find(e => e.id === entryId);
    if (!entry) return;
    setSpecimens(prev => prev.map((s, i) => (i === idx
      ? {
          ...s, dictionaryEntryId: entryId, description: entry.normalizedLabel || entry.name,
          needsDictionaryResolution: false,
          resolutionTypeId: s.unmatchedOrderText ? 'res-matched-existing' : s.resolutionTypeId,
          // Pre-filled from the dictionary entry, not locked — the
          // requisition may state these more precisely, and the
          // accessioner can always override.
          anatomicSite: entry.site ?? s.anatomicSite,
          laterality: entry.laterality ?? s.laterality,
        }
      : s)));
  };

  // Explicit resolution path for a specimen-requisition-style deficiency:
  // the accessioner has looked at the order text and the dictionary and
  // confirmed there genuinely is no match — not the system guessing that
  // for them. Distinct action from just leaving the picker on "Custom",
  // so there's a real record of a deliberate decision rather than an
  // unresolved flag just quietly not being checked.
  const confirmCustomSpecimen = (idx: number) => {
    setSpecimens(prev => prev.map((s, i) => (i === idx
      ? { ...s, needsDictionaryResolution: false, resolutionTypeId: 'res-confirmed-custom' }
      : s)));
  };

  // Which specimen row's dictionary picker modal is currently open, if any.
  const [pickerOpenForIdx, setPickerOpenForIdx] = useState<number | null>(null);
  const [caseCommentModalOpen, setCaseCommentModalOpen] = useState(false);
  const [specimenCommentOpenForIdx, setSpecimenCommentOpenForIdx] = useState<number | null>(null);

  // ── Import from Order ───────────────────────────────────────────────────
  const [sourceOrderId, setSourceOrderId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');

  // Real feature, per direct, detailed specification: "Barcode Listener &
  // Form Auto-Ingestion." An earlier, simpler version of this listener
  // lived here — it only dumped a scan's raw text into orderSearch (this
  // page's own inline "Import From Order" box) for that box's plain
  // substring search to maybe pick up. Removed: the real
  // handleScannedPayload listener below fully supersedes it — real GS1/
  // delimited/plain parsing, exact-match resolution (not loose substring
  // matching), direct form auto-fill for a genuinely new external
  // requisition, and a proper fallback modal — and keeping both produced
  // real, confusing UX: the old one would still dump an unparsed raw GS1
  // string into the inline box, which then honestly (but misleadingly)
  // reported "No pending orders match" directly beside a form the new
  // listener had already correctly, successfully populated.

  // ── Action Registry (voice commands + keyboard shortcuts) ──────────────────
  // This page previously had zero integration with the Action Registry —
  // confirmed by checking for any reference to it anywhere in this file —
  // despite Worklist, the Synoptic editor, Search, and Messages all having
  // substantial voice/shortcut coverage. NEXT_TAB/PREVIOUS_TAB already
  // exist as live, globally-eligible actions (NAVIGATION is a
  // GLOBAL_CATEGORIES member) and were already firing everywhere,
  // including here — nothing was listening. ADD_SPECIMEN and
  // SUBMIT_ACCESSION reuse internalKeys (specimen.add, case.create) that
  // were reserved in systemActions.ts but never wired to a live action
  // until this pass.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.ACCESSION);
    return () => { mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, []);

  useEffect(() => {
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      switch (actionId) {
        case 'NEXT_TAB':
          setTab(prev => prev === 'case' ? 'specimens' : prev);
          break;
        case 'PREVIOUS_TAB':
          setTab(prev => prev === 'specimens' ? 'case' : prev);
          break;
        case 'ADD_SPECIMEN':
          setTab('specimens');
          addSpecimen();
          break;
        case 'SUBMIT_ACCESSION':
          // Deliberately does NOT call handleSubmit() directly — a
          // misheard voice command should never be able to finalize an
          // accession outright. Navigates to the Specimens tab, where
          // Submit now lives (no separate Review tab as of this pass),
          // so the pathologist/accessioner still has to look and click
          // Submit themselves.
          setTab('specimens');
          break;
        case 'ACCESSION_IMPORT_ORDER':
          setTab('case');
          break;
        case 'ACCESSION_CASE_COMMENT':
          setCaseCommentModalOpen(true);
          break;
        // Real, per direct guidance ("Check the actions ts as that is
        // where we are wiring keyboard shortcuts") — the six real
        // category-jump actions dispatch here, the same real switch
        // every other accession action already goes through, rather
        // than a separate, local keydown listener. Also switches to
        // the Clinical History sub-tab, since the shortcut should work
        // even when the accessioner is currently on Patient Detail.
        case 'CLINHIST_CATEGORY_1': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'SCR', nonce: (prev?.nonce ?? 0) + 1 })); break;
        case 'CLINHIST_CATEGORY_2': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'SYM', nonce: (prev?.nonce ?? 0) + 1 })); break;
        case 'CLINHIST_CATEGORY_3': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'RAD_LAB', nonce: (prev?.nonce ?? 0) + 1 })); break;
        case 'CLINHIST_CATEGORY_4': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'PRIOR_PATH', nonce: (prev?.nonce ?? 0) + 1 })); break;
        case 'CLINHIST_CATEGORY_5': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'MAL_STAGE', nonce: (prev?.nonce ?? 0) + 1 })); break;
        case 'CLINHIST_CATEGORY_6': setAccessionTab('clinical_history'); setRequestedClinicalHistoryCategory(prev => ({ category: 'HIGH_RISK', nonce: (prev?.nonce ?? 0) + 1 })); break;
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real, honest justification: addSpecimen reads selectedFacility, which is defined later in this file (const selectedFacility = useMemo(...) below) - wrapping addSpecimen in useCallback here hits a real TypeScript TS2448 compile error (block-scoped variable used before its declaration), confirmed directly. Moving declarations around is a real reordering operation in a large file, deserving its own careful, isolated pass, not a rushed change bundled into this lint sweep. Known, real limitation left honestly flagged: a stale addSpecimen closure could use an outdated selectedFacility if the user switches facilities, then uses the ADD_SPECIMEN voice command, before this effect happens to re-run for another reason.
  }, []);

  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    // Empty search shows nothing, not the full pending queue — with
    // hundreds of orders in a real deployment, listing them all by
    // default would be unusable. A minimum of 2 characters avoids
    // firing a near-full-list match on a single keystroke.
    if (q.length < 2) return [];
    const qIdNormalized = normalizeIdForSearch(q);
    return pendingOrders.filter(o =>
      o.externalOrderNumber.toLowerCase().includes(q) ||
      `${o.patient.firstName} ${o.patient.lastName}`.toLowerCase().includes(q) ||
      // Real fix, per direct follow-up: "Scotland and Ireland have
      // different formats for their NHS number, would we do the same
      // approach there?" Not the same mechanism as the DOB fix below —
      // NHS Number/CHI Number/H&C Number/PPS Number aren't different
      // interpretations of the same value the way a date's day/month
      // order is; they're structurally different national ID schemes,
      // and a given patient has exactly one real ID under exactly one
      // real scheme. What genuinely is comparable: formatting, not
      // interpretation. NHS Number's own conventional display groups
      // digits with spaces ("999 999 9999"), and this app's own
      // PATIENT_ID_BY_JURISDICTION validation pattern for it already
      // treats spaces and dashes as optional, interchangeable
      // separators — so a stored value without them shouldn't fail to
      // match an accessioner typing the number the way it's
      // conventionally printed, or vice versa. Safe unlike date
      // reinterpretation: stripping spaces/dashes can only recover a
      // real match formatting hid, never introduce a false one — see
      // normalizeIdForSearch.ts's own header comment for the full
      // reasoning.
      normalizeIdForSearch(o.patient.mrn).includes(qIdNormalized) ||
      o.externalAssigningAuthority.toLowerCase().includes(q) ||
      // Real fix, per direct follow-up: "if you don't have a case, how
      // do you know the client?" — correctly caught that config.jurisdiction
      // is a single, system-wide guess, and this search runs precisely
      // when the client isn't known yet (finding it is often the point).
      // A lab that only ever deals with one jurisdiction never notices;
      // one that receives orders from both a US and a UK client through
      // the same instance could have the system's single default be
      // wrong for whichever client isn't it — silently hiding or
      // matching the wrong patient in exactly the feature meant to
      // prevent that.
      //
      // Real fix: don't guess which interpretation to use for MATCHING
      // at all — check both. patient.dateOfBirth is compared against
      // the query formatted as MM/DD/YYYY *and* as DD/MM/YYYY;
      // whichever the accessioner actually typed, it matches. If a
      // date-shaped query happens to be a genuine, real exact match
      // under both interpretations for two different real patients
      // (e.g. one born 3 April, another genuinely born 4 March, same
      // year), that's real, existing ambiguity — the existing ">1 exact
      // match" trigger surfaces it to the lookup modal for a human to
      // resolve, same as any other genuine ambiguity this feature
      // already handles, rather than the system silently guessing.
      // searchDobFormat itself is now display-only (placeholder text,
      // grid column headers) — no longer load-bearing for correctness.
      //
      // Real, later extension, per direct follow-up naming S. Korea
      // specifically: dobIncludesQuery also checks year-first formats
      // (dash and dot separated) — see isoDateForSearch.ts's own header
      // comment for why day/month permutation alone doesn't cover a
      // genuinely different, year-first convention.
      dobIncludesQuery(o.patient.dateOfBirth, q)
    );
  }, [pendingOrders, orderSearch]);

  // Real feature, per direct specification: "0 exact matches" is the
  // trigger condition distinct from "no matches at all" — a search
  // returning several loose, partial matches but nothing that's
  // actually the record being looked for still counts as needing the
  // richer lookup modal, not just quietly sitting with an inline list
  // that has no clearly-right answer in it. An exact match is the
  // trimmed query equaling — not just containing — the order number,
  // MRN (space/dash-normalized — see filteredOrders' own comment
  // above), full patient name, or formatted DOB of a real result
  // (checked under every supported date format — see filteredOrders'
  // own comment above for why none is assumed).
  const isExactOrderMatch = useCallback((o: IncomingOrder, q: string): boolean => {
    const needle = q.trim().toLowerCase();
    if (!needle) return false;
    return (
      o.externalOrderNumber.toLowerCase() === needle ||
      normalizeIdForSearch(o.patient.mrn) === normalizeIdForSearch(needle) ||
      `${o.patient.firstName} ${o.patient.lastName}`.toLowerCase() === needle ||
      dobExactlyMatches(o.patient.dateOfBirth, needle)
    );
  }, []);

  // Real feature, per direct specification: "Order Lookup & Patient
  // Verification" modal — real ambiguity (too many candidates to
  // scan inline) and real absence (nothing confidently right in what
  // did come back) both route here rather than leaving the accessioner
  // stuck with an inline list that's either overwhelming or silently
  // unhelpful. `orderLookupInitialQuery` seeds the modal's own search
  // box with whatever was already typed here — including empty, for
  // the explicit "Advanced Search" link, which always opens regardless
  // of the omnibox's current contents.
  const [orderLookupModalOpen, setOrderLookupModalOpen] = useState(false);
  const [orderLookupInitialQuery, setOrderLookupInitialQuery] = useState('');

  const openOrderLookupModal = useCallback((initialQuery: string) => {
    setOrderLookupInitialQuery(initialQuery);
    setOrderLookupModalOpen(true);
  }, []);

  // Shared by both the Enter key and the search-icon click — same
  // real trigger condition either way, per the direct specification:
  // more than 3 matches (too many to scan in the small inline list),
  // or zero exact matches among whatever partial matches did come back
  // (nothing confidently right in what's showing). 1–3 matches with at
  // least one exact hit stays exactly as it already worked — the
  // existing inline list is genuinely sufficient there, and opening a
  // modal on top of an already-clear answer would be a net cost, not
  // a real safety or scale improvement.
  const runOrderSearchTrigger = useCallback(() => {
    const q = orderSearch.trim();
    // Same minimum-length floor the inline list itself already uses —
    // a single accidental keystroke plus Enter shouldn't pop open a
    // full modal.
    if (q.length < 2) return;
    const hasExactMatch = filteredOrders.some(o => isExactOrderMatch(o, q));
    if (filteredOrders.length > 3 || !hasExactMatch) {
      openOrderLookupModal(q);
    }
  }, [orderSearch, filteredOrders, isExactOrderMatch, openOrderLookupModal]);

  const handleOrderSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runOrderSearchTrigger();
    }
  }, [runOrderSearchTrigger]);

  const handleOrderSearchIconClick = useCallback(() => {
    runOrderSearchTrigger();
  }, [runOrderSearchTrigger]);

  // True if the accessioner has already typed something meaningful into
  // the form — used to decide whether picking an order needs a warning
  // first. Deliberately not gating on every field (e.g. priority/sex
  // defaults don't count as "unsaved work").
  //
  // Real, direct fix, per direct follow-up ("take a look at the dirty
  // flag logic"): confirmed this list was never updated when the
  // Structured Clinical History Dictionary work added lmp,
  // hormonalStatus, priorHpvResult, iudOrContraceptionUse,
  // clinicalHistoryEntries, and per-specimen clinicalHistory — an
  // accessioner who filled in only those fields and nothing else would
  // have gotten zero unsaved-changes warning on navigating away or
  // closing the tab, silently losing real, entered clinical data. This
  // is exactly the kind of manually-maintained list a centralized
  // Required Fields registry (see the newly-filed Jira ticket) would
  // make structurally safer — a field newly wired into that registry
  // could feed this check automatically instead of relying on every
  // future page author remembering to update this array by hand.
  const hasUnsavedProgress = () =>
    givenNames.trim() || familyNames.trim() || dob || mrn.trim() ||
    clinicalIndication.trim() || caseComments.length > 0 || specimens.some(s => s.description.trim() || s.clinicalHistory.length > 0) ||
    lmp || hormonalStatus || priorHpvResult || iudOrContraceptionUse.trim() || clinicalHistoryEntries.length > 0;

  // Real, confirmed gap: this page had no connection at all to the
  // app's shared unsaved-changes warning system (DirtyStateContext) —
  // navigating away via any in-app link, or closing/refreshing the
  // tab, silently discarded whatever had been entered, with zero
  // warning. Wired up the same way SynopticReportPage.tsx does,
  // reusing the exact "meaningful progress" check hasUnsavedProgress()
  // above already defines, rather than a separate/duplicate notion of
  // dirty.
  const { setDirty, pendingPath, confirmNavigate, cancelNavigate } = useDirtyState();
  useEffect(() => {
    setDirty(!!hasUnsavedProgress());
    // Clear on unmount so a stale dirty flag doesn't leak into
    // whatever page the user navigates to next.
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenNames, familyNames, dob, mrn, clinicalIndication, caseComments, specimens, lmp, hormonalStatus, priorHpvResult, iudOrContraceptionUse, clinicalHistoryEntries]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedProgress()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenNames, familyNames, dob, mrn, clinicalIndication, caseComments, specimens]);

  // Real fix: was window.confirm() — replaced with the shared
  // ConfirmModal. Split into doImportOrder (the real 80-line import
  // logic, unchanged) plus a thin handleImportOrder entry point that
  // either calls it directly or, when there's real unsaved progress to
  // lose, opens the modal first — see pendingImportOrderId/
  // confirmImportOrder below.
  async function doImportOrder(orderId: string) {
    setImporting(true);
    try {
      const res = await orderIntakeService.resolveOrder(orderId);
      if (res.ok === false) { const errMsg: string = res.error; toast.error(t('accessionPage.toast.resolveOrderFailed', { error: errMsg })); return; }
      const { order, warnings } = res.data;

      // IncomingOrder.patient is still the simpler {firstName,lastName}
      // shape (the order-intake source data doesn't carry prefix/
      // preferred/suffix) — mapped into givenNames/familyNames, the
      // accessioner can add prefix/preferred/suffix manually if needed.
      setNamePrefix('');
      setGivenNames(order.patient.firstName);
      setFamilyNames(order.patient.lastName);
      setPreferredName('');
      setNameSuffix('');
      setDob(order.patient.dateOfBirth ?? '');
      setSex(order.patient.sex ?? 'U');
      setMrn(order.patient.mrn ?? '');
      setEncounterNumber(order.encounterNumber ?? '');
      setPriority(order.priority ?? 'Routine');
      setRequestingProvider(order.requestingProvider.rawName);
      // Real, per PS-81 (Jira): order is already-resolved (from
      // resolveOrder()) at this point — when requestingProviderPhysicianId
      // is real and populated, fetch that EXACT matched Physician
      // record directly, rather than re-searching by name (which could
      // theoretically surface a different, ambiguous match). Real,
      // honest fallback: undefined when resolution didn't find a real
      // match — the field just shows the raw text, same as before.
      setSelectedProvider(undefined);
      if (order.requestingProviderPhysicianId) {
        physicianService.getById(order.requestingProviderPhysicianId).then(res => {
          if (res.ok) setSelectedProvider(res.data);
        }).catch(() => {});
      }
      setClinicalIndication(order.clinicalIndication ?? '');
      setIcd10Codes(order.icd10Codes ?? []);
      if (order.facilityId) setClientId(order.facilityId);

      // Real feature, per direct confirmation: "I assume that the
      // location will download from the select patient encounter,
      // once the order or patient is selected." Real feature, per
      // direct, detailed specification: "Encounter Selector &
      // Auto-Fill" — extends what was previously a location-only
      // lookup to the same full applyEncounterToForm (Facility,
      // Location, Provider) the known-patient-selection path below
      // uses, and applies the same real Safety Safeguards (Section
      // "Strict Matching & Active Status Constraints" — see
      // isEncounterActive's own doc comment) rather than
      // unconditionally trusting order.encounterNumber's target: an
      // order referencing a genuinely stale/discharged/historical
      // encounter must not silently populate today's form with
      // outdated facility/location/provider data. No dropdown needed
      // here specifically — order.encounterNumber already names one
      // specific real encounter, never an ambiguous set to choose
      // among the way a bare patient selection can be.
      if (order.encounterNumber) {
        const orgId = user?.organisationId ?? originHospitalId;
        const encounterRes = await mockEncounterService.getByEncounterNumber(orgId, order.encounterNumber);
        if (encounterRes.ok && encounterRes.data && isEncounterActive(encounterRes.data, Date.now())) {
          applyEncounterToForm(encounterRes.data);
          toast.success(t('accessionPage.encounter.autoFilled', { number: encounterRes.data.encounterNumber }) + (encounterRes.data.ward ? ` (${encounterRes.data.ward})` : ''));
        }
      }

      const departmentsModule = await import('@/services/departments/mockDepartmentService');
      const catsRes = await departmentsModule.mockDepartmentService.getAll();
      const catNameById = new Map((catsRes.ok ? catsRes.data : []).map(c => [c.id, c.name]));

      // Exact match only against the Specimen Dictionary — no AI/fuzzy
      // matching. A near-miss ("R breast core bx" vs "Right breast core
      // needle biopsy") doesn't get guessed at; it becomes a
      // needsDictionaryResolution flag the accessioner resolves directly,
      // same reasoning as this field's own doc comment above.
      const activeDictionary = dictionary.filter(e => e.active);
      let unresolvedCount = 0;
      const importedFacilityStyle = facilities.find(c => c.id === order.facilityId)?.specimenLabelStyle;

      setSpecimens(order.specimens.map((sp, i) => {
        // Prefer the dictionaryEntryId resolveOrder() already resolved
        // (crosswalk hit, or findOrCreateByName's fallback) over re-doing
        // a separate text match here — this respects whatever the
        // backend actually resolved rather than risking a second pass
        // that disagrees with it (e.g. a crosswalk-matched entry whose
        // name doesn't happen to exactly match the raw description text).
        const resolvedEntry = sp.dictionaryEntryId ? activeDictionary.find(e => e.id === sp.dictionaryEntryId) : undefined;
        const exactMatch = resolvedEntry ?? activeDictionary.find(
          e => e.name.trim().toLowerCase() === sp.description.trim().toLowerCase()
            || (e.normalizedLabel ?? '').trim().toLowerCase() === sp.description.trim().toLowerCase()
        );
        if (!exactMatch) unresolvedCount++;
        // Real fix, per direct report: laterality was never populated
        // from the order at all, even when the description clearly
        // implied it ("Left forearm skin excision..."). Inferred from
        // the real, original order text (before any dictionary
        // normalization) — see inferLateralityFromText.ts's own header
        // for the deliberate safety rule (never guesses when the text
        // implies more than one side). Fully editable afterward, same
        // as every other imported field — this is a convenience
        // default, not a locked value. lateralityInferred tracks
        // whether a real, non-empty value was actually inferred (not
        // just "was this field imported") — feeds the new "Suggested"
        // badge, per direct follow-up.
        const inferredLaterality = inferLateralityFromText(sp.description);
        // Real, per direct guidance's own confirmed two-tier
        // specimen-to-organ mapping strategy (Tier 2: Fallback
        // Classifier) — this import-from-order path is exactly the
        // real "legacy/unmapped free-text specimen" scenario that
        // tier was built for. A real, best-effort suggestion only —
        // the accessioner sees it pre-checked in the organ picker
        // built above and can freely add/remove before submit, same
        // as every other imported-but-editable field here.
        const suggestedOrganCodes = resolveSpecimenEntryMatchesCategory(exactMatch, ['AUTOPSY'])
          ? classifyAutopsyOrganCodeFromSiteText(sp.description)
          : [];
        return {
          ...emptySpecimen(getSpecimenLabel(i, importedFacilityStyle)),
          dictionaryEntryId: exactMatch?.id ?? '',
          description: exactMatch ? (exactMatch.normalizedLabel || exactMatch.name) : sp.description,
          laterality: inferredLaterality,
          lateralityInferred: inferredLaterality !== '',
          organCodes: suggestedOrganCodes.length > 0 ? suggestedOrganCodes : undefined,
          resolvedDepartmentName: sp.departmentId ? catNameById.get(sp.departmentId) : undefined,
          departmentWasAutoCreated: sp.departmentWasAutoCreated,
          dictionaryEntryWasAutoCreated: sp.dictionaryEntryWasAutoCreated,
          needsDictionaryResolution: !exactMatch,
          unmatchedOrderText: exactMatch ? undefined : sp.description,
        };
      }));

      if (unresolvedCount > 0) {
        toast.warning(t('accessionPage.toast.unresolvedSpecimens', { count: unresolvedCount }));
      }

      setSourceOrderId(order.id);
      setImportWarnings(warnings);
      if (warnings.length > 0) {
        toast.warning(t('accessionPage.toast.importedWithFollowUp', { orderNumber: order.externalOrderNumber, count: warnings.length }));
      } else if (unresolvedCount === 0) {
        toast.success(t('accessionPage.toast.importedCleanly', { orderNumber: order.externalOrderNumber }));
      }
    } catch (e) {
      toast.error(t('accessionPage.toast.importFailed', { message: (e as Error)?.message ?? 'unknown error' }));
    } finally {
      setImporting(false);
    }
  }

  const [pendingImportOrderId, setPendingImportOrderId] = useState<string | null>(null);

  function handleImportOrder(orderId: string) {
    if (!orderId) return;
    if (hasUnsavedProgress() && sourceOrderId !== orderId) {
      setPendingImportOrderId(orderId);
      return;
    }
    void doImportOrder(orderId);
  }

  function confirmImportOrder() {
    if (!pendingImportOrderId) return;
    const orderId = pendingImportOrderId;
    setPendingImportOrderId(null);
    void doImportOrder(orderId);
  }

  // isEncounterActive extracted to src/utils/isEncounterActive.ts — see
  // that file's own header comment for the full safety reasoning
  // (real, unit-tested there rather than living untested here).


  // Real feature, per direct specification's own Auto-Fill Data
  // Mapping table — with one real, deliberate deviation: the table
  // also lists Clinical Indication (encounter.clinicalNotes/
  // orderReason) and ICD-10 Diagnosis Codes (encounter.diagnosisCodes)
  // as encounter-sourced fields. Neither exists on the real Encounter
  // type (services/encounters/IEncounterService.ts) — confirmed
  // directly, not an oversight to fix by inventing new fields. A real
  // Encounter models PV1 (visit/ADT) data — facility, location,
  // attending provider, class, status; clinical indication and
  // diagnosis codes are real OBR/DG1 (order-level) concepts, and this
  // app already, correctly, sources both from the order itself
  // (order.clinicalIndication/order.icd10Codes in doImportOrder,
  // above) rather than the encounter. Left genuinely alone here,
  // rather than silently populated from a field that doesn't
  // represent what the spec's table assumed it would. Patient
  // Demographics (the table's other encounter-sourced row) needs no
  // new code either — both real trigger points below (order import,
  // known-patient selection) already populate demographics before
  // this function ever runs.
  //
  // facilityId resolution: Encounter.facility is a real, raw string
  // (the sending facility/PV1 data as the inbound message actually
  // said it — see that field's own doc comment), not a resolved
  // Facility id the way order.facilityId already is. Matched
  // here against the same real assigningAuthority/name fields
  // doImportOrder's own client resolution already trusts, rather than
  // assuming Encounter.facility happens to already be a valid id.
  function applyEncounterToForm(encounter: Encounter) {
    setLinkedEncounter(encounter);
    const matchedFacility = facilities.find(
      c => c.assigningAuthority === encounter.facility || c.name === encounter.facility
    );
    if (matchedFacility) setClientId(matchedFacility.id);
    if (encounter.locationId) setLocationId(encounter.locationId);
    if (encounter.attendingProvider) setRequestingProvider(encounter.attendingProvider);

    // Real feature, per direct, detailed correction: DG1 is its own,
    // dedicated segment, and Encounter.diagnoses (added specifically
    // to close that real gap — see src/services/encounters/
    // IEncounterService.ts's own doc comment) now genuinely can carry
    // real ICD-10 data. Still deliberately NOT the same concept as
    // Clinical Indication (a free-text reason for a specific specimen/
    // order — DG1-3.2 describes the diagnosis CODE itself, not why a
    // specimen was collected) or as order.icd10Codes (a more specific,
    // order-level real source this app already, correctly, sources
    // the form's ICD-10 field from). Purely additive: only fills the
    // form's ICD-10 field when it's genuinely still empty — an
    // encounter's own admission-time diagnosis should never silently
    // overwrite a more specific, already-present, order-sourced code.
    if (encounter.diagnoses && encounter.diagnoses.length > 0 && icd10Codes.length === 0) {
      setIcd10Codes(encounter.diagnoses.map(dx => ({ code: dx.code, description: dx.description ?? dx.code })));
    }
  }

  // Real feature, per direct specification: "Contextual Trigger" +
  // "Auto-Selection (Single Active Encounter)" + "Dropdown Selection
  // (Multiple Active Encounters)." The real orchestrator both trigger
  // points below (handleSelectExistingPatient, doImportOrder) call
  // once a real patientId is known. Genuinely two different outcomes,
  // not three — a real 0-candidates case and a real 1-candidate case
  // both need no dropdown, so they're handled together; only a real
  // 2-or-more-candidates case shows one.
  async function lookupActiveEncountersForPatient(patientId: string, patientLabel: string) {
    setEncounterLookupState('loading');
    setEncounterCandidates([]);
    const res = await mockEncounterService.listForPatient(patientId);
    const now = Date.now();
    const active = res.ok ? res.data.filter(e => isEncounterActive(e, now)) : [];
    setEncounterLookupState('done');
    if (active.length === 0) {
      return;
    }
    if (active.length === 1) {
      applyEncounterToForm(active[0]);
      toast.success(t('accessionPage.encounter.autoFilled', { number: active[0].encounterNumber }) + (active[0].ward ? ` (${active[0].ward})` : ''));
      return;
    }
    // Real feature, per direct specification: "Dropdown Selection
    // (Multiple Active Encounters)" — genuinely doesn't auto-apply
    // any of them; the accessioner picks via the selector rendered
    // below the omnibox (see encounterCandidates' own render site).
    setEncounterCandidates(active);
    toast.warning(<PhiToastMessage>{t('accessionPage.toast.activeEncountersFound', { count: active.length, patientLabel })}</PhiToastMessage>);
  }

  // Real feature, per direct specification: "Change / Unlink
  // Encounter" — clears the real link (so the confirmation badge/
  // dropdown both stop showing it as selected) without touching
  // whatever Facility/Location/Provider values are already sitting in
  // the form; the accessioner may have already started editing them,
  // and unlinking shouldn't blank out real, already-entered data.
  function handleUnlinkEncounter() {
    setLinkedEncounter(null);
    setEncounterCandidates([]);
  }

  // Real feature, per direct specification: "Re-selection Behavior" —
  // dynamically overwrites the previously-populated encounter fields
  // rather than prompting first; the dropdown selection is itself
  // already a deliberate, explicit accessioner action (unlike, say,
  // doImportOrder's own re-import case, which can silently discard
  // unrelated, unsaved manual edits and genuinely needs a confirm
  // step first).
  function handleSelectEncounterFromDropdown(encounter: Encounter | null) {
    if (encounter) {
      applyEncounterToForm(encounter);
    } else {
      // "Create without encounter link (Manual Entry)."
      setLinkedEncounter(null);
    }
    setEncounterCandidates([]);
  }

  // Real feature, per direct, detailed specification: "Barcode Listener &
  // Form Auto-Ingestion" — "4. Error/Ambiguity Handling." Real, tolerant
  // conversion for the delimited payload's own DOB field: this app's own
  // <input type="date"> needs real ISO (yyyy-mm-dd); a real scanned label
  // could carry either that or the real, common HL7-style YYYYMMDD. Genuinely
  // returns undefined (never a fabricated date) for anything else.
  function parseScannedDob(raw: string): string | undefined {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return undefined;
    const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
  }

  // Real feature, per direct, detailed specification: "Barcode Listener &
  // Form Auto-Ingestion" — the real orchestrator tying together "2. Parser
  // Logic," "3. Form Auto-Populate & Visual Feedback," and "4. Error/
  // Ambiguity Handling." Genuinely reuses this page's own, already-built
  // real infrastructure rather than duplicating it: handleImportOrder (the
  // spec's "Auto-fill complete record" for a real, matched Accession/
  // Order #), openOrderLookupModal (the spec's own "Open Search Fallback
  // Modal with the scanned string pre-populated"), and isExactOrderMatch
  // (the same real, exact-match discipline the omnibox search already
  // established — never a loose, ambiguous substring match for a scan,
  // which should resolve confidently or not at all).
  async function handleScannedPayload(raw: string) {
    // Real, preserved behavior from the earlier, simpler listener this
    // one supersedes: every field a scan can populate lives on the Case
    // & Patient tab, not Specimens — a scan should work regardless of
    // which tab happens to be open when it comes in, not just leave its
    // result invisible on a tab the accessioner isn't currently viewing.
    setTab('case');
    const parsed = parseScannedPayload(raw);

    // GS1 — real AI(21) SERIAL is this format's own "Serial/Accession"
    // mapping (see parseScannedPayload.ts's own header comment for why
    // AI(21), not a fabricated "MRN" AI that GS1 doesn't actually define).
    if (parsed.type === 'gs1') {
      const candidate = parsed.serial ?? parsed.additionalId;
      const match = candidate ? pendingOrders.find(o => isExactOrderMatch(o, candidate)) : undefined;
      if (match) {
        toast.success(<PhiToastMessage>{t('accessionPage.toast.scannedSpecimenLabel', { order: match.externalOrderNumber, patient: `${match.patient.firstName} ${match.patient.lastName}` })}</PhiToastMessage>);
        playScanBeep();
        await handleImportOrder(match.id);
        return;
      }
      openOrderLookupModal(candidate ?? raw);
      return;
    }

    // Delimited — real [FamilyName, GivenName, MRN, DOB, Accession].
    if (parsed.type === 'delimited') {
      const match = parsed.accession ? pendingOrders.find(o => isExactOrderMatch(o, parsed.accession!)) : undefined;
      if (match) {
        toast.success(<PhiToastMessage>{t('accessionPage.toast.scannedSpecimenLabel', { order: match.externalOrderNumber, patient: `${match.patient.firstName} ${match.patient.lastName}` })}</PhiToastMessage>);
        playScanBeep();
        await handleImportOrder(match.id);
        return;
      }
      // Real feature, per direct specification: "If the scanned barcode
      // is a new external requisition # → Auto-fill metadata from
      // payload and create new draft accession." This app's own form
      // already IS the draft accession the moment any field is
      // populated — there's no separate real "create" action needed;
      // populating it directly here is that real effect.
      const hasUsableData = parsed.familyName || parsed.givenName || parsed.mrn || parsed.dob;
      if (hasUsableData) {
        if (parsed.givenName) setGivenNames(parsed.givenName);
        if (parsed.familyName) setFamilyNames(parsed.familyName);
        if (parsed.mrn) setMrn(parsed.mrn);
        const dobIso = parsed.dob ? parseScannedDob(parsed.dob) : undefined;
        if (dobIso) setDob(dobIso);
        const label = [parsed.givenName, parsed.familyName].filter(Boolean).join(' ') || parsed.mrn || t('accessionPage.toast.newPatientFallback');
        toast.success(<PhiToastMessage>{t('accessionPage.toast.scannedSpecimenLabel', { order: parsed.accession ?? raw, patient: label })}</PhiToastMessage>);
        playScanBeep();
        return;
      }
      openOrderLookupModal(raw);
      return;
    }

    // Plain alphanumeric — real, exact query search across [Accession #,
    // Requisition #, Order #, MRN], per the spec's own fallback.
    const plainMatch = pendingOrders.find(o => isExactOrderMatch(o, parsed.value));
    if (plainMatch) {
      toast.success(<PhiToastMessage>{t('accessionPage.toast.scannedSpecimenLabel', { order: plainMatch.externalOrderNumber, patient: `${plainMatch.patient.firstName} ${plainMatch.patient.lastName}` })}</PhiToastMessage>);
      playScanBeep();
      await handleImportOrder(plainMatch.id);
      return;
    }
    // Real feature, per direct specification: "If scan fails to match →
    // Open Search Fallback Modal with the scanned string pre-populated
    // for manual resolution." Reuses the exact same modal/state this
    // page's own omnibox search already opens on ambiguity — a scan
    // that can't resolve confidently gets the identical, real fallback
    // a typed search would.
    openOrderLookupModal(parsed.value);
  }

  // Real feature, per direct, detailed specification: "1. Global / Smart
  // Focus Listener... If the user scans a label while focus is in the main
  // search bar, capture the input." The real, global keystroke-burst
  // detection already exists and works (ScannerProvider.tsx) — this page
  // doesn't duplicate that; it listens for the same real PATHSCRIBE_SCAN
  // event that provider already dispatches on every successful scan
  // anywhere in the app, and only acts on it while this page is mounted.
  // ScannerProvider.tsx's own auto-navigation is suppressed specifically
  // on this route (see that file's own comment) so this handler is the
  // real, sole consumer of a scan while accessioning is in progress.
  //
  // Real bug found and fixed while verifying this live: the listener
  // below is registered once (an empty dependency array — genuinely
  // correct, since re-adding/removing a global window listener on every
  // render would be real, unnecessary churn for a feature this
  // frequently exercised, unlike the narrower addSpecimen case this
  // file's own earlier effect accepts staleness for). But
  // handleScannedPayload itself is a plain, unmemoized function that
  // closes over pendingOrders/openOrderLookupModal/etc. fresh on every
  // render — calling the ORIGINAL closure captured at mount time meant
  // a scan matched against whatever pendingOrders looked like before it
  // had even finished its own async load, every single time, not just
  // once. `handleScannedPayloadRef` is kept current every render
  // (assigned directly during render, a real, standard React pattern
  // for exactly this "keep a stable, addressable handle on the latest
  // closure" need) so the one, stable listener below always invokes
  // today's real, current logic.
  const handleScannedPayloadRef = useRef(handleScannedPayload);
  handleScannedPayloadRef.current = handleScannedPayload;

  useEffect(() => {
    function onScan(e: Event) {
      const detail = (e as CustomEvent<{ raw: string }>).detail;
      if (!detail?.raw) return;
      void handleScannedPayloadRef.current(detail.raw);
    }
    window.addEventListener('PATHSCRIBE_SCAN', onScan);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', onScan);
  }, []);

  // Real feature, per direct specification: the "Order Lookup & Patient
  // Verification" modal's second real path — an existing, already-known
  // patient found via the real Master Patient Index (searchPatients()),
  // genuinely distinct from importing a pending LIS order. There may be
  // no pending order at all (a walk-in, a manually-accessioned specimen
  // for a patient this lab has already seen before) — this just confirms
  // identity and pre-fills demographics, without touching anything
  // order-specific (specimens, clinical indication, client, priority)
  // the way doImportOrder does, since none of that exists for a bare
  // patient-index match. MasterPatientRecord genuinely has no `sex`
  // field (confirmed directly against IPatientIndexService.ts) — left
  // untouched here rather than guessed at or defaulted.
  //
  // Real feature, per direct, detailed specification: "Encounter
  // Selector & Auto-Fill" — "Contextual Trigger... Upon selecting a
  // patient (via Order Import, MRN search, or manual patient query)."
  // A known-patient selection from the lookup modal already has a
  // real, resolved MPI patientId (patient.id — this record already
  // exists) — no separate resolution step needed the way a fresh
  // manual entry would (see this function's own real limitation, noted
  // in the Encounter service's consumer section of this file).
  function handleSelectExistingPatient(patient: MasterPatientRecord) {
    setNamePrefix('');
    setGivenNames(patient.firstName);
    setFamilyNames(patient.lastName);
    setPreferredName('');
    setNameSuffix('');
    setDob(patient.dateOfBirth ?? '');
    setMrn(patient.mrn ?? '');
    toast.success(<PhiToastMessage>{t('accessionPage.toast.loadedFromIndex', { patient: `${patient.firstName} ${patient.lastName}` })}</PhiToastMessage>);
    void lookupActiveEncountersForPatient(patient.id, `${patient.firstName} ${patient.lastName}`);
  }



  // ── Validation ───────────────────────────────────────────────────────────
  const caseInfoValid = givenNames.trim() && familyNames.trim() && dob && clientId && requestingProvider.trim();
  const specimensValid = specimens.length > 0
    && specimens.every(s => s.description.trim().length > 0 && !s.needsDictionaryResolution);
  // Real, filled-in specimen count — for display only (the Specimens tab
  // label). Raw specimens.length includes the empty placeholder row(s)
  // the form starts with/adds, which have no description yet and
  // wouldn't pass specimensValid above — showing that raw count as
  // "Specimens (1)" before the user has entered anything is misleading,
  // as if a real specimen were already recorded.
  const filledSpecimenCount = specimens.filter(s => s.description.trim().length > 0).length;

  // Real departments (Surgical/Non-GYN Cytology/Consultation) each
  // draw from their own accession series — see resolveCaseMaskScopeCandidates
  // and mockCaseMaskService. Per the CAP-adjacent labeling guideline and
  // real specimen-handling policy this whole feature was researched
  // against, specimens spanning genuinely different case types are
  // standard practice to accession as SEPARATE cases, not combine under
  // one number. Rather than building full automatic case-splitting (a
  // much bigger feature — grouping specimens, creating N cases, routing
  // blocks/grossing per case, a multi-case success screen), this blocks
  // submission with a clear, actionable message instead of silently
  // mislabeling specimens under the wrong prefix. Specimens with no
  // dictionary match (no resolved department) don't count toward a
  // conflict — only genuinely different resolved departments do.
  const resolvedDepartmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of specimens) {
      const entry = s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId) : undefined;
      if (entry?.departmentId) ids.add(entry.departmentId);
    }
    return ids;
  }, [specimens, dictionary]);
  const departmentConflictNames = useMemo(() => {
    if (resolvedDepartmentIds.size <= 1) return null;
    const names = [...resolvedDepartmentIds].map(id => departmentsById.get(id)?.name ?? id);
    return names;
  }, [resolvedDepartmentIds, departmentsById]);

  const canSubmit = !!caseInfoValid && specimensValid && !submitting && !departmentConflictNames && (!autopsyRelevant || autopsyFormValidation.valid);

  const selectedFacility = useMemo(() => facilities.find(c => c.id === clientId), [facilities, clientId]);

  // Real, per direct guidance (dynamic-behavior rule 1: "Selecting an
  // Outside Client automatically sets default billing preferences...
  // based on the client's master contract profile"): re-derives the
  // real default whenever the selected Client Account itself changes,
  // while intakeType is 'outside' — always overwritable afterward,
  // never locked; this only fires on an actual client change, not on
  // every render.
  useEffect(() => {
    if (intakeType !== 'outside') return;
    setOutsidePatientData(d => ({ ...d, accountBillingType: selectedFacility?.defaultAccountBillingType ?? d.accountBillingType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real,
    // deliberate: only re-derive on an actual client identity change
    // (clientId) or mode change (intakeType), not on every
    // selectedFacility object identity change from unrelated re-renders.
  }, [clientId, intakeType]);

  // Patient ID field label/format follows the selected client's
  // jurisdiction — NHS Number for a Fenwick case, CHI Number for
  // Ardgowan, MRN for a US client — rather than a fixed generic label.
  // Defaults to US/MRN when no client is selected yet (safe default,
  // matches the rest of the form before a client is picked).
  const patientIdStandard = PATIENT_ID_BY_JURISDICTION[selectedFacility?.jurisdiction ?? 'US'];

  // Real feature, per direct confirmation: "add the Client and
  // Location as fields to be seen in the accession page." Facility-
  // scoped — reloads whenever clientId changes. Resets locationId if
  // it doesn't belong to the newly-selected facility (e.g. the user
  // picked a location, then switched facilities) rather than silently
  // carrying over a location from a different facility.
  useEffect(() => {
    if (!clientId) { setLocations([]); setLocationId(''); return; }
    let cancelled = false;
    (async () => {
      const res = await locationService.listForFacility(clientId);
      if (cancelled) return;
      const list = res.ok ? res.data.filter(l => l.status !== 'Inactive') : [];
      setLocations(list);
      setLocationId(prev => (list.some(l => l.id === prev) ? prev : ''));
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const selectedLocation = useMemo(() => locations.find(l => l.id === locationId), [locations, locationId]);

  // ── ID generation ────────────────────────────────────────────────────────
  // TEMPORARY scheme — Stage 0 Requirements §4.2 (S0-CF-07/08/09/10) calls
  // for a configurable per-institution mask plus a Case Registry. The
  // Case Mask registry itself now exists (types/config/CaseMask.ts,
  // services/caseRegistry/) but is NOT yet wired to Case.id here — doing
  // so would break case routing. CaseRouter.isOrchCase(),
  // mockCaseService's isOrchCaseId(), and SynopticReportPage's
  // isOrchestrationMode all use a literal 'O26-' string-prefix check on
  // the case id as their routing/mode signal, and CaseRouter's check in
  // particular runs BEFORE the case is fetched — it can't check
  // reportingMode instead, since that field lives on the object it
  // doesn't have yet. An org-prefixed id like "MFT26-0029" would silently
  // misroute. Left on the original scan-and-increment scheme until that's
  // resolved — see the design discussion this comment came out of.
  async function generateNextCaseId(): Promise<string> {
    // bypassAccessControl: true — this needs to see every existing O26-
    // number across ALL organisations to avoid two different orgs'
    // accessioners independently generating the same id (each org would
    // otherwise only see its own numbering sequence after the access-
    // control fix, since CASES is one shared store). This is a system-
    // level uniqueness check, not data being displayed to the user — see
    // CaseRouter.getAll()'s own doc comment on this flag.
    const res = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true });
    const existingNums = (res.ok ? res.data : [])
      .map(c => c.id)
      .filter(isOrchCaseId)
      .map(id => parseInt(id.slice(ORCH_ID_PREFIX.length), 10))
      .filter(n => !isNaN(n));
    const next = (existingNums.length ? Math.max(...existingNums) : 0) + 1;
    return formatOrchCaseId(next);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const [lastResult, setLastResult] = useState<{ assignments: GrossingTemplateAssignment[]; warnings: string[]; specimenBlocks: { specimenId: string; label: string; blocks: HistologyBlock[] }[] } | null>(null);
  // Real feature, per direct follow-up on the label-printing
  // architecture scope. Deliberately separate from lastResult, which
  // is only set once the background Grossing Template refinement
  // completes (several real seconds after submit, since it's a real
  // AI call) — label printing needs none of that; the real Case,
  // patient, and specimen data it prints from is already fully
  // available the instant caseRouter.createCase() succeeds. Gating the
  // print action on lastResult would make the user wait on an AI call
  // that has nothing to do with what's printed.
  const [justAccessionedCase, setJustAccessionedCase] = useState<{ caseData: Case; specimens: Specimen[] } | null>(null);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setLastResult(null);

    try {
      const caseId = await generateNextCaseId();
      const nowIso = new Date().toISOString();

      // Real fix, per direct follow-up: "will the User have to wait 6
      // seconds? That seems wrong since everything should be 1 second
      // or less." Confirmed directly, not guessed: the real delay
      // wasn't the intraop lookup itself (a fast, in-memory/
      // localStorage check) — it was evaluateGrossingTemplateAssignment
      // below, which makes a real, genuine AI/LLM network call
      // (services/aiIntegration/aiProviderService.ts's own callAi(),
      // a real `fetch()`, not a mock or an artificial delay). That
      // call is real, necessary latency for a real feature, not a bug
      // to remove — but the intraop lookup was needlessly sequenced
      // strictly AFTER it finished, when the two are genuinely
      // independent: this lookup only needs form state already
      // available right here (patientName/mrn/surgeon) plus the real
      // caseId, already generated above — nothing it needs depends on
      // what the AI call returns. Kicked off here, in parallel with
      // the AI call and everything else below, rather than waiting for
      // all of that to finish first. Resolved (not started fresh)
      // after the real Case genuinely exists, further down — a match
      // found here is never surfaced to the UI before
      // caseRouter.createCase() has actually succeeded, so there's no
      // real risk of offering to merge into a Case that doesn't exist
      // yet.
      const intraopMatchPromise = intraoperativeService.findMatchesForNewCase({
        patientName: `${familyNames.trim()}, ${givenNames.trim()}`,
        mrn: mrn.trim(),
        surgeon: requestingProvider.trim(),
        accessionedAt: nowIso,
      });
      // Defensive, separate reaction attached now — same fire-and-forget
      // discipline as the interfaceEngine dispatch below. Genuinely
      // independent of the real .then() attached later: if handleSubmit
      // exits early (a real error elsewhere) before that later .then()
      // ever runs, this still guarantees the promise's own rejection is
      // handled rather than surfacing as an unhandled rejection.
      intraopMatchPromise.catch(console.error);

      // The human-facing accession number — CaseMask-driven, completely
      // separate from caseId (which stays the stable internal 'O26-'
      // routing key; see AccessionMetadata.fullAccession's doc comment
      // for why these can't be the same string). Falls back gracefully
      // inside allocateNextCaseNumber itself if none of this case's real
      // scope candidates has a CaseMask defined yet — never blocks
      // submission.
      //
      // Resolve the one department governing this case (mixed departments
      // are blocked from ever reaching handleSubmit — see canSubmit —
      // so resolvedDepartmentIds.size is always 0 or 1 here). 0 means no
      // dictionary matches at all — falls through to the next real
      // candidate, same as before this feature existed.
      const soleDepartmentId = resolvedDepartmentIds.size === 1 ? [...resolvedDepartmentIds][0] : undefined;

      // Real, same resolution this page already uses for Specimen
      // Deficiencies scoping above — the case's own performing lab,
      // resolved from the selected client/ordering facility, never a
      // direct field read.
      let performingLabFacility: Facility | undefined;
      let allFacilities: Facility[] = [];
      if (clientId) {
        const [facilityRes, allFacilitiesRes] = await Promise.all([mockFacilityService.getById(clientId), mockFacilityService.getAll()]);
        if (allFacilitiesRes.ok) allFacilities = allFacilitiesRes.data;
        if (facilityRes.ok) {
          const performingLabId = resolvePerformingLabFacilityId(facilityRes.data);
          performingLabFacility = performingLabId ? allFacilities.find(f => f.id === performingLabId) : undefined;
        }
      }

      const caseMaskCandidates = resolveCaseMaskScopeCandidates(soleDepartmentId, performingLabFacility, allFacilities);
      const accessionRes = await mockCaseMaskService.allocateNextCaseNumber(caseMaskCandidates, config.facilityTimezone);
      const fullAccession = accessionRes.ok ? accessionRes.data : caseId; // last-resort fallback if the service call itself errors (not just unconfigured — that's handled inside the service), so submission still can't hard-fail on this

      // Same real scope candidates, most-specific first — the first one
      // with a real, defined CaseMask is exactly the one
      // allocateNextCaseNumber itself just used, so this mirrors that
      // resolution to capture the prefix/pattern actually applied, for
      // the case record's own audit metadata below.
      let effectiveMask: CaseMask | null = null;
      for (const candidate of caseMaskCandidates) {
        const maskRes = await mockCaseMaskService.getMask(candidate.scopeType, candidate.scopeId);
        if (maskRes.ok && maskRes.data) { effectiveMask = maskRes.data; break; }
      }

      const specimenRecords = await Promise.all(specimens.map(async s => {
        const entry = s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId) : undefined;
        return {
          id: `${caseId}-SP-${s.label}`,
          // Cassette/report label — derived from the human-facing
          // accession number, never from the internal caseId. This is
          // what a pathologist actually dictates and what a cassette
          // printer actually prints (see Specimen.displayId's doc
          // comment).
          displayId: `${fullAccession}-${s.label}`,
          label: s.label,
          description: s.description.trim(),
          comments: s.comments.length ? s.comments : undefined,
          // Real, per direct guidance's own real LIS/cytology data-
          // modeling follow-up — additive, specimen-specific clinical
          // history, only ever set for a real cytology/FNA case (same
          // real gating as clinicalHistoryEntries/Case.order above).
          clinicalHistory: cytologyRelevant && s.clinicalHistory.length ? s.clinicalHistory : undefined,
          specimenDictionaryEntryId: s.dictionaryEntryId || undefined,
          // Real, per direct guidance's own confirmed two-tier
          // specimen-to-organ mapping strategy (Tier 1: Explicit
          // Entry). Only ever set for a genuinely Autopsy-category
          // specimen with at least one organ actually checked — never
          // an empty array standing in for "not applicable," matching
          // this file's own established convention for every other
          // optional field here.
          organCodes: resolveSpecimenEntryMatchesCategory(entry, ['AUTOPSY']) && s.organCodes?.length ? s.organCodes : undefined,
          // Real feature, per direct request: "if the specimen level is
          // deterministic, why should we make them assign?" This is a
          // real, coder-configured default (SpecimenEntry.
          // defaultBaseCptCode), not an AI guess - auto-applying it here
          // means the common case (a real dictionary answer exists)
          // never needs a separate manual "Assign Base Code" click at
          // all. Left undefined (not an empty array) when no default is
          // configured, so the existing hasBaseCode/Pending Base Code
          // UI still correctly prompts for manual assignment in that
          // case - this only removes the step where the answer is
          // already fully known.
          coding: entry?.defaultBaseCptCode ? { cpt: [entry.defaultBaseCptCode] } : undefined,
          // receivedAt defaults to "now" if the accessioner didn't touch
          // the field; collectedAt/processedAt stay genuinely blank when
          // not entered, rather than defaulting to "now" — see the
          // design discussion this was built from (guessing a collection
          // or fixation time would be actively wrong, not just imprecise).
          receivedAt: s.receivedAt ? new Date(s.receivedAt).toISOString() : nowIso,
          collectedAt: s.collectedAt ? new Date(s.collectedAt).toISOString() : undefined,
          collection: s.collectedAt || s.anatomicSite || s.laterality ? {
            collectedAt: s.collectedAt ? new Date(s.collectedAt).toISOString() : undefined,
            bodySite: s.anatomicSite.trim() || undefined,
            laterality: s.laterality || undefined,
          } : undefined,
          processing: s.processedAt ? {
            processedAt: new Date(s.processedAt).toISOString(),
            processedAtIsEstimated: s.processedAtIsEstimated || undefined,
          } : undefined,
          container: (s.containerType.trim() || s.fixativeVolumeMl.trim()) ? {
            type: s.containerType.trim() || undefined,
            fixativeVolumeMl: s.fixativeVolumeMl.trim() ? Number(s.fixativeVolumeMl) : undefined,
          } : undefined,
          externalId: s.externalId.trim() || undefined,
          externalIdSource: s.externalIdSource.trim() || undefined,
          specimenFlags: [],
          // Real, per direct follow-up closing PS-211's own remaining
          // gap: the one real half of
          // CytologyHighRiskFactors.abnormalExamFindings that can
          // only ever be a real, manual, collection-time observation.
          // Applied per real, cytology/FNA-relevant specimen — the
          // same real entry.type check cytologyRelevant above already
          // uses — never attached to a non-cytology specimen in the
          // same accession batch.
          cytologyScreening: (entry?.type === 'Cytology' || entry?.type === 'FNA') && persistentContactBleedingAtCollection
            ? { persistentContactBleedingAtCollection: true }
            : undefined,
          ...(await generateDefaultMaterial(entry, `${caseId}-SP-${s.label}`, selectedFacility?.specimenLabelStyle, stainTypes, protocols, fullAccession, s.label, priority)),
          // kept alongside the record (not part of Specimen's own shape)
          // purely to feed evaluateGrossingTemplateAssignment below —
          // stripped before the record is cast into the Case
          _entry: entry,
        };
      }));

      // Real fix, per direct follow-up: "The AI call can happen in the
      // background... not necessarily going to serialize the accession
      // event with Grossing immediately." Confirmed directly: the
      // ~6-second wait traced back to evaluateGrossingTemplateAssignment
      // making a real AI/LLM network call — genuine, necessary latency
      // for a real feature, but there's no real reason a Case needs to
      // sit unsaved and un-shown while it runs. Every specimen gets the
      // SAME real, already-established fallback template
      // (evaluateGrossingTemplateAssignment's own default for a
      // specimen it can't confidently route) immediately — a
      // genuinely usable, gross-able Case exists the instant this
      // function returns, not a placeholder. The real AI call, the
      // template/override lookups it needs, and the refinement of any
      // specimen the AI can route more specifically now happen in
      // refineGrossingTemplatesInBackground() below, kicked off after
      // real Case creation succeeds — see that function's own header
      // comment for the full design, including why it never clobbers
      // a specimen someone has already started grossing.
      const grossingReports: GrossingReportInstance[] = specimenRecords.map(sp => ({
        instanceId: `${sp.id}_grossing_${Math.random().toString(36).slice(2, 10)}`,
        specimenId: sp.id,
        templateId: 'grossing_standard_tissue',
        templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'draft',
        answers: {},
        createdAt: nowIso,
        updatedAt: nowIso,
      }));
      setDirty(false); // genuinely persisted now — nothing left to lose by navigating away

      // Real MPI resolution — replaces the previous `OPAT-${caseId}` id,
      // which was derived from the CASE, not the person: the same
      // real-world patient with two different cases got two completely
      // unrelated patient ids, and there was no actual person-level
      // identity anywhere in the data model. Scoped to this lab's own
      // enterprise (MPI, not EMPI — see IPatientIndexService.ts's own
      // doc comment on why cross-tenant matching would be a privacy
      // problem, not a feature).
      //
      // Real fix: this previously scoped to originOrganisation.id — the
      // specific hospital/clinic that referred THIS case, not this
      // lab's own stable identity. The same real patient referred by
      // two different hospitals to the same lab would incorrectly get
      // two separate MPI records, directly undermining the whole reason
      // this system exists (reliably surfacing a patient's full case
      // history). originEnterpriseId is the real, stable "this lab
      // tenant" identifier already resolved below for Case itself -
      // reused here instead of computing a second, differently-scoped
      // value for the same real concept.
      //
      // Real, small consolidation: this used to recompute
      // resolveMpiScopeEnterpriseId(originOrganisation) locally here —
      // now reuses the same, shared mpiScopeOrgId the new "Order
      // Lookup & Patient Verification" modal also needs, computed
      // once, upfront, near originOrganisation's own definition.
      const mpiOrgId = mpiScopeOrgId;
      // Real, per direct guidance (Outside Client Support &
      // International Financial Class Architecture Specification:
      // "completely bypassing the identity reconciliation queue"):
      // an Outside/Contract Case's demographics come from a source
      // system this lab has no real relationship with (an NIR, an NHS
      // Number, a foreign MRN scheme) — forcing them through this
      // lab's own domestic matching logic risks a false 'ambiguous'
      // flag with real administrative overhead and no real clinical
      // benefit. resolvePatientWithoutMatching() always creates a
      // genuinely fresh identity — see its own doc comment
      // (services/patients/IPatientIndexService.ts) for the full real
      // reasoning, including why this is complementary to, not a
      // replacement for, the "Check for Existing Patient" search
      // right below this same submit path.
      const patientCandidate = {
        organisationId: mpiOrgId,
        // Real fix, closing the loop on the earlier scoping fix: this
        // specific referring organisation's id is exactly the value
        // that was incorrectly used as the MPI SCOPE before - it finds
        // its correct, real home here instead, as the assigning
        // authority for the MRN being submitted with this order. See
        // PatientMatchCandidate.assigningAuthority's own doc comment
        // for the real collision risk this closes.
        assigningAuthority: originOrganisation?.id,
        mrn: mrn.trim() || `AUTO-${caseId.slice(4)}`,
        firstName: givenNames.trim(),
        lastName: familyNames.trim(),
        dateOfBirth: new Date(dob).toISOString(),
        sourceAccession: fullAccession,
      };
      const mpiResult = intakeType === 'outside'
        ? await mockPatientIndexService.resolvePatientWithoutMatching(patientCandidate)
        : await mockPatientIndexService.resolveOrCreatePatient({
            ...patientCandidate,
            isDowntimeRecord: isDowntimeAccession || undefined,
            downtimeReasonCode: isDowntimeAccession ? (downtimeReasonCode || undefined) : undefined,
          });
      if (mpiResult.outcome === 'ambiguous') {
        toast.warning(<PhiToastMessage>{t('accessionPage.toast.patientMatchNeedsReview', { reason: mpiResult.reason })}</PhiToastMessage>);
      }

      // Real, per direct guidance ("should the accession do this as
      // they go... the real linkPatients() call fires right after
      // normal MPI resolution completes"), generalized to every
      // intake type per direct follow-up ("not sure if there is a
      // point to this at accession unless it's the maiden/married name
      // scenario") — a name-change match can happen on any ordinary
      // accession, not just an Outside/Contract Case, so this is no
      // longer gated to intakeType === 'outside'. The new patient
      // identity now genuinely exists (mpiResult.patientId), so a real
      // link to whichever existing patient the accessioner explicitly
      // confirmed can fire now — the exact same, already-tested
      // linkPatients() mechanism PatientMatchReviewSection.tsx already
      // uses for its own human-confirmed links. Fire-and-forget, same
      // posture as the background AI refinement further below — a link
      // failing must never block or fail the case creation it's
      // attached to; a real, honest console warning is left for
      // whoever's watching real errors, not a silent swallow.
      if (samePersonLinkConfirmed) {
        mockPatientIndexService.linkPatients(
          mpiResult.patientId,
          samePersonLinkConfirmed.id,
          'same_person',
          user?.id ?? 'unknown',
          'Accessioner-confirmed same-person link at accessioning time'
        ).catch(err => console.error('[Accession] Real, non-blocking failure linking patient:', err));
      }

      // Real fix, per direct follow-up on the rest of Phase 0: resolves
      // the real, standalone Encounter this case's specimens were
      // collected during - see services/encounters/IEncounterService.ts's
      // own header comment on why IncomingOrder.encounterNumber existed
      // as a bare, unstructured string with nowhere real to resolve
      // into before this. Only when a real encounter number was
      // actually provided - not every accession has one (e.g. a
      // routine outpatient referral with no real visit/FIN concept).
      let resolvedEncounterId: string | undefined;
      if (encounterNumber.trim()) {
        const encounterResult = await mockEncounterService.resolveOrCreateEncounter({
          organisationId: mpiOrgId,
          patientId: mpiResult.patientId,
          encounterNumber: encounterNumber.trim(),
          encounterClass: 'Outpatient', // honest default - real class isn't captured on IncomingOrder yet
          sourceAccession: fullAccession,
        });
        if (encounterResult.ok) resolvedEncounterId = encounterResult.data.id;
      }

      // Real, per the uploaded spec's own User Story 5, Acceptance
      // Criteria 1 and 2 — resolved BEFORE newCase is constructed, so
      // the real, computed accessionStatus can be set directly on the
      // order object below rather than a separate, second
      // updateCase() round-trip immediately after creation. Only ever
      // meaningful for a real cytology/FNA case (same real gating as
      // every other clinical-history-specific field in this
      // function) — a non-cytology case has no clinicalHistory
      // anywhere to validate.
      let accessionValidation: AccessionValidationResult = { valid: true, errors: [] };
      if (cytologyRelevant) {
        const dictRes = await mockClinicalHistoryDictionaryService.getAll();
        accessionValidation = resolveAccessionValidation(
          clinicalHistoryEntries,
          specimens.map(s => ({ label: s.label, clinicalHistory: s.clinicalHistory })),
          dictRes.ok ? dictRes.data : [],
        );
      }

      const newCase: Case = {
        id: caseId,
        // Real, per direct guidance's own confirmed integration — the
        // same real buildAutopsyCaseDetailsFromIntakeForm.ts function
        // components/Autopsy/AutopsyIntakeForm.tsx already used as a
        // standalone form's own submit handler, called here instead.
        // Preserves everything else about this real case-creation
        // flow (accession number, originHospitalId/originEnterpriseId,
        // patient, specimens) completely unchanged.
        autopsy: autopsyRelevant ? buildAutopsyCaseDetailsFromIntakeForm(autopsyForm) : undefined,
        reportingMode: 'orchestrator',
        accession: {
          accessionNumber: fullAccession,
          accessionPrefix: effectiveMask?.prefix ?? 'O',
          accessionYear: getFacilityDateParts(new Date(), config.facilityTimezone).year,
          fullAccession,
          formatPatternUsed: effectiveMask?.maskPattern,
          accessionedAt: nowIso,
          accessionedBy: user?.id ?? 'unknown',
        },
        originHospitalId,
        originSiteId: originSiteId || undefined,
        encounterId: resolvedEncounterId,
        // Real fix: this was previously hardcoded to 'ENT-ACME' — a
        // literal that didn't even match EnterpriseConfig's own default
        // id ('ENT-DEFAULT' in contexts/SystemConfigContext.tsx), two
        // separate, disagreeing hardcoded values for what was meant to
        // be the same single demo enterprise. Now resolved the same way
        // originHospitalId already was — from the real Organisation
        // record (see Organisation.enterpriseId's own doc comment in
        // organisationService.ts) — rather than a second, independent
        // guess. Falls back to the same 'ENT-DEFAULT' EnterpriseConfig
        // itself uses if the organisation somehow didn't resolve, not a
        // third, different literal.
        originEnterpriseId: originOrganisation?.enterpriseId ?? 'ENT-DEFAULT',
        patientMatchOutcome: mpiResult.outcome,
        status: 'accessioned',
        patient: {
          id: mpiResult.patientId,
          mrn: mrn.trim() || `AUTO-${caseId.slice(4)}`,
          namePrefix: namePrefix.trim() || undefined,
          givenNames: givenNames.trim(),
          familyNames: familyNames.trim(),
          preferredName: preferredName.trim() || undefined,
          nameSuffix: nameSuffix.trim() || undefined,
          // Backward-compat mirrors — Worklist/report rendering/etc.
          // still read these directly; see Patient.ts's own doc comments.
          firstName: givenNames.trim(),
          lastName: familyNames.trim(),
          dateOfBirth: new Date(dob).toISOString(),
          sex,
          // Real, per direct guidance's own prior requirement ("The
          // User may need to see the LMP and other clinical history
          // dictionaries entries") plus its own direct follow-up:
          // captured here, at real accessioning, only ever set when
          // the case actually includes a real cytology/FNA specimen
          // (cytologyRelevant) — never populated with empty strings
          // for a non-cytology case.
          lastMenstrualPeriod: cytologyRelevant && lmp ? new Date(lmp).toISOString() : undefined,
          hormonalStatus: cytologyRelevant && hormonalStatus ? hormonalStatus : undefined,
          // Real, per the uploaded "Structured Clinical History
          // Dictionary & Accessioning Integration" spec's own
          // Acceptance Criteria 3 — a new, simple field, same real
          // treatment as hormonalStatus above. Retires the old,
          // free-text priorAbnormalPapHpvHistory field: its real,
          // structured replacement (HX_PRIOR_ABNL_PAP_HPV) is now
          // captured via clinicalHistoryEntries below instead.
          priorHpvResult: cytologyRelevant && priorHpvResult ? priorHpvResult : undefined,
          iudOrContraceptionUse: cytologyRelevant && iudOrContraceptionUse.trim() ? iudOrContraceptionUse.trim() : undefined,
        } as any,
        specimens: specimenRecords.map(({ _entry, ...sp }) => sp),
        order: {
          priority,
          requestingProvider: requestingProvider.trim(),
          facilityId: clientId,
          facilityName: selectedFacility?.name,
          locationId: locationId || undefined,
          locationDisplay: selectedLocation
            ? [selectedLocation.pointOfCare, selectedLocation.room, selectedLocation.bed].filter(Boolean).join(' / ')
            : undefined,
          clinicalIndication: clinicalIndication.trim() || undefined,
          icd10Codes: icd10Codes.length ? icd10Codes : undefined,
          caseComments: caseComments.length ? caseComments : undefined,
          receivedDate: nowIso,
          assignedTo: assignedTo || undefined,
          assignedParticipationTypeId: assignedTo ? 'primary' : undefined,
          intakeType,
          outsidePatientData: intakeType === 'outside' ? outsidePatientData : undefined,
          // Real, per direct guidance's own real OBR-31/reasonCode
          // work — captured here, at real accessioning, only for a
          // real cytology/FNA case.
          reasonForStudy: cytologyRelevant && reasonForStudy ? reasonForStudy : undefined,
          // Real, per the uploaded spec's own User Story 2/3 — the
          // real, structured clinical history entries attached via
          // ClinicalHistoryEntryPanel, only ever set for a real
          // cytology/FNA case (same real gating as every other
          // cytology-specific field above).
          clinicalHistory: cytologyRelevant && clinicalHistoryEntries.length ? clinicalHistoryEntries : undefined,
          // Real, per the uploaded spec's own User Story 5, Acceptance
          // Criteria 2 — only ever set for a real cytology/FNA case;
          // undefined (never a fabricated 'COMPLETE') for every other
          // case, which never had real clinical history to validate
          // in the first place.
          accessionStatus: cytologyRelevant ? (accessionValidation.valid ? 'COMPLETE' : 'DEFICIENT') : undefined,
        } as any,
        diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
        grossingReports,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await caseRouter.createCase(newCase);

      // Real, per the uploaded spec's own User Story 5, Acceptance
      // Criteria 2 and 3 — enqueues the real, appropriate outbound
      // event now that the case genuinely, persistently exists. Only
      // ever meaningful for a real cytology/FNA case; fire-and-forget
      // (never awaited beyond the enqueue itself, never blocks
      // accessioning) — same real posture as every other outbound
      // dispatch in this app, since a real interface engine consuming
      // this queue is a separate, later concern from accessioning
      // itself succeeding.
      if (cytologyRelevant) {
        const chMessageId = crypto.randomUUID();
        if (accessionValidation.valid) {
          mockAccessionOutboundQueueService.enqueue({
            caseId,
            eventType: 'order.accessioned',
            organisationId: selectedFacility?.id ?? clientId,
            payload: { messageId: chMessageId, timestamp: nowIso, orderId: caseId, clinicalHistory: clinicalHistoryEntries },
          }).catch(console.error);
        } else {
          mockAccessionOutboundQueueService.enqueue({
            caseId,
            eventType: 'order.deficiency.created',
            organisationId: selectedFacility?.id ?? clientId,
            payload: { messageId: chMessageId, timestamp: nowIso, orderId: caseId, errors: accessionValidation.errors },
          }).catch(console.error);
        }
      }

      // Real, per the Protocol-Driven Workflow Infrastructure story's
      // Part 2b accession trigger — reads PathwayTask.sendOutboundOrder
      // for each specimen's own assigned protocol (specimenRecords
      // still carries _entry here; it's only stripped when building
      // newCase.specimens above) and enqueues a real 'order.molecular'
      // entry per flagged assay. This is how the HPV co-test fires
      // automatically for a ThinPrep specimen configured with
      // st-hpv-reflex on its protocol — no separate HPV configuration
      // service needed. Fire-and-forget, same real posture as the
      // accession outbound queue immediately above.
      for (const sp of specimenRecords) {
        const specimenProtocol = sp._entry?.protocolId ? protocols.find(p => p.id === sp._entry?.protocolId) : undefined;
        const assayIds = resolveOutboundMolecularAssaysForProtocol(specimenProtocol);
        for (const assayCode of assayIds) {
          mockMolecularOrderOutboundQueueService.enqueue({
            caseId,
            eventType: 'order.molecular',
            payload: {
              accessionNumber: fullAccession, specimenLetter: sp.label, assayCode,
              orderReason: 'protocol_configured', priority,
            },
          }).catch(console.error);
        }
      }

      // Real feature, per direct follow-up on the label-printing scope
      // — set immediately, not gated on the background AI refinement
      // below; see this state's own declaration for why.
      setJustAccessionedCase({ caseData: newCase, specimens: newCase.specimens ?? [] });

      // Real feature, per direct follow-up: "The AI call can happen in
      // the background... not necessarily going to serialize the
      // accession event with Grossing immediately." Genuinely
      // fire-and-forget from the accessioner's point of view — not
      // awaited, does not delay setTab/navigation below at all.
      //
      // Nested here (rather than a top-level component function) so it
      // naturally closes over specimenRecords/clinicalIndication/
      // clientId/caseId — this app's own established
      // interface/mock/firestore service layer already has real
      // caseRouter.getCase/updateCase methods; nothing new needed there.
      //
      // Two real safety properties, both load-bearing:
      // 1. Re-fetches the case's REAL, current state right before
      //    patching it — never trusts the in-memory `newCase` snapshot
      //    from creation time, since real time has genuinely passed by
      //    the time the AI call resolves.
      // 2. Only refines a specimen's template if its grossing report is
      //    still genuinely pristine (status 'draft', zero real answers)
      //    — never silently swaps the template out from under someone
      //    who has already opened this case and started grossing a
      //    specimen with the default. A specimen already touched keeps
      //    whatever it has, even if the AI would have routed it
      //    differently.
      async function refineGrossingTemplatesInBackground() {
        try {
          const templateModule = await import('@/services/templates/templateService');
          const allTemplates = await templateModule.listTemplates('published');
          const availableTemplates = allTemplates
            .filter(tpl => tpl.isDiagnostic === false)
            .map(tpl => ({ id: tpl.id, name: tpl.name, category: tpl.category }));

          const overridesRes = await grossingRoutingOverrideService.getAll();
          const routingOverrides = (overridesRes.ok ? overridesRes.data : [])
            .filter(o => o.active)
            .map(o => ({ facilityId: o.clientId, specimenType: o.specimenType, grossingTemplateId: o.grossingTemplateId }));

          const evalResult = await evaluateGrossingTemplateAssignment({
            specimens: specimenRecords.map(sp => ({
              specimenId: sp.id,
              specimenLabel: sp.label,
              specimenDesc: sp.description,
              specimenType: sp._entry?.type,
              bodySite: sp._entry?.site,
              laterality: sp._entry?.laterality,
            })),
            clinicalIndication: clinicalIndication.trim() || undefined,
            caseContext: { facilityId: clientId },
            availableTemplates,
            routingOverrides,
          });

          const latestCase = await caseRouter.getCase(caseId);
          if (!latestCase) return; // genuinely gone — nothing real left to refine

          // Real feature, per direct follow-up: "Do we capture failed
          // template association? That might be a good quality
          // measure." Every specimen's real routing outcome — a
          // confident AI decision, a low-confidence fallback, a Pass
          // G0 override, or (in the catch block below) a genuine AI
          // failure — is now persisted to the real Case, not just
          // shown transiently. See applyGrossingRefinement.ts's own
          // header comment and Case.ts's own
          // GrossingReportInstance.templateAssignmentOutcome for the
          // full design.
          const { reports: refinedReports, anyTemplateChanged, anyDataChanged } = applyGrossingRefinement(
            latestCase.grossingReports ?? [],
            evalResult.assignments,
          );

          if (anyDataChanged) {
            await caseRouter.updateCase(caseId, { grossingReports: refinedReports });
          }
          if (anyTemplateChanged) {
            const lowConfidenceCount = evalResult.assignments.filter(a => a.belowThreshold).length;
            toast.success(
              <PhiToastMessage>
                {lowConfidenceCount > 0
                  ? t('accessionPage.toast.templatesRefinedFallback', { caseId, lowCount: lowConfidenceCount, total: evalResult.assignments.length })
                  : t('accessionPage.toast.templatesRefined', { caseId })}
              </PhiToastMessage>
            );
          }

          // Best-effort UI update — only visible if the accessioner is
          // still on this page; a safe no-op in React 18 if they've
          // since navigated away (the refinement above already
          // persisted to the real Case regardless).
          setLastResult({
            assignments: evalResult.assignments,
            warnings: evalResult.warnings,
            specimenBlocks: specimenRecords.map(sp => ({ specimenId: sp.id, label: sp.label, blocks: sp.blocks })),
          });
        } catch (e) {
          // Real feature, per direct follow-up: a genuine AI/network
          // failure is itself a real, distinct quality signal — worth
          // persisting to the Case, not just this console log.
          // Specimens keep their safe, immediate default template
          // either way; only the quality-outcome metadata records that
          // a real evaluation was attempted and genuinely failed.
          console.error('Background Grossing Template refinement failed:', e);
          try {
            const latestCase = await caseRouter.getCase(caseId);
            if (latestCase?.grossingReports?.length) {
              const failedReports = markGrossingRefinementFailed(
                latestCase.grossingReports,
                e instanceof Error ? e.message : String(e),
              );
              await caseRouter.updateCase(caseId, { grossingReports: failedReports });
            }
          } catch (persistErr) {
            console.error('Also failed to persist the Grossing Template refinement failure itself:', persistErr);
          }
        }
      }
      refineGrossingTemplatesInBackground();

      // Real feature, per direct follow-up: "did we want to implement the
      // [trigger for the] outbound Order Request message to the engine?"
      // Category E (PathScribe_Interface_Specification_v1.1.docx, §7) —
      // fires only for a genuine "scratch" case: no real, matching
      // pre-existing order was ever imported (sourceOrderId stays null for
      // manual entry — see this file's own README, the earlier fix for
      // issue #1). A case that DID come from a real, imported order has
      // nothing new to announce here; the receiving system already knows
      // about that order, since it's the one that sent it. Genuinely
      // fire-and-forget from the accessioner's own point of view — a real
      // failure here must never block or roll back a real, already-created
      // Case; see mockInterfaceEngineService.ts's own header comment for
      // why "delivered" only means "the mock recorded it," not "a real
      // downstream system received it" — there is no real backend yet.
      if (!sourceOrderId) {
        const orderCreationPayload = buildOrderCreationPayload(newCase, mpiResult.outcome, nowIso);
        mockInterfaceEngineService.postOrderCreated(orderCreationPayload).catch(console.error);
      }

      // Real, per PS-81 (Jira) — completes the ROOT FIX above. That
      // fix already resolved/auto-created a real Physician directory
      // record, but discarded the result — orderingPhysicianId (this
      // Case's own real, stable link to that record, already relied
      // on by TemplateRoutingService's Pass 0b and
      // contextBuilder.ts's own real fallback,
      // orderingPhysicianId ?? requestingProvider) was never actually
      // set on any real, live-accessioned case. newCase is already
      // persisted (caseRouter.createCase above) by this point, so this
      // is a real, explicit follow-up update, not part of the
      // original create — same fail-open posture: a resolution
      // failure here must never roll back the already-created case.
      // Spreads the existing newCase.order fields explicitly —
      // updateCase's own real merge is shallow at the top level, so a
      // naive { order: { orderingPhysicianId } } would silently wipe
      // priority/clientId/requestingProvider/etc. instead of adding to
      // them.
      //
      // Real, per PS-81's own picker follow-up: when the accessioner
      // actually picked a real physician from the dropdown,
      // selectedProvider already IS that exact, real, unambiguous
      // record — using its id directly skips resolveProviderName's own
      // free-text matching entirely, since there's no ambiguity left
      // to resolve. Only falls back to string-based resolution when
      // the field holds free text the user typed without ever
      // selecting a real match (a genuinely new/outside physician).
      if (selectedProvider) {
        caseRouter.updateCase(newCase.id, {
          order: { ...newCase.order, orderingPhysicianId: selectedProvider.id },
        }).catch(console.error);
      } else if (requestingProvider.trim()) {
        resolveProviderName(requestingProvider.trim(), 'requesting', clientId)
          .then(resolved => {
            if (resolved.ok && resolved.data) {
              return caseRouter.updateCase(newCase.id, {
                order: { ...newCase.order, orderingPhysicianId: resolved.data.physician.id },
              });
            }
          })
          .catch(console.error);
      }

      // Write a permanent record for any specimen that had a
      // requisition-deficiency detected (and resolved) during this
      // session — same reasoning as the type's own doc comment: even
      // though resolution happened live, in one sitting, the record
      // itself is what lets data-quality issues (e.g. one client's order
      // feed consistently failing to match the dictionary) be tracked
      // over time rather than disappearing the moment they're resolved.
      await Promise.all(specimens.map((s, i) => {
        if (!s.unmatchedOrderText) return Promise.resolve();
        return specimenDeficiencyService.raiseAndResolve(
          {
            caseId,
            specimenId: specimenRecords[i].id,
            specimenLabel: s.label,
            deficiencyTypeId: 'def-no-dict-match',
            comment: `Order text: "${s.unmatchedOrderText}"`,
            raisedBy: 'system',
          },
          {
            resolutionTypeId: s.resolutionTypeId ?? 'res-resolved-accessioner',
            resolutionComment: s.comments?.length ? s.comments[s.comments.length - 1].text : undefined,
            resolvedBy: user?.id ?? 'unknown',
          }
        );
      }));

      // Manually-reported deficiencies (Deficiency (optional) button per
      // specimen row) — genuinely open records, unlike the auto-detected
      // one above. An accessioner flagging "container damaged" doesn't
      // necessarily have the resolution in hand on the spot, so this
      // uses raise() alone, not raiseAndResolve(). Tracked to resolution
      // from the dedicated Deficiencies work queue, independent of this
      // case's own lifecycle. Real fix, per direct follow-up: a
      // specimen can genuinely have more than one real issue at once
      // (e.g. both "Container Damaged" and "Insufficient Volume") —
      // raises every entry in the real array, not just a single one.
      await Promise.all(specimens.flatMap((s, i) =>
        s.manualDeficiencies.map(def => specimenDeficiencyService.raise({
          caseId,
          specimenId: specimenRecords[i].id,
          specimenLabel: s.label,
          deficiencyTypeId: def.deficiencyTypeId,
          comment: def.comment || undefined,
          raisedBy: user?.id ?? 'unknown',
        }))
      ));

      // Case-level manual deficiencies — genuinely no specimenId/
      // specimenLabel, unlike every other raise() call in this file.
      // Not every real issue is tied to one specimen; forcing a
      // specimen choice for something like a missing requisition
      // (which covers the whole order, not one particular specimen)
      // was always a small fiction — see specimenId's own doc comment
      // on the SpecimenDeficiency type for the full reasoning. Same
      // real fix as above — a real array, not a single slot.
      await Promise.all(caseManualDeficiencies.map(def => specimenDeficiencyService.raise({
        caseId,
        deficiencyTypeId: def.deficiencyTypeId,
        comment: def.comment || undefined,
        raisedBy: user?.id ?? 'unknown',
      })));

      if (sourceOrderId) {
        await orderIntakeService.markOrderLinked(sourceOrderId, caseId);
        loadPendingOrders(); // remove it from the pending list now that it's linked
      }

      // Real fix, per direct follow-up: the real, per-specimen
      // confidence/fallback outcome isn't known yet at this point
      // anymore — evaluateGrossingTemplateAssignment now runs in the
      // background (see refineGrossingTemplatesInBackground() below).
      // Every specimen already has a real, immediately-usable template
      // (the same fallback the AI itself would use for one it can't
      // confidently route) — this toast says so honestly, without
      // claiming a specific AI outcome that hasn't happened yet. A
      // separate, later toast reports the real refinement outcome once
      // it completes.
      toast.success(<PhiToastMessage>{t('accessionPage.toast.accessioned', { caseId, count: specimens.length })}</PhiToastMessage>);

      // Closes the loop described in the original Intraop spec — "when
      // the formal order finally arrives from the LIS, PathScribe
      // should look for a match." This is that moment. Non-blocking:
      // if nothing matches, accession finishes exactly as it always
      // did. Real fix, per direct follow-up on the 6-second wait: this
      // used to START the lookup here, strictly after the slow AI
      // grossing-template call above had already finished — resolving
      // the SAME promise kicked off early, right after caseId was
      // generated, instead. The genuinely independent latency of this
      // lookup now overlaps with the AI call's own latency rather than
      // adding to it. Only resolved here, after caseRouter.createCase()
      // has actually succeeded — a match found earlier is never
      // surfaced to the UI before the real Case genuinely exists.
      intraopMatchPromise.then(res => {
        if (res.ok && res.data.length > 0) setIntraopMatch({ caseId, match: res.data[0] });
      });

      setTab('specimens');
    } catch (e) {
      console.error('[PathScribe] Accession submit failed:', e);
      toast.error(t('accessionPage.toast.accessionFailed', { message: (e as Error)?.message ?? 'unknown error' }));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setNamePrefix(''); setGivenNames(''); setFamilyNames(''); setPreferredName(''); setNameSuffix('');
    setDob(''); setSex('F'); setMrn('');
    setPriority('Routine'); setRequestingProvider(''); setClientId(''); setClinicalIndication(''); setIcd10Codes([]); setCaseComments([]); setAssignedTo(''); setCaseManualDeficiencies([]);
    setSpecimens([emptySpecimen('A')]);
    setLastResult(null);
    setJustAccessionedCase(null);
    setSourceOrderId(null); setOrderSearch(''); setImportWarnings([]);
    // Real, per direct guidance ("Family relations could be an
    // optional field"), and a real, pre-existing gap found and fixed
    // in the same pass: intakeType/outsidePatientData were never reset
    // here at all — "Accession Another Case" after an Outside/Contract
    // Case would silently carry the Outside mode and its own stale
    // financial-class data into the next, genuinely unrelated
    // accession, unless the accessioner happened to manually switch
    // back to Standard first.
    setIntakeType('standard'); setDowntimeReasonCode(''); setOutsidePatientData({});
    setSamePersonLinkConfirmed(null);
    loadPendingOrders();
    setTab('case');
  }

  // Real feature, per direct follow-up on the label-printing
  // architecture scope. Real, user-triggered action, deliberately not
  // automatic on every accession — printing consumes real physical
  // label stock, and window.open() called from an async callback with
  // no direct user gesture is commonly popup-blocked; a real click
  // here is both the right UX and the thing that keeps the print
  // window from being silently blocked.
  async function handlePrintLabels() {
    if (!justAccessionedCase) return;
    const { caseData, specimens: printSpecimens } = justAccessionedCase;
    const { printRequisitionLabel, printAllContainerLabels } = await import('@/utils/labels/printRequisitionAndContainerLabels');

    // Real, honest limitation: two different physical label sizes in
    // one browser print job would need two different @page rules,
    // which isn't reliably controllable across browsers from a single
    // print() call — printed as two separate jobs instead, each with
    // its own correct, real @page size.
    printRequisitionLabel(caseData);
    await printAllContainerLabels(caseData, printSpecimens);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="ps-accession-shell">
      <div className="ps-accession-content">

        <div className="ps-accession-header">
          <h1 className="ps-accession-title">{t('accessionPage.page.title')}</h1>
          <p className="ps-accession-subtitle">
            {t('accessionPage.page.subtitle')}
          </p>
        </div>

        <div className="ps-tab-bar ps-accession-tabs">
          <button className={`ps-tab-btn ${tab === 'case' ? 'active' : ''}`} onClick={() => setTab('case')}>{t('accessionPage.tabs.casePatient')}</button>
          <button className={`ps-tab-btn ${tab === 'specimens' ? 'active' : ''}`} onClick={() => setTab('specimens')}>
            {t('accessionPage.tabs.specimens')} {filledSpecimenCount ? `(${filledSpecimenCount})` : ''}
          </button>
          {/* Real, per direct guidance: only shown for Outside/Contract
              Case intake — dynamically activated, not always present. */}
          {intakeType === 'outside' && (
            <button className={`ps-tab-btn ps-accession-outside-tab-btn ${tab === 'outside_patient' ? 'active' : ''}`} onClick={() => setTab('outside_patient')}>
              ℹ {t('accessionPage.tabs.outsidePatientData')}
            </button>
          )}
        </div>

        {tab === 'case' && (
          <div className="ps-card-dark ps-accession-card">
            {/* Real fix, per direct report: "This assumes an order
                exists, but it may not... we should update the onscreen
                title perhaps?" Confirmed directly this section was
                already, genuinely optional — sourceOrderId stays null
                for a manual entry, submission works fine without it,
                and there's no separate "Order" entity created either
                way; the Case itself IS the record whether its fields
                came from an import or were typed by hand. The gap was
                real but purely in the label: "Import from Order,"
                prominently at the very top of the form with no
                qualifier, could reasonably read as a required first
                step rather than a convenience — this section is only
                hidden entirely when there are ZERO pending orders
                system-wide (see the guard above), so a walk-in
                patient with no order of their own still sees this
                section front and center, since OTHER patients' orders
                exist. "— Optional" added to the label itself, plus a
                direct, explicit hint that skipping straight to manual
                entry below is a fully valid path. */}
            {pendingOrders.length > 0 && (
              <div className="ps-accession-import-row">
                <label className="ps-label">{t('accessionPage.importOrder.label', { count: pendingOrders.length })}</label>
                <p className="ps-accession-import-hint">
                  {t('accessionPage.importOrder.hint')}
                </p>
                <div className="ps-accession-order-picker">
                  <div className="ps-accession-order-picker-search-wrap">
                    <input type="text" placeholder={t('accessionPage.importOrder.searchPlaceholder', { format: searchDobFormatHint })}
                      value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                      onKeyDown={handleOrderSearchKeyDown}
                      className="ps-accession-order-picker-search" disabled={importing} />
                    <button
                      type="button"
                      className="ps-accession-order-search-icon-btn"
                      onClick={handleOrderSearchIconClick}
                      disabled={importing}
                      title={t('accessionPage.importOrder.search')}
                      aria-label={t('accessionPage.importOrder.search')}
                    >
                      🔍
                    </button>
                    <button
                      type="button"
                      className="ps-accession-advanced-search-link"
                      onClick={() => openOrderLookupModal(orderSearch)}
                      disabled={importing}
                    >
                      {t('accessionPage.importOrder.advancedSearch')}
                    </button>
                  </div>
                  <div className="ps-accession-order-picker-list" data-phi="accession">{orderSearch.trim().length < 2 ? (
                      <div className="ps-accession-order-picker-empty">
                        {orderSearch.trim().length === 1 ? t('accessionPage.importOrder.keepTyping') : t('accessionPage.importOrder.typeAtLeast2')}</div>
                    ) : filteredOrders.length === 0 ? (
                      <div className="ps-accession-order-picker-empty">{t('accessionPage.importOrder.noMatch')}</div>
                    ) : filteredOrders.map(o => (
                      <div key={o.id}
                        className={`ps-accession-order-picker-item ${sourceOrderId === o.id ? 'ps-accession-order-picker-item--selected' : ''} ${importing ? 'ps-accession-order-picker-item--disabled' : ''}`}
                        onClick={() => !importing && handleImportOrder(o.id)}>
                        <div className="ps-accession-order-picker-main">
                          <strong>{o.externalOrderNumber}</strong>{' — '}
                          <span data-phi="name">{o.patient.firstName} {o.patient.lastName}</span>
                          {o.patient.mrn && <span data-phi="mrn"> · MRN {o.patient.mrn}</span>}
                        </div>
                        <div className="ps-accession-order-picker-meta">{o.externalAssigningAuthority} · {o.source.toUpperCase()} · {o.priority ?? 'Routine'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {importing && <div className="ps-accession-order-picker-status">{t('accessionPage.importOrder.importing')}</div>}
                {sourceOrderId && importWarnings.length > 0 && (
                  <div className="ps-accession-warnings">
                    {importWarnings.map((w, i) => <div key={i} className="ps-accession-warning-item">{w}</div>)}
                  </div>
                )}
              </div>
            )}
            {/* Real, per direct guidance ("replace the checkbox with an
                explicit Patient Origin / Intake Type selector"): the
                real, top-level accessioning mode. Positioned exactly
                where the old checkbox banner lived, for the same real
                reason documented there before — "is this a normal
                patient or a downtime/outside case" is a decision made
                BEFORE entering a real name, not a system-level
                footnote among pure demographic fields. */}
            <div className="ps-accession-intake-selector">
              <label className="ps-label">{t('accessionPage.intakeSelector.label')}</label>
              <div className="ps-accession-intake-tabs">
                <button type="button"
                  className={`ps-accession-intake-tab ${intakeType === 'standard' ? 'ps-accession-intake-tab--active' : ''}`}
                  onClick={() => setIntakeType('standard')}>
                  {t('accessionPage.intakeSelector.standard')}
                </button>
                <button type="button"
                  className={`ps-accession-intake-tab ps-accession-intake-tab--downtime ${intakeType === 'downtime' ? 'ps-accession-intake-tab--active' : ''}`}
                  onClick={() => setIntakeType('downtime')}>
                  ⚠ {t('accessionPage.intakeSelector.downtime')}
                </button>
                <button type="button"
                  className={`ps-accession-intake-tab ps-accession-intake-tab--outside ${intakeType === 'outside' ? 'ps-accession-intake-tab--active' : ''}`}
                  onClick={() => setIntakeType('outside')}>
                  ℹ {t('accessionPage.intakeSelector.outside')}
                </button>
              </div>

              {/* Downtime mode — real, per direct guidance: same amber
                  alert treatment, same mandatory reason dropdown, same
                  submit-time isDowntimeRecord/downtimeReasonCode
                  behavior as the checkbox this replaces — only the
                  trigger changed. */}
              {intakeType === 'downtime' && (
                <div className="ps-accession-downtime-banner">
                  <div className="ps-accession-intake-alert ps-accession-intake-alert--downtime">
                    ⚠ {t('accessionPage.intakeSelector.downtimeAlert')}
                  </div>
                  <div className="ps-accession-downtime-reason">
                    <label className="ps-label" htmlFor="accession-downtime-reason">{t('accessionPage.intakeSelector.downtimeReasonLabel')} <span className="ps-required">*</span></label>
                    <select id="accession-downtime-reason" className="ps-input-dark" value={downtimeReasonCode} onChange={e => setDowntimeReasonCode(e.target.value)}>
                      <option value="">{t('accessionPage.intakeSelector.selectReason')}</option>
                      {BREAK_GLASS_REASON_CODES.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Outside Patient mode — real, per direct guidance: a
                  neutral/informational badge, not an alert — this is a
                  real, expected external billing/report-distribution
                  workflow, not a data-quality exception the way
                  Downtime is. */}
              {intakeType === 'outside' && (
                <div className="ps-accession-intake-alert ps-accession-intake-alert--outside">
                  {/* PS-301: the raw "ℹ" character pulls in its own
                      fallback-font line-height, taller than the
                      surrounding text's, which pushed it up and out of
                      the box (looked like a positioning bug, but no
                      element here was ever actually position:absolute).
                      A wrapping span with a pinned line-height/
                      vertical-align keeps its box the same height as a
                      normal letter, so it sits on the same line as the
                      text instead of floating above it. */}
                  <span className="ps-accession-intake-alert__icon" aria-hidden="true">ℹ</span>
                  {t('accessionPage.intakeSelector.outsideAlert')}
                </div>
              )}
            </div>
            <div className="ps-accession-grid">
              <div>
                <label className="ps-label">{t('accessionPage.demographics.givenNames')}</label>
                <input data-phi="name" className="ps-input-dark" value={givenNames} onChange={e => setGivenNames(e.target.value)}
                  placeholder={t('accessionPage.demographics.givenNamesPlaceholder')} />
              </div>
              <div>
                <label className="ps-label">{t('accessionPage.demographics.familyNames')}</label>
                <input data-phi="name" className="ps-input-dark" value={familyNames} onChange={e => setFamilyNames(e.target.value)}
                  placeholder={t('accessionPage.demographics.familyNamesPlaceholder')} />
              </div>
              <div>
                <label className="ps-label">{t('accessionPage.demographics.preferredName')}</label>
                <input data-phi="name" className="ps-input-dark" value={preferredName} onChange={e => setPreferredName(e.target.value)}
                  placeholder={t('accessionPage.demographics.preferredNamePlaceholder')} />
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-prefix">{t('accessionPage.demographics.prefix')}</label>
                <select id="accession-prefix" className="ps-input-dark" value={namePrefix} onChange={e => setNamePrefix(e.target.value)}>
                  <option value="">{t('accessionPage.demographics.prefixNone')}</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mx.">Mx.</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Sir">Sir</option>
                  <option value="Dame">Dame</option>
                </select>
              </div>
              <div>
                <label className="ps-label">{t('accessionPage.demographics.suffix')}</label>
                <SuffixSelect value={nameSuffix} onChange={setNameSuffix} selectClassName="ps-input-dark" inputClassName="ps-input-dark" />
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-dob">{t('accessionPage.demographics.dob')}</label>
                <input id="accession-dob" data-phi="dob" className="ps-input-dark" type="date" value={dob} onChange={e => setDob(e.target.value)} />
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-sex">{t('accessionPage.demographics.sex')}</label>
                <select id="accession-sex" className="ps-input-dark" value={sex} onChange={e => setSex(e.target.value as 'M' | 'F' | 'U')}>
                  <option value="F">{t('accessionPage.demographics.sexFemale')}</option>
                  <option value="M">{t('accessionPage.demographics.sexMale')}</option>
                  <option value="U">{t('accessionPage.demographics.sexOther')}</option>
                </select>
              </div>
              {cytologyRelevant && (
                <div className="ps-card-dark ps-accession-conditional-card">
                  <div className="ps-label ps-accession-section-heading">
                    {t('accessionPage.cytology.heading')}
                  </div>
                  {/* Real, per direct guidance ("New tab, only would be
                      used for Cytology cases") — a real, local sub-tab
                      inside this existing, cytologyRelevant-gated card,
                      rather than a page-wide restructure. 'main' is
                      the real default, matching every field already
                      here today. */}
                  <div className="ps-sub-tab-group ps-sub-tab-group--spaced">
                    <button type="button" className={`ps-sub-tab-btn${accessionTab === 'main' ? ' active' : ''}`} onClick={() => setAccessionTab('main')}>
                      {t('accessionPage.cytology.tabPatientDetail')}
                    </button>
                    <button type="button" className={`ps-sub-tab-btn${accessionTab === 'clinical_history' ? ' active' : ''}`} onClick={() => setAccessionTab('clinical_history')}>
                      {t('accessionPage.cytology.tabClinicalHistory')}{clinicalHistoryEntries.length > 0 ? ` (${clinicalHistoryEntries.length})` : ''}
                    </button>
                  </div>

                  {accessionTab === 'main' && (
                    <>
                      <div className="ps-accession-specimen-row-3col">
                        <div>
                          <label className="ps-label" htmlFor="accession-lmp">{t('accessionPage.cytology.lmp')}</label>
                          <input id="accession-lmp" className="ps-input-dark" type="date" value={lmp} onChange={e => setLmp(e.target.value)} />
                        </div>
                        <div>
                          <label className="ps-label" htmlFor="accession-hormonal-status">{t('accessionPage.cytology.hormonalStatus')}</label>
                          <select id="accession-hormonal-status" className="ps-input-dark" value={hormonalStatus} onChange={e => setHormonalStatus(e.target.value as typeof hormonalStatus)}>
                            <option value="">{t('accessionPage.common.notSpecified')}</option>
                            <option value="premenopausal">{t('accessionPage.cytology.hormonalPremenopausal')}</option>
                            <option value="perimenopausal">{t('accessionPage.cytology.hormonalPerimenopausal')}</option>
                            <option value="postmenopausal">{t('accessionPage.cytology.hormonalPostmenopausal')}</option>
                            <option value="pregnant">{t('accessionPage.cytology.hormonalPregnant')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="ps-label" htmlFor="accession-reason-for-study">{t('accessionPage.cytology.reasonForStudy')}</label>
                          <select id="accession-reason-for-study" className="ps-input-dark" value={reasonForStudy} onChange={e => setReasonForStudy(e.target.value as typeof reasonForStudy)}>
                            <option value="">{t('accessionPage.common.notSpecified')}</option>
                            <option value="nhs_programme_invited">{t('accessionPage.cytology.reasonRoutineScreening')}</option>
                            <option value="private_or_opportunistic">{t('accessionPage.cytology.reasonPrivateOpportunistic')}</option>
                          </select>
                        </div>
                      </div>
                      <div className="ps-accession-specimen-row-3col ps-accession-specimen-row-3col--spaced-12">
                        {/* Real, per the uploaded spec's own Acceptance
                            Criteria 3 ("Category 1 (SCR): Prompts for
                            LMP and prior_hpv_result") — a new, simple
                            field, same real treatment as hormonalStatus
                            above. The old free-text "Prior Abnormal
                            Pap/HPV/Procedure History" input is retired
                            here — its real, structured replacement
                            (HX_PRIOR_ABNL_PAP_HPV) lives on the
                            Clinical History tab now. */}
                        <div>
                          <label className="ps-label" htmlFor="accession-prior-hpv-result">{t('accessionPage.cytology.priorHpvResult')}</label>
                          <select id="accession-prior-hpv-result" className="ps-input-dark" value={priorHpvResult} onChange={e => setPriorHpvResult(e.target.value as typeof priorHpvResult)}>
                            <option value="">{t('accessionPage.common.notSpecified')}</option>
                            <option value="positive">{t('accessionPage.cytology.hpvPositive')}</option>
                            <option value="negative">{t('accessionPage.cytology.hpvNegative')}</option>
                            <option value="not_tested">{t('accessionPage.cytology.hpvNotTested')}</option>
                            <option value="unknown">{t('accessionPage.cytology.hpvUnknown')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="ps-label" htmlFor="accession-iud">{t('accessionPage.cytology.iud')}</label>
                          <input id="accession-iud" className="ps-input-dark" value={iudOrContraceptionUse} onChange={e => setIudOrContraceptionUse(e.target.value)} placeholder={t('accessionPage.cytology.iudPlaceholder')} />
                        </div>
                      </div>
                      <label className="ps-accession-checkbox-row ps-accession-checkbox-row--spaced">
                        <input type="checkbox" checked={persistentContactBleedingAtCollection}
                          onChange={e => setPersistentContactBleedingAtCollection(e.target.checked)} />
                        {t('accessionPage.cytology.persistentBleeding')}
                      </label>
                    </>
                  )}

                  {accessionTab === 'clinical_history' && (
                    <ClinicalHistoryEntryPanel
                      specimenTypes={Array.from(new Set(specimens
                        .map(s => s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId)?.type : undefined)
                        .filter((st): st is string => !!st)))}
                      targets={[
                        { id: 'case', label: t('accessionPage.cytology.caseLevelTarget'), entries: clinicalHistoryEntries },
                        // Real, per direct guidance's own real LIS/
                        // cytology data-modeling follow-up — only
                        // offered as separate targets when this case
                        // genuinely has more than one real specimen;
                        // the panel itself hides the selector entirely
                        // in the single-specimen case.
                        ...(specimens.length > 1 ? specimens.map((s, i) => ({ id: `specimen-${i}`, label: t('accessionPage.cytology.specimenTarget', { label: s.label }), entries: s.clinicalHistory })) : []),
                      ]}
                      onChangeTarget={(targetId, newEntries) => {
                        if (targetId === 'case') { setClinicalHistoryEntries(newEntries); return; }
                        const idx = Number(targetId.replace('specimen-', ''));
                        setSpecimens(prev => prev.map((s, i) => i === idx ? { ...s, clinicalHistory: newEntries } : s));
                      }}
                      requestedCategory={requestedClinicalHistoryCategory}
                    />
                  )}
                </div>
              )}

              {autopsyRelevant && (
                <div className="ps-card-dark ps-accession-conditional-card">
                  <div className="ps-label ps-accession-section-heading">
                    {t('accessionPage.autopsy.heading')}
                  </div>

                  <div className="ps-accession-specimen-row-3col">
                    <div>
                      <label className="ps-label">{t('accessionPage.autopsy.jurisdiction')}</label>
                      <select className="ps-conf-select" value={autopsyForm.jurisdiction} onChange={e => setAutopsyForm({ ...autopsyForm, jurisdiction: e.target.value as AutopsyJurisdiction })}>
                        <option value="">{t('accessionPage.common.selectEllipsisDots')}</option>
                        {(Object.keys(JURISDICTION_LABELS) as AutopsyJurisdiction[]).map(j => (
                          <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ps-label">{t('accessionPage.autopsy.caseAuthority')}</label>
                      <select className="ps-conf-select" value={autopsyForm.caseAuthority} onChange={e => setAutopsyForm({ ...autopsyForm, caseAuthority: e.target.value as AutopsyCaseAuthority })}>
                        <option value="">{t('accessionPage.common.selectEllipsisDots')}</option>
                        <option value="medicolegal_forensic">{t('accessionPage.autopsy.authorityMedicolegal')}</option>
                        <option value="hospital_consented">{t('accessionPage.autopsy.authorityHospitalConsented')}</option>
                      </select>
                    </div>
                  </div>

                  {autopsyForm.caseAuthority === 'medicolegal_forensic' && (
                    <div className="ps-accession-specimen-row-3col ps-accession-specimen-row-3col--spaced-10">
                      <div>
                        <label className="ps-label">{t('accessionPage.autopsy.authorityType')}</label>
                        <input className="ps-conf-input" value={autopsyForm.authorityType} placeholder={t('accessionPage.autopsy.authorityTypePlaceholder')} onChange={e => setAutopsyForm({ ...autopsyForm, authorityType: e.target.value })} />
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.autopsy.verbalOrderAt')}</label>
                        <input type="datetime-local" className="ps-conf-input" value={autopsyForm.verbalOrderReceivedAt} onChange={e => setAutopsyForm({ ...autopsyForm, verbalOrderReceivedAt: e.target.value })} />
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.autopsy.verbalOrderFrom')}</label>
                        <input className="ps-conf-input" value={autopsyForm.verbalOrderReceivedFrom} placeholder={t('accessionPage.autopsy.verbalOrderFromPlaceholder')} onChange={e => setAutopsyForm({ ...autopsyForm, verbalOrderReceivedFrom: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {autopsyForm.caseAuthority === 'hospital_consented' && (
                    <div className="ps-accession-specimen-row-3col ps-accession-specimen-row-3col--spaced-10">
                      <div>
                        <label className="ps-label">{t('accessionPage.autopsy.consentingRelativeName')}</label>
                        <input className="ps-conf-input" value={autopsyForm.consentingRelativeName} onChange={e => setAutopsyForm({ ...autopsyForm, consentingRelativeName: e.target.value })} />
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.autopsy.relationship')}</label>
                        <input className="ps-conf-input" value={autopsyForm.consentingRelativeRelationship} placeholder={t('accessionPage.autopsy.relationshipPlaceholder')} onChange={e => setAutopsyForm({ ...autopsyForm, consentingRelativeRelationship: e.target.value })} />
                        {/* Real, per direct follow-up: "it all needs
                            to be wired" — resolveConsentingRelativePriority.ts
                            had zero real UI callers; this is that
                            real, informational surfacing. This field
                            stays genuine free text (real, deliberate
                            — see its own placeholder), so this is a
                            real hint alongside it, not a forced
                            structured dropdown. */}
                        {autopsyForm.jurisdiction && formatConsentingRelativePriorityHint(autopsyForm.jurisdiction) && (
                          <span className="ps-conf-field-hint">{formatConsentingRelativePriorityHint(autopsyForm.jurisdiction)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {!autopsyFormValidation.valid && (
                    <div className="ps-accession-validation-message">
                      {t('accessionPage.autopsy.validationMessage')}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="ps-label ps-label--with-badge">
                  {t('accessionPage.patientId.label')}
                  {/* Real feature, per direct specification: "UI Status
                      Indicator Component" — only shown once a real
                      facility is selected, since the jurisdiction (and
                      therefore which validator/format applies) is only
                      genuinely known at that point; patientIdStandard's
                      own 'US' default before then is a guess, not a real
                      context worth surfacing a status for yet. No real
                      HL7 status code is available at manual-entry time
                      (that only ever arrives via an imported/resolved
                      order — see OrderLookupModal.tsx's own future
                      extension point for wiring that through once real
                      ADT parsing surfaces it), so GB_EW correctly shows
                      Amber/"Unverified" rather than Green here — see
                      patientIdStatus.ts's own comment on that exact,
                      honest distinction. */}
                  {selectedFacility && (
                    <PatientIdStatusDot jurisdiction={selectedFacility.jurisdiction} rawId={mrn} />
                  )}
                </label>
                <input data-phi="mrn" className="ps-input-dark" value={mrn} onChange={e => setMrn(e.target.value)}
                  placeholder={selectedFacility
                    ? t('accessionPage.patientId.placeholderWithFacility', { standardLabel: t(patientIdStandard.labelKey), example: patientIdStandard.example })
                    : t('accessionPage.patientId.placeholderNoFacility')} />
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-priority">{t('accessionPage.priority.label')}</label>
                <select id="accession-priority" className="ps-input-dark" value={priority} onChange={e => setPriority(e.target.value as CasePriority)}>
                  {priorityLevels.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              {/* Real feature, per direct, detailed specification:
                  "Encounter Selector & Auto-Fill." Positioned
                  "directly above the facility/provider fields" per
                  the spec's own instruction — genuinely two different
                  real states, never both at once: a single real
                  active encounter already applied (the confirmation
                  badge + unlink control), or more than one real
                  active encounter found, awaiting a real accessioner
                  choice (the selector). Spans the full 3-column grid
                  width via the same ps-accession-field--full class
                  the rest of this page's own full-width rows already
                  use, rather than a new, one-off spanning rule. */}
              {encounterLookupState === 'loading' && (
                <div className="ps-accession-field--full">
                  <div className="ps-encounter-loading">{t('accessionPage.encounter.checking')}</div>
                </div>
              )}
              {linkedEncounter && (
                <div className="ps-accession-field--full">
                  <div className="ps-encounter-badge">
                    <span className="ps-encounter-badge-icon">✓</span>
                    <span className="ps-encounter-badge-text">
                      {t('accessionPage.encounter.autoFilled', { number: linkedEncounter.encounterNumber })}
                      {linkedEncounter.ward ? ` (${linkedEncounter.ward})` : linkedEncounter.department ? ` (${linkedEncounter.department})` : ''}
                    </span>
                    <button type="button" className="ps-encounter-badge-unlink" onClick={handleUnlinkEncounter}>
                      {t('accessionPage.encounter.changeUnlink')}
                    </button>
                  </div>
                </div>
              )}
              {!linkedEncounter && encounterCandidates.length > 0 && (
                <div className="ps-accession-field--full">
                  <label className="ps-label" htmlFor="accession-encounter-selector">
                    {t('accessionPage.encounter.selectLabel', { count: encounterCandidates.length })}
                  </label>
                  <select
                    id="accession-encounter-selector"
                    className="ps-input-dark"
                    defaultValue=""
                    onChange={e => {
                      const chosen = e.target.value
                        ? encounterCandidates.find(enc => enc.id === e.target.value) ?? null
                        : null;
                      handleSelectEncounterFromDropdown(chosen);
                    }}
                  >
                    <option value="" disabled>{t('accessionPage.encounter.chooseCorrect')}</option>
                    {encounterCandidates.map(enc => (
                      <option key={enc.id} value={enc.id}>
                        #{enc.encounterNumber} — {enc.encounterClass}
                        {enc.admitTime ? ` — ${new Date(enc.admitTime).toLocaleString()}` : ''}
                        {enc.facility ? ` — ${enc.facility}` : ''}
                        {[enc.ward, enc.room, enc.bed].filter(Boolean).length > 0 ? ` (${[enc.ward, enc.room, enc.bed].filter(Boolean).join('/')})` : ''}
                        {enc.attendingProvider ? ` — ${enc.attendingProvider}` : ''}
                      </option>
                    ))}
                    <option value="">{t('accessionPage.encounter.createWithoutLink')}</option>
                  </select>
                </div>
              )}

              <div>
                <label className="ps-label" htmlFor="accession-client">{t('accessionPage.facility.submittingFacility')}</label>
                <select id="accession-client" className="ps-input-dark" value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">{t('accessionPage.facility.selectFacility')}</option>
                  {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Real feature, per direct confirmation: "add the
                  Client and Location as fields to be seen in the
                  accession page." Optional — not every specimen has a
                  known, specific inpatient location (e.g. outpatient/
                  clinic specimens genuinely have none). */}
              <div>
                <label className="ps-label" htmlFor="accession-location">{t('accessionPage.facility.location')}</label>
                <select
                  id="accession-location" className="ps-input-dark"
                  value={locationId} onChange={e => setLocationId(e.target.value)}
                  disabled={!clientId}
                >
                  <option value="">
                    {!clientId ? t('accessionPage.facility.selectFacilityFirst') : locations.length === 0 ? t('accessionPage.facility.noLocationsConfigured') : t('accessionPage.facility.noneSpecified')}
                  </option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {[l.pointOfCare, l.room, l.bed].filter(Boolean).join(' / ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-origin-hospital">{t('accessionPage.facility.originHospital')}</label>
                <input id="accession-origin-hospital" className="ps-input-dark ps-input-readonly" readOnly disabled
                  value={user?.organisationId ? (getOrganisationDisplayName(originHospitalId) ?? originHospitalId) : t('accessionPage.facility.noOrganisationOnSession')} />
              </div>
              {originSites.length > 1 && (
                <div>
                  <label className="ps-label" htmlFor="accession-origin-site">{t('accessionPage.facility.siteFacility')}</label>
                  <select id="accession-origin-site" className="ps-input-dark" value={originSiteId} onChange={e => setOriginSiteId(e.target.value)}>
                    {originSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="ps-conf-form-field ps-amendment-physician-picker">
                <label className="ps-label">{t('accessionPage.provider.requestingProvider')}</label>
                <input
                  className="ps-amendment-physician-search"
                  value={requestingProvider || providerQuery}
                  onChange={e => { setProviderQuery(e.target.value); setRequestingProvider(''); setSelectedProvider(undefined); setShowProviderDropdown(true); }}
                  onFocus={e => {
                    if (requestingProvider) { setProviderQuery(requestingProvider); setRequestingProvider(''); }
                    setShowProviderDropdown(true);
                    e.target.select();
                  }}
                  onBlur={() => setTimeout(() => setShowProviderDropdown(false), 150)}
                  placeholder={t('accessionPage.provider.searchPlaceholder')}
                />
                {showProviderDropdown && filteredProviders.length > 0 && (
                  <div className="ps-amendment-physician-dropdown">
                    {filteredProviders.map(p => {
                      const fullName = `${p.givenNames} ${p.familyNames}`;
                      const rows = contactRowsFor(p);
                      return (
                        <div
                          key={p.id}
                          className="ps-amendment-physician-option"
                          onMouseDown={() => { setRequestingProvider(fullName); setSelectedProvider(p); setProviderQuery(''); setShowProviderDropdown(false); }}
                        >
                          <span className={`ps-amendment-physician-avatar ${avatarColorClass(fullName)}`}>
                            {initials(p.givenNames, p.familyNames)}
                          </span>
                          <span className="ps-amendment-physician-info">
                            <span className="ps-amendment-physician-name">
                              {fullName}
                              {p.status === 'Unverified' && <span className="ps-amendment-physician-unverified"> · {t('accessionPage.provider.unverified')}</span>}
                            </span>
                            <span className="ps-amendment-physician-specialty">{p.specialty}</span>
                            {rows.length > 0 && (
                              <span className="ps-amendment-physician-contact">
                                {rows.map((c, i) => (
                                  <span key={i} className={c.isPreferred ? 'ps-amendment-physician-contact-preferred' : undefined}>
                                    {c.icon} {c.value}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!showProviderDropdown && selectedProvider && (
                  <div className="ps-amendment-physician-selected-card">
                    <span className={`ps-amendment-physician-avatar ${avatarColorClass(requestingProvider)}`}>
                      {initials(selectedProvider.givenNames, selectedProvider.familyNames)}
                    </span>
                    <span className="ps-amendment-physician-info">
                      <span className="ps-amendment-physician-specialty">{selectedProvider.specialty}</span>
                      <span className="ps-amendment-physician-contact">
                        {contactRowsFor(selectedProvider).map((c, i) => (
                          <span key={i} className={c.isPreferred ? 'ps-amendment-physician-contact-preferred' : undefined}>
                            {c.icon} {c.value}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="ps-label" htmlFor="accession-assigned-to">{t('accessionPage.provider.assignPathologist')}</label>
                <select id="accession-assigned-to" className="ps-input-dark" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                  <option value="">{t('accessionPage.provider.unassigned')}</option>
                  {pathologists.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
              </div>
              <div className="ps-accession-field--full">
                <label className="ps-label">{t('accessionPage.clinicalIndication.label')}</label>
                <textarea className="ps-input-dark ps-accession-textarea"
                  value={clinicalIndication} onChange={e => setClinicalIndication(e.target.value)}
                  placeholder={t('accessionPage.clinicalIndication.placeholder')} />
              </div>
              {/* Real, per direct guidance ("should the accession do
                  this as they go rather than the current process"),
                  generalized to every intake type per direct follow-up
                  ("not sure if there is a point to this at accession
                  unless it's the maiden/married name scenario") — a
                  name-change match is genuinely relevant on any
                  ordinary accession, not just an Outside/Contract Case,
                  so this moved here from that tab. Real, deliberate
                  removal from this same location: a "Family Relation"
                  field briefly lived here too, for the newborn/mother
                  scenario — removed once it became clear that
                  scenario's real fix is moveCaseToPatient() (HL7 A43),
                  triggered once the newborn's own identity actually
                  exists, not something available to act on at THIS
                  moment. */}
              <div className="ps-accession-field--full">
                <PatientLinkSearch
                  organisationId={mpiScopeOrgId}
                  confirmed={samePersonLinkConfirmed}
                  onConfirm={setSamePersonLinkConfirmed}
                  title={t('accessionPage.patientLink.title')}
                  helpText={t('accessionPage.patientLink.helpText')}
                  confirmButtonLabel={t('accessionPage.patientLink.confirmButtonLabel')}
                  confirmedLabel={t('accessionPage.patientLink.confirmedLabel')}
                />
              </div>
              <div className="ps-accession-field--full">
                <label className="ps-label">{t('accessionPage.icd10.label')}</label>
                <Icd10Picker allCodes={allIcd10Codes} selected={icd10Codes} onChange={setIcd10Codes} />
              </div>
              <div className="ps-accession-field--full">
                <label className="ps-label">{t('accessionPage.caseComment.label')}</label>
                <button type="button"
                  className={`ps-accession-specimen-trigger${caseComments.length === 0 ? ' ps-accession-specimen-trigger--placeholder' : ''}`}
                  onClick={() => setCaseCommentModalOpen(true)}>
                  {caseComments.length === 0
                    ? t('accessionPage.caseComment.placeholder')
                    : t('accessionPage.caseComment.viewAdd', { count: caseComments.length })}
                </button>
              </div>
              <div className="ps-accession-field--full">
                <label className="ps-label">{t('accessionPage.caseDeficiency.label')}</label>
                <button type="button"
                  className={`ps-accession-specimen-trigger${caseManualDeficiencies.length === 0 ? ' ps-accession-specimen-trigger--placeholder' : ' ps-accession-specimen-trigger--deficiency'}`}
                  onClick={() => setCaseDeficiencyModalOpen(true)}>
                  {caseManualDeficiencies.length === 0
                    ? t('accessionPage.caseDeficiency.placeholder')
                    : caseManualDeficiencies.length === 1
                      ? t('accessionPage.deficiency.clickToEdit', { name: deficiencyTypes.find(dt => dt.id === caseManualDeficiencies[0].deficiencyTypeId)?.name ?? t('accessionPage.deficiency.reportedFallback') })
                      : t('accessionPage.deficiency.multipleReported', { count: caseManualDeficiencies.length })}
                </button>
              </div>
            </div>
            <div className="ps-accession-actions">
              <button className="ps-btn-primary" onClick={() => setTab('specimens')} disabled={!caseInfoValid}>
                {t('accessionPage.actions.nextSpecimens')} →
              </button>
            </div>
          </div>
        )}

        {tab === 'specimens' && (
          <div>
            {lastResult ? null : <>
            {specimens.map((s, idx) => {
              const selectedEntry = s.dictionaryEntryId ? dictionary.find(e => e.id === s.dictionaryEntryId) : undefined;
              return (
                <div key={idx} ref={idx === specimens.length - 1 ? lastSpecimenRowRef : undefined}
                  className={`ps-card-dark ps-accession-specimen-row ${s.needsDictionaryResolution ? 'ps-accession-specimen-row--deficient' : ''}`}>
                  <div className="ps-accession-specimen-badge">{s.label}</div>
                  <div className="ps-accession-specimen-field ps-accession-specimen-field--stacked">

                    {s.needsDictionaryResolution && (
                      <div className="ps-accession-deficiency-banner">
                        <strong>{t('accessionPage.specimens.deficiencyBannerTitle')}</strong>
                        <div>{t('accessionPage.specimens.deficiencyBannerBody', { text: s.unmatchedOrderText })}</div>
                        <button className="ps-btn-secondary ps-accession-deficiency-confirm" onClick={() => confirmCustomSpecimen(idx)}>
                          {t('accessionPage.specimens.confirmCustom')}
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="ps-label">{t('accessionPage.specimens.dictionaryEntryLabel', { label: s.label })}</label>
                      <button
                        type="button"
                        className={`ps-accession-specimen-trigger${!selectedEntry ? ' ps-accession-specimen-trigger--placeholder' : ''}`}
                        onClick={() => setPickerOpenForIdx(idx)}
                      >
                        {selectedEntry ? selectedEntry.name : t('accessionPage.specimens.selectFromDictionary')}
                      </button>
                    </div>

                    <div className="ps-accession-specimen-field--wide">
                      <label className="ps-label">{t('accessionPage.specimens.description')}</label>
                      <input className="ps-input-dark" value={s.description}
                        onChange={e => updateSpecimen(idx, e.target.value)}
                        placeholder={t('accessionPage.specimens.descriptionPlaceholder')} />
                    </div>

                    <div className="ps-accession-specimen-row-3col">
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.anatomicSite')}</label>
                        <input className="ps-input-dark" value={s.anatomicSite}
                          onChange={e => updateSpecimenField(idx, 'anatomicSite', e.target.value)}
                          placeholder={t('accessionPage.specimens.anatomicSitePlaceholder')} />
                      </div>
                      <div>
                        <label className="ps-label ps-label--with-badge">
                          {t('accessionPage.specimens.laterality')}
                          {/* Real feature, per direct follow-up: "I would
                              like to include the AI badge, confidence on
                              fields being suggested." Deliberately no
                              percentage — inferLateralityFromText.ts is a
                              real, deterministic keyword match, not an
                              AI/LLM confidence score, so a fabricated
                              number would misrepresent what actually
                              produced this value. Same visual language as
                              the Synoptic report's own AI badges (small,
                              rounded, colored), honestly labeled instead. */}
                          {s.lateralityInferred && (
                            <span
                              title={t('accessionPage.specimens.lateralitySuggestedTitle', { description: s.description })}
                              className="ps-laterality-suggested-badge"
                            >
                              <span className="ps-laterality-suggested-badge__icon">💡</span> {t('accessionPage.specimens.lateralitySuggested')}
                            </span>
                          )}
                        </label>
                        <select className="ps-input-dark" value={s.laterality}
                          onChange={e => updateSpecimenField(idx, 'laterality', e.target.value)}>
                          <option value="">{t('accessionPage.specimens.lateralityNotSpecified')}</option>
                          <option value="Left">{t('accessionPage.specimens.lateralityLeft')}</option>
                          <option value="Right">{t('accessionPage.specimens.lateralityRight')}</option>
                          <option value="Bilateral">{t('accessionPage.specimens.lateralityBilateral')}</option>
                          <option value="Midline">{t('accessionPage.specimens.lateralityMidline')}</option>
                          <option value="N/A">{t('accessionPage.specimens.lateralityNotApplicable')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.containerType')}</label>
                        <select className="ps-input-dark" value={s.containerType}
                          onChange={e => {
                            const selected = containerTypes.find(c => c.name === e.target.value);
                            updateSpecimenField(idx, 'containerType', e.target.value);
                            // Real, per direct request — defaults the real
                            // fixative volume from the selected container's
                            // own real capacity; stays editable afterward,
                            // never overwrites a value the accessioner
                            // already entered by hand.
                            if (selected?.capacityMl && !s.fixativeVolumeMl) {
                              updateSpecimenField(idx, 'fixativeVolumeMl', String(selected.capacityMl));
                            }
                          }}>
                          <option value="">{t('accessionPage.specimens.selectContainerType')}</option>
                          {(['histology', 'cytology', 'special_media'] as const).map(cat => {
                            const inCat = containerTypes.filter(c => c.category === cat);
                            if (inCat.length === 0) return null;
                            const label = cat === 'histology' ? t('accessionPage.specimens.containerCategoryHistology') : cat === 'cytology' ? t('accessionPage.specimens.containerCategoryCytology') : t('accessionPage.specimens.containerCategorySpecialMedia');
                            return (
                              <optgroup key={cat} label={label}>
                                {inCat.map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.fixativeVolume')}</label>
                        <input type="number" className="ps-input-dark" value={s.fixativeVolumeMl}
                          onChange={e => updateSpecimenField(idx, 'fixativeVolumeMl', e.target.value)}
                          placeholder={t('accessionPage.specimens.fixativeVolumePlaceholder')} />
                      </div>
                    </div>

                    {resolveSpecimenEntryMatchesCategory(selectedEntry, ['AUTOPSY']) && (
                      <div className="ps-accession-specimen-field--wide">
                        <label className="ps-label">
                          {t('accessionPage.specimens.organsIncluded')}
                        </label>
                        <div className="ps-autopsy-organ-groups">
                          {AUTOPSY_ORGAN_PICKER_GROUPS.map(group => (
                            <div key={group.sectionId}>
                              <div className="ps-autopsy-organ-group-title">{t(group.titleKey)}</div>
                              <div className="ps-autopsy-organ-chip-row">
                                {group.organs.map(organ => {
                                  const checked = (s.organCodes ?? []).includes(organ);
                                  return (
                                    <label
                                      key={organ}
                                      className={`ps-autopsy-organ-chip${checked ? ' ps-autopsy-organ-chip--checked' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const current = s.organCodes ?? [];
                                          const next = checked ? current.filter(o => o !== organ) : [...current, organ];
                                          setSpecimens(prev => prev.map((row, i) => i === idx ? { ...row, organCodes: next } : row));
                                        }}
                                      />
                                      {t(AUTOPSY_ORGAN_LABEL_KEY[organ])}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ps-accession-specimen-row-3col">
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.collectedAt')}</label>
                        <input className="ps-input-dark" type="datetime-local" value={s.collectedAt}
                          onChange={e => updateSpecimenField(idx, 'collectedAt', e.target.value)} />
                        <div className="ps-accession-field-hint">{t('accessionPage.specimens.collectedAtHint')}</div>
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.processedAt')}</label>
                        <input className="ps-input-dark" type="datetime-local" value={s.processedAt}
                          onChange={e => updateSpecimenField(idx, 'processedAt', e.target.value)} />
                        <label className="ps-accession-checkbox-row">
                          <input type="checkbox" checked={s.processedAtIsEstimated}
                            onChange={e => updateSpecimenField(idx, 'processedAtIsEstimated', e.target.checked)} />
                          {t('accessionPage.specimens.processedAtEstimated')}
                        </label>
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.receivedAt')}</label>
                        <input className="ps-input-dark" type="datetime-local" value={s.receivedAt}
                          onChange={e => updateSpecimenField(idx, 'receivedAt', e.target.value)} />
                      </div>
                    </div>

                    {/* Real feature, per direct follow-up: "Accessioning
                        isn't wired to the foreign-ID collision check."
                        The real "cytology fluid" case this whole
                        feature traces back to — a received specimen
                        already carrying an outside lab's own
                        identifier, entered here at the moment it's
                        first accessioned, never re-labeled. Same real
                        pattern as SpecimenEditModal.tsx/
                        BlockStainEditorModal.tsx's own identical
                        fields elsewhere in this app. */}
                    <div className="ps-accession-specimen-row-3col">
                      <div>
                        {/* Real fix (PS-302 — "'Foreign ID' field label
                            is unclear") — relabeled to say what this
                            actually is: an identifier the specimen
                            already carries from an outside/referring
                            lab, same relabel as SpecimenEditModal.tsx/
                            ForeignIdFields.tsx's own identical fields.
                            externalId/externalIdSource themselves are
                            unchanged.
                            Real fix (PS-314) — relabeled again to
                            "Referral Client", same follow-up wording
                            and reasoning as ForeignIdFields.tsx's own
                            identical relabel; this modal keeps its own
                            separate copy of these fields, so it needs
                            the same update to stay in sync. */}
                        <label className="ps-label">{t('accessionPage.specimens.referralClient')}</label>
                        <input className="ps-input-dark" value={s.externalIdSource}
                          onChange={e => updateSpecimenField(idx, 'externalIdSource', e.target.value)}
                          onBlur={() => checkSpecimenForeignIdCollision(idx)}
                          placeholder={t('accessionPage.specimens.referralClientPlaceholder')} />
                      </div>
                      <div>
                        <label className="ps-label">{t('accessionPage.specimens.referralClientId')}</label>
                        <input className="ps-input-dark" value={s.externalId}
                          onChange={e => updateSpecimenField(idx, 'externalId', e.target.value)}
                          onBlur={() => checkSpecimenForeignIdCollision(idx)}
                          placeholder={t('accessionPage.specimens.referralClientIdPlaceholder')} />
                      </div>
                    </div>
                    {specimenForeignIdCollisions[idx] && (
                      <div className="ps-accession-specimen-field--wide ps-foreign-id-collision-warning">
                        <div className="ps-foreign-id-collision-warning-text">
                          {('withinDraft' in specimenForeignIdCollisions[idx]!)
                            ? t('accessionPage.specimens.foreignIdCollisionWithinDraft', { label: (specimenForeignIdCollisions[idx] as { otherLabel: string }).otherLabel })
                            : t('accessionPage.specimens.foreignIdCollisionExisting', { recordLabel: (specimenForeignIdCollisions[idx] as ForeignIdCollision).recordLabel, caseAccession: (specimenForeignIdCollisions[idx] as ForeignIdCollision).caseAccession })
                          }
                        </div>
                      </div>
                    )}

                    {/* Real fix (PS-303 — "Move optional comments/
                        deficiencies to the bottom of the panel"):
                        these two used to sit right after Description,
                        ahead of every real intake field (Anatomic
                        Site, Container Type, collection/fixation
                        timestamps, Outside Lab ID) — pushing the
                        fields an accessioner fills in on essentially
                        every real specimen further down, behind two
                        genuinely optional, comparatively rare ones
                        (Referral Client ID, renamed under PS-314 — see
                        that field's own doc comment above).
                        Moved here, after every other specimen field,
                        content and behavior otherwise unchanged. */}
                    <div className="ps-accession-specimen-field--wide">
                      <label className="ps-label">{t('accessionPage.specimens.comment')}</label>
                      <button type="button"
                        className={`ps-accession-specimen-trigger${s.comments.length === 0 ? ' ps-accession-specimen-trigger--placeholder' : ''}`}
                        onClick={() => setSpecimenCommentOpenForIdx(idx)}>
                        {s.comments.length === 0
                          ? t('accessionPage.specimens.commentPlaceholder')
                          : t('accessionPage.specimens.commentViewAdd', { count: s.comments.length })}
                      </button>
                    </div>

                    <div className="ps-accession-specimen-field--wide">
                      <label className="ps-label">{t('accessionPage.specimens.deficienciesLabel')}</label>
                      <button type="button"
                        className={`ps-accession-specimen-trigger${s.manualDeficiencies.length === 0 ? ' ps-accession-specimen-trigger--placeholder' : ' ps-accession-specimen-trigger--deficiency'}`}
                        onClick={() => setDeficiencyModalOpenForIdx(idx)}>
                        {s.manualDeficiencies.length === 0
                          ? t('accessionPage.specimens.deficienciesPlaceholder')
                          : s.manualDeficiencies.length === 1
                            ? t('accessionPage.deficiency.clickToEdit', { name: deficiencyTypes.find(dt => dt.id === s.manualDeficiencies[0].deficiencyTypeId)?.name ?? t('accessionPage.deficiency.reportedFallback') })
                            : t('accessionPage.deficiency.multipleReported', { count: s.manualDeficiencies.length })}
                      </button>
                    </div>

                    {s.resolvedDepartmentName && (
                      <div className={`ps-accession-assignment-meta ${s.departmentWasAutoCreated ? 'ps-accession-assignment-meta--warn' : ''}`}>
                        {t('accessionPage.specimens.departmentNote', { name: s.resolvedDepartmentName })}{s.departmentWasAutoCreated ? t('accessionPage.specimens.departmentNewPending') : ''}
                      </div>
                    )}
                  </div>
                  {specimens.length > 1 && (
                    <button className="ps-btn-icon ps-accession-remove-btn" onClick={() => removeSpecimen(idx)} title={t('accessionPage.specimens.removeSpecimen')}>✕</button>
                  )}
                </div>
              );
            })}
            <button className="ps-btn-secondary ps-accession-add-btn" onClick={addSpecimen}>{t('accessionPage.specimens.addSpecimen')}</button>

            {pickerOpenForIdx !== null && (
              <SpecimenDictionaryPicker
                dictionary={dictionary}
                currentEntryId={specimens[pickerOpenForIdx]?.dictionaryEntryId || undefined}
                onSelect={entry => {
                  applyDictionaryEntry(pickerOpenForIdx, entry?.id ?? '');
                }}
                onClose={() => setPickerOpenForIdx(null)}
              />
            )}

            {specimenCommentOpenForIdx !== null && (
              <ReportCommentModal
                specimenName={`${t('accessionPage.grossing.specimenLabel', { label: specimens[specimenCommentOpenForIdx].label })} \u203a ${specimens[specimenCommentOpenForIdx].description || t('accessionPage.specimens.noDescriptionYet')}`}
                specimenId={specimens[specimenCommentOpenForIdx].label}
                comments={specimens[specimenCommentOpenForIdx].comments}
                isFinalized={false}
                currentUserId={user?.id ?? 'unknown'}
                currentUserName={user?.name ?? 'Unknown User'}
                onAddComment={text => addSpecimenComment(specimenCommentOpenForIdx, text)}
                onClose={() => setSpecimenCommentOpenForIdx(null)}
              />
            )}

            {deficiencyModalOpenForIdx !== null && (
              <ReportDeficiencyModal
                context="specimen"
                specimenLabel={specimens[deficiencyModalOpenForIdx].label}
                deficiencyTypes={deficiencyTypes}
                existing={specimens[deficiencyModalOpenForIdx].manualDeficiencies}
                onSave={(deficiencies) => {
                  setSpecimens(prev => prev.map((s, i) =>
                    i === deficiencyModalOpenForIdx ? { ...s, manualDeficiencies: deficiencies } : s
                  ));
                  setDeficiencyModalOpenForIdx(null);
                }}
                onClose={() => setDeficiencyModalOpenForIdx(null)}
              />
            )}

            <div className="ps-card-dark ps-accession-card">
              <h3>{t('accessionPage.readyCard.heading')}</h3>
              <p className="ps-accession-summary-meta" data-phi="name">
                {formatFullDisplayName({ namePrefix, givenNames, familyNames, preferredName, nameSuffix })}
                {preferredName.trim() && ` (${preferredName.trim()})`}
                {/* Real fix (PS-300 — "Ready to accession count should
                    only count records where required fields have
                    actually been filled in"): raw specimens.length
                    includes empty placeholder rows with no description
                    yet, same real over-count the Specimens tab label
                    itself already fixed via filledSpecimenCount below
                    — reused here rather than a second, separate count
                    that could drift from it. */}
                {' '}· {t('accessionPage.readyCard.specimenCount', { count: filledSpecimenCount })} · {priority}
                {selectedFacility ? ` · ${selectedFacility.name}` : ''}
              </p>
            </div>

            {departmentConflictNames && (
              <div className="ps-warning-banner">
                {t('accessionPage.departmentConflict.message', { names: departmentConflictNames.join(' and ') })}
              </div>
            )}

            <div className="ps-accession-actions ps-accession-actions--split">
              <button className="ps-btn-secondary" onClick={() => setTab('case')}>← {t('accessionPage.actions.back')}</button>
              <button className="ps-btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? t('accessionPage.actions.assigningTemplates') : t('accessionPage.actions.submitAccession')}
              </button>
            </div>
            </>}

            {justAccessionedCase && (
              <div className="ps-card-dark ps-accession-card">
                <h3>{t('accessionPage.labelsCard.heading')}</h3>
                <p className="ps-accession-print-hint">
                  {t('accessionPage.labelsCard.hint', { count: justAccessionedCase.specimens.length })} <strong data-phi="accession">{justAccessionedCase.caseData.accession.fullAccession}</strong>.
                </p>
                <button className="ps-btn-secondary" onClick={handlePrintLabels}>🖨️ Print Labels</button>
              </div>
            )}

            {lastResult && (
              <div className="ps-card-dark ps-accession-card">
                <h3>{t('accessionPage.grossing.heading')}</h3>
                {lastResult.assignments.map(a => (
                  <div key={a.specimenId} className="ps-form-row ps-accession-assignment-row">
                    <div className="ps-accession-assignment-head">
                      <strong className="ps-accession-assignment-name">{a.specimenId.split('-SP-')[1] ?? a.specimenId}</strong>
                      <span className={`ps-accession-assignment-meta ${a.belowThreshold ? 'ps-accession-assignment-meta--warn' : ''}`}>
                        {a.templateName} {a.fromOverride ? t('accessionPage.grossing.override') : t('accessionPage.grossing.confidence', { value: a.confidence })}
                      </span>
                    </div>
                    <div className="ps-accession-assignment-reason">{a.reason}</div>
                  </div>
                ))}
                {lastResult.warnings.length > 0 && (
                  <div className="ps-accession-warnings">
                    {lastResult.warnings.map((w, i) => (
                      <div key={i} className="ps-accession-warning-item">{w}</div>
                    ))}
                  </div>
                )}

                <h3 className="ps-accession-blocks-heading">{t('accessionPage.grossing.blocksHeading')}</h3>
                {lastResult.specimenBlocks.map(sb => (
                  <div key={sb.specimenId} className="ps-accession-blocks-specimen">
                    <strong className="ps-accession-assignment-name">{t('accessionPage.grossing.specimenLabel', { label: sb.label })}</strong>
                    {sb.blocks.map(block => (
                      <div key={block.id} className="ps-accession-block-row">
                        <span className="ps-accession-block-label">
                          {t('accessionPage.grossing.blockLabel', { label: block.label })}{block.sourcePathwayName ? ` (${block.sourcePathwayName})` : ''}
                        </span>
                        <span className="ps-accession-block-status">{block.status}</span>
                        <span className="ps-accession-block-stains">
                          {block.stains.length ? block.stains.map(st => st.stainName).join(', ') : t('accessionPage.grossing.noStainsYet')}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="ps-accession-actions ps-accession-actions--split">
                  <button className="ps-btn-secondary" onClick={resetForm}>{t('accessionPage.actions.accessionAnother')}</button>
                  <button className="ps-btn-primary" onClick={() => navigate('/worklist')}>{t('accessionPage.actions.goToWorklist')} →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'outside_patient' && (
          <div className="ps-card-dark ps-accession-card">
            <div className="ps-accession-outside-header">
              <h3 className="ps-accession-outside-title">{t('accessionPage.outsidePatient.title')}</h3>
              <p className="ps-accession-outside-subtitle">
                {t('accessionPage.outsidePatient.subtitle')}
              </p>
            </div>

            {/* SECTION 1: CLIENT & ORIGIN — real, per direct guidance:
                Client Account and Ordering Provider reuse the existing
                Case & Patient tab's own clientId/requestingProvider
                selections directly rather than duplicating a second
                picker — confirmed there's no separate outside-client
                directory to build. Account Billing Type is the one
                genuinely new field here. */}
            <div className="ps-accession-outside-section">
              <div className="ps-accession-outside-section-title">{t('accessionPage.outsidePatient.facilityOrigin')}</div>
              <div className="ps-accession-grid">
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.facilityAccount')}</label>
                  <input className="ps-input-dark" disabled value={selectedFacility?.name ?? t('accessionPage.outsidePatient.facilityAccountPlaceholder')} />
                </div>
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.orderingProvider')}</label>
                  <input className="ps-input-dark" disabled value={requestingProvider || t('accessionPage.outsidePatient.orderingProviderPlaceholder')} />
                </div>
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.billingType')}</label>
                  <input className="ps-input-dark" value={outsidePatientData.accountBillingType ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, accountBillingType: e.target.value }))}
                    placeholder={t('accessionPage.outsidePatient.billingTypePlaceholder')} />
                </div>
              </div>
            </div>

            {/* SECTION 2: PATIENT & JURISDICTION IDENTIFICATION — real,
                per direct guidance dynamic-behavior rule 2: changing
                Primary Jurisdiction updates the real Local ID Number
                label. Options are the real, distinct country codes
                actually present in the Jurisdiction Payment Mapping
                dictionary (services/billing/), not a separate,
                hardcoded country list that could drift from it. */}
            <div className="ps-accession-outside-section">
              <div className="ps-accession-outside-section-title">{t('accessionPage.outsidePatient.patientJurisdiction')}</div>
              <div className="ps-accession-grid">
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.primaryJurisdiction')}</label>
                  <select className="ps-input-dark" value={outsidePatientData.primaryJurisdictionCountryCode ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, primaryJurisdictionCountryCode: e.target.value, primaryJurisdictionMappingId: undefined }))}>
                    <option value="">{t('accessionPage.outsidePatient.select')}</option>
                    {Array.from(new Set(jurisdictionMappings.map(m => m.countryCode))).sort().map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ps-label">
                    {(() => {
                      // Real, per direct guidance: the real, dynamic
                      // local-ID label now comes from the SPECIFIC
                      // scheme actually selected below, not just "the
                      // first scheme found in this jurisdiction" — a
                      // real, deliberate correction made alongside the
                      // precise-mapping-id fix, since the earlier,
                      // approximate label had the same real ambiguity
                      // risk this whole fix addresses.
                      const selected = jurisdictionMappings.find(m => m.id === outsidePatientData.primaryJurisdictionMappingId);
                      return selected ? t('accessionPage.outsidePatient.localIdNumberWithScheme', { scheme: selected.localSchemeCode }) : t('accessionPage.outsidePatient.localIdNumber');
                    })()}
                  </label>
                  <input className="ps-input-dark" value={outsidePatientData.localIdNumber ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, localIdNumber: e.target.value }))}
                    placeholder={outsidePatientData.primaryJurisdictionMappingId ? '' : t('accessionPage.outsidePatient.localIdPlaceholder')} />
                </div>
              </div>
            </div>

            {/* Real, per direct follow-up: the "Check for Existing
                Patient" search that used to live here moved to the
                Case & Patient tab, generalized to every intake type —
                it's a same_person question, not something specific to
                Outside/Contract Case. See that tab's own comment for
                the full account. */}

            {/* SECTION 3: FINANCIAL CLASS & COVERAGE ROUTING — real,
                per direct guidance: the Payment Category picker now
                selects the SPECIFIC JurisdictionPaymentMapping row, not
                a deduplicated Master Payment Type — a real, confirmed
                fix. A bare master category (e.g.
                STATUTORY_SOCIAL_HEALTH) is genuinely ambiguous the
                moment a country has more than one real local scheme
                mapping to it; nothing in the dictionary schema
                prevents that, even though today's 13 seed rows happen
                not to have a case of it. A downstream financial engine
                needs to know EXACTLY which real scheme applied to pick
                the right outbound claims format — see
                buildFinancialClassPayload.ts for the full account.
                Primary Payer/Fund is deliberately free text —
                confirmed directly no payer/fund registry exists in
                this app; see OutsidePatientFinancialData.ts's own
                header for why. */}
            <div className="ps-accession-outside-section">
              <div className="ps-accession-outside-section-title">{t('accessionPage.outsidePatient.financialClass')}</div>
              <div className="ps-accession-grid">
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.paymentCategory')}</label>
                  <select className="ps-input-dark" value={outsidePatientData.primaryJurisdictionMappingId ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, primaryJurisdictionMappingId: e.target.value }))}
                    disabled={!outsidePatientData.primaryJurisdictionCountryCode}>
                    <option value="">{t('accessionPage.outsidePatient.select')}</option>
                    {jurisdictionMappings.filter(m => m.countryCode === outsidePatientData.primaryJurisdictionCountryCode).map(m => {
                      const departmentName = masterPaymentTypes.find(mpt => mpt.id === m.masterPaymentTypeId)?.displayName ?? m.masterPaymentTypeId;
                      return <option key={m.id} value={m.id}>{departmentName} — {m.localDisplayTerminology}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.primaryPayer')}</label>
                  <input className="ps-input-dark" value={outsidePatientData.primaryPayerName ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, primaryPayerName: e.target.value }))} />
                </div>
                <div>
                  <label className="ps-label">{t('accessionPage.outsidePatient.coveragePolicy')}</label>
                  <input className="ps-input-dark" value={outsidePatientData.coveragePolicyNumber ?? ''}
                    onChange={e => setOutsidePatientData(d => ({ ...d, coveragePolicyNumber: e.target.value }))} />
                </div>
              </div>

              <label className="ps-accession-checkbox-row ps-accession-checkbox-row--spaced">
                <input type="checkbox" checked={!!outsidePatientData.hasSecondaryCoverage}
                  onChange={e => setOutsidePatientData(d => ({ ...d, hasSecondaryCoverage: e.target.checked }))} />
                {t('accessionPage.outsidePatient.applySecondary')}
              </label>

              {outsidePatientData.hasSecondaryCoverage && (
                <div className="ps-accession-outside-secondary-box">
                  <div className="ps-accession-grid">
                    <div>
                      <label className="ps-label">{t('accessionPage.outsidePatient.secondaryCategory')}</label>
                      <select className="ps-input-dark" value={outsidePatientData.secondaryJurisdictionMappingId ?? ''}
                        onChange={e => setOutsidePatientData(d => ({ ...d, secondaryJurisdictionMappingId: e.target.value }))}>
                        <option value="">{t('accessionPage.outsidePatient.select')}</option>
                        {jurisdictionMappings
                          .filter(m => m.countryCode === outsidePatientData.primaryJurisdictionCountryCode)
                          .filter(m => masterPaymentTypes.find(mpt => mpt.id === m.masterPaymentTypeId)?.supportsSplitBilling)
                          .map(m => {
                            const departmentName = masterPaymentTypes.find(mpt => mpt.id === m.masterPaymentTypeId)?.displayName ?? m.masterPaymentTypeId;
                            return <option key={m.id} value={m.id}>{departmentName} — {m.localDisplayTerminology}</option>;
                          })}
                      </select>
                    </div>
                    <div>
                      <label className="ps-label">{t('accessionPage.outsidePatient.secondaryPayer')}</label>
                      <input className="ps-input-dark" value={outsidePatientData.secondaryPayerName ?? ''}
                        onChange={e => setOutsidePatientData(d => ({ ...d, secondaryPayerName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="ps-label">{t('accessionPage.outsidePatient.memberCardId')}</label>
                      <input className="ps-input-dark" value={outsidePatientData.secondaryMemberId ?? ''}
                        onChange={e => setOutsidePatientData(d => ({ ...d, secondaryMemberId: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {caseCommentModalOpen && (
        <CaseCommentModal
          accession={t('accessionPage.caseComment.notYetAccessioned')}
          comments={caseComments}
          currentUserId={user?.id ?? 'unknown'}
          currentUserName={user?.name ?? 'Unknown User'}
          onAddComment={addCaseComment}
          onClose={() => setCaseCommentModalOpen(false)}
        />
      )}

      {/* Was previously nested inside {tab === 'specimens' && (...)} — a
          real, confirmed bug: this modal's own trigger button lives on
          the Case & Patient tab, so clicking it while on that tab set
          caseDeficiencyModalOpen to true but the modal's JSX didn't even
          exist in the tree yet (tab was still 'case'), so nothing
          visibly happened. Moved here, tab-independent, matching the
          same correct pattern CaseCommentModal right above already
          uses for the identical trigger-modal relationship. */}
      {caseDeficiencyModalOpen && (
        <ReportDeficiencyModal
          context="case"
          deficiencyTypes={deficiencyTypes}
          existing={caseManualDeficiencies}
          onSave={(deficiencies) => {
            setCaseManualDeficiencies(deficiencies);
            setCaseDeficiencyModalOpen(false);
          }}
          onClose={() => setCaseDeficiencyModalOpen(false)}
        />
      )}

      {intraopMatch && (
        <IntraopMergePromptModal
          caseId={intraopMatch.caseId}
          match={intraopMatch.match}
          onMergeNow={async () => {
            await intraoperativeService.merge(intraopMatch.match.entry.id, intraopMatch.caseId, {
              matchType: intraopMatch.match.matchType,
              confidence: intraopMatch.match.confidence,
              wasManualOverride: false, // this modal only offers Merge Now / Go to Queue Later / Dismiss — no manual case-ID entry
              performedBy: user?.name ?? 'Unknown User',
            });
            toast.success(<PhiToastMessage>{t('accessionPage.toast.intraopMerged', { caseId: intraopMatch.caseId })}</PhiToastMessage>);
            setIntraopMatch(null);
          }}
          onGoToQueueLater={() => { setIntraopMatch(null); navigate('/intraop-queue'); }}
          onDismiss={() => setIntraopMatch(null)}
        />
      )}

      <OrderLookupModal
        isOpen={orderLookupModalOpen}
        initialQuery={orderLookupInitialQuery}
        pendingOrders={pendingOrders}
        organisationId={mpiScopeOrgId}
        searchDobFormat={searchDobFormat}
        dobFormatHint={searchDobFormatHint}
        onSelectOrder={orderId => {
          setOrderLookupModalOpen(false);
          handleImportOrder(orderId);
        }}
        onSelectPatient={patient => {
          setOrderLookupModalOpen(false);
          handleSelectExistingPatient(patient);
        }}
        onClose={() => setOrderLookupModalOpen(false)}
      />

      <ConfirmModal
        show={!!pendingImportOrderId}
        title={t('accessionPage.confirmReplace.title')}
        message={t('accessionPage.confirmReplace.message')}
        confirmLabel={t('accessionPage.confirmReplace.confirmLabel')}
        onConfirm={confirmImportOrder}
        onCancel={() => setPendingImportOrderId(null)}
      />

      {/* Real, confirmed gap: this page previously had no confirmation UI
          at all for the shared unsaved-changes system — setDirty() alone
          correctly blocks navigation via AppShell's guardedNavigate, but
          the DirtyStateContext provider itself renders nothing; every
          page that wants this protection has to supply its own dialog
          reacting to pendingPath. Without this, the user would click a
          nav link and nothing would visibly happen — blocked, but with
          no way to actually confirm or cancel leaving. */}
      <ConfirmModal
        show={!!pendingPath}
        title={t('accessionPage.confirmLeave.title')}
        message={t('accessionPage.confirmLeave.message')}
        confirmLabel={t('accessionPage.confirmLeave.confirmLabel')}
        onConfirm={confirmNavigate}
        onCancel={cancelNavigate}
      />
    </div>
  );
};

export default AccessionPage;
