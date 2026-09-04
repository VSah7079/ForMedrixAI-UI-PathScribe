// src/services/cases/mockOrchestratorCaseService.ts
// ─────────────────────────────────────────────────────────────
// Orchestrator-mode mock cases for PathScribe development & QA.
//
// Assigned users:
//   PATH-001    — Pete Nimmo        (pete.nimmo@pathscribe.ai / demo@pathscribe.ai)
//   PATH-UK-001 — Paul Carter       (paul.carter@mft.nhs.uk)
//   PATH-US-001 — Amber Fehrs-Battey (amber.fehrs@demo.pathscribe.ai)
// ─────────────────────────────────────────────────────────────

import type { ICaseService } from './ICaseService';
import { ConcurrencyConflictError } from './ConcurrencyConflictError';
import type { Case } from '../../types/case/Case';
import { storageGet, storageSet, storageClear } from '../mockStorage';
import { applyCaseFilters, applyCasePagination } from './caseFilterUtils';

// v3 key forces reset to pick up Stage 0 seed cases (O26-0018/0019/0020) —
// see Stage 0 Requirements §5 (S0-MD-01). v2 was the reportingMode fix
// (was 'pathscribe', now 'orchestrator').
const STORAGE_KEY = 'orch_cases_v3';
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
function iid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Pete Nimmo (PATH-001) — 5 cases ─────────────────────────

const PETE_CASES: Case[] = [

  {
    id: 'O26-0001', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0001', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0001' },
    originHospitalId: 'HOSP-001',
    // Was 'draft' — wrong for a case meant to represent in-process work
    // sitting past grossing. 'gross-complete' is the real, existing
    // CaseStatus value for exactly this state (see CaseStatus.ts's own
    // doc comment): grossing finalized by the PA, awaiting Microscopic/
    // diagnostic synoptic work by a pathologist. Cases meant to
    // demonstrate the Synoptic Reporting workflow specifically should
    // start here, not at 'draft' — testers creating brand-new cases
    // from Orders still go through the real accessioned → grossing flow
    // and correctly land on 'draft'/'accessioned' themselves.
    status: 'gross-complete' as any,
    patient: { id: 'OPAT-001', mrn: '200001', firstName: 'Robert', lastName: 'Ashford', dateOfBirth: isoYearsAgo(67, 4, 22), sex: 'M' },
    specimens: [
      { id: 'O26-0001-SP-A', label: 'A', description: 'Right hemicolectomy',                   coding: { cpt: ['88309'] }, receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-mol-0001', name: 'Molecular Panel', lisCode: 'MOL', color: '#10b981', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0001-SP-A' }],
        blocks: [
          { id: 'blk-0001-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0001-a1-1', stainName: 'H&E', status: 'Ready for Review' },
            // Real fix, per direct decision: MMR IHC is read as 4 separate
            // antibodies, each its own billable stain going through normal
            // IHC-FIRST/IHC-ADDL sequencing - not a single bundled panel
            // code the way PIN-4's genuine multiplex (one physical stain,
            // one slide) is. Replaces the single 'MMR Panel' placeholder
            // stain that had no real StainType match at all and produced
            // zero billing suggestions.
            { id: 'stn-0001-a1-2', stainName: 'MLH1', status: 'Pending Cut' },
            { id: 'stn-0001-a1-3', stainName: 'MSH2', status: 'Pending Cut' },
            { id: 'stn-0001-a1-4', stainName: 'MSH6', status: 'Pending Cut' },
            { id: 'stn-0001-a1-5', stainName: 'PMS2', status: 'Pending Cut' },
          ] },
          { id: 'blk-0001-a2', label: '2', status: 'Embedded', stains: [
            { id: 'stn-0001-a2-1', stainName: 'H&E', status: 'Coverslipped' },
          ] },
          { id: 'blk-0001-a3', label: '3', status: 'Grossed', stains: [] },
        ] },
      { id: 'O26-0001-SP-B', label: 'B', description: 'Ileocolic lymph nodes, separate packet', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0001-SP-C', label: 'C', description: 'Appendix',                              receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. James Caldwell', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Colorectal adenocarcinoma. CT: 4.2 cm mass at hepatic flexure, no distant metastases. CEA 12.4. Proceeding to right hemicolectomy.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'colorectal-mdt', tagClass: 'ADMINISTRATIVE', name: 'Colorectal MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'clin-corr',      tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',      color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        "Received fresh, labeled with the patient's name and \"right hemicolectomy,\" is a segment of colon measuring 24.0 cm in length with an attached segment of terminal ileum measuring 6.5 cm and an attached appendix measuring 7.5 x 1.0 cm. The serosal surface is smooth and glistening with an attached rim of pericolic adipose tissue. On opening, there is an exophytic, ulcerated mass at the hepatic flexure measuring 4.2 x 3.5 x 2.0 cm, situated 14.0 cm from the proximal (ileal) margin and 8.0 cm from the distal margin. The mass has a white-tan, firm cut surface and grossly appears to infiltrate into, but not through, the muscularis propria. The remaining colonic mucosa is unremarkable. The mesenteric fat contains multiple firm, tan-white nodules up to 1.2 cm, consistent with lymph nodes. Representative sections submitted per the cassette key.\n\n" +
        "Received separately, labeled \"ileocolic lymph nodes,\" is an aggregate of fibrofatty tissue measuring 8.0 x 5.0 x 2.5 cm containing twelve discrete firm, tan-white nodules ranging from 0.4 to 1.5 cm, entirely submitted.\n\n" +
        "Received separately, labeled \"appendix,\" is a vermiform appendix measuring 7.5 x 1.0 cm with an unremarkable serosal surface. The cut surface reveals a patent lumen throughout without a mass lesion. Representative sections submitted.",
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0001-SP-A_colon_${iid()}`, specimenId: 'O26-0001-SP-A', templateId: 'colon_resection', templateName: 'Generic Template — Colon Resection', status: 'draft', answers: {}, createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0) }],
    // Previously missing entirely — for any specimen. Real
    // GrossingReportInstance per specimen, all 'finalized' since Gross
    // is meant to be complete for a case at this stage; answers use the
    // grossing_standard_tissue template's actual real field ids, not
    // invented ones.
    grossingReports: [
      {
        instanceId: `O26-0001-SP-A_grossing_${iid()}`, specimenId: 'O26-0001-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right hemicolectomy', weight: '285',
          overall_dimensions: '24.0 x 6.0 x 5.0 cm (colon), 6.5 cm attached terminal ileum',
          external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Long suture marks the proximal (ileal) margin per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '4.2 x 3.5 x 2.0 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '8.0 cm to distal margin', cut_surface: 'White-tan, firm, infiltrating into but not grossly through the muscularis propria',
          submission_status: 'submission_representative', total_cassettes: '9',
          cassette_key: '1-3: Tumor with adjacent wall; 4: Proximal margin; 5: Distal margin; 6-8: Mesenteric lymph nodes; 9: Uninvolved colon',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Specimen oriented by surgeon with a long suture marking the proximal margin.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0001-SP-B_grossing_${iid()}`, specimenId: 'O26-0001-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Ileocolic lymph node packet', weight: '18',
          overall_dimensions: '8.0 x 5.0 x 2.5 cm aggregate',
          external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink', 'color_yellow_adipose'],
          orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '4', cassette_key: '1-4: Lymph nodes, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Twelve discrete lymph nodes identified on dissection, ranging 0.4-1.5 cm.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0001-SP-C_grossing_${iid()}`, specimenId: 'O26-0001-SP-C',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Appendix', weight: '6', overall_dimensions: '7.5 x 1.0 cm',
          external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_representative', total_cassettes: '2',
          cassette_key: '1: Proximal margin; 2: Mid/distal appendix with tip',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Lumen patent throughout; no mass lesion identified grossly.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0002', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0002', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0002' },
    originHospitalId: 'HOSP-001', status: 'gross-complete' as any,
    patient: { id: 'OPAT-002', mrn: '200002', firstName: 'Patricia', lastName: 'Okafor', dateOfBirth: isoYearsAgo(61, 9, 3), sex: 'F' },
    specimens: [
      { id: 'O26-0002-SP-A', label: 'A', description: 'Right lower lobe lobectomy',      receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-mprof-0002', name: 'Molecular Profiling', lisCode: 'MPROF', color: '#3b82f6', severity: 3, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0002-SP-A' }],
        blocks: [
          { id: 'blk-0002-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0002-a1-1', stainName: 'H&E', status: 'Ready for Review' },
            { id: 'stn-0002-a1-2', stainName: 'NGS Panel', status: 'Pending Cut' },
          ] },
          { id: 'blk-0002-a2', label: '2', status: 'Grossed', stains: [{ id: 'stn-0002-a2-1', stainName: 'H&E', status: 'Staining' }] },
        ] },
      { id: 'O26-0002-SP-B', label: 'B', description: 'Station 7 subcarinal lymph nodes', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Mr. Andrew Pearce', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Right lower lobe mass 3.1 cm. Core biopsy: adenocarcinoma TTF-1+. EGFR/ALK/ROS1 pending. PET-CT: no distant disease. VATS right lower lobectomy.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'stat-rush',    tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing', color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'thoracic-mdt', tagClass: 'ADMINISTRATIVE', name: 'Thoracic MDT Scheduled',  color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "right lower lobectomy," is a wedge-shaped segment of lung measuring 11.0 x 8.0 x 5.5 cm with an attached staple line along the bronchovascular margin. The pleural surface is smooth and glistening without puckering. On sectioning, there is a firm, white-tan mass measuring 3.1 x 2.8 x 2.4 cm located 1.8 cm from the pleural surface and 2.5 cm from the bronchial margin. The mass has irregular, spiculated borders and does not grossly involve the visceral pleura. The surrounding lung parenchyma is unremarkable without additional nodules. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "station 7 subcarinal lymph nodes," is fibrofatty tissue measuring 3.5 x 2.0 x 1.5 cm containing three discrete lymph nodes ranging 0.5-1.4 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0002-SP-A_lung_${iid()}`, specimenId: 'O26-0002-SP-A', templateId: 'lung_resection', templateName: 'Generic Template — Lung Resection', status: 'draft', answers: {}, createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0) }],
    grossingReports: [
      {
        instanceId: `O26-0002-SP-A_grossing_${iid()}`, specimenId: 'O26-0002-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right lower lobectomy', weight: '210',
          overall_dimensions: '11.0 x 8.0 x 5.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_by_surgeon',
          orientation_inking_detail: 'Staple line marks the bronchovascular margin per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '3.1 x 2.8 x 2.4 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '2.5 cm to bronchial margin', cut_surface: 'White-tan, firm, spiculated borders, not grossly involving visceral pleura',
          submission_status: 'submission_representative', total_cassettes: '7',
          cassette_key: '1-2: Tumor with adjacent lung; 3: Bronchial margin; 4: Vascular margin; 5-6: Non-involved lung; 7: Pleura adjacent to tumor',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Margins grossly clear of tumor.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0002-SP-B_grossing_${iid()}`, specimenId: 'O26-0002-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Station 7 subcarinal lymph nodes', weight: '5',
          overall_dimensions: '3.5 x 2.0 x 1.5 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '2',
          cassette_key: '1-2: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Three discrete lymph nodes identified on dissection, ranging 0.5-1.4 cm.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0003', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0003', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0003' },
    originHospitalId: 'HOSP-001', status: 'gross-complete' as any,
    patient: { id: 'OPAT-003', mrn: '200003', firstName: 'David', lastName: 'Marchetti', dateOfBirth: isoYearsAgo(64, 1, 8), sex: 'M' },
    specimens: [
      { id: 'O26-0003-SP-A', label: 'A', description: 'Radical prostatectomy',    receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [],
        blocks: [
          { id: 'blk-0003-a1', label: '1', status: 'Embedded', stains: [{ id: 'stn-0003-a1-1', stainName: 'H&E', status: 'Ready for Review' }] },
          { id: 'blk-0003-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-0003-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
          { id: 'blk-0003-a3', label: '3', status: 'Embedded', stains: [{ id: 'stn-0003-a3-1', stainName: 'H&E', status: 'Ready for Review' }] },
          { id: 'blk-0003-a4', label: '4', status: 'Grossed', stains: [] },
        ] },
      { id: 'O26-0003-SP-B', label: 'B', description: 'Right pelvic lymph nodes',  receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'O26-0003-SP-C', label: 'C', description: 'Left pelvic lymph nodes',   receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. Simon Hartley', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Prostate adenocarcinoma. Systematic biopsy: Gleason 3+4=7 (Grade Group 2), PSA 8.2. mpMRI: PI-RADS 4 left mid-gland. Robotic radical prostatectomy with bilateral pelvic lymph node dissection.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'urology-mdt', tagClass: 'ADMINISTRATIVE', name: 'Urology MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'clin-corr',   tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',  color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "radical prostatectomy," is a prostate gland with attached seminal vesicles measuring 4.5 x 4.0 x 3.5 cm and weighing 42 g. The entire external surface is inked (right = blue, left = black, anterior = green, posterior = yellow) prior to sectioning. On serial sectioning, there is an ill-defined, firm, gray-white area within the left mid-gland peripheral zone measuring 1.8 x 1.5 x 1.2 cm, situated 0.3 cm from the left posterolateral inked margin. The right lobe is unremarkable on gross inspection. Both seminal vesicles are grossly unremarkable. The gland is entirely submitted per the cassette key.\n\n' +
        'Received separately, labeled "right pelvic lymph nodes," is fibrofatty tissue measuring 5.0 x 3.0 x 1.5 cm containing five grossly identified lymph nodes ranging 0.3-1.0 cm, entirely submitted.\n\n' +
        'Received separately, labeled "left pelvic lymph nodes," is fibrofatty tissue measuring 4.5 x 3.5 x 1.5 cm containing four grossly identified lymph nodes ranging 0.4-1.1 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0003-SP-A_prostate_${iid()}`, specimenId: 'O26-0003-SP-A', templateId: 'prostate_resection', templateName: 'Generic Template — Prostate Resection', status: 'draft', answers: {}, createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1) }],
    grossingReports: [
      {
        instanceId: `O26-0003-SP-A_grossing_${iid()}`, specimenId: 'O26-0003-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Radical prostatectomy with seminal vesicles', weight: '42',
          overall_dimensions: '4.5 x 4.0 x 3.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Entire surface inked: right = blue, left = black, anterior = green, posterior = yellow',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '1.8 x 1.5 x 1.2 cm', lesion_color_consistency: 'lesion_color_other',
          distance_to_closest_margin: '0.3 cm to left posterolateral inked margin', cut_surface: 'Ill-defined, firm, gray-white area, left mid-gland peripheral zone',
          submission_status: 'submission_entire', total_cassettes: '24',
          cassette_key: '1-2: Right seminal vesicle base; 3-4: Left seminal vesicle base; 5-20: Prostate, apex to base, sequential whole-mounts; 21-24: Apical and basal margins',
          megablock_used: 'megablock_yes', megablock_key: 'Cassettes 5-20: whole-mount sections combining right and left halves at each level',
          gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Entire gland submitted per whole-mount protocol given close approximation of lesion to posterolateral margin.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        instanceId: `O26-0003-SP-B_grossing_${iid()}`, specimenId: 'O26-0003-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Right pelvic lymph nodes', weight: '9',
          overall_dimensions: '5.0 x 3.0 x 1.5 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '3',
          cassette_key: '1-3: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Five discrete lymph nodes identified on dissection, ranging 0.3-1.0 cm.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
      {
        instanceId: `O26-0003-SP-C_grossing_${iid()}`, specimenId: 'O26-0003-SP-C',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Left pelvic lymph nodes', weight: '8',
          overall_dimensions: '4.5 x 3.5 x 1.5 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '3',
          cassette_key: '1-3: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Four discrete lymph nodes identified on dissection, ranging 0.4-1.1 cm.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
      },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
  } as any,

  {
    id: 'O26-0004', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0004', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0004' },
    originHospitalId: 'HOSP-001', status: 'gross-complete' as any,
    patient: { id: 'OPAT-004', mrn: '200004', firstName: 'Sandra', lastName: 'Kovacs', dateOfBirth: isoYearsAgo(44, 7, 19), sex: 'F' },
    specimens: [
      { id: 'O26-0004-SP-A', label: 'A', description: 'Left total mastectomy',                        coding: { cpt: ['88307'] }, receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'comp-erh2-0004', name: 'ER / PR / HER2', lisCode: 'ERH2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0004-SP-A' }],
        blocks: [
          { id: 'blk-0004-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0004-a1-1', stainName: 'H&E', status: 'Ready for Review' },
            { id: 'stn-0004-a1-2', stainName: 'ER', status: 'Staining' },
            { id: 'stn-0004-a1-3', stainName: 'PR', status: 'Staining' },
            { id: 'stn-0004-a1-4', stainName: 'HER2', status: 'Pending Cut' },
          ] },
          { id: 'blk-0004-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-0004-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
        ] },
      { id: 'O26-0004-SP-B', label: 'B', description: 'Left axillary sentinel lymph node — level I',   receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Rachel Kim', facilityId: 'c-westside', facilityName: 'Westside Surgical Centre', clinicalIndication: 'Triple-negative breast carcinoma. Core biopsy: Grade 3 IDC, Ki-67 78%. BRCA1 pathogenic variant. Neoadjuvant chemotherapy completed. Total mastectomy with sentinel lymph node biopsy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    firstTouchedAt: isoDaysAgo(0),
    caseFlags: [
      { id: 'stat-rush',   tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',            color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'brca1-var',   tagClass: 'ADMINISTRATIVE', name: 'BRCA1 Pathogenic Variant',           color: '#a855f7', level: 'Case', status: 'Active', severity: 4 },
      { id: 'onc-tx-resp', tagClass: 'ADMINISTRATIVE', name: 'Oncology Treatment Response — Pending', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "left total mastectomy," is an ellipse of skin and breast tissue measuring 20.0 x 14.0 x 5.0 cm, with an ellipse of overlying skin measuring 16.0 x 7.0 cm including a healed biopsy site marked with a suture. The specimen is inked (superior = blue, inferior = black, medial = green, lateral = yellow, anterior/skin = orange, posterior/deep = red) prior to sectioning. On serial sectioning, there is a residual, ill-defined, firm, gray-white fibrotic area at the site of the prior biopsy marker clip measuring 1.4 x 1.0 x 0.8 cm, located in the upper outer quadrant, 1.5 cm from the deep (posterior) margin and 2.2 cm from the skin. No other discrete masses are identified; the remaining breast parenchyma shows post-treatment fibrous change. Representative sections submitted per the cassette key, including the clip site and all inked margins.\n\n' +
        'Received separately, labeled "left axillary sentinel lymph node, level I," is a single lymph node measuring 1.8 x 1.2 x 1.0 cm with a firm, tan-white cut surface, bisected and entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0004-SP-A_breast_${iid()}`, specimenId: 'O26-0004-SP-A', templateId: 'breast_invasive', templateName: 'Generic Template — Breast Invasive', status: 'draft', answers: {}, createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0) }],
    grossingReports: [
      {
        instanceId: `O26-0004-SP-A_grossing_${iid()}`, specimenId: 'O26-0004-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Left total mastectomy', weight: '620',
          overall_dimensions: '20.0 x 14.0 x 5.0 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Superior = blue, inferior = black, medial = green, lateral = yellow, anterior/skin = orange, posterior/deep = red',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '1.4 x 1.0 x 0.8 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '1.5 cm to deep (posterior) margin', cut_surface: 'Residual ill-defined fibrotic area at prior biopsy clip site, post-treatment change',
          submission_status: 'submission_representative', total_cassettes: '11',
          cassette_key: '1-3: Clip site/residual lesion; 4: Deep margin; 5: Anterior/skin margin; 6-9: Additional margins (superior, inferior, medial, lateral); 10: Nipple; 11: Uninvolved breast',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Biopsy marker clip identified within residual fibrotic focus, correlating with prior core biopsy site.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0004-SP-B_grossing_${iid()}`, specimenId: 'O26-0004-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Left axillary sentinel lymph node, level I', weight: '2',
          overall_dimensions: '1.8 x 1.2 x 1.0 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '1', cassette_key: '1: Bisected lymph node, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Single sentinel node, bisected, entirely submitted per protocol.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0005', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0005', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0005' },
    originHospitalId: 'HOSP-001', status: 'gross-complete' as any,
    patient: { id: 'OPAT-005', mrn: '200005', firstName: 'Grace', lastName: 'Nakamura', dateOfBirth: isoYearsAgo(38, 3, 12), sex: 'F' },
    specimens: [
      { id: 'O26-0005-SP-A', label: 'A', description: 'Total thyroidectomy',                   receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
      { id: 'O26-0005-SP-B', label: 'B', description: 'Right central compartment lymph nodes',  receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Thomas Walsh', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Papillary thyroid carcinoma. FNA: malignant (Bethesda VI). Ultrasound: 2.4 cm solid hypoechoic nodule right lobe. Total thyroidectomy with right central compartment dissection.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'endocrine-mdt', tagClass: 'ADMINISTRATIVE', name: 'Endocrine MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'clin-corr',     tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',    color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "total thyroidectomy," is a bilobed thyroid gland with isthmus measuring 6.5 x 4.5 x 2.5 cm and weighing 28 g. The right lobe measures 4.0 x 2.8 x 2.2 cm and the left lobe measures 3.5 x 2.5 x 2.0 cm. The external capsular surface is smooth and glistening throughout. On sectioning the right lobe, there is a firm, gray-white, non-encapsulated nodule measuring 2.4 x 2.0 x 1.8 cm with irregular, infiltrative borders, located 0.4 cm from the closest inked capsular margin. The left lobe is unremarkable with a homogeneous tan-brown cut surface. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "right central compartment lymph nodes," is fibrofatty and thymic tissue measuring 4.0 x 2.5 x 1.5 cm containing four grossly identified lymph nodes ranging 0.3-0.9 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0005-SP-A_grossing_${iid()}`, specimenId: 'O26-0005-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Total thyroidectomy', weight: '28',
          overall_dimensions: '6.5 x 4.5 x 2.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_brown'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Right lobe capsule inked prior to sectioning',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '2.4 x 2.0 x 1.8 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.4 cm to inked capsular margin', cut_surface: 'Firm, gray-white, non-encapsulated, irregular infiltrative borders',
          submission_status: 'submission_representative', total_cassettes: '8',
          cassette_key: '1-3: Right lobe lesion with capsule; 4: Right lobe remaining; 5-6: Left lobe; 7: Isthmus; 8: Closest margin',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Right lobe lesion abuts but does not grossly breach the capsule.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
      {
        instanceId: `O26-0005-SP-B_grossing_${iid()}`, specimenId: 'O26-0005-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Right central compartment lymph nodes', weight: '6',
          overall_dimensions: '4.0 x 2.5 x 1.5 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '2',
          cassette_key: '1-2: Lymph nodes and thymic tissue, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Four discrete lymph nodes identified on dissection, ranging 0.3-0.9 cm.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
    ],
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
  } as any,
];

// ─── Paul Carter (PATH-UK-001) — 3 cases ─────────────────────

const PAUL_CASES: Case[] = [

  {
    id: 'O26-0006', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0006', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0006' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-006', mrn: '300001', firstName: 'James', lastName: 'Whitmore', dateOfBirth: isoYearsAgo(58, 11, 3), sex: 'M' },
    specimens: [
      { id: 'O26-0006-SP-A', label: 'A', description: 'Left radical nephrectomy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-vhl-0006', name: 'VHL Mutation', lisCode: 'VHL', color: '#10b981', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0006-SP-A' }],
        blocks: [
          { id: 'blk-0006-a1', label: '1', status: 'Embedded', stains: [{ id: 'stn-0006-a1-1', stainName: 'H&E', status: 'Ready for Review' }] },
          { id: 'blk-0006-a2', label: '2', status: 'Grossed', stains: [] },
        ] },
      { id: 'O26-0006-SP-B', label: 'B', description: 'Renal hilar lymph node',   receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. Gavin Fletcher', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Clear cell renal cell carcinoma. CT: 6.8 cm heterogeneous left renal mass with renal vein thrombus, no distant metastases. Left radical nephrectomy.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-UK-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'urology-mdt',  tagClass: 'ADMINISTRATIVE', name: 'Urology MDT Scheduled',                 color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'renal-vein',   tagClass: 'ADMINISTRATIVE', name: 'Renal Vein Invasion — Staging Pending', color: '#f59e0b', level: 'Case', status: 'Active', severity: 4 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "left radical nephrectomy," is a kidney with attached perinephric fat and adrenal gland, together measuring 14.0 x 9.0 x 8.0 cm, with an attached segment of renal vein measuring 4.0 cm in length. The renal capsule strips with ease over the uninvolved parenchyma. On bivalving, there is a well-circumscribed but bulging, heterogeneous, golden-yellow mass measuring 6.8 x 6.2 x 5.5 cm centered in the upper pole, with areas of hemorrhage and necrosis. The mass extends to but does not grossly breach the renal capsule and is confined within Gerota\'s fascia. A tan, friable thrombus measuring 3.5 cm in length is present within the lumen of the renal vein, grossly appearing to arise from the mass. The adrenal gland is separately identified and grossly unremarkable. The renal artery and ureteric margins are inked and sectioned. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "renal hilar lymph node," is a single lymph node measuring 1.2 x 0.8 x 0.6 cm, bisected and entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0006-SP-A_kidney_${iid()}`, specimenId: 'O26-0006-SP-A', templateId: 'kidney_resection', templateName: 'Generic Template — Kidney Resection', status: 'draft', answers: {}, createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0) }],
    grossingReports: [
      {
        instanceId: `O26-0006-SP-A_grossing_${iid()}`, specimenId: 'O26-0006-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Left radical nephrectomy with adrenal gland', weight: '480',
          overall_dimensions: '14.0 x 9.0 x 8.0 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Renal artery and ureteric margins inked prior to sectioning',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: '6.8 x 6.2 x 5.5 cm', lesion_color_consistency: 'lesion_color_yellow_soft',
          distance_to_closest_margin: 'Confined within Gerota\'s fascia, does not grossly breach renal capsule',
          cut_surface: 'Heterogeneous, golden-yellow, with hemorrhage and necrosis; tan friable thrombus within renal vein lumen',
          submission_status: 'submission_representative', total_cassettes: '10',
          cassette_key: '1-3: Tumor with capsule; 4: Renal vein with thrombus; 5: Renal artery margin; 6: Ureteric margin; 7: Adrenal gland; 8-9: Uninvolved renal parenchyma; 10: Perinephric fat',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Renal vein thrombus grossly appears contiguous with the primary mass; submitted specifically to assess venous invasion.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0006-SP-B_grossing_${iid()}`, specimenId: 'O26-0006-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Renal hilar lymph node', weight: '1',
          overall_dimensions: '1.2 x 0.8 x 0.6 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '1', cassette_key: '1: Bisected lymph node, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Single hilar lymph node, bisected, entirely submitted.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0007', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0007', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0007' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-007', mrn: '300002', firstName: 'William', lastName: 'Battersby', dateOfBirth: isoYearsAgo(63, 5, 28), sex: 'M' },
    specimens: [
      { id: 'O26-0007-SP-A', label: 'A', description: 'Ivor-Lewis oesophagectomy',   receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'comp-pdl1-0007', name: 'PD-L1 CPS', lisCode: 'PDL1', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0007-SP-A' }] },
      { id: 'O26-0007-SP-B', label: 'B', description: 'Mediastinal lymph nodes',       receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'O26-0007-SP-C', label: 'C', description: 'Coeliac axis lymph nodes',      receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Mr. Alistair Drummond', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Oesophageal adenocarcinoma (GOJ). Biopsy: adenocarcinoma. CT/PET: T3N1M0. HER2 equivocal. Neoadjuvant FLOT x6 cycles, partial response. Ivor-Lewis oesophagectomy.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-UK-001', assignedParticipationTypeId: 'primary' },
    firstTouchedAt: isoDaysAgo(0),
    caseFlags: [
      { id: 'stat-rush',   tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',               color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'onc-tx-resp', tagClass: 'ADMINISTRATIVE', name: 'Oncology Treatment Response — Pending', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'gi-mdt',      tagClass: 'ADMINISTRATIVE', name: 'GI MDT Scheduled',                      color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "Ivor-Lewis oesophagectomy," is a segment of oesophagus and proximal stomach measuring 22.0 cm in length overall (oesophagus 14.0 cm, gastric cuff 8.0 cm) with an attached stapled anastomotic ring. The mucosal surface of the gastro-oesophageal junction shows an irregular, ulcerated, plaque-like area of thickening measuring 3.8 x 3.0 cm, centered at the junction and extending 1.5 cm into the distal oesophagus and 2.0 cm into the proximal stomach. The lesion has a firm, white-tan cut surface with focal residual mucin pools grossly consistent with post-treatment change. The proximal (oesophageal) margin is 10.5 cm from the lesion and the distal (gastric) margin is 5.5 cm from the lesion. The remaining mucosa shows patchy erythema without additional discrete lesions. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "mediastinal lymph nodes," is fibrofatty tissue measuring 6.0 x 3.5 x 2.0 cm containing seven grossly identified lymph nodes ranging 0.4-1.6 cm, entirely submitted.\n\n' +
        'Received separately, labeled "coeliac axis lymph nodes," is fibrofatty tissue measuring 3.0 x 2.0 x 1.0 cm containing two grossly identified lymph nodes measuring 0.5 cm and 0.8 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0007-SP-A_grossing_${iid()}`, specimenId: 'O26-0007-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Ivor-Lewis oesophagectomy with gastric cuff', weight: '340',
          overall_dimensions: '22.0 cm overall length (14.0 cm oesophagus, 8.0 cm gastric cuff)',
          external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Proximal (oesophageal) margin marked with a long suture per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '3.8 x 3.0 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '5.5 cm to distal (gastric) margin', cut_surface: 'Firm, white-tan, with focal residual mucin pools consistent with post-treatment change',
          submission_status: 'submission_representative', total_cassettes: '12',
          cassette_key: '1-4: Tumor bed at GOJ, sequential; 5: Proximal margin; 6: Distal margin; 7-10: Additional tumor bed sections; 11-12: Uninvolved oesophagus and stomach',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Post-neoadjuvant specimen — entire tumor bed at GOJ sampled generously per protocol to assess treatment response.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0007-SP-B_grossing_${iid()}`, specimenId: 'O26-0007-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Mediastinal lymph nodes', weight: '14',
          overall_dimensions: '6.0 x 3.5 x 2.0 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '4',
          cassette_key: '1-4: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Seven discrete lymph nodes identified on dissection, ranging 0.4-1.6 cm.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0007-SP-C_grossing_${iid()}`, specimenId: 'O26-0007-SP-C',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Coeliac axis lymph nodes', weight: '4',
          overall_dimensions: '3.0 x 2.0 x 1.0 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '1',
          cassette_key: '1: Both lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Two discrete lymph nodes identified on dissection, measuring 0.5 cm and 0.8 cm.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0008', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0008', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0008' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-008', mrn: '300003', firstName: 'Nora', lastName: 'Blackwood', dateOfBirth: isoYearsAgo(71, 2, 14), sex: 'F' },
    specimens: [
      { id: 'O26-0008-SP-A', label: 'A', description: 'TURBT — posterior wall bladder', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. David Holloway', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Haematuria. Cystoscopy: 3 cm papillary lesion posterior wall. Prior TURBT 18 months ago: pTa low-grade urothelial carcinoma. Re-resection.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-UK-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'urology-mdt', tagClass: 'ADMINISTRATIVE', name: 'Urology MDT Scheduled',              color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'recurrence',  tagClass: 'ADMINISTRATIVE', name: 'Recurrence — Prior pTa Low-Grade',    color: '#f59e0b', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh in formalin, labeled "TURBT — posterior wall bladder," are multiple tan-pink, papillary and fragmented tissue pieces, in aggregate measuring 3.0 x 2.5 x 1.0 cm. The fragments have a friable, frond-like architecture grossly consistent with papillary urothelial tumor, admixed with smaller fragments of underlying detrusor muscle. No separately identifiable deep/muscularis specimen is submitted separately by the surgeon. Entirely submitted in two cassettes.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0008-SP-A_grossing_${iid()}`, specimenId: 'O26-0008-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'TURBT fragments, posterior wall bladder', weight: '4',
          overall_dimensions: '3.0 x 2.5 x 1.0 cm aggregate', external_surface_features: ['surface_granular'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: '3.0 x 2.5 cm aggregate fragments', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: 'Not applicable — fragmented TURBT specimen, no orientable margin',
          cut_surface: 'Friable, frond-like/papillary fragments admixed with smaller detrusor muscle fragments',
          submission_status: 'submission_entire', total_cassettes: '2',
          cassette_key: '1-2: All fragments, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Fragmented TURBT specimen — detrusor muscle grossly identified within fragments for staging assessment.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,
];

// ─── Amber Fehrs-Battey (PATH-US-001) — 3 cases ──────────────

const AMBER_CASES: Case[] = [

  {
    id: 'O26-0009', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0009', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0009' },
    originHospitalId: 'HOSP-003', status: 'gross-complete' as any,
    patient: { id: 'OPAT-009', mrn: '400001', firstName: 'Marcus', lastName: 'Delray', dateOfBirth: isoYearsAgo(47, 6, 9), sex: 'M' },
    specimens: [
      { id: 'O26-0009-SP-A', label: 'A', description: 'Wide local excision — right upper back',  receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-braf-0009', name: 'BRAF V600E', lisCode: 'BRAFM', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0009-SP-A' }],
        blocks: [
          { id: 'blk-0009-a1', label: '1', status: 'Embedded', stains: [{ id: 'stn-0009-a1-1', stainName: 'H&E', status: 'Ready for Review' }] },
        ] },
      { id: 'O26-0009-SP-B', label: 'B', description: 'Right axillary sentinel lymph node',       receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'STAT', requestingProvider: 'Dr. Lisa Fontaine', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Cutaneous melanoma right upper back. Shave biopsy: invasive melanoma Breslow 2.8 mm, Clark IV, no ulceration. Wide local excision with 2 cm margins and sentinel lymph node biopsy.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'stat-rush',  tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',    color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'second-op',  tagClass: 'ADMINISTRATIVE', name: 'Second Opinion Requested',  color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "wide local excision, right upper back," is an ellipse of skin and subcutaneous tissue measuring 9.5 x 5.5 x 1.8 cm. A prior biopsy site, marked by a healing punch defect with surrounding faint pigmentation, is present 1.2 cm from the closest (superior) margin. No residual grossly visible pigmented lesion is identified beyond the biopsy site. The specimen is inked (superior = blue, inferior = black) and serially sectioned perpendicular to the long axis. Representative sections submitted per the cassette key, including the biopsy site and both peripheral margins.\n\n' +
        'Received separately, labeled "right axillary sentinel lymph node," is a single lymph node measuring 2.0 x 1.5 x 1.2 cm with a homogeneous tan cut surface, bisected and entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0009-SP-A_melanoma_${iid()}`, specimenId: 'O26-0009-SP-A', templateId: 'skin_melanoma_bx', templateName: 'Generic Template — Skin Melanoma Bx', status: 'draft', answers: {}, createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0) }],
    grossingReports: [
      {
        instanceId: `O26-0009-SP-A_grossing_${iid()}`, specimenId: 'O26-0009-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Wide local excision, right upper back', weight: '32',
          overall_dimensions: '9.5 x 5.5 x 1.8 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Superior = blue, inferior = black',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: 'Healing biopsy site, no residual gross pigmented lesion beyond it',
          lesion_color_consistency: 'lesion_color_other', distance_to_closest_margin: '1.2 cm to superior margin',
          cut_surface: 'Healing punch biopsy defect with faint surrounding pigmentation; no discrete residual mass',
          submission_status: 'submission_entire', total_cassettes: '7',
          cassette_key: '1-3: Biopsy site, sequential (bread-loafed); 4: Superior margin; 5: Inferior margin; 6-7: Remaining ellipse',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Entire specimen bread-loafed and submitted given re-excision for melanoma with no grossly visible residual lesion.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0009-SP-B_grossing_${iid()}`, specimenId: 'O26-0009-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right axillary sentinel lymph node', weight: '3',
          overall_dimensions: '2.0 x 1.5 x 1.2 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '1', cassette_key: '1: Bisected lymph node, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Single sentinel node, bisected per protocol for step-sectioning.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0010', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0010', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0010' },
    originHospitalId: 'HOSP-003', status: 'gross-complete' as any,
    patient: { id: 'OPAT-010', mrn: '400002', firstName: 'Dorothy', lastName: 'Vasquez', dateOfBirth: isoYearsAgo(69, 10, 22), sex: 'F' },
    specimens: [
      { id: 'O26-0010-SP-A', label: 'A', description: 'Pancreaticoduodenectomy (Whipple)', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
      { id: 'O26-0010-SP-B', label: 'B', description: 'Peripancreatic lymph nodes',         receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Samuel Ortega', facilityId: 'c-westside', facilityName: 'Westside Surgical Centre', clinicalIndication: 'Pancreatic head adenocarcinoma. EUS-FNA: adenocarcinoma. CT: 2.9 cm mass abutting SMA <180 degrees, no distant disease. CA19-9 841. Neoadjuvant FOLFIRINOX x6 cycles, restaged resectable. Whipple procedure.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    firstTouchedAt: isoDaysAgo(0),
    caseFlags: [
      { id: 'onc-tx-resp', tagClass: 'ADMINISTRATIVE', name: 'Oncology Treatment Response — Pending', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'gi-mdt',      tagClass: 'ADMINISTRATIVE', name: 'GI MDT Scheduled',                      color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "pancreaticoduodenectomy," is a composite specimen comprising pancreatic head, duodenum, distal common bile duct, and a portion of stomach, together measuring 16.0 x 10.0 x 6.0 cm. The pancreatic head measures 4.5 x 4.0 x 3.0 cm. All surgical margins (pancreatic neck, common bile duct, retroperitoneal/SMA, anterior, posterior) are inked in distinct colors prior to sectioning. On sectioning through the pancreatic head, there is a firm, ill-defined, gray-white, fibrotic mass measuring 2.6 x 2.2 x 1.8 cm, located 0.2 cm from the inked retroperitoneal (SMA) margin and 1.0 cm from the pancreatic neck margin. The common bile duct margin and duodenal margins are grossly free of tumor. The ampulla of Vater is identified and grossly unremarkable. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "peripancreatic lymph nodes," is fibrofatty tissue measuring 5.5 x 3.0 x 2.0 cm containing nine grossly identified lymph nodes ranging 0.3-1.3 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0010-SP-A_grossing_${iid()}`, specimenId: 'O26-0010-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Pancreaticoduodenectomy (Whipple)', weight: '410',
          overall_dimensions: '16.0 x 10.0 x 6.0 cm overall; pancreatic head 4.5 x 4.0 x 3.0 cm',
          external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink', 'color_yellow_adipose'],
          orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Pancreatic neck, common bile duct, retroperitoneal/SMA, anterior, and posterior margins each inked a distinct color',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '2.6 x 2.2 x 1.8 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.2 cm to inked retroperitoneal (SMA) margin',
          cut_surface: 'Firm, ill-defined, gray-white, fibrotic — post-neoadjuvant treatment change present',
          submission_status: 'submission_representative', total_cassettes: '14',
          cassette_key: '1-4: Tumor with SMA margin, sequential; 5: Pancreatic neck margin; 6: Common bile duct margin; 7: Ampulla of Vater; 8-9: Duodenal margins; 10-14: Uninvolved pancreas, duodenum, and stomach cuff',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Post-neoadjuvant FOLFIRINOX specimen — SMA margin and tumor bed sampled extensively per protocol given close approximation on gross inspection.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0010-SP-B_grossing_${iid()}`, specimenId: 'O26-0010-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Peripancreatic lymph nodes', weight: '12',
          overall_dimensions: '5.5 x 3.0 x 2.0 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '4',
          cassette_key: '1-4: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Nine discrete lymph nodes identified on dissection, ranging 0.3-1.3 cm.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0011', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0011', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0011' },
    originHospitalId: 'HOSP-003', status: 'gross-complete' as any,
    patient: { id: 'OPAT-011', mrn: '400003', firstName: 'Leon', lastName: 'Hargrove', dateOfBirth: isoYearsAgo(62, 8, 5), sex: 'M' },
    specimens: [
      { id: 'O26-0011-SP-A', label: 'A', description: 'Supraglottic laryngectomy',     receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [{ id: 'comp-pdl1-0011', name: 'PD-L1 CPS', lisCode: 'PDL1', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0011-SP-A' }] },
      { id: 'O26-0011-SP-B', label: 'B', description: 'Left level II/III lymph nodes',  receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
      { id: 'O26-0011-SP-C', label: 'C', description: 'Right level II/III lymph nodes', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Angela Brooks', facilityId: 'c-westside', facilityName: 'Westside Surgical Centre', clinicalIndication: 'Supraglottic squamous cell carcinoma T2N1M0. Laryngoscopy biopsy: moderately differentiated SCC. PET-CT: supraglottic primary, single left level II node. Supraglottic laryngectomy with bilateral neck dissection.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'hn-mdt',    tagClass: 'ADMINISTRATIVE', name: 'Head & Neck MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'clin-corr', tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',      color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "supraglottic laryngectomy," is a laryngeal specimen comprising the epiglottis, false vocal cords, and aryepiglottic folds, measuring 5.5 x 4.5 x 3.0 cm. The mucosal surface of the left aryepiglottic fold and adjacent epiglottis shows an exophytic, ulcerated, firm mass measuring 2.8 x 2.2 x 1.5 cm, extending to but not grossly through the pre-epiglottic fat, with the closest (inferior/deep) margin measuring 0.6 cm. The true vocal cords are grossly free of tumor. Representative sections submitted per the cassette key.\n\n' +
        'Received separately, labeled "left level II/III lymph nodes," is fibrofatty tissue measuring 6.0 x 4.0 x 2.0 cm containing one enlarged, firm lymph node measuring 2.2 cm and four additional smaller nodes ranging 0.4-0.9 cm, entirely submitted.\n\n' +
        'Received separately, labeled "right level II/III lymph nodes," is fibrofatty tissue measuring 5.0 x 3.5 x 1.8 cm containing five grossly unremarkable lymph nodes ranging 0.3-0.8 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0011-SP-A_grossing_${iid()}`, specimenId: 'O26-0011-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Supraglottic laryngectomy', weight: '38',
          overall_dimensions: '5.5 x 4.5 x 3.0 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_by_surgeon',
          orientation_inking_detail: 'Inferior/deep margin marked with a suture per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '2.8 x 2.2 x 1.5 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.6 cm to inferior/deep margin', cut_surface: 'Firm, ulcerated, extends to but not grossly through the pre-epiglottic fat',
          submission_status: 'submission_representative', total_cassettes: '9',
          cassette_key: '1-3: Tumor with adjacent mucosa; 4: Deep/inferior margin; 5: Superior margin; 6: Pre-epiglottic fat; 7: True vocal cords; 8-9: Uninvolved mucosa',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'True vocal cords grossly spared; deep margin sampled specifically given close approximation to pre-epiglottic fat.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
      {
        instanceId: `O26-0011-SP-B_grossing_${iid()}`, specimenId: 'O26-0011-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Left level II/III lymph nodes', weight: '15',
          overall_dimensions: '6.0 x 4.0 x 2.0 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: '2.2 cm enlarged node', lesion_color_consistency: 'lesion_color_white_tan_firm',
          submission_status: 'submission_entire', total_cassettes: '4',
          cassette_key: '1: Enlarged 2.2 cm node, bisected; 2-4: Remaining four lymph nodes, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'One grossly enlarged, firm lymph node (2.2 cm) identified separately from four smaller, unremarkable nodes.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
      {
        instanceId: `O26-0011-SP-C_grossing_${iid()}`, specimenId: 'O26-0011-SP-C',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '1', specimen_type: 'Right level II/III lymph nodes', weight: '11',
          overall_dimensions: '5.0 x 3.5 x 1.8 cm aggregate', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_no_diffuse', submission_status: 'submission_entire', total_cassettes: '3',
          cassette_key: '1-3: Lymph nodes, entirely submitted', megablock_used: 'megablock_no',
          gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Five grossly unremarkable lymph nodes identified on dissection, ranging 0.3-0.8 cm.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
    ],
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
  } as any,
];

// ─── Bronwyn Prior's cases — gross-complete, awaiting Microscopic ───────────
const BRONWYN_CASES: Case[] = [
  {
    id: 'O26-0021', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0021', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0021' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-021', mrn: '300004', firstName: 'Margaret', lastName: 'Yates', dateOfBirth: isoYearsAgo(64, 3, 11), sex: 'F' },
    specimens: [
      { id: 'O26-0021-SP-A', label: 'A', description: 'Total abdominal hysterectomy with bilateral salpingo-oophorectomy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0021-SP-B', label: 'B', description: 'Pelvic washings',                                                   receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Miss Fiona Radcliffe', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Endometrial carcinoma. Pipelle biopsy: FIGO Grade 2 endometrioid adenocarcinoma. MRI: tumour confined to uterine corpus, no myometrial invasion beyond 50%. Total abdominal hysterectomy with bilateral salpingo-oophorectomy and pelvic washings.', receivedDate: isoDaysAgo(0), assignedTo: 'PATH-UK-003', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'gynae-onc-mdt', tagClass: 'ADMINISTRATIVE', name: 'Gynae-Oncology MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'clin-corr',     tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',         color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "total abdominal hysterectomy with bilateral salpingo-oophorectomy," is a uterus with attached bilateral fallopian tubes and ovaries, together measuring 9.0 x 7.0 x 5.0 cm and weighing 145 g. The cervix measures 3.0 cm in length. On opening the uterine cavity, the endometrium shows a friable, exophytic, tan-pink tumour measuring 3.2 x 2.8 cm, confined to the fundus, with the deepest point of invasion grossly estimated at less than half the myometrial thickness (myometrium measures 1.8 cm at the deepest point of tumour). The cervix, both fallopian tubes, and both ovaries are grossly unremarkable. Representative sections submitted per the cassette key, including the full depth of tumour invasion, cervix, and adnexa bilaterally.\n\n' +
        'Received separately, labeled "pelvic washings," is a cloudy, straw-colored fluid, 40 mL, submitted entirely for cytological preparation.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0021-SP-A_grossing_${iid()}`, specimenId: 'O26-0021-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Total abdominal hysterectomy with bilateral salpingo-oophorectomy', weight: '145',
          overall_dimensions: '9.0 x 7.0 x 5.0 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_not_oriented',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_infiltrative_endophytic',
          lesion_dimensions: '3.2 x 2.8 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: 'Myometrium 1.8 cm at deepest point of invasion, less than half thickness grossly',
          cut_surface: 'Friable, exophytic, tan-pink tumour confined to the endometrium/fundus',
          submission_status: 'submission_representative', total_cassettes: '10',
          cassette_key: '1-3: Tumor with full-thickness myometrium; 4: Cervix, anterior; 5: Cervix, posterior; 6-7: Right tube and ovary; 8-9: Left tube and ovary; 10: Uninvolved endometrium/myometrium',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Full depth of myometrial invasion sampled per protocol for accurate FIGO staging.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
      {
        instanceId: `O26-0021-SP-B_grossing_${iid()}`, specimenId: 'O26-0021-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_fresh', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Pelvic washings', weight: '40',
          overall_dimensions: '40 mL fluid', external_surface_features: [], color: ['color_other'],
          orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '0',
          cassette_key: 'Entire specimen submitted for cytological preparation, not histology cassettes',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Cloudy, straw-colored fluid submitted entirely for cytology.',
        },
        createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0022', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0022', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0022' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-022', mrn: '300005', firstName: 'Colin', lastName: 'Ashby', dateOfBirth: isoYearsAgo(66, 7, 24), sex: 'M' },
    specimens: [
      { id: 'O26-0022-SP-A', label: 'A', description: 'Segmental liver resection, segment VI', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'comp-mol-0022', name: 'Molecular Panel', lisCode: 'MOL', color: '#10b981', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0022-SP-A' }] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. Nicholas Farrow', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Colorectal liver metastasis. History of sigmoid colon adenocarcinoma resected 14 months ago. Surveillance CT: solitary 3.6 cm segment VI lesion, biopsy-proven metastatic adenocarcinoma. Segmental liver resection.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-UK-003', assignedParticipationTypeId: 'primary' },
    firstTouchedAt: isoDaysAgo(0),
    caseFlags: [
      { id: 'hep-mdt',   tagClass: 'ADMINISTRATIVE', name: 'Hepatology MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'onc-await', tagClass: 'ADMINISTRATIVE', name: 'Oncology Awaiting Report', color: '#ef4444', level: 'Case', status: 'Active', severity: 4 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "segmental liver resection, segment VI," is a wedge of liver parenchyma measuring 8.0 x 6.0 x 4.5 cm with a smooth, glistening capsular surface on the non-resected aspect and an inked parenchymal resection margin. On sectioning, there is a well-circumscribed, firm, tan-white nodule measuring 3.6 x 3.2 x 3.0 cm, located 1.2 cm from the inked parenchymal margin. The nodule has a lobulated, umbilicated contour with central pallor, grossly consistent with the known metastatic lesion. The surrounding hepatic parenchyma is red-brown and grossly unremarkable, without cirrhotic nodularity. Representative sections submitted per the cassette key, including the closest margin.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0022-SP-A_grossing_${iid()}`, specimenId: 'O26-0022-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Segmental liver resection, segment VI', weight: '165',
          overall_dimensions: '8.0 x 6.0 x 4.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_brown'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Parenchymal resection margin inked prior to sectioning',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: '3.6 x 3.2 x 3.0 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '1.2 cm to inked parenchymal margin',
          cut_surface: 'Well-circumscribed, lobulated, umbilicated with central pallor, consistent with known metastasis',
          submission_status: 'submission_representative', total_cassettes: '6',
          cassette_key: '1-2: Tumor with closest margin; 3: Tumor, additional section; 4: Uninvolved liver adjacent to tumor; 5-6: Uninvolved liver, distant',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Background liver grossly non-cirrhotic — sampled to confirm on microscopy given relevance to future resection candidacy.',
        },
        createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
      },
    ],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(0),
  } as any,

  {
    id: 'O26-0023', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0023', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0023' },
    originHospitalId: 'HOSP-002', status: 'gross-complete' as any,
    patient: { id: 'OPAT-023', mrn: '300006', firstName: 'Beryl', lastName: 'Simmonds', dateOfBirth: isoYearsAgo(59, 10, 16), sex: 'F' },
    specimens: [
      { id: 'O26-0023-SP-A', label: 'A', description: 'Superficial parotidectomy, left', receivedAt: isoDaysAgo(2), collectedAt: isoDaysAgo(2), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Mr. Edward Kingsley', facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre', clinicalIndication: 'Left parotid mass. FNA: suspicious for mucoepidermoid carcinoma, low-grade favored. MRI: 2.2 cm well-defined lesion, superficial lobe, facial nerve uninvolved clinically. Superficial parotidectomy with facial nerve preservation.', receivedDate: isoDaysAgo(2), assignedTo: 'PATH-UK-003', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'hn-mdt',    tagClass: 'ADMINISTRATIVE', name: 'Head & Neck MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'second-op', tagClass: 'ADMINISTRATIVE', name: 'Second Opinion Requested',  color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: {
      grossDescription:
        'Received fresh, labeled "superficial parotidectomy, left," is a lobulated segment of salivary gland tissue measuring 5.0 x 4.0 x 2.5 cm with a smooth, thin capsule. On sectioning, there is a well-circumscribed, firm, tan-white to gray nodule measuring 2.2 x 2.0 x 1.8 cm with focal cystic change, located centrally within the specimen and 0.8 cm from the closest inked capsular margin. The surrounding parotid parenchyma is unremarkable, tan-yellow, and lobulated. Representative sections submitted per the cassette key, including the closest margin.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    grossingReports: [
      {
        instanceId: `O26-0023-SP-A_grossing_${iid()}`, specimenId: 'O26-0023-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Superficial parotidectomy, left', weight: '32',
          overall_dimensions: '5.0 x 4.0 x 2.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink'], orientation_inking: 'orientation_inked',
          orientation_inking_detail: 'Capsular margin inked prior to sectioning',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_nodular_polypoid',
          lesion_dimensions: '2.2 x 2.0 x 1.8 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.8 cm to closest inked capsular margin',
          cut_surface: 'Well-circumscribed, firm, tan-white to gray, with focal cystic change',
          submission_status: 'submission_representative', total_cassettes: '5',
          cassette_key: '1-2: Tumor with capsule; 3: Closest margin; 4: Additional tumor section; 5: Uninvolved parotid parenchyma',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Cystic component sampled together with solid areas given known association with variable grade in mucoepidermoid carcinoma.',
        },
        createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
      },
    ],
    createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(2),
  } as any,
];

// ─── Pool cases — unassigned, visible to all users ───────────
// 1 STAT (urgent) + 2 Routine
//
// Real fix, per direct report: every case below previously had
// status: 'pool' with no poolId/poolName at all, which fell through
// buildPoolGroupRows' own generic 'Pool' fallback label in the
// worklist — an unnamed bucket with no real, visible connection to
// the real "General Pathology" system pool built for exactly this
// purpose (see mockSubspecialtyService.ts's own 'general' entry).
// These cases represent exactly what that pool exists for — real work
// that hasn't matched a specific subspecialty — so they're now tagged
// with its real id/name rather than falling back to an unlabeled one.
const POOL_CASES: Case[] = [

  // O26-0012: Cervical cone biopsy — STAT urgent pool case
  {
    id: 'O26-0012', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0012', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0012' },
    originHospitalId: 'HOSP-001', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-012', mrn: '500001', firstName: 'Alicia', lastName: 'Fernandez', dateOfBirth: isoYearsAgo(34, 5, 17), sex: 'F' },
    specimens: [
      { id: 'O26-0012-SP-A', label: 'A', description: 'Cervical cone biopsy (LLETZ)',          receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0012-SP-B', label: 'B', description: 'Endocervical curettage — upper margin',  receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'STAT',
      requestingProvider: 'Dr. Jennifer Moss',
      facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital",
      clinicalIndication: 'High-grade squamous intraepithelial lesion (HSIL/CIN3) on colposcopy biopsy. HPV 16 positive. Proceeding to LLETZ cone excision. Urgent margin assessment required.',
      receivedDate: isoDaysAgo(0),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'stat-rush',    tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',        color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'gynae-onc-mdt', tagClass: 'ADMINISTRATIVE', name: 'Gynae-Oncology MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 3 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0013: Skin excision — Routine pool case
  {
    id: 'O26-0013', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0013', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0013' },
    originHospitalId: 'HOSP-001', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-013', mrn: '500002', firstName: 'Harold', lastName: 'Briggs', dateOfBirth: isoYearsAgo(71, 1, 30), sex: 'M' },
    specimens: [
      { id: 'O26-0013-SP-A', label: 'A', description: 'Skin excision — left forearm, 2.5 cm ellipse', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'comp-braf-0013', name: 'BRAF V600E', lisCode: 'BRAFM', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0013-SP-A' }] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Carol Simmons',
      facilityId: 'c-westside', facilityName: 'Westside Surgical Centre',
      clinicalIndication: 'Pigmented lesion left forearm. Punch biopsy: atypical melanocytic proliferation, cannot exclude melanoma. Proceeding to wide local excision with 5 mm margins.',
      receivedDate: isoDaysAgo(1),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'second-op',  tagClass: 'ADMINISTRATIVE', name: 'Second Opinion Requested',        color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'derm-corr',  tagClass: 'ADMINISTRATIVE', name: 'Dermatopathology Correlation',    color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
  } as any,

  // O26-0014: Right breast core needle biopsy — Routine pool case
  {
    id: 'O26-0014', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0014', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0014' },
    originHospitalId: 'HOSP-002', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-014', mrn: '500003', firstName: 'Yvonne', lastName: 'Castellano', dateOfBirth: isoYearsAgo(52, 8, 11), sex: 'F' },
    specimens: [
      { id: 'O26-0014-SP-A', label: 'A', description: 'Right breast core needle biopsy — 12 o\'clock', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [{ id: 'comp-erh2-0014', name: 'ER / PR / HER2', lisCode: 'ERH2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0014-SP-A' }] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Martin Osei',
      facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre',
      clinicalIndication: 'Right breast mass 12 o\'clock position. Mammogram: 18 mm irregular speculated density, BI-RADS 5. Ultrasound-guided core needle biopsy for histological diagnosis prior to surgical planning.',
      receivedDate: isoDaysAgo(1),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'stat-rush',  tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',   color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'onc-await',  tagClass: 'ADMINISTRATIVE', name: 'Oncology Awaiting Report', color: '#ef4444', level: 'Case', status: 'Active', severity: 4 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
  } as any,

  // O26-0015: Liver core biopsy — Pool, already grossed, awaiting pickup
  {
    id: 'O26-0015', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0015', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0015' },
    originHospitalId: 'HOSP-001', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-015', mrn: '500004', firstName: 'Daniel', lastName: 'Okafor', dateOfBirth: isoYearsAgo(58, 2, 9), sex: 'M' },
    specimens: [
      { id: 'O26-0015-SP-A', label: 'A', description: 'Liver core biopsy — right lobe, ultrasound-guided', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [],
        blocks: [
          { id: 'blk-0015-a1', label: '1', status: 'Embedded', stains: [{ id: 'stn-0015-a1-1', stainName: 'H&E', status: 'Ready for Review' }] },
        ] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Helen Marsh',
      facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital",
      clinicalIndication: 'Abnormal liver function tests with hepatomegaly on imaging. MRI: multiple hypervascular lesions, largest 3.4 cm segment VI. Rule out metastatic disease vs. primary hepatocellular carcinoma.',
      receivedDate: isoDaysAgo(0),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'hep-mdt',   tagClass: 'ADMINISTRATIVE', name: 'Hepatology MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'clin-corr', tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',     color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh in formalin labeled "A: liver biopsy" is one core of tan-brown tissue measuring 1.8 cm in length and 0.1 cm in diameter. The core is intact and submitted entirely in one cassette (A1).',
      microscopicDescription: '', ancillaryStudies: '',
    },
    synopticReports: [{ instanceId: `O26-0015-SP-A_liver_${iid()}`, specimenId: 'O26-0015-SP-A', templateId: 'liver_biopsy_medical', templateName: 'Liver Biopsy — Medical (Native)', status: 'draft', answers: {}, createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0) }],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0016: Gastric resection — Pool, already grossed, multi-specimen, STAT
  {
    id: 'O26-0016', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0016', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0016' },
    originHospitalId: 'HOSP-002', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-016', mrn: '500005', firstName: 'Margaret', lastName: 'Whitfield', dateOfBirth: isoYearsAgo(67, 11, 23), sex: 'F' },
    specimens: [
      { id: 'O26-0016-SP-A', label: 'A', description: 'Subtotal gastrectomy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-her2f-0016', name: 'HER2 FISH', lisCode: 'HER2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0016-SP-A' }] },
      { id: 'O26-0016-SP-B', label: 'B', description: 'Greater curvature lymph nodes', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0016-SP-C', label: 'C', description: 'Lesser curvature lymph nodes', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'STAT',
      requestingProvider: 'Mr. Oliver Bancroft',
      facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre',
      clinicalIndication: 'Gastric adenocarcinoma, antrum. Endoscopic biopsy: intestinal-type adenocarcinoma. CT staging: T3N1M0, no distant disease. Subtotal gastrectomy with D2 lymphadenectomy.',
      receivedDate: isoDaysAgo(0),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'gi-mdt',    tagClass: 'ADMINISTRATIVE', name: 'GI MDT Scheduled',      color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
      { id: 'clin-corr', tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation', color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh labeled "A: subtotal gastrectomy" is a partial stomach measuring 14.0 x 8.5 x 2.0 cm. The greater curvature measures 16.5 cm and the lesser curvature measures 9.0 cm. On the mucosal surface at the antrum there is an ulcerated, firm, white-tan mass measuring 4.1 x 3.6 x 1.2 cm, located 2.0 cm from the distal (duodenal) margin and 9.5 cm from the proximal margin. The mass appears to invade through the muscularis propria on sectioning. Representative sections submitted. "B: greater curvature lymph nodes" received fresh consists of adipose tissue containing 6 grossly identified lymph nodes ranging 0.4–1.8 cm, entirely submitted. "C: lesser curvature lymph nodes" received fresh consists of adipose tissue containing 4 grossly identified lymph nodes ranging 0.3–1.1 cm, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0017: Soft tissue / sarcoma excision — Pool, already grossed
  {
    id: 'O26-0017', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0017', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0017' },
    originHospitalId: 'HOSP-003', status: 'pool' as any,
    poolId: 'general', poolName: 'General Pathology',
    patient: { id: 'OPAT-017', mrn: '500006', firstName: 'Patricia', lastName: 'Dunmore', dateOfBirth: isoYearsAgo(45, 4, 30), sex: 'F' },
    specimens: [
      { id: 'O26-0017-SP-A', label: 'A', description: 'Left thigh mass, wide local excision', receivedAt: isoDaysAgo(1), collectedAt: isoDaysAgo(1), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Victor Anand',
      facilityId: 'c-westside', facilityName: 'Westside Surgical Centre',
      clinicalIndication: 'Enlarging left thigh mass. MRI: 7.2 cm deep soft tissue mass, heterogeneous enhancement, suspicious for sarcoma. Core biopsy: spindle cell neoplasm, favor sarcoma. Wide local excision with 2 cm margins.',
      receivedDate: isoDaysAgo(1),
      assignedTo: undefined as any,
      assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'sarcoma-protocol', tagClass: 'ADMINISTRATIVE', name: 'Sarcoma Protocol',     color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'clin-corr',        tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation', color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh labeled "A: left thigh mass" is an ellipse of skin and underlying soft tissue measuring 14.0 x 9.5 x 6.0 cm. The overlying skin measures 13.0 x 8.0 cm and is unremarkable. On sectioning, there is a well-circumscribed but unencapsulated tan-yellow, fleshy mass measuring 7.2 x 6.8 x 5.5 cm within the deep soft tissue, with the closest margin (deep) measuring 0.8 cm. The mass has a variegated cut surface with focal hemorrhage. Margins inked and sectioned per protocol; representative sections submitted in cassettes A1–A8.',
      microscopicDescription: '', ancillaryStudies: '',
    },
    // No real matching Report Template exists for this specimen type in PROTOCOL_REGISTRY (protocolShared.tsx) — starts with no pre-assigned synoptic report, same as any real case whose specimen type has no dedicated template. Use Add Synoptic to pick from what's actually available.
    synopticReports: [],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
  } as any,
];

// ─── Stage 0 seed cases — Orchestration Workflow Requirements §5 (S0-MD-01) ──
// One case per Grossing Route (A/B/C), status 'accessioned' with
// grossingReports populated, so the PA Worklist "Awaiting Grossing" tile
// (WorklistPage.tsx) and handleGrossComplete (SynopticReportPage.tsx) are
// reachable for the first time.
//
// NOTE on deviation from the Stage 0 doc's "repurpose O26-0016/0017" /
// "at least one Pool case" suggestions:
//   - O26-0016 and O26-0017 already carry a fully-written legacy
//     diagnostic.grossDescription (their own comments say "already
//     grossed") — they're seeded for a *different* test scenario
//     (pathologist picks up a pre-grossed pool case to do Micro). Adding a
//     'draft' GrossingReportInstance on top would contradict that and
//     silently break whatever relies on them today, so left untouched.
//   - status: 'pool' was NOT used here. WorklistPage.tsx's "Awaiting
//     Grossing" tile count is `nonPoolStats.filter(c => c.status ===
//     'accessioned')`, and nonPoolStats explicitly excludes status==='pool'
//     first. A Pool-status grossing case would be invisible to the tile
//     this seed data exists to unblock. Used status: 'accessioned' with a
//     real assignedTo (matches CaseStatus.ts's own JSDoc for this status)
//     instead.
//
// Real fix, per direct spec: "This Case is just accessioned it does
// not, should not have any textual data period." Previously each
// grossingReports[].aiSuggestions was pre-seeded with 1-2 suggestions
// derived from accession-time text (specimen description / clinical
// indication) — defensible in isolation, but wrong for this app's
// actual intended model: AI assistance is something the user
// explicitly requests (the Orchestrator button, per-specimen),
// never something pre-populated before they've even opened the
// case. All three cases below now genuinely start blank —
// answers: {} and no aiSuggestions key at all — exactly matching
// what a real, freshly-accessioned case looks like. The Orchestrator
// button remains the real, working, on-demand path to AI assistance
// once the user asks for it.

const STAGE0_CASES: Case[] = [

  // O26-0018: Route A (grossing_standard_tissue) — STAT
  {
    id: 'O26-0018', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0018', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0018' },
    originHospitalId: 'HOSP-001', status: 'accessioned' as any,
    patient: { id: 'OPAT-018', mrn: '600001', firstName: 'Diane', lastName: 'Holbrook', dateOfBirth: isoYearsAgo(56, 9, 14), sex: 'F' },
    specimens: [
      { id: 'O26-0018-SP-A', label: 'A', description: 'Right shoulder skin excision, pigmented lesion', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-braf-0018', name: 'BRAF V600E', lisCode: 'BRAFM', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0018-SP-A' }] },
    ],
    order: {
      priority: 'STAT',
      requestingProvider: 'Dr. Wendy Castillo',
      facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital",
      clinicalIndication: 'Enlarging pigmented lesion right shoulder, irregular border on dermoscopy. Excisional biopsy for histological diagnosis, urgent given clinical suspicion for melanoma.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'stat-rush', tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',       color: '#ef4444', level: 'Case', status: 'Active', severity: 5 },
      { id: 'derm-corr', tagClass: 'ADMINISTRATIVE', name: 'Dermatopathology Correlation', color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    grossingReports: [{
      instanceId: `O26-0018-SP-A_grossing_${iid()}`,
      specimenId: 'O26-0018-SP-A',
      templateId: 'grossing_standard_tissue',
      templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
      status: 'draft',
      answers: {},
      // Real fix, per direct spec: "This Case is just accessioned it
      // does not, should not have any textual data period... The
      // User can indicate to have AI fill out the synoptic template."
      // Previously seeded 2 aiSuggestions here (specimen_type,
      // comments) derived from accession-time text — defensible in
      // isolation (real accession data, honestly labeled unverified),
      // but wrong per this app's actual intended state model: AI
      // assistance is something the user explicitly requests (the
      // Orchestrator button, already fully working), not something
      // pre-populated before they ever open the case. A genuinely
      // fresh accession has nothing here until the user asks for it.
      createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    }],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0019: Route B (grossing_fluid_cytology) — Routine
  {
    id: 'O26-0019', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0019', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0019' },
    originHospitalId: 'HOSP-002', status: 'accessioned' as any,
    patient: { id: 'OPAT-019', mrn: '600002', firstName: 'Walter', lastName: 'Brennan', dateOfBirth: isoYearsAgo(73, 3, 2), sex: 'M' },
    specimens: [
      { id: 'O26-0019-SP-A', label: 'A', description: 'Pleural fluid, diagnostic thoracentesis, left side', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Henry Okoye',
      facilityId: 'c-royal-manchester', facilityName: 'Royal Manchester Centre',
      clinicalIndication: 'New left pleural effusion on chest X-ray, unknown primary. Diagnostic thoracentesis for cytological evaluation, rule out malignant effusion.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-UK-001', assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'onc-await', tagClass: 'ADMINISTRATIVE', name: 'Oncology Awaiting Report', color: '#ef4444', level: 'Case', status: 'Active', severity: 4 },
      { id: 'clin-corr', tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',     color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    grossingReports: [{
      instanceId: `O26-0019-SP-A_grossing_${iid()}`,
      specimenId: 'O26-0019-SP-A',
      templateId: 'grossing_fluid_cytology',
      templateName: 'Fluid / Cell Block Grossing (Gold Standard) — Route B',
      status: 'draft',
      answers: {},
      // Real fix, matching O26-0018's own comment above — see there
      // for the full reasoning.
      createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    }],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0020: Route C (grossing_histology_only) — Routine
  {
    id: 'O26-0020', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0020', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0020' },
    originHospitalId: 'HOSP-003', status: 'accessioned' as any,
    patient: { id: 'OPAT-020', mrn: '600003', firstName: 'Evelyn', lastName: 'Marsh', dateOfBirth: isoYearsAgo(49, 12, 7), sex: 'F' },
    specimens: [
      { id: 'O26-0020-SP-A', label: 'A', description: 'Outside consultation — prior skin biopsy slides, re-review requested', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [{ id: 'comp-braf-0020', name: 'BRAF V600E', lisCode: 'BRAFM', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0020-SP-A' }] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Felicity Adeyemi',
      facilityId: 'c-westside', facilityName: 'Westside Surgical Centre',
      clinicalIndication: 'Outside pathology report read as atypical melanocytic proliferation at referring lab. Slides and block requested for second-opinion review prior to surgical planning.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-US-001', assignedParticipationTypeId: 'primary',
    },
    caseFlags: [
      { id: 'second-op', tagClass: 'ADMINISTRATIVE', name: 'Second Opinion Requested',     color: '#8b5cf6', level: 'Case', status: 'Active', severity: 3 },
      { id: 'pend-corr', tagClass: 'ADMINISTRATIVE', name: 'Pending Clinical Correlation', color: '#f59e0b', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    grossingReports: [{
      instanceId: `O26-0020-SP-A_grossing_${iid()}`,
      specimenId: 'O26-0020-SP-A',
      templateId: 'grossing_histology_only',
      templateName: 'Histology-Only / Direct Triage (Gold Standard) — Route C',
      status: 'draft',
      answers: {},
      // Real fix, matching O26-0018's own comment above — see there
      // for the full reasoning.
      createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    }],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,
];

// ─── Completed demo cases ───────────────────────────────────────────────────
// 3 fully-completed Orchestration cases, added per Pete's request so a data
// reset always restores a known set of finalized cases for demoing the
// completed-report / Final (No Revision) view — distinct from PETE_CASES/
// PAUL_CASES above, which are deliberately left mid-workflow (gross-complete,
// awaiting Microscopic, etc.) to demo those earlier stages and shouldn't be
// disturbed. Both Gross and Microscopic are genuinely complete: grossingReports
// finalized, synopticReports finalized with every required field answered
// (diagnostic field values are generic placeholders — the templates
// themselves only have placeholder "Option N" labels outside the Biomarkers
// section, per the CAP/RCPath content-licensing cleanup noted at the top of
// mockCaseService.ts) plus a fully completed Biomarkers panel, since only
// breast_invasive and lung_adeno carry real markerGroup-tagged fields today.
const COMPLETED_DEMO_CASES: Case[] = [

  {
    id: 'O26-0024', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0024', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0024' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'finalized' as any,
    patient: { id: 'OPAT-024', mrn: '200024', firstName: 'Walter', lastName: 'Higgins', dateOfBirth: isoYearsAgo(69, 2, 14), sex: 'M' },
    specimens: [
      { id: 'O26-0024-SP-A', label: 'A', description: 'Right upper lobectomy', coding: { cpt: ['88309'] }, receivedAt: isoDaysAgo(9), collectedAt: isoDaysAgo(9), specimenFlags: [{ id: 'comp-mprof-0024', name: 'Molecular Profiling', lisCode: 'MPROF', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0024-SP-A' }],
        blocks: [
          { id: 'blk-0024-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0024-a1-1', stainName: 'H&E', status: 'Coverslipped' },
            { id: 'stn-0024-a1-2', stainName: 'PD-L1 (22C3)', status: 'Coverslipped' },
          ] },
          { id: 'blk-0024-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-0024-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
        ] },
      { id: 'O26-0024-SP-B', label: 'B', description: 'Mediastinal lymph node stations 4R, 7, 10R', receivedAt: isoDaysAgo(9), collectedAt: isoDaysAgo(9), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Helen Marsh', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: 'Incidental 3.1 cm right upper lobe nodule on CT surveillance. PET-avid, SUV 8.4. Proceeding to lobectomy with mediastinal lymph node dissection.', receivedDate: isoDaysAgo(9), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'thoracic-mdt', tagClass: 'ADMINISTRATIVE', name: 'Thoracic MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh, labeled "right upper lobectomy," is a lung lobe measuring 12.0 x 8.5 x 4.0 cm with an intact pleural surface. Sectioning reveals a firm, tan-white, spiculated mass measuring 3.1 x 2.8 x 2.5 cm situated 1.8 cm from the nearest staple line and grossly distant from the visceral pleura. Representative sections submitted.\n\nReceived separately, labeled "mediastinal lymph node stations 4R, 7, 10R," are three aggregates of fibrofatty tissue containing multiple lymph nodes, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: 'PD-L1 (22C3), EGFR, ALK, and ROS1 testing performed on the primary tumor block — see Biomarkers section.',
    },
    synopticReports: [{
      instanceId: `O26-0024-SP-A_lung_${iid()}`, specimenId: 'O26-0024-SP-A',
      templateId: 'lung_adeno', templateName: 'Generic Template — Lung Adeno',
      status: 'finalized',
      answers: {
        synchronous_tumors: 'synchronous_tumors_opt_1', procedure: ['procedure_opt_2'], specimen_laterality: 'specimen_laterality_opt_2',
        tumor_focality: 'tumor_focality_opt_1', tumor_site: ['tumor_site_opt_1'], tumor_size: '3.1 cm', invasive_component_size: '2.8 cm',
        histologic_type: 'histologic_type_opt_3', histologic_grade: 'histologic_grade_opt_2', stas: 'stas_opt_2',
        visceral_pleura_invasion: 'visceral_pleura_invasion_opt_1', adjacent_structure_invasion: 'None identified',
        treatment_effect: 'Not applicable — no prior neoadjuvant therapy', lymphovascular_invasion: ['lymphovascular_invasion_opt_1'],
        tumor_comment: 'Tumor confined to lung parenchyma without pleural involvement.',
        margin_status_invasive: 'Negative, closest margin 1.8 cm', margin_status_noninvasive: ['margin_status_noninvasive_opt_1'],
        margin_comment: 'Bronchial and vascular margins free of tumor.',
        prior_ln_sampling: 'prior_ln_sampling_opt_1', regional_ln_status: 'regional_ln_status_opt_1', ln_with_tumor_count: '0',
        nodal_sites_with_tumor: 'None', extranodal_extension: 'extranodal_extension_opt_1', ln_examined_count: '9',
        nodal_sites_examined: 'Stations 4R, 7, 10R', regional_ln_comment: 'All examined lymph nodes negative for malignancy.',
        distant_metastasis_sites: ['distant_metastasis_sites_opt_1'], tnm_descriptors: ['tnm_descriptors_opt_1'],
        stage_category_a: 'stage_category_a_opt_3', stage_category_b: 'stage_category_b_opt_1', stage_category_c: 'stage_category_c_opt_1',
        additional_findings: ['additional_findings_opt_1'], special_studies_note: 'Molecular profiling performed per institutional reflex-testing protocol; see Biomarkers section.',
        comments: 'Findings consistent with primary pulmonary adenocarcinoma, stage pT2aN0.',
        pdl1_tps: 'pdl1_tps_1_49', egfr_status: 'egfr_not_detected', egfr_variant: 'Not applicable', alk_status: 'alk_non_rearranged', ros1_status: 'ros1_not_tested',
      },
      createdAt: isoDaysAgo(8), updatedAt: isoDaysAgo(6),
    }],
    grossingReports: [
      {
        instanceId: `O26-0024-SP-A_grossing_${iid()}`, specimenId: 'O26-0024-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right upper lobectomy', weight: '210',
          overall_dimensions: '12.0 x 8.5 x 4.0 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Staple line marks the parenchymal resection margin',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '3.1 x 2.8 x 2.5 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '1.8 cm to staple line', cut_surface: 'Firm, tan-white, spiculated, distant from the visceral pleura',
          submission_status: 'submission_representative', total_cassettes: '6',
          cassette_key: '1-2: Tumor with adjacent parenchyma; 3: Closest staple margin; 4: Uninvolved lung; 5-6: Pleura',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Specimen oriented by surgeon; staple line marks the bronchovascular margin.',
        },
        createdAt: isoDaysAgo(9), updatedAt: isoDaysAgo(9),
      },
      {
        instanceId: `O26-0024-SP-B_grossing_${iid()}`, specimenId: 'O26-0024-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_fragmented',
          number_of_containers: '3', specimen_type: 'Mediastinal lymph node stations 4R, 7, 10R', weight: '14',
          overall_dimensions: 'Three aggregates, largest 4.0 x 2.5 x 1.5 cm', external_surface_features: ['surface_smooth_glistening'],
          color: ['color_tan_pink', 'color_yellow_adipose'], orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '3', cassette_key: '1: Station 4R; 2: Station 7; 3: Station 10R',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Nine discrete lymph nodes identified across the three station packets.',
        },
        createdAt: isoDaysAgo(9), updatedAt: isoDaysAgo(9),
      },
    ],
    createdAt: isoDaysAgo(9), updatedAt: isoDaysAgo(6),
  } as any,

  {
    id: 'O26-0025', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0025', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0025' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'finalized' as any,
    patient: { id: 'OPAT-025', mrn: '200025', firstName: 'Diane', lastName: 'Castellano', dateOfBirth: isoYearsAgo(55, 6, 2), sex: 'F' },
    specimens: [
      { id: 'O26-0025-SP-A', label: 'A', description: 'Left total mastectomy', coding: { cpt: ['88307'] }, receivedAt: isoDaysAgo(7), collectedAt: isoDaysAgo(7), specimenFlags: [{ id: 'comp-erh2-0025', name: 'ER / PR / HER2', lisCode: 'ERH2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0025-SP-A' }],
        blocks: [
          { id: 'blk-0025-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0025-a1-1', stainName: 'H&E', status: 'Coverslipped' },
            { id: 'stn-0025-a1-2', stainName: 'ER', status: 'Coverslipped' },
            { id: 'stn-0025-a1-3', stainName: 'PR', status: 'Coverslipped' },
            { id: 'stn-0025-a1-4', stainName: 'HER2', status: 'Coverslipped' },
          ] },
          { id: 'blk-0025-a2', label: '2', status: 'Embedded', stains: [{ id: 'stn-0025-a2-1', stainName: 'H&E', status: 'Coverslipped' }] },
        ] },
      { id: 'O26-0025-SP-B', label: 'B', description: 'Left axillary sentinel lymph nodes — three', receivedAt: isoDaysAgo(7), collectedAt: isoDaysAgo(7), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Nathan', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: '2.8 cm left breast mass on screening mammogram, BI-RADS 5. Core biopsy confirmed invasive ductal carcinoma. Proceeding to mastectomy with sentinel node biopsy.', receivedDate: isoDaysAgo(7), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'breast-mdt', tagClass: 'ADMINISTRATIVE', name: 'Breast MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh, labeled "left total mastectomy," is a breast specimen measuring 20.0 x 16.0 x 5.0 cm with attached skin ellipse and nipple. Sectioning reveals a firm, tan-white mass measuring 2.8 x 2.4 x 2.0 cm located at the 10 o\'clock position, 0.8 cm from the deep (posterior) margin. Representative sections submitted.\n\nReceived separately, labeled "left axillary sentinel lymph nodes," are three lymph nodes, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: 'ER, PR, and HER2 immunohistochemistry performed on the primary tumor block — see Biomarkers section.',
    },
    synopticReports: [{
      instanceId: `O26-0025-SP-A_breast_${iid()}`, specimenId: 'O26-0025-SP-A',
      templateId: 'breast_invasive', templateName: 'Generic Template — Breast Invasive',
      status: 'finalized',
      answers: {
        procedure: 'procedure_opt_1', specimen_laterality: 'specimen_laterality_opt_1', tumor_site: ['tumor_site_opt_2'],
        histologic_type: 'histologic_type_opt_1', histologic_grade: 'Grade 2', tumor_size: '2.8 cm', tumor_focality: 'tumor_focality_opt_1',
        dcis: 'Present, low nuclear grade, comprising approximately 10% of tumor volume', tumor_extent: 'Confined to breast parenchyma, no chest wall or skin involvement',
        lvi: 'lvi_opt_2', dermal_lvi: 'dermal_lvi_opt_1', microcalcifications: ['microcalcifications_opt_1'],
        treatment_effect_breast: 'treatment_effect_breast_opt_1', treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
        rcb_parameters: 'Not applicable — no neoadjuvant therapy administered',
        margin_status_invasive: 'margin_status_invasive_opt_1', closest_margins_invasive: ['closest_margins_invasive_opt_1'],
        margins_involved_invasive: ['margins_involved_invasive_opt_1'], distance_invasive_to_named_margins: '0.8 cm to posterior margin',
        margin_status_dcis: 'margin_status_dcis_opt_1', closest_margins_dcis: ['closest_margins_dcis_opt_1'], margins_involved_dcis: ['margins_involved_dcis_opt_1'],
        distance_dcis_to_named_margins: '1.0 cm to posterior margin', margin_comment: 'All margins free of invasive and in situ carcinoma.',
        regional_ln_status: 'regional_ln_status_opt_1', number_ln_macrometastases: '0', number_ln_micrometastases: '0', number_ln_itc: '0',
        largest_nodal_met_mm: '0', extranodal_extension: 'extranodal_extension_opt_1', total_ln_examined: '3', sentinel_ln_examined: '3',
        regional_ln_comment: 'Three sentinel nodes identified and examined, all negative for metastatic carcinoma.',
        distant_metastasis: ['distant_metastasis_opt_1'], ptnm_classification: 'pT2 N0 (sn) — per AJCC 8th edition',
        er_status: 'er_status_positive', er_percent_positive: '95%', er_intensity: 'er_intensity_3',
        pr_status: 'pr_status_positive', pr_percent_positive: '80%', pr_intensity: 'pr_intensity_2',
        her2_ihc_score: 'her2_ihc_1p', her2_ish_status: 'her2_ish_nonamplified', ki67_index: '14%',
      },
      createdAt: isoDaysAgo(6), updatedAt: isoDaysAgo(4),
    }],
    grossingReports: [
      {
        instanceId: `O26-0025-SP-A_grossing_${iid()}`, specimenId: 'O26-0025-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Left total mastectomy', weight: '620',
          overall_dimensions: '20.0 x 16.0 x 5.0 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Superior surface inked black, deep margin inked blue per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '2.8 x 2.4 x 2.0 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.8 cm to deep (posterior) margin', cut_surface: 'Firm, tan-white, stellate, infiltrating margins',
          submission_status: 'submission_representative', total_cassettes: '8',
          cassette_key: '1-3: Tumor with adjacent parenchyma; 4: Deep margin; 5: Superior margin; 6: Nipple; 7-8: Uninvolved parenchyma',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Specimen oriented by surgeon with inked margins as noted.',
        },
        createdAt: isoDaysAgo(7), updatedAt: isoDaysAgo(7),
      },
      {
        instanceId: `O26-0025-SP-B_grossing_${iid()}`, specimenId: 'O26-0025-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Left axillary sentinel lymph nodes', weight: '9',
          overall_dimensions: 'Three nodes, largest 1.8 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '3', cassette_key: '1-3: Sentinel nodes 1-3, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Three sentinel nodes identified by blue dye and radiotracer, submitted entirely.',
        },
        createdAt: isoDaysAgo(7), updatedAt: isoDaysAgo(7),
      },
    ],
    createdAt: isoDaysAgo(7), updatedAt: isoDaysAgo(4),
  } as any,

  {
    id: 'O26-0026', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0026', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0026' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'finalized' as any,
    patient: { id: 'OPAT-026', mrn: '200026', firstName: 'Monica', lastName: 'Ferreira', dateOfBirth: isoYearsAgo(48, 10, 27), sex: 'F' },
    specimens: [
      { id: 'O26-0026-SP-A', label: 'A', description: 'Right breast lumpectomy', coding: { cpt: ['88307'] }, receivedAt: isoDaysAgo(5), collectedAt: isoDaysAgo(5), specimenFlags: [{ id: 'comp-erh2-0026', name: 'ER / PR / HER2', lisCode: 'ERH2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0026-SP-A' }],
        blocks: [
          { id: 'blk-0026-a1', label: '1', status: 'Embedded', stains: [
            { id: 'stn-0026-a1-1', stainName: 'H&E', status: 'Coverslipped' },
            { id: 'stn-0026-a1-2', stainName: 'ER', status: 'Coverslipped' },
            { id: 'stn-0026-a1-3', stainName: 'PR', status: 'Coverslipped' },
            { id: 'stn-0026-a1-4', stainName: 'HER2', status: 'Coverslipped' },
          ] },
        ] },
      { id: 'O26-0026-SP-B', label: 'B', description: 'Right axillary sentinel lymph nodes — two', receivedAt: isoDaysAgo(5), collectedAt: isoDaysAgo(5), specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Nathan', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: '1.6 cm right breast mass, BI-RADS 5. Core biopsy confirmed invasive carcinoma, hormone-receptor studies pending. Proceeding to lumpectomy with sentinel node biopsy.', receivedDate: isoDaysAgo(5), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [
      { id: 'breast-mdt', tagClass: 'ADMINISTRATIVE', name: 'Breast MDT Scheduled', color: '#3b82f6', level: 'Case', status: 'Active', severity: 2 },
    ],
    diagnostic: {
      grossDescription: 'Received fresh, labeled "right breast lumpectomy," is an irregular fragment of fibrofatty breast tissue measuring 6.5 x 5.0 x 3.0 cm. Sectioning reveals a firm, gray-white mass measuring 1.6 x 1.4 x 1.2 cm, 0.5 cm from the closest (superior) inked margin. Representative sections submitted.\n\nReceived separately, labeled "right axillary sentinel lymph nodes," are two lymph nodes, entirely submitted.',
      microscopicDescription: '', ancillaryStudies: 'ER, PR, and HER2 immunohistochemistry performed on the primary tumor block — see Biomarkers section.',
    },
    synopticReports: [{
      instanceId: `O26-0026-SP-A_breast_${iid()}`, specimenId: 'O26-0026-SP-A',
      templateId: 'breast_invasive', templateName: 'Generic Template — Breast Invasive',
      status: 'finalized',
      answers: {
        procedure: 'procedure_opt_2', specimen_laterality: 'specimen_laterality_opt_2', tumor_site: ['tumor_site_opt_3'],
        histologic_type: 'histologic_type_opt_1', histologic_grade: 'Grade 3', tumor_size: '1.6 cm', tumor_focality: 'tumor_focality_opt_1',
        dcis: 'Not identified', tumor_extent: 'Confined to breast parenchyma, no chest wall or skin involvement',
        lvi: 'lvi_opt_2', dermal_lvi: 'dermal_lvi_opt_1', microcalcifications: ['microcalcifications_opt_2'],
        treatment_effect_breast: 'treatment_effect_breast_opt_1', treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
        rcb_parameters: 'Not applicable — no neoadjuvant therapy administered',
        margin_status_invasive: 'margin_status_invasive_opt_1', closest_margins_invasive: ['closest_margins_invasive_opt_2'],
        margins_involved_invasive: ['margins_involved_invasive_opt_1'], distance_invasive_to_named_margins: '0.5 cm to superior margin',
        margin_status_dcis: 'margin_status_dcis_opt_1', closest_margins_dcis: ['closest_margins_dcis_opt_1'], margins_involved_dcis: ['margins_involved_dcis_opt_1'],
        distance_dcis_to_named_margins: 'Not applicable — no DCIS identified', margin_comment: 'All margins free of invasive carcinoma.',
        regional_ln_status: 'regional_ln_status_opt_1', number_ln_macrometastases: '0', number_ln_micrometastases: '0', number_ln_itc: '0',
        largest_nodal_met_mm: '0', extranodal_extension: 'extranodal_extension_opt_1', total_ln_examined: '2', sentinel_ln_examined: '2',
        regional_ln_comment: 'Two sentinel nodes identified and examined, both negative for metastatic carcinoma.',
        distant_metastasis: ['distant_metastasis_opt_1'], ptnm_classification: 'pT1c N0 (sn) — per AJCC 8th edition',
        er_status: 'er_status_negative', er_percent_positive: '0%', er_intensity: 'er_intensity_1',
        pr_status: 'pr_status_negative', pr_percent_positive: '0%', pr_intensity: 'pr_intensity_1',
        her2_ihc_score: 'her2_ihc_0', her2_ish_status: 'her2_ish_not_performed', ki67_index: '42%',
      },
      createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(2),
    }],
    grossingReports: [
      {
        instanceId: `O26-0026-SP-A_grossing_${iid()}`, specimenId: 'O26-0026-SP-A',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right breast lumpectomy', weight: '58',
          overall_dimensions: '6.5 x 5.0 x 3.0 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Superior margin inked blue, all other margins inked black per surgeon',
          lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
          lesion_dimensions: '1.6 x 1.4 x 1.2 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
          distance_to_closest_margin: '0.5 cm to superior margin', cut_surface: 'Firm, gray-white, irregular margins',
          submission_status: 'submission_representative', total_cassettes: '5',
          cassette_key: '1-2: Tumor with adjacent parenchyma; 3: Superior margin; 4: Deep margin; 5: Uninvolved parenchyma',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
          comments: 'Specimen oriented by surgeon with inked margins as noted.',
        },
        createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(5),
      },
      {
        instanceId: `O26-0026-SP-B_grossing_${iid()}`, specimenId: 'O26-0026-SP-B',
        templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
        status: 'finalized', previouslyFinalized: true,
        answers: {
          label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
          number_of_containers: '1', specimen_type: 'Right axillary sentinel lymph nodes', weight: '5',
          overall_dimensions: 'Two nodes, largest 1.2 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
          orientation_inking: 'orientation_not_oriented', lesion_present: 'lesion_present_no_diffuse',
          submission_status: 'submission_entire', total_cassettes: '2', cassette_key: '1-2: Sentinel nodes 1-2, entirely submitted',
          megablock_used: 'megablock_no', gross_photography_taken: 'photography_no', frozen_section_performed: 'frozen_section_no',
          comments: 'Two sentinel nodes identified by blue dye and radiotracer, submitted entirely.',
        },
        createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(5),
      },
    ],
    createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(2),
  } as any,

  // ── Status-coverage cases ────────────────────────────────────────────────
  // 2 more minimal cases added per Pete's request, covering the two
  // CaseStatus values that have real, wired display logic (SearchPage.tsx
  // status pills, HeaderBar.tsx stage mapping) but had never actually been
  // produced by any seed case: 'intraoperative-complete' and
  // 'pathologist-review'. The other unused CaseStatus values ('closed',
  // 'returned', 'accepted', 'ai-assisted', 'claiming') were deliberately
  // NOT seeded — checked and confirmed zero consuming logic anywhere in the
  // app for any of them (the Case fields they'd back — sharedWith/
  // acceptedBy/returnedBy/closedBy — are themselves unread everywhere, and
  // 'claiming' is a same-named but unrelated local Step type in
  // PoolClaimModal.tsx, never actually written to case.status). Seeding
  // those now would just be an inert label with no workflow behind it to
  // test — worth building for real once those features exist, not before.

  {
    id: 'O26-0027', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0027', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0027' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'intraoperative-complete' as any,
    patient: { id: 'OPAT-027', mrn: '90144', firstName: 'Kenji', lastName: 'Higashi', dateOfBirth: '1965-05-14', sex: 'M' },
    specimens: [
      { id: 'O26-0027-SP-A', label: 'A', description: 'Left thyroid lobe', receivedAt: '2026-07-19T10:03:00.000Z', collectedAt: '2026-07-19T10:03:00.000Z', specimenFlags: [] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Owusu', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: '1.9 cm left thyroid nodule, indeterminate on FNA (Bethesda IV). Proceeding to left lobectomy with intraoperative frozen section.', receivedDate: isoDaysAgo(1), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [],
    diagnostic: {
      grossDescription: '', microscopicDescription: '',
      ancillaryStudies: 'Intraoperative frozen section performed — see merged intraop session for milestone history and frozen diagnosis.',
    },
    grossingReports: [{
      instanceId: `O26-0027-SP-A_grossing_${iid()}`, specimenId: 'O26-0027-SP-A',
      templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
      status: 'draft', answers: {},
      createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
    }],
    createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1),
  } as any,

  {
    id: 'O26-0028', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0028', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0028' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'pathologist-review' as any,
    patient: { id: 'OPAT-028', mrn: '200028', firstName: 'Renata', lastName: 'Alves', dateOfBirth: isoYearsAgo(58, 3, 12), sex: 'F' },
    specimens: [
      // Real, deliberate decision: this is the one case in the demo set
      // left WITHOUT a specimen-level base CPT code, on purpose - real
      // ancillary (IHC) suggestions exist here with nothing to attach
      // them to, which is exactly the condition CaseSignOutModal's own
      // hasAncillaryButNoBaseCode warning exists to catch. Every other
      // demo case with real pending billing suggestions (O26-0001,
      // O26-0004, O26-0024, O26-0025, O26-0026) got a real base code
      // added instead, so this one case is what keeps that safety
      // feature itself demonstrable - do not "complete" this one to
      // match the others.
      { id: 'O26-0028-SP-A', label: 'A', description: 'Left breast lumpectomy', receivedAt: isoDaysAgo(3), collectedAt: isoDaysAgo(3), specimenFlags: [{ id: 'comp-erh2-0028', name: 'ER / PR / HER2', lisCode: 'ERH2', color: '#3b82f6', severity: 2, tagClass: 'COMPUTATIONAL', orderedVia: 'lis', specimenId: 'O26-0028-SP-A' }],
        blocks: [{ id: 'blk-0028-a1', label: '1', status: 'Embedded', stains: [
          { id: 'stn-0028-a1-1', stainName: 'H&E', status: 'Coverslipped' },
          { id: 'stn-0028-a1-2', stainName: 'ER', status: 'Coverslipped' },
          { id: 'stn-0028-a1-3', stainName: 'PR', status: 'Coverslipped' },
          { id: 'stn-0028-a1-4', stainName: 'HER2', status: 'Coverslipped' },
        ] }] },
    ],
    order: { priority: 'Routine', requestingProvider: 'Dr. Priya Nathan', facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital", clinicalIndication: '1.7 cm left breast mass, BI-RADS 5. Core biopsy confirmed invasive ductal carcinoma. Proceeding to lumpectomy.', receivedDate: isoDaysAgo(3), assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary' },
    caseFlags: [],
    diagnostic: {
      grossDescription: 'Received fresh, labeled "left breast lumpectomy," is an irregular fragment of fibrofatty breast tissue measuring 5.8 x 4.2 x 2.6 cm. Sectioning reveals a firm, gray-white mass measuring 1.7 x 1.5 x 1.2 cm, 0.9 cm from the closest (medial) inked margin. Representative sections submitted.',
      microscopicDescription: '', ancillaryStudies: 'ER, PR, and HER2 immunohistochemistry performed — see Biomarkers section.',
    },
    synopticReports: [{
      // Content is fully complete — every required field and the full
      // Biomarkers panel answered — but the instance stays 'draft' and
      // the case sits at 'pathologist-review' rather than 'finalized':
      // this represents the report as ready-for-sign-out, before the
      // pathologist has actually clicked Sign Out. Distinct from the
      // finalized/lastRevisionType cases added earlier, which are already
      // past that point.
      instanceId: `O26-0028-SP-A_breast_${iid()}`, specimenId: 'O26-0028-SP-A',
      templateId: 'breast_invasive', templateName: 'Generic Template — Breast Invasive',
      status: 'draft',
      answers: {
        procedure: 'procedure_opt_2', specimen_laterality: 'specimen_laterality_opt_1', tumor_site: ['tumor_site_opt_2'],
        histologic_type: 'histologic_type_opt_1', histologic_grade: 'Grade 2', tumor_size: '1.7 cm', tumor_focality: 'tumor_focality_opt_1',
        dcis: 'Not identified', tumor_extent: 'Confined to breast parenchyma, no chest wall or skin involvement',
        lvi: 'lvi_opt_2', dermal_lvi: 'dermal_lvi_opt_1', microcalcifications: ['microcalcifications_opt_2'],
        treatment_effect_breast: 'treatment_effect_breast_opt_1', treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
        rcb_parameters: 'Not applicable — no neoadjuvant therapy administered',
        margin_status_invasive: 'margin_status_invasive_opt_1', closest_margins_invasive: ['closest_margins_invasive_opt_2'],
        margins_involved_invasive: ['margins_involved_invasive_opt_1'], distance_invasive_to_named_margins: '0.9 cm to medial margin',
        margin_status_dcis: 'margin_status_dcis_opt_1', closest_margins_dcis: ['closest_margins_dcis_opt_1'], margins_involved_dcis: ['margins_involved_dcis_opt_1'],
        distance_dcis_to_named_margins: 'Not applicable — no DCIS identified', margin_comment: 'All margins free of invasive carcinoma.',
        regional_ln_status: 'regional_ln_status_opt_1', number_ln_macrometastases: '0', number_ln_micrometastases: '0', number_ln_itc: '0',
        largest_nodal_met_mm: '0', extranodal_extension: 'extranodal_extension_opt_1', total_ln_examined: '0', sentinel_ln_examined: '0',
        regional_ln_comment: 'No nodal tissue submitted with this specimen.',
        distant_metastasis: ['distant_metastasis_opt_1'], ptnm_classification: 'pT1c Nx — nodal status pending',
        er_status: 'er_status_positive', er_percent_positive: '85%', er_intensity: 'er_intensity_3',
        pr_status: 'pr_status_positive', pr_percent_positive: '55%', pr_intensity: 'pr_intensity_2',
        her2_ihc_score: 'her2_ihc_1p', her2_ish_status: 'her2_ish_nonamplified', ki67_index: '16%',
      },
      createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(0),
    }],
    grossingReports: [{
      instanceId: `O26-0028-SP-A_grossing_${iid()}`, specimenId: 'O26-0028-SP-A',
      templateId: 'grossing_standard_tissue', templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
      status: 'finalized', previouslyFinalized: true,
      answers: {
        label_id_verified: 'label_verified_yes', received_in: 'received_nbf', specimen_integrity: 'integrity_intact',
        number_of_containers: '1', specimen_type: 'Left breast lumpectomy', weight: '52',
        overall_dimensions: '5.8 x 4.2 x 2.6 cm', external_surface_features: ['surface_smooth_glistening'], color: ['color_tan_pink'],
        orientation_inking: 'orientation_by_surgeon', orientation_inking_detail: 'Medial margin inked blue, all other margins inked black per surgeon',
        lesion_present: 'lesion_present_yes', number_of_lesions: '1', lesion_type: 'lesion_ulcerated',
        lesion_dimensions: '1.7 x 1.5 x 1.2 cm', lesion_color_consistency: 'lesion_color_white_tan_firm',
        distance_to_closest_margin: '0.9 cm to medial margin', cut_surface: 'Firm, gray-white, irregular margins',
        submission_status: 'submission_representative', total_cassettes: '4',
        cassette_key: '1-2: Tumor with adjacent parenchyma; 3: Medial margin; 4: Uninvolved parenchyma',
        megablock_used: 'megablock_no', gross_photography_taken: 'photography_yes', frozen_section_performed: 'frozen_section_no',
        comments: 'Specimen oriented by surgeon with inked margins as noted.',
      },
      createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(3),
    }],
    createdAt: isoDaysAgo(3), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0029: Prostate Core Biopsy — accessioned, NOT grossed. Real
  // feature, per direct request: a seed case specifically for testing
  // the Biopsy Array feature (MaterialTreePanel.tsx's "+ Create Biopsy
  // Array" action). 12 separate specimens, standard systematic
  // mapping-biopsy site convention (sextant-plus: base/mid/apex,
  // parasagittal/lateral, bilateral) — each core is genuinely its own
  // specimen with its own eventual synoptic report, confirmed as the
  // right model earlier in this conversation (each Specimen already
  // carries its own bodySite/laterality). None grossed yet — no
  // blocks anywhere — so a PA can open this case and immediately
  // exercise the real "+ Create Biopsy Array" flow on real,
  // freshly-accessioned specimens rather than a synthetic test
  // fixture.
  {
    id: 'O26-0029', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0029', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0029' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'accessioned' as any,
    patient: { id: 'OPAT-029', mrn: '200029', firstName: 'Marcus', lastName: 'Delacroix', dateOfBirth: isoYearsAgo(64, 11, 3), sex: 'M' },
    specimens: [
      { id: 'O26-0029-SP-A', label: 'A', description: 'Prostate, right base, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-B', label: 'B', description: 'Prostate, right mid, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-C', label: 'C', description: 'Prostate, right apex, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-D', label: 'D', description: 'Prostate, right lateral base, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-E', label: 'E', description: 'Prostate, right lateral mid, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-F', label: 'F', description: 'Prostate, right lateral apex, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-G', label: 'G', description: 'Prostate, left base, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-H', label: 'H', description: 'Prostate, left mid, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-I', label: 'I', description: 'Prostate, left apex, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-J', label: 'J', description: 'Prostate, left lateral base, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-K', label: 'K', description: 'Prostate, left lateral mid, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
      { id: 'O26-0029-SP-L', label: 'L', description: 'Prostate, left lateral apex, needle core biopsy', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Anthony Reyes',
      facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital",
      clinicalIndication: 'PSA 7.8, rising over 18 months. DRE with palpable nodule, right lobe. mpMRI PI-RADS 4 lesion, right base. Proceeding to 12-core systematic transrectal biopsy with MRI/US fusion targeting.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
    },
    caseFlags: [],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    // 12 separate grossing report instances, one per specimen — same
    // draft/empty-answers shape as every other accessioned-not-grossed
    // seed case (O26-0018's own pattern), just twelve of them instead
    // of one.
    grossingReports: [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    ].map(letter => ({
      instanceId: `O26-0029-SP-${letter}_grossing_${iid()}`,
      specimenId: `O26-0029-SP-${letter}`,
      templateId: 'grossing_standard_tissue',
      templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
      status: 'draft',
      answers: {},
      createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    })),
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,

  // O26-0030: Radical Prostatectomy — accessioned, NOT grossed. Real
  // feature, per direct request. Single specimen (the whole gland) —
  // deliberately NOT modeled as multiple specimens, since a radical
  // prostatectomy genuinely is one physical specimen, unlike the
  // 12-separate-cores biopsy above. Worth being direct about: this
  // case does NOT exercise the Biopsy Array feature the way O26-0029
  // does, since Biopsy Array is inherently a multi-specimen concept —
  // this is a good test case for the ordinary single-specimen
  // grossing workflow instead (large-specimen orientation, weight,
  // inking, sequential whole-mount sectioning), not a substitute for
  // O26-0029's array-specific coverage.
  {
    id: 'O26-0030', reportingMode: 'orchestrator',
    accession: { accessionNumber: 'O0030', accessionPrefix: 'O', accessionYear: 2026, fullAccession: 'O26-0030' },
    originHospitalId: 'HOSP-001', originEnterpriseId: 'ENT-DEFAULT',
    status: 'accessioned' as any,
    patient: { id: 'OPAT-030', mrn: '200030', firstName: 'Harold', lastName: 'Whitfield', dateOfBirth: isoYearsAgo(61, 5, 22), sex: 'M' },
    specimens: [
      { id: 'O26-0030-SP-A', label: 'A', description: 'Radical prostatectomy with bilateral pelvic lymph node dissection', receivedAt: isoDaysAgo(0), collectedAt: isoDaysAgo(0), specimenFlags: [] },
    ],
    order: {
      priority: 'Routine',
      requestingProvider: 'Dr. Anthony Reyes',
      facilityId: 'c-stcatherines', facilityName: "St. Catherine's University Hospital",
      clinicalIndication: 'Prostate adenocarcinoma, systematic biopsy Gleason 4+3=7 (Grade Group 3), PSA 9.4. mpMRI PI-RADS 4 right base, no extraprostatic extension. Robotic radical prostatectomy with bilateral pelvic lymph node dissection.',
      receivedDate: isoDaysAgo(0),
      assignedTo: 'PATH-001', assignedParticipationTypeId: 'primary',
    },
    caseFlags: [],
    diagnostic: { grossDescription: '', microscopicDescription: '', ancillaryStudies: '' },
    grossingReports: [{
      instanceId: `O26-0030-SP-A_grossing_${iid()}`,
      specimenId: 'O26-0030-SP-A',
      templateId: 'grossing_standard_tissue',
      templateName: 'Standard Tissue Grossing (Gold Standard) — Route A',
      status: 'draft',
      answers: {},
      createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
    }],
    createdAt: isoDaysAgo(0), updatedAt: isoDaysAgo(0),
  } as any,
];

// ─── Seed ─────────────────────────────────────────────────────

const ORCH_CASES: Case[] = [...PETE_CASES, ...PAUL_CASES, ...AMBER_CASES, ...BRONWYN_CASES, ...POOL_CASES, ...STAGE0_CASES, ...COMPLETED_DEMO_CASES];

// Version-gated re-seed — same mechanism as mockCaseService.ts's
// MOCK_VERSION. Without this, a stale localStorage snapshot silently
// wins over every future edit to ORCH_CASES, forever, regardless of
// Demo Reset (which depends on its own key list staying manually in
// sync with STORAGE_KEY — the exact mismatch that caused this file's
// data to look stale even after a Full Reset). Increment
// ORCH_MOCK_VERSION whenever ORCH_CASES content changes.
const ORCH_MOCK_VERSION = '7'; // bumped: added real, accurate specimen-level base CPT codes to 5 of the 6 demo cases with pending ancillary suggestions (O26-0001: 88309, O26-0004/0025/0026: 88307, O26-0024: 88309), so a sales/test demo of the full sign-out workflow doesn't hit an unrelated "no base code" warning. O26-0028 deliberately left without one, per direct decision, so the existing hasAncillaryButNoBaseCode safety warning stays demonstrable on at least one real case.
const ORCH_VERSION_KEY = 'pathscribe_mock_orch_cases_version';
const storedOrchVersion = localStorage.getItem(ORCH_VERSION_KEY);
if (storedOrchVersion !== ORCH_MOCK_VERSION) {
  storageClear(STORAGE_KEY);
  localStorage.setItem(ORCH_VERSION_KEY, ORCH_MOCK_VERSION);
}

const CASES: Case[] = (() => {
  const stored = storageGet<Case[]>(STORAGE_KEY, []);
  return stored?.length ? stored : ORCH_CASES;
})();

// ─── Service implementation ───────────────────────────────────

export const mockOrchestratorCaseService: ICaseService = {

  async getCase(id: string): Promise<Case | undefined> {
    await delay();
    return CASES.find(c => c.id === id);
  },

  async getAll(params?) {
    await delay();
    const filtered = applyCaseFilters(CASES, params);
    const { data, meta } = applyCasePagination(filtered, params);
    return meta ? { ok: true, data: data as any[], meta } : { ok: true, data: data as any[] };
  },

  // Filter by assigned user — pool cases visible to all
  async listCasesForUser(userId: string): Promise<Case[]> {
    await delay();
    // Real bug fix, confirmed live: CaseSearchBar.tsx calls
    // listCasesForUser('all') with the explicit intent "returns every
    // case regardless of assignment... the search bar is a clinical
    // lookup tool, not a worklist filter" (see that file's own
    // comment). The LIS-side mockCaseService.listCasesForUser already
    // special-cases 'all'/'current'/empty userId to mean exactly
    // that — this side never did, so it silently applied the normal
    // assigned-to-me-or-pool filter even for 'all', making any
    // Orchestration case not literally assigned to a user named "all"
    // invisible to the search bar specifically (every other access
    // path to the same case — direct URL, worklist, case list for a
    // real userId — worked correctly throughout, since only this one
    // caller ever passed the literal string 'all'). Matches the
    // LIS-side special case exactly, so both sources now behave the
    // same way for the same input.
    if (!userId || userId === 'all' || userId === 'current') return CASES;
    return CASES.filter(c =>
      c.order?.assignedTo === userId ||
      (c.status as string) === 'pool'
    );
  },

  async updateCase(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void> {
    await delay();
    const idx = CASES.findIndex(c => c.id === caseId);
    if (idx !== -1) {
      const currentVersion = (CASES[idx] as any).version ?? 0;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new ConcurrencyConflictError(caseId, expectedVersion, currentVersion);
      }
      CASES[idx] = { ...CASES[idx], ...updates, updatedAt: new Date().toISOString(), version: currentVersion + 1 } as any;
      storageSet(STORAGE_KEY, CASES);
    }
  },

  // Added for the Accession page (Stage 0 Requirements §6.1 / §6.2).
  // Caller has already generated the O26--prefixed id.
  async createCase(caseData: Case): Promise<void> {
    await delay();
    CASES.push(caseData);
    storageSet(STORAGE_KEY, CASES);
  },
};
