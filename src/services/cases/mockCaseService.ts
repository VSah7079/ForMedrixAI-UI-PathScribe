// src/services/cases/mockCaseService.ts
// ─────────────────────────────────────────────────────────────
// Realistic mock cases for PathScribe development & QA.
// Each case has coherent patient, specimens, narratives and
// pre-filled synoptic answers. As of the CAP/RCPath content-licensing
// cleanup, field/option IDs are generic placeholders matching the
// templates in templateService.ts's editorStore -- not CAP/RCPath-derived.

import { ICaseService } from "./ICaseService";
import { ConcurrencyConflictError } from "./ConcurrencyConflictError";
import { callAi } from '../aiIntegration/aiProviderService';
import { resolveAiConfigOverrideForClient } from '../../components/Config/AI/resolveClientAiModel';
import { Case, CaseParticipant, ProtocolChange } from "../../types/case/Case";
import { CaseStatus } from "../../types/case/CaseStatus";
import { storageSet } from "../mockStorage";
import type { SynopticEvaluationInput, SynopticEvaluationResult } from '../aiIntegration/IAIIntegrationService';
import type { GrossingEvaluationInput, GrossingEvaluationResult, GrossingTemplateAssignment, GrossingFitEvaluationInput, GrossingFitEvaluationResult } from '../grossing/IGrossingEvaluationService';
import { applyCaseFilters, applyCasePagination } from './caseFilterUtils';
import { mockOrchestratorCaseService } from './mockOrchestratorCaseService';
import { mockDelegationTypeService } from '../delegationTypes/mockDelegationTypeService';
import { syncPrimaryAssignee } from './caseAssignmentSync';
import { mockSubspecialtyService } from '../subspecialties/mockSubspecialtyService';
import { mapDelegationTypeToParticipationRole } from '../delegationTypeMapper';
import { isOrchCaseId } from './reportingModeRouting';

const STORAGE_KEY = 'cases';

// Seed from storage if available, otherwise use MOCK_CASES defined below
// (populated after MOCK_CASES declaration)

const delay = (ms = 30) => new Promise(res => setTimeout(res, ms));

// Real, honest justification for both functions below: these generate
// FAKE, illustrative timestamps for seeded demo data ("N years/days ago
// from right now"), not bucketing a real, stored clinical event by
// facility timezone. The result is a real, absolute UTC instant (via
// toISOString()) regardless of which timezone runs this code.
function isoYearsAgo(years: number, month = 6, day = 15): string {
  // eslint-disable-next-line no-restricted-properties -- see real, honest justification above this function
  return new Date(new Date().getFullYear() - years, month - 1, day).toISOString();
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  // eslint-disable-next-line no-restricted-properties -- see real, honest justification above isoYearsAgo
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
/** Real feature, per direct follow-up: "update the mock data files -
 *  bump the version." Same real justification as isoDaysAgo above —
 *  seed timestamps need to stay relative to "now" (not a fixed date
 *  that silently drifts stale as this app keeps running), and
 *  locationHistory[] entries need real, spread-out HOUR-level
 *  granularity (Accessioning through Aliquot storage realistically
 *  spans under two days, not whole days apart) that isoDaysAgo alone
 *  can't express. */
function isoHoursAgo(hours: number): string {
  const d = new Date();
  // eslint-disable-next-line no-restricted-properties -- see real, honest justification above isoYearsAgo
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}
// ─── Mock Cases ────────────────────────────────────────────────────────────────

const MOCK_CASES: Case[] = [

  // ── Case 1: Breast Invasive — multi-report, in-progress ──────────────────
  {
    id: 'S26-4401-BX-001',
    identifiers: ['SLD-BC2026001A', 'SLD-BC2026001B'],
    accession: { accessionNumber: '4401', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4401-BX-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-001', mrn: '100001',
      firstName: 'Grace', lastName: 'Thompson',
      dateOfBirth: isoYearsAgo(52, 3, 14), sex: 'F',
      phone: '555-201-4411', email: 'grace.thompson@example.org',
      address: '14 Maple Ave, Phoenix, AZ 85001',
    },
    specimens: [
      { id: 'S26-4401-SP-1', label: 'A', description: 'Left breast mastectomy', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [{ id: 'migrated-f25-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f25', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }, { id: 'migrated-f30-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f30', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }],
        blocks: [
          { id: 'blk-4401-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-4401-a1-1', stainName: 'H&E', status: 'Ready for Review' },
            { id: 'stn-4401-a1-2', stainName: 'ER', status: 'Staining' },
            { id: 'stn-4401-a1-3', stainName: 'PR', status: 'Staining' },
            { id: 'stn-4401-a1-4', stainName: 'HER2', status: 'Pending Cut' },
          ] },
          { id: 'blk-4401-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-4401-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
        ],
        comments: [
          { id: 'cmt-demo-sp-lis-001', authorId: 'lis-system', authorName: 'Metro General LIS',
            text: '<p>Specimen orientation: superior suture short, lateral suture long \u2014 per OR communication.</p>',
            createdAt: isoDaysAgo(3), origin: 'lis' },
        ],
      },
      { id: 'S26-4401-SP-2', label: 'B', description: 'Left axillary sentinel lymph node', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Sarah Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Invasive ductal carcinoma, left breast 10 o\'clock, ER+/PR+/HER2 2+. Proceeding to mastectomy following multidisciplinary tumour board recommendation.', receivedDate: isoDaysAgo(3), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
      // Example data added to demonstrate the LIS/PathScribe comment
      // origin distinction — this is an LIS-mode (S26-) case, exactly
      // where that distinction actually matters. The 'lis' comment
      // simulates something received from the owning LIS; the
      // 'pathscribe' one simulates a reply typed in PathScribe, shown
      // with a non-default sync status (acknowledged) so both ends of
      // that state range are visible without needing to actually wait
      // for a real sync cycle.
      caseComments: [
        {
          id: 'cmt-demo-lis-001', authorId: 'lis-system', authorName: 'Metro General LIS',
          text: '<p>Requisition received with verbal order for STAT sentinel node frozen section — confirmed with Dr. Chen\u2019s office 8:15am.</p>',
          createdAt: isoDaysAgo(3), origin: 'lis',
        },
        {
          id: 'cmt-demo-ps-001', authorId: 'PATH-001', authorName: 'Pete Nimmo',
          text: '<p>Frozen section performed and reported to OR at 9:40am — margins clear, proceeding with planned mastectomy.</p>',
          createdAt: isoDaysAgo(2), origin: 'pathscribe', syncStatus: 'acknowledged',
        },
      ],
      requisitionNumber: 'REQ-2026-44001', externalOrderId: 'EXT-LAB-0441', labNumber: 'BLK-SP1-A1', blockId: 'BLK-SP1-A1', referralNumber: null,
    },
    diagnostic: {
      grossDescription: 'Received fresh labeled "left breast mastectomy" is a 487g specimen, 18.0 × 14.0 × 4.5 cm. The overlying skin ellipse measures 16.0 × 7.0 cm and is unremarkable. Sectioning reveals a firm, tan-white mass measuring 2.3 × 1.8 × 1.5 cm in the upper outer quadrant, 3.0 cm from a reference landmark and 2.0 cm from the nearest margin. No satellite nodules identified. Remaining tissue is unremarkable.',
      microscopicDescription: 'Sections show a primary finding, Grade 2. The primary component measures 2.3 cm. Lymphatic/vascular involvement is not identified. A secondary finding of intermediate grade is present at the periphery, spanning approximately 4 mm. All margins are negative; closest margin measures 2.0 mm.',
      ancillaryStudies: 'Marker A: Positive (score 7/8, 90% strong). Marker B: Positive (score 6/8, 70% moderate). Marker C: 2+ (equivocal). Marker C confirmatory test: Not amplified (ratio 1.4). Proliferation index: 18%. Regional node (Specimen B): 1 of 1 node positive, largest deposit 4.5 mm, no extranodal extension.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4401-SP-1_breast_invasive_001',
        specimenId: 'S26-4401-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'draft', // CP-04: second amendment now in progress (v1 -> v2 released, v3 in Stage 1 limbo) — previously finalized after v2
        previouslyFinalizedForAmendment: true,
        pendingAmendmentId: 'amend-seed-cp04b',
        answers: {
          procedure: 'procedure_opt_2',
          specimen_laterality: 'specimen_laterality_opt_2',
          tumor_site: ['tumor_site_opt_1'],
          histologic_type: 'histologic_type_opt_2',
          histologic_grade: 'Grade 2',
          tumor_size: '2.3 cm',
          tumor_focality: 'tumor_focality_opt_1',
          lvi: 'lvi_opt_1',
          treatment_effect_breast: 'treatment_effect_breast_opt_1',
          treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
          margin_status_invasive: 'margin_status_invasive_opt_2',
          distance_invasive_to_named_margins: '2.0 mm',
          margin_status_dcis: 'margin_status_dcis_opt_2',
          closest_margins_dcis: 'closest_margins_dcis_opt_3',
          regional_ln_status: 'regional_ln_status_opt_4',
          number_ln_macrometastases: '1',
          number_ln_micrometastases: '0',
          number_ln_itc: '0',
          largest_nodal_met_mm: '4.5',
          extranodal_extension: 'extranodal_extension_opt_1',
          total_ln_examined: '1',
          sentinel_ln_examined: '1',
          dcis: 'Secondary finding present, small extent',
          tumor_extent: 'Confined to primary organ',
          distant_metastasis: 'distant_metastasis_opt_1',
          ptnm_classification: 'Category A: Level 2; Category B: Level 1 (micro)',
        },
        aiSuggestions: {
          procedure:                        { value: 'procedure_opt_2',          confidence: 97, source: 'Gross description',      verification: 'unverified' },
          specimen_laterality:              { value: 'specimen_laterality_opt_2', confidence: 99, source: 'Gross description',      verification: 'unverified' },
          tumor_site:                       { value: ['tumor_site_opt_1'],       confidence: 91, source: 'Gross description',      verification: 'unverified' },
          histologic_type:                  { value: 'histologic_type_opt_2',    confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:                 { value: 'Grade 2',                  confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:                       { value: '2.3 cm',                   confidence: 96, source: 'Gross description',      verification: 'unverified' },
          tumor_focality:                   { value: 'tumor_focality_opt_1',     confidence: 85, source: 'Gross description',      verification: 'unverified' },
          lvi:                              { value: 'lvi_opt_1',                confidence: 82, source: 'Microscopic description', verification: 'unverified' },
          treatment_effect_breast:          { value: 'treatment_effect_breast_opt_1', confidence: 78, source: 'No known presurgical therapy mentioned', verification: 'unverified' },
          treatment_effect_nodes:           { value: 'treatment_effect_nodes_opt_1',  confidence: 72, source: 'No known presurgical therapy mentioned', verification: 'unverified' },
          margin_status_invasive:           { value: 'margin_status_invasive_opt_2', confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          distance_invasive_to_named_margins: { value: '2.0 mm',                 confidence: 89, source: 'Microscopic description', verification: 'unverified' },
          margin_status_dcis:               { value: 'margin_status_dcis_opt_2', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:               { value: 'regional_ln_status_opt_4', confidence: 92, source: 'Ancillary studies',       verification: 'unverified' },
          number_ln_macrometastases:        { value: '1',                        confidence: 90, source: 'Ancillary studies',       verification: 'unverified' },
          largest_nodal_met_mm:             { value: '4.5',                      confidence: 88, source: 'Ancillary studies',       verification: 'unverified' },
          extranodal_extension:             { value: 'extranodal_extension_opt_1', confidence: 85, source: 'Ancillary studies',     verification: 'unverified' },
          total_ln_examined:                { value: '1',                        confidence: 90, source: 'Ancillary studies',       verification: 'unverified' },
          sentinel_ln_examined:              { value: '1',                       confidence: 88, source: 'Specimen B',              verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'tumor_board_schedule', name: 'Tumor Board — Thu 14:00', color: '#3b82f6',   level: 'Case', status: 'Active', severity: 3 },
      { tagClass: 'ADMINISTRATIVE', id: 'pending_clin_cor',     name: 'Pending Clinical Correlation',              color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C50.412'], snomed: ['413448000'] },
  },

  // ── Case 2: Colorectal — sigmoid resection, partially filled ─────────────
  {
    id: 'S26-4402-COLON-RES',
    identifiers: ['SLD-CR2026002A'],
    accession: { accessionNumber: '4402', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4402-COLON-RES' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-002', mrn: '100002',
      firstName: 'Robert', lastName: 'Jackson',
      dateOfBirth: isoYearsAgo(67, 8, 22), sex: 'M',
      phone: '555-202-4412', email: 'robert.jackson@example.org',
      address: '88 Desert Rose Blvd, Scottsdale, AZ 85251',
    },
    specimens: [
      { id: 'S26-4402-SP-1', label: 'A', description: 'Sigmoid colon resection', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [{ id: 'migrated-f26-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f26', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }],
        blocks: [
          { id: 'blk-4402-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-4402-a1-1', stainName: 'H&E', status: 'Ready for Review' },
            { id: 'stn-4402-a1-2', stainName: 'MMR Panel', status: 'Pending Cut' },
          ] },
          { id: 'blk-4402-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-4402-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
          { id: 'blk-4402-a3', label: '3', status: 'Grossed', stains: [] },
        ] },
      { id: 'S26-4402-SP-2', label: 'B', description: 'Apical lymph node', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Michael Torres', facilityId: 'c2', facilityName: 'Riverside Medical Center', clinicalIndication: 'Sigmoid colon adenocarcinoma diagnosed on colonoscopy biopsy. CT staging: T3N1M0. Proceeding to laparoscopic sigmoid resection.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
      requisitionNumber: 'REQ-2026-44002', externalOrderId: 'EXT-LAB-0442', labNumber: 'BLK-SP1-B1', blockId: 'BLK-SP1-B1', referralNumber: 'REF-GI-2026-001' },
    diagnostic: {
      grossDescription: 'Received fresh labeled "sigmoid colon resection" is a segment of bowel measuring 22.0 cm in length. The serosal surface is smooth and glistening. A fungating, ulcerating mass measuring 4.5 × 3.2 cm is present on the anterior wall, 9.0 cm from the distal margin and 11.0 cm from the proximal margin. The finding extends through the muscular wall into adjacent adipose tissue. The nearest resection margin is 3 mm from the finding.',
      microscopicDescription: 'Sections show a moderately differentiated primary finding (low grade) extending through the muscular wall into adjacent adipose tissue. Perineural involvement is present. Lymphatic/vascular involvement is not identified. All surgical margins are uninvolved; the closest margin is 3 mm. 18 regional nodes identified; 3 of 18 are positive, all without extranodal extension.',
      ancillaryStudies: 'Marker panel A by IHC: all four markers retained (proficient pattern). Marker panel B mutation analysis: one alteration detected. Marker panel C: Wild type. Extended panel: Pending.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4402-SP-1_colon_resection_001',
        specimenId: 'S26-4402-SP-1',
        templateId: 'colon_resection',
        templateName: 'Generic Template — Colon Resection',
        status: 'finalized', // amended case — already signed out, real amendment record links here
        answers: {
          procedure: 'procedure_opt_4',
          tumor_site: ['tumor_site_opt_8'],
          histologic_type: 'histologic_type_opt_1',
          histologic_grade: 'histologic_grade_opt_2',
          tumor_size: '4.5 cm',
          tumor_extent: 'tumor_extent_opt_5',
          lvi: ['lvi_opt_1'],
          perineural_invasion: 'perineural_invasion_opt_2',
          margin_status_invasive: 'margin_status_invasive_opt_1',
          distance_radial_margin: '3 mm',
          regional_ln_status: 'regional_ln_status_opt_3',
          ln_with_tumor: '3',
          ln_examined: '18',
          stage_category_a: 'stage_category_a_opt_6',
          stage_category_b: 'stage_category_b_opt_6',
          treatment_effect: 'treatment_effect_opt_1',
          multiple_primary_sites: 'multiple_primary_sites_opt_1',
          macroscopic_perforation: 'macroscopic_perforation_opt_1',
          tumor_budding_score: 'tumor_budding_score_opt_2',
          distance_distal_margin: '5 cm',
          tumor_deposits: 'tumor_deposits_opt_1',
          modified_classification: 'modified_classification_opt_1',
          stage_category_a_suffix: 'stage_category_a_suffix_opt_1',
          stage_category_c: 'stage_category_c_opt_1',
          special_studies_note: 'Ancillary panel pending — see addendum when finalized.',
          comment_text: 'No additional comments.',
        },
        aiSuggestions: {
          procedure:               { value: 'procedure_opt_4',       confidence: 96, source: 'Gross description',      verification: 'unverified' },
          tumor_site:              { value: ['tumor_site_opt_8'],    confidence: 98, source: 'Gross description',      verification: 'unverified' },
          histologic_type:         { value: 'histologic_type_opt_1', confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:        { value: 'histologic_grade_opt_2', confidence: 89, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:              { value: '4.5 cm',                confidence: 95, source: 'Gross description',      verification: 'unverified' },
          tumor_extent:            { value: 'tumor_extent_opt_5',    confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          lvi:                     { value: ['lvi_opt_1'],           confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          perineural_invasion:     { value: 'perineural_invasion_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          margin_status_invasive:  { value: 'margin_status_invasive_opt_1', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          distance_radial_margin:  { value: '3 mm',                  confidence: 85, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:      { value: 'regional_ln_status_opt_4', confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          ln_with_tumor:           { value: '3',                     confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          ln_examined:             { value: '18',                    confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          stage_category_a:        { value: 'stage_category_a_opt_6', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          stage_category_b:        { value: 'stage_category_b_opt_6', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          treatment_effect:        { value: 'treatment_effect_opt_1', confidence: 80, source: 'No presurgical therapy mentioned', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        // CP-05: overlap edge case — primary instance above stays
        // untouched/read-only; this is the separate addendum module the
        // pathologist initialized instead of amending, for a biomarker
        // panel that came back after LIS notified them of a clerical
        // correction. Still in progress — not yet finalized.
        instanceId: 'S26-4402-SP-1_colon_biomarker_addendum_001',
        specimenId: 'S26-4402-SP-1',
        templateId: 'colon_resection',
        templateName: 'Ancillary Stain Panel Addendum',
        status: 'draft',
        pendingAddendumId: 'amend-seed-cp05',
        answers: {},
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'oncology_awaiting',   name: 'Oncology Awaiting Report',  color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
      { tagClass: 'ADMINISTRATIVE', id: 'stat_rush',           name: 'STAT — Rush Processing',    color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C18.7'], snomed: ['363346000'] },
  },

  // ── Case 3: Lung — right upper lobe lobectomy, draft ─────────────────────
  {
    id: 'S26-4403',
    identifiers: ['SLD-PR2026003A', 'SLD-PR2026003B', 'SLD-PR2026003C'],
    accession: { accessionNumber: '4403', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4403' },
    originHospitalId: 'HOSP-002', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-003', mrn: '100003',
      firstName: 'Helen', lastName: 'Williams',
      dateOfBirth: isoYearsAgo(63, 11, 5), sex: 'F',
      phone: '555-203-4413', email: 'helen.williams@example.org',
      address: '230 Cactus Wren Dr, Tempe, AZ 85281',
    },
    specimens: [
      { id: 'S26-4403-SP-1', label: 'A', description: 'Right upper lobe lobectomy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'migrated-f35-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f35', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }, { id: 'migrated-f24-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f24', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }],
        // Real feature, per direct follow-up: "update the mock data
        // files - bump the version." A real, working "example case
        // with actual entries" (per an earlier direct question) baked
        // directly into the seed data — the same real event
        // sequence/vocabulary the "Sim ALL Locations" Dev Tools
        // trigger already uses (useLisIntegration.ts), so both stay
        // consistent, but available on a fresh page load without
        // needing to click anything first.
        locationHistory: [
          { location: 'Accessioning Bench', workflowStage: 'Accessioning', action: 'Logged In', at: isoHoursAgo(30), source: 'LIS Middleware (simulated)', performedByName: 'Tech: M. Davis' },
          { location: 'Grossing Station 3', workflowStage: 'Grossing', action: 'Grossed & Cut', at: isoHoursAgo(29), source: 'LIS Middleware (simulated)', performedByName: 'Pathologist: Dr. E. Reed' },
        ],
        blocks: [
          { id: 'blk-4403-a1', label: '1', status: 'Embedded',
            locationHistory: [
              { location: 'Embedding Station 2', workflowStage: 'Embedding', action: 'Embedded', at: isoHoursAgo(26), source: 'LIS Middleware (simulated)', performedByName: 'Tech: J. Smith' },
              { location: 'Microtomy Bench 1', workflowStage: 'Microtomy/Sectioning', action: 'Sectioned', at: isoHoursAgo(25), source: 'LIS Middleware (simulated)', performedByName: 'Tech: J. Smith' },
            ],
            stains: [
            { id: 'stn-4403-a1-1', stainName: 'H&E', status: 'Ready for Review',
              locationHistory: [
                { location: 'Auto-Stainer 1', workflowStage: 'Staining', action: 'Stained & Coverslipped', at: isoHoursAgo(20), source: 'LIS Middleware (simulated)', performedByName: 'Tech: R. Patel' },
                { location: 'Pathologist Desk (Dr. Vance)', action: 'Out for Review', at: isoHoursAgo(19), source: 'LIS Middleware (simulated)', performedByName: 'Tech: R. Patel' },
                { location: 'Digital Scanner 02', action: 'Digitized WSI', at: isoHoursAgo(18), source: 'Digital Scanner (simulated)', performedByName: 'System: AutoScan' },
              ],
              aliquots: [
                { id: 'aliq-4403-a1-1-a', label: 'A', aliquotType: 'Tissue Scraping', createdAt: isoHoursAgo(18), createdBy: 'LIS Middleware (simulated)',
                  locationHistory: [
                    { location: 'Molecular Freezer -80°C (Rack 3)', action: 'Stored', at: isoHoursAgo(17), source: 'LIS Middleware (simulated)', performedByName: 'Tech: A. Lee' },
                  ] },
              ] },
            { id: 'stn-4403-a1-2', stainName: 'IHC Panel', status: 'Staining',
              locationHistory: [
                { location: 'Staging Cabinet B', action: 'Tray Staged', at: isoHoursAgo(16), source: 'LIS Middleware (simulated)', performedByName: 'Tech: R. Patel' },
              ],
              aliquots: [
                { id: 'aliq-4403-a1-2-a', label: 'A', aliquotType: 'RNA Lysate', createdAt: isoHoursAgo(16), createdBy: 'LIS Middleware (simulated)',
                  locationHistory: [
                    { location: 'Molecular Prep Lab', action: 'Extracted', at: isoHoursAgo(15), source: 'LIS Middleware (simulated)', performedByName: 'Tech: C. Vance' },
                    { location: 'Sendout Outbox (Courier #402)', action: 'In Transit', at: isoHoursAgo(14), source: 'LIS Middleware (simulated)', performedByName: 'Tech: A. Lee' },
                  ] },
              ] },
          ] },
          { id: 'blk-4403-a2', label: '2', status: 'Grossed',
            locationHistory: [
              { location: 'Archive Shelf 12B', workflowStage: 'Slide Archival', action: 'Archived', at: isoHoursAgo(8), source: 'LIS Middleware (simulated)', performedByName: 'Tech: LIS Middleware' },
            ],
            stains: [{ id: 'stn-4403-a2-1', stainName: 'H&E', status: 'Staining',
              locationHistory: [
                { location: 'Archive Shelf 12B', workflowStage: 'Slide Archival', action: 'Archived', at: isoHoursAgo(7), source: 'LIS Middleware (simulated)', performedByName: 'Tech: LIS Middleware' },
              ] }] },
        ] },
      { id: 'S26-4403-SP-2', label: 'B', description: 'Station 4R mediastinal lymph nodes', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [],
        locationHistory: [
          { location: 'Archive Shelf 12B', workflowStage: 'Slide Archival', action: 'Archived', at: isoHoursAgo(6), source: 'LIS Middleware (simulated)', performedByName: 'Tech: LIS Middleware' },
        ] },
      { id: 'S26-4403-SP-3', label: 'C', description: 'Station 7 subcarinal lymph nodes', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [],
        locationHistory: [
          { location: 'Archive Shelf 12B', workflowStage: 'Slide Archival', action: 'Archived', at: isoHoursAgo(5), source: 'LIS Middleware (simulated)', performedByName: 'Tech: LIS Middleware' },
        ] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. James Park', facilityId: 'c3', facilityName: 'Northside Clinic', clinicalIndication: '2.3 cm right upper lobe solid nodule, PET-avid (SUVmax 8.4). CT-guided biopsy: adenocarcinoma. EGFR/ALK negative. Proceeding to VATS right upper lobectomy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
      requisitionNumber: 'REQ-2026-44003', externalOrderId: 'EXT-LAB-0443', labNumber: 'BLK-SP2-A1', blockId: 'BLK-SP2-A1', referralNumber: null },
    diagnostic: {
      grossDescription: 'Received fresh labeled "right upper lobe" is a resection specimen, 14.0 × 10.0 × 3.5 cm, weighing 180g. The pleural surface is smooth. Sectioning reveals a firm, tan-white mass measuring 2.3 × 2.1 × 1.9 cm in the posterior segment, 1.5 cm from the nearest airway margin and 0.3 cm from the pleural surface. The remaining parenchyma shows mild background change.',
      microscopicDescription: 'Sections show a primary finding, Grade 2 (moderately differentiated). The primary component measures 2.3 cm. Adjacent surface involvement is present. Lymphatic/vascular involvement is not identified. The nearest margin is negative (1.5 cm). Specimens B and C: 0 of 5 regional nodes positive.',
      ancillaryStudies: 'Marker A: Positive. Marker B: Positive. Marker C: Negative. Marker D: Negative. Marker E: Negative. Mutation panel F: Wild type. Mutation panel G: One alteration detected. Expression score: 45%. Extended panel: Pending.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4403-SP-1_lung_adeno_001',
        specimenId: 'S26-4403-SP-1',
        templateId: 'lung_adeno',
        templateName: 'Generic Template — Lung Adeno',
        status: 'draft',
        answers: {
          procedure: ['procedure_opt_3'],
          specimen_laterality: 'specimen_laterality_opt_1',
          tumor_site: ['tumor_site_opt_1'],
          histologic_type: 'histologic_type_opt_6',
          histologic_grade: 'histologic_grade_opt_2',
          tumor_size: '2.3 cm',
          invasive_component_size: '2.3 cm',
          visceral_pleura_invasion: 'visceral_pleura_invasion_opt_2',
          lymphovascular_invasion: ['lymphovascular_invasion_opt_1'],
          regional_ln_status: 'regional_ln_status_opt_3',
          ln_examined_count: '5',
          ln_with_tumor_count: '0',
          stage_category_a: 'stage_category_a_opt_12',
          stage_category_b: 'stage_category_b_opt_3',
          synchronous_tumors: 'synchronous_tumors_opt_1',
          tumor_focality: 'tumor_focality_opt_1',
        },
        aiSuggestions: {
          procedure:               { value: ['procedure_opt_3'],    confidence: 97, source: 'Gross description',      verification: 'unverified' },
          specimen_laterality:     { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          tumor_site:              { value: ['tumor_site_opt_1'],   confidence: 96, source: 'Gross description',      verification: 'unverified' },
          histologic_type:         { value: 'histologic_type_opt_6', confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:        { value: 'histologic_grade_opt_2', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:              { value: '2.3 cm',               confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          invasive_component_size: { value: '2.3 cm',               confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          visceral_pleura_invasion:{ value: 'visceral_pleura_invasion_opt_2', confidence: 82, source: 'Microscopic description', verification: 'unverified' },
          lymphovascular_invasion: { value: ['lymphovascular_invasion_opt_1'], confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          margin_status_invasive:  { value: 'Negative (1.5 cm from nearest margin)', confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:      { value: 'regional_ln_status_opt_3', confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          ln_examined_count:       { value: '5',                    confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          ln_with_tumor_count:     { value: '0',                    confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          stage_category_a:        { value: 'stage_category_a_opt_12', confidence: 85, source: 'Microscopic description', verification: 'unverified' },
          stage_category_b:        { value: 'stage_category_b_opt_3',  confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          synchronous_tumors:      { value: 'synchronous_tumors_opt_1', confidence: 80, source: 'Gross: single mass identified', verification: 'unverified' },
          tumor_focality:          { value: 'tumor_focality_opt_1',  confidence: 88, source: 'Gross description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'stat_rush',           name: 'STAT — Rush Processing',    color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
      { tagClass: 'ADMINISTRATIVE', id: 'thoracic_mdt',        name: 'Thoracic MDT — Fri 09:00', color: '#3b82f6',   level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C34.11'], snomed: ['254637007'] },
  },

  // ── Case 4: Prostate Needle Biopsy, draft ──────────────────────────────────
  {
    id: 'S26-4404',
    accession: { accessionNumber: '4404', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4404' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-004', mrn: '100004',
      firstName: 'David', lastName: 'Martinez',
      dateOfBirth: isoYearsAgo(71, 5, 30), sex: 'M',
      phone: '555-204-4414', email: 'david.martinez@example.org',
      address: '501 Sun Valley Rd, Mesa, AZ 85201',
    },
    specimens: [
      { id: 'S26-4404-SP-1', label: 'A', description: 'Prostate biopsy — right apex', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [],
        blocks: [
          { id: 'blk-4404-a1', label: '1', status: 'Embedded', stains: [{ id: 'stn-4404-a1-1', stainName: 'H&E', status: 'Ready for Review' }] },
        ] },
      { id: 'S26-4404-SP-2', label: 'B', description: 'Prostate biopsy — right mid', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'S26-4404-SP-3', label: 'C', description: 'Prostate biopsy — right base', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'S26-4404-SP-4', label: 'D', description: 'Prostate biopsy — left apex', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'S26-4404-SP-5', label: 'E', description: 'Prostate biopsy — left mid', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'S26-4404-SP-6', label: 'F', description: 'Prostate biopsy — left base', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Anil Sharma', facilityId: 'c4', facilityName: 'Westview Surgery Center', clinicalIndication: 'PSA 8.4 ng/mL, rising from 5.2 ng/mL 12 months prior. Abnormal DRE: firm nodule right lobe. MRI prostate: PI-RADS 4 lesion right mid-gland. Proceeding to systematic + targeted biopsy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received in formalin are six containers labeled A through F, each containing needle biopsy cores. Specimen A (Site 1): 2 units, 1.4 and 1.2 cm. Specimen B (Site 2): 2 units, 1.6 and 1.5 cm. Specimen C (Site 3): 2 units, 1.8 and 1.6 cm. Specimens D–F (Sites 4-6): 2 units each, 1.3–1.7 cm. All units are grey-white and rubbery.',
      microscopicDescription: 'Specimens A, B, C (Sites 1-3): Primary finding, usual type, Score total 7 (Grade Group 2). 4 of 6 units involved. Maximum % unit involvement: 70% (Site 2). Perineural involvement present (Site 2, Site 1). Specimens D, E, F (Sites 4-6): Benign tissue with mild chronic inflammation. No finding identified.',
      ancillaryStudies: 'Marker A IHC: Strongly positive in finding foci. Marker panel B: Confirms finding, loss of secondary cell layer confirmed.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4404-SP-1_prostate_001',
        specimenId: 'S26-4404-SP-1',
        templateId: 'prostate_needle_biopsy',
        templateName: 'Generic Template — Prostate Needle Biopsy',
        status: 'draft', // CP-03: previously finalized, unlocked for correction — Stage 1 captured, awaiting re-sign-out
        previouslyFinalizedForAmendment: true,
        pendingAmendmentId: 'amend-seed-cp03',
        answers: {
          procedure: ['procedure_opt_1'],
          positive_specimen_locations: ['positive_specimen_locations_opt_1'],
          highest_gleason_score: 'highest_gleason_score_opt_2',
          sites_with_highest_gleason: ['sites_with_highest_gleason_opt_1'],
          total_number_of_cores: 12,
          number_of_positive_cores: 4,
          greatest_percentage_core_involvement: 'greatest_percentage_core_involvement_opt_9',
          perineural_invasion: 'perineural_invasion_opt_2',
          lymphatic_vascular_invasion: 'lymphatic_vascular_invasion_opt_1',
          treatment_effect: ['treatment_effect_opt_1'],
        },
        aiSuggestions: {
          procedure:                    { value: ['procedure_opt_1'], confidence: 94, source: 'Gross description', verification: 'unverified' },
          positive_specimen_locations:  { value: ['positive_specimen_locations_opt_1'], confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          highest_gleason_score:        { value: 'highest_gleason_score_opt_2', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          sites_with_highest_gleason:   { value: ['sites_with_highest_gleason_opt_1'], confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          total_number_of_cores:        { value: 12,                 confidence: 90, source: 'Gross description', verification: 'unverified' },
          number_of_positive_cores:     { value: 4,                  confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          greatest_percentage_core_involvement: { value: 'greatest_percentage_core_involvement_opt_9', confidence: 82, source: 'Microscopic description', verification: 'unverified' },
          perineural_invasion:          { value: 'perineural_invasion_opt_2', confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          lymphatic_vascular_invasion:  { value: 'lymphatic_vascular_invasion_opt_1', confidence: 78, source: 'No lymphatic/vascular involvement mentioned in report', verification: 'unverified' },
          treatment_effect:             { value: ['treatment_effect_opt_1'], confidence: 85, source: 'No presurgical therapy mentioned', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { id: 'urology-mdt',  tagClass: 'ADMINISTRATIVE', name: 'Urology MDT Scheduled',    lisCode: 'UROL',  color: '#3b82f6', severity: 2, level: 'Case', status: 'Active' },
      { id: 'gleason-upgrade', tagClass: 'ADMINISTRATIVE', name: 'Gleason Upgrade from Bx',  lisCode: 'GGU',   color: '#f59e0b', severity: 3, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'psma_ihc_pending',    name: 'PSMA IHC Noted Positive',  color: '#10b981',  level: 'Case', status: 'Active', severity: 1 },
    ],
    reportingMode: 'assist',
    coding: { icd10: ['C61'], snomed: ['254900004'] },
  },

  // ── Case 5: Breast DCIS — lumpectomy, finalized ───────────────────────────
  {
    id: 'S26-4405',
    accession: { accessionNumber: '4405', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4405' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-005', mrn: '100005',
      firstName: 'Susan', lastName: 'Taylor',
      dateOfBirth: isoYearsAgo(48, 9, 12), sex: 'F',
      phone: '555-205-4415', email: 'susan.taylor@example.org',
      address: '77 Palo Verde Circle, Chandler, AZ 85224',
    },
    specimens: [
      { id: 'S26-4405-SP-1', label: 'A', description: 'Right breast lumpectomy', receivedAt: isoDaysAgo(5), collectedAt: isoDaysAgo(6), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Lisa Wong', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Stereotactic biopsy: DCIS, intermediate grade. Screening mammogram calcifications right upper outer quadrant. Proceeding to wire-localised lumpectomy.', receivedDate: isoDaysAgo(6), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh, wire-localised, labeled "right breast lumpectomy" is a 68g specimen, 7.0 × 5.5 × 3.0 cm. Specimen radiograph confirms an area of interest correlating with a firm, white, granular area measuring 1.8 × 1.2 cm in the upper outer quadrant. No discrete mass identified.',
      microscopicDescription: 'Sections show a secondary (non-invasive) finding, intermediate grade, predominantly one architectural pattern with focal areas of another, spanning 18 mm. An associated finding is present within the affected foci, correlating with the specimen radiograph. No primary invasive finding identified. All margins are negative; closest margin measures 3 mm. No regional nodes submitted.',
      ancillaryStudies: 'Marker A by IHC: Positive (strong, diffuse). Marker B: Positive. Marker C: 1+ (negative). Proliferation index: 12%.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4405-SP-1_breast_dcis_001',
        specimenId: 'S26-4405-SP-1',
        templateId: 'breast_dcis_resection',
        templateName: 'Generic Template — Breast Dcis Resection',
        status: 'finalized',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_laterality: 'specimen_laterality_opt_1',
          tumor_type: 'tumor_type_opt_1',
          tumor_site: ['tumor_site_opt_1'],
          dcis_nuclear_grade: 'dcis_nuclear_grade_opt_2',
          dcis_architectural_patterns: ['dcis_architectural_patterns_opt_2'],
          dcis_size_extent: '18 mm',
          dcis_necrosis: 'dcis_necrosis_opt_1',
          microcalcifications: ['microcalcifications_opt_2'],
          margin_status_dcis: 'margin_status_dcis_opt_2',
          distance_dcis_to_named_margins: '3 mm',
          regional_ln_status: 'regional_ln_status_opt_1',
        },
        aiSuggestions: {
          procedure:               { value: 'procedure_opt_1',           confidence: 95, source: 'Gross description', verification: 'verified' },
          specimen_laterality:     { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'verified' },
          tumor_type:              { value: 'tumor_type_opt_1',          confidence: 96, source: 'Microscopic description', verification: 'verified' },
          tumor_site:              { value: ['tumor_site_opt_1'],        confidence: 88, source: 'Gross description', verification: 'verified' },
          dcis_nuclear_grade:      { value: 'dcis_nuclear_grade_opt_2',  confidence: 91, source: 'Microscopic description', verification: 'verified' },
          dcis_architectural_patterns: { value: ['dcis_architectural_patterns_opt_2'], confidence: 88, source: 'Microscopic description', verification: 'verified' },
          dcis_size_extent:        { value: '18 mm',                    confidence: 93, source: 'Microscopic description', verification: 'verified' },
          dcis_necrosis:           { value: 'dcis_necrosis_opt_1',       confidence: 75, source: 'No necrosis mentioned in microscopic description', verification: 'verified' },
          microcalcifications:     { value: ['microcalcifications_opt_2'], confidence: 87, source: 'Microscopic description', verification: 'verified' },
          margin_status_dcis:      { value: 'margin_status_dcis_opt_2', confidence: 96, source: 'Microscopic description', verification: 'verified' },
          distance_dcis_to_named_margins: { value: '3 mm',              confidence: 90, source: 'Microscopic description', verification: 'verified' },
          regional_ln_status:      { value: 'regional_ln_status_opt_1', confidence: 92, source: 'Microscopic description', verification: 'verified' },
        },
        createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(4),
      },
    ],
    status: 'finalized' as CaseStatus,
    createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(0),  // finalized today
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'second_opinion',      name: 'Second Opinion Requested', color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'margins_close',       name: 'Close Margin — 3mm',       color: '#f59e0b', level: 'Case', status: 'Active', severity: 3 },
    ],
    reportingMode: 'assist',
    coding: { icd10: ['D05.11'], snomed: ['397201007'] },
  },

  // ── Case 6: Breast Invasive — blank form, tests empty state ──────────────
  {
    id: 'S26-4406',
    accession: { accessionNumber: '4406', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4406' },
    originHospitalId: 'HOSP-002', originEnterpriseId: 'ENT-GLOBAL',
    patient: {
      id: 'PAT-006', mrn: '100006',
      firstName: 'Ruth', lastName: 'Anderson',
      dateOfBirth: isoYearsAgo(58, 1, 28), sex: 'F',
      phone: '555-206-4416', email: 'ruth.anderson@example.org',
      address: '320 Ironwood Pl, Gilbert, AZ 85295',
    },
    specimens: [
      { id: 'S26-4406-SP-1', label: 'A', description: 'Left breast core needle biopsy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'migrated-f25-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f25', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Patricia Moore', facilityId: 'c2', facilityName: 'Riverside Medical Center', clinicalIndication: 'Palpable mass left breast 2 o\'clock. Ultrasound: 1.8 cm hypoechoic irregular mass. BIRADS 5. Proceeding to ultrasound-guided core needle biopsy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received in formalin labeled "left breast core needle biopsy" are 3 cores measuring 1.3, 1.4, and 1.5 cm, grey-white and firm.',
      microscopicDescription: 'Pending.',
      ancillaryStudies: 'Pending.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4406-SP-1_breast_invasive_001',
        specimenId: 'S26-4406-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'draft',
        answers: {},
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'stat_rush',           name: 'STAT — Rush Processing',   color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
      { tagClass: 'ADMINISTRATIVE', id: 'frozen_section',      name: 'Frozen Section Pending',   color: '#f97316', level: 'Case', status: 'Active', severity: 4 },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
  },

  // ── Case 7: Colorectal — rectal resection, multi-specimen ─────────────────
  {
    id: 'S26-4407',
    accession: { accessionNumber: '4407', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4407' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-007', mrn: '100007',
      firstName: 'Michael', lastName: 'Chen',
      dateOfBirth: isoYearsAgo(74, 4, 9), sex: 'M',
      phone: '555-207-4417', email: 'michael.chen@example.org',
      address: '88 Mesquite Lane, Peoria, AZ 85345',
    },
    specimens: [
      { id: 'S26-4407-SP-1', label: 'A', description: 'Anterior resection — rectum', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [{ id: 'migrated-f24-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f24', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
      { id: 'S26-4407-SP-2', label: 'B', description: 'Mesorectal lymph nodes', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. James Nguyen', facilityId: 'c3', facilityName: 'Northside Clinic', clinicalIndication: 'Rectal adenocarcinoma, 8 cm from anal verge. MRI: mrT3N2. Completed neoadjuvant chemoradiotherapy (FOLFOX × 6 + long-course RT). Restaging MRI: good response. Proceeding to low anterior resection.', receivedDate: isoDaysAgo(3), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh labeled "anterior resection" is a segment of bowel measuring 18.0 cm in length with attached soft tissue. The surrounding fascia is intact (complete excision plane). An ulcerating finding measuring 2.5 × 2.0 cm is present on the posterior wall, 8.0 cm from the distal margin. The finding appears to penetrate through the muscular wall. The nearest resection margin is 4 mm.',
      microscopicDescription: 'Post-treatment primary finding with moderate treatment response (Score 2, <5% residual viable finding). Residual finding invades through the muscular wall into adjacent adipose tissue. Perineural involvement not identified. Lymphatic/vascular involvement not identified. Proximal and distal margins negative. Nearest margin: 4 mm (negative). 14 of 16 regional nodes show treatment effect only; 2 nodes contain viable finding.',
      ancillaryStudies: 'Marker panel A by IHC: Marker 1 loss (abnormal). Marker 2: Retained. Marker 3: Retained. Marker 4: Loss. Pattern consistent with a sporadic mechanism. Marker panel B: Positive. Hereditary syndrome unlikely.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4407-SP-1_colon_resection_001',
        specimenId: 'S26-4407-SP-1',
        templateId: 'colon_resection',
        templateName: 'Generic Template — Colon Resection',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_5',
          tumor_site: ['tumor_site_opt_10'],
          histologic_type: 'histologic_type_opt_1',
          histologic_grade: 'histologic_grade_opt_2',
          treatment_effect: 'treatment_effect_opt_3',
          tumor_size: '2.5 cm',
          tumor_extent: 'tumor_extent_opt_5',
          perineural_invasion: 'perineural_invasion_opt_1',
          lvi: ['lvi_opt_1'],
          margin_status_invasive: 'margin_status_invasive_opt_1',
          distance_radial_margin: '4 mm',
          regional_ln_status: 'regional_ln_status_opt_3',
          ln_with_tumor: '2',
          ln_examined: '16',
          stage_category_a: 'stage_category_a_opt_6',
          stage_category_b: 'stage_category_b_opt_6',
          modified_classification: ['modified_classification_opt_2'],
          mesorectum_evaluation: 'mesorectum_evaluation_opt_2',
        },
        aiSuggestions: {
          procedure:               { value: 'procedure_opt_5',        confidence: 95, source: 'Gross description', verification: 'unverified' },
          tumor_site:              { value: ['tumor_site_opt_10'],    confidence: 98, source: 'Gross description', verification: 'unverified' },
          histologic_type:         { value: 'histologic_type_opt_1',  confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:        { value: 'histologic_grade_opt_2', confidence: 76, source: 'Microscopic description', verification: 'unverified' },
          treatment_effect:        { value: 'treatment_effect_opt_3', confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:              { value: '2.5 cm',                 confidence: 91, source: 'Gross description', verification: 'unverified' },
          tumor_extent:            { value: 'tumor_extent_opt_5',     confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          perineural_invasion:     { value: 'perineural_invasion_opt_1', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          lvi:                     { value: ['lvi_opt_1'],            confidence: 89, source: 'Microscopic description', verification: 'unverified' },
          margin_status_invasive:  { value: 'margin_status_invasive_opt_1', confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          distance_radial_margin:  { value: '4 mm',                   confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:      { value: 'regional_ln_status_opt_4', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          ln_with_tumor:           { value: '2',                      confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          ln_examined:             { value: '16',                     confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          stage_category_a:        { value: 'stage_category_a_opt_6', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          stage_category_b:        { value: 'stage_category_b_opt_6', confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          modified_classification: { value: ['modified_classification_opt_2'], confidence: 85, source: 'Post-treatment specimen', verification: 'unverified' },
          mesorectum_evaluation:   { value: 'mesorectum_evaluation_opt_2', confidence: 82, source: 'Gross description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'colorectal_mdt',      name: 'Colorectal MDT — Mon 13:00', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { tagClass: 'ADMINISTRATIVE', id: 'braf_msi_noted',      name: 'BRAF+ / MSI-H Noted',        color: '#f97316', level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'comp-mol-4407', name: 'Molecular Panel', lisCode: 'MOL', color: '#10b981', level: 'Case', status: 'Active', severity: 3 },
    ],
    reportingMode: 'assist',
    coding: { icd10: ['C20'], snomed: ['363346000'] },
  },

  // ── Case 8: Multi-template — breast invasive + DCIS same case ─────────────
  {
    id: 'S26-4408',
    accession: { accessionNumber: '4408', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4408' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-008', mrn: '100008',
      firstName: 'Carol', lastName: 'Davis',
      dateOfBirth: isoYearsAgo(61, 7, 3), sex: 'F',
      phone: '555-208-4418', email: 'carol.davis@example.org',
      address: '145 Saguaro Way, Glendale, AZ 85301',
    },
    specimens: [
      { id: 'S26-4408-SP-1', label: 'A', description: 'Right breast mastectomy', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [{ id: 'migrated-f25-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f25', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }, { id: 'migrated-f30-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'f30', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
      { id: 'S26-4408-SP-2', label: 'B', description: 'Right axillary contents', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Sarah Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Multifocal right breast carcinoma — index lesion 2.1 cm invasive NST plus extensive DCIS. BRCA1 positive. Opting for bilateral mastectomy.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh labeled "right breast mastectomy" is a 512g specimen. Primary finding: tan-white mass 2.1 × 1.9 × 1.7 cm, upper outer quadrant. Surrounding area of interest, granular tissue spanning approximately 5 cm. Axillary contents contain abundant fibrofatty tissue.',
      microscopicDescription: 'Primary finding, Grade 3. Extensive secondary finding, high grade, one architectural pattern, spanning 52 mm. Lymphatic/vascular involvement identified. All margins negative. Axillary nodes: 2 of 22 positive, largest deposit 8 mm, no extranodal extension.',
      ancillaryStudies: 'Marker A: Negative. Marker B: Negative. Marker C: 3+ (positive). Proliferation index: 65%.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4408-SP-1_breast_invasive_001',
        specimenId: 'S26-4408-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_2',
          specimen_laterality: 'specimen_laterality_opt_1',
          tumor_site: ['tumor_site_opt_1'],
          histologic_type: 'histologic_type_opt_2',
          histologic_grade: 'Grade 3',
          tumor_size: '2.1 cm',
          lvi: ['lvi_opt_2'],
          margin_status_invasive: 'margin_status_invasive_opt_2',
          regional_ln_status: 'regional_ln_status_opt_4',
          number_ln_macrometastases: '2',
          largest_nodal_met_mm: '8',
          extranodal_extension: 'extranodal_extension_opt_1',
          total_ln_examined: '22',
          treatment_effect_breast: 'treatment_effect_breast_opt_1',
          treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
        },
        aiSuggestions: {
          procedure:                { value: 'procedure_opt_2',       confidence: 97, source: 'Gross description', verification: 'unverified' },
          specimen_laterality:      { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          tumor_site:               { value: ['tumor_site_opt_1'],    confidence: 90, source: 'Gross description', verification: 'unverified' },
          histologic_type:          { value: 'histologic_type_opt_2', confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:         { value: 'Grade 3',               confidence: 96, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:               { value: '2.1 cm',                confidence: 93, source: 'Gross description', verification: 'unverified' },
          lvi:                      { value: ['lvi_opt_2'],           confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          margin_status_invasive:   { value: 'margin_status_invasive_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:       { value: 'regional_ln_status_opt_4', confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          number_ln_macrometastases:{ value: '2',                     confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          largest_nodal_met_mm:     { value: '8',                     confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          extranodal_extension:     { value: 'extranodal_extension_opt_1', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          total_ln_examined:        { value: '22',                    confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          treatment_effect_breast:  { value: 'treatment_effect_breast_opt_1', confidence: 80, source: 'No presurgical therapy mentioned', verification: 'unverified' },
          treatment_effect_nodes:   { value: 'treatment_effect_nodes_opt_1',  confidence: 78, source: 'No presurgical therapy mentioned', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        instanceId: 'S26-4408-SP-1_breast_dcis_001',
        specimenId: 'S26-4408-SP-1',
        templateId: 'breast_dcis_resection',
        templateName: 'Generic Template — Breast Dcis Resection',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_2',
          specimen_laterality: 'specimen_laterality_opt_1',
          tumor_type: 'tumor_type_opt_1',
          dcis_nuclear_grade: 'dcis_nuclear_grade_opt_3',
          dcis_architectural_patterns: ['dcis_architectural_patterns_opt_1'],
          dcis_size_extent: '52 mm',
          margin_status_dcis: 'margin_status_dcis_opt_2',
          regional_ln_status: 'regional_ln_status_opt_1',
        },
        aiSuggestions: {
          procedure:               { value: 'procedure_opt_2',          confidence: 97, source: 'Gross description', verification: 'unverified' },
          specimen_laterality:     { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          tumor_type:              { value: 'tumor_type_opt_1',         confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          dcis_nuclear_grade:      { value: 'dcis_nuclear_grade_opt_3', confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          dcis_architectural_patterns: { value: ['dcis_architectural_patterns_opt_1'], confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          dcis_size_extent:        { value: '52 mm',                    confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          margin_status_dcis:      { value: 'margin_status_dcis_opt_2', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:      { value: 'regional_ln_status_opt_1', confidence: 70, source: 'Secondary-finding template — node status per primary report', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'oncology_hold',       name: 'Oncology Treatment on Hold', color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
      { tagClass: 'ADMINISTRATIVE', id: 'brca1_positive',      name: 'BRCA1 Pathogenic Variant',   color: '#8b5cf6', level: 'Case', status: 'Active', severity: 4 },
      { tagClass: 'ADMINISTRATIVE', id: 'stat_rush',           name: 'STAT — Rush Processing',     color: '#ef4444',    level: 'Case', status: 'Active', severity: 5 },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C50.411'], snomed: ['413448000'] },
  },

  // ── Case 9: Centennial patient — tests 3-digit age display ───────────────
  {
    id: 'S26-4409',
    accession: { accessionNumber: '4409', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4409' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-009', mrn: '100009',
      firstName: 'Beatrice', lastName: 'Holloway',
      dateOfBirth: isoYearsAgo(100, 1, 3), sex: 'F',
      phone: '555-209-4419', email: '',
      address: '12 Veteran Lane, Phoenix, AZ 85001',
    },
    specimens: [
      { id: 'S26-4409-SP-1', label: 'A', description: 'Left breast lumpectomy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Sarah Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Breast mass, left upper outer quadrant. 100-year-old female. Core biopsy: invasive carcinoma. Proceeding to lumpectomy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh labeled "left breast lumpectomy" is a 42g specimen, 6.0 × 4.5 × 2.5 cm. A firm, tan-white mass measuring 1.4 × 1.1 × 1.0 cm is present in the upper outer quadrant.',
      microscopicDescription: 'Primary finding, Grade 1. Margins negative.',
      ancillaryStudies: 'Marker A: Positive. Marker B: Positive. Marker C: Negative.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4409-SP-1_breast_invasive_001',
        specimenId: 'S26-4409-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_laterality: 'specimen_laterality_opt_2',
          histologic_type: 'histologic_type_opt_2',
          histologic_grade: 'Grade 1',
          tumor_size: '1.4 cm',
          margin_status_invasive: 'margin_status_invasive_opt_2',
          treatment_effect_breast: 'treatment_effect_breast_opt_1',
          treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
          lvi: ['lvi_opt_1'],
        },
        aiSuggestions: {
          procedure:              { value: 'procedure_opt_1',       confidence: 93, source: 'Gross description', verification: 'unverified' },
          specimen_laterality:    { value: 'specimen_laterality_opt_2', confidence: 99, source: 'Gross description', verification: 'unverified' },
          histologic_type:        { value: 'histologic_type_opt_2', confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:       { value: 'Grade 1',               confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:             { value: '1.4 cm',                confidence: 94, source: 'Gross description', verification: 'unverified' },
          margin_status_invasive: { value: 'margin_status_invasive_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          treatment_effect_breast:{ value: 'treatment_effect_breast_opt_1', confidence: 80, source: 'No presurgical therapy mentioned', verification: 'unverified' },
          treatment_effect_nodes: { value: 'treatment_effect_nodes_opt_1',  confidence: 78, source: 'No presurgical therapy mentioned', verification: 'unverified' },
          lvi:                    { value: ['lvi_opt_1'],           confidence: 70, source: 'No lymphatic/vascular involvement mentioned', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'geriatric_patient', name: 'Geriatric Patient — 100y', color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C50.412'], snomed: ['413448000'] },
  },

  // ── Case 10: Neonate (< 1 month) — Product of Conception ─────────────────
  {
    id: 'S26-4410',
    accession: { accessionNumber: '4410', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4410' },
    originHospitalId: 'HOSP-002', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-010', mrn: '100010',
      firstName: 'Baby', lastName: 'Nguyen',
      dateOfBirth: (() => { const d = new Date(); d.setHours(d.getHours() - 4); return d.toISOString(); })(),
      sex: 'F',
      phone: '', email: '',
      address: '',
    },
    specimens: [
      { id: 'S26-4410-SP-1', label: 'A', description: 'Products of conception', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Lisa Wong', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Elective termination of pregnancy at 9 weeks gestation. Products of conception submitted for histological evaluation.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received in formalin labeled "products of conception" is a 12g aggregate of pale grey-white, friable tissue measuring in aggregate 4.0 × 3.0 × 1.5 cm. Chorionic villi are identified grossly.',
      microscopicDescription: 'Pending.',
      ancillaryStudies: 'Pending.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4410-SP-1_poc_001',
        specimenId: 'S26-4410-SP-1',
        templateId: 'breast_dcis_resection',
        templateName: 'Non-Neoplastic — Default Negative',
        status: 'draft',
        answers: {},
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'poc_case', name: 'Products of Conception', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
  },

  // ── Case 11: Pending Review — awaiting attending sign-off ────────────────
  {
    id: 'S26-4411',
    accession: { accessionNumber: '4411', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4411' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-011', mrn: '100011',
      firstName: 'Margaret', lastName: 'Foster',
      dateOfBirth: isoYearsAgo(61, 4, 22), sex: 'F',
      phone: '555-211-4421', email: 'margaret.foster@example.org',
      address: '88 Ironwood Dr, Scottsdale, AZ 85251',
    },
    specimens: [
      { id: 'S26-4411-SP-1', label: 'A', description: 'Right breast core needle biopsy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Sarah Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Suspicious right breast mass 1.5 cm. BI-RADS 5. Ultrasound-guided core needle biopsy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Three cores, 1.2–1.5 cm, grey-white and firm.',
      microscopicDescription: 'Primary finding, Grade 2. Marker panel pending.',
      ancillaryStudies: 'Marker panel IHC: Pending.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4411-SP-1_breast_invasive_001',
        specimenId: 'S26-4411-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_laterality: 'specimen_laterality_opt_1',
          histologic_type: 'histologic_type_opt_2',
          histologic_grade: 'Grade 2',
        },
        aiSuggestions: {
          procedure:           { value: 'procedure_opt_1',       confidence: 88, source: 'Gross description', verification: 'unverified' },
          specimen_laterality: { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          histologic_type:     { value: 'histologic_type_opt_2', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:    { value: 'Grade 2',               confidence: 91, source: 'Microscopic description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'pending-review' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'awaiting_sign_off',  name: 'Awaiting Attending Sign-off', color: '#f59e0b', level: 'Case', status: 'Active', severity: 3 },
      { tagClass: 'ADMINISTRATIVE', id: 'ihc_pending',        name: 'ER/PR/HER2 Pending',          color: '#3b82f6',   level: 'Case', status: 'Active', severity: 2 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C50.411'], snomed: ['413448000'] },
  },

  // ── Case 12: Final (Amended) — Gleason grade amendment, already released ──
  {
    id: 'S26-4412',
    accession: { accessionNumber: '4412', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4412' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-012', mrn: '100012',
      firstName: 'Harold', lastName: 'Bennett',
      dateOfBirth: isoYearsAgo(58, 9, 15), sex: 'M',
      phone: '555-212-4422', email: 'harold.bennett@example.org',
      address: '203 Cactus Ridge Rd, Mesa, AZ 85201',
    },
    specimens: [
      { id: 'S26-4412-SP-1', label: 'A', description: 'Prostate needle biopsy — right mid', receivedAt: isoDaysAgo(5), collectedAt: isoDaysAgo(6), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Anil Sharma', facilityId: 'c4', facilityName: 'Westview Surgery Center', clinicalIndication: 'PSA 7.2, PI-RADS 4. Targeted biopsy right mid-gland. Original report amended to update Gleason grade following second opinion review.', receivedDate: isoDaysAgo(6), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Two cores, 1.4 and 1.6 cm.',
      microscopicDescription: 'AMENDED: Primary finding, usual type, Score total 7, Grade Group 2. Original report issued as Score total 6 — amended following MDT review.',
      ancillaryStudies: 'Marker panel: Confirms finding.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4412-SP-1_prostate_001',
        specimenId: 'S26-4412-SP-1',
        templateId: 'prostate_needle_biopsy',
        templateName: 'Generic Template — Prostate Needle Biopsy',
        status: 'finalized',
        answers: {
          procedure: ['procedure_opt_1'],
          highest_gleason_score: 'highest_gleason_score_opt_2',
          total_number_of_cores: 2,
          number_of_positive_cores: 2,
          perineural_invasion: 'perineural_invasion_opt_1',
          treatment_effect: ['treatment_effect_opt_1'],
        },
        aiSuggestions: {
          procedure:                  { value: ['procedure_opt_1'], confidence: 90, source: 'Gross description', verification: 'verified' },
          highest_gleason_score:      { value: 'highest_gleason_score_opt_2', confidence: 89, source: 'Microscopic description (amended)', verification: 'disputed' },
          total_number_of_cores:      { value: 2,                  confidence: 93, source: 'Gross description', verification: 'verified' },
          number_of_positive_cores:   { value: 2,                  confidence: 91, source: 'Microscopic description', verification: 'verified' },
          perineural_invasion:        { value: 'perineural_invasion_opt_1', confidence: 75, source: 'No perineural involvement mentioned', verification: 'verified' },
          treatment_effect:           { value: ['treatment_effect_opt_1'], confidence: 85, source: 'No presurgical therapy mentioned', verification: 'verified' },
        },
        createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'finalized' as CaseStatus,
    lastRevisionType: 'amendment',
    createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'amended_report',    name: 'Amended Report',              color: '#8b5cf6', level: 'Case', status: 'Active', severity: 4 },
      { tagClass: 'ADMINISTRATIVE', id: 'second_opinion',    name: 'Second Opinion — MDT Review', color: '#3b82f6',   level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C61'], snomed: ['254900004'] },
  },

  // ── Pool Cases ──────────────────────────────────────────────────────────────
  {
    id: 'S26-4415-BX-001',
    accession: { accessionNumber: '4415', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4415-BX-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-015', mrn: '100015', firstName: 'Robert', lastName: 'Hawkins', dateOfBirth: '1958-11-22T07:00:00.000Z', sex: 'M', phone: '555-301-7711', email: 'rhawkins@example.org', address: '88 Cedar Rd, Phoenix, AZ 85004' },
    specimens: [{ id: 'S26-4415-SP-1', label: 'A', description: 'Sigmoid colon biopsy — three fragments', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] }],
    order: { priority: 'Routine', requestingProvider: 'Dr. Amanda Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Change in bowel habits. Colonoscopy: 15mm polyp sigmoid colon.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: 'Received in formalin labeled "sigmoid colon biopsy" are three tan-pink fragments measuring 0.4–0.8 cm.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '1',
    poolName: 'Gastrointestinal',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  {
    id: 'S26-4416-BX-001',
    accession: { accessionNumber: '4416', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4416-BX-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-016', mrn: '100016', firstName: 'Linda', lastName: 'Okafor', dateOfBirth: '1971-04-09T07:00:00.000Z', sex: 'F', phone: '555-302-8822', email: 'lokafor@example.org', address: '22 Maple St, Phoenix, AZ 85006' },
    specimens: [{ id: 'S26-4416-SP-1', label: 'A', description: 'Skin punch biopsy — right forearm', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] }],
    order: { priority: 'Routine', requestingProvider: 'Dr. Susan Park', facilityId: 'c2', facilityName: 'Riverside Medical Center', clinicalIndication: 'Pigmented lesion right forearm, irregular border. Rule out melanoma.', receivedDate: isoDaysAgo(1), assignedTo: null },
    diagnostic: { grossDescription: 'Received in formalin labeled "skin punch biopsy right forearm" is a punch biopsy measuring 0.4 cm in diameter and 0.3 cm deep.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '2',
    poolName: 'Dermatopathology',
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  {
    id: 'S26-4417-BX-001',
    accession: { accessionNumber: '4417', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4417-BX-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-017', mrn: '100017', firstName: 'Marcus', lastName: 'Delgado', dateOfBirth: '1965-07-30T07:00:00.000Z', sex: 'M', phone: '555-303-9933', email: 'mdelgado@example.org', address: '54 Oak Ave, Phoenix, AZ 85008' },
    specimens: [{ id: 'S26-4417-SP-1', label: 'A', description: 'Colon resection — right hemicolectomy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] }],
    order: { priority: 'STAT', requestingProvider: 'Dr. Kevin Ng', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Ascending colon adenocarcinoma diagnosed on biopsy. CT: T3N0. STAT — OR case.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: 'Received fresh labeled "right hemicolectomy" is a 28 cm segment of right colon with attached terminal ileum. A fungating tumor measuring 3.8 × 3.2 cm is identified in the ascending colon.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '1',
    poolName: 'Gastrointestinal',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [{ tagClass: 'ADMINISTRATIVE', id: 'stat_rush', name: 'STAT — Rush Processing', color: '#ef4444', level: 'Case', status: 'Active', severity: 5 }],
    specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  // ══════════════════════════════════════════════════════════════════════════════
  // UK DEMO CASES — Paul Carter (PATH-UK-001), Copilot Mode
  // NHS Trust: Manchester University NHS Foundation Trust
  // Templates: RCPath (en-GB), TNM 9
  // ══════════════════════════════════════════════════════════════════════════════

  // ── UK Case 1: Colorectal — Anterior Resection, in-progress ─────────────────
  {
    id: 'MFT26-8801-CR-RES',
    accession: { accessionNumber: '8801', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8801-CR-RES' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-001', mrn: '200001',
      firstName: 'William', lastName: 'Hartley',
      dateOfBirth: isoYearsAgo(68, 4, 12), sex: 'M',
      phone: '0161 234 5678', email: 'w.hartley@nhs.net',
      address: '14 Deansgate, Manchester, M3 2EX',
      nhsNumber: '485 777 3456',
    },
    specimens: [
      { id: 'MFT26-8801-SP-1', label: 'A', description: 'Anterior resection specimen', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
      { id: 'MFT26-8801-SP-2', label: 'B', description: 'Mesorectal lymph nodes', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Mr. James Whitfield',
      clinicalIndication: 'Rectal adenocarcinoma, 7 cm from anal verge. MRI staging: mrT3N1. Completed neoadjuvant long-course chemoradiotherapy. Good radiological response. Proceeding to laparoscopic anterior resection.',
      receivedDate: isoDaysAgo(3),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Received fresh labelled "anterior resection specimen" is a segment of bowel measuring 28 cm in length with attached soft tissue. The surrounding envelope is intact and complete. An ulcerating finding measuring 3.8 × 2.9 cm is present on the posterior wall, 7 cm from the distal resection margin. The finding appears to invade into but not through the muscular wall macroscopically. The nearest resection margin appears clear. Multiple nodes are identified within the surrounding fat.',
      microscopicDescription: 'Sections show a moderately differentiated primary finding with evidence of treatment response. Residual finding invades into adjacent adipose tissue. The plane of excision is at the level of the surrounding fascia. Nearest margin clear, closest approach 4 mm. Longitudinal margins clear. No lymphatic/vascular involvement identified. Perineural involvement present. Regression score: Level 2 (residual finding with evident regression). 16 regional nodes identified; 2 of 16 positive, no extranodal extension.',
      ancillaryStudies: 'Marker panel A: four markers — all expression retained (proficient pattern). Marker panel B: one alteration detected. Marker panel C: wild type. Marker panel D testing: Stable pattern.',
    },
    synopticReports: [
      {
        instanceId: 'MFT26-8801-SP-1_colorectal_resection_b_001',
        specimenId: 'MFT26-8801-SP-1',
        templateId: 'colorectal_resection_b',
        templateName: 'Generic Template — Colorectal Resection B',
        status: 'draft',
        answers: {
          specimen_type: 'specimen_type_opt_8',
          tumour_site: 'tumour_site_opt_8',
          maximum_tumour_diameter_mm: '38',
          tumour_perforation: 'tumour_perforation_opt_2',
          relation_to_peritoneal_reflection: 'relation_to_peritoneal_reflection_opt_3',
          plane_of_mesorectal_excision: 'plane_of_mesorectal_excision_opt_1',
          tumour_type: 'tumour_type_opt_1',
          differentiation: 'differentiation_opt_1',
          local_invasion: 'local_invasion_opt_4',
          max_distance_beyond_muscularis_propria_mm: '4',
          tumour_regression_score: 'tumour_regression_score_opt_4',
          venous_invasion: 'venous_invasion_opt_1',
          lymphatic_invasion: 'lymphatic_invasion_opt_1',
          perineural_invasion: 'perineural_invasion_opt_3',
          longitudinal_margin_involvement: 'longitudinal_margin_involvement_opt_4',
          circumferential_margin_involvement: 'circumferential_margin_involvement_opt_4',
          distance_to_crm_mm: '4',
          total_lymph_nodes_examined: '16',
          total_lymph_nodes_involved: '2',
          number_of_tumour_deposits: 'number_of_tumour_deposits_opt_1',
          resection_status: 'resection_status_opt_1',
          t_stage: 'Category A: Level 3 (post-treatment)',
          n_stage: 'Category B: Level 1b (post-treatment)',
          m_stage: 'Category C: Level 0',
          snomed_t_code: '',
          snomed_m_code: '',
        },
        aiSuggestions: {
          specimen_type:           { value: 'specimen_type_opt_8',        confidence: 96, source: 'Gross description', verification: 'unverified' },
          tumour_site:             { value: 'tumour_site_opt_8',          confidence: 94, source: 'Order: clinical indication', verification: 'unverified' },
          maximum_tumour_diameter_mm: { value: '38',                     confidence: 91, source: 'Gross description', verification: 'unverified' },
          tumour_perforation:      { value: 'tumour_perforation_opt_2',   confidence: 88, source: 'Gross description', verification: 'unverified' },
          relation_to_peritoneal_reflection: { value: 'relation_to_peritoneal_reflection_opt_3', confidence: 82, source: 'Order: clinical indication', verification: 'unverified' },
          tumour_type:              { value: 'tumour_type_opt_1',        confidence: 98, source: 'Microscopic description', verification: 'unverified' },
          differentiation:         { value: 'differentiation_opt_1',      confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          plane_of_mesorectal_excision: { value: 'plane_of_mesorectal_excision_opt_1', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
          perineural_invasion:     { value: 'perineural_invasion_opt_3',  confidence: 85, source: 'Microscopic description', verification: 'unverified' },
          total_lymph_nodes_examined: { value: '16',                     confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          total_lymph_nodes_involved: { value: '2',                      confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          distance_to_crm_mm: { value: '4',                              confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          tumour_regression_score: { value: 'tumour_regression_score_opt_4', confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          t_stage:                  { value: 'Category A: Level 3 (post-treatment)', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          n_stage:                  { value: 'Category B: Level 1b (post-treatment)', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          resection_status:        { value: 'resection_status_opt_1',    confidence: 89, source: 'Microscopic description', verification: 'unverified' },
          snomed_t_code:       { value: '',                              confidence: 92, source: 'Reference code lookup', verification: 'unverified' },
          snomed_m_code:       { value: '',                              confidence: 94, source: 'Reference code lookup', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        instanceId: 'MFT26-8801-SP-1_colorectal_further_investigations_001',
        specimenId: 'MFT26-8801-SP-1',
        templateId: 'colorectal_further_investigations',
        templateName: 'Generic Template — Colorectal Further Investigations',
        status: 'draft',
        answers: {
          mlh1_nuclear_expression: 'mlh1_nuclear_expression_opt_1',
          pms2_nuclear_expression: 'pms2_nuclear_expression_opt_1',
          msh2_nuclear_expression: 'msh2_nuclear_expression_opt_1',
          msh6_nuclear_expression: 'msh6_nuclear_expression_opt_1',
          msi_status: 'msi_status_opt_3',
          braf_v600e_status: 'braf_v600e_status_opt_2',
          kras_status: 'kras_status_opt_1',
          kras_mutation_specify: '(specific alteration on file)',
        },
        aiSuggestions: {
          mlh1_nuclear_expression: { value: 'mlh1_nuclear_expression_opt_1', confidence: 96, source: 'Ancillary studies', verification: 'unverified' },
          pms2_nuclear_expression: { value: 'pms2_nuclear_expression_opt_1', confidence: 96, source: 'Ancillary studies', verification: 'unverified' },
          msh2_nuclear_expression: { value: 'msh2_nuclear_expression_opt_1', confidence: 96, source: 'Ancillary studies', verification: 'unverified' },
          msh6_nuclear_expression: { value: 'msh6_nuclear_expression_opt_1', confidence: 96, source: 'Ancillary studies', verification: 'unverified' },
          msi_status:              { value: 'msi_status_opt_3',              confidence: 95, source: 'Ancillary studies', verification: 'unverified' },
          kras_status:              { value: 'kras_status_opt_1',            confidence: 97, source: 'Ancillary studies', verification: 'unverified' },
          kras_mutation_specify:    { value: '(specific alteration on file)', confidence: 95, source: 'Ancillary studies', verification: 'unverified' },
          braf_v600e_status:        { value: 'braf_v600e_status_opt_2',      confidence: 97, source: 'Ancillary studies', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'mdt_colorectal', name: 'Colorectal MDT — Wed 14:00', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { tagClass: 'ADMINISTRATIVE', id: 'kras_result',    name: 'KRAS Result — Oncology Notified', color: '#10b981', level: 'Case', status: 'Active', severity: 1 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: {
      icd10: ['C20'],
      snomed: ['413448001'],
    },
  },

  // ── UK Case 2: Prostate — Needle Biopsy, draft ───────────────────────────────
  {
    id: 'MFT26-8802-PR-BX',
    accession: { accessionNumber: '8802', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8802-PR-BX' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-002', mrn: '200002',
      firstName: 'Geoffrey', lastName: 'Barrowclough',
      dateOfBirth: isoYearsAgo(71, 9, 3), sex: 'M',
      phone: '0161 345 6789', email: 'g.barrowclough@nhs.net',
      address: '7 Piccadilly Gardens, Manchester, M1 1RG',
      nhsNumber: '612 345 9087',
    },
    specimens: [
      { id: 'MFT26-8802-SP-1', label: 'A', description: 'Prostate biopsy — right apex', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8802-SP-2', label: 'B', description: 'Prostate biopsy — right mid', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8802-SP-3', label: 'C', description: 'Prostate biopsy — right base', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8802-SP-4', label: 'D', description: 'Prostate biopsy — left apex', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8802-SP-5', label: 'E', description: 'Prostate biopsy — left mid', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8802-SP-6', label: 'F', description: 'Prostate biopsy — left base', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Mr. David Whitmore', facilityId: 'c-mft-02', facilityName: 'Wythenshawe Hospital',
      clinicalIndication: 'PSA 12.4 ng/mL, rising trend. Abnormal DRE: nodule right lobe. mpMRI prostate: PI-RADS 5 lesion right mid-gland, 14 mm. Proceeding to MRI-targeted and systematic transperineal biopsy under general anaesthetic.',
      receivedDate: isoDaysAgo(1),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Received in formalin, six containers labelled A through F. Specimen A (Site 1): 2 units, 17 mm and 14 mm. Specimen B (Site 2): 2 units, 18 mm and 16 mm — targeted units from an area of interest. Specimen C (Site 3): 2 units, 15 mm and 13 mm. Specimens D–F (Sites 4-6): 2 units each, 12–16 mm. All units are grey-white and rubbery.',
      microscopicDescription: 'Specimens A, B, C (Sites 1-3): Primary finding, usual type, Score total 7 (Grade Group 3). 5 of 6 units involved. Maximum % unit involvement: 85% (Site 2, targeted unit). Perineural involvement present. No secondary structure involvement identified on biopsy. Specimens D, E, F (Sites 4-6): Benign tissue with mild chronic inflammation. No finding identified.',
      ancillaryStudies: 'Marker A IHC: Strongly positive in finding foci. Marker panel B: Confirms finding, loss of secondary cell layer confirmed.',
    },
    synopticReports: [
      {
        instanceId: 'MFT26-8802-SP-1_rcpath_prostate_biopsy_001',
        specimenId: 'MFT26-8802-SP-1',
        templateId: 'prostate_biopsy',
        templateName: 'Generic Template — Prostate Biopsy',
        status: 'draft',
        answers: {},
        aiSuggestions: {
          specimen_type:                  { value: ['specimen_type_opt_2', 'specimen_type_opt_3'], confidence: 95, source: 'Gross description', verification: 'unverified' },
          histological_tumour_type:       { value: ['histological_tumour_type_opt_1'], confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          gleason_applicable:              { value: 'gleason_applicable_opt_1',   confidence: 98, source: 'Microscopic description', verification: 'unverified' },
          primary_gleason_grade:           { value: 'primary_gleason_grade_opt_2', confidence: 96, source: 'Microscopic description', verification: 'unverified' },
          secondary_gleason_grade:         { value: 'secondary_gleason_grade_opt_1', confidence: 96, source: 'Microscopic description', verification: 'unverified' },
          gleason_score_total:             { value: 'gleason_score_total_opt_2', confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          grade_group:                     { value: 'grade_group_opt_3',         confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          invasive_cribriform_intraductal: { value: 'invasive_cribriform_intraductal_opt_1', confidence: 80, source: 'No secondary finding mentioned', verification: 'unverified' },
          perineural_invasion:            { value: 'perineural_invasion_opt_2',  confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          extraprostatic_extension:       { value: 'extraprostatic_extension_opt_1', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'pending-countersign',
    requiresCountersign: true,
    // Replaces the old caseTeam field, which didn't exist on the real
    // Case type at all and had zero consuming logic anywhere — pure
    // decorative seed data (confirmed while building the teaching-case
    // reconciliation feature). This is the real mechanism: participants[]
    // + participationTypeIds, which CaseTeamModal.tsx and
    // RightSynopticPanel.tsx's requiresCountersign check actually read.
    participants: [
      { staffId: 'PATH-UK-001', staffName: 'Paul Carter', source: 'system', participationTypeIds: ['attending'], addedBy: 'system', addedAt: isoDaysAgo(1), status: 'active' },
      { staffId: 'PATH-UK-002', staffName: 'Oliver Pemberton', source: 'system', participationTypeIds: ['resident'], addedBy: 'PATH-UK-001', addedAt: isoDaysAgo(1), status: 'active' },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'urology_mdt', name: 'Urology MDT — Fri 09:00', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { tagClass: 'ADMINISTRATIVE', id: 'psma_positive', name: 'PSMA IHC — Positive', color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C61'], snomed: [] },
  },

  // ── UK Case 3: Colorectal — Local Excision, pending review ──────────────────
  {
    id: 'MFT26-8803-CR-LOC',
    accession: { accessionNumber: '8803', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8803-CR-LOC' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-003', mrn: '200003',
      firstName: 'Margaret', lastName: 'Ashworth',
      dateOfBirth: isoYearsAgo(58, 7, 19), sex: 'F',
      phone: '0161 456 7890', email: 'm.ashworth@nhs.net',
      address: '22 Oxford Road, Manchester, M13 9PL',
      nhsNumber: '345 678 1234',
    },
    specimens: [
      { id: 'MFT26-8803-SP-1', label: 'A', description: 'Transanal endoscopic microsurgery (TEMS) excision — rectal polyp', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(4), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Mr. James Whitfield',
      clinicalIndication: 'Sessile rectal polyp, 4 cm, 6 cm from anal verge. Colonoscopy biopsy: tubulovillous adenoma with high-grade dysplasia. Proceeding to TEMS excision.',
      receivedDate: isoDaysAgo(4),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Received fresh labelled "TEMS excision — rectal polyp" is an intact disc of bowel wall measuring 4.2 × 3.8 cm. The surface shows a sessile finding measuring 3.9 × 3.5 cm with a villous surface. The deep margin is inked blue. Sectioning reveals the finding extends to but does not appear to breach the muscular wall.',
      microscopicDescription: 'Sections show a secondary finding with focal areas of invasive primary finding (well differentiated, Category A Level 1). Maximum depth of involvement from the muscularis layer: 1.8 mm. Width of involvement: 6 mm. Anatomic level: not applicable (sessile). Depth level: Level 1. No lymphatic/vascular involvement. No perineural involvement. Deep margin: not involved (clearance 1.2 mm). Peripheral margin: not involved. Budding: Level 1 (3 foci identified). Resection status: Complete.',
      ancillaryStudies: 'Marker panel A by IHC: four markers — all expression intact.',
    },
    synopticReports: [
      {
        instanceId: 'MFT26-8803-SP-1_colorectal_local_excision_001',
        specimenId: 'MFT26-8803-SP-1',
        templateId: 'colorectal_local_excision',
        templateName: 'Generic Template — Colorectal Local Excision',
        status: 'draft',
        answers: {
          specimen_type: 'specimen_type_opt_4',
          tumour_site: 'tumour_site_opt_9',
          maximum_tumour_diameter_mm: '39',
          tumour_type: 'tumour_type_opt_1',
          differentiation: 'differentiation_opt_1',
          local_invasion: 'local_invasion_opt_2',
          kikuchi_level: 'kikuchi_level_opt_1',
          venous_invasion: 'venous_invasion_opt_1',
          lymphatic_invasion: 'lymphatic_invasion_opt_1',
          perineural_invasion: 'perineural_invasion_opt_1',
          tumour_budding_number_of_buds: '3',
          tumour_budding_grade: 'tumour_budding_grade_opt_1',
          peripheral_margin_involvement: 'peripheral_margin_involvement_opt_2',
          deep_margin_involvement: 'deep_margin_involvement_opt_2',
          distance_to_deep_margin_mm: '1.2',
          resection_status: 'resection_status_opt_1',
          t_stage: 'Category A: Level 1',
          n_stage: 'Category B: Not assessed',
          snomed_t_code: '',
          snomed_m_code: '',
        },
        aiSuggestions: {
          specimen_type:       { value: 'specimen_type_opt_4', confidence: 88, source: 'Order: clinical indication', verification: 'unverified' },
          tumour_site:         { value: 'tumour_site_opt_9',   confidence: 95, source: 'Order: clinical indication', verification: 'unverified' },
          differentiation:     { value: 'differentiation_opt_1', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          local_invasion:      { value: 'local_invasion_opt_2', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          kikuchi_level:       { value: 'kikuchi_level_opt_1',  confidence: 85, source: 'Microscopic description', verification: 'unverified' },
          tumour_budding_grade: { value: 'tumour_budding_grade_opt_1', confidence: 82, source: 'Microscopic description', verification: 'unverified' },
          deep_margin_involvement: { value: 'deep_margin_involvement_opt_2', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          resection_status:    { value: 'resection_status_opt_1', confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          t_stage:             { value: 'Category A: Level 1', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          snomed_t_code:       { value: '',                  confidence: 90, source: 'Reference code lookup', verification: 'unverified' },
          snomed_m_code:       { value: '',                  confidence: 93, source: 'Reference code lookup', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'pending-review' as CaseStatus,
    createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'second_opinion', name: 'Second Opinion Requested', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C20'], snomed: ['413448001'] },
  },

  // ── UK Case 4: Prostate — Radical Prostatectomy, draft ──────────────────────
  {
    id: 'MFT26-8804-PR-RP',
    accession: { accessionNumber: '8804', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8804-PR-RP' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-004', mrn: '200004',
      firstName: 'Thomas', lastName: 'Pemberton',
      dateOfBirth: isoYearsAgo(63, 11, 28), sex: 'M',
      phone: '0161 567 8901', email: 't.pemberton@nhs.net',
      address: '45 Wilmslow Road, Manchester, M14 5AQ',
      nhsNumber: '789 012 3456',
    },
    specimens: [
      { id: 'MFT26-8804-SP-1', label: 'A', description: 'Radical prostatectomy specimen', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8804-SP-2', label: 'B', description: 'Right pelvic lymph nodes', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'MFT26-8804-SP-3', label: 'C', description: 'Left pelvic lymph nodes', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Mr. David Whitmore', facilityId: 'c-mft-02', facilityName: 'Wythenshawe Hospital',
      clinicalIndication: 'Prostate adenocarcinoma, Gleason 4+3=7, Grade Group 3. PSA 11.2 ng/mL. MRI: T2N0. Proceeding to robot-assisted radical prostatectomy with bilateral pelvic lymph node dissection.',
      receivedDate: isoDaysAgo(1),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Received fresh labelled "radical prostatectomy" is an organ specimen with attached adjacent structures weighing 54g and measuring 4.8 × 4.2 × 3.9 cm. The external surface is inked (right: red, left: black, anterior: blue). Serial sectioning reveals a firm, grey-white finding predominantly involving the right mid and base, estimated to occupy 35% of the organ volume. The finding appears to extend to the inked right posterolateral margin in one section. Bilateral adjacent structures unremarkable. Bilateral regional node packages submitted separately.',
      microscopicDescription: 'Sections show a primary finding, usual type, Score total 7 (Grade Group 3). Finding involves right mid, right base, and right apex. Extension beyond the organ present at right posterolateral aspect, spanning 2.1 mm. Right posterolateral surgical margin positive over 1.2 mm. All other margins clear. No adjacent structure involvement. No lymphatic/vascular involvement. Right regional nodes: 0 of 8 positive. Left regional nodes: 0 of 7 positive.',
      ancillaryStudies: 'Marker panel: confirms finding. Marker A IHC: positive.',
    },
    synopticReports: [
      {
        instanceId: 'MFT26-8804-SP-1_prostate_radical_prostatectomy_001',
        specimenId: 'MFT26-8804-SP-1',
        templateId: 'prostate_radical_prostatectomy',
        templateName: 'Generic Template — Prostate Radical Prostatectomy',
        status: 'draft',
        answers: {},
        aiSuggestions: {
          histological_tumour_type:         { value: ['histological_tumour_type_opt_1'], confidence: 99, source: 'Microscopic description', verification: 'unverified' },
          primary_gleason_grade:            { value: 'primary_gleason_grade_opt_3',      confidence: 98, source: 'Microscopic description', verification: 'unverified' },
          secondary_gleason_grade:          { value: 'secondary_gleason_grade_opt_2',    confidence: 98, source: 'Microscopic description', verification: 'unverified' },
          gleason_score_total:              { value: 'gleason_score_total_opt_4',        confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          grade_group:                      { value: 'grade_group_opt_3',                confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          extraprostatic_extension:         { value: 'extraprostatic_extension_opt_2',   confidence: 96, source: 'Microscopic description', verification: 'unverified' },
          extraprostatic_extension_extent:  { value: 'extraprostatic_extension_extent_opt_2', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          seminal_vesicle_involvement:      { value: 'seminal_vesicle_involvement_opt_2', confidence: 99, source: 'Microscopic description', verification: 'unverified' },
          margin_status:                    { value: 'margin_status_opt_1',              confidence: 97, source: 'Microscopic description', verification: 'unverified' },
          lymphovascular_invasion:          { value: 'lymphovascular_invasion_opt_1',    confidence: 96, source: 'Microscopic description', verification: 'unverified' },
          n_category:                       { value: 'n_category_opt_2',                 confidence: 99, source: 'Microscopic description', verification: 'unverified' },
          t_category:                       { value: 't_category_opt_3',                 confidence: 94, source: 'Microscopic description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'positive_margin', name: 'Positive Surgical Margin', color: '#ef4444', level: 'Case', status: 'Active', severity: 3 },
      { tagClass: 'ADMINISTRATIVE', id: 'urology_mdt', name: 'Urology MDT — Fri 09:00', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    requiresCountersign: true,
    participants: [
      { staffId: 'PATH-UK-001', staffName: 'Paul Carter', source: 'system', participationTypeIds: ['attending'], addedBy: 'system', addedAt: isoDaysAgo(1), status: 'active' },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C61'], snomed: [] },
  },

  // ── UK Case 5: Colorectal — Completed/Finalised ──────────────────────────────
  {
    id: 'MFT26-8805-CR-FIN',
    accession: { accessionNumber: '8805', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8805-CR-FIN' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-005', mrn: '200005',
      firstName: 'Patricia', lastName: 'Hollingsworth',
      dateOfBirth: isoYearsAgo(55, 2, 8), sex: 'F',
      phone: '0161 678 9012', email: 'p.hollingsworth@nhs.net',
      address: '8 King Street, Manchester, M2 6AQ',
      nhsNumber: '234 567 8901',
    },
    specimens: [
      { id: 'MFT26-8805-SP-1', label: 'A', description: 'Right hemicolectomy specimen', receivedAt: isoDaysAgo(7), collectedAt: isoDaysAgo(8), specimenFlags: [] },
      { id: 'MFT26-8805-SP-2', label: 'B', description: 'Apical lymph node', receivedAt: isoDaysAgo(7), collectedAt: isoDaysAgo(8), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Mr. James Whitfield',
      clinicalIndication: 'Caecal adenocarcinoma, colonoscopy biopsy confirmed. CT staging: T3N0M0. Proceeding to laparoscopic right hemicolectomy.',
      receivedDate: isoDaysAgo(8),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Resection specimen, 38 cm in length. Fungating finding measuring 5.2 × 4.1 cm. Finding invades through the muscular wall into adjacent fat. All margins clear.',
      microscopicDescription: 'Well differentiated primary finding, Category A Level 3. No lymphatic/vascular involvement. No perineural involvement. 22 regional nodes; 0 of 22 positive. Nearest margin clear, 8 mm. Complete resection. Marker panel proficient.',
      ancillaryStudies: 'Marker panel A by IHC: all four markers retained. Marker panel B: Stable pattern. Marker panel C: wild type. Marker panel D: wild type.',
    },
    synopticReports: [
      {
        instanceId: 'MFT26-8805-SP-1_colorectal_resection_b_001',
        specimenId: 'MFT26-8805-SP-1',
        templateId: 'colorectal_resection_b',
        templateName: 'Generic Template — Colorectal Resection B',
        status: 'draft',
        answers: {
          specimen_type: 'specimen_type_opt_3',
          tumour_site: 'tumour_site_opt_1',
          maximum_tumour_diameter_mm: '52',
          tumour_type: 'tumour_type_opt_1',
          differentiation: 'differentiation_opt_1',
          local_invasion: 'local_invasion_opt_4',
          venous_invasion: 'venous_invasion_opt_1',
          lymphatic_invasion: 'lymphatic_invasion_opt_1',
          perineural_invasion: 'perineural_invasion_opt_1',
          total_lymph_nodes_examined: '22',
          total_lymph_nodes_involved: '0',
          longitudinal_margin_involvement: 'longitudinal_margin_involvement_opt_4',
          circumferential_margin_involvement: 'circumferential_margin_involvement_opt_4',
          distance_to_crm_mm: '8',
          t_stage: 'Category A: Level 3',
          n_stage: 'Category B: Level 0',
          m_stage: 'Not applicable',
          resection_status: 'resection_status_opt_1',
          snomed_t_code: '',
          snomed_m_code: '',
        },
        aiSuggestions: {},
        createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(5),
      },
      {
        instanceId: 'MFT26-8805-SP-1_colorectal_further_investigations_001',
        specimenId: 'MFT26-8805-SP-1',
        templateId: 'colorectal_further_investigations',
        templateName: 'Generic Template — Colorectal Further Investigations',
        status: 'draft',
        answers: {
          mlh1_nuclear_expression: 'mlh1_nuclear_expression_opt_1',
          pms2_nuclear_expression: 'pms2_nuclear_expression_opt_1',
          msh2_nuclear_expression: 'msh2_nuclear_expression_opt_1',
          msh6_nuclear_expression: 'msh6_nuclear_expression_opt_1',
          msi_status: 'msi_status_opt_3',
          kras_status: 'kras_status_opt_2',
          braf_v600e_status: 'braf_v600e_status_opt_2',
        },
        aiSuggestions: {},
        createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(5),
      },
    ],
    status: 'finalized' as CaseStatus,
    createdAt: isoDaysAgo(8), updatedAt: isoDaysAgo(5),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C18.0'], snomed: ['413448001'] },
  },

  // ── UK Case 6: STAT — Colorectal, urgent, unstarted ──────────────────────────
  {
    id: 'MFT26-8806-CR-STAT',
    accession: { accessionNumber: '8806', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8806-CR-STAT' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: {
      id: 'PAT-UK-006', mrn: '200006',
      firstName: 'Edward', lastName: 'Blackwood',
      dateOfBirth: isoYearsAgo(74, 6, 30), sex: 'M',
      phone: '0161 789 0123', email: 'e.blackwood@nhs.net',
      address: '3 Albert Square, Manchester, M2 5PF',
      nhsNumber: '901 234 5678',
    },
    specimens: [
      { id: 'MFT26-8806-SP-1', label: 'A', description: 'Sigmoid colectomy — emergency resection', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'STAT',
      requestingProvider: 'Mr. Peter Thornton', facilityId: 'c-mft-01', facilityName: 'Manchester Royal Infirmary',
      clinicalIndication: 'Emergency presentation with perforated sigmoid colon. CT: sigmoid mass with free air. Proceeding to emergency Hartmann\'s procedure. Intraoperative finding: perforated sigmoid adenocarcinoma.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-UK-001',
    },
    diagnostic: {
      grossDescription: 'Fresh sigmoid colectomy specimen, 18 cm. Perforated tumour, 6.5 × 5.2 cm, on the anterior wall. Perforation site 8 mm in diameter. Tumour invades through full bowel wall thickness.',
      microscopicDescription: 'Pending processing.',
      ancillaryStudies: 'Pending.',
    },
    synopticReports: [],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'stat_flag', name: 'STAT — Rush Processing', color: '#ef4444', level: 'Case', status: 'Active', severity: 3 },
      { tagClass: 'ADMINISTRATIVE', id: 'perforation', name: 'Tumour Perforation — pT4', color: '#ef4444', level: 'Case', status: 'Active', severity: 3 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C18.7'], snomed: [] },
  },

  // ── UK Pool Cases — Manchester University NHS Foundation Trust ───────────────
  {
    id: 'MFT26-8807-POOL',
    identifiers: ['SLD-MFT2026807A'],
    accession: { accessionNumber: '8807', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8807-POOL' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: { id: 'PAT-UK-007', mrn: '200007', firstName: 'Susan', lastName: 'Hargreaves', dateOfBirth: isoYearsAgo(62, 5, 14), sex: 'F', phone: '0161 890 1234', email: 's.hargreaves@nhs.net', address: '19 Portland Street, Manchester, M1 3HU', nhsNumber: '345 891 2345' },
    specimens: [{ id: 'MFT26-8807-SP-1', label: 'A', description: 'Sigmoid colon biopsy — three fragments', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] }],
    order: { priority: 'Routine', requestingProvider: 'Dr. Helen Marsden', facilityId: 'c-mft-03', facilityName: 'North Manchester General Hospital', clinicalIndication: 'Change in bowel habit. Colonoscopy: 18mm sessile polyp sigmoid colon. Biopsy taken.', receivedDate: isoDaysAgo(0), assignedTo: null,
      requisitionNumber: 'REQ-MFT-2026-8807', externalOrderId: 'EXT-NHS-88070', labNumber: 'BLK-SP1-C1', blockId: 'BLK-SP1-C1', referralNumber: 'REF-GI-MFT-001' },
    diagnostic: { grossDescription: 'Received in formalin labelled "sigmoid colon biopsy" are three tan-pink fragments measuring 0.3–0.7 cm.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: 'GI-UK',
    poolName: 'Gastrointestinal',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  {
    id: 'MFT26-8808-POOL',
    accession: { accessionNumber: '8808', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8808-POOL' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: { id: 'PAT-UK-008', mrn: '200008', firstName: 'Alan', lastName: 'Butterworth', dateOfBirth: isoYearsAgo(77, 3, 22), sex: 'M', phone: '0161 901 2345', email: 'a.butterworth@nhs.net', address: '6 St Anns Square, Manchester, M2 7LP', nhsNumber: '456 902 3456' },
    specimens: [{ id: 'MFT26-8808-SP-1', label: 'A', description: 'Prostate biopsy — right apex', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
                { id: 'MFT26-8808-SP-2', label: 'B', description: 'Prostate biopsy — right mid', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
                { id: 'MFT26-8808-SP-3', label: 'C', description: 'Prostate biopsy — right base', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] }],
    order: { priority: 'Routine', requestingProvider: 'Mr. David Whitmore', facilityId: 'c-mft-02', facilityName: 'Wythenshawe Hospital', clinicalIndication: 'PSA 9.1 ng/mL. PI-RADS 4 lesion right mid. Proceeding to targeted biopsy.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: 'Three containers labelled A–C, each containing 2 prostate needle biopsy cores, 12–15 mm each.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: 'URO-UK',
    // Real fix, per direct report: was 'Uropathology', which never
    // matched the real Subspecialty record's own name ('Urological') —
    // silently broke both display-layer restriction matching and
    // canUserClaimPoolCase's own enforcement for this specific pool.
    poolName: 'Urological',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  {
    id: 'MFT26-8809-POOL',
    accession: { accessionNumber: '8809', accessionPrefix: 'MFT', accessionYear: 2026, fullAccession: 'MFT26-8809-POOL' },
    originHospitalId: 'HOSP-MFT', originEnterpriseId: 'ENT-MFT',
    patient: { id: 'PAT-UK-009', mrn: '200009', firstName: 'Dorothy', lastName: 'Whitworth', dateOfBirth: isoYearsAgo(49, 8, 5), sex: 'F', phone: '0161 012 3456', email: 'd.whitworth@nhs.net', address: '31 Chapel Street, Salford, M3 5JJ', nhsNumber: '567 013 4567' },
    specimens: [{ id: 'MFT26-8809-SP-1', label: 'A', description: 'Right hemicolectomy — emergency resection', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] }],
    order: { priority: 'STAT', requestingProvider: 'Mr. Peter Thornton', facilityId: 'c-mft-01', facilityName: 'Manchester Royal Infirmary', clinicalIndication: 'Emergency right hemicolectomy for obstructing caecal mass. CT: suspected adenocarcinoma.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: 'Right hemicolectomy specimen, 32 cm, received fresh. Obstructing tumour in caecum, 5.8 cm. Tumour perforates the serosal surface at one point.', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: 'GI-UK',
    poolName: 'Gastrointestinal',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [{ tagClass: 'ADMINISTRATIVE', id: 'stat_rush', name: 'STAT — Rush Processing', color: '#ef4444', level: 'Case', status: 'Active', severity: 5 }],
    specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  // ─────────────────────────────────────────────────────────────────────────────
  // US DEMO CASES — Henry Ford Health System
  // Amber Fehrs-Battey (PATH-US-001) — Surgical Pathology
  // Dr. J. Mark Tuthill (PATH-US-002) — Pathology Informatics
  // Hospital: HOSP-HFHS  Enterprise: ENT-HFHS
  // ─────────────────────────────────────────────────────────────────────────────


  // ── S26-4420: Sarah Johnson — Melanoma Excision, Ready for Finalisation ──────
  {
    id: 'S26-4420-MEL',
    accession: { accessionNumber: '4420', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4420-MEL' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-001',
    patient: {
      id: 'PAT-4420', mrn: '104420',
      firstName: 'Margaret', lastName: 'Holloway',
      dateOfBirth: isoYearsAgo(54, 3, 18), sex: 'F',
      phone: '555-0420', email: 'm.holloway@email.com',
      address: '44 Elmwood Drive, Springfield, IL 62701',
    },
    specimens: [
      { tagClass: 'ADMINISTRATIVE', id: 'S26-4420-SP-1', label: 'A', description: 'Wide local excision — right forearm', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [
        { tagClass: 'ADMINISTRATIVE', id: 'thick_melanoma', name: 'Breslow > 2 mm', color: '#ef4444', level: 'Case', status: 'Active', severity: 4 },
      ]},
      { id: 'S26-4420-SP-2', label: 'B', description: 'Sentinel lymph node — right axilla', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Nancy Graves',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Pigmented lesion right forearm 2.1 cm, irregular border. Punch biopsy: invasive melanoma, superficial spreading type, Breslow 2.3 mm. Proceeding to wide local excision with 2 cm margin and sentinel node biopsy.',
      receivedDate: isoDaysAgo(1),
      assignedTo: 'PATH-001',
    },
    diagnostic: {
      grossDescription: 'A) Received in formalin, labelled "right forearm wide local excision", is an ellipse of tissue measuring 6.2 × 4.1 cm with subcutaneous tissue to a depth of 1.8 cm. A scar/biopsy site is identified centrally measuring 1.2 × 0.8 cm with surrounding change. Margins are inked (peripheral: blue, deep: black). Sections taken perpendicular to the long axis. B) Received in formalin, labelled "right axillary sentinel node", are two nodes, the larger measuring 1.8 cm and the smaller 0.9 cm.',
      microscopicDescription: 'A) Sections of the excision show residual invasive finding, one histologic type, at the biopsy site. Maximum thickness 2.4 mm. Anatomic level 4. No surface change. Activity rate 3/mm². No microscopic or macroscopic satellite findings identified. Lymphatic/vascular involvement not identified. Neural involvement not identified. Infiltrating cell response: non-brisk. Regression not identified. All peripheral and deep margins are negative; closest deep margin is 8 mm, closest peripheral margin is 11 mm. B) One of two regional nodes contains a subcapsular deposit, largest dimension 1.2 mm (micro-scale). No extranodal extension. Second node negative.',
      ancillaryStudies: 'Immunohistochemistry: Marker A positive, Marker B positive, Marker C focal positive, Marker D positive. Marker panel highlights a subcapsular deposit in regional node A. Marker E IHC: Positive.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4420-SYN-1',
        specimenId: 'S26-4420-SP-1',
        templateId: 'skin_melanoma_bx',
        templateName: 'Generic Template — Skin Melanoma Bx',
        status: 'in-progress',
        answers: {
          procedure:                    ['procedure_opt_3'],
          specimen_laterality:          'specimen_laterality_opt_1',
          histologic_type:              'histologic_type_opt_2',
          ulceration:                   'ulceration_opt_1',
          anatomic_clark_level:         'anatomic_clark_level_opt_3',
          microsatellites:              'microsatellites_opt_1',
          lymphatic_vascular_invasion:  'lymphatic_vascular_invasion_opt_2',
          neurotropism:                 'neurotropism_opt_2',
          tumor_infiltrating_lymphocytes: 'tumor_infiltrating_lymphocytes_opt_2',
          margin_status_melanoma:       ['margin_status_melanoma_opt_1'],
          macroscopic_satellite_lesions: 'macroscopic_satellite_lesions_opt_2',
        },
        aiSuggestions: {
          procedure:                   { value: ['procedure_opt_3'],              confidence: 93, source: 'Gross description', verification: 'verified' },
          specimen_laterality:         { value: 'specimen_laterality_opt_1',      confidence: 99, source: 'Gross description', verification: 'verified' },
          histologic_type:             { value: 'histologic_type_opt_2',          confidence: 97, source: 'Microscopic description', verification: 'verified' },
          ulceration:                  { value: 'ulceration_opt_1',               confidence: 95, source: 'Microscopic description', verification: 'verified' },
          anatomic_clark_level:        { value: 'anatomic_clark_level_opt_3',     confidence: 94, source: 'Microscopic description', verification: 'verified' },
          microsatellites:             { value: 'microsatellites_opt_1',          confidence: 93, source: 'Microscopic description', verification: 'verified' },
          lymphatic_vascular_invasion: { value: 'lymphatic_vascular_invasion_opt_2', confidence: 96, source: 'Microscopic description', verification: 'verified' },
          neurotropism:                { value: 'neurotropism_opt_2',             confidence: 95, source: 'Microscopic description', verification: 'verified' },
          tumor_infiltrating_lymphocytes: { value: 'tumor_infiltrating_lymphocytes_opt_2', confidence: 88, source: 'Microscopic description', verification: 'verified' },
          margin_status_melanoma:      { value: ['margin_status_melanoma_opt_1'], confidence: 97, source: 'Microscopic description', verification: 'verified' },
          macroscopic_satellite_lesions: { value: 'macroscopic_satellite_lesions_opt_2', confidence: 91, source: 'Microscopic description', verification: 'verified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: 'S26-4420-SYN-2',
        specimenId: 'S26-4420-SP-2',
        templateId: 'skin_melanoma_bx',
        templateName: 'Generic Template — Skin Melanoma (Sentinel Node)',
        status: 'in-progress',
        answers: {
          procedure:                    ['procedure_opt_3'],
          margin_status_melanoma:       ['margin_status_melanoma_opt_1'],
        },
        aiSuggestions: {
          procedure:               { value: ['procedure_opt_3'],              confidence: 88, source: 'Gross description', verification: 'verified' },
          margin_status_melanoma:  { value: ['margin_status_melanoma_opt_1'], confidence: 90, source: 'Microscopic description', verification: 'verified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'in-progress' as CaseStatus,
    participants: [{ staffId: 'PATH-001', staffName: 'Pete Nimmo', source: 'system', participationTypeIds: ['attending'], addedBy: 'system', addedAt: isoDaysAgo(1), status: 'active' }],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'braf_positive',  name: 'BRAF V600E Positive — Targeted Therapy Eligible', color: '#0891b2',  level: 'Case', status: 'Active', severity: 3 },
      { tagClass: 'ADMINISTRATIVE', id: 'sentinel_pos',   name: 'Sentinel Node Positive — Completion Dissection?',  color: '#ef4444',   level: 'Case', status: 'Active', severity: 4 },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C43.61'], snomed: ['372244006'] },
  },

  // HFHS-001 — Amber: Invasive breast carcinoma, AI-assisted
  {
    id: 'MPA26-1001-BR',
    accession: { accessionNumber: '1001', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'MPA26-1001-BR' },
    originHospitalId: 'HOSP-MPA',  originEnterpriseId: 'ENT-MPA',
    patient: { id: 'PAT-US-001', mrn: '300001', firstName: 'Patricia', lastName: 'Novak', dateOfBirth: isoYearsAgo(58, 3, 14), sex: 'F', phone: '313-555-1001', email: 'p.novak@email.com', address: '4840 Woodward Ave, Detroit, MI 48201' },
    specimens: [
      { id: 'MPA26-1001-SP-1', label: 'A', description: 'Left breast lumpectomy — wire-guided excision', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
      { id: 'MPA26-1001-SP-2', label: 'B', description: 'Left axillary sentinel lymph node biopsy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Lisa Kaminski', facilityId: 'c-mpa-01', facilityName: 'Northwestern Memorial Hospital', clinicalIndication: 'Left breast mass 1.8 cm on mammogram. BI-RADS 5. Wire-guided excision. Sentinel node mapping performed.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'A) Excision specimen 4.2 x 3.8 x 2.1 cm. Irregular firm tan-white mass 1.9 cm at the 12 o\'clock position, 0.3 cm from the nearest margin. B) Three fragments of fibrofatty tissue, largest 1.2 cm. AF/mg',
      microscopicDescription: 'A) Sections show a primary finding, Grade 2. Lymphatic/vascular involvement identified. Margins: anterior 0.2 cm, posterior 1.1 cm, superior 0.8 cm, inferior 1.4 cm. B) One of three regional nodes positive, largest deposit 4 mm.',
      ancillaryStudies: 'Marker A 95% strong, Marker B 80% moderate, Marker C 2+ (equivocal — confirmatory test pending), Proliferation index 18%.',
    },
    synopticReports: [{
      instanceId: 'MPA26-1001-SYN-1', specimenId: 'MPA26-1001-SP-1',
      templateId: 'breast_invasive', templateName: 'Generic Template — Breast Invasive',
      answers: {},
      aiSuggestions: {
        procedure:                          { value: 'procedure_opt_1',           confidence: 96, source: 'Gross description', verification: 'unverified' },
        specimen_laterality:                { value: 'specimen_laterality_opt_2', confidence: 99, source: 'Gross description', verification: 'unverified' },
        histologic_type:                    { value: 'histologic_type_opt_2',     confidence: 97, source: 'Microscopic description', verification: 'unverified' },
        histologic_grade:                   { value: 'Grade 2',                   confidence: 92, source: 'Microscopic description', verification: 'unverified' },
        tumor_size:                         { value: '1.9 cm',                    confidence: 95, source: 'Gross description', verification: 'unverified' },
        tumor_focality:                     { value: 'tumor_focality_opt_1',      confidence: 88, source: 'Gross: single mass identified', verification: 'unverified' },
        lvi:                                { value: 'lvi_opt_2',                 confidence: 90, source: 'Microscopic description', verification: 'unverified' },
        margin_status_invasive:             { value: 'margin_status_invasive_opt_3', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
        distance_invasive_to_named_margins: { value: '0.2 cm',                    confidence: 86, source: 'Microscopic description', verification: 'unverified' },
        regional_ln_status:                 { value: 'regional_ln_status_opt_4',  confidence: 93, source: 'Microscopic description', verification: 'unverified' },
        number_ln_macrometastases:          { value: '1',                         confidence: 91, source: 'Microscopic description', verification: 'unverified' },
        largest_nodal_met_mm:               { value: '4',                         confidence: 89, source: 'Microscopic description', verification: 'unverified' },
        total_ln_examined:                  { value: '3',                         confidence: 95, source: 'Microscopic description', verification: 'unverified' },
        sentinel_ln_examined:               { value: '3',                         confidence: 95, source: 'Specimen B description', verification: 'unverified' },
      },
      status: 'draft', createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    }],
    status: 'in-progress' as CaseStatus,
    participants: [{ staffId: 'PATH-US-001', staffName: 'Amber Fehrs-Battey', source: 'system', participationTypeIds: ['attending'], addedBy: 'system', addedAt: isoDaysAgo(1), status: 'active' }],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // HFHS-002 — Amber: Colorectal adenocarcinoma, post-neoadjuvant
  {
    id: 'MPA26-1002-CR',
    accession: { accessionNumber: '1002', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'MPA26-1002-CR' },
    originHospitalId: 'HOSP-MPA',  originEnterpriseId: 'ENT-MPA',
    patient: { id: 'PAT-US-002', mrn: '300002', firstName: 'Robert', lastName: 'Dziedzic', dateOfBirth: isoYearsAgo(67, 11, 2), sex: 'M', phone: '313-555-1002', email: 'r.dziedzic@email.com', address: '15 Grand Blvd, Detroit, MI 48202' },
    specimens: [
      { id: 'MPA26-1002-SP-1', label: 'A', description: 'Low anterior resection — sigmoid/rectosigmoid', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. James Orringer', facilityId: 'c-mpa-02', facilityName: 'Rush University Medical Center', clinicalIndication: 'Rectal adenocarcinoma cT3N1. Post-neoadjuvant chemoradiation (5-FU/capecitabine). Low anterior resection. Assess treatment response.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Resection specimen 28 cm. Area of regression 3.2 x 2.8 cm, firm, pale, 11 cm from distal margin. Surrounding tissue intact. 18 regional nodes identified. AF/sd',
      microscopicDescription: 'Residual moderately differentiated primary finding with extensive treatment effect. Regression grade 2 — moderate response with residual finding. Category A: Level 3; Category B: Level 0 (0/18). Nearest margin clear by 3.1 mm. Proximal and distal margins uninvolved.',
      ancillaryStudies: 'Marker panel A by IHC: four markers positive — proficient pattern. Marker panel B: wild type. Marker panel C: wild type. Marker panel D: not detected.',
    },
    synopticReports: [{
      instanceId: 'MPA26-1002-SYN-1', specimenId: 'MPA26-1002-SP-1',
      templateId: 'colon_resection', templateName: 'Generic Template — Colon Resection',
      answers: {},
      aiSuggestions: {
        procedure:              { value: 'procedure_opt_5',        confidence: 95, source: 'Gross description', verification: 'unverified' },
        tumor_site:             { value: ['tumor_site_opt_9'],     confidence: 94, source: 'Gross description', verification: 'unverified' },
        histologic_type:        { value: 'histologic_type_opt_1',  confidence: 95, source: 'Microscopic description', verification: 'unverified' },
        histologic_grade:       { value: 'histologic_grade_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
        treatment_effect:       { value: 'treatment_effect_opt_4', confidence: 93, source: 'Microscopic description', verification: 'unverified' },
        stage_category_a:       { value: 'stage_category_a_opt_6', confidence: 97, source: 'Microscopic description', verification: 'unverified' },
        stage_category_b:       { value: 'stage_category_b_opt_3', confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        ln_examined:            { value: '18',                     confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        distance_radial_margin: { value: '3.1 mm',                 confidence: 96, source: 'Microscopic description', verification: 'unverified' },
      },
      status: 'draft', createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    }],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // HFHS-003 — Amber: Prostate adenocarcinoma, radical prostatectomy
  {
    id: 'MPA26-1003-PRO',
    accession: { accessionNumber: '1003', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'MPA26-1003-PRO' },
    originHospitalId: 'HOSP-MPA',  originEnterpriseId: 'ENT-MPA',
    patient: { id: 'PAT-US-003', mrn: '300003', firstName: 'Charles', lastName: 'Okafor', dateOfBirth: isoYearsAgo(63, 7, 22), sex: 'M', phone: '313-555-1003', email: 'c.okafor@email.com', address: '2799 W Grand Blvd, Detroit, MI 48202' },
    specimens: [
      { id: 'MPA26-1003-SP-1', label: 'A', description: 'Radical prostatectomy — robotic-assisted', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
      { id: 'MPA26-1003-SP-2', label: 'B', description: 'Right pelvic lymph node dissection', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
      { id: 'MPA26-1003-SP-3', label: 'C', description: 'Left pelvic lymph node dissection', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Mani Menon', facilityId: 'c-mpa-03', facilityName: 'Advocate Illinois Masonic Medical Center', clinicalIndication: 'PSA 8.4. Biopsy Gleason 3+4=7 (Grade Group 2), 6/12 cores positive right lobe. Robotic-assisted radical prostatectomy with bilateral pelvic lymph node dissection.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Organ specimen 38g, 4.2 x 3.9 x 3.5 cm. Posterior right-sided induration. Adjacent structures intact. Additional structures bilaterally submitted. AF/mg',
      microscopicDescription: 'Primary finding, usual type, Score total 7 (Grade Group 2). Dominant focus 1.8 cm right posterior lobe. Extension beyond organ present right posterolateral (focal). Adjacent structures uninvolved. Surgical margin positive right posterior, 1 mm length. B+C) 0/14 regional nodes with involvement.',
      ancillaryStudies: '',
    },
    synopticReports: [{
      instanceId: 'MPA26-1003-SYN-1', specimenId: 'MPA26-1003-SP-1',
      templateId: 'prostate_resection', templateName: 'Generic Template — Prostate Resection',
      answers: {},
      aiSuggestions: {
        histologic_type:          { value: ['histologic_type_opt_1'],       confidence: 97, source: 'Microscopic description', verification: 'unverified' },
        grade_group:              { value: 'grade_group_opt_2',             confidence: 98, source: 'Microscopic description', verification: 'unverified' },
        idc_present:              { value: 'idc_present_opt_1',             confidence: 88, source: 'No secondary finding mentioned', verification: 'unverified' },
        treatment_effect:         { value: ['treatment_effect_opt_1'],      confidence: 92, source: 'Clinical: no neoadjuvant therapy documented', verification: 'unverified' },
        extraprostatic_extension: { value: 'extraprostatic_extension_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
        bladder_neck_invasion:    { value: 'bladder_neck_invasion_opt_1',   confidence: 95, source: 'No involvement mentioned', verification: 'unverified' },
        seminal_vesicle_invasion: { value: 'seminal_vesicle_invasion_opt_1', confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        lymphovascular_invasion:  { value: 'lymphovascular_invasion_opt_1', confidence: 90, source: 'No involvement identified', verification: 'unverified' },
        margin_status:            { value: 'margin_status_opt_3',           confidence: 94, source: 'Microscopic description', verification: 'unverified' },
        margins_involved:         { value: ['margins_involved_opt_6'],      confidence: 92, source: 'Microscopic description', verification: 'unverified' },
        regional_ln_status:       { value: 'regional_ln_status_opt_3',      confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        ln_number_examined:       { value: 14,                              confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        stage_category_a:         { value: 'stage_category_a_opt_2',        confidence: 90, source: 'Focal extension noted', verification: 'unverified' },
        stage_category_b:         { value: 'stage_category_b_opt_3',        confidence: 99, source: 'Microscopic description', verification: 'unverified' },
      },
      status: 'draft', createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    }],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // HFHS-004 — Tuthill: Lung adenocarcinoma — Pathology Informatics focus, AI routing demo
  {
    id: 'HFHS26-1004-LU',
    accession: { accessionNumber: '1004', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'HFHS26-1004-LU' },
    originHospitalId: 'HOSP-HFHS', originEnterpriseId: 'ENT-HFHS',
    patient: { id: 'PAT-US-004', mrn: '300004', firstName: 'Sandra', lastName: 'Kowalski', dateOfBirth: isoYearsAgo(71, 5, 8), sex: 'F', phone: '313-555-1004', email: 's.kowalski@email.com', address: '1 Ford Place, Dearborn, MI 48126' },
    specimens: [
      { id: 'HFHS26-1004-SP-1', label: 'A', description: 'Right upper lobe lobectomy — VATS', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'HFHS26-1004-SP-2', label: 'B', description: 'Level 4R lymph node — mediastinoscopy', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Harvey Pass', facilityId: 'c-hfhs-01', facilityName: 'Henry Ford Macomb Hospital', clinicalIndication: 'RUL nodule 2.4 cm, SUV 6.2 on PET. No mediastinal uptake. VATS lobectomy with mediastinal staging. Former smoker 40 pack-years.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-US-002', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Resection specimen 12 x 9 x 4 cm. Subpleural finding 2.4 x 2.1 x 1.9 cm, grey-white, firm, irregular. Surface puckering overlying. MT/sd',
      microscopicDescription: 'Primary finding, predominantly one pattern with a secondary component (70%/30%). Adjacent surface involvement present. Lymphatic/vascular involvement absent. Surgical margins uninvolved. B) 0/3 regional nodes.',
      ancillaryStudies: 'Marker A: one alteration detected. Marker B: negative. Marker C: negative. Expression score: 35%.',
    },
    synopticReports: [{
      instanceId: 'HFHS26-1004-SYN-1', specimenId: 'HFHS26-1004-SP-1',
      templateId: 'lung_resection', templateName: 'Generic Template — Lung Resection',
      answers: {},
      aiSuggestions: {
        procedure:                { value: ['procedure_opt_3'],            confidence: 97, source: 'Gross description', verification: 'unverified' },
        specimen_laterality:      { value: 'specimen_laterality_opt_1',    confidence: 99, source: 'Gross description', verification: 'unverified' },
        tumor_site:               { value: ['tumor_site_opt_1'],           confidence: 99, source: 'Gross description', verification: 'unverified' },
        histologic_type:          { value: 'histologic_type_opt_6',        confidence: 96, source: 'Microscopic description', verification: 'unverified' },
        tumor_size_invasive_cm:   { value: '2.4 cm',                       confidence: 98, source: 'Gross description', verification: 'unverified' },
        visceral_pleura_invasion: { value: 'visceral_pleura_invasion_opt_2', confidence: 92, source: 'Microscopic description', verification: 'unverified' },
        stas:                     { value: 'stas_opt_1',                   confidence: 85, source: 'No secondary spread pattern identified', verification: 'unverified' },
        regional_ln_status:       { value: 'regional_ln_status_opt_3',     confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        ln_number_examined:       { value: 3,                              confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        stage_category_a:         { value: 'stage_category_a_opt_9',       confidence: 89, source: 'Microscopic description', verification: 'unverified' },
        stage_category_b:         { value: 'stage_category_b_opt_3',       confidence: 99, source: 'Microscopic description', verification: 'unverified' },
      },
      status: 'draft', createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    }],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [{ tagClass: 'ADMINISTRATIVE', id: 'egfr_actionable', name: 'Actionable Mutation — Oncology Alert', color: '#0891b2', level: 'Case', status: 'Active', severity: 4 }],
    specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // HFHS-005 — Tuthill: STAT frozen section — routing/workflow demo
  {
    id: 'HFHS26-1005-FS',
    accession: { accessionNumber: '1005', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'HFHS26-1005-FS' },
    originHospitalId: 'HOSP-HFHS', originEnterpriseId: 'ENT-HFHS',
    patient: { id: 'PAT-US-005', mrn: '300005', firstName: 'George', lastName: 'Washington', dateOfBirth: isoYearsAgo(55, 1, 18), sex: 'M', phone: '313-555-1005', email: 'g.washington@email.com', address: '6071 W Outer Dr, Detroit, MI 48235' },
    specimens: [
      { tagClass: 'ADMINISTRATIVE', id: 'HFHS26-1005-SP-1', label: 'A', description: 'Pancreatic head mass — INTRAOPERATIVE FROZEN SECTION', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ tagClass: 'ADMINISTRATIVE', id: 'frozen', name: 'Frozen Section', color: '#f59e0b', level: 'Case', status: 'Active', severity: 5 }] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Mazen Iskandar', facilityId: 'c-hfhs-03', facilityName: 'Detroit Medical Center', clinicalIndication: 'Pancreatic head mass 3.1 cm. CA19-9 elevated 480. Whipple procedure. Intraoperative: assess pancreatic neck margin and common bile duct margin.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-US-002', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Pancreatic neck margin: grey-white fibrous tissue 1.2 cm. Common bile duct margin: tan tubular tissue 0.8 cm. MT/fs — called to OR at 10:42',
      microscopicDescription: 'FROZEN SECTION DIAGNOSIS: Pancreatic neck margin — NO CARCINOMA. Common bile duct margin — NO CARCINOMA. Permanent sections pending.',
      ancillaryStudies: '',
    },
    synopticReports: [],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'stat_frozen', name: 'STAT — Intraoperative Frozen Section', color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { tagClass: 'ADMINISTRATIVE', id: 'or_pending', name: 'OR Awaiting Result', color: '#f59e0b', level: 'Case', status: 'Active', severity: 4 },
    ],
    specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // HFHS-006 — Pool case (unassigned, routes to Surgical Pathology pool)
  {
    id: 'MPA26-1006-POOL',
    accession: { accessionNumber: '1006', accessionPrefix: 'HFHS', accessionYear: 2026, fullAccession: 'MPA26-1006-POOL' },
    originHospitalId: 'HOSP-MPA',  originEnterpriseId: 'ENT-MPA',
    patient: { id: 'PAT-US-006', mrn: '300006', firstName: 'Maria', lastName: 'Kowalczyk', dateOfBirth: isoYearsAgo(44, 9, 3), sex: 'F', phone: '313-555-1006', email: 'm.kowalczyk@email.com', address: '3990 John R St, Detroit, MI 48201' },
    specimens: [
      { id: 'MPA26-1006-SP-1', label: 'A', description: 'Cervical LEEP excision', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Carolyn Johnston', facilityId: 'c-hfhs-07', facilityName: 'Michigan Urology Centre', clinicalIndication: 'High-grade squamous intraepithelial lesion on colposcopy. LEEP excision. Assess margins and grade.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    // Real fix, per direct report: poolName was 'Gynaecologic
    // Pathology', which never matched the real Subspecialty record's
    // own name ('Gynecological') — same silent enforcement gap as the
    // 'Urological' fix above.
    poolId: 'GYN-MPA', poolName: 'Gynecological',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [], reportingMode: 'assist', coding: {},
  } as any,

  // MPA26-1007-PED — Amber: Pediatric Wilms tumor (nephroblastoma)
  // Patient age 8 — below Metro General's pediatricAgeThreshold of 18
  // Used to test pediatric access control: Amber should see access-denied
  {
    id: 'MPA26-1007-PED',
    accession: { accessionNumber: '1007', accessionPrefix: 'MPA', accessionYear: 2026, fullAccession: 'MPA26-1007-PED' },
    originHospitalId: 'HOSP-MPA', originEnterpriseId: 'ENT-MPA',
    patient: {
      id: 'PAT-US-007', mrn: '300007',
      firstName: 'Liam', lastName: 'Osei',
      dateOfBirth: isoYearsAgo(8, 4, 12), sex: 'M',
      phone: '313-555-1007', email: 'osei.family@email.com',
      address: '1201 St Antoine St, Detroit, MI 48226',
    },
    specimens: [
      { id: 'MPA26-1007-SP-1', label: 'A', description: 'Right nephrectomy — radical', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Priya Nair',
      facilityId: 'c1',
      facilityName: 'Metro General Hospital',
      clinicalIndication: 'Right renal mass 7.2 cm on CT, detected incidentally. No metastatic disease on staging. Proceeding to right radical nephrectomy. Clinical diagnosis: Wilms tumour (nephroblastoma). Age 8.',
      receivedDate: isoDaysAgo(1),
      assignedTo: 'PATH-US-001',
    },
    diagnostic: {
      grossDescription: 'Right organ with attached adjacent fat, 14 x 9 x 7 cm total, 220 g. Encapsulated tan-grey lobulated mass 7.2 x 6.8 x 6.1 cm arising from upper pole. Surrounding capsule intact. Cut surface: pale tan, fish-flesh, with areas of haemorrhage and necrosis. Remaining parenchyma compressed. Hilar vessels and adjacent duct sampled. MT/amber',
      microscopicDescription: 'Multi-component primary finding composed of three cellular elements. No high-grade feature identified. Finding confined within surrounding capsule. Surgical margins uninvolved. Hilar node: 0/2 nodes involved.',
      ancillaryStudies: '',
    },
    synopticReports: [{
      instanceId:   'MPA26-1007-SYN-1',
      specimenId:   'MPA26-1007-SP-1',
      templateId:   'wilms_resection',
      templateName: 'Generic Template — Wilms Resection',
      status:       'draft' as const,
      createdAt:    isoDaysAgo(1),
      updatedAt:    isoDaysAgo(0),
      answers: {
        expert_consultation:      'expert_consultation_opt_3',
        procedure:                'procedure_opt_2',
        specimen_laterality:      ['specimen_laterality_opt_1'],
        nephrectomy_weight_g:     '220',
        histologic_type:          'histologic_type_opt_1',
        tumor_size_cm:            '7.2',
        tumor_focality:           'tumor_focality_opt_1',
        nephrogenic_rests:        'nephrogenic_rests_opt_1',
        tumor_disruption:         'tumor_disruption_opt_2',
        renal_sinus_involvement:  'renal_sinus_involvement_opt_1',
        extrarenal_vascular:      'extrarenal_vascular_opt_1',
        capsule_extension:        'capsule_extension_opt_1',
        adjacent_organ_extension: 'adjacent_organ_extension_opt_1',
        margin_status:            'margin_status_opt_1',
        ln_status:                'ln_status_opt_2',
        ln_number_examined:       '2',
        ln_number_positive:       '0',
        distant_metastasis:       ['distant_metastasis_opt_1'],
        staging_system:           'staging_system_opt_1',
        stage_system_a:           'stage_system_a_opt_2',
      },
      aiSuggestions: {
        histologic_type:    { value: 'histologic_type_opt_1', confidence: 97, source: 'Microscopic description', verification: 'unverified' },
        tumor_size_cm:      { value: '7.2',                   confidence: 99, source: 'Gross description', verification: 'unverified' },
        tumor_focality:     { value: 'tumor_focality_opt_1',  confidence: 95, source: 'Gross description', verification: 'unverified' },
        margin_status:      { value: 'margin_status_opt_1',   confidence: 98, source: 'Microscopic description', verification: 'unverified' },
        ln_status:          { value: 'ln_status_opt_2',       confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        ln_number_examined: { value: '2',                     confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        ln_number_positive: { value: '0',                     confidence: 99, source: 'Microscopic description', verification: 'unverified' },
        stage_system_a:     { value: 'stage_system_a_opt_2',  confidence: 94, source: 'Finding confined, margins negative, nodes negative', verification: 'unverified' },
      },
    }],
    caseFlags: [
      { tagClass: 'ADMINISTRATIVE', id: 'flag-ped-001', name: 'Pediatric Patient', color: '#f59e0b', severity: 3, level: 'Case', lisCode: 'PEDS', autoCreated: true },
    ],
    specimenFlags: [],
    status: 'draft' as CaseStatus,
    pediatricRestricted: true,
    reportingMode: 'assist',
    coding: {},
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
  } as any,
  // ─────────────────────────────────────────────────────────────────────────
  // ROSSANA BABAKHANI (PATH-RB-001) — UX Review Cases
  // Two LIS (internal hospital) + Two Outreach (external clients)
  // ─────────────────────────────────────────────────────────────────────────

  // ── RB-01: THYROID — LIS / in-progress ──────────────────────────────────
  {
    id: 'S26-4480-THYROID',
    accession: { accessionNumber: '4480', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4480-THYROID' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-RB-01', mrn: '200101',
      firstName: 'Isabelle', lastName: 'Nakamura',
      dateOfBirth: isoYearsAgo(44, 7, 19), sex: 'F',
      phone: '555-301-4480', email: 'isabelle.nakamura@example.org',
      address: '12 Saguaro Heights, Phoenix, AZ 85004',
    },
    specimens: [
      { id: 'S26-4480-SP-1', label: 'A', description: 'Right thyroid lobe and isthmus', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [{ id: 'migrated-braf-comp-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'braf-comp', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
      { id: 'S26-4480-SP-2', label: 'B', description: 'Right central neck lymph nodes (level VI)', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Karen Shapiro',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Thyroid nodule right lobe, 2.8 cm. FNA: Bethesda V — suspicious for papillary thyroid carcinoma. TSH: 1.4. Ultrasound: hypoechoic nodule with microcalcifications and increased vascularity. Proceeding to right hemithyroidectomy + central neck dissection.',
      receivedDate: isoDaysAgo(2), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Received fresh labeled "right thyroid lobe and isthmus" is a resection specimen weighing 18.4g, measuring 5.2 × 3.1 × 1.8 cm. The external surface is smooth and intact. On serial sectioning a firm, grey-white finding measuring 2.6 × 2.0 × 1.8 cm is identified in the mid to lower pole. The finding has irregular borders and demonstrates focal calcification on cut section. The remaining tissue is brown-tan and homogeneous. Specimen B: four regional nodes, largest 0.9 cm.',
      microscopicDescription: 'Sections show a primary finding, one histologic type. The finding measures 2.6 cm and demonstrates characteristic nuclear features. Secondary microscopic structures are present. Finding extends focally to the surgical margin. Lymphatic/vascular involvement is identified. Specimen B: 2 of 4 regional nodes contain involvement; largest deposit 4 mm, no extracapsular extension.',
      ancillaryStudies: 'Marker A mutation: Detected by molecular testing. Marker B promoter: Wild type. Marker C IHC: Positive. Marker D / Marker E: Positive.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4480-SP-1_thyroid_ptc_001',
        specimenId: 'S26-4480-SP-1',
        templateId: 'thyroid_malignant',
        templateName: 'Generic Template — Thyroid Malignant',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_laterality: 'specimen_laterality_opt_1',
          histologic_type: 'histologic_type_opt_1',
          tumor_size: '2.6 cm',
          tumor_focality: 'tumor_focality_opt_1',
          gross_extension: 'gross_extension_opt_1',
          margin_status: 'margin_status_opt_2',
          lymphatic_vascular_invasion: 'lymphatic_vascular_invasion_opt_2',
          regional_ln_status: 'regional_ln_status_opt_4',
          ln_with_tumor: '2',
          ln_examined: '4',
          braf_v600e: 'Detected',
          stage_category_a: 'stage_category_a_opt_2',
          stage_category_b: 'stage_category_b_opt_2',
        },
        aiSuggestions: {
          procedure:             { value: 'procedure_opt_1',           confidence: 97, source: 'Gross description', verification: 'unverified' },
          specimen_laterality:   { value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          histologic_type:       { value: 'histologic_type_opt_1',     confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          tumor_size:            { value: '2.6 cm',                    confidence: 96, source: 'Gross and microscopic description', verification: 'unverified' },
          tumor_focality:        { value: 'tumor_focality_opt_1',      confidence: 90, source: 'No mention of additional foci', verification: 'unverified' },
          margin_status:         { value: 'margin_status_opt_2',       confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          lymphatic_vascular_invasion: { value: 'lymphatic_vascular_invasion_opt_2', confidence: 91, source: 'Microscopic description', verification: 'unverified' },
          regional_ln_status:    { value: 'regional_ln_status_opt_4',  confidence: 95, source: 'Specimen B description', verification: 'unverified' },
          ln_with_tumor:         { value: '2',                         confidence: 93, source: 'Specimen B description', verification: 'unverified' },
          ln_examined:           { value: '4',                         confidence: 95, source: 'Gross description', verification: 'unverified' },
          braf_v600e:            { value: 'Detected',                  confidence: 98, source: 'Ancillary studies', verification: 'unverified' },
          stage_category_a:      { value: 'stage_category_a_opt_2',    confidence: 87, source: 'Microscopic description', verification: 'unverified' },
          stage_category_b:      { value: 'stage_category_b_opt_2',    confidence: 89, source: 'Microscopic description', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { id: 'thyroid-board', tagClass: 'ADMINISTRATIVE', name: 'Thyroid MDT',        lisCode: 'THYR',  color: '#3b82f6', severity: 3, level: 'Case', status: 'Active' },
      { id: 'braf-positive', tagClass: 'ADMINISTRATIVE', name: 'BRAF V600E Positive',lisCode: 'BRAF',  color: '#f59e0b', severity: 2, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C73'], snomed: ['363478007'] },
  },

  // ── RB-02: ENDOMETRIUM — LIS / draft ────────────────────────────────────
  {
    id: 'S26-4481-ENDO',
    accession: { accessionNumber: '4481', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4481-ENDO' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-RB-02', mrn: '200102',
      firstName: 'Constance', lastName: 'Adeyemi',
      dateOfBirth: isoYearsAgo(58, 2, 28), sex: 'F',
      phone: '555-302-4481', email: 'constance.adeyemi@example.org',
      address: '339 Ocotillo Lane, Mesa, AZ 85201',
    },
    specimens: [
      { id: 'S26-4481-SP-1', label: 'A', description: 'Endometrial curettings', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Patricia Owens',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Post-menopausal bleeding. Endometrial thickness 14 mm on ultrasound. Office biopsy non-diagnostic. Proceeding to D&C. CA-125 normal.',
      receivedDate: isoDaysAgo(1), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Received in formalin labeled "endometrial curettings" is a 4.3g aggregate of tan-brown tissue fragments measuring up to 1.2 cm in greatest dimension. Representative sections submitted in four cassettes.',
      microscopicDescription: 'Sections show a primary finding, Grade 1. The finding demonstrates glandular architecture with less than 5% solid growth. Nuclear atypia is mild. No adjacent muscular tissue is identified in the curettings. No lymphatic/vascular involvement seen in the submitted sections.',
      ancillaryStudies: 'Marker panel A: four markers — all retained (proficient pattern). Marker B: Positive (strong, 90%). Marker C: Positive (moderate, 60%). Marker D: Wild type pattern.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4481-SP-1_endo_001',
        specimenId: 'S26-4481-SP-1',
        templateId: 'endometrium_biopsy',
        templateName: 'Generic Template — Endometrium Biopsy',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_1',
          histologic_type: 'histologic_type_opt_1',
          figo_grade: 'figo_grade_opt_1',
          lymphatic_vascular_invasion: 'lymphatic_vascular_invasion_opt_1',
          mismatch_repair: 'mismatch_repair_opt_1',
          marker_b_status: 'marker_b_status_opt_1',
          marker_c_status: 'marker_c_status_opt_1',
          marker_d: 'marker_d_opt_1',
        },
        aiSuggestions: {
          procedure:       { value: 'procedure_opt_1',       confidence: 91, source: 'Clinical indication', verification: 'unverified' },
          histologic_type: { value: 'histologic_type_opt_1', confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          figo_grade:      { value: 'figo_grade_opt_1',      confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          lymphatic_vascular_invasion: { value: 'lymphatic_vascular_invasion_opt_1', confidence: 84, source: 'Microscopic description', verification: 'unverified' },
          mismatch_repair: { value: 'mismatch_repair_opt_1', confidence: 98, source: 'Ancillary studies', verification: 'unverified' },
          marker_b_status: { value: 'marker_b_status_opt_1', confidence: 97, source: 'Ancillary studies', verification: 'unverified' },
          marker_c_status: { value: 'marker_c_status_opt_1', confidence: 95, source: 'Ancillary studies', verification: 'unverified' },
          marker_d:        { value: 'marker_d_opt_1',        confidence: 96, source: 'Ancillary studies', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'draft' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
    caseFlags: [
      { id: 'gynaec-oncol', tagClass: 'ADMINISTRATIVE', name: 'Gynaecology Oncology', lisCode: 'GYNOC', color: '#3b82f6', severity: 2, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C54.1'], snomed: ['413448000'] },
  },

  // ── RB-03: RENAL CELL CARCINOMA — Outreach / STAT / in-progress ──────────
  {
    id: 'S26-4482-RENAL',
    accession: { accessionNumber: '4482', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4482-RENAL' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-RB-03', mrn: '200103',
      firstName: 'Victor', lastName: 'Halloran',
      dateOfBirth: isoYearsAgo(62, 11, 3), sex: 'M',
      phone: '555-303-4482', email: 'victor.halloran@example.org',
      address: '58 Ironwood Trail, Scottsdale, AZ 85260',
    },
    specimens: [
      { id: 'S26-4482-SP-1', label: 'A', description: 'Partial nephrectomy — right renal mass', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'migrated-vhl-mutation-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'vhl-mutation', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
      { id: 'S26-4482-SP-2', label: 'B', description: 'Surgical margin shave', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'STAT',
      requestingProvider: 'Dr. Nathan Briggs',
      facilityId: 'c_outreach_urology', facilityName: 'Desert Hills Urology Associates',
      clinicalIndication: 'Incidental right renal mass 3.4 cm on CT abdomen. Enhancement pattern consistent with RCC. No lymphadenopathy. Serum creatinine stable. Robotic partial nephrectomy. Frozen section intraoperative.',
      receivedDate: isoDaysAgo(1), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Received fresh labeled "partial nephrectomy, right renal mass" is a 38.7g wedge of organ tissue measuring 5.5 × 4.0 × 2.8 cm. The surface is bosselated. On sectioning a well-circumscribed, golden-yellow mass measuring 3.2 × 3.0 × 2.6 cm is identified, surrounded by a fibrous capsule. The mass is 0.2 cm from the closest surgical margin. Areas of central haemorrhage are present. No necrosis identified. Specimen B: A single shave of resection margin 0.1 cm in thickness.',
      microscopicDescription: 'Sections show a primary finding, Grade 2. Finding cells are arranged in two architectural patterns with abundant clear cytoplasm and small, round, uniform nuclei with inconspicuous nucleoli. A delicate vascular network is present. No secondary differentiation pattern. No additional features. Lymphatic/vascular involvement is not identified. The finding is confined within the surrounding capsule. Surgical margin (Specimen B) is negative; closest approach 2 mm.',
      ancillaryStudies: 'Marker A IHC: Diffuse membranous positivity (consistent with finding). Marker B: Positive. Marker C: Negative. Marker D: Negative. Marker E sequencing: Mutation detected. Expression score: 2.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4482-SP-1_kidney_rcc_001',
        specimenId: 'S26-4482-SP-1',
        templateId: 'kidney_resection',
        templateName: 'Generic Template — Kidney Resection',
        status: 'draft',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_laterality: 'specimen_laterality_opt_1',
          histologic_type: 'histologic_type_opt_1',
          histologic_grade: 'histologic_grade_opt_2',
          tumor_size_cm: 3.2,
          tumor_focality: 'tumor_focality_opt_1',
          tumor_extent: ['tumor_extent_opt_1'],
          lymphatic_vascular_invasion: 'lymphatic_vascular_invasion_opt_1',
          histologic_features: ['histologic_features_opt_1'],
          margin_status: 'margin_status_opt_1',
          stage_category_a: 'stage_category_a_opt_4',
          stage_category_b: 'stage_category_b_opt_2',
        },
        aiSuggestions: {
          procedure:          { value: 'procedure_opt_1',        confidence: 98, source: 'Gross description', verification: 'unverified' },
          specimen_laterality:{ value: 'specimen_laterality_opt_1', confidence: 99, source: 'Gross description', verification: 'unverified' },
          histologic_type:    { value: 'histologic_type_opt_1',  confidence: 95, source: 'Microscopic description', verification: 'unverified' },
          histologic_grade:   { value: 'histologic_grade_opt_2', confidence: 90, source: 'Microscopic description', verification: 'unverified' },
          tumor_size_cm:      { value: 3.2,                      confidence: 96, source: 'Gross description', verification: 'unverified' },
          tumor_focality:     { value: 'tumor_focality_opt_1',   confidence: 93, source: 'Single mass described', verification: 'unverified' },
          tumor_extent:       { value: ['tumor_extent_opt_1'],   confidence: 89, source: 'Microscopic description', verification: 'unverified' },
          lymphatic_vascular_invasion: { value: 'lymphatic_vascular_invasion_opt_1', confidence: 88, source: 'Microscopic description', verification: 'unverified' },
          histologic_features: { value: ['histologic_features_opt_1'], confidence: 94, source: 'Microscopic description', verification: 'unverified' },
          margin_status:      { value: 'margin_status_opt_1',    confidence: 92, source: 'Microscopic description', verification: 'unverified' },
          stage_category_a:   { value: 'stage_category_a_opt_4', confidence: 86, source: 'Finding 3.2 cm, organ confined', verification: 'unverified' },
          stage_category_b:   { value: 'stage_category_b_opt_2', confidence: 85, source: 'No regional nodes submitted', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { id: 'f1',          tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing', lisCode: 'STAT',  color: '#ef4444', severity: 5, level: 'Case', status: 'Active' },
      { id: 'urology-mdt', tagClass: 'ADMINISTRATIVE', name: 'Urology MDT',            lisCode: 'UROL',  color: '#3b82f6', severity: 3, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C64.1'], snomed: ['41607009'] },
  },

  // ── RB-04: MELANOMA — Outreach / in-progress / multi-specimen ───────────
  {
    id: 'S26-4483-MELANOMA',
    accession: { accessionNumber: '4483', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4483-MELANOMA' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-RB-04', mrn: '200104',
      firstName: 'Andrea', lastName: 'Morelli',
      dateOfBirth: isoYearsAgo(51, 5, 8), sex: 'F',
      phone: '555-304-4483', email: 'andrea.morelli@example.org',
      address: '214 Prickly Pear Road, Chandler, AZ 85225',
    },
    specimens: [
      { id: 'S26-4483-SP-1', label: 'A', description: 'Wide local excision — left upper back', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [{ id: 'migrated-braf-comp-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'braf-comp', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }, { id: 'migrated-pdl1-result-' + Math.random().toString(36).slice(2,8), flagDefinitionId: 'pdl1-result', appliedAt: isoDaysAgo(2), appliedBy: 'lis-import', source: 'system', deletedAt: null, deletedBy: null }] },
      { id: 'S26-4483-SP-2', label: 'B', description: 'Sentinel lymph node — left axilla #1', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
      { id: 'S26-4483-SP-3', label: 'C', description: 'Sentinel lymph node — left axilla #2', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(3), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Michelle Foster',
      facilityId: 'c_outreach_derm', facilityName: 'Oasis Dermatology Partners',
      clinicalIndication: 'Melanoma left upper back. Excision biopsy: invasive melanoma, Breslow 1.8 mm, Clark level IV, ulceration present. Awaiting wide local excision + sentinel lymph node biopsy. Dermatoscopy: asymmetric lesion 1.4 cm. SLNB with Tc-99m lymphoscintigraphy.',
      receivedDate: isoDaysAgo(3), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Specimen A: An oriented ellipse of skin measuring 7.0 × 3.5 cm with a central stellate scar 1.6 × 0.8 cm at the biopsy site. The specimen is inked and serially sectioned perpendicular to the long axis. No residual pigmented finding is identified macroscopically. Specimens B and C: Two intact regional nodes measuring 1.4 cm and 1.1 cm respectively.',
      microscopicDescription: 'Specimen A: Biopsy site change. No residual finding identified. All margins (peripheral and deep) are negative; the deep margin at the biopsy site is 4 mm. Specimen B: Involvement present in the subcapsular sinus and parenchyma of 1 of 1 regional node; largest deposit 3.1 mm. No extranodal extension. Specimen C: No finding in 1 regional node examined.',
      ancillaryStudies: 'Marker A: Positive. Marker B: Positive. Marker C: Positive. Marker D: Positive. Proliferation index: 28% in primary. Marker E (original excision): Detected. Expression score: 15.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4483-SP-1_melanoma_001',
        specimenId: 'S26-4483-SP-1',
        templateId: 'melanoma_resection',
        templateName: 'Generic Template — Melanoma Resection',
        status: 'in-progress',
        answers: {
          procedure: 'procedure_opt_1',
          specimen_site: 'specimen_site_opt_1',
          specimen_laterality: 'specimen_laterality_opt_2',
          residual_finding: 'residual_finding_opt_1',
          margin_status_peripheral: 'margin_status_peripheral_opt_1',
          margin_status_deep: 'margin_status_deep_opt_1',
          distance_to_deep_margin: '4 mm',
          regional_ln_status: 'regional_ln_status_opt_4',
          sln_with_tumor: '1',
          sln_examined: '2',
          largest_sln_deposit: '3.1 mm',
          extranodal_extension: 'extranodal_extension_opt_1',
          braf_v600e: 'Detected',
          marker_expression_score: '15',
        },
        aiSuggestions: {
          procedure:                { value: 'procedure_opt_1',            confidence: 97, source: 'Gross description', verification: 'verified' },
          specimen_site:            { value: 'specimen_site_opt_1',        confidence: 96, source: 'Specimen label and gross description', verification: 'verified' },
          specimen_laterality:      { value: 'specimen_laterality_opt_2',  confidence: 99, source: 'Specimen label', verification: 'verified' },
          residual_finding:         { value: 'residual_finding_opt_1',     confidence: 93, source: 'Microscopic description', verification: 'verified' },
          margin_status_peripheral: { value: 'margin_status_peripheral_opt_1', confidence: 95, source: 'Microscopic description', verification: 'verified' },
          margin_status_deep:       { value: 'margin_status_deep_opt_1',   confidence: 94, source: 'Microscopic description', verification: 'verified' },
          distance_to_deep_margin:  { value: '4 mm',                      confidence: 88, source: 'Microscopic description', verification: 'verified' },
          regional_ln_status:       { value: 'regional_ln_status_opt_4',   confidence: 96, source: 'Specimen B description', verification: 'verified' },
          sln_with_tumor:           { value: '1',                         confidence: 95, source: 'Specimen B description', verification: 'verified' },
          sln_examined:             { value: '2',                         confidence: 94, source: 'Specimens B + C description', verification: 'verified' },
          largest_sln_deposit:      { value: '3.1 mm',                    confidence: 92, source: 'Specimen B description', verification: 'verified' },
          extranodal_extension:     { value: 'extranodal_extension_opt_1', confidence: 90, source: 'Specimen B description', verification: 'verified' },
          braf_v600e:               { value: 'Detected',                  confidence: 98, source: 'Ancillary studies', verification: 'verified' },
          marker_expression_score:  { value: '15',                        confidence: 96, source: 'Ancillary studies', verification: 'verified' },
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { id: 'melanoma-mdt', tagClass: 'ADMINISTRATIVE', name: 'Melanoma MDT', lisCode: 'MEL',  color: '#3b82f6', severity: 3, level: 'Case', status: 'Active' },
      { id: 'braf-positive',tagClass: 'ADMINISTRATIVE', name: 'BRAF V600E Positive', lisCode: 'BRAF', color: '#10b981', severity: 2, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [    ],
    reportingMode: 'assist',
    coding: { icd10: ['C43.59'], snomed: ['372244006'] },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ROSSANA BABAKHANI (PATH-RB-001) — UX/UIUX Workflow Demo Cases
  // Three cases showing the AI protocol re-evaluation + pre-finalisation flow.
  //   DEMO-RB-01: Gross submitted, AI assigned synoptic, awaiting microscopic
  //   DEMO-RB-02: Microscopic received, AI proposes protocol upgrade → use DEV button
  //   DEMO-RB-03: All sections complete, ready to open PreFinalisationModal
  // ─────────────────────────────────────────────────────────────────────────

  // ── DEMO-RB-01: Breast core biopsy — gross done, awaiting microscopic ────
  {
    id: 'DEMO-RB-01',
    accession: { accessionNumber: 'DEMO-01', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-DEMO-01' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-DEMO-RB-01', mrn: 'DEMO100001',
      firstName: 'Eleanor', lastName: 'Bishop',
      dateOfBirth: isoYearsAgo(52, 3, 14), sex: 'F',
      phone: '555-800-0001', email: 'eleanor.bishop@example.org',
      address: '88 Camelback Rd, Phoenix, AZ 85013',
    },
    specimens: [
      { id: 'DEMO-01-SP-1', label: 'A', description: 'Right breast core biopsy — 12 o\'clock, 2 cm FN', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Pamela Winters',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Screening mammogram abnormality, right breast 12 o\'clock, BIRADS 4B. Ultrasound: 8 mm irregular hypoechoic mass with microlobulated margins. Clinical concern for atypia vs. low-grade malignancy. Core biopsy performed under ultrasound guidance, 3 cores submitted.',
      receivedDate: isoDaysAgo(1), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Received in formalin labelled "right breast core biopsy A" are three tan-white cores of tissue, each measuring approximately 1.5 cm × 0.1 cm × 0.1 cm. All cores are submitted in one cassette. The tissue has a firm consistency without haemorrhage or necrosis.',
      microscopicDescription: '',
    },
    synopticReports: [
      {
        instanceId: 'DEMO-01-SYN-01',
        specimenId: 'DEMO-01-SP-1',
        templateId: 'breast_core_benign',
        templateName: 'Breast Core Biopsy (Benign/NOS)',
        status: 'draft',
        answers: {},
        aiSuggestions: {
          procedure:       { value: 'core_needle_biopsy', confidence: 98, source: 'Gross: "core biopsy performed under ultrasound guidance"', verification: 'unverified' },
          specimen_site:   { value: 'breast',             confidence: 99, source: 'Specimen label: "right breast core biopsy"', verification: 'unverified' },
          laterality:      { value: 'right',              confidence: 99, source: 'Specimen label: "right breast"', verification: 'unverified' },
          clock_position:  { value: '12',                 confidence: 94, source: 'Clinical: "12 o\'clock"', verification: 'unverified' },
          distance_nipple: { value: '2 cm',               confidence: 87, source: 'Clinical: "2 cm FN"', verification: 'unverified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: {},
  },

  // ── DEMO-RB-02: Breast core biopsy — micro received, protocol upgrade needed ─
  // UIUX: Open this case and click "DEV: Simulate Microscopic Received" to trigger
  //       the ProtocolChangeModal showing the proposed upgrade from NOS → CAP IDC.
  {
    id: 'DEMO-RB-02',
    accession: { accessionNumber: 'DEMO-02', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-DEMO-02' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-DEMO-RB-02', mrn: 'DEMO100002',
      firstName: 'Celia', lastName: 'Moreau',
      dateOfBirth: isoYearsAgo(48, 11, 7), sex: 'F',
      phone: '555-800-0002', email: 'celia.moreau@example.org',
      address: '14 Biltmore Ave, Phoenix, AZ 85016',
    },
    specimens: [
      { id: 'DEMO-02-SP-1', label: 'A', description: 'Left breast core biopsy — 9 o\'clock, 3 cm FN', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Sandra Okafor',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Screening mammogram: left breast 9 o\'clock, BIRADS 4C. Ultrasound: 11 mm irregular mass with posterior acoustic shadowing and internal vascularity. High suspicion for malignancy. Stereotactic core biopsy, 4 cores.',
      receivedDate: isoDaysAgo(2), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Received in formalin labelled "left breast core biopsy A" are four tan-white cores, each approximately 1.5–1.6 cm × 0.1 cm. Two cores show a firm nodular area measuring approximately 0.4 cm. All cores submitted.',
      microscopicDescription: 'Sections show invasive ductal carcinoma of no special type (NST), Nottingham grade 2 (tubule formation 3, nuclear pleomorphism 2, mitotic count 1; total 6/9). Tumour cells form infiltrating glands and solid nests within a desmoplastic stroma. Nuclear grade is intermediate. No lymphovascular invasion is identified in the biopsy cores. Background breast parenchyma shows fibrocystic change. ER: Positive (Allred 7/8). PR: Positive (Allred 5/8). HER2: 1+ (negative). Ki-67: 14%.',
    },
    synopticReports: [
      {
        instanceId: 'DEMO-02-SYN-01',
        specimenId: 'DEMO-02-SP-1',
        templateId: 'breast_core_benign',
        templateName: 'Breast Core Biopsy (Benign/NOS)',
        status: 'draft',
        answers: {
          procedure:       'core_needle_biopsy',
          specimen_site:   'breast',
          laterality:      'left',
          clock_position:  '9',
          distance_nipple: '3 cm',
        },
        aiSuggestions: {
          procedure:       { value: 'core_needle_biopsy',   confidence: 98, source: 'Gross description', verification: 'verified' },
          specimen_site:   { value: 'breast',               confidence: 99, source: 'Specimen label', verification: 'verified' },
          laterality:      { value: 'left',                 confidence: 99, source: 'Specimen label', verification: 'verified' },
          clock_position:  { value: '9',                    confidence: 96, source: 'Clinical indication', verification: 'verified' },
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [
      { id: 'demo-birads-4c', tagClass: 'ADMINISTRATIVE', name: 'BIRADS 4C', lisCode: 'BI4C', color: '#f59e0b', severity: 3, level: 'Case', status: 'Active' },
    ],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: {},
  },

  // ── DEMO-RB-03: Colon polyp — all sections complete, ready to finalise ───
  // UIUX: Click "Finalise" to open the PreFinalisationModal two-pane review.
  {
    id: 'DEMO-RB-03',
    accession: { accessionNumber: 'DEMO-03', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-DEMO-03' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-DEMO-RB-03', mrn: 'DEMO100003',
      firstName: 'Martin', lastName: 'Hale',
      dateOfBirth: isoYearsAgo(67, 5, 22), sex: 'M',
      phone: '555-800-0003', email: 'martin.hale@example.org',
      address: '320 Central Ave, Phoenix, AZ 85004',
    },
    specimens: [
      { id: 'DEMO-03-SP-1', label: 'A', description: 'Sigmoid colon polyp — pedunculated, 18 mm', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'DEMO-03-SP-2', label: 'B', description: 'Ascending colon polyp — sessile, 6 mm', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. James Fowler',
      facilityId: 'c1', facilityName: 'Metro General Hospital',
      clinicalIndication: 'Screening colonoscopy. Specimen A: 18 mm pedunculated polyp, sigmoid colon — hot snare polypectomy, retrieved intact. Specimen B: 6 mm sessile polyp, ascending colon — cold snare, retrieved. Background: family history CRC (father), previous adenoma 2021.',
      receivedDate: isoDaysAgo(1), assignedTo: 'PATH-RB-001', assignedParticipationTypeId: 'primary',
    },
    diagnostic: {
      grossDescription: 'Specimen A: A polypoid fragment of colonic mucosa with attached stalk measuring 1.8 × 1.2 × 1.0 cm. The polyp head is tan-brown and lobulated with a stalk 0.4 cm in length. Entirely submitted, 4 levels. Specimen B: A single flat fragment of tan-pink mucosa measuring 0.6 × 0.5 × 0.2 cm. Entirely submitted.',
      microscopicDescription: 'Specimen A: Tubulo-villous adenoma with low-grade dysplasia. The polyp shows tubular (65%) and villous (35%) architecture. Low-grade dysplastic epithelium lines all glandular structures. The stalk is free of neoplasia; margin is negative. No high-grade dysplasia or carcinoma is identified. Specimen B: Tubular adenoma with low-grade dysplasia, measuring 0.6 cm. No high-grade dysplasia.',
    },
    synopticReports: [
      {
        instanceId: 'DEMO-03-SYN-01',
        specimenId: 'DEMO-03-SP-1',
        templateId: 'colon_polyp',
        templateName: 'Colorectal Polyp (CAP)',
        status: 'draft',
        answers: {
          procedure:          'polypectomy',
          specimen_site:      'colon',
          anatomic_site:      'sigmoid_colon',
          polyp_size:         '18 mm',
          polyp_type:         'pedunculated',
          histologic_type:    'tubulo_villous_adenoma',
          dysplasia_grade:    'low_grade',
          villous_component:  '35%',
          margin_status:      'margins_negative',
          high_grade_dysplasia: 'not_identified',
          carcinoma:          'not_identified',
        },
        aiSuggestions: {
          procedure:          { value: 'polypectomy',            confidence: 99, source: 'Clinical: "hot snare polypectomy"', verification: 'verified' },
          anatomic_site:      { value: 'sigmoid_colon',          confidence: 98, source: 'Clinical: "sigmoid colon"', verification: 'verified' },
          polyp_size:         { value: '18 mm',                  confidence: 95, source: 'Gross: "1.8 × 1.2 × 1.0 cm"', verification: 'verified' },
          polyp_type:         { value: 'pedunculated',           confidence: 97, source: 'Clinical: "pedunculated polyp"', verification: 'verified' },
          histologic_type:    { value: 'tubulo_villous_adenoma', confidence: 94, source: 'Micro: "Tubulo-villous adenoma"', verification: 'verified' },
          dysplasia_grade:    { value: 'low_grade',              confidence: 96, source: 'Micro: "low-grade dysplasia"', verification: 'verified' },
          villous_component:  { value: '35%',                    confidence: 89, source: 'Micro: "villous (35%)"', verification: 'verified' },
          margin_status:      { value: 'margins_negative',       confidence: 93, source: 'Micro: "stalk is free of neoplasia; margin is negative"', verification: 'verified' },
          high_grade_dysplasia:{ value: 'not_identified',        confidence: 97, source: 'Micro: "No high-grade dysplasia"', verification: 'verified' },
          carcinoma:          { value: 'not_identified',         confidence: 98, source: 'Micro: "No … carcinoma"', verification: 'verified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        instanceId: 'DEMO-03-SYN-02',
        specimenId: 'DEMO-03-SP-2',
        templateId: 'colon_polyp',
        templateName: 'Colorectal Polyp (CAP)',
        status: 'draft',
        answers: {
          procedure:            'polypectomy',
          specimen_site:        'colon',
          anatomic_site:        'ascending_colon',
          polyp_size:           '6 mm',
          polyp_type:           'sessile',
          histologic_type:      'tubular_adenoma',
          dysplasia_grade:      'low_grade',
          high_grade_dysplasia: 'not_identified',
          carcinoma:            'not_identified',
        },
        aiSuggestions: {
          anatomic_site:        { value: 'ascending_colon',  confidence: 97, source: 'Clinical: "ascending colon"', verification: 'verified' },
          polyp_size:           { value: '6 mm',             confidence: 96, source: 'Gross: "0.6 × 0.5 cm"', verification: 'verified' },
          polyp_type:           { value: 'sessile',          confidence: 96, source: 'Clinical: "sessile polyp"', verification: 'verified' },
          histologic_type:      { value: 'tubular_adenoma',  confidence: 95, source: 'Micro: "Tubular adenoma"', verification: 'verified' },
          dysplasia_grade:      { value: 'low_grade',        confidence: 97, source: 'Micro: "low-grade dysplasia"', verification: 'verified' },
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['K63.5'], snomed: ['68526002'] },
  },


  // ── Completed demo cases (CoPilot) ─────────────────────────────────────────
  // Added per Pete's request alongside the 3 Orchestration completed demo
  // cases in mockOrchestratorCaseService.ts — a known set of finalized
  // CoPilot cases restored on every data reset. CoPilot mode has no
  // grossingReports (LIS owns the report; PathScribe only needs the
  // structured synoptic diagnostic data), so Gross/Microscopic narrative
  // lives in diagnostic.grossDescription/microscopicDescription as plain
  // text, same as every other CoPilot case in this file.
  {
    id: 'S26-4490',
    accession: { accessionNumber: '4490', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4490' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-090', mrn: '100090',
      firstName: 'Deborah', lastName: 'Whitfield',
      dateOfBirth: isoYearsAgo(61, 4, 8), sex: 'F',
      phone: '555-441-2290', email: 'deborah.whitfield@example.org',
      address: '14 Ocotillo Ln, Tucson, AZ 85718',
    },
    specimens: [
      { id: 'S26-4490-SP-1', label: 'A', description: 'Right total mastectomy', receivedAt: isoDaysAgo(8), collectedAt: isoDaysAgo(8), specimenFlags: [] },
      { id: 'S26-4490-SP-2', label: 'B', description: 'Right axillary sentinel lymph nodes — two', receivedAt: isoDaysAgo(8), collectedAt: isoDaysAgo(8), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Nina Foster', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: '3.4 cm right breast mass, BI-RADS 5. Core biopsy confirmed invasive ductal carcinoma, HER2 amplified on prior testing. Proceeding to mastectomy with sentinel node biopsy.', receivedDate: isoDaysAgo(8), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh, labeled "right total mastectomy," is a breast specimen measuring 21.0 x 17.0 x 5.5 cm with attached skin ellipse and nipple. Sectioning reveals a firm, tan-white mass measuring 3.4 x 2.9 x 2.4 cm at the 2 o\'clock position, 1.1 cm from the deep margin. Representative sections submitted.\n\nReceived separately, labeled "right axillary sentinel lymph nodes," are two lymph nodes, entirely submitted.',
      microscopicDescription: 'Sections of the mass show invasive ductal carcinoma, Grade 3, with associated high-grade DCIS. Margins are free of invasive and in situ carcinoma. Both sentinel lymph nodes are negative for metastatic carcinoma.',
      ancillaryStudies: 'ER, PR, and HER2 immunohistochemistry performed — see synoptic Biomarkers section.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4490-SP-1_breast_001',
        specimenId: 'S26-4490-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'finalized',
        answers: {
          procedure: 'procedure_opt_1', specimen_laterality: 'specimen_laterality_opt_2', tumor_site: ['tumor_site_opt_1'],
          histologic_type: 'histologic_type_opt_1', histologic_grade: 'Grade 3', tumor_size: '3.4 cm', tumor_focality: 'tumor_focality_opt_1',
          dcis: 'Present, high nuclear grade, comprising approximately 20% of tumor volume', tumor_extent: 'Confined to breast parenchyma, no chest wall or skin involvement',
          lvi: 'lvi_opt_2', dermal_lvi: 'dermal_lvi_opt_1', microcalcifications: ['microcalcifications_opt_1'],
          treatment_effect_breast: 'treatment_effect_breast_opt_1', treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
          rcb_parameters: 'Not applicable — no neoadjuvant therapy administered',
          margin_status_invasive: 'margin_status_invasive_opt_1', closest_margins_invasive: ['closest_margins_invasive_opt_1'],
          margins_involved_invasive: ['margins_involved_invasive_opt_1'], distance_invasive_to_named_margins: '1.1 cm to deep margin',
          margin_status_dcis: 'margin_status_dcis_opt_1', closest_margins_dcis: ['closest_margins_dcis_opt_1'], margins_involved_dcis: ['margins_involved_dcis_opt_1'],
          distance_dcis_to_named_margins: '1.3 cm to deep margin', margin_comment: 'All margins free of invasive and in situ carcinoma.',
          regional_ln_status: 'regional_ln_status_opt_1', number_ln_macrometastases: '0', number_ln_micrometastases: '0', number_ln_itc: '0',
          largest_nodal_met_mm: '0', extranodal_extension: 'extranodal_extension_opt_1', total_ln_examined: '2', sentinel_ln_examined: '2',
          regional_ln_comment: 'Two sentinel nodes identified and examined, both negative for metastatic carcinoma.',
          distant_metastasis: ['distant_metastasis_opt_1'], ptnm_classification: 'pT2 N0 (sn) — per AJCC 8th edition',
          er_status: 'er_status_positive', er_percent_positive: '60%', er_intensity: 'er_intensity_2',
          pr_status: 'pr_status_positive', pr_percent_positive: '30%', pr_intensity: 'pr_intensity_1',
          her2_ihc_score: 'her2_ihc_3p', her2_ish_status: 'her2_ish_amplified', ki67_index: '35%',
        },
        createdAt: isoDaysAgo(7), updatedAt: isoDaysAgo(5),
      },
    ],
    status: 'finalized' as CaseStatus,
    createdAt: isoDaysAgo(8), updatedAt: isoDaysAgo(5),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C50.911'], snomed: ['254837009'] },
  },

  {
    id: 'S26-4491',
    accession: { accessionNumber: '4491', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4491' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-091', mrn: '100091',
      firstName: 'Thomas', lastName: 'Reilly',
      dateOfBirth: isoYearsAgo(72, 11, 19), sex: 'M',
      phone: '555-441-3391', email: 'thomas.reilly@example.org',
      address: '870 Saguaro Blvd, Tucson, AZ 85704',
    },
    specimens: [
      { id: 'S26-4491-SP-1', label: 'A', description: 'Left lower lobe wedge resection', receivedAt: isoDaysAgo(6), collectedAt: isoDaysAgo(6), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Karen Osei', facilityId: 'c2', facilityName: 'Riverside Medical Center', clinicalIndication: '2.2 cm left lower lobe nodule, PET-avid. Never-smoker. Proceeding to wedge resection with intraoperative frozen section.', receivedDate: isoDaysAgo(6), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh, labeled "left lower lobe wedge resection," is a wedge of lung parenchyma measuring 6.0 x 4.5 x 2.0 cm with a stapled margin along one edge. Sectioning reveals a firm, tan-white mass measuring 2.2 x 1.9 x 1.6 cm, 1.0 cm from the staple line. Representative sections submitted.',
      microscopicDescription: 'Sections show invasive adenocarcinoma, acinar-predominant pattern, without visceral pleural invasion. Margins are free of tumor.',
      ancillaryStudies: 'EGFR, ALK, ROS1, and PD-L1 testing performed — see synoptic Biomarkers section.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4491-SP-1_lung_001',
        specimenId: 'S26-4491-SP-1',
        templateId: 'lung_adeno',
        templateName: 'Generic Template — Lung Adeno',
        status: 'finalized',
        answers: {
          synchronous_tumors: 'synchronous_tumors_opt_1', procedure: ['procedure_opt_4'], specimen_laterality: 'specimen_laterality_opt_1',
          tumor_focality: 'tumor_focality_opt_1', tumor_site: ['tumor_site_opt_2'], tumor_size: '2.2 cm', invasive_component_size: '2.2 cm',
          histologic_type: 'histologic_type_opt_3', histologic_grade: 'histologic_grade_opt_2', stas: 'stas_opt_2',
          visceral_pleura_invasion: 'visceral_pleura_invasion_opt_1', adjacent_structure_invasion: 'None identified',
          treatment_effect: 'Not applicable — no prior neoadjuvant therapy', lymphovascular_invasion: ['lymphovascular_invasion_opt_1'],
          tumor_comment: 'Tumor confined to lung parenchyma without pleural involvement.',
          margin_status_invasive: 'Negative, closest margin 1.0 cm', margin_status_noninvasive: ['margin_status_noninvasive_opt_1'],
          margin_comment: 'Staple margin free of tumor.',
          prior_ln_sampling: 'prior_ln_sampling_opt_2', regional_ln_status: 'regional_ln_status_opt_1', ln_with_tumor_count: '0',
          nodal_sites_with_tumor: 'None', extranodal_extension: 'extranodal_extension_opt_1', ln_examined_count: '0',
          nodal_sites_examined: 'Not sampled — wedge resection only', regional_ln_comment: 'No lymph nodes submitted with this specimen.',
          distant_metastasis_sites: ['distant_metastasis_sites_opt_1'], tnm_descriptors: ['tnm_descriptors_opt_1'],
          stage_category_a: 'stage_category_a_opt_2', stage_category_b: 'stage_category_b_opt_1', stage_category_c: 'stage_category_c_opt_1',
          additional_findings: ['additional_findings_opt_1'], special_studies_note: 'Molecular profiling performed per institutional reflex-testing protocol; see Biomarkers section.',
          comments: 'Findings consistent with primary pulmonary adenocarcinoma, stage pT1cNx.',
          pdl1_tps: 'pdl1_tps_ge50', egfr_status: 'egfr_detected', egfr_variant: 'Exon 19 deletion', alk_status: 'alk_non_rearranged', ros1_status: 'ros1_not_tested',
        },
        createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(3),
      },
    ],
    status: 'finalized' as CaseStatus,
    createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(3),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C34.32'], snomed: ['254637007'] },
  },

  {
    id: 'S26-4492',
    accession: { accessionNumber: '4492', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4492' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-092', mrn: '100092',
      firstName: 'Carol', lastName: 'Simmons',
      dateOfBirth: isoYearsAgo(66, 1, 30), sex: 'F',
      phone: '555-441-4492', email: 'carol.simmons@example.org',
      address: '502 Palo Verde Dr, Tucson, AZ 85712',
    },
    specimens: [
      { id: 'S26-4492-SP-1', label: 'A', description: 'Left breast lumpectomy', receivedAt: isoDaysAgo(4), collectedAt: isoDaysAgo(4), specimenFlags: [] },
      { id: 'S26-4492-SP-2', label: 'B', description: 'Left axillary sentinel lymph node — one', receivedAt: isoDaysAgo(4), collectedAt: isoDaysAgo(4), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Michael Trent', facilityId: 'c3', facilityName: 'Foothills Regional Clinic', clinicalIndication: '1.3 cm left breast mass, BI-RADS 4. Core biopsy confirmed invasive ductal carcinoma. Proceeding to lumpectomy with sentinel node biopsy.', receivedDate: isoDaysAgo(4), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh, labeled "left breast lumpectomy," is an irregular fragment of fibrofatty breast tissue measuring 5.5 x 4.0 x 2.5 cm. Sectioning reveals a firm, gray-white mass measuring 1.3 x 1.1 x 1.0 cm, 0.6 cm from the closest (lateral) inked margin. Representative sections submitted.\n\nReceived separately, labeled "left axillary sentinel lymph node," is one lymph node, entirely submitted.',
      microscopicDescription: 'Sections of the mass show invasive ductal carcinoma, Grade 2, without associated DCIS. Margins are free of invasive carcinoma. The sentinel lymph node is negative for metastatic carcinoma.',
      ancillaryStudies: 'ER, PR, and HER2 immunohistochemistry performed — see synoptic Biomarkers section.',
    },
    synopticReports: [
      {
        instanceId: 'S26-4492-SP-1_breast_001',
        specimenId: 'S26-4492-SP-1',
        templateId: 'breast_invasive',
        templateName: 'Generic Template — Breast Invasive',
        status: 'finalized',
        answers: {
          procedure: 'procedure_opt_2', specimen_laterality: 'specimen_laterality_opt_1', tumor_site: ['tumor_site_opt_4'],
          histologic_type: 'histologic_type_opt_1', histologic_grade: 'Grade 2', tumor_size: '1.3 cm', tumor_focality: 'tumor_focality_opt_1',
          dcis: 'Not identified', tumor_extent: 'Confined to breast parenchyma, no chest wall or skin involvement',
          lvi: 'lvi_opt_2', dermal_lvi: 'dermal_lvi_opt_1', microcalcifications: ['microcalcifications_opt_2'],
          treatment_effect_breast: 'treatment_effect_breast_opt_1', treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
          rcb_parameters: 'Not applicable — no neoadjuvant therapy administered',
          margin_status_invasive: 'margin_status_invasive_opt_1', closest_margins_invasive: ['closest_margins_invasive_opt_3'],
          margins_involved_invasive: ['margins_involved_invasive_opt_1'], distance_invasive_to_named_margins: '0.6 cm to lateral margin',
          margin_status_dcis: 'margin_status_dcis_opt_1', closest_margins_dcis: ['closest_margins_dcis_opt_1'], margins_involved_dcis: ['margins_involved_dcis_opt_1'],
          distance_dcis_to_named_margins: 'Not applicable — no DCIS identified', margin_comment: 'All margins free of invasive carcinoma.',
          regional_ln_status: 'regional_ln_status_opt_1', number_ln_macrometastases: '0', number_ln_micrometastases: '0', number_ln_itc: '0',
          largest_nodal_met_mm: '0', extranodal_extension: 'extranodal_extension_opt_1', total_ln_examined: '1', sentinel_ln_examined: '1',
          regional_ln_comment: 'One sentinel node identified and examined, negative for metastatic carcinoma.',
          distant_metastasis: ['distant_metastasis_opt_1'], ptnm_classification: 'pT1c N0 (sn) — per AJCC 8th edition',
          er_status: 'er_status_positive', er_percent_positive: '70%', er_intensity: 'er_intensity_3',
          pr_status: 'pr_status_negative', pr_percent_positive: '0%', pr_intensity: 'pr_intensity_1',
          her2_ihc_score: 'her2_ihc_1p', her2_ish_status: 'her2_ish_nonamplified', ki67_index: '18%',
        },
        createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
      },
    ],
    status: 'finalized' as CaseStatus,
    createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(1),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C50.912'], snomed: ['254837009'] },
  },

  // ── Status-coverage case ─────────────────────────────────────────────────
  // The CoPilot counterpart to O26-0028 in mockOrchestratorCaseService.ts —
  // confirms 'pathologist-review' (real, wired display logic, previously
  // never seeded) isn't Orchestration-only. See that file's header comment
  // for why the other unused CaseStatus values weren't seeded.
  {
    id: 'S26-4493',
    accession: { accessionNumber: '4493', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-4493' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: {
      id: 'PAT-093', mrn: '100093',
      firstName: 'Angela', lastName: 'Weiss',
      dateOfBirth: isoYearsAgo(59, 8, 21), sex: 'F',
      phone: '555-441-4493', email: 'angela.weiss@example.org',
      address: '318 Camino Real, Tucson, AZ 85718',
    },
    specimens: [
      { id: 'S26-4493-SP-1', label: 'A', description: 'Right lung, upper lobe wedge resection', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Samuel Ortega', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: '1.8 cm right upper lobe nodule, PET-avid. Proceeding to wedge resection.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    diagnostic: {
      grossDescription: 'Received fresh, labeled "right lung, upper lobe wedge resection," is a wedge of lung parenchyma measuring 5.5 x 4.0 x 1.8 cm with a stapled margin. Sectioning reveals a firm, tan-white mass measuring 1.8 x 1.6 x 1.3 cm, 1.4 cm from the staple line. Representative sections submitted.',
      microscopicDescription: 'Sections show invasive adenocarcinoma, acinar-predominant pattern, without visceral pleural invasion. Margins are free of tumor.',
      ancillaryStudies: 'EGFR, ALK, ROS1, and PD-L1 testing performed — see synoptic Biomarkers section.',
    },
    synopticReports: [
      {
        // Content complete, but instance stays 'draft' — this case sits at
        // 'pathologist-review' (ready for sign-out) rather than
        // 'finalized', the CoPilot counterpart to O26-0028.
        instanceId: 'S26-4493-SP-1_lung_001',
        specimenId: 'S26-4493-SP-1',
        templateId: 'lung_adeno',
        templateName: 'Generic Template — Lung Adeno',
        status: 'draft',
        answers: {
          synchronous_tumors: 'synchronous_tumors_opt_1', procedure: ['procedure_opt_4'], specimen_laterality: 'specimen_laterality_opt_2',
          tumor_focality: 'tumor_focality_opt_1', tumor_site: ['tumor_site_opt_1'], tumor_size: '1.8 cm', invasive_component_size: '1.8 cm',
          histologic_type: 'histologic_type_opt_3', histologic_grade: 'histologic_grade_opt_2', stas: 'stas_opt_2',
          visceral_pleura_invasion: 'visceral_pleura_invasion_opt_1', adjacent_structure_invasion: 'None identified',
          treatment_effect: 'Not applicable — no prior neoadjuvant therapy', lymphovascular_invasion: ['lymphovascular_invasion_opt_1'],
          tumor_comment: 'Tumor confined to lung parenchyma without pleural involvement.',
          margin_status_invasive: 'Negative, closest margin 1.4 cm', margin_status_noninvasive: ['margin_status_noninvasive_opt_1'],
          margin_comment: 'Staple margin free of tumor.',
          prior_ln_sampling: 'prior_ln_sampling_opt_2', regional_ln_status: 'regional_ln_status_opt_1', ln_with_tumor_count: '0',
          nodal_sites_with_tumor: 'None', extranodal_extension: 'extranodal_extension_opt_1', ln_examined_count: '0',
          nodal_sites_examined: 'Not sampled — wedge resection only', regional_ln_comment: 'No lymph nodes submitted with this specimen.',
          distant_metastasis_sites: ['distant_metastasis_sites_opt_1'], tnm_descriptors: ['tnm_descriptors_opt_1'],
          stage_category_a: 'stage_category_a_opt_2', stage_category_b: 'stage_category_b_opt_1', stage_category_c: 'stage_category_c_opt_1',
          additional_findings: ['additional_findings_opt_1'], special_studies_note: 'Molecular profiling performed per institutional reflex-testing protocol; see Biomarkers section.',
          comments: 'Findings consistent with primary pulmonary adenocarcinoma, stage pT1bNx.',
          pdl1_tps: 'pdl1_tps_lt1', egfr_status: 'egfr_not_detected', egfr_variant: 'Not applicable', alk_status: 'alk_non_rearranged', ros1_status: 'ros1_not_tested',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    status: 'pathologist-review' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(0),
    caseFlags: [],
    specimenFlags: [],
    reportingMode: 'assist',
    coding: { icd10: ['C34.12'], snomed: ['254637007'] },
  },

  // ── Cytology & Cervical Screening seed cases (Sep 2026) ───────────────────
  // Real, per direct guidance: "We need several cases for seed data."
  // Six real, representative cases exercising the real Cytology
  // worklist (PS-160) and screening UI (PS-161): assigned/unreviewed,
  // assigned/already-screened, pool (x2), non-GYN FNA (a real test of
  // PS-158's own routing setting — invisible on the Cytology worklist
  // under the real, default 'surgical_pathology_worklist' setting,
  // exactly as designed; toggle the Enterprise setting to
  // 'cytology_worklist' to see it appear), and a complete case with a
  // real Final Diagnosis already selected. Assigned to PATH-001 (the
  // real, established demo login) rather than a new, separate
  // Cytotechnologist account nobody would actually log in as to see
  // them — this is seed data for exercising the UI, not a claim about
  // who should hold this role in a real deployment.

  {
    id: 'S26-5001-CYT-001',
    accession: { accessionNumber: '5001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5001-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-001', mrn: '100501', firstName: 'Maria', lastName: 'Gonzalez', dateOfBirth: isoYearsAgo(34, 4, 2), sex: 'F', phone: '555-401-1001', email: 'maria.gonzalez@example.org', address: '210 Palm St, Phoenix, AZ 85003' },
    specimens: [{ id: 'S26-5001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvCoTestOrdered: true, hpvResult: 'Negative', hpvAbnormalFlag: 'N', hpvReferenceRange: 'Not Detected' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Amanda Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Routine annual screening.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-5002-CYT-001',
    accession: { accessionNumber: '5002', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5002-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-002', mrn: '100502', firstName: 'Angela', lastName: 'Torres', dateOfBirth: isoYearsAgo(41, 9, 18), sex: 'F', phone: '555-401-1002', email: 'angela.torres@example.org', address: '77 Sunrise Blvd, Phoenix, AZ 85004' },
    specimens: [{ id: 'S26-5002-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(3), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvCoTestOrdered: true, hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false }, molecularRunId: 'mqc-001' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Amanda Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'History of ASC-US, prior cotest HPV-positive.', receivedDate: isoDaysAgo(3), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-5003-CYT-001',
    accession: { accessionNumber: '5003', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5003-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-003', mrn: '100503', firstName: 'Linda', lastName: 'Chen', dateOfBirth: isoYearsAgo(29, 1, 27), sex: 'F', phone: '555-401-1003', email: 'linda.chen@example.org', address: '18 Birchwood Ln, Phoenix, AZ 85006' },
    specimens: [{ id: 'S26-5003-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvCoTestOrdered: true, hpvResult: 'Pending' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Patel', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Routine annual screening.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-5004-CYT-001',
    accession: { accessionNumber: '5004', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5004-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-004', mrn: '100504', firstName: 'Sarah', lastName: 'Johnson', dateOfBirth: isoYearsAgo(46, 11, 9), sex: 'F', phone: '555-401-1004', email: 'sarah.johnson@example.org', address: '532 Desert View Dr, Phoenix, AZ 85008' },
    specimens: [{ id: 'S26-5004-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvCoTestOrdered: false, hpvResult: 'Not Performed' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Patel', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Postmenopausal bleeding.', receivedDate: isoDaysAgo(0), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-5005-CYT-001',
    accession: { accessionNumber: '5005', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5005-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-005', mrn: '100505', firstName: 'Robert', lastName: 'Kim', dateOfBirth: isoYearsAgo(57, 6, 30), sex: 'M', phone: '555-401-1005', email: 'robert.kim@example.org', address: '90 Copperfield Way, Phoenix, AZ 85009' },
    // Real, per direct guidance's own note above: a non-GYN FNA
    // specimen — deliberately here to exercise PS-158's own routing
    // setting. Invisible on this worklist under the real, default
    // 'surgical_pathology_worklist' Enterprise setting; only appears
    // once that setting (or a facility override for 'c1') is switched
    // to 'cytology_worklist'.
    specimens: [{ id: 'S26-5005-SP-1', label: 'A', description: 'Thyroid nodule, fine needle aspiration', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [], specimenDictionaryEntryId: 'sp-fna-thyroid' } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Wei Zhang', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: '1.8 cm hypoechoic left thyroid nodule, TI-RADS 4.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'assist', coding: {},
  } as any,

  {
    id: 'S26-5006-CYT-001',
    accession: { accessionNumber: '5006', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5006-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-006', mrn: '100506', firstName: 'Denise', lastName: 'Walker', dateOfBirth: isoYearsAgo(38, 3, 5), sex: 'F', phone: '555-401-1006', email: 'denise.walker@example.org', address: '61 Ironwood Ct, Phoenix, AZ 85012' },
    // Real, per direct guidance: complete example — screened, and a
    // real Final Diagnosis already selected (finalDiagnosis set to
    // the real, seeded 'cyto-review-seed-006-primary' record below,
    // via resolveCytologyFinalDiagnosisSnapshot's own real shape —
    // not hand-typed independently of it).
    specimens: [{
      id: 'S26-5006-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(5), collectedAt: isoDaysAgo(5), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvCoTestOrdered: true, hpvResult: 'Negative', hpvAbnormalFlag: 'N', hpvReferenceRange: 'Not Detected',
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-006-primary',
          primaryInterpretationId: 'cyto-gencat-nilm',
          adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
          selectedBy: 'PATH-001', selectedByName: 'Pete Nimmo', selectedAt: isoDaysAgo(4),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Amanda Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'Routine annual screening.', receivedDate: isoDaysAgo(5), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(4),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-5007-CYT-001',
    accession: { accessionNumber: '5007', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-5007-CYT-001' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'PAT-CYT-007', mrn: '100507', firstName: 'Patricia', lastName: 'Nguyen', dateOfBirth: isoYearsAgo(44, 8, 12), sex: 'F', phone: '555-401-1007', email: 'patricia.nguyen@example.org', address: '245 Saguaro Dr, Phoenix, AZ 85015' },
    // Real, per direct follow-up ("a tile for QC where the pooled QC
    // cases are accessed"): a real, working example for the new QC
    // tile — screened NILM by the CT, but flagged for mandatory
    // high-risk QC per direct guidance's own algorithm (PS-164), so
    // CT-independent sign-out is correctly blocked even though the
    // interpretation itself is negative (resolveCytologySignOutGate's
    // own real "flagged_for_qc" check, PS-163).
    specimens: [{
      id: 'S26-5007-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvCoTestOrdered: true, hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected',
        hpvGenotypeDetail: { hpv16: false, hpv18Or45: false, otherHighRisk: true },
        qcFlag: { reason: 'targeted_high_risk', flaggedBy: 'PATH-001', flaggedByName: 'Pete Nimmo', flaggedAt: isoDaysAgo(1) },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Amanda Chen', facilityId: 'c1', facilityName: 'Metro General Hospital', clinicalIndication: 'HIV-positive, on long-term immunosuppressive therapy.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real UK primary_hpv_reflex seed cases (Sep 2026) ───────────────────────
  // Real, per direct guidance's own follow-up: "create some seed data
  // that represent various HPV testing results and also some in
  // ordered states." Fenwick Women's Hospital (c-fenwick-womens) is a
  // real, already-seeded UK facility, now configured
  // primary_hpv_reflex + bscc_rcpath (see mockFacilityCytologyScreeningStrategyOverrideService.ts/
  // mockFacilityCytologyNomenclatureOverrideService.ts's own real seed
  // data). Three real cases, covering every real triage state
  // resolveCytologyTriageState.ts defines: awaiting a result (the real
  // "ordered state"), a real Negative closing the case with no reflex,
  // and a real Positive genuinely triggering reflex cytology.

  {
    id: 'S26-6001-CYT-001',
    accession: { accessionNumber: '6001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-6001-CYT-001' },
    originHospitalId: 'c-fenwick-womens', originEnterpriseId: 'c-trust-fenwick',
    patient: { id: 'PAT-CYT-008', mrn: '200601', firstName: 'Fiona', lastName: 'Hartley', dateOfBirth: isoYearsAgo(33, 2, 14), sex: 'F', phone: '+44 191 555 0201', email: 'fiona.hartley@example.co.uk', address: '14 Cherrywood Close, Fenwick' },
    // Real "ordered state": specimen received, sent for primary hrHPV
    // testing — no result yet, so no cytology slide should exist. Not
    // yet eligible for any real cytology worklist tile.
    specimens: [{ id: 'S26-6001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: {} } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Shah', facilityId: 'c-fenwick-womens', facilityName: "Fenwick Women's Hospital", clinicalIndication: 'Routine NHS Cervical Screening Programme recall.', receivedDate: isoDaysAgo(1), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-6002-CYT-001',
    accession: { accessionNumber: '6002', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-6002-CYT-001' },
    originHospitalId: 'c-fenwick-womens', originEnterpriseId: 'c-trust-fenwick',
    patient: { id: 'PAT-CYT-009', mrn: '200602', firstName: 'Grace', lastName: 'Whitfield', dateOfBirth: isoYearsAgo(41, 7, 22), sex: 'F', phone: '+44 191 555 0202', email: 'grace.whitfield@example.co.uk', address: '27 Birchgate Row, Fenwick' },
    // Real hpv_negative_complete: a real Negative hrHPV result closes
    // this case out with no reflex cytology ever performed — routine
    // recall, matching the real NHS primary-HPV-screening pathway.
    specimens: [{ id: 'S26-6002-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(3), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Negative', hpvAbnormalFlag: 'N', hpvReferenceRange: 'Not Detected' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Shah', facilityId: 'c-fenwick-womens', facilityName: "Fenwick Women's Hospital", clinicalIndication: 'Routine NHS Cervical Screening Programme recall.', receivedDate: isoDaysAgo(3), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(2),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-6003-CYT-001',
    accession: { accessionNumber: '6003', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-6003-CYT-001' },
    originHospitalId: 'c-fenwick-womens', originEnterpriseId: 'c-trust-fenwick',
    patient: { id: 'PAT-CYT-010', mrn: '200603', firstName: 'Heather', lastName: 'Ogilvie', dateOfBirth: isoYearsAgo(29, 11, 3), sex: 'F', phone: '+44 191 555 0203', email: 'heather.ogilvie@example.co.uk', address: '9 Fenwick Terrace, Fenwick' },
    // Real reflex_triggered: a real Positive hrHPV result with HPV16
    // detected genuinely makes this case eligible for cytology
    // screening now — appears in Fenwick Women's own real Pool/My
    // Worklist tiles, ready for a real BSCC/RCPath screen.
    specimens: [{ id: 'S26-6003-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(4), collectedAt: isoDaysAgo(4), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false }, molecularRunId: 'mqc-001' } } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Shah', facilityId: 'c-fenwick-womens', facilityName: "Fenwick Women's Hospital", clinicalIndication: 'Routine NHS Cervical Screening Programme recall — reflex cytology following positive primary hrHPV.', receivedDate: isoDaysAgo(4), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus,
    poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(3),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real South Korea seed case (Sep 2026) ──────────────────────────────────
  // Real, per direct guidance's own South Korea information: KNCSP
  // itself offers no HPV (conventional Pap only); Bethesda/co-testing
  // already apply per the given information's own confirmation. The
  // one real, distinct piece is KNCSP/KCCR centralized registry
  // reporting — this case is seeded with its Final Diagnosis already
  // selected, ready for a real Sign Out so that real registry dispatch
  // (buildCytologyRegistryReportPayload.ts, wired into handleSignOut)
  // has something real to fire against.
  {
    id: 'S26-7001-CYT-001',
    accession: { accessionNumber: '7001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-7001-CYT-001' },
    originHospitalId: 'c-kr-seoul-general', originEnterpriseId: 'c-kr-seoul-general',
    patient: { id: 'PAT-CYT-011', mrn: '300701', firstName: 'Ji-woo', lastName: 'Kim', dateOfBirth: isoYearsAgo(38, 5, 19), sex: 'F', phone: '+82 2 555 0401', email: 'jiwoo.kim@example.kr', address: '58 Gangnam-daero, Gangnam-gu, Seoul' },
    specimens: [{
      id: 'S26-7001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, conventional', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvCoTestOrdered: false,
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-kr001-primary',
          primaryInterpretationId: 'cyto-gencat-nilm',
          adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
          selectedBy: 'PATH-KR-001', selectedByName: 'Dr. Min-jun Park', selectedAt: isoDaysAgo(1),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Min-jun Park', facilityId: 'c-kr-seoul-general', facilityName: 'Seoul General Screening Center', clinicalIndication: 'National Cancer Screening Program (KNCSP) biennial cervical cytology.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real Germany seed cases (Sep 2026) ─────────────────────────────────────
  // Real, per direct guidance's own German G-BA age-stratified
  // information: Ages 20-34 get annual, real cytology_only screening
  // (no HPV at all); Ages 35+ get real co_testing every 3 years.
  // Berlin Frauenklinik Zytologie (c-de-berlin-frauenklinik) is
  // configured with the real age-stratified rule
  // (mockFacilityCytologyScreeningStrategyOverrideService.ts) and
  // real München III nomenclature. Two cases, one per real age
  // bracket, demonstrating both real, distinct screening modes.

  {
    id: 'S26-8001-CYT-001',
    accession: { accessionNumber: '8001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-8001-CYT-001' },
    originHospitalId: 'c-de-berlin-frauenklinik', originEnterpriseId: 'c-de-berlin-frauenklinik',
    // Real, under the German age threshold (35) — real cytology_only mode, no HPV at all.
    patient: { id: 'PAT-CYT-012', mrn: '400801', firstName: 'Lena', lastName: 'Hoffmann', dateOfBirth: isoYearsAgo(28, 3, 11), sex: 'F', phone: '+49 30 555 0601', email: 'lena.hoffmann@example.de', address: 'Torstraße 12, 10119 Berlin' },
    specimens: [{
      id: 'S26-8001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(3), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvCoTestOrdered: false,
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-de001-primary',
          primaryInterpretationId: 'mn3-group-i',
          adequacySelections: [{ categoryId: 'mn3-adeq-satisfactory' }],
          selectedBy: 'PATH-DE-001', selectedByName: 'Dr. Anke Weber', selectedAt: isoDaysAgo(2),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Anke Weber', facilityId: 'c-de-berlin-frauenklinik', facilityName: 'Berlin Frauenklinik Zytologie', clinicalIndication: 'G-BA organized screening — annual primary Pap cytology (age 20-34).', receivedDate: isoDaysAgo(3), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(2),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  {
    id: 'S26-8002-CYT-001',
    accession: { accessionNumber: '8002', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-8002-CYT-001' },
    originHospitalId: 'c-de-berlin-frauenklinik', originEnterpriseId: 'c-de-berlin-frauenklinik',
    // Real, at/above the German age threshold — real co_testing mode.
    patient: { id: 'PAT-CYT-013', mrn: '400802', firstName: 'Petra', lastName: 'Schulz', dateOfBirth: isoYearsAgo(42, 8, 27), sex: 'F', phone: '+49 30 555 0602', email: 'petra.schulz@example.de', address: 'Kastanienallee 45, 10435 Berlin' },
    specimens: [{
      id: 'S26-8002-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(4), collectedAt: isoDaysAgo(4), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvCoTestOrdered: true, hpvResult: 'Negative', hpvAbnormalFlag: 'N', hpvReferenceRange: 'Not Detected',
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-de002-primary',
          primaryInterpretationId: 'mn3-group-i',
          adequacySelections: [{ categoryId: 'mn3-adeq-satisfactory' }],
          selectedBy: 'PATH-DE-001', selectedByName: 'Dr. Anke Weber', selectedAt: isoDaysAgo(3),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Anke Weber', facilityId: 'c-de-berlin-frauenklinik', facilityName: 'Berlin Frauenklinik Zytologie', clinicalIndication: 'G-BA organized screening — co-testing every 3 years (age 35+).', receivedDate: isoDaysAgo(4), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(3),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real demo cases for the 6 newly-seeded geographies (Sep 2026) ──────────
  // Real, per direct guidance's own request: "defined seed data and
  // defined facilities... so we can test the different workflows."
  // One real, representative case per new geography, each chosen to
  // demonstrate that geography's own most distinctive real pathway.

  // Netherlands — real, already-reviewed CISOE-A case (Positive
  // hrHPV → real reflex cytology screened). Real cisoeAScore
  // populated directly on the review record below (PS-183) since the
  // real 6-axis entry UI is not yet built — this is the only way to
  // demonstrate a real, populated score today. S4 (mild dyskaryosis)
  // correctly maps to LSIL via resolveCisoeAToBethesda.ts.
  {
    id: 'S26-9001-CYT-001',
    accession: { accessionNumber: '9001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9001-CYT-001' },
    originHospitalId: 'c-nl-amsterdam-cyto', originEnterpriseId: 'c-nl-amsterdam-cyto',
    patient: { id: 'PAT-CYT-014', mrn: '500901', firstName: 'Anneke', lastName: 'de Vries', dateOfBirth: isoYearsAgo(33, 6, 14), sex: 'F', phone: '+31 20 555 1301', email: 'anneke.devries@example.nl', address: 'Prinsengracht 100, 1015 Amsterdam' },
    specimens: [{
      id: 'S26-9001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected',
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-nl001-primary',
          primaryInterpretationId: 'cyto-squam-lsil',
          adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
          selectedBy: 'PATH-NL-001', selectedByName: 'Dr. Willem Bakker', selectedAt: isoDaysAgo(1),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Willem Bakker', facilityId: 'c-nl-amsterdam-cyto', facilityName: 'Amsterdam Cytologie Centrum', clinicalIndication: 'Bevolkingsonderzoek baarmoederhalskanker — reflex cytology, real hrHPV-positive.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // Real, per direct guidance on APAC-QA-01 (external proficiency
  // testing): "the synthetic cases are accessioned into the system
  // and resulted... sent to [the provider]... a response is sent
  // back showing the scores." A real, clearly-synthetic CAP
  // proficiency-testing challenge case, accessioned and screened the
  // exact same real way as any real patient case — proficiencyTestContext
  // is the one real, structural difference. Patient name/MRN are
  // deliberately, unmistakably synthetic (never confusable with a
  // real patient), matching this app's own established convention
  // for every other clearly-synthetic seed record.
  {
    id: 'S26-PT001-CYT-001',
    accession: { accessionNumber: 'PT001', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-PT001-CYT-001' },
    proficiencyTestContext: { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03' },
    originHospitalId: 'c-hfhs-01', originEnterpriseId: 'c-hfhs-01',
    patient: { id: 'PAT-CYT-PT001', mrn: 'PT-SYNTH-0001', firstName: 'CAP Gyn', lastName: 'Survey Challenge A-03', dateOfBirth: isoYearsAgo(45, 0, 1), sex: 'F' },
    specimens: [{
      id: 'S26-PT001-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based (CAP GYN Survey slide)', receivedAt: isoDaysAgo(10), collectedAt: isoDaysAgo(10), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {},
    } as any],
    order: { priority: 'Routine', requestingProvider: 'CAP Surveys', facilityId: 'c-hfhs-01', facilityName: 'Henry Ford Health System', clinicalIndication: 'CAP GYN Cytology Survey — external proficiency-testing challenge slide, not a real patient.', receivedDate: isoDaysAgo(10), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(10), updatedAt: isoDaysAgo(9),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // Real, per this same guidance — three total PT challenge cases,
  // deliberately mixed real outcomes (see
  // mockCytologyProficiencyTestResultService.ts's own seed) so
  // APAC-QA-01 has real, non-trivial data to aggregate — an all-
  // satisfactory dataset would never demonstrate the report's own
  // real purpose.
  {
    id: 'S26-PT002-CYT-001',
    accession: { accessionNumber: 'PT002', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-PT002-CYT-001' },
    proficiencyTestContext: { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-07' },
    originHospitalId: 'c-hfhs-01', originEnterpriseId: 'c-hfhs-01',
    patient: { id: 'PAT-CYT-PT002', mrn: 'PT-SYNTH-0002', firstName: 'CAP Gyn', lastName: 'Survey Challenge A-07', dateOfBirth: isoYearsAgo(45, 0, 1), sex: 'F' },
    specimens: [{ id: 'S26-PT002-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based (CAP GYN Survey slide)', receivedAt: isoDaysAgo(10), collectedAt: isoDaysAgo(10), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: {} } as any],
    order: { priority: 'Routine', requestingProvider: 'CAP Surveys', facilityId: 'c-hfhs-01', facilityName: 'Henry Ford Health System', clinicalIndication: 'CAP GYN Cytology Survey — external proficiency-testing challenge slide, not a real patient.', receivedDate: isoDaysAgo(10), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [], status: 'in-progress' as CaseStatus, createdAt: isoDaysAgo(10), updatedAt: isoDaysAgo(9),
    caseFlags: [], specimenFlags: [], reportingMode: 'orchestrator', coding: {},
  } as any,
  {
    id: 'S26-PT003-CYT-001',
    accession: { accessionNumber: 'PT003', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-PT003-CYT-001' },
    proficiencyTestContext: { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-B-02' },
    originHospitalId: 'c-hfhs-01', originEnterpriseId: 'c-hfhs-01',
    patient: { id: 'PAT-CYT-PT003', mrn: 'PT-SYNTH-0003', firstName: 'CAP Gyn', lastName: 'Survey Challenge B-02', dateOfBirth: isoYearsAgo(45, 0, 1), sex: 'F' },
    specimens: [{ id: 'S26-PT003-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based (CAP GYN Survey slide)', receivedAt: isoDaysAgo(4), collectedAt: isoDaysAgo(4), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: {} } as any],
    order: { priority: 'Routine', requestingProvider: 'CAP Surveys', facilityId: 'c-hfhs-01', facilityName: 'Henry Ford Health System', clinicalIndication: 'CAP GYN Cytology Survey — external proficiency-testing challenge slide, not a real patient.', receivedDate: isoDaysAgo(4), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [], status: 'in-progress' as CaseStatus, createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(4),
    caseFlags: [], specimenFlags: [], reportingMode: 'orchestrator', coding: {},
  } as any,

  // France — real reflex_triggered case (age 42, at/above the real 30
  // threshold — primary hrHPV pathway).
  {
    id: 'S26-9002-CYT-001',
    accession: { accessionNumber: '9002', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9002-CYT-001' },
    originHospitalId: 'c-fr-paris-cyto', originEnterpriseId: 'c-fr-paris-cyto',
    patient: { id: 'PAT-CYT-015', mrn: '500902', firstName: 'Camille', lastName: 'Moreau', dateOfBirth: isoYearsAgo(42, 2, 9), sex: 'F', phone: '+33 1 55 55 1302', email: 'camille.moreau@example.fr', address: '10 Rue de Rivoli, 75004 Paris' },
    specimens: [{
      id: 'S26-9002-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(3), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: { hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected' },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Sophie Lefèvre', facilityId: 'c-fr-paris-cyto', facilityName: 'Centre de Cytologie Paris', clinicalIndication: 'Programme national de dépistage organisé — primary hrHPV (age 30+), reflex cytology.', receivedDate: isoDaysAgo(3), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus, poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(3),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // Belgium — real, under-30 case (age 27, below the real 30
  // threshold — real cytology_only pathway, no HPV at all).
  {
    id: 'S26-9003-CYT-001',
    accession: { accessionNumber: '9003', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9003-CYT-001' },
    originHospitalId: 'c-be-brussels-cyto', originEnterpriseId: 'c-be-brussels-cyto',
    patient: { id: 'PAT-CYT-016', mrn: '500903', firstName: 'Marie', lastName: 'Dubois', dateOfBirth: isoYearsAgo(27, 10, 5), sex: 'F', phone: '+32 2 555 1303', email: 'marie.dubois@example.be', address: 'Rue Neuve 123, 1000 Brussels' },
    specimens: [{
      id: 'S26-9003-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {},
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Julie Lambert', facilityId: 'c-be-brussels-cyto', facilityName: 'Brussel Cytologie Instituut', clinicalIndication: 'INAMI-RIZIV organized screening — primary Pap cytology (age 25-29).', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001' },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // Canada — real reflex_triggered case (British Columbia, transitioned to primary hrHPV).
  {
    id: 'S26-9004-CYT-001',
    accession: { accessionNumber: '9004', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9004-CYT-001' },
    originHospitalId: 'c-ca-vancouver-cyto', originEnterpriseId: 'c-ca-vancouver-cyto',
    patient: { id: 'PAT-CYT-017', mrn: '500904', firstName: 'Emily', lastName: 'MacDonald', dateOfBirth: isoYearsAgo(36, 4, 22), sex: 'F', phone: '+1 604 555 1304', email: 'emily.macdonald@example.ca', address: '789 Robson St, Vancouver, BC' },
    specimens: [{
      id: 'S26-9004-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: { hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected' },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Sarah Chen', facilityId: 'c-ca-vancouver-cyto', facilityName: 'Vancouver Cytology Laboratory', clinicalIndication: 'BC Cervix Screening Program — primary hrHPV, reflex cytology.', receivedDate: isoDaysAgo(2), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus, poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // New Zealand — real, distinctive self-collection recall case
  // (positive self-swab -> real recall for clinician-collected LBC,
  // PS-178's own architecture, now demonstrated for a second country).
  {
    id: 'S26-9005-CYT-001',
    accession: { accessionNumber: '9005', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9005-CYT-001' },
    originHospitalId: 'c-nz-auckland-cyto', originEnterpriseId: 'c-nz-auckland-cyto',
    patient: { id: 'PAT-CYT-018', mrn: '500905', firstName: 'Aroha', lastName: 'Ngata', dateOfBirth: isoYearsAgo(31, 12, 3), sex: 'F', phone: '+64 9 555 1305', email: 'aroha.ngata@example.nz', address: '15 Queen St, Auckland' },
    specimens: [{
      id: 'S26-9005-SP-1', label: 'A', description: 'Self-collected vaginal swab, HPV only', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-hpv-self',
      cytologyScreening: { hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected' },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Hemi Walker', facilityId: 'c-nz-auckland-cyto', facilityName: 'Auckland Cytology Services', clinicalIndication: 'NCSP primary hrHPV — self-collected vaginal swab, positive result.', receivedDate: isoDaysAgo(1), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // Australia — real "ordered state": awaiting the primary hrHPV
  // result, clinician-collected specimen (the real HPV Triage tile's
  // own working example, now demonstrated for a second country).
  {
    id: 'S26-9006-CYT-001',
    accession: { accessionNumber: '9006', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9006-CYT-001' },
    originHospitalId: 'c-au-sydney-cyto', originEnterpriseId: 'c-au-sydney-cyto',
    patient: { id: 'PAT-CYT-019', mrn: '500906', firstName: 'Isla', lastName: 'Thompson', dateOfBirth: isoYearsAgo(29, 7, 18), sex: 'F', phone: '+61 2 555 1306', email: 'isla.thompson@example.au', address: '45 George St, Sydney NSW' },
    specimens: [{
      id: 'S26-9006-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {},
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Olivia Chen', facilityId: 'c-au-sydney-cyto', facilityName: 'Sydney Cytology & Pathology', clinicalIndication: 'NCSP primary hrHPV — clinician-collected LBC, result pending.', receivedDate: isoDaysAgo(1), assignedTo: null },
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real demo case: UK CSMS QA (Sep 2026) ───────────────────────────────────
  // Real, per direct guidance's own real mechanism: already signed
  // out and dispatched to CSMS, with the real 'f36' (CSMS Eligibility
  // Verification Needed) flag already applied — demonstrating the new
  // real "CSMS QA" worklist tab with something to show immediately,
  // rather than requiring a fresh sign-out first.
  {
    id: 'S26-9101-CYT-001',
    accession: { accessionNumber: '9101', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9101-CYT-001' },
    originHospitalId: 'c-fenwick-womens', originEnterpriseId: 'c-trust-fenwick',
    patient: { id: 'PAT-CYT-020', mrn: '200602', firstName: 'Margaret', lastName: 'Ellison', dateOfBirth: isoYearsAgo(52, 5, 9), sex: 'F', phone: '+44 191 555 0202', email: 'margaret.ellison@example.co.uk', address: '8 Fenwick Grove, Newcastle upon Tyne' },
    specimens: [{
      id: 'S26-9101-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-uk9101-primary',
          primaryInterpretationId: 'bscc-negative',
          adequacySelections: [{ categoryId: 'bscc-adeq-satisfactory' }],
          selectedBy: 'PATH-UK-001', selectedByName: 'Dr. Priya Shah', selectedAt: isoDaysAgo(1),
        },
      },
    } as any],
    // Real, per direct guidance's own correction: this demo case is
    // flagged specifically because reasonForStudy was never captured
    // at accessioning — kept genuinely absent here, not set, so the
    // seed data stays consistent with the real, corrected flag
    // trigger.
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Shah', facilityId: 'c-fenwick-womens', facilityName: "Fenwick Women's Hospital", clinicalIndication: 'Routine NHS Cervical Screening Programme recall.', receivedDate: isoDaysAgo(2), assignedTo: null } as any,
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'complete' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [{
      id: 'csms-elig-seed-9101', flagDefinitionId: 'f36', appliedAt: isoDaysAgo(1), appliedBy: 'system',
      source: 'system', deletedAt: null, deletedBy: null,
    }] as any,
    specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real demo case: Ireland CervicalCheck (Sep 2026) ────────────────────────
  // Real, reflex-triggered case (Positive hrHPV → real reflex cytology
  // screened), same real pathway as every other primary_hpv_reflex
  // country already built. Real Bethesda nomenclature — no separate
  // Irish dictionary needed, per direct research confirmation.
  {
    id: 'S26-9201-CYT-001',
    accession: { accessionNumber: '9201', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9201-CYT-001' },
    originHospitalId: 'c-ie-ncsl-dublin', originEnterpriseId: 'c-ie-ncsl-dublin',
    patient: { id: 'PAT-CYT-021', mrn: '700901', firstName: 'Siobhan', lastName: 'Kelly', dateOfBirth: isoYearsAgo(38, 3, 22), sex: 'F', phone: '+353 1 555 1501', email: 'siobhan.kelly@example.ie', address: '42 Rathgar Road, Dublin 6' },
    specimens: [{
      id: 'S26-9201-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: { hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected' },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Aoife Byrne', facilityId: 'c-ie-ncsl-dublin', facilityName: 'National Cervical Screening Laboratory', clinicalIndication: 'CervicalCheck organized screening — primary hrHPV, reflex cytology.', receivedDate: isoDaysAgo(2), assignedTo: null } as any,
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'pool' as CaseStatus, poolId: '1', poolName: 'Cytology',
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real demo case: Australia NCSR (Sep 2026) ───────────────────────────────
  // Real, already-reviewed, ready-for-sign-out case — demonstrating
  // the real, live NCSR dispatch end to end (the existing S26-9006 is
  // deliberately still awaiting its HPV result, per PS-185's own
  // design, so a second, ready case is needed here).
  {
    id: 'S26-9301-CYT-001',
    accession: { accessionNumber: '9301', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9301-CYT-001' },
    originHospitalId: 'c-au-sydney-cyto', originEnterpriseId: 'c-au-sydney-cyto',
    patient: { id: 'PAT-CYT-022', mrn: '600601', firstName: 'Chloe', lastName: 'Nguyen', dateOfBirth: isoYearsAgo(34, 9, 11), sex: 'F', phone: '+61 2 555 1601', email: 'chloe.nguyen@example.au', address: '12 Glebe Point Rd, Glebe NSW' },
    specimens: [{
      id: 'S26-9301-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected',
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-au9301-primary',
          primaryInterpretationId: 'cyto-squam-ascus',
          adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
          selectedBy: 'PATH-AU-001', selectedByName: 'Dr. Olivia Chen', selectedAt: isoDaysAgo(1),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Olivia Chen', facilityId: 'c-au-sydney-cyto', facilityName: 'Sydney Cytology & Pathology', clinicalIndication: 'NCSP primary hrHPV — reflex cytology.', receivedDate: isoDaysAgo(2), assignedTo: null } as any,
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

  // ── Real demo case: Northern Ireland (Sep 2026) ─────────────────────────────
  // Real, already-reviewed, ready-for-sign-out case — demonstrating the
  // real, live Northern Ireland Cervical Screening Programme dispatch
  // end to end, with the real BSCC/RCPath nomenclature already
  // confirmed for this facility above.
  {
    id: 'S26-9401-CYT-001',
    accession: { accessionNumber: '9401', accessionPrefix: 'S', accessionYear: 2026, fullAccession: 'S26-9401-CYT-001' },
    originHospitalId: 'c-ni-lagan-valley', originEnterpriseId: 'c-ni-lagan-valley',
    patient: { id: 'PAT-CYT-023', mrn: '800701', firstName: 'Orla', lastName: 'McKendry', dateOfBirth: isoYearsAgo(41, 6, 14), sex: 'F', phone: '+44 28 555 1801', email: 'orla.mckendry@example.co.uk', address: '54 Malone Road, Belfast BT9 5BS' },
    specimens: [{
      id: 'S26-9401-SP-1', label: 'A', description: 'Cervical/vaginal Pap smear, liquid-based', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [], specimenDictionaryEntryId: 'sp-cyto-pap',
      cytologyScreening: {
        hpvResult: 'Positive', hpvAbnormalFlag: 'A', hpvReferenceRange: 'Not Detected',
        finalDiagnosis: {
          reviewRecordId: 'cyto-review-seed-ni9401-primary',
          primaryInterpretationId: 'bscc-low-grade-dyskaryosis',
          adequacySelections: [{ categoryId: 'bscc-adeq-satisfactory' }],
          selectedBy: 'PATH-NI-001', selectedByName: 'Dr. Fiona Hamill', selectedAt: isoDaysAgo(1),
        },
      },
    } as any],
    order: { priority: 'Routine', requestingProvider: 'Dr. Fiona Hamill', facilityId: 'c-ni-lagan-valley', facilityName: "Lagan Valley Women's Health Centre", clinicalIndication: 'Northern Ireland Cervical Screening Programme — primary hrHPV, reflex cytology.', receivedDate: isoDaysAgo(2), assignedTo: null } as any,
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    synopticReports: [],
    status: 'in-progress' as CaseStatus,
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1),
    caseFlags: [], specimenFlags: [],
    reportingMode: 'orchestrator', coding: {},
  } as any,

];

// ─── Real lifecycle timestamps for dashboard demo purposes ──────────────────
// Real fix, found via a direct review: zero seed cases had
// diagnostic.finalizedBy/issuedDate set anywhere, and grossCompletedAt/
// firstOpenedAt (both new fields, added for real TAT calculation - see
// components/Contribution/qualityCalculations.ts) obviously didn't exist
// on any seed case either. This meant ProductivityTab.tsx's real case-
// count dashboard AND QualityTab.tsx's four newly-real TAT sections
// would all show genuinely empty results for a fresh demo/dev
// environment, despite the real calculation logic behind them being
// correct - there was simply nothing to calculate from.
//
// Enriches a real subset of existing seed cases (already assigned to the
// primary demo pathologist, PATH-001, with a real receivedDate) with
// realistic, chronologically consistent lifecycle timestamps -
// receivedDate < firstOpenedAt < grossCompletedAt < issuedDate.
// Deliberately a genuine MIX of in-target and real outliers (not all
// clean, not all breaches), so the dashboards demonstrate real variety
// rather than either "suspiciously empty" or "suspiciously perfect".
// Idempotent by construction - only ever runs once, at module load,
// against cases that don't already have these fields.
{
  const DEMO_PATHOLOGIST_ID = 'PATH-001';
  // Each entry: [hours receivedDate→firstOpenedAt, hours
  // firstOpenedAt→grossCompletedAt, hours grossCompletedAt→issuedDate].
  // Roughly half land inside typical 4h/24h targets, half deliberately
  // don't - real variety, not a uniform demo.
  const LIFECYCLE_OFFSETS: [number, number, number][] = [
    [1, 2, 8],    // clean across the board
    [6, 5, 30],   // first-touch breach + total-case breach
    [2, 1, 10],   // clean
    [1, 8, 40],   // grossing + sign-out + total breach
    [3, 2, 20],   // clean-ish
    [8, 3, 15],   // first-touch breach only
    [2, 6, 28],   // grossing breach + total breach
    [1, 1, 6],    // clean, fast
    [5, 4, 26],   // first-touch + total breach
    [2, 2, 12],   // clean
  ];
  // Cold ischemia minutes (collection → fixation) per case, applied to
  // specimens[0] only - real target is 1h system default, so most of
  // these deliberately straddle that line.
  const COLD_ISCHEMIA_MINUTES = [40, 95, 30, 20, 70, 45, 110, 25, 80, 35];

  const realEligible = MOCK_CASES.filter(c =>
    (c as any).order?.assignedTo === DEMO_PATHOLOGIST_ID && (c as any).order?.receivedDate
  );

  realEligible.slice(0, LIFECYCLE_OFFSETS.length).forEach((c, i) => {
    const anyCase = c as any;
    if (anyCase.diagnostic?.finalizedBy) return; // never overwrite real, intentional data

    const [toFirstTouch, toGrossing, toSignOut] = LIFECYCLE_OFFSETS[i];
    const receivedMs = new Date(anyCase.order.receivedDate).getTime();
    if (isNaN(receivedMs)) return;

    const firstOpenedAt    = new Date(receivedMs + toFirstTouch * 3600_000).toISOString();
    const grossCompletedAt = new Date(receivedMs + (toFirstTouch + toGrossing) * 3600_000).toISOString();
    const issuedDate       = new Date(receivedMs + (toFirstTouch + toGrossing + toSignOut) * 3600_000).toISOString();

    anyCase.firstOpenedAt    = firstOpenedAt;
    anyCase.grossCompletedAt = grossCompletedAt;
    anyCase.diagnostic = {
      ...(anyCase.diagnostic ?? {}),
      finalizedBy: DEMO_PATHOLOGIST_ID,
      issuedDate,
    };

    // Real fix: cold ischemia data (Specimen.collectedAt →
    // Specimen.processing.processedAt) - added specifically since real
    // seed data had zero specimens with processing.processedAt set
    // anywhere, meaning computeColdIschemiaOutliers would find nothing
    // to calculate from even with correct logic. Only touches
    // specimens[0] and only when it doesn't already have real,
    // intentional processing data.
    const firstSpecimen = anyCase.specimens?.[0];
    if (firstSpecimen && !firstSpecimen.processing?.processedAt) {
      const collectedMs = firstSpecimen.collectedAt ? new Date(firstSpecimen.collectedAt).getTime() : receivedMs - 3600_000;
      const processedAt = new Date(collectedMs + COLD_ISCHEMIA_MINUTES[i] * 60_000).toISOString();
      firstSpecimen.processing = { ...(firstSpecimen.processing ?? {}), processedAt };
    }
  });
}

// ─── Per-case patient history & similar cases ────────────────────────────────

export interface SimilarCase {
  id: string; accession: string; patient: string; diagnosis: string;
  date: string; similarity: number; site: string; outcome: string;
}

export const mockPatientHistoryMap: Record<string, string> = {

  // ── US Demo — Amber Fehrs-Battey (MPA) ──────────────────────────────────────
  'MPA26-1007-PED': 'No prior pathology on file. First surgical specimen for this patient.',

  'MPA26-1001-BR':
    "MPA23-0441 (Mar 2023) — Screening mammogram bilateral. BI-RADS 3 left breast — short-interval follow-up advised. | " +
    "MPA24-1882 (Jun 2024) — Diagnostic mammogram + ultrasound left breast. BI-RADS 4B, 1.4 cm mass 12 o'clock. Core biopsy recommended. | " +
    "MPA24-3301 (Aug 2024) — Ultrasound-guided core needle biopsy left breast 12 o'clock. Dx: Atypical ductal hyperplasia (ADH). Excision recommended.",
  'MPA26-1002-CR':
    "MPA19-0088 (Jan 2019) — Colonoscopy polypectomy, sigmoid colon. Dx: Tubular adenoma, low grade, completely excised. Surveillance in 5 years. | " +
    "MPA22-4401 (Apr 2022) — Colonoscopy biopsy, rectosigmoid junction. Dx: Tubulovillous adenoma with low grade dysplasia. Repeat colonoscopy in 3 years. | " +
    "MPA24-9910 (Oct 2024) — Colonoscopy biopsy, sigmoid/rectosigmoid mass 28 cm from AV. Dx: Adenocarcinoma, moderately differentiated. MRI staging: cT3N1. Neoadjuvant chemoradiation commenced.",
  'MPA26-1003-PRO':
    "MPA18-3301 (Jun 2018) — Prostate needle biopsy x12. Dx: Benign prostatic tissue. PSA 3.8. Annual PSA surveillance. | " +
    "MPA21-7712 (Sep 2021) — Prostate needle biopsy x12. Dx: Benign with focal high-grade PIN. PSA 5.6. MRI surveillance in 12 months. | " +
    "MPA24-4401 (Apr 2024) — MRI prostate PI-RADS 4 right posterior mid-gland. PSA 7.9. MRI-targeted biopsy recommended. | " +
    "MPA25-0881 (Jan 2025) — MRI-targeted + systematic biopsy x14. Dx: Acinar adenocarcinoma Gleason 3+4=7 (GG2) right posterior, 3/6 targeted cores positive. Radical prostatectomy planned.",

  // ── US Demo — Dr. Mark Tuthill (HFHS) ───────────────────────────────────────
  'HFHS26-1004-LU':
    "HFHS21-4401 (Oct 2021) — CT chest incidental finding: 8 mm RUL nodule. Fleischner low-risk — repeat CT in 12 months. | " +
    "HFHS22-6610 (Dec 2022) — CT chest surveillance: RUL nodule 11 mm, stable. Continue surveillance. | " +
    "HFHS24-3301 (May 2024) — CT chest: RUL nodule 1.9 cm, new ground-glass component. PET-CT arranged. | " +
    "HFHS25-8801 (Oct 2025) — PET-CT: RUL lesion 2.2 cm, SUVmax 5.8. No mediastinal uptake. CT-guided biopsy planned. | " +
    "HFHS25-9910 (Nov 2025) — CT-guided needle biopsy RUL mass. Dx: Adenocarcinoma acinar predominant. EGFR pending. VATS lobectomy booked.",
  'HFHS26-1005-FS':
    "HFHS24-0441 (Jan 2024) — EUS-FNA pancreatic head mass 2.1 cm. Dx: Atypical cells — insufficient for definitive diagnosis. CA19-9 210. Repeat imaging in 3 months. | " +
    "HFHS24-4401 (May 2024) — CT abdomen/pelvis: pancreatic head mass 2.7 cm, no vascular involvement. CA19-9 380. Surgical referral placed. | " +
    "HFHS25-8810 (Sep 2025) — EUS-FNA repeat. Dx: Adenocarcinoma, moderately differentiated. MDT: borderline resectable. Neoadjuvant FOLFIRINOX commenced.",

  'S26-4420-MEL':
    "S20-3301 (Jul 2020) — Punch biopsy right forearm pigmented lesion 0.6 cm. Dx: Dysplastic naevus, moderate atypia. Complete excision recommended. | " +
    "S22-8801 (Oct 2022) — Shave biopsy right forearm, recurrence at prior site. Dx: Dysplastic naevus, severe atypia (almost melanoma in situ). Wide local excision with 5 mm margins advised. | " +
    "S24-1102 (Feb 2024) — Punch biopsy new pigmented lesion right forearm, 1.4 cm, adjacent to scar. Dx: Melanoma in situ, superficial spreading type. Wide local excision 1 cm margins performed. | " +
    "S25-8801 (Oct 2025) — Punch biopsy right forearm lesion 2.1 cm, irregular border, rapid growth. Dx: Invasive melanoma, superficial spreading type, Breslow 2.3 mm. Wide local excision + sentinel node planned.",
  'S26-4401':
    "S22-4471 (Mar 2022) — Core needle biopsy, left breast 10 o'clock. Dx: Atypical ductal hyperplasia (ADH). ER+/PR+. Excision recommended; patient deferred. | " +
    "S23-7809 (Nov 2023) — Wire-localised excision, left breast. Dx: DCIS intermediate grade, cribriform, 8 mm. Margins clear >2 mm. XRT planned. | " +
    "S25-1104 (Jan 2025) — Screening mammogram bilateral. BI-RADS 3 — short-interval follow-up advised.",
  'S26-4402':
    "S21-8832 (Aug 2021) — Colonoscopy polypectomy, sigmoid colon. Dx: Tubular adenoma, low grade, completely excised. Surveillance in 3 years. | " +
    "S24-0091 (Jan 2024) — Surveillance colonoscopy biopsy, sigmoid colon. Dx: Tubulovillous adenoma with high grade dysplasia. Surgical referral placed. | " +
    "S24-6210 (Jun 2024) — Colonoscopy biopsy, sigmoid mass. Dx: Adenocarcinoma, moderately differentiated. CT staging arranged.",
  'S26-4403':
    "S22-3310 (Apr 2022) — CT-guided core biopsy, right upper lobe nodule 1.1 cm. Dx: Atypical adenomatous hyperplasia. Active surveillance. | " +
    "S24-9912 (Nov 2024) — PET-CT: RUL lesion 2.3 cm SUVmax 8.4. CT-guided biopsy planned. | " +
    "S25-0044 (Jan 2025) — CT-guided needle biopsy, RUL mass. Dx: Adenocarcinoma, acinar predominant. KRAS G12C. Surgical referral.",
  'S26-4404':
    "S20-5541 (Jun 2020) — Prostate needle biopsy x12. Dx: Benign, all cores. PSA 4.1. Annual surveillance. | " +
    "S22-7723 (Sep 2022) — Prostate needle biopsy x12. Dx: Benign with focal PIN. PSA 5.2. 12-month follow-up. | " +
    "S24-3301 (Mar 2024) — MRI prostate PI-RADS 3 right mid-gland. PSA 6.8. Active surveillance continued.",
  'S26-4405':
    "S23-4499 (Jul 2023) — Screening mammogram. BI-RADS 0 — calcifications right UOQ. Recall for additional views. | " +
    "S23-6610 (Sep 2023) — Stereotactic biopsy, right breast calcifications. Dx: DCIS intermediate grade. Lumpectomy + XRT recommended.",
  'S26-4406':
    "S25-8801 (Dec 2025) — Screening mammogram bilateral. BI-RADS 4B right breast mass 2 o'clock. Ultrasound-guided biopsy recommended.",
  'S26-4407':
    "S23-1140 (Feb 2023) — Colonoscopy biopsy, rectal mass 8 cm from AV. Dx: Adenocarcinoma, moderately differentiated. MRI staging: mrT3N2M0. | " +
    "S23-4482 (May 2023) — Restaging post-neoadjuvant FOLFOX + long-course RT. Endoscopy: near-complete response. Pathology: mucin pools, no viable tumour. | " +
    "S25-9901 (Oct 2025) — Surveillance colonoscopy. No anastomotic recurrence. CEA stable 2.1.",
  'S26-4408':
    "S22-0091 (Jan 2022) — BRCA1/2 germline testing: BRCA1 pathogenic variant c.5266dupC. Risk-reducing surgery discussed. | " +
    "S23-9901 (Dec 2023) — MRI screening bilateral. BI-RADS 4C right breast 2.1 cm UOQ. Biopsy arranged. | " +
    "S24-0441 (Jan 2024) — Ultrasound-guided biopsy, right breast 2 o'clock. Dx: Invasive carcinoma NST, Grade 3, HER2 3+. Pre-op pertuzumab/trastuzumab.",
};

export const mockSimilarCasesMap: Record<string, SimilarCase[]> = {
  'S26-4420-MEL': [
    { id: 'S25-9902', accession: 'S25-9902', patient: 'Whitmore, Carol',   diagnosis: 'Melanoma, superficial spreading, Breslow 2.1 mm, Clark IV, no ulceration, pT2b, pN1a SLN+', date: '2025-11-20', similarity: 96, site: 'Right forearm',   outcome: 'Finalized' },
    { id: 'S25-6611', accession: 'S25-6611', patient: 'Pemberton, Diana',  diagnosis: 'Melanoma, superficial spreading, Breslow 2.8 mm, Clark IV, ulcerated, pT3b, pN0 SLN-',      date: '2025-07-14', similarity: 91, site: 'Left forearm',    outcome: 'Finalized' },
    { id: 'S25-1103', accession: 'S25-1103', patient: 'Ashworth, Helen',   diagnosis: 'Melanoma, superficial spreading, Breslow 1.9 mm, Clark IV, no ulceration, pT2a, pN0',        date: '2025-03-08', similarity: 84, site: 'Right upper arm', outcome: 'Finalized' },
    { id: 'S24-8802', accession: 'S24-8802', patient: 'Griffith, Sandra',  diagnosis: 'Melanoma, nodular type, Breslow 3.4 mm, Clark V, ulcerated, pT3b, pN1a SLN+, BRAF+',        date: '2024-10-22', similarity: 76, site: 'Right forearm',   outcome: 'Finalized' },
    { id: 'S24-3302', accession: 'S24-3302', patient: 'Morrison, Jean',    diagnosis: 'Melanoma, superficial spreading, Breslow 1.5 mm, Clark III, no ulceration, pT2a, pN0',       date: '2024-04-17', similarity: 69, site: 'Left arm',        outcome: 'Amended'   },
  ],
  'S26-4401': [
    { id: 'S25-3301', accession: 'S25-3301', patient: 'Harrison, Mary',    diagnosis: 'Invasive carcinoma NST, Grade 2, 2.1 cm, ER+/PR+/HER2-, pN1(1/3)',       date: '2025-08-14', similarity: 96, site: 'Left breast UOQ',    outcome: 'Finalized' },
    { id: 'S25-1872', accession: 'S25-1872', patient: 'Foster, Diane',     diagnosis: 'Invasive carcinoma NST, Grade 2, 1.8 cm, ER+/PR+/HER2 2+ (FISH neg)',    date: '2025-03-22', similarity: 91, site: 'Left breast',         outcome: 'Finalized' },
    { id: 'S24-7809', accession: 'S24-7809', patient: 'Nelson, Patricia',  diagnosis: 'Invasive lobular carcinoma, Grade 2, 2.6 cm, ER+/PR+/HER2-',             date: '2024-11-08', similarity: 84, site: 'Left breast UIQ',    outcome: 'Finalized' },
    { id: 'S24-4451', accession: 'S24-4451', patient: 'Reed, Barbara',     diagnosis: 'Invasive carcinoma NST, Grade 1, 1.4 cm, ER+/PR+/HER2-, pN0',            date: '2024-06-19', similarity: 79, site: 'Right breast UOQ',   outcome: 'Finalized' },
    { id: 'S23-9103', accession: 'S23-9103', patient: 'Cox, Margaret',     diagnosis: 'Invasive carcinoma NST, Grade 3, 3.1 cm, ER+/PR-/HER2-, pN2(4/14)',      date: '2023-12-01', similarity: 72, site: 'Left breast',         outcome: 'Amended'   },
  ],
  'S26-4402': [
    { id: 'S25-4401', accession: 'S25-4401', patient: 'Butler, George',    diagnosis: 'Adenocarcinoma sigmoid, low grade, pT3N0, pMMR, KRAS G12D',              date: '2025-09-10', similarity: 94, site: 'Sigmoid colon',       outcome: 'Finalized' },
    { id: 'S25-0812', accession: 'S25-0812', patient: 'Simmons, Frank',    diagnosis: 'Adenocarcinoma sigmoid, low grade, pT3N1b(3/18), pMMR',                  date: '2025-05-17', similarity: 89, site: 'Sigmoid colon',       outcome: 'Finalized' },
    { id: 'S24-6631', accession: 'S24-6631', patient: 'Grant, Thomas',     diagnosis: 'Adenocarcinoma descending colon, low grade, pT3N0, MSI-H',               date: '2024-10-03', similarity: 81, site: 'Descending colon',    outcome: 'Finalized' },
    { id: 'S24-2210', accession: 'S24-2210', patient: 'Webb, Arthur',      diagnosis: 'Adenocarcinoma rectosigmoid, pT4aN1a(1/12), pMMR, KRAS wt',             date: '2024-04-22', similarity: 74, site: 'Rectosigmoid',        outcome: 'Finalized' },
    { id: 'S23-8814', accession: 'S23-8814', patient: 'Murray, Charles',   diagnosis: 'Mucinous adenocarcinoma sigmoid, high grade, pT3N2b, MSI-H',             date: '2023-08-15', similarity: 67, site: 'Sigmoid colon',       outcome: 'Finalized' },
  ],
  'S26-4403': [
    { id: 'S25-5501', accession: 'S25-5501', patient: 'Fleming, Barbara',  diagnosis: 'Adenocarcinoma RUL, acinar predominant, Grade 2, pT1cN0, KRAS G12C',     date: '2025-10-05', similarity: 95, site: 'Right upper lobe',    outcome: 'Finalized' },
    { id: 'S25-2219', accession: 'S25-2219', patient: 'Gibson, Anne',      diagnosis: 'Adenocarcinoma LUL, lepidic/acinar, Grade 2, pT2aN0, EGFR exon 19 del', date: '2025-06-11', similarity: 87, site: 'Left upper lobe',     outcome: 'Finalized' },
    { id: 'S24-8802', accession: 'S24-8802', patient: 'Hawkins, Sandra',   diagnosis: 'Adenocarcinoma RUL, papillary predominant, Grade 3, pT2bN1, ALK+',       date: '2024-12-20', similarity: 80, site: 'Right upper lobe',    outcome: 'Finalized' },
    { id: 'S24-3318', accession: 'S24-3318', patient: 'Preston, Judith',   diagnosis: 'Adenocarcinoma RLL, acinar, Grade 2, pT1bN0, KRAS G12V',                date: '2024-07-08', similarity: 73, site: 'Right lower lobe',    outcome: 'Finalized' },
    { id: 'S23-7741', accession: 'S23-7741', patient: 'Lawson, Shirley',   diagnosis: 'Invasive mucinous adenocarcinoma RUL, Grade 1, pT3N0, KRAS G12D',        date: '2023-11-14', similarity: 65, site: 'Right upper lobe',    outcome: 'Finalized' },
  ],
  'S26-4404': [
    { id: 'S25-6601', accession: 'S25-6601', patient: 'Carpenter, James',  diagnosis: 'Acinar adenocarcinoma, Gleason 3+4=7 (GG2), 5/12 cores, PNI present',   date: '2025-11-02', similarity: 97, site: 'Prostate bilateral',   outcome: 'Finalized' },
    { id: 'S25-3318', accession: 'S25-3318', patient: 'Stone, Edward',     diagnosis: 'Acinar adenocarcinoma, Gleason 3+4=7 (GG2), 4/12 cores, PNI absent',    date: '2025-07-19', similarity: 92, site: 'Prostate right',       outcome: 'Finalized' },
    { id: 'S24-9912', accession: 'S24-9912', patient: 'Walsh, Joseph',     diagnosis: 'Acinar adenocarcinoma, Gleason 4+3=7 (GG3), 6/12 cores, PNI present',   date: '2024-09-30', similarity: 84, site: 'Prostate bilateral',   outcome: 'Finalized' },
    { id: 'S24-5514', accession: 'S24-5514', patient: 'Ryan, Patrick',     diagnosis: 'Acinar adenocarcinoma, Gleason 3+3=6 (GG1), 2/12 cores, PNI absent',    date: '2024-05-14', similarity: 76, site: 'Prostate right',       outcome: 'Finalized' },
    { id: 'S23-8801', accession: 'S23-8801', patient: 'Kennedy, William',  diagnosis: 'Acinar adenocarcinoma, Gleason 4+4=8 (GG4), 8/12 cores, PNI present',   date: '2023-10-07', similarity: 68, site: 'Prostate bilateral',   outcome: 'Finalized' },
  ],
  'S26-4405': [
    { id: 'S25-4402', accession: 'S25-4402', patient: 'Palmer, Christine', diagnosis: 'DCIS intermediate grade, cribriform, 15 mm, margins clear >3 mm',       date: '2025-08-21', similarity: 95, site: 'Right breast UOQ',    outcome: 'Finalized' },
    { id: 'S25-1101', accession: 'S25-1101', patient: 'Gardner, Frances',  diagnosis: 'DCIS intermediate grade, solid/cribriform, 22 mm, closest margin 2 mm', date: '2025-04-09', similarity: 88, site: 'Left breast',         outcome: 'Finalized' },
    { id: 'S24-7712', accession: 'S24-7712', patient: 'Burton, Jean',      diagnosis: 'DCIS high grade, comedo, 11 mm, margins clear',                         date: '2024-10-17', similarity: 79, site: 'Right breast UIQ',    outcome: 'Finalized' },
  ],
  'S26-4406': [
    { id: 'S25-3301', accession: 'S25-3301', patient: 'Harrison, Mary',    diagnosis: 'Invasive carcinoma NST, Grade 2, 2.1 cm, ER+/PR+/HER2-, pN1(1/3)',       date: '2025-08-14', similarity: 82, site: 'Left breast UOQ',    outcome: 'Finalized' },
    { id: 'S24-7809', accession: 'S24-7809', patient: 'Nelson, Patricia',  diagnosis: 'Invasive lobular carcinoma, Grade 2, 2.6 cm, ER+/PR+/HER2-',             date: '2024-11-08', similarity: 74, site: 'Left breast UIQ',    outcome: 'Finalized' },
  ],
  'S26-4407': [
    { id: 'S25-8801', accession: 'S25-8801', patient: 'Sherman, Harold',   diagnosis: 'Rectal adenocarcinoma post-CRT, ypT2N0, Ryan score 2, pMMR',             date: '2025-09-22', similarity: 93, site: 'Rectum',             outcome: 'Finalized' },
    { id: 'S25-3309', accession: 'S25-3309', patient: 'Gibson, Walter',    diagnosis: 'Rectal adenocarcinoma post-CRT, ypT3N1b(2/14), Ryan score 2, MSI-H',    date: '2025-04-15', similarity: 88, site: 'Rectum',             outcome: 'Finalized' },
    { id: 'S24-7809', accession: 'S24-7809', patient: 'Cross, Ralph',      diagnosis: 'Rectal adenocarcinoma post-CRT, ypT0N0 (pCR), Ryan score 0',             date: '2024-08-30', similarity: 79, site: 'Rectum',             outcome: 'Finalized' },
    { id: 'S24-2201', accession: 'S24-2201', patient: 'Hunt, Ernest',      diagnosis: 'Rectal adenocarcinoma post-CRT, ypT3N2b(5/16), Ryan score 3, pMMR',     date: '2024-02-11', similarity: 71, site: 'Rectum',             outcome: 'Finalized' },
  ],
  // ── US Demo — Amber (MPA) ───────────────────────────────────────────────────
  'MPA26-1001-BR': [
    { id: 'MPA25-4401', accession: 'MPA25-4401', patient: 'Jensen, Carol',     diagnosis: 'Invasive carcinoma NST, Grade 2, 2.0 cm, ER+/PR+/HER2 2+ FISH neg, pN1(1/3), LVI+', date: '2025-09-14', similarity: 95, site: 'Left breast 12 o\'clock', outcome: 'Finalized' },
    { id: 'MPA25-1882', accession: 'MPA25-1882', patient: 'Kowalski, Ruth',    diagnosis: 'Invasive carcinoma NST, Grade 2, 1.7 cm, ER+/PR+/HER2-, pN0, margin 0.1 cm anterior', date: '2025-04-22', similarity: 91, site: 'Left breast',            outcome: 'Finalized' },
    { id: 'MPA24-8801', accession: 'MPA24-8801', patient: 'Brennan, Helen',    diagnosis: 'Invasive carcinoma NST, Grade 2, 2.2 cm, ER+/PR+/HER2 2+ FISH pos, pN1(2/4)',       date: '2024-11-08', similarity: 86, site: 'Left breast UOQ',          outcome: 'Finalized' },
    { id: 'MPA24-3301', accession: 'MPA24-3301', patient: 'Patel, Sunita',     diagnosis: 'Invasive carcinoma NST, Grade 1, 1.5 cm, ER+/PR+/HER2-, pN0, all margins >2 mm',    date: '2024-06-19', similarity: 80, site: 'Left breast',            outcome: 'Finalized' },
    { id: 'MPA23-9103', accession: 'MPA23-9103', patient: 'Torres, Maria',     diagnosis: 'Invasive lobular carcinoma, Grade 2, 2.4 cm, ER+/PR+/HER2-, pN1(1/2)',              date: '2023-12-01', similarity: 73, site: 'Left breast UIQ',          outcome: 'Finalized' },
  ],
  'MPA26-1002-CR': [
    { id: 'MPA25-8801', accession: 'MPA25-8801', patient: 'Kowalczyk, Peter',  diagnosis: 'Rectal adenocarcinoma post-CRT, ypT3N0, Ryan grade 2 (moderate response), pMMR, KRAS wt', date: '2025-10-22', similarity: 94, site: 'Rectosigmoid',  outcome: 'Finalized' },
    { id: 'MPA25-3309', accession: 'MPA25-3309', patient: 'Nowak, Richard',    diagnosis: 'Rectal adenocarcinoma post-CRT, ypT2N0, Ryan grade 1, pMMR, KRAS G12D',             date: '2025-05-15', similarity: 89, site: 'Rectum',              outcome: 'Finalized' },
    { id: 'MPA24-7712', accession: 'MPA24-7712', patient: 'Grabowski, Frank',  diagnosis: 'Rectal adenocarcinoma post-CRT, ypT3N1b(2/16), Ryan grade 2, pMMR, BRAF wt',        date: '2024-09-03', similarity: 82, site: 'Rectosigmoid',          outcome: 'Finalized' },
    { id: 'MPA24-2201', accession: 'MPA24-2201', patient: 'Wisniewski, Carl',  diagnosis: 'Rectal adenocarcinoma post-CRT, ypT0N0 (pCR), Ryan grade 0, pMMR',                   date: '2024-03-11', similarity: 74, site: 'Rectum',              outcome: 'Finalized' },
    { id: 'MPA23-8814', accession: 'MPA23-8814', patient: 'Kaminski, Robert',  diagnosis: 'Rectal adenocarcinoma post-CRT, ypT3N2b(4/18), Ryan grade 3, pMMR, KRAS G12V',       date: '2023-08-20', similarity: 66, site: 'Rectum',              outcome: 'Finalized' },
  ],
  'MPA26-1003-PRO': [
    { id: 'MPA25-6601', accession: 'MPA25-6601', patient: 'Mueller, Thomas',   diagnosis: 'Acinar adenocarcinoma, Gleason 3+4=7 (GG2), pT3a, EPE focal, margin+ 1 mm, pN0',    date: '2025-11-02', similarity: 97, site: 'Prostate right posterior', outcome: 'Finalized' },
    { id: 'MPA25-3318', accession: 'MPA25-3318', patient: 'Hoffman, David',    diagnosis: 'Acinar adenocarcinoma, Gleason 3+4=7 (GG2), pT2c, margins clear, pN0(0/12)',         date: '2025-07-19', similarity: 91, site: 'Prostate bilateral',      outcome: 'Finalized' },
    { id: 'MPA24-9912', accession: 'MPA24-9912', patient: 'Schultz, Michael',  diagnosis: 'Acinar adenocarcinoma, Gleason 4+3=7 (GG3), pT3a, EPE extensive, SVI absent, pN0',  date: '2024-09-30', similarity: 84, site: 'Prostate bilateral',      outcome: 'Finalized' },
    { id: 'MPA24-5514', accession: 'MPA24-5514', patient: 'Fischer, Gary',     diagnosis: 'Acinar adenocarcinoma, Gleason 3+4=7 (GG2), pT3a, margin+ 2 mm, pN1(1/14)',         date: '2024-05-14', similarity: 77, site: 'Prostate right',          outcome: 'Amended'   },
    { id: 'MPA23-8801', accession: 'MPA23-8801', patient: 'Wagner, Kenneth',   diagnosis: 'Acinar adenocarcinoma, Gleason 3+3=6 (GG1), pT2b, all margins clear, pN0(0/9)',     date: '2023-10-07', similarity: 69, site: 'Prostate right',          outcome: 'Finalized' },
  ],

  // ── US Demo — Tuthill (HFHS) ─────────────────────────────────────────────────
  'HFHS26-1004-LU': [
    { id: 'HFHS25-5501', accession: 'HFHS25-5501', patient: 'Kowalski, James', diagnosis: 'Adenocarcinoma RUL, acinar predominant, pT2a pN0, EGFR exon 19 del, PD-L1 28%',    date: '2025-10-05', similarity: 96, site: 'Right upper lobe',  outcome: 'Finalized' },
    { id: 'HFHS25-2219', accession: 'HFHS25-2219', patient: 'Petrovich, Ann',  diagnosis: 'Adenocarcinoma LUL, acinar/lepidic, pT1c pN0, EGFR exon 21 L858R, PD-L1 10%',      date: '2025-06-11', similarity: 89, site: 'Left upper lobe',   outcome: 'Finalized' },
    { id: 'HFHS24-8802', accession: 'HFHS24-8802', patient: 'Ostrowski, Paul', diagnosis: 'Adenocarcinoma RUL, acinar predominant, pT2b pN1, KRAS G12C, PD-L1 45%',           date: '2024-12-20', similarity: 82, site: 'Right upper lobe',  outcome: 'Finalized' },
    { id: 'HFHS24-3318', accession: 'HFHS24-3318', patient: 'Grabowski, Sue',  diagnosis: 'Adenocarcinoma RUL, papillary predominant, pT2a pN0, EGFR exon 19 del, PL1',        date: '2024-07-08', similarity: 75, site: 'Right upper lobe',  outcome: 'Finalized' },
    { id: 'HFHS23-7741', accession: 'HFHS23-7741', patient: 'Malinowski, Ed',  diagnosis: 'Adenocarcinoma RUL, solid predominant, pT3 pN2, PD-L1 65%, no targetable mutation', date: '2023-11-14', similarity: 67, site: 'Right upper lobe',  outcome: 'Finalized' },
  ],

  'S26-4408': [
    { id: 'S25-7701', accession: 'S25-7701', patient: 'Holt, Virginia',    diagnosis: 'Invasive carcinoma NST, Grade 3, 2.4 cm, ER-/PR-/HER2 3+, pN0, BRCA1+', date: '2025-10-11', similarity: 96, site: 'Right breast',        outcome: 'Finalized' },
    { id: 'S25-4410', accession: 'S25-4410', patient: 'Warren, Dorothy',   diagnosis: 'Invasive carcinoma NST, Grade 3, 1.9 cm, ER-/PR-/HER2 3+, pN1(2/15)',   date: '2025-06-28', similarity: 91, site: 'Left breast',         outcome: 'Finalized' },
    { id: 'S24-9801', accession: 'S24-9801', patient: 'Fowler, Evelyn',    diagnosis: 'Invasive carcinoma NST, Grade 3, 3.3 cm, ER-/PR-/HER2 3+, pN2, BRCA2+', date: '2024-11-14', similarity: 85, site: 'Left breast UIQ',    outcome: 'Amended'   },
    { id: 'S24-3309', accession: 'S24-3309', patient: 'Hawkins, Mildred',  diagnosis: 'Invasive carcinoma NST, Grade 3, 2.8 cm, ER+/PR-/HER2 3+, pN1(1/8)',    date: '2024-05-03', similarity: 77, site: 'Right breast',        outcome: 'Finalized' },
  ],
};

const DEFAULT_HISTORY = 'No prior pathology cases on record for this patient.';
const DEFAULT_SIMILAR: SimilarCase[] = [];

export function getSimilarCases(caseId: string): SimilarCase[] {
  return mockSimilarCasesMap[caseId] ?? DEFAULT_SIMILAR;
}
export function getPatientHistory(caseId: string): string {
  return mockPatientHistoryMap[caseId] ?? DEFAULT_HISTORY;
}

// Legacy static exports
export const mockSimilarCases = mockSimilarCasesMap['S26-4401'] ?? [];
export const mockPatientHistory = mockPatientHistoryMap['S26-4401'] ?? DEFAULT_HISTORY;


// ─── Persisted case store ─────────────────────────────────────────────────────
// Version bump here forces a re-seed whenever mock data changes structurally.
// Increment MOCK_VERSION whenever MOCK_CASES fields are added/changed.
const MOCK_VERSION = '45'; // bumped: real, new Northern Ireland demo case (S26-9401) added at the new Lagan Valley Women's Health Centre facility (c-ni-lagan-valley) — real reflex-triggered pathway.
const VERSION_KEY  = 'pathscribe_mock_cases_version';

const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== MOCK_VERSION) {
  // Stale data — wipe and re-seed from MOCK_CASES
  localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
  localStorage.setItem(VERSION_KEY, MOCK_VERSION);
}

const stored = localStorage.getItem('pathscribe_mock_' + STORAGE_KEY);
let CASES: Case[] = stored ? JSON.parse(stored) : null;
if (!CASES) {
  CASES = JSON.parse(JSON.stringify(MOCK_CASES));
  storageSet(STORAGE_KEY, CASES);
}

// ─── AI Suggestion Generator ─────────────────────────────────────────────────
// Called when a template is first attached to a case (no prior aiSuggestions).
// Uses the Anthropic API to analyse the gross/micro/ancillary text and return
// field-level suggestions with confidence scores and source citations.

export async function generateAiSuggestionsForReport(
  caseData: Case,
  templateId: string,
  templateFields: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>,
  computationalResults?: Record<string, Record<string, string | number | boolean | null>>
): Promise<Record<string, { value: string | string[]; confidence: number; source: string; verification: 'unverified' }>> {
  const fieldList = templateFields.map(f => {
    const opts = f.options?.map(o => `${o.id} (${o.label})`).join(', ');
    return opts ? `- ${f.id} | ${f.label} | options: [${opts}]` : `- ${f.id} | ${f.label} | free text`;
  }).join('\n');

  // Format discrete computational results for the prompt when available.
  // These are higher-fidelity signals than the narrative ancillary text —
  // the AI should prefer them when they conflict with narrative.
  const computationalSection = computationalResults && Object.keys(computationalResults).length > 0
    ? '\n\nCOMPUTATIONAL RESULTS (discrete, authoritative — prefer over narrative when present):\n' +
      Object.entries(computationalResults)
        .map(([assay, data]) => {
          const fields = Object.entries(data)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n');
          return `${assay}:\n${fields}`;
        })
        .join('\n\n')
    : '';

  const prompt = `You are a pathology AI assistant. Analyse the following pathology case data and suggest answers for each synoptic field.

TEMPLATE: ${templateId}
CASE ID: ${caseData.id}
GROSS DESCRIPTION: ${caseData.diagnostic?.grossDescription ?? '—'}
MICROSCOPIC DESCRIPTION: ${caseData.diagnostic?.microscopicDescription ?? '—'}
ANCILLARY STUDIES: ${caseData.diagnostic?.ancillaryStudies ?? '—'}${computationalSection}

SYNOPTIC FIELDS (id | label | allowed option ids):
${fieldList}

Return ONLY a JSON object (no markdown, no preamble) with this exact structure for every field you can answer:
{
  "field_id": {
    "value": "option_id_or_free_text_string",
    "confidence": 85,
    "source": "Short quote from the case text that supports this answer"
  }
}

Rules:
- value must be an option id (not the label) when options are listed, or a plain string for free text
- For checkboxes/multi-select fields, value may be an array of option ids
- confidence is 0–100 based on how clearly the text supports the answer
- source MUST be an exact, verbatim substring copied directly from the gross/micro/ancillary/computational text above — not a paraphrase, not a reworded summary. The pathologist-facing UI highlights this exact string inside the original text; a paraphrase will not be found and will silently fail to highlight anything. Keep it short (≤12 words) but character-for-character exact.
- Only include fields you can answer with reasonable confidence (≥30)
- Do NOT invent findings not present in the text`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      configOverride: await resolveAiConfigOverrideForClient(caseData.order?.facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Stamp every field with verification: 'unverified'
    const result: Record<string, any> = {};
    for (const [fieldId, sug] of Object.entries(parsed) as any) {
      result[fieldId] = { ...sug, verification: 'unverified' };
    }
    return result;
  } catch (e) {
    console.error('[PathScribe] AI suggestion generation failed:', e);
    return {};
  }
}

// ─── evaluateSynopticAssignment ──────────────────────────────────────────────
// Orchestration Stage 1/2: evaluates whether each specimen's currently-
// assigned diagnostic Synoptic Template(s) still fit the case, given
// clinical text and (where available) structured Grossing answers. Same
// real pattern as generateAiSuggestionsForReport directly above — calls
// callAi() directly, not IAIIntegrationService (see the note on that
// interface's matching method for why). Types imported from there
// type-only purely to avoid duplicating the shape.
//
// Returns ProtocolChange[] via the action field ('replace'|'add'|'remove')
// — never mutates case data directly. Caller is responsible for routing
// the result through the existing Protocol Change Review modal /
// handleProtoCommit for pathologist accept/reject, same as every other
// AI suggestion in this system.

export async function evaluateSynopticAssignment(
  input: SynopticEvaluationInput
): Promise<SynopticEvaluationResult> {
  const warnings: string[] = [];

  if (input.availableTemplates.length === 0) {
    warnings.push('No candidate Synoptic Templates were provided — cannot propose add/replace changes without real template IDs to ground against. Returning no changes.');
    return { changes: [], warnings };
  }

  const templateList = input.availableTemplates
    .map(t => `- ${t.id} | ${t.name} | category: ${t.category}`)
    .join('\n');

  const specimenBlocks = input.specimens.map(spec => {
    const currentLines = spec.currentSynoptics.length
      ? spec.currentSynoptics.map(s => `  - templateId: ${s.templateId} (${s.templateName}), instanceId: ${s.instanceId}`).join('\n')
      : '  (none currently assigned)';

    const grossingLines = spec.grossingAnswers?.length
      ? spec.grossingAnswers.map(a => `  - ${a.fieldLabel}: ${a.displayValue}`).join('\n')
      : '  (no structured Grossing answers available for this specimen)';

    return `SPECIMEN ${spec.specimenId} (${spec.specimenLabel}): ${spec.specimenDesc}
  Currently assigned diagnostic synoptic(s):
${currentLines}
  Structured Grossing answers for this specimen:
${grossingLines}`;
  }).join('\n\n');

  const prompt = `You are a pathology AI assistant evaluating whether each specimen's currently-assigned diagnostic Synoptic Template still fits the case findings.

CASE-LEVEL TEXT:
GROSS DESCRIPTION: ${input.caseText.gross || '—'}
MICROSCOPIC DESCRIPTION: ${input.caseText.microscopic || '—'}
ANCILLARY STUDIES: ${input.caseText.ancillary || '—'}

${specimenBlocks}

CANDIDATE SYNOPTIC TEMPLATES (use ONLY these IDs for currentTemplateId/proposedTemplateId — never invent an ID not in this list):
${templateList}

For each specimen, decide one of:
- "replace": findings suggest a DIFFERENT template than currently assigned
- "add": findings suggest a template is needed but none is currently assigned
- "remove": a currently-assigned template is no longer appropriate
- Omit the specimen entirely if its current assignment still fits — do not propose a change just to have one.

Return ONLY a JSON array (no markdown, no preamble) of proposed changes, each shaped exactly as:
[
  {
    "specimenId": "...",
    "action": "replace" | "add" | "remove",
    "currentInstanceId": "...",
    "currentTemplateId": "...",
    "proposedTemplateId": "...",
    "reason": "short clinical justification, referencing the specific finding",
    "confidence": 0-100
  }
]
Omit currentInstanceId/currentTemplateId for "add" (nothing currently exists). Omit proposedTemplateId for "remove" (nothing replaces it).

Rules:
- Only propose a change when there is clear textual or structured-answer support — do not invent findings.
- Do not return confidence below 50.
- proposedTemplateId and currentTemplateId MUST be one of the candidate IDs listed above, exactly as written.
- If no specimen needs a change, return an empty array: []`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      configOverride: await resolveAiConfigOverrideForClient(input.facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Array<{
      specimenId: string;
      action: 'replace' | 'add' | 'remove';
      currentInstanceId?: string;
      currentTemplateId?: string;
      proposedTemplateId?: string;
      reason: string;
      confidence: number;
    }>;

    const templateNameById = new Map(input.availableTemplates.map(t => [t.id, t.name]));

    const changes = parsed
      // Defensive filter — drop anything referencing a template ID we
      // didn't actually offer, rather than trusting the model followed
      // the instruction. Same "don't trust, verify" posture as every
      // other AI-output path in this app.
      .filter(c => {
        const proposedValid = !c.proposedTemplateId || templateNameById.has(c.proposedTemplateId);
        const currentValid  = !c.currentTemplateId  || templateNameById.has(c.currentTemplateId);
        if (!proposedValid || !currentValid) {
          warnings.push(`Dropped a proposed change for specimen ${c.specimenId} — referenced a template ID not in the candidate list`);
          return false;
        }
        return true;
      })
      .map((c, idx): ProtocolChange => {
        const spec = input.specimens.find(s => s.specimenId === c.specimenId);
        const currentMatch = spec?.currentSynoptics.find(
          cs => cs.instanceId === c.currentInstanceId || cs.templateId === c.currentTemplateId
        );
        return {
          id:                    `ai-eval-${Date.now()}-${idx}`,
          specimenId:            c.specimenId,
          specimenLabel:         spec?.specimenLabel ?? c.specimenId,
          specimenDesc:          spec?.specimenDesc ?? '',
          action:                c.action,
          currentInstanceId:     currentMatch?.instanceId,
          currentTemplateId:     c.currentTemplateId,
          currentTemplateName:   currentMatch?.templateName ?? (c.currentTemplateId ? templateNameById.get(c.currentTemplateId) : undefined),
          proposedTemplateId:    c.proposedTemplateId,
          proposedTemplateName:  c.proposedTemplateId ? templateNameById.get(c.proposedTemplateId) : undefined,
          reason:                c.reason,
          confidence:            c.confidence,
        };
      });

    return { changes, warnings };
  } catch (e) {
    console.error('[PathScribe] Synoptic assignment evaluation failed:', e);
    warnings.push(`Synoptic assignment evaluation failed (${(e as Error)?.message ?? 'unknown error'}) — no changes proposed`);
    return { changes: [], warnings };
  }
}

// ─── generateGrossingFieldSuggestionsFromDictation ───────────────────────────
// Real feature, per direct request: "Once I select Gross complete that
// should also trigger the AI to fill in the Gross synoptic form for each
// specimen... This could be challenging because the AI would need to
// determine what specimen the PA is describing."
//
// A PA who dictates the Gross directly (the free-text Report Draft path,
// not the structured Grossing template) writes ONE case-wide narrative
// that may describe several specimens together in a single continuous
// block of prose — there's no per-specimen boundary marker in the text
// itself. Solves the same specimen-attribution problem
// evaluateSynopticAssignment already solves for template-fit evaluation,
// the same way: give the AI each specimen's own label/description as an
// anchor block, in the same prompt as the shared dictated text, and let
// it attribute the right portion of the narrative to the right specimen
// using that anchor — rather than trying to mechanically split the text
// first (fragile — real dictation rarely has a clean per-specimen
// delimiter) or calling the AI once per specimen (loses the surrounding
// context of the other specimens, which often disambiguates "the second
// lesion" / "the other, larger fragment" type phrasing).
//
// Output shape matches generateAiSuggestionsForReport exactly (value/
// confidence/source/verification), just keyed one level deeper by
// specimenId first — so the caller can drop each specimen's suggestions
// straight into that grossingReport's aiSuggestions, and the existing
// AI-suggestion UI (confidence badges, Confirm/Override, the hard-block
// verification gate) needs no changes at all to display and gate these
// exactly like any other AI suggestion in this app. Suggestions are
// never auto-committed as answers — same "propose, don't decide"
// posture as every other AI path here; a PA still explicitly confirms
// or overrides each one, and any field the AI couldn't confidently
// answer is left for the PA to fill in directly, same as it already
// would be for a blank field with no AI involvement at all.

export interface GrossingDictationSuggestionSpecimen {
  specimenId: string;
  specimenLabel: string;
  specimenDesc: string;
  /** This specimen's Grossing template fields — id/label/options, same
   *  shape generateAiSuggestionsForReport already takes for a single
   *  template, since each specimen's Grossing template can genuinely
   *  differ (Route A/B/C in this app's own seed data). */
  fields: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>;
}

export async function generateGrossingFieldSuggestionsFromDictation(
  dictatedGrossText: string,
  specimens: GrossingDictationSuggestionSpecimen[],
  facilityId?: string,
): Promise<Record<string, Record<string, { value: string | string[]; confidence: number; source: string; verification: 'unverified' }>>> {
  if (!dictatedGrossText.trim() || specimens.length === 0) return {};

  const specimenBlocks = specimens.map(spec => {
    const fieldList = spec.fields.map(f => {
      const opts = f.options?.map(o => `${o.id} (${o.label})`).join(', ');
      return opts ? `  - ${f.id} | ${f.label} | options: [${opts}]` : `  - ${f.id} | ${f.label} | free text`;
    }).join('\n');
    return `SPECIMEN ${spec.specimenId} (${spec.specimenLabel}): ${spec.specimenDesc}
Grossing fields to fill for this specimen:
${fieldList}`;
  }).join('\n\n');

  const prompt = `You are a pathology AI assistant. A pathologist's assistant dictated the following Gross Description covering one or more specimens together in a single narrative. Read it carefully and, for each specimen listed below, extract answers for that specimen's own Grossing fields — using the specimen's label and description to identify which part of the narrative belongs to it.

DICTATED GROSS DESCRIPTION (case-wide, may cover multiple specimens):
${dictatedGrossText}

${specimenBlocks}

Return ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "specimen_id": {
    "field_id": {
      "value": "option_id_or_free_text_string",
      "confidence": 85,
      "source": "Exact verbatim substring from the dictated text above"
    }
  }
}

Rules:
- Only include a specimen if the dictated text actually describes it — omit specimens the text doesn't mention.
- value must be an option id (not the label) when options are listed, or a plain string for free text.
- For checkboxes/multi-select fields, value may be an array of option ids.
- confidence is 0-100 based on how clearly the text supports the answer for THIS specimen specifically — a detail that could belong to more than one specimen should get a lower confidence, not be guessed at full confidence.
- source MUST be an exact, verbatim substring copied directly from the dictated text above — not a paraphrase. The pathologist-facing UI highlights this exact string inside the original dictation; a paraphrase will not be found and will silently fail to highlight anything. Keep it short (≤12 words) but character-for-character exact.
- Only include fields you can answer with reasonable confidence (≥30).
- Do NOT invent findings not present in the text.
- If the dictated text doesn't clearly distinguish which specimen a detail belongs to, do not guess — omit that field rather than risk misattributing it to the wrong specimen.`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      // Real fix, found via a live JSON-parse failure at the default
      // limit: this response can cover multiple specimens' full field
      // sets in one JSON object (this app's own Grossing templates run
      // to ~20 fields each), easily exceeding callAi()'s 1000-token
      // default and getting truncated mid-object. 4096 comfortably
      // covers several specimens' worth of fields; still bounded, not
      // unlimited.
      maxTokens: 4096,
      configOverride: await resolveAiConfigOverrideForClient(facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const validSpecimenIds = new Set(specimens.map(s => s.specimenId));
    const result: Record<string, Record<string, any>> = {};
    for (const [specimenId, fields] of Object.entries(parsed) as any) {
      // Defensive filter — same "don't trust, verify" posture as
      // evaluateSynopticAssignment: drop anything referencing a
      // specimen we didn't actually offer, rather than trusting the
      // model followed the instruction.
      if (!validSpecimenIds.has(specimenId)) continue;
      const stamped: Record<string, any> = {};
      for (const [fieldId, sug] of Object.entries(fields as any)) {
        stamped[fieldId] = { ...(sug as any), verification: 'unverified' };
      }
      result[specimenId] = stamped;
    }
    return result;
  } catch (e) {
    console.error('[PathScribe] Grossing dictation suggestion generation failed:', e);
    return {};
  }
}

// ─── evaluateGrossingTemplateAssignment ──────────────────────────────────────
// Orchestration Stage 0: at accession, evaluates each specimen and assigns
// the most appropriate Grossing Template (Route A/B/C). Follows
// evaluateSynopticAssignment()'s exact pattern directly above — builds a
// prompt, calls callAi(), parses into a typed result, defensively drops
// any templateId the model invents that wasn't in the candidate list.
//
// Fail-open per S0-FR-05: if the AI call throws, OR a specimen's chosen
// template comes back below confidenceThreshold (default 60), that
// specimen falls back to DEFAULT_GROSSING_TEMPLATE_ID rather than being
// left with no assignment at all — a PA with a conservative default
// template is a better outcome than a PA with nothing to work from.
//
// Returns GrossingTemplateAssignment[] via GrossingEvaluationResult —
// never creates GrossingReportInstance objects itself. Caller (the future
// accession-time call site / Accession page) is responsible for turning
// each assignment into a GrossingReportInstance with status 'draft', same
// division of responsibility as evaluateSynopticAssignment vs.
// handleGrossComplete.

const DEFAULT_GROSSING_TEMPLATE_ID = 'grossing_standard_tissue';
const DEFAULT_GROSSING_CONFIDENCE_THRESHOLD = 60;

export async function evaluateGrossingTemplateAssignment(
  input: GrossingEvaluationInput
): Promise<GrossingEvaluationResult> {
  const warnings: string[] = [];
  const threshold = input.confidenceThreshold ?? DEFAULT_GROSSING_CONFIDENCE_THRESHOLD;
  const templateNameById = new Map(input.availableTemplates.map(t => [t.id, t.name]));

  const fallback = (specimenId: string, reasonSuffix: string): GrossingTemplateAssignment => ({
    specimenId,
    templateId: DEFAULT_GROSSING_TEMPLATE_ID,
    templateName: templateNameById.get(DEFAULT_GROSSING_TEMPLATE_ID) ?? 'Standard Tissue Grossing (Gold Standard) — Route A',
    confidence: 0,
    reason: `Fell back to default Grossing Template — ${reasonSuffix}`,
    belowThreshold: true,
  });

  if (input.availableTemplates.length === 0 || !templateNameById.has(DEFAULT_GROSSING_TEMPLATE_ID)) {
    warnings.push('No candidate Grossing Templates were provided (or the default template ID was not among them) — cannot propose assignments without real template IDs to ground against. Returning no assignments.');
    return { assignments: [], warnings };
  }

  // ── Pass G0: facility-specific overrides bypass the AI entirely (S0-CF-11) ──
  const overriddenSpecimenIds = new Set<string>();
  const overrideAssignments: GrossingTemplateAssignment[] = [];
  const facilityId = input.caseContext?.facilityId;
  if (facilityId && input.routingOverrides?.length) {
    for (const spec of input.specimens) {
      const match = input.routingOverrides.find(
        o => o.facilityId === facilityId && spec.specimenType && o.specimenType === spec.specimenType
      );
      if (match && templateNameById.has(match.grossingTemplateId)) {
        overriddenSpecimenIds.add(spec.specimenId);
        overrideAssignments.push({
          specimenId: spec.specimenId,
          templateId: match.grossingTemplateId,
          templateName: templateNameById.get(match.grossingTemplateId)!,
          confidence: 100,
          reason: `Pass G0 override — facility ${facilityId} always uses this template for specimen type "${match.specimenType}"`,
          fromOverride: true,
        });
      }
    }
  }

  const remainingSpecimens = input.specimens.filter(s => !overriddenSpecimenIds.has(s.specimenId));
  if (remainingSpecimens.length === 0) {
    return { assignments: overrideAssignments, warnings };
  }

  const templateList = input.availableTemplates
    .map(t => `- ${t.id} | ${t.name} | category: ${t.category}`)
    .join('\n');

  const overrideNote = overrideAssignments.length
    ? `\nNOTE: The following specimens already have an administratively forced template via a client override and are NOT in your list below — do not propose anything for them: ${overrideAssignments.map(a => a.specimenId).join(', ')}\n`
    : '';

  const specimenBlocks = remainingSpecimens.map(spec => {
    const detailLines = [
      spec.specimenType ? `  Structured specimen type: ${spec.specimenType}` : null,
      spec.bodySite ? `  Body site: ${spec.bodySite}` : null,
      spec.laterality ? `  Laterality: ${spec.laterality}` : null,
    ].filter(Boolean).join('\n');
    return `SPECIMEN ${spec.specimenId} (${spec.specimenLabel}): ${spec.specimenDesc}${detailLines ? '\n' + detailLines : ''}`;
  }).join('\n\n');

  const prompt = `You are a pathology AI assistant assigning the correct Grossing Template (Route A/B/C) to each specimen at accession time, before any PA has examined the specimen at the bench.

CLINICAL INDICATION: ${input.clinicalIndication || '—'}
${input.caseContext?.patientAge != null ? `PATIENT AGE: ${input.caseContext.patientAge}\n` : ''}${input.caseContext?.caseType ? `CASE TYPE: ${input.caseContext.caseType}\n` : ''}
${specimenBlocks}
${overrideNote}
ROUTE CLASSIFICATION GUIDANCE (clinical reasoning, not rigid rules):
- Route A (grossing_standard_tissue): solid tissue biopsy or resection — will be sectioned, measured, inked, submitted. e.g. core needle biopsy, excisional biopsy, lumpectomy, colectomy, hysterectomy, lobectomy, radical prostatectomy, lymph node dissection, skin excision.
- Route B (grossing_fluid_cytology): fluid, wash, or cytological specimen — processed for cell block/smear, not sectioning. e.g. pleural fluid, peritoneal lavage, BAL, urine cytology, CSF, ascites, pericardial fluid, thyroid FNA, bronchial wash.
- Route C (grossing_histology_only): previously processed specimen needing histology prep only, no grossing steps — minimal PA handling. e.g. outside consultation slides with no block, previously embedded tissue for re-cut/re-stain, decalcified bone already grossed elsewhere, EM specimen.

CANDIDATE GROSSING TEMPLATES (use ONLY these IDs — never invent an ID not in this list):
${templateList}

Return ONLY a JSON array (no markdown, no preamble), one entry per specimen listed above, shaped exactly as:
[
  {
    "specimenId": "...",
    "templateId": "...",
    "reason": "short plain-language justification referencing the specific specimen detail",
    "confidence": 0-100
  }
]

Rules:
- templateId MUST be one of the candidate IDs listed above, exactly as written.
- Every specimen listed above MUST get exactly one entry — do not omit any, do not invent extra specimens.
- If a single specimen plausibly spans more than one Route, pick the Route that matches its PRIMARY handling need and note the ambiguity in "reason" — do not propose multiple templates for one specimen.`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      configOverride: await resolveAiConfigOverrideForClient(input.caseContext?.facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Array<{
      specimenId: string;
      templateId: string;
      reason: string;
      confidence: number;
    }>;

    const bySpecimenId = new Map(parsed.map(p => [p.specimenId, p]));
    const aiAssignments: GrossingTemplateAssignment[] = remainingSpecimens.map(spec => {
      const p = bySpecimenId.get(spec.specimenId);

      if (!p) {
        warnings.push(`AI did not return an assignment for specimen ${spec.specimenId} — fell back to default Grossing Template`);
        return fallback(spec.specimenId, 'no assignment returned by AI');
      }

      if (!templateNameById.has(p.templateId)) {
        warnings.push(`AI proposed templateId "${p.templateId}" for specimen ${spec.specimenId}, which is not in the candidate list — fell back to default Grossing Template`);
        return fallback(spec.specimenId, `invalid template ID "${p.templateId}" returned`);
      }

      if (p.confidence < threshold) {
        warnings.push(`AI assignment for specimen ${spec.specimenId} (${templateNameById.get(p.templateId)}, confidence ${p.confidence}) was below the ${threshold}% threshold — fell back to default Grossing Template. Original AI reasoning: ${p.reason}`);
        return fallback(spec.specimenId, `AI confidence ${p.confidence} below ${threshold}% threshold`);
      }

      return {
        specimenId: spec.specimenId,
        templateId: p.templateId,
        templateName: templateNameById.get(p.templateId)!,
        confidence: p.confidence,
        reason: p.reason,
      };
    });

    return { assignments: [...overrideAssignments, ...aiAssignments], warnings };
  } catch (e) {
    console.error('[PathScribe] Grossing template assignment evaluation failed:', e);
    warnings.push(`Grossing template assignment evaluation failed (${(e as Error)?.message ?? 'unknown error'}) — all remaining specimens fell back to default Grossing Template`);
    const failOpenAssignments = remainingSpecimens.map(spec => fallback(spec.specimenId, 'evaluation call failed'));
    return { assignments: [...overrideAssignments, ...failOpenAssignments], warnings };
  }
}

// ─── evaluateGrossingTemplateFit ──────────────────────────────────────────────
// Real feature, per direct follow-up: "there is kind of a workflow that
// allows the Gross to be dictated and on submission, the AI reads the Text,
// and updates the template. Not sure if there is bearing here." Confirmed
// directly: real bearing — generateGrossingFieldSuggestionsFromDictation
// above already re-populates whatever template's fields it's given from the
// case's real, dictated Gross text. What's genuinely missing is a trigger to
// RE-EVALUATE which Grossing Template fits best now that real dictated text
// exists — evaluateGrossingTemplateAssignment above only ever runs once, at
// accession, before any dictation exists, from a much thinner signal
// (specimen description + clinical indication alone).
//
// Mirrors evaluateSynopticAssignment's own, already-proven Stage 1 pattern
// exactly — same prompt shape, same defensive validation, same real
// ProtocolChange output consumed by the same, already-working
// ProtocolChangeModal.tsx. This is that same real pattern, one stage
// earlier in the pipeline (Grossing Route, not the diagnostic Synoptic).
export async function evaluateGrossingTemplateFit(
  input: GrossingFitEvaluationInput
): Promise<GrossingFitEvaluationResult> {
  const warnings: string[] = [];

  if (input.availableTemplates.length === 0) {
    warnings.push('No candidate Grossing Templates were provided — cannot propose replace changes without real template IDs to ground against. Returning no changes.');
    return { changes: [], warnings };
  }
  if (!input.dictatedGrossText.trim()) {
    // Real, honest no-op — nothing to re-evaluate against. Never guesses
    // from silence.
    return { changes: [], warnings };
  }

  const templateList = input.availableTemplates
    .map(t => `- ${t.id} | ${t.name} | category: ${t.category}`)
    .join('\n');

  const specimenBlocks = input.specimens.map(spec => {
    const currentLine = spec.currentGrossingTemplate
      ? `  - templateId: ${spec.currentGrossingTemplate.templateId} (${spec.currentGrossingTemplate.templateName}), instanceId: ${spec.currentGrossingTemplate.instanceId}`
      : '  (no Grossing Template currently assigned)';
    // Real fix, found via live testing: the earlier "SPECIMEN {id}
    // ({label}): {desc}" header line let a real AI response copy the
    // WHOLE header (id + parenthesized label) into the specimenId
    // field of its own JSON reply, rather than just the real id. Now
    // states the real id on its own, explicit "Specimen ID:" line,
    // with the label kept but clearly labeled as separate — genuinely
    // unambiguous which token is the real id to echo back.
    return `SPECIMEN — Specimen ID: ${spec.specimenId} | Label: ${spec.specimenLabel} | Description: ${spec.specimenDesc}\n  Currently assigned Grossing Template:\n${currentLine}`;
  }).join('\n\n');

  const prompt = `You are a pathology AI assistant evaluating whether each specimen's currently-assigned Grossing Template still fits, now that the pathologist's assistant has dictated the real Gross Description.

DICTATED GROSS DESCRIPTION (case-wide, may cover multiple specimens):
${input.dictatedGrossText}

${specimenBlocks}

CANDIDATE GROSSING TEMPLATES (use ONLY these IDs for currentTemplateId/proposedTemplateId — never invent an ID not in this list):
${templateList}

For each specimen, decide one of:
- "replace": the dictated findings suggest a DIFFERENT Grossing Template than currently assigned
- Omit the specimen entirely if its current assignment still fits — do not propose a change just to have one.

Return ONLY a JSON array (no markdown, no preamble) of proposed changes, each shaped exactly as:
[
  {
    "specimenId": "...",
    "action": "replace",
    "currentInstanceId": "...",
    "currentTemplateId": "...",
    "proposedTemplateId": "...",
    "reason": "short clinical justification, referencing the specific dictated finding",
    "confidence": 0-100
  }
]

Rules:
- Only propose a change when the dictated text gives clear support for a different template — do not invent findings.
- Do not return confidence below 50.
- proposedTemplateId and currentTemplateId MUST be one of the candidate IDs listed above, exactly as written.
- specimenId MUST be exactly the real value given after "Specimen ID:" above, character-for-character — never the Label, never a combination of the two.
- If no specimen needs a change, return an empty array: []`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      configOverride: await resolveAiConfigOverrideForClient(input.facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Array<{
      specimenId: string;
      action: 'replace';
      currentInstanceId?: string;
      currentTemplateId?: string;
      proposedTemplateId?: string;
      reason: string;
      confidence: number;
    }>;

    const templateNameById = new Map(input.availableTemplates.map(t => [t.id, t.name]));
    const specimenById = new Map(input.specimens.map(s => [s.specimenId, s]));

    const changes = parsed
      // Same "don't trust, verify" defensive filter as
      // evaluateSynopticAssignment/evaluateGrossingTemplateAssignment —
      // drop anything referencing a template ID we didn't actually offer.
      // Real fix, found via live testing: also validates specimenId
      // itself now — a real AI response was observed echoing back the
      // specimen's Label folded into the id (e.g. "SP-A (A)") despite
      // the prompt listing the real id plainly. The prompt wording was
      // fixed to stop this at the source, but this defensive check
      // means a still-malformed id is dropped with a real, honest
      // warning rather than silently propagating a change no real
      // specimen in this case actually has.
      .filter(c => {
        const proposedValid = !c.proposedTemplateId || templateNameById.has(c.proposedTemplateId);
        const currentValid  = !c.currentTemplateId  || templateNameById.has(c.currentTemplateId);
        const specimenValid = specimenById.has(c.specimenId);
        if (!specimenValid) {
          warnings.push(`Dropped a proposed change — specimenId "${c.specimenId}" doesn't match any real specimen offered`);
          return false;
        }
        if (!proposedValid || !currentValid) {
          warnings.push(`Dropped a proposed change for specimen ${c.specimenId} — referenced a template ID not in the candidate list`);
          return false;
        }
        return true;
      })
      .map((c, idx): ProtocolChange => {
        const spec = input.specimens.find(s => s.specimenId === c.specimenId);
        return {
          id:                    `ai-gross-eval-${Date.now()}-${idx}`,
          specimenId:            c.specimenId,
          specimenLabel:         spec?.specimenLabel ?? c.specimenId,
          specimenDesc:          spec?.specimenDesc ?? '',
          action:                c.action,
          currentInstanceId:     spec?.currentGrossingTemplate?.instanceId ?? c.currentInstanceId,
          currentTemplateId:     c.currentTemplateId,
          currentTemplateName:   spec?.currentGrossingTemplate?.templateName ?? (c.currentTemplateId ? templateNameById.get(c.currentTemplateId) : undefined),
          proposedTemplateId:    c.proposedTemplateId,
          proposedTemplateName:  c.proposedTemplateId ? templateNameById.get(c.proposedTemplateId) : undefined,
          reason:                c.reason,
          confidence:            c.confidence,
        };
      });

    return { changes, warnings };
  } catch (e) {
    console.error('[PathScribe] Grossing template fit evaluation failed:', e);
    warnings.push(`Grossing template fit evaluation failed (${(e as Error)?.message ?? 'unknown error'}) — no changes proposed`);
    return { changes: [], warnings };
  }
}

// ─── Migrate stored cases: backfill aiSuggestions from MOCK_CASES ────────────
// Runs once after load. If a stored synopticReport instance is missing
// aiSuggestions, it copies them from the matching MOCK_CASES entry.
// This is safe to run on every boot — it only fills gaps, never overwrites.
(function migratAiSuggestions() {
  let mutated = false;
  CASES.forEach(storedCase => {
    const mockCase = MOCK_CASES.find(m => m.id === storedCase.id);
    if (!mockCase?.synopticReports) return;
    storedCase.synopticReports?.forEach(storedReport => {
      const mockReport = mockCase.synopticReports!.find(m => m.instanceId === storedReport.instanceId);
      if (mockReport && (mockReport as any).aiSuggestions && !(storedReport as any).aiSuggestions) {
        (storedReport as any).aiSuggestions = (mockReport as any).aiSuggestions;
        mutated = true;
      }
    });
  });
  if (mutated) storageSet(STORAGE_KEY, CASES);
})();

// ─── AI Feedback Logger ──────────────────────────────────────────────────────
// Records every user correction/confirmation so the AI can learn over time.
// In production this would POST to your ML feedback endpoint.
// For now it persists to localStorage so corrections survive refresh and
// can be bulk-exported when a real endpoint is available.

export interface AiFeedbackEntry {
  timestamp: string;
  caseId: string;
  instanceId: string;
  templateId: string;
  fieldId: string;
  fieldLabel: string;
  aiValue: string | string[];
  aiConfidence: number;
  userValue: string | string[];
  action: 'confirmed' | 'overridden' | 'missed';
  source: string;
  /** Who made this call — the one real gap in this otherwise-working
   *  event log. Everything else here (immediate capture at the moment
   *  of interaction, lightweight metadata-only payload, no full text
   *  diff) was already exactly right for a personal "AI Contribution"
   *  telemetry signal; it just had nowhere to attribute the event to a
   *  specific pathologist. Deliberately NOT the same record as
   *  NarrativeEditSignal (services/narrativeSignals) — that one is
   *  intentionally de-identified for aggregate model-evaluation/partner
   *  sharing, and stays that way; this is the separate, user-attributed
   *  signal for a personal dashboard, per that design split. */
  userId?: string;
  userName?: string;
}

const FEEDBACK_KEY = 'pathscribe_ai_feedback';

export function recordAiFeedback(entry: AiFeedbackEntry): void {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const log: AiFeedbackEntry[] = raw ? JSON.parse(raw) : [];
    log.push(entry);
    // Keep last 500 entries to avoid unbounded growth
    if (log.length > 500) log.splice(0, log.length - 500);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(log));
    console.info('[PathScribe AI] Feedback recorded:', entry.action, entry.fieldId,
      entry.action === 'overridden'
        ? `AI said "${entry.aiValue}" → user chose "${entry.userValue}"`
        : `"${entry.aiValue}" confirmed`
    );
  } catch (e) {
    console.error('[PathScribe AI] Failed to record feedback', e);
  }
}

/** Read side for the log recordAiFeedback writes — this already existed
 *  (confirmed before assuming otherwise); it was the userId attribution
 *  and the call sites that were missing, not this function. */
export function getAiFeedbackLog(): AiFeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ─── Persist updated aiSuggestions for a single report instance ──────────────
// Called after every field change so override/confirmed state is durable.
export async function saveReportSuggestions(
  caseId: string,
  instanceId: string,
  suggestions: Record<string, import('../../types/case/Case').AiFieldSuggestion>
): Promise<void> {
  const c = CASES.find(x => x.id === caseId);
  if (!c) return;
  const report = c.synopticReports?.find(r => r.instanceId === instanceId);
  if (!report) return;
  (report as any).aiSuggestions = suggestions;
  report.updatedAt = new Date().toISOString();
  storageSet(STORAGE_KEY, CASES);
}

// ─── Service ──────────────────────────────────────────────────────────────────

// ─── Delegation & Pool Claim Functions ───────────────────────────────────────

const CLAIM_TTL_MS        = 30_000;
const DELEGATION_STORE_KEY = 'ps_delegations_v1';

// Real fix: zero seed delegation data existed anywhere (loadDelegations
// fell back to an empty array) - meant CONSULTATION_RESPONSE/
// CONSULTATION_AWAITING (components/Contribution/qualityCalculations.ts)
// would show genuinely empty results for a fresh demo, same as every
// other TAT type before its own seed-data fix tonight. References real,
// existing case IDs (the same ten enriched earlier for lifecycle
// timestamps) and real seeded pathologist user IDs - not fabricated
// ones. Genuine mix: some completed late (real CONSULTATION_RESPONSE
// breaches), one completed on time (not a breach), some still pending
// past target (real CONSULTATION_AWAITING breaches).
const DELEGATION_SEED: DelegationRecord[] = [
  // Informal reviews asked OF PATH-001 (Pete) - CONSULTATION_RESPONSE
  { id: 'deleg-seed-1', caseId: 'S26-4401-BX-001', fromUserId: '1', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', note: 'Can you eyeball the margin call on this one?',
    timestamp: '2026-07-20T09:00:00.000Z', status: 'completed', completedAt: '2026-07-22T15:00:00.000Z' }, // 54h, real breach
  { id: 'deleg-seed-2', caseId: 'S26-4404', fromUserId: '6', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', note: 'Second set of eyes on the mitotic count?',
    timestamp: '2026-07-25T10:00:00.000Z', status: 'completed', completedAt: '2026-07-25T20:00:00.000Z' }, // 10h, on time
  { id: 'deleg-seed-3', caseId: 'S26-4407', fromUserId: '7', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', timestamp: '2026-07-18T08:00:00.000Z',
    status: 'completed', completedAt: '2026-07-21T08:00:00.000Z' }, // 72h, real breach
  // Informal reviews asked BY PATH-001 (Pete), still awaiting - CONSULTATION_AWAITING
  { id: 'deleg-seed-4', caseId: 'S26-4405', fromUserId: 'PATH-001', toUserId: '9',
    delegationType: 'CASUAL_REVIEW', note: 'Curious if you agree on the grade here.',
    timestamp: '2026-07-15T09:00:00.000Z', status: 'pending' }, // real, still-ongoing wait
  { id: 'deleg-seed-5', caseId: 'S26-4408', fromUserId: 'PATH-001', toUserId: '1',
    delegationType: 'CASUAL_REVIEW', timestamp: '2026-07-28T09:00:00.000Z', status: 'pending' },
];

function loadDelegations(): DelegationRecord[] {
  try {
    const raw = localStorage.getItem(DELEGATION_STORE_KEY);
    return raw ? JSON.parse(raw) : DELEGATION_SEED;
  } catch { return DELEGATION_SEED; }
}
const CLAIM_STORE_KEY      = 'ps_claims_v1';

export interface ClaimResult {
  success: boolean;
  claimedBy?: string;
  error?: string;
}

export interface DelegationRecord {
  id: string;
  caseId: string;
  fromUserId: string;
  toUserId?: string;
  toPoolId?: string;
  toPoolName?: string;
  delegationType: string;
  note?: string;
  timestamp: string;
  status: 'pending' | 'accepted' | 'passed' | 'completed';
  /** Real fix: status alone was never actually transitioned anywhere in
   *  this codebase - every delegation ever created stayed 'pending'
   *  forever, which silently broke WorklistPage.tsx's existing
   *  "delegated to me" count (it could only ever grow, never shrink,
   *  even after someone genuinely responded). Also needed, separately,
   *  for real CONSULTATION_RESPONSE/CONSULTATION_AWAITING TAT
   *  calculation (components/Contribution/qualityCalculations.ts) -
   *  timestamp above is the request moment; this is the real completion
   *  moment, set once at completeDelegation. */
  completedAt?: string;
}

function saveDelegations(records: DelegationRecord[]): void {
  try { localStorage.setItem(DELEGATION_STORE_KEY, JSON.stringify(records)); } catch {}
}
function loadClaims(): Record<string, { userId: string; expiresAt: number }> {
  try { return JSON.parse(localStorage.getItem(CLAIM_STORE_KEY) ?? '{}'); } catch { return {}; }
}
function saveClaims(claims: Record<string, { userId: string; expiresAt: number }>): void {
  try { localStorage.setItem(CLAIM_STORE_KEY, JSON.stringify(claims)); } catch {}
}

/** Attempt to claim a pool case before showing accept/pass prompt */
// canUserClaimPoolCase — real membership check for pool claiming.
// Mirrors caseAccessControl.ts's dimension 3 (pool/subspecialty) reasoning:
// gated behind isWorkgroupEnabled so this is backward-compatible by
// default. A poolId that isn't a real Subspecialty record (e.g. the
// 'general' fallback pool string) is treated as unrestricted, same as
// a subspecialty with the restriction gate off.
// Real, critical fix, per direct product review: this function's own
// lookup — mockSubspecialtyService.getById(poolId) — silently failed
// for every real, seeded pool case in this app. Case data's own poolId
// field uses ad-hoc values ('GI-UK', 'URO-UK', 'GYN-MPA', plain
// numeric strings) that never match any real Subspecialty record's own
// id ('gi', 'uro', 'gyn', ...) — only poolName ('Gastrointestinal')
// ever did. getById() found nothing, silently fell through the
// "unrecognized pool — allow" branch below, and every pool-membership
// check in the entire app passed regardless of actual membership. The
// worklist's own display layer (computeRestrictedPoolKeys) already
// matches by EITHER a subspecialty's id OR its name for exactly this
// reason; this function now does the same, checking both real
// identifiers this case data might carry rather than just one.
export async function canUserClaimPoolCase(
  poolId: string | undefined,
  userId: string,
  poolName?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!poolId && !poolName) return { allowed: true };
  const allResult = await mockSubspecialtyService.getAll();
  if (!allResult.ok) return { allowed: true };
  const sub = allResult.data.find(s =>
    (poolId && (s.id === poolId || s.name === poolId)) ||
    (poolName && (s.id === poolName || s.name === poolName))
  );
  if (!sub) return { allowed: true };
  if (!sub.isWorkgroupEnabled) return { allowed: true };
  const isMember = (sub.userIds ?? []).includes(userId);
  if (!isMember) return { allowed: false, reason: `Not a member of the ${sub.name} pool` };
  return { allowed: true };
}

export async function claimPoolCase(caseId: string, userId: string): Promise<ClaimResult> {
  await delay(200);
  const claims = loadClaims();
  const existing = claims[caseId];
  if (existing && existing.expiresAt > Date.now() && existing.userId !== userId) {
    return { success: false, claimedBy: existing.userId, error: 'Case is being claimed by another pathologist' };
  }

  const caseData = await getCaseAnyMode(caseId);
  const membership = await canUserClaimPoolCase((caseData as any)?.poolId, userId, (caseData as any)?.poolName);
  if (!membership.allowed) {
    return { success: false, error: membership.reason };
  }

  claims[caseId] = { userId, expiresAt: Date.now() + CLAIM_TTL_MS };
  saveClaims(claims);
  return { success: true };
}

// Dispatch helpers — mirror CaseRouter's own 'O26-' prefix rule, duplicated
// here rather than importing caseRouter: CaseRouter.ts already imports
// mockCaseService, so importing caseRouter back here would create a
// circular import. This means delegation/pool-claim actions don't produce
// CaseRouter's own case.write audit-log entries the way ordinary case
// edits do — DelegationRecord (below) is this flow's own audit trail, and
// that split isn't new here, it's how delegateCase already worked before
// this change; just noting the boundary explicitly.
//
// isOrchCaseId() itself used to be a second, independently-hardcoded copy
// of the same 'O26-' check right here (kept local specifically to dodge
// the circular-import risk above) — now imported from
// reportingModeRouting.ts instead, which has no imports of its own at
// all, so it can't create that cycle either way. Same real drift risk
// this whole change closes, just found in one more place.

async function getCaseAnyMode(caseId: string): Promise<Case | undefined> {
  if (isOrchCaseId(caseId)) return mockOrchestratorCaseService.getCase(caseId);
  return CASES.find((c: any) => c.id === caseId);
}

// Real, direct follow-up (PS-71): this used to silently drop expectedVersion
// on the Orchestration-mode path — mockOrchestratorCaseService.updateCase()
// independently implements the identical ConcurrencyConflictError mechanism
// and would honor it if passed, but had nothing to check against since this
// function never forwarded it. Neither of this function's own two current
// callers (acceptPoolCase, and the delegation-acceptance path below) track a
// version to pass today — this is real, available plumbing for whichever
// future caller does, not a behavior change for the callers that exist now.
async function updateCaseAnyMode(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void> {
  if (isOrchCaseId(caseId)) {
    await mockOrchestratorCaseService.updateCase(caseId, updates, expectedVersion);
    return;
  }
  const idx = CASES.findIndex((c: any) => c.id === caseId);
  if (idx >= 0) {
    const currentVersion = (CASES[idx] as any).version ?? 0;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyConflictError(caseId, expectedVersion, currentVersion);
    }
    CASES[idx] = { ...CASES[idx], ...updates, updatedAt: new Date().toISOString(), version: currentVersion + 1 } as any;
    storageSet(STORAGE_KEY, CASES);
  }
}

/** Accept a pool case — assigns to pathologist, removes from pool.
 *  Previously only ever touched the CoPilot CASES array directly, so
 *  accepting a pool O26- (Orchestration) case silently no-op'd — the
 *  claim was released but the case itself was never actually updated.
 *  Now dispatches by case-id prefix like everything else added in this
 *  pass, and syncs participants[] via syncPrimaryAssignee rather than
 *  writing order.assignedTo alone. CaseStatus mutation to 'in-progress'
 *  is Orchestrator-mode-only per the reportingMode operational matrix —
 *  CoPilot's diagnostic lifecycle status is LIS-owned. */
export async function acceptPoolCase(caseId: string, userId: string, userName?: string): Promise<void> {
  await delay(300);

  const caseData = await getCaseAnyMode(caseId);
  const membership = await canUserClaimPoolCase((caseData as any)?.poolId, userId, (caseData as any)?.poolName);
  if (!membership.allowed) {
    throw new Error(membership.reason ?? 'Not a member of this pool');
  }

  const claims = loadClaims();
  delete claims[caseId];
  saveClaims(claims);

  if (caseData) {
    const syncUpdates = syncPrimaryAssignee(caseData, userId, userId, userName);
    // Real, critical fix, per direct report: this status transition was
    // previously gated on `reportingMode === 'orchestrator'` only,
    // leaving every Assist/CoPilot-mode pool case's status genuinely
    // stuck at 'pool' forever after being accepted — confirmed directly:
    // the case still showed "CASE: POOL" and a live "Claim This Case"
    // button after navigating into it, requiring a second, redundant
    // claim. 'in-progress' is the same, real, already-wired value
    // Orchestration used here — and is independently already the
    // established status for an actively-worked Assist-mode case
    // elsewhere in this same file's own seed data. The alternative,
    // 'accepted', was deliberately never used anywhere in the app (see
    // mockOrchestratorCaseService.ts's own comment on its unused
    // CaseStatus values) — using it here would trade one broken display
    // for another, not fix anything.
    const updates: Partial<Case> = { ...syncUpdates, status: 'in-progress' as CaseStatus };
    await updateCaseAnyMode(caseId, updates);
  }

  const delegations = loadDelegations();
  const delIdx = delegations.findIndex(d => d.caseId === caseId && d.status === 'pending');
  if (delIdx >= 0) { delegations[delIdx].status = 'accepted'; saveDelegations(delegations); }
}

/** Pass on a pool case — release claim, case stays in pool */
export async function passPoolCase(caseId: string): Promise<void> {
  await delay(200);
  const claims = loadClaims();
  delete claims[caseId];
  saveClaims(claims);
}

export interface DelegatePayload {
  caseId: string;
  requestorId: string;
  requestorName?: string;
  delegationType: string;
  targetUserId?: string;
  targetUserName?: string;
  targetPoolId?: string;
  targetPoolName?: string;
  note?: string;
}

/** Add a non-primary participant (consult/review/second opinion/etc.) —
 *  targetRoleId must be a real seeded participation type id (see
 *  mapDelegationTypeToParticipationRole), never the raw delegationType
 *  string. */
function addNonPrimaryParticipant(
  participants: CaseParticipant[],
  targetUserId: string,
  targetUserName: string | undefined,
  roleId: string,
  addedBy: string,
): CaseParticipant[] {
  const idx = participants.findIndex(p => p.staffId === targetUserId);
  if (idx >= 0) {
    const roles = new Set(participants[idx].participationTypeIds);
    roles.add(roleId);
    const updated = [...participants];
    updated[idx] = { ...updated[idx], participationTypeIds: Array.from(roles), status: 'active' };
    return updated;
  }
  return [...participants, {
    staffId: targetUserId,
    staffName: targetUserName ?? targetUserId,
    source: 'manual',
    participationTypeIds: [roleId],
    addedBy, addedAt: new Date().toISOString(), status: 'active',
  }];
}

/** Delegate a case to an individual or pool.
 *
 *  Previously: unconditionally overwrote CaseStatus based on a hardcoded
 *  delegationType === 'POOL'/'REASSIGN' switch, and only ever touched the
 *  CoPilot CASES array — delegating an Orchestration case silently
 *  no-op'd on the case itself while still recording a (misleading)
 *  DelegationRecord. Now: ownership transfer is driven by the real
 *  DelegationType.transfersOwnership flag (admin-configurable, including
 *  custom types — not a hardcoded ID switch), CaseStatus is never mutated
 *  except the POOL branch on Orchestrator-mode cases, and both case
 *  stores are reachable via the dispatch helpers above. */
export async function delegateCase(payload: DelegatePayload): Promise<DelegationRecord> {
  await delay(400);

  const record: DelegationRecord = {
    id: Math.random().toString(36).slice(2),
    caseId: payload.caseId, fromUserId: payload.requestorId,
    toUserId: payload.targetUserId, toPoolId: payload.targetPoolId, toPoolName: payload.targetPoolName,
    delegationType: payload.delegationType, note: payload.note,
    timestamp: new Date().toISOString(), status: 'pending',
  };

  const caseData = await getCaseAnyMode(payload.caseId);
  if (caseData) {
    const configRes = await mockDelegationTypeService.getById(payload.delegationType);
    const transfersOwnership = configRes.ok && !!configRes.data?.transfersOwnership;

    const updates: Partial<Case> = {};

    if (transfersOwnership && payload.targetUserId) {
      Object.assign(updates, syncPrimaryAssignee(caseData, payload.targetUserId, payload.requestorId, payload.targetUserName));
    } else if (payload.delegationType === 'POOL') {
      updates.order = { ...caseData.order, assignedTo: undefined };
      if (payload.targetPoolId)   (updates as any).poolId = payload.targetPoolId;
      if (payload.targetPoolName) (updates as any).poolName = payload.targetPoolName;
      if (caseData.reportingMode === 'orchestrator') {
        updates.status = 'pool' as CaseStatus;
      }
    } else if (payload.targetUserId) {
      // Non-ownership delegation (consult, review, second opinion, tumor
      // board, teaching, etc.) — adds the target as a participant with
      // the mapped real role, never touches order.assignedTo or CaseStatus.
      const roleId = mapDelegationTypeToParticipationRole(payload.delegationType);
      updates.participants = addNonPrimaryParticipant(
        caseData.participants ?? [], payload.targetUserId, payload.targetUserName, roleId, payload.requestorId,
      );
    }

    // CRITICAL: no CaseStatus mutation anywhere above except the POOL
    // branch on an Orchestrator-mode case.
    if (Object.keys(updates).length > 0) {
      await updateCaseAnyMode(payload.caseId, updates);
    }
  }

  const delegations = loadDelegations();
  delegations.push(record);
  saveDelegations(delegations);
  return record;
}

/** Get delegation history, optionally filtered by case */
export async function getDelegations(caseId?: string): Promise<DelegationRecord[]> {
  await delay(100);
  const all = loadDelegations();
  return caseId ? all.filter(d => d.caseId === caseId) : all;
}

/** Real fix: this function didn't exist anywhere before - status was
 *  defined as a real lifecycle ('pending' | 'accepted' | 'passed' |
 *  'completed') but nothing in this codebase ever actually transitioned
 *  it, meaning WorklistPage.tsx's existing "delegated to me" count could
 *  only ever grow. Marks a delegation genuinely completed, once, with a
 *  real timestamp - idempotent (a second call on an already-completed
 *  record is a no-op success, not an error, since a pathologist
 *  double-clicking shouldn't see a failure). */
export async function completeDelegation(delegationId: string): Promise<{ ok: boolean; error?: string }> {
  await delay(150);
  const delegations = loadDelegations();
  const idx = delegations.findIndex(d => d.id === delegationId);
  if (idx === -1) return { ok: false, error: `Delegation ${delegationId} not found` };
  if (delegations[idx].status === 'completed') return { ok: true }; // already done, idempotent
  delegations[idx] = { ...delegations[idx], status: 'completed', completedAt: new Date().toISOString() };
  saveDelegations(delegations);
  return { ok: true };
}

// ─── Synoptic-level Assignment ────────────────────────────────────────────────

export interface SynopticAssignment {
  caseId: string;
  instanceId: string;
  assignedTo: string;
  assignedToName: string;
  assignedBy: string;
  assignedAt: string;
  requiresCountersign: boolean;
  note?: string;
}

/** Assign a specific synoptic report instance to another pathologist */
export async function assignSynoptic(
  caseId: string,
  instanceId: string,
  assignedTo: string,
  assignedToName: string,
  assignedBy: string,
  requiresCountersign = true,
  note?: string,
): Promise<void> {
  await delay(300);
  const idx = CASES.findIndex((c: any) => c.id === caseId);
  if (idx < 0) return;
  const reportIdx = (CASES[idx].synopticReports ?? []).findIndex(
    (r: any) => r.instanceId === instanceId
  );
  if (reportIdx < 0) return;

  const updated = { ...CASES[idx] };
  const reports = [...(updated.synopticReports ?? [])];
  reports[reportIdx] = {
    ...reports[reportIdx],
    assignedTo,
    assignedToName,
    assignedBy,
    assignedAt: new Date().toISOString(),
    requiresCountersign,
    assignmentNote: note,
    status: 'draft',
  };
  updated.synopticReports = reports;
  CASES[idx] = updated as any;
  storageSet(STORAGE_KEY, CASES);

  // Record delegation entry
  const record: DelegationRecord = {
    id: Math.random().toString(36).slice(2),
    caseId, fromUserId: assignedBy, toUserId: assignedTo,
    delegationType: 'SYNOPTIC_ASSIGN',
    note, timestamp: new Date().toISOString(), status: 'pending',
  };
  const delegations = loadDelegations();
  delegations.push(record);
  saveDelegations(delegations);
}

/** Countersign a synoptic that was finalised by an assigned pathologist */
export async function countersignSynoptic(
  caseId: string,
  instanceId: string,
  countersignedBy: string,
): Promise<void> {
  await delay(300);
  const idx = CASES.findIndex((c: any) => c.id === caseId);
  if (idx < 0) return;
  const reportIdx = (CASES[idx].synopticReports ?? []).findIndex(
    (r: any) => r.instanceId === instanceId
  );
  if (reportIdx < 0) return;

  const updated = { ...CASES[idx] };
  const reports = [...(updated.synopticReports ?? [])];
  reports[reportIdx] = {
    ...reports[reportIdx],
    countersignedBy,
    countersignedAt: new Date().toISOString(),
    status: 'finalized',
  };
  updated.synopticReports = reports;
  CASES[idx] = updated as any;
  storageSet(STORAGE_KEY, CASES);
}

// ─── Pathologist ID → Name map ────────────────────────────────────────────────
// Matches the assignedTo IDs used in MOCK_CASES orders.
const PATHOLOGIST_NAMES: Record<string, string> = {
  'PATH-001': 'Dr. Sarah Chen',
  'PATH-002': 'Dr. Michael Torres',
  'PATH-003': 'Dr. Anil Sharma',
  'PATH-004': 'Dr. Linda Park',
  'PATH-005': 'Dr. James Nguyen',
  'PATH-UK-001': 'Dr. Paul Carter',
  'PATH-UK-002': 'Dr. Oliver Pemberton',
};

// ─── Patient History ──────────────────────────────────────────────────────────
// Prior pathology for known patients, keyed by MRN.
// This is the "query input" the AI uses to find similar cases.

export interface PatientHistoryCase {
  id: string;
  date: string;
  diagnosis: string;
  site: string;
  procedure: string;
  physician: string;
  receptors: string;
  ki67: string;
  margins: string;
  nodes: string;
  gross: string;
  microscopic: string;
  comment: string;
  tags: string[];
  // Internal fields used by the similarity scorer
  _templateId?: string;
  _grade?: number;
  _erPositive?: boolean;
  _her2Positive?: boolean;
  _snomedMorphology?: string[];  // SNOMED CT concept IDs for morphology matching
}

export const MOCK_PRIOR_PATHOLOGY: Record<string, PatientHistoryCase[]> = {
  // ── US patients ───────────────────────────────────────────────────────────

  // Robert Jackson — MRN 100002 — Colorectal (current: sigmoid resection)
  '100002': [
    {
      id: 'S23-09812',
      date: 'Jun 18, 2023',
      diagnosis: 'Tubular adenoma with low grade dysplasia — surveillance colonoscopy',
      site: 'Sigmoid colon',
      procedure: 'Colonoscopic polypectomy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '< 15%', margins: 'Clear', nodes: 'Not sampled',
      gross: 'Single pedunculated polyp 1.4 cm. Pink-tan mucosal surface.',
      microscopic: 'Tubular adenoma with low grade dysplasia. No high grade dysplasia or invasive carcinoma. Stalk margin clear.',
      comment: 'Tubular adenoma completely excised. 3-year colonoscopic surveillance recommended.',
      tags: ['Adenoma', 'Low grade dysplasia', 'Polypectomy', 'Complete excision'],
      _templateId: 'colon_resection', _grade: 1, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['413448000', '363346000'],
    },
  ],

  // Helen Williams — MRN 100003 — Lung (current: VATS right upper lobectomy)
  '100003': [
    {
      id: 'S24-11203',
      date: 'Aug 29, 2024',
      diagnosis: 'Adenocarcinoma of lung — CT-guided core biopsy, acinar predominant',
      site: 'Right upper lobe, subpleural nodule',
      procedure: 'CT-guided core needle biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '32%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Two core biopsies each 1.4 cm × 2 mm. Submitted entirely.',
      microscopic: 'Moderately differentiated adenocarcinoma, acinar predominant pattern. TTF-1 positive.',
      comment: 'Pulmonary adenocarcinoma confirmed. EGFR/ALK/ROS1 negative. Referral to thoracic surgery for VATS resection.',
      tags: ['Lung adenocarcinoma', 'Acinar', 'EGFR−', 'ALK−', 'Pre-surgical biopsy'],
      _templateId: 'lung_resection', _grade: 2, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['254637007', '413448000'],
    },
  ],

  // David Martinez — MRN 100004 — Prostate (current: TRUS biopsy)
  '100004': [
    {
      id: 'S22-08871',
      date: 'Apr 12, 2022',
      diagnosis: 'Benign prostatic tissue — no malignancy. HGPIN in 1 core.',
      site: 'Prostate, bilateral',
      procedure: 'TRUS-guided 12-core biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '< 2%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: '12 core biopsies submitted by anatomical site.',
      microscopic: 'Benign prostatic glands with focal chronic prostatitis. High-grade PIN in 1 core. No invasive carcinoma.',
      comment: 'No malignancy. HGPIN in 1 core — rebiopsy recommended. PSA 5.1 ng/mL.',
      tags: ['Benign', 'HGPIN', 'No malignancy', 'Surveillance'],
      _templateId: 'prostate_needle_biopsy', _grade: 1, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['399068003'],
    },
  ],

  // Susan Taylor — MRN 100005 — Breast DCIS (current: wire-localised lumpectomy)
  '100005': [
    {
      id: 'S23-31102',
      date: 'Nov 14, 2023',
      diagnosis: 'DCIS — intermediate nuclear grade, cribriform pattern — stereotactic biopsy',
      site: 'Right breast, upper outer quadrant — microcalcifications',
      procedure: 'Stereotactic vacuum-assisted biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'ER+ (85%), PR+ (60%), HER2−', ki67: '12%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Multiple vacuum-assisted biopsy cores aggregating 2.8 cm.',
      microscopic: 'DCIS, intermediate nuclear grade, cribriform and micropapillary patterns, with calcifications. No invasive carcinoma.',
      comment: 'DCIS confirmed. ER/PR positive. Wire-localised excision recommended.',
      tags: ['DCIS', 'Intermediate grade', 'ER+', 'Cribriform', 'Pre-excision biopsy'],
      _templateId: 'breast_dcis_resection', _grade: 2, _erPositive: true, _her2Positive: false,
      _snomedMorphology: ['413448000', '397201007'],
    },
  ],

  // Carol Davis — MRN 100008 — Breast bilateral mastectomy (BRCA1)
  '100008': [
    {
      id: 'S24-19034',
      date: 'Jan 22, 2024',
      diagnosis: 'Invasive NST carcinoma, Grade III, right breast — core biopsy',
      site: 'Right breast, 10 o\'clock, 2.1 cm mass',
      procedure: 'Ultrasound-guided core needle biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'ER− PR− HER2 2+ (equivocal)', ki67: '68%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Four core biopsies each 1.6 cm.',
      microscopic: 'High grade invasive carcinoma of no special type. Marked nuclear pleomorphism, frequent mitoses. Nottingham grade 3.',
      comment: 'High grade triple-negative-like breast carcinoma. BRCA1 germline testing recommended.',
      tags: ['Grade III', 'ER−', 'HER2 equivocal', 'BRCA1 testing', 'High Ki-67'],
      _templateId: 'breast_invasive', _grade: 3, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['413448000', '254838004'],
    },
  ],

  // Ruth Anderson — MRN 100006 — Breast core biopsy
  '100006': [
    {
      id: 'S24-22341',
      date: 'Sep 5, 2024',
      diagnosis: 'Fibrocystic changes with apocrine metaplasia — no atypia',
      site: 'Left breast, 9 o\'clock position',
      procedure: 'Ultrasound-guided core needle biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '< 3%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Three core biopsies each 1.2 cm. Submitted entirely.',
      microscopic: 'Fibrocystic changes with apocrine metaplasia and mild adenosis. No atypia. No malignancy.',
      comment: 'Benign fibrocystic changes. Clinical and imaging follow-up recommended.',
      tags: ['Benign', 'Fibrocystic', 'No atypia', 'Surveillance'],
      _templateId: 'breast_invasive', _grade: 1, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['413448000'],
    },
  ],

  // Michael Chen — MRN 100007 — Colorectal (current: anterior resection)
  '100007': [
    {
      id: 'S24-16782',
      date: 'Jul 14, 2024',
      diagnosis: 'Rectal adenocarcinoma — staging biopsy, moderately differentiated',
      site: 'Rectum, 8 cm from anal verge',
      procedure: 'Flexible sigmoidoscopy biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '48%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Four fragments of rectal mucosa 0.3–0.6 cm. Submitted entirely.',
      microscopic: 'Moderately differentiated adenocarcinoma infiltrating the submucosa. No lymphovascular invasion in the biopsy.',
      comment: 'Rectal adenocarcinoma confirmed. CT staging: mrT3N1. Referred for neoadjuvant chemoradiotherapy.',
      tags: ['Rectal adenocarcinoma', 'Grade 2', 'Staging biopsy', 'Pre-treatment'],
      _templateId: 'colon_resection', _grade: 2, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['363346000', '413448000'],
    },
    {
      id: 'S21-09234',
      date: 'Mar 22, 2021',
      diagnosis: 'Tubulovillous adenoma with low grade dysplasia',
      site: 'Sigmoid colon',
      procedure: 'Colonoscopic polypectomy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '< 20%', margins: 'Clear', nodes: 'Not sampled',
      gross: 'Pedunculated polyp 1.8 cm. Submitted entirely.',
      microscopic: 'Tubulovillous adenoma (villous component 25%) with low grade dysplasia. Stalk margin clear.',
      comment: 'Completely excised. 3-year surveillance recommended.',
      tags: ['Tubulovillous adenoma', 'Low grade', 'Complete excision'],
      _templateId: 'colon_resection', _grade: 1, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['413448009'],
    },
  ],

  // Beatrice Holloway — MRN 100009 — Breast lumpectomy
  '100009': [
    {
      id: 'S25-41102',
      date: 'Feb 8, 2025',
      diagnosis: 'Invasive lobular carcinoma, Grade I — core biopsy',
      site: 'Left breast, upper outer quadrant',
      procedure: 'Ultrasound-guided core needle biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'ER+ (100%), PR+ (85%), HER2−', ki67: '6%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Three core biopsies each 1.3 cm. Submitted entirely.',
      microscopic: 'Invasive lobular carcinoma, classic type, single file pattern. Nottingham grade 1. E-cadherin negative.',
      comment: 'ER/PR strongly positive, HER2 negative. Low Ki-67. Excellent hormone receptor profile. Wire-localised lumpectomy planned.',
      tags: ['Invasive lobular', 'Grade I', 'ER+', 'PR+', 'HER2−', 'Low Ki-67'],
      _templateId: 'breast_invasive', _grade: 1, _erPositive: true, _her2Positive: false,
      _snomedMorphology: ['413448002', '254838004'],
    },
  ],

  // Margaret Foster — MRN 100011 — Breast core biopsy
  '100011': [
    {
      id: 'S25-38871',
      date: 'Dec 3, 2025',
      diagnosis: 'Invasive ductal carcinoma, Grade III — core biopsy',
      site: 'Right breast, upper inner quadrant',
      procedure: 'Ultrasound-guided core needle biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'ER− PR− HER2 3+ (positive)', ki67: '72%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: 'Four core biopsies each 1.5 cm. Submitted entirely.',
      microscopic: 'High grade invasive ductal carcinoma, Nottingham grade 3. Marked pleomorphism, brisk mitotic activity.',
      comment: 'HER2-positive, hormone receptor-negative. HER2 FISH confirmed amplified. Anti-HER2 therapy eligible.',
      tags: ['Grade III', 'ER−', 'HER2+', 'High Ki-67', 'Anti-HER2 eligible'],
      _templateId: 'breast_invasive', _grade: 3, _erPositive: false, _her2Positive: true,
      _snomedMorphology: ['413448000', '254838004'],
    },
  ],

  // Harold Bennett — MRN 100012 — Prostate biopsy
  '100012': [
    {
      id: 'S20-14432',
      date: 'Aug 19, 2020',
      diagnosis: 'Benign prostatic tissue — no malignancy',
      site: 'Prostate, bilateral',
      procedure: 'TRUS-guided 12-core biopsy',
      physician: 'Dr. S. Johnson',
      receptors: 'N/A', ki67: '< 1%', margins: 'N/A (biopsy)', nodes: 'Not sampled',
      gross: '12 core biopsies submitted by anatomical site.',
      microscopic: 'Benign prostatic glands with focal benign prostatic hyperplasia. No PIN. No invasive carcinoma.',
      comment: 'No malignancy. PSA 4.2 ng/mL. Annual PSA surveillance recommended.',
      tags: ['Benign', 'BPH', 'No malignancy', 'Surveillance'],
      _templateId: 'prostate_needle_biopsy', _grade: 1, _erPositive: false, _her2Positive: false,
      _snomedMorphology: ['399068003'],
    },
  ],

  // ── Grace Thompson — MRN 100001 (existing entry) ──────────────────────────
  '100001': [
    {
      id: 'S24-04821',
      date: 'Mar 14, 2024',
      diagnosis: 'Invasive Ductal Carcinoma, Grade II',
      site: 'Right breast, upper outer quadrant',
      procedure: 'Core needle biopsy',
      physician: 'Dr. A. Patel',
      receptors: 'ER+ (95%), PR+ (80%), HER2−',
      ki67: '18%',
      margins: 'N/A (biopsy)',
      nodes: 'Not sampled',
      gross: 'Core needle biopsy, 3 cores each 1.4 cm in length. Tan-white firm tissue submitted in entirety.',
      microscopic: 'Sections show invasive carcinoma of ductal type arranged in nests and cords with moderate nuclear pleomorphism. Mitotic rate 8/10 HPF. No lymphovascular invasion identified.',
      comment: 'Morphology and IHC profile consistent with invasive ductal carcinoma, Grade II (Nottingham score 6). Recommend correlation with clinical and imaging findings.',
      tags: ['ER+', 'PR+', 'HER2−', 'Grade II', 'Core biopsy'],
      _templateId: 'breast_invasive', _grade: 2, _erPositive: true, _her2Positive: false,
      _snomedMorphology: ['413448000', '254838004'],
    },
    {
      id: 'S23-17340',
      date: 'Oct 3, 2023',
      diagnosis: 'Atypical Ductal Hyperplasia',
      site: 'Left breast, 2 o\'clock position',
      procedure: 'Excisional biopsy',
      physician: 'Dr. T. Nguyen',
      receptors: 'N/A',
      ki67: '< 5%',
      margins: 'Clear (> 2 mm)',
      nodes: 'Not sampled',
      gross: 'Excisional biopsy specimen 2.8 × 1.9 × 1.2 cm. Grey-white fibrous tissue with a small firm nodule centrally.',
      microscopic: 'Sections reveal ductal proliferation with architectural atypia involving fewer than 2 complete duct spaces. Features fall short of DCIS quantitatively. No invasive carcinoma identified.',
      comment: 'Atypical ductal hyperplasia. Excision with clear margins. Recommend 6-month surveillance imaging and high-risk clinical assessment.',
      tags: ['ADH', 'Excision', 'Clear margins', 'Surveillance'],
      _templateId: 'breast_dcis_resection', _grade: 1, _erPositive: true, _her2Positive: false,
    },
    {
      id: 'S22-02190',
      date: 'Feb 9, 2022',
      diagnosis: 'Fibroadenoma, Benign',
      site: 'Right breast, 10 o\'clock position',
      procedure: 'Fine needle aspiration',
      physician: 'Dr. J. Kim',
      receptors: 'N/A',
      ki67: '< 2%',
      margins: 'N/A (FNA)',
      nodes: 'Not sampled',
      gross: 'Fine needle aspirate submitted in CytoLyt fixative. Adequate cellularity on review.',
      microscopic: 'Smears show cohesive sheets of benign ductal epithelial cells with bipolar bare nuclei in a clean background. Features consistent with fibroadenoma.',
      comment: 'Benign fibroepithelial lesion consistent with fibroadenoma. No malignant cells identified. Clinical correlation recommended.',
      tags: ['Benign', 'Fibroadenoma', 'FNA', 'No atypia'],
      _templateId: 'breast_invasive', _grade: 1, _erPositive: false, _her2Positive: false,
    },
    {
      id: 'S20-08855',
      date: 'Jun 22, 2020',
      diagnosis: 'Fibrocystic Changes, No Atypia',
      site: 'Bilateral',
      procedure: 'Core biopsy',
      physician: 'Dr. A. Patel',
      receptors: 'N/A',
      ki67: 'N/A',
      margins: 'N/A',
      nodes: 'Not sampled',
      gross: 'Bilateral core biopsies submitted in formalin. Grey-tan fibrous tissue.',
      microscopic: 'Sections show fibrocystic changes with apocrine metaplasia, adenosis, and mild ductal hyperplasia of usual type. No atypia. No malignancy identified.',
      comment: 'Benign fibrocystic changes bilaterally. Routine screening follow-up recommended.',
      tags: ['Benign', 'Fibrocystic', 'No atypia', 'Bilateral'],
      _templateId: 'breast_invasive', _grade: 1, _erPositive: false, _her2Positive: false,
    },
  ],

  // ── UK patients (NHS) ─────────────────────────────────────────────────────

  // Susan Hargreaves — MRN 200007
  '200007': [
    {
      id: 'S22-44811',
      date: 'Sep 14, 2022',
      diagnosis: 'Invasive Ductal Carcinoma, Grade 2',
      site: 'Left breast, upper outer quadrant',
      procedure: 'Wide local excision',
      physician: 'Dr. O. Pemberton',
      receptors: 'ER+, PR+, HER2–',
      ki67: '18%',
      margins: 'Clear (> 2 mm)',
      nodes: '0/3 sentinel nodes involved',
      gross: 'Wide local excision specimen 45 × 38 × 22 mm. Central firm grey-white stellate lesion 18 mm diameter.',
      microscopic: 'Invasive ductal carcinoma NST, Nottingham grade 2 (tubule 3, nuclear 2, mitosis 1 = 6). ER 8/8 Allred, PR 6/8, HER2 score 1+. No LVI. Margins clear > 2 mm.',
      comment: 'Grade 2 invasive ductal carcinoma, ER/PR positive, HER2 negative. Clear margins. Sentinel nodes negative. Recommend adjuvant endocrine therapy; oncology referral made.',
      tags: ['IDC', 'Grade 2', 'ER+', 'PR+', 'HER2–', 'Clear margins', 'Node negative'],
      _templateId: 'breast_invasive', _grade: 2, _erPositive: true, _her2Positive: false,
    },
    {
      id: 'S20-19032',
      date: 'Mar 5, 2020',
      diagnosis: 'Fibroadenoma with Mild Epithelial Hyperplasia',
      site: 'Right breast, 9 o\'clock position',
      procedure: 'Ultrasound-guided core biopsy',
      physician: 'Dr. O. Pemberton',
      receptors: 'N/A',
      ki67: '< 3%',
      margins: 'N/A (core biopsy)',
      nodes: 'Not sampled',
      gross: 'Four cores of grey-tan fibrous tissue submitted in formalin.',
      microscopic: 'Sections show a fibroepithelial lesion with bland biphasic architecture consistent with fibroadenoma. Mild usual-type epithelial hyperplasia. No atypia or in situ carcinoma.',
      comment: 'Benign fibroadenoma. Concordant with imaging (B2). Clinical follow-up as per local protocol.',
      tags: ['Fibroadenoma', 'Benign', 'B2', 'No atypia'],
      _templateId: 'breast_invasive', _grade: 1, _erPositive: false, _her2Positive: false,
    },
  ],

  // Alan Butterworth — MRN 200008
  '200008': [
    {
      id: 'S23-31042',
      date: 'Jul 28, 2023',
      diagnosis: 'Adenocarcinoma of the Prostate, Gleason 3+4=7',
      site: 'Prostate, bilateral cores',
      procedure: 'TRUS-guided biopsy (12 cores)',
      physician: 'Dr. M. Webb',
      receptors: 'N/A',
      ki67: '12%',
      margins: 'N/A (biopsy)',
      nodes: 'Not sampled',
      gross: '12 labelled core biopsy fragments in formalin, right and left sides designated separately.',
      microscopic: 'Adenocarcinoma, Gleason pattern 3+4=7 (Grade Group 2). Perineural invasion present right side. No seminal vesicle involvement. Cancer present in 5 of 6 right cores, 2 of 6 left cores.',
      comment: 'Gleason 3+4 prostate adenocarcinoma, bilateral, Grade Group 2. PSA 8.4 ng/mL. Recommend urology multidisciplinary team discussion for treatment planning.',
      tags: ['Prostate', 'Adenocarcinoma', 'Gleason 3+4', 'Grade Group 2', 'Perineural invasion'],
      _templateId: 'prostate_biopsy', _grade: 2, _erPositive: false, _her2Positive: false,
    },
  ],

  // Dorothy Whitworth — MRN 200009
  '200009': [
    {
      id: 'S21-28774',
      date: 'Nov 11, 2021',
      diagnosis: 'Tubulovillous Adenoma with High Grade Dysplasia',
      site: 'Sigmoid colon',
      procedure: 'Colonoscopic polypectomy',
      physician: 'Dr. A. Patel',
      receptors: 'N/A',
      ki67: '35%',
      margins: 'Involved at diathermy margin',
      nodes: 'Not sampled',
      gross: 'Polypectomy specimen 22 mm. Lobulated surface, stalk present 4 mm.',
      microscopic: 'Tubulovillous adenoma (60% villous) with foci of high grade dysplasia. No invasive carcinoma. Diathermy margin involved by adenoma.',
      comment: 'Tubulovillous adenoma with high grade dysplasia. Margin involved — recommend endoscopic re-assessment at 3 months. Surveillance colonoscopy 1 year.',
      tags: ['Tubulovillous adenoma', 'HGD', 'Sigmoid', 'Margin involved'],
      _templateId: 'colon_resection', _grade: 2, _erPositive: false, _her2Positive: false,
    },
  ],
};

// ─── AI Similar Case Matching ─────────────────────────────────────────────────
// In production this calls callAi() with the patient's history as context and
// the case corpus as the search space. In mock/dev mode we score deterministically
// by comparing synoptic answers against the patient's most recent malignant case.

export interface AiMatchedCase {
  caseId: string;
  accession: string;
  patientInitials: string;
  date: string;
  diagnosis: string;
  site: string;
  procedure: string;
  receptors: string;
  ki67: string;
  matchPct: number;
  matchReason: string;
  // Full report fields for detail view
  physician: string;
  margins: string;
  nodes: string;
  gross: string;
  microscopic: string;
  ancillaryStudies: string;
  tags: string[];
}

/**
 * Scores a case's synoptic answers against the patient's most recent
 * malignant prior pathology entry. Returns 0–100.
 *
 * Scoring weights (must sum to 100):
 *   templateId match (same organ system)  → 30 pts
 *   grade match                            → 25 pts
 *   ER status match                        → 20 pts
 *   HER2 status match                      → 15 pts
 *   site/laterality overlap                → 10 pts
 */
function scoreCaseAgainstHistory(
  c: Case,
  anchor: PatientHistoryCase,
): number {
  const reports = c.synopticReports ?? [];
  if (reports.length === 0) return 0;

  const report = reports[0];
  const answers = report.answers ?? {};
  const ancillary = (c.diagnostic?.ancillaryStudies ?? '').toLowerCase();
  const micro = (c.diagnostic?.microscopicDescription ?? '').toLowerCase();

  let score = 0;

  // 1. SNOMED morphology match (35 pts) — most clinically specific signal
  const caseSnomedCodes = (c as any).coding?.snomed ?? [];
  if (anchor._snomedMorphology && anchor._snomedMorphology.length > 0 && caseSnomedCodes.length > 0) {
    const overlap = anchor._snomedMorphology.filter((code: string) =>
      caseSnomedCodes.includes(code)
    );
    if (overlap.length > 0) {
      score += 35; // exact morphology match
    } else {
      // Check if same organ system via templateId as fallback
      if (anchor._templateId && report.templateId === anchor._templateId) score += 10;
    }
  } else if (anchor._templateId && report.templateId === anchor._templateId) {
    score += 20; // no SNOMED — fall back to template match
  } else if (
    anchor._templateId?.startsWith('breast') &&
    report.templateId?.startsWith('breast')
  ) {
    score += 12;
  }

  // 2. Template / organ system (25 pts when SNOMED unavailable)
  if (!(anchor._snomedMorphology && anchor._snomedMorphology.length > 0)) {
    if (anchor._templateId && report.templateId === anchor._templateId) score += 25;
    else if (anchor._templateId?.startsWith('breast') && report.templateId?.startsWith('breast')) score += 15;
  }

  // 3. Grade match (20 pts)
  const rawGrade = answers['histologic_grade'] as string | undefined;
  let caseGrade: number | null = null;
  if (rawGrade) {
    if (rawGrade.includes('1') || rawGrade === 'g1') caseGrade = 1;
    else if (rawGrade.includes('2') || rawGrade === 'g2') caseGrade = 2;
    else if (rawGrade.includes('3') || rawGrade === 'g3') caseGrade = 3;
  }
  if (anchor._grade && caseGrade !== null) {
    if (caseGrade === anchor._grade) score += 20;
    else if (Math.abs(caseGrade - anchor._grade) === 1) score += 10;
  }

  // 4. ER status (10 pts)
  const erPositive =
    ancillary.includes('er: positive') || ancillary.includes('er+') ||
    micro.includes('er+') ||
    String(answers['receptor_status'] ?? '').includes('er_positive');
  if (anchor._erPositive !== undefined) {
    if (erPositive === anchor._erPositive) score += 10;
    else score += 2;
  }

  // 5. HER2 status (5 pts)
  const her2Positive =
    ancillary.includes('her2 3+') || ancillary.includes('her2: positive') ||
    ancillary.includes('her2+') || ancillary.includes('ish: amplified');
  if (anchor._her2Positive !== undefined) {
    if (her2Positive === anchor._her2Positive) score += 5;
    else score += 1;
  }

  // 6. Site / laterality (5 pts)
  const laterality = String(answers['specimen_laterality'] ?? '').toLowerCase();
  const anchorSite = anchor.site.toLowerCase();
  if (laterality && anchorSite.includes(laterality)) score += 5;
  else if (laterality === 'left' || laterality === 'right') score += 2;

  return Math.min(score, 100);
}

function buildMatchReason(c: Case, anchor: PatientHistoryCase): string {
  const reasons: string[] = [];
  const reports = c.synopticReports ?? [];
  const answers = reports[0]?.answers ?? {};
  const ancillary = (c.diagnostic?.ancillaryStudies ?? '').toLowerCase();

  // SNOMED morphology match — strongest signal
  const caseSnomedCodes = (c as any).coding?.snomed ?? [];
  if (anchor._snomedMorphology && anchor._snomedMorphology.length > 0) {
    const overlap = anchor._snomedMorphology.filter((code: string) =>
      caseSnomedCodes.includes(code)
    );
    if (overlap.length > 0) reasons.push('Matching SNOMED morphology');
  }

  if (reports[0]?.templateId === anchor._templateId) reasons.push('Same histologic type');
  else if (reports[0]?.templateId?.startsWith('breast') && anchor._templateId?.startsWith('breast')) {
    reasons.push('Same organ system');
  }

  const rawGrade = answers['histologic_grade'] as string | undefined;
  if (rawGrade) {
    const gradeNum = rawGrade.includes('1') ? 1 : rawGrade.includes('2') ? 2 : rawGrade.includes('3') ? 3 : null;
    if (gradeNum === anchor._grade) reasons.push(`Matching Grade ${gradeNum}`);
    else if (gradeNum !== null) reasons.push(`Adjacent grade (${gradeNum} vs ${anchor._grade})`);
  }

  const erPositive = ancillary.includes('er: positive') || ancillary.includes('er+');
  if (erPositive && anchor._erPositive) reasons.push('ER+ profile');
  else if (!erPositive && !anchor._erPositive) reasons.push('ER− profile');

  const her2Positive = ancillary.includes('her2 3+') || ancillary.includes('ish: amplified');
  if (her2Positive && anchor._her2Positive) reasons.push('HER2+ profile');
  else if (!her2Positive && !anchor._her2Positive) reasons.push('HER2− profile');

  return reasons.slice(0, 3).join(' · ') || 'Morphologic similarity';
}

function buildTags(c: Case, matchPct: number): string[] {
  const tags: string[] = [];
  const ancillary = (c.diagnostic?.ancillaryStudies ?? '').toLowerCase();
  const answers = c.synopticReports?.[0]?.answers ?? {};

  const rawGrade = answers['histologic_grade'] as string | undefined;
  if (rawGrade?.includes('1') || rawGrade === 'g1') tags.push('Grade I');
  else if (rawGrade?.includes('2') || rawGrade === 'g2') tags.push('Grade II');
  else if (rawGrade?.includes('3') || rawGrade === 'g3') tags.push('Grade III');

  if (ancillary.includes('er: positive') || ancillary.includes('er+')) tags.push('ER+');
  else if (ancillary.includes('er:') || ancillary.includes('er ')) tags.push('ER−');
  if (ancillary.includes('her2 3+') || ancillary.includes('ish: amplified')) tags.push('HER2+');
  else if (ancillary.includes('her2')) tags.push('HER2−');

  tags.push(`${matchPct}% match`);
  return tags;
}

/**
 * findSimilarCases — the AI matching entry point.
 *
 * In production: calls callAi() with the patient's prior pathology as context
 * and the case corpus as the search space, returns structured matches.
 *
 * In mock/dev: scores MOCK_CASES deterministically against the patient's
 * most recent malignant history entry, excludes the patient's own cases,
 * and returns the top results above a minimum threshold.
 */
export async function findSimilarCases(
  mrn: string,
  topN = 5,
  minScore = 40,
): Promise<AiMatchedCase[]> {
  await delay(600); // simulate AI latency

  const history = MOCK_PRIOR_PATHOLOGY[mrn];
  if (!history || history.length === 0) return [];

  // Use the most recent malignant case as the anchor for matching.
  // Priority: high-grade malignancy > any malignancy > most recent entry.
  const anchor =
    history.find(h => (h._grade ?? 0) >= 2) ??
    history.find(h => h._templateId && !h._templateId.includes('benign')) ??
    history[0];

  const results: AiMatchedCase[] = [];

  for (const c of CASES) {
    // Never match the patient's own cases
    if (c.patient.mrn === mrn) continue;
    // Only match finalized or in-progress cases (not blank drafts)
    if (!c.diagnostic?.microscopicDescription || c.diagnostic.microscopicDescription === 'Pending.') continue;

    const score = scoreCaseAgainstHistory(c, anchor);
    if (score < minScore) continue;

    // Add a small deterministic jitter so scores don't cluster identically
    const jitter = (parseInt(c.id.replace(/\D/g, '').slice(-2), 10) % 5) - 2;
    const matchPct = Math.min(99, Math.max(minScore, score + jitter));

    const patientInitials =
      `${c.patient.firstName[0]}${c.patient.lastName[0]}`;

    const primaryReport = c.synopticReports?.[0];
    const answers = primaryReport?.answers ?? {};

    results.push({
      caseId: c.id,
      accession: c.accession?.fullAccession ?? c.accession?.accessionNumber ?? '',
      patientInitials,
      date: new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      diagnosis: primaryReport?.templateName?.replace('CAP ', '').replace(' — Resection', '').replace(' — Needle Biopsy', '') ?? 'Unknown',
      site: String(answers['tumor_site'] ?? answers['specimen_laterality'] ?? 'Breast'),
      procedure: String(answers['procedure'] ?? 'Surgical specimen').replace(/_/g, ' '),
      receptors: (() => {
        const a = (c.diagnostic?.ancillaryStudies ?? '').toLowerCase();
        const er  = a.includes('er: positive') || a.includes('er+') ? 'ER+' : 'ER−';
        const pr  = a.includes('pr: positive') || a.includes('pr+') ? 'PR+' : 'PR−';
        const her2 = (a.includes('her2 3+') || a.includes('ish: amplified')) ? 'HER2+' : 'HER2−';
        return `${er}/${pr}, ${her2}`;
      })(),
      ki67: (() => {
        const match = (c.diagnostic?.ancillaryStudies ?? '').match(/ki-?67[:\s]+(\d+%)/i);
        return match ? match[1] : 'N/A';
      })(),
      matchPct,
      matchReason: buildMatchReason(c, anchor),
      physician: PATHOLOGIST_NAMES[c.order?.assignedTo ?? ''] ?? c.order?.assignedTo ?? 'Unknown',
      margins: String(answers['margin_status_invasive'] ?? answers['margin_status_dcis'] ?? 'See report').replace(/_/g, ' '),
      nodes: String(answers['regional_ln_status'] ?? 'See report').replace(/_/g, ' '),
      gross: c.diagnostic?.grossDescription ?? '',
      microscopic: c.diagnostic?.microscopicDescription ?? '',
      ancillaryStudies: c.diagnostic?.ancillaryStudies ?? '',
      tags: buildTags(c, matchPct),
    });
  }

  // Sort descending by matchPct, return topN
  return results
    .sort((a, b) => b.matchPct - a.matchPct)
    .slice(0, topN);
}

export const mockCaseService: ICaseService = {
  async getCase(id: string): Promise<Case | undefined> {
    await delay();
    return CASES.find(c => c.id === id);
  },

  async getAll(params?) {
    await delay();
    // Safety net: if CASES is empty, attempt re-seed from MOCK_CASES
    if (CASES.length === 0) {
      console.warn('[mockCaseService] CASES empty — re-seeding from MOCK_CASES');
      CASES.push(...MOCK_CASES.map(c => ({ ...c })));
    }
    const filtered = applyCaseFilters(CASES, params);
    const { data, meta } = applyCasePagination(filtered, params);
    return meta ? { ok: true, data: data as any[], meta } : { ok: true, data: data as any[] };
  },

  async listCasesForUser(userId: string): Promise<Case[]> {
    await delay();
    if (!userId || userId === 'all' || userId === 'current') return CASES;

    // The hardcoded USER_HOSPITAL_MAP that used to live here (six pathologist
    // IDs → hospital ID, retired June 2026) only ever filtered pool-case
    // visibility in this one list — it was never enforced on getCase() or
    // getAll(), so it wasn't a real access boundary. The actual organisation
    // wall now lives in CaseRouter.ts (caseAccessControl.ts), applied
    // uniformly across getCase/getAll/listCasesForUser rather than
    // duplicated per-service. This method keeps its workflow-level logic
    // (assigned-to-me, or unclaimed pool work) and lets CaseRouter apply the
    // tenant boundary on top of whatever this returns.
    return CASES.filter(c => {
      if (c.order?.assignedTo === userId) return true;
      if ((c as any).status === 'pool') return true;
      return false;
    });
  },

  async updateCase(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void> {
    await delay();
    const index = CASES.findIndex(c => c.id === caseId);
    if (index !== -1) {
      const currentVersion = (CASES[index] as any).version ?? 0;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new ConcurrencyConflictError(caseId, expectedVersion, currentVersion);
      }
      CASES[index] = { ...CASES[index], ...updates, updatedAt: new Date().toISOString(), version: currentVersion + 1 } as any;
      storageSet(STORAGE_KEY, CASES);
    }
  },

  // Added for ICaseService interface completeness alongside the Accession
  // page (Stage 0 Requirements §6.1). Not the primary path for LIS cases
  // in production — those arrive via FHIR ServiceRequest ingestion — but
  // implemented so this service satisfies the interface and the mock
  // environment doesn't throw if ever called.
  async createCase(caseData: Case): Promise<void> {
    await delay();
    CASES.push(caseData);
    storageSet(STORAGE_KEY, CASES);
  },
};
