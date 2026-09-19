// src/services/reportTemplates/mockReportTemplateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Seeded Case Report Templates for PathScribe Orchestration mode.
//
// These are CASE-LEVEL document shells — not synoptic checklists.
// Each template defines the narrative sections of the final signed report.
// The Synoptic Summary section embeds the per-specimen CAP/RCPath answers.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReportTemplate } from '../../types/reportPart';
import { SectionNode, IfBlockNode, RepeatGroupNode, ParagraphNode, StaticLabelNode } from '@/types/template';
import { IReportTemplateService } from './IReportTemplateService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ── Well-known template ID constants ─────────────────────────────────────────
// Imported by TemplateListTab and other consumers to identify the gold standard.
export const STANDARD_TEMPLATE_ID  = 'tmpl-gold-standard';
export const BREAST_TEMPLATE_ID    = 'tmpl-breast';
export const GI_TEMPLATE_ID        = 'tmpl-gi';
export const THORACIC_TEMPLATE_ID  = 'tmpl-thoracic';
export const URO_TEMPLATE_ID       = 'tmpl-uro';

const NOW = new Date().toISOString();
const SYSTEM = 'system';
const INST   = 'PATHSCRIBE';

// ── Section factory helpers ───────────────────────────────────────────────────

const section = (id: string, label: string, printHeading: string, aiEnabled: boolean, children: any[] = []): SectionNode => ({
  id, type: 'section', label, printHeading,
  colSpan: 12, required: false, hideIfEmpty: false, fhirExport: false,
  collapsible: true, defaultCollapsed: false,
  ai: { enabled: aiEnabled, temperature: 0.3, maxTokens: 600 },
  children,
});

const paragraph = (id: string, label: string, bindingKey: string): ParagraphNode => ({
  id, type: 'paragraph', label, bindingKey,
  colSpan: 12, required: false, hideIfEmpty: true, fhirExport: false,
  richText: true, aiWritable: true,
});

const heading = (id: string, text: string): StaticLabelNode => ({
  id, type: 'static-label', label: text, text,
  colSpan: 12, required: false, hideIfEmpty: false, fhirExport: false,
  variant: 'h3', bold: true,
});

const conditional = (id: string, label: string, field: string, children: any[]): IfBlockNode => ({
  id, type: 'if-block', label, colSpan: 12,
  required: false, hideIfEmpty: false, fhirExport: false,
  condition: { logic: 'AND', clauses: [{ field, operator: 'notEmpty' as const }] },
  children,
});

const repeatSpecimens = (id: string, children: any[]): RepeatGroupNode => ({
  id, type: 'repeat-group', label: 'Per-specimen section',
  colSpan: 12, required: false, hideIfEmpty: false, fhirExport: false,
  iterateOver: 'specimens', itemAlias: 'specimen', children,
});

// ── Shared section builders ───────────────────────────────────────────────────

const reportHeaderSection = (): SectionNode => section(
  'sec-header', 'Report Header', 'PATHOLOGY REPORT', false, [
    { id: 'hdr-inst',      type: 'text-field', label: 'Institution',        bindingKey: 'institution.name',      colSpan: 6,  required: false, hideIfEmpty: false, fhirExport: false },
    { id: 'hdr-dept',      type: 'text-field', label: 'Department',         bindingKey: 'institution.department', colSpan: 6,  required: false, hideIfEmpty: false, fhirExport: false },
    { id: 'hdr-patient',   type: 'text-field', label: 'Patient Name',       bindingKey: 'patient.name',          colSpan: 4,  required: true,  hideIfEmpty: false, fhirExport: true  },
    { id: 'hdr-dob',       type: 'date',       label: 'Date of Birth',      bindingKey: 'patient.dob',           colSpan: 4,  required: false, hideIfEmpty: false, fhirExport: true, format: 'date' },
    { id: 'hdr-sex',       type: 'text-field', label: 'Sex',                bindingKey: 'patient.sex',           colSpan: 4,  required: false, hideIfEmpty: false, fhirExport: true  },
    { id: 'hdr-mrn',       type: 'text-field', label: 'MRN',                bindingKey: 'patient.mrn',           colSpan: 4,  required: false, hideIfEmpty: false, fhirExport: true  },
    { id: 'hdr-accession', type: 'text-field', label: 'Accession',          bindingKey: 'case.accession',        colSpan: 4,  required: true,  hideIfEmpty: false, fhirExport: true  },
    { id: 'hdr-received',  type: 'date',       label: 'Date Received',      bindingKey: 'case.receivedDate',     colSpan: 4,  required: false, hideIfEmpty: false, fhirExport: false, format: 'date' },
    { id: 'hdr-clinician', type: 'text-field', label: 'Requesting Clinician', bindingKey: 'case.requestingProvider', colSpan: 6, required: false, hideIfEmpty: false, fhirExport: false },
    { id: 'hdr-facility',  type: 'text-field', label: 'Submitting Facility', bindingKey: 'case.facilityName',    colSpan: 6,  required: false, hideIfEmpty: false, fhirExport: false },
  ]
);

const clinicalHistorySection = (): SectionNode => section(
  'sec-clinical', 'Clinical History', 'CLINICAL HISTORY', true,
  [ paragraph('p-clinical', 'Clinical History', 'diagnostic.clinicalHistory') ]
);

const grossSection = (): SectionNode => section(
  'sec-gross', 'Gross Description', 'GROSS DESCRIPTION', true,
  [ repeatSpecimens('rep-gross', [
      heading('h-gross-sp', 'Specimen {{specimen.label}}: {{specimen.description}}'),
      paragraph('p-gross', 'Gross Description', 'specimen.grossDescription'),
    ])
  ]
);

const intraopSection = (): IfBlockNode => conditional(
  'sec-intraop', 'Intraoperative Consultation', 'diagnostic.intraoperative',
  [ section('sec-intraop-inner', 'Intraoperative', 'INTRAOPERATIVE CONSULTATION', false,
      [ paragraph('p-intraop', 'Frozen Section / Intraoperative', 'diagnostic.intraoperative') ]
    )
  ]
);

const microscopicSection = (): SectionNode => section(
  'sec-micro', 'Microscopic Description', 'MICROSCOPIC DESCRIPTION', true,
  [ repeatSpecimens('rep-micro', [
      heading('h-micro-sp', 'Specimen {{specimen.label}}'),
      paragraph('p-micro', 'Microscopic Description', 'specimen.microscopicDescription'),
    ])
  ]
);

const ancillarySection = (): SectionNode => section(
  'sec-ancillary', 'Ancillary Studies', 'ANCILLARY STUDIES', false,
  [ paragraph('p-ancillary', 'Ancillary Studies Summary', 'diagnostic.ancillaryStudies') ]
);

const synopticSummarySection = (): SectionNode => section(
  'sec-synoptic', 'Synoptic Summary', 'SYNOPTIC SUMMARY', false,
  [ repeatSpecimens('rep-synoptic', [
      heading('h-syn-sp', 'Specimen {{specimen.label}}: {{specimen.synopticTemplateName}}'),
      { id: 'ref-synoptic', type: 'template-ref', label: 'CAP Synoptic Checklist',
        colSpan: 12, required: false, hideIfEmpty: false, fhirExport: false,
        refTemplateId: '{{specimen.synopticTemplateId}}' },
    ])
  ]
);

const impressionSection = (): SectionNode => section(
  'sec-impression', 'Diagnostic Impression', 'DIAGNOSTIC IMPRESSION', true,
  [ paragraph('p-impression', 'Diagnostic Impression', 'diagnostic.impression'),
    { id: 'p-diagnosis-code', type: 'text-field', label: 'Primary Diagnosis Code (ICD-O)',
      bindingKey: 'diagnostic.icdCode', colSpan: 6, required: false, hideIfEmpty: true, fhirExport: true },
    { id: 'p-snomed',         type: 'text-field', label: 'SNOMED Morphology',
      bindingKey: 'diagnostic.snomedMorphology', colSpan: 6, required: false, hideIfEmpty: true, fhirExport: true },
  ]
);

const differentialSection = (): IfBlockNode => conditional(
  'sec-diff', 'Differential Diagnosis', 'diagnostic.differentialDiagnosis',
  [ section('sec-diff-inner', 'Differential Diagnosis', 'DIFFERENTIAL DIAGNOSIS', false,
      [ paragraph('p-diff', 'Differential Diagnosis', 'diagnostic.differentialDiagnosis') ]
    )
  ]
);

const recommendationsSection = (): SectionNode => section(
  'sec-recs', 'Recommendations', 'RECOMMENDATIONS', false,
  [ paragraph('p-recs', 'Clinical Recommendations', 'diagnostic.recommendations') ]
);

const attestationSection = (): SectionNode => section(
  'sec-attest', 'Pathologist Attestation', 'ATTESTATION', false,
  [ { id: 'attest-pathologist', type: 'text-field', label: 'Reporting Pathologist',
      bindingKey: 'signoff.pathologistName', colSpan: 6, required: true, hideIfEmpty: false, fhirExport: true },
    { id: 'attest-date', type: 'date', label: 'Date Signed',
      bindingKey: 'signoff.signedAt', colSpan: 6, required: true, hideIfEmpty: false, fhirExport: true, format: 'datetime' },
    { id: 'attest-statement', type: 'rich-text-block', label: 'Attestation Statement',
      colSpan: 12, required: false, hideIfEmpty: false, fhirExport: false,
      content: '<p>I attest that I have personally reviewed the slides and clinical history for this case and that the above report represents my professional diagnostic opinion.</p>' },
  ]
);

const amendmentSection = (): IfBlockNode => conditional(
  'sec-amendment', 'Amendment', 'case.isAmended',
  [ section('sec-amendment-inner', 'Amendment', 'AMENDMENT', false, [
      { id: 'amend-date', type: 'date', label: 'Amendment Date',
        bindingKey: 'amendment.amendedAt', colSpan: 6, required: false, hideIfEmpty: false, fhirExport: true, format: 'datetime' },
      { id: 'amend-by', type: 'text-field', label: 'Amended By',
        bindingKey: 'amendment.amendedBy', colSpan: 6, required: false, hideIfEmpty: false, fhirExport: true },
      paragraph('p-amendment', 'Amendment Details', 'amendment.description'),
    ])
  ]
);

// ── Staging section variants ──────────────────────────────────────────────────

const stagingSection = (extraChildren: any[] = []): IfBlockNode => conditional(
  'sec-staging', 'Staging', 'diagnostic.pT',
  [ section('sec-staging-inner', 'Staging', 'STAGING', false, [
      { id: 'stage-pt', type: 'text-field', label: 'pT', bindingKey: 'diagnostic.pT', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-pn', type: 'text-field', label: 'pN', bindingKey: 'diagnostic.pN', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-pm', type: 'text-field', label: 'pM', bindingKey: 'diagnostic.pM', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-group', type: 'text-field', label: 'Stage Group', bindingKey: 'diagnostic.stageGroup', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
      ...extraChildren,
    ])
  ]
);

// ── Gold Standard Template ────────────────────────────────────────────────────

const GOLD_STANDARD: ReportTemplate = {
  id: 'tmpl-gold-standard',
  name: 'Gold Standard — General Surgical Pathology',
  specialty: 'general',
  subspecialty: undefined,
  standard: 'custom',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    // ── Headers
    { slotId: 'slot-h-p1', partId: 'std_header_page1',   partName: 'Page 1 — Header',    partType: 'header', role: 'header-p1',     enabled: true, order: 0 },
    { slotId: 'slot-h-p2', partId: 'std_header_p2plus',  partName: 'Pages 2+ — Header',  partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    // ── Body — canonical AP order
    { slotId: 'slot-b-01', partId: 'std_body_demographics', partName: 'Patient Demographics',   partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',     partName: 'Clinical History',        partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',    partName: 'Specimen Description',    partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',        partName: 'Gross Description',       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'std_body_microscopic',  partName: 'Microscopic Description', partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'std_body_ancillary',    partName: 'Ancillary Studies',       partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'std_body_synoptic',     partName: 'Synoptic Summary',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-b-08', partId: 'std_body_diagnosis',    partName: 'Diagnosis / Impression',  partType: 'body', role: 'body', enabled: true, order: 7 },
    { slotId: 'slot-b-09', partId: 'std_body_comment',      partName: 'Pathologist Comment',     partType: 'body', role: 'body', enabled: true, order: 8 },
    { slotId: 'slot-b-10', partId: 'std_body_signoff',      partName: 'Sign-off & Attestation',  partType: 'body', role: 'body', enabled: true, order: 9 },
    // ── Footers
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',    partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer',  partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
  nodes: [
    reportHeaderSection(),
    clinicalHistorySection(),
    grossSection(),
    intraopSection(),
    microscopicSection(),
    ancillarySection(),
    synopticSummarySection(),
    impressionSection(),
    differentialSection(),
    stagingSection(),
    recommendationsSection(),
    attestationSection(),
    amendmentSection(),
  ],
};

// ── Breast Template ───────────────────────────────────────────────────────────

const BREAST_TEMPLATE: ReportTemplate = {
  id: 'tmpl-breast',
  name: 'Breast Pathology Report',
  specialty: 'breast',
  subspecialty: 'breast',
  standard: 'CAP',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    // ── Headers
    { slotId: 'slot-h-p1', partId: 'std_header_page1',   partName: 'Page 1 — Header',    partType: 'header', role: 'header-p1',     enabled: true, order: 0 },
    { slotId: 'slot-h-p2', partId: 'std_header_p2plus',  partName: 'Pages 2+ — Header',  partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    // ── Body — canonical AP order
    { slotId: 'slot-b-01', partId: 'std_body_demographics', partName: 'Patient Demographics',   partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',     partName: 'Clinical History',        partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',    partName: 'Specimen Description',    partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',        partName: 'Gross Description',       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'std_body_microscopic',  partName: 'Microscopic Description', partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'std_body_ancillary',    partName: 'Ancillary Studies',       partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'std_body_synoptic',     partName: 'Synoptic Summary',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-b-08', partId: 'std_body_diagnosis',    partName: 'Diagnosis / Impression',  partType: 'body', role: 'body', enabled: true, order: 7 },
    { slotId: 'slot-b-09', partId: 'std_body_comment',      partName: 'Pathologist Comment',     partType: 'body', role: 'body', enabled: true, order: 8 },
    { slotId: 'slot-b-10', partId: 'std_body_signoff',      partName: 'Sign-off & Attestation',  partType: 'body', role: 'body', enabled: true, order: 9 },
    // ── Footers
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',    partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer',  partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
  nodes: [
    reportHeaderSection(),
    clinicalHistorySection(),
    grossSection(),
    intraopSection(),
    microscopicSection(),
    ancillarySection(),
    // Breast-specific: receptor status summary
    conditional('sec-receptors', 'Receptor Status', 'diagnostic.erStatus', [
      section('sec-receptors-inner', 'Receptor Status', 'RECEPTOR STATUS', false, [
        { id: 'rx-er', type: 'text-field', label: 'ER Status', bindingKey: 'diagnostic.erStatus', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'rx-pr', type: 'text-field', label: 'PR Status', bindingKey: 'diagnostic.prStatus', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'rx-her2', type: 'text-field', label: 'HER2 Status', bindingKey: 'diagnostic.her2Status', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'rx-ki67', type: 'text-field', label: 'Ki-67 Index', bindingKey: 'diagnostic.ki67', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
      ]),
    ]),
    synopticSummarySection(),
    impressionSection(),
    differentialSection(),
    stagingSection([
      { id: 'stage-grade', type: 'text-field', label: 'Histologic Grade', bindingKey: 'diagnostic.histologicGrade', colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-lvi',   type: 'text-field', label: 'LVI', bindingKey: 'diagnostic.lvi', colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-margin', type: 'text-field', label: 'Margins', bindingKey: 'diagnostic.margins', colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
    ]),
    recommendationsSection(),
    attestationSection(),
    amendmentSection(),
  ],
};

// ── Gastrointestinal Template ─────────────────────────────────────────────────

const GI_TEMPLATE: ReportTemplate = {
  id: 'tmpl-gi',
  name: 'Gastrointestinal Pathology Report',
  specialty: 'gi',
  subspecialty: 'gi',
  standard: 'CAP',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    // ── Headers
    { slotId: 'slot-h-p1', partId: 'std_header_page1',   partName: 'Page 1 — Header',    partType: 'header', role: 'header-p1',     enabled: true, order: 0 },
    { slotId: 'slot-h-p2', partId: 'std_header_p2plus',  partName: 'Pages 2+ — Header',  partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    // ── Body — canonical AP order
    { slotId: 'slot-b-01', partId: 'std_body_demographics', partName: 'Patient Demographics',   partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',     partName: 'Clinical History',        partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',    partName: 'Specimen Description',    partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',        partName: 'Gross Description',       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'std_body_microscopic',  partName: 'Microscopic Description', partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'std_body_ancillary',    partName: 'Ancillary Studies',       partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'std_body_synoptic',     partName: 'Synoptic Summary',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-b-08', partId: 'std_body_diagnosis',    partName: 'Diagnosis / Impression',  partType: 'body', role: 'body', enabled: true, order: 7 },
    { slotId: 'slot-b-09', partId: 'std_body_comment',      partName: 'Pathologist Comment',     partType: 'body', role: 'body', enabled: true, order: 8 },
    { slotId: 'slot-b-10', partId: 'std_body_signoff',      partName: 'Sign-off & Attestation',  partType: 'body', role: 'body', enabled: true, order: 9 },
    // ── Footers
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',    partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer',  partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
  nodes: [
    reportHeaderSection(),
    clinicalHistorySection(),
    grossSection(),
    intraopSection(),
    microscopicSection(),
    ancillarySection(),
    synopticSummarySection(),
    impressionSection(),
    differentialSection(),
    stagingSection([
      { id: 'stage-grade',  type: 'text-field', label: 'Histologic Grade', bindingKey: 'diagnostic.histologicGrade', colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-msi',    type: 'text-field', label: 'MSI Status',       bindingKey: 'diagnostic.msiStatus',       colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-margin', type: 'text-field', label: 'Margins',           bindingKey: 'diagnostic.margins',          colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
    ]),
    recommendationsSection(),
    attestationSection(),
    amendmentSection(),
  ],
};

// ── Thoracic Template ─────────────────────────────────────────────────────────

const THORACIC_TEMPLATE: ReportTemplate = {
  id: 'tmpl-thoracic',
  name: 'Thoracic / Pulmonary Pathology Report',
  specialty: 'thoracic',
  subspecialty: 'thoracic',
  standard: 'CAP',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    // ── Headers
    { slotId: 'slot-h-p1', partId: 'std_header_page1',   partName: 'Page 1 — Header',    partType: 'header', role: 'header-p1',     enabled: true, order: 0 },
    { slotId: 'slot-h-p2', partId: 'std_header_p2plus',  partName: 'Pages 2+ — Header',  partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    // ── Body — canonical AP order
    { slotId: 'slot-b-01', partId: 'std_body_demographics', partName: 'Patient Demographics',   partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',     partName: 'Clinical History',        partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',    partName: 'Specimen Description',    partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',        partName: 'Gross Description',       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'std_body_microscopic',  partName: 'Microscopic Description', partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'std_body_ancillary',    partName: 'Ancillary Studies',       partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'std_body_synoptic',     partName: 'Synoptic Summary',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-b-08', partId: 'std_body_diagnosis',    partName: 'Diagnosis / Impression',  partType: 'body', role: 'body', enabled: true, order: 7 },
    { slotId: 'slot-b-09', partId: 'std_body_comment',      partName: 'Pathologist Comment',     partType: 'body', role: 'body', enabled: true, order: 8 },
    { slotId: 'slot-b-10', partId: 'std_body_signoff',      partName: 'Sign-off & Attestation',  partType: 'body', role: 'body', enabled: true, order: 9 },
    // ── Footers
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',    partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer',  partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
  nodes: [
    reportHeaderSection(),
    clinicalHistorySection(),
    grossSection(),
    intraopSection(),
    microscopicSection(),
    ancillarySection(),
    // Thoracic-specific: PD-L1 / molecular
    conditional('sec-molecular-thoracic', 'Molecular Profile', 'diagnostic.pdl1Score', [
      section('sec-mol-inner', 'Molecular Profile', 'MOLECULAR PROFILE', false, [
        { id: 'mol-pdl1',  type: 'text-field', label: 'PD-L1 TPS (%)', bindingKey: 'diagnostic.pdl1Score',  colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'mol-egfr',  type: 'text-field', label: 'EGFR',          bindingKey: 'diagnostic.egfr',       colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'mol-alk',   type: 'text-field', label: 'ALK',           bindingKey: 'diagnostic.alk',        colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'mol-ros1',  type: 'text-field', label: 'ROS1',          bindingKey: 'diagnostic.ros1',       colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'mol-kras',  type: 'text-field', label: 'KRAS',          bindingKey: 'diagnostic.kras',       colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      ]),
    ]),
    synopticSummarySection(),
    impressionSection(),
    differentialSection(),
    stagingSection([
      { id: 'stage-visceral-pleura', type: 'text-field', label: 'Visceral Pleural Invasion', bindingKey: 'diagnostic.visceralPleura', colSpan: 6, required: false, hideIfEmpty: true, fhirExport: true },
      { id: 'stage-lvi',             type: 'text-field', label: 'LVI',                        bindingKey: 'diagnostic.lvi',            colSpan: 6, required: false, hideIfEmpty: true, fhirExport: true },
    ]),
    recommendationsSection(),
    attestationSection(),
    amendmentSection(),
  ],
};

// ── Urological Template ───────────────────────────────────────────────────────

const URO_TEMPLATE: ReportTemplate = {
  id: 'tmpl-uro',
  name: 'Urological Pathology Report',
  specialty: 'uro',
  subspecialty: 'uro',
  standard: 'CAP',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    // ── Headers
    { slotId: 'slot-h-p1', partId: 'std_header_page1',   partName: 'Page 1 — Header',    partType: 'header', role: 'header-p1',     enabled: true, order: 0 },
    { slotId: 'slot-h-p2', partId: 'std_header_p2plus',  partName: 'Pages 2+ — Header',  partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    // ── Body — canonical AP order
    { slotId: 'slot-b-01', partId: 'std_body_demographics', partName: 'Patient Demographics',   partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',     partName: 'Clinical History',        partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',    partName: 'Specimen Description',    partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',        partName: 'Gross Description',       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'std_body_microscopic',  partName: 'Microscopic Description', partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'std_body_ancillary',    partName: 'Ancillary Studies',       partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'std_body_synoptic',     partName: 'Synoptic Summary',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-b-08', partId: 'std_body_diagnosis',    partName: 'Diagnosis / Impression',  partType: 'body', role: 'body', enabled: true, order: 7 },
    { slotId: 'slot-b-09', partId: 'std_body_comment',      partName: 'Pathologist Comment',     partType: 'body', role: 'body', enabled: true, order: 8 },
    { slotId: 'slot-b-10', partId: 'std_body_signoff',      partName: 'Sign-off & Attestation',  partType: 'body', role: 'body', enabled: true, order: 9 },
    // ── Footers
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',    partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer',  partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
  nodes: [
    reportHeaderSection(),
    clinicalHistorySection(),
    grossSection(),
    microscopicSection(),   // No intraop — uncommon in prostate biopsies
    ancillarySection(),
    // Urological-specific: Gleason grading
    conditional('sec-gleason', 'Gleason Grading', 'diagnostic.gleasonPrimary', [
      section('sec-gleason-inner', 'Gleason Grading', 'GLEASON GRADING', false, [
        { id: 'gl-primary',   type: 'text-field', label: 'Primary Pattern',  bindingKey: 'diagnostic.gleasonPrimary',   colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-secondary', type: 'text-field', label: 'Secondary Pattern', bindingKey: 'diagnostic.gleasonSecondary', colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-score',     type: 'text-field', label: 'Gleason Score',    bindingKey: 'diagnostic.gleasonScore',     colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-group',     type: 'text-field', label: 'Grade Group',      bindingKey: 'diagnostic.gradeGroup',       colSpan: 3, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-cores',     type: 'text-field', label: 'Positive Cores',   bindingKey: 'diagnostic.positiveCores',    colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-pni',       type: 'text-field', label: 'Perineural Invasion', bindingKey: 'diagnostic.perineuralInvasion', colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
        { id: 'gl-lvi',       type: 'text-field', label: 'LVI',              bindingKey: 'diagnostic.lvi',              colSpan: 4, required: false, hideIfEmpty: true, fhirExport: true },
      ]),
    ]),
    synopticSummarySection(),
    impressionSection(),
    differentialSection(),
    stagingSection(),
    recommendationsSection(),
    attestationSection(),
    amendmentSection(),
  ],
};

// ── Preliminary Report Templates ────────────────────────────────────────────
// Real, per direct spec ("build a compliant base template for an Anatomic
// Pathology Preliminary Report across Surgical Pathology, GYN Cytology, and
// Non-GYN/FNA") — PS-292's own three-group decision (one shared Preliminary
// template per broad group, not per fine subspecialty, not one universal
// cross-specialty template). Client customization is handled by the existing,
// real clone() mechanism below — these three are the baseline, not meant to
// be exhaustive of every real site's own preferences.
//
// Universal sections (demographics, clinical history, specimen source) reuse
// the exact same, real standard parts every Final template already uses —
// assembled by reference, not copied, so a future edit to std_body_clinical
// propagates to Preliminary and Final templates alike. Only the genuinely
// Preliminary-specific and discipline-specific sections are new parts (see
// reportParts/mockReportPartService.ts's own "PRELIMINARY REPORT PART
// LIBRARY" section).

const PRELIM_SURGPATH_TEMPLATE: ReportTemplate = {
  id: 'tmpl-prelim-surgpath',
  name: 'Preliminary Report — Surgical Pathology',
  specialty: 'preliminary-surgpath',
  subspecialty: undefined,
  standard: 'custom',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    { slotId: 'slot-h-banner', partId: 'prelim_header_banner', partName: 'Preliminary Status Banner', partType: 'header', role: 'header-p1', enabled: true, order: 0 },
    { slotId: 'slot-h-p1',     partId: 'std_header_page1',     partName: 'Page 1 — Header',            partType: 'header', role: 'header-p1', enabled: true, order: 1 },
    { slotId: 'slot-h-p2',     partId: 'std_header_p2plus',    partName: 'Pages 2+ — Header',           partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    { slotId: 'slot-b-01', partId: 'std_body_demographics',                partName: 'Patient & Order Demographics',            partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',                    partName: 'Clinical Information',                    partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',                   partName: 'Specimens Submitted',                     partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'std_body_gross',                       partName: 'Gross Description',                       partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'prelim_body_surgpath_impression',      partName: 'Preliminary Diagnosis / Impression',      partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-b-06', partId: 'prelim_body_ancillary_status',         partName: 'Ancillary Testing Status',                partType: 'body', role: 'body', enabled: true, order: 5 },
    { slotId: 'slot-b-07', partId: 'prelim_body_signoff',                  partName: 'Preliminary Reviewer Attestation',        partType: 'body', role: 'body', enabled: true, order: 6 },
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',   partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer', partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
};

const PRELIM_GYN_CYTOLOGY_TEMPLATE: ReportTemplate = {
  id: 'tmpl-prelim-gyn-cytology',
  name: 'Preliminary Report — GYN Cytology',
  specialty: 'preliminary-cytology',
  subspecialty: 'gyn',
  standard: 'custom',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    { slotId: 'slot-h-banner', partId: 'prelim_header_banner', partName: 'Preliminary Status Banner', partType: 'header', role: 'header-p1', enabled: true, order: 0 },
    { slotId: 'slot-h-p1',     partId: 'std_header_page1',     partName: 'Page 1 — Header',            partType: 'header', role: 'header-p1', enabled: true, order: 1 },
    { slotId: 'slot-h-p2',     partId: 'std_header_p2plus',    partName: 'Pages 2+ — Header',           partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    { slotId: 'slot-b-01', partId: 'std_body_demographics',      partName: 'Patient & Order Demographics',              partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',          partName: 'Clinical Information',                      partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',         partName: 'Specimens Submitted',                       partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'prelim_body_gyn_cytology',   partName: 'GYN Cytology — Preliminary Interpretation', partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'prelim_body_signoff',        partName: 'Preliminary Reviewer Attestation',          partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',   partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer', partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
};

const PRELIM_NONGYN_CYTOLOGY_TEMPLATE: ReportTemplate = {
  id: 'tmpl-prelim-nongyn-cytology',
  name: 'Preliminary Report — Non-GYN / FNA Cytology',
  specialty: 'preliminary-cytology',
  subspecialty: 'non_gyn',
  standard: 'custom',
  status: 'published',
  orchestrationEnabled: true,
  institutionId: INST,
  createdBy: SYSTEM,
  createdAt: NOW,
  updatedAt: NOW,
  version: '1.0.0',
  assembly: [
    { slotId: 'slot-h-banner', partId: 'prelim_header_banner', partName: 'Preliminary Status Banner', partType: 'header', role: 'header-p1', enabled: true, order: 0 },
    { slotId: 'slot-h-p1',     partId: 'std_header_page1',     partName: 'Page 1 — Header',            partType: 'header', role: 'header-p1', enabled: true, order: 1 },
    { slotId: 'slot-h-p2',     partId: 'std_header_p2plus',    partName: 'Pages 2+ — Header',           partType: 'header', role: 'header-p2plus', enabled: true, order: 0 },
    { slotId: 'slot-b-01', partId: 'std_body_demographics',       partName: 'Patient & Order Demographics',                        partType: 'body', role: 'body', enabled: true, order: 0 },
    { slotId: 'slot-b-02', partId: 'std_body_clinical',           partName: 'Clinical Information',                                partType: 'body', role: 'body', enabled: true, order: 1 },
    { slotId: 'slot-b-03', partId: 'std_body_specimens',          partName: 'Specimens Submitted',                                 partType: 'body', role: 'body', enabled: true, order: 2 },
    { slotId: 'slot-b-04', partId: 'prelim_body_nongyn_cytology', partName: 'Non-GYN/FNA Cytology — Preliminary Interpretation',   partType: 'body', role: 'body', enabled: true, order: 3 },
    { slotId: 'slot-b-05', partId: 'prelim_body_signoff',         partName: 'Preliminary Reviewer Attestation',                    partType: 'body', role: 'body', enabled: true, order: 4 },
    { slotId: 'slot-f-p1', partId: 'std_footer_page1',   partName: 'Page 1 — Footer',   partType: 'footer', role: 'footer-p1',     enabled: true, order: 0 },
    { slotId: 'slot-f-p2', partId: 'std_footer_p2plus',  partName: 'Pages 2+ — Footer', partType: 'footer', role: 'footer-p2plus', enabled: true, order: 0 },
  ],
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_TEMPLATES: ReportTemplate[] = [
  GOLD_STANDARD,
  BREAST_TEMPLATE,
  GI_TEMPLATE,
  THORACIC_TEMPLATE,
  URO_TEMPLATE,
  PRELIM_SURGPATH_TEMPLATE,
  PRELIM_GYN_CYTOLOGY_TEMPLATE,
  PRELIM_NONGYN_CYTOLOGY_TEMPLATE,
];

// ── Change listeners (mirrors onReportPartsChanged pattern) ──────────────────
// TemplateListTab calls: useEffect(() => { load(); return onReportTemplatesChanged(load); }, [load])

type Listener = () => void;
const _templateListeners: Set<Listener> = new Set();

/** Subscribe to template data changes. Returns an unsubscribe function. */
export function onReportTemplatesChanged(cb: Listener): () => void {
  _templateListeners.add(cb);
  return () => _templateListeners.delete(cb);
}

function _notifyTemplateListeners() {
  _templateListeners.forEach(cb => cb());
}

// ── Service ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pathscribe_report_templates';
const load    = () => storageGet<ReportTemplate[]>(STORAGE_KEY, SEED_TEMPLATES);
const persist = (data: ReportTemplate[]) => storageSet(STORAGE_KEY, data);
let TEMPLATES: ReportTemplate[] = load();

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(e: string): ServiceResult<T> => ({ ok: false, error: e });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockReportTemplateService: IReportTemplateService = {
  async getAll() {
    await delay();
    return ok([...TEMPLATES]);
  },

  async getById(id: ID) {
    await delay();
    const t = TEMPLATES.find(t => t.id === id);
    return t ? ok({ ...t }) : err(`Template ${id} not found`);
  },

  async getBySubspecialty(subspecialtyId: string) {
    await delay();
    const results = TEMPLATES.filter(
      t => t.subspecialty === subspecialtyId || t.specialty === subspecialtyId
    );
    return ok(results.length ? results : [GOLD_STANDARD]);
  },

  async create(t) {
    await delay();
    const newT: ReportTemplate = {
      ...t,
      id:        `tmpl-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    TEMPLATES = [...TEMPLATES, newT];
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...newT });
  },

  // save() — accepts a full template object (used by TemplateAssemblyPage)
  async save(template: ReportTemplate) {
    await delay();
    const idx = TEMPLATES.findIndex(t => t.id === template.id);
    if (idx === -1) return err<ReportTemplate>(`Template ${template.id} not found`);
    const updated = { ...template, updatedAt: new Date().toISOString() };
    TEMPLATES = TEMPLATES.map(t => t.id === template.id ? updated : t);
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...updated });
  },

  async update(id, changes) {
    await delay();
    const idx = TEMPLATES.findIndex(t => t.id === id);
    if (idx === -1) return err(`Template ${id} not found`);
    const updated = { ...TEMPLATES[idx], ...changes, updatedAt: new Date().toISOString() };
    TEMPLATES = TEMPLATES.map(t => t.id === id ? updated : t);
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...updated });
  },

  async clone(id: ID, name?: string) {
    await delay();
    const src = TEMPLATES.find(t => t.id === id);
    if (!src) return err<ReportTemplate>(`Template ${id} not found`);
    const cloned: ReportTemplate = {
      ...JSON.parse(JSON.stringify(src)),
      id:        `tmpl-${Date.now()}`,
      name:      name ?? `${src.name} (copy)`,
      status:    'draft' as const,
      assembly:  (src as any).assembly ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user',
    };
    TEMPLATES = [...TEMPLATES, cloned];
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...cloned });
  },

  async remove(id: ID) {
    await delay();
    if (!TEMPLATES.find(t => t.id === id)) return err(`Template ${id} not found`);
    TEMPLATES = TEMPLATES.filter(t => t.id !== id);
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok(undefined);
  },

  // archive() — soft-delete: sets status to 'archived' rather than removing
  // the record. Use this (not remove()) for any template that has ever been
  // published, since a real report may have been generated using it and
  // its structure must remain inspectable for as long as that report exists.
  // remove() should only ever be called on a template still in 'draft'
  // status — i.e. one that could never have produced a real report.
  async archive(id: ID) {
    await delay();
    const idx = TEMPLATES.findIndex(t => t.id === id);
    if (idx === -1) return err<ReportTemplate>(`Template ${id} not found`);
    if (id === STANDARD_TEMPLATE_ID) {
      return err<ReportTemplate>('The Gold Standard template cannot be archived — it is the universal routing fallback (Pass 3). Designate a different template as Gold Standard first.');
    }
    const updated: ReportTemplate = {
      ...TEMPLATES[idx],
      status:    'archived' as const,
      updatedAt: new Date().toISOString(),
    };
    TEMPLATES = TEMPLATES.map(t => t.id === id ? updated : t);
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...updated });
  },

  // publish() — sets status to 'published' (used by TemplateAssemblyPage)
  async publish(id: ID) {
    await delay();
    const idx = TEMPLATES.findIndex(t => t.id === id);
    if (idx === -1) return err<ReportTemplate>(`Template ${id} not found`);
    const updated: ReportTemplate = {
      ...TEMPLATES[idx],
      status:    'published' as const,
      updatedAt: new Date().toISOString(),
    };
    TEMPLATES = TEMPLATES.map(t => t.id === id ? updated : t);
    persist(TEMPLATES);
    _notifyTemplateListeners();
    return ok({ ...updated });
  },
};
