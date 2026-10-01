/**
 * services/reportParts/mockReportPartService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mock implementation of IReportPartService.
 *
 * Seeded with the PathScribe Standard Part Library:
 *
 *   HEADERS
 *   ├── PathScribe Standard Header (Page 1)
 *   │     Institution logo · Accession · Patient demographics · QR code
 *   └── PathScribe Compact Header (Pages 2+)
 *         Running header: accession · patient · date
 *
 *   FOOTERS
 *   ├── PathScribe Standard Footer (Page 1)
 *   │     Patient line · Confidentiality notice
 *   └── PathScribe Page Number Footer (Pages 2+)
 *         Page N of M · Accession
 *
 *   BODY PARTS
 *   ├── Clinical Information      Auto-populated from case
 *   ├── Specimens Submitted       Auto-populated repeat group
 *   ├── Diagnosis                 AI-generated, primary edit zone
 *   ├── Synoptic Summary          Auto-table, 2-column biomarkers
 *   ├── Gross Description         AI-generated
 *   ├── Microscopic Description   AI-generated
 *   ├── Ancillary Studies         Conditional on IHC
 *   ├── Comment                   Optional free text
 *   └── Sign-off                  Pathologist · Date · Sig line
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ServiceResult, ID } from '../types';
import type { ReportPart, PartLibraryFilter, ReportPartType, ReportPartStatus } from '../../types/reportPart';
import type { TemplateNode } from '../../types/template';
import type { IReportPartService } from './IReportPartService';

// ── Helpers ────────────────────────────────────────────────────

const delay = (ms = 300) => new Promise(res => setTimeout(res, ms));
const now   = () => new Date().toISOString();
const uid   = () => crypto.randomUUID();

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(message: string, _code = 'ERROR'): ServiceResult<T> =>
  ({ ok: false, error: message });

// ── Change events ──────────────────────────────────────────────

const CHANGE_EVENT = 'PATHSCRIBE_REPORT_PARTS_CHANGED';
const notifyChanged = () => window.dispatchEvent(new Event(CHANGE_EVENT));

export function onReportPartsChanged(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// ── Persistence ────────────────────────────────────────────────

const LS = 'ps_rpart_';
const lsLoad  = (id: string): ReportPart | null => {
  try { const r = localStorage.getItem(LS + id); return r ? JSON.parse(r) : null; } catch { return null; }
};
const lsSave  = (p: ReportPart) => localStorage.setItem(LS + p.id, JSON.stringify(p));
const lsDel   = (id: string) => localStorage.removeItem(LS + id);
const lsAllIds = () => Object.keys(localStorage).filter(k => k.startsWith(LS)).map(k => k.slice(LS.length));

// ── In-memory store ────────────────────────────────────────────

const store = new Map<string, ReportPart>();

const storeGet = (id: string): ReportPart | undefined => {
  const p = lsLoad(id); if (p) { store.set(id, p); return p; }
  return store.get(id);
};

const storeAll = (): ReportPart[] => {
  const ids = new Set([...store.keys(), ...lsAllIds()]);
  return Array.from(ids).map(storeGet).filter(Boolean) as ReportPart[];
};

// ── Node builders ──────────────────────────────────────────────

const e  = (label: string, tmpl: string, fb = '—', span = 12, hideIfEmpty = false): TemplateNode =>
  ({ id: uid(), type: 'expression-value', label, template: tmpl, fallback: fb, colSpan: span, hideIfEmpty });

const p  = (label: string, key: string, ai = true, span = 12): TemplateNode =>
  ({ id: uid(), type: 'paragraph', label, bindingKey: key, richText: true, aiWritable: ai, colSpan: span });

const sl = (label: string, text: string, v: 'h1'|'h2'|'h3'|'body'|'caption' = 'body', bold = false, span = 12): TemplateNode =>
  ({ id: uid(), type: 'static-label', label, text, variant: v, bold, colSpan: span });

const dd = (label: string, key: string, options: {value:string;label:string}[], span = 12): TemplateNode =>
  ({ id: uid(), type: 'dropdown', label, bindingKey: key, options, multi: false, colSpan: span });

const rg = (label: string, over: string, children: TemplateNode[], alias = 'specimen'): TemplateNode =>
  ({ id: uid(), type: 'repeat-group', label, iterateOver: over, itemAlias: alias, children, colSpan: 12 });

const col = (children: TemplateNode[], n: 2|3|4 = 2, gap = 20): TemplateNode =>
  ({ id: uid(), type: 'column-layout', label: `${n}-column`, numColumns: n, columnGap: gap, children, colSpan: 12 });

const sec = (label: string, children: TemplateNode[], ai?: { enabled: boolean; systemInstruction?: string; maxTokens?: number }): TemplateNode =>
  ({ id: uid(), type: 'section', label, children, collapsible: true, printHeading: label,
     ai: ai ?? { enabled: false }, colSpan: 12 });

const ifBlock = (label: string, field: string, val: string, children: TemplateNode[]): TemplateNode =>
  ({ id: uid(), type: 'if-block', label,
     condition: { logic: 'AND', clauses: [{ field, operator: '==', value: val }] },
     children, colSpan: 12 });

// ── Part factory ───────────────────────────────────────────────

function part(
  id: string,
  name: string,
  partType: ReportPartType,
  nodes: TemplateNode[],
  opts: Partial<ReportPart> = {}
): ReportPart {
  const t = now();
  return {
    id, name, partType,
    specialty: 'General',
    status: 'published',
    nodes,
    institutionId: '',
    createdBy: 'PathScribe',
    createdAt: t, updatedAt: t,
    version: '1.0.0',
    ...opts,
  };
}

// ══════════════════════════════════════════════════════════════
//  STANDARD PART LIBRARY
//  Designed for maximum clinical efficiency.
//  Every field that can be auto-populated, is.
//  Every narrative section that can be AI-generated, is.
//  Pathologist effort: review + sign-off only.
// ══════════════════════════════════════════════════════════════

// ── HEADER: Page 1 ────────────────────────────────────────────
// Full institutional branding + complete patient demographics
// in a two-column layout. QR code top-right.

const HDR_P1_ID = 'std_header_page1';

const hdrP1 = part(HDR_P1_ID, 'PathScribe Standard Header — Page 1', 'header', [
  {
    id: uid(), type: 'header', label: 'Page 1 Header',
    scope: 'page1', showLogo: true, showAccession: true, showPatientName: true, height: 88,
    colSpan: 12,
    children: [
      e('Institution',  '{{institution.name}}',        'PathScribe Laboratory'),
      e('Department',   '{{institution.department}}',  'Department of Anatomic Pathology'),
      e('Address',      '{{institution.address}}',     ''),
      e('Phone',        '{{institution.phone}}',       ''),
    ],
  } as TemplateNode,
], { description: 'Full institutional header for page 1. Shows logo, branding, accession, and patient demographics.' });

// ── HEADER: Pages 2+ ──────────────────────────────────────────
// Compact single-line running header so every continuation page
// is traceable without wasting space.

const HDR_P2_ID = 'std_header_p2plus';

const hdrP2 = part(HDR_P2_ID, 'PathScribe Compact Header — Pages 2+', 'header', [
  {
    id: uid(), type: 'header', label: 'Pages 2+ Header',
    scope: 'pages2plus', showLogo: false, showAccession: true, showPatientName: true, height: 30,
    colSpan: 12,
    children: [
      e('Running header',
        '{{order.fullAccession}}  ·  {{patient.name}}  ·  DOB {{patient.dob}}', ''),
    ],
  } as TemplateNode,
], { description: 'Compact running header for pages 2+. Accession · Patient · DOB on one line.' });

// ── FOOTER: Page 1 ────────────────────────────────────────────
// Patient identity line + confidentiality notice.

const FTR_P1_ID = 'std_footer_page1';

const ftrP1 = part(FTR_P1_ID, 'PathScribe Standard Footer — Page 1', 'footer', [
  {
    id: uid(), type: 'footer', label: 'Page 1 Footer',
    scope: 'page1', showPageNumbers: true,
    pageNumberFormat: 'Page {{page.number}} of {{page.total}}',
    height: 40, colSpan: 12,
    children: [
      e('Patient line', '{{patient.name}}  ·  DOB {{patient.dob}}  ·  {{order.fullAccession}}', ''),
      sl('Confidentiality',
        'CONFIDENTIAL — This report is intended solely for the requesting clinician.',
        'caption', false, 12),
    ],
  } as TemplateNode,
], { description: 'Standard page 1 footer with patient identity and confidentiality notice.' });

// ── FOOTER: Pages 2+ ──────────────────────────────────────────
// Page numbers + accession on continuation pages.

const FTR_P2_ID = 'std_footer_p2plus';

const ftrP2 = part(FTR_P2_ID, 'PathScribe Compact Footer — Pages 2+', 'footer', [
  {
    id: uid(), type: 'footer', label: 'Pages 2+ Footer',
    scope: 'pages2plus', showPageNumbers: true,
    pageNumberFormat: 'Page {{page.number}} of {{page.total}}',
    height: 28, colSpan: 12,
    children: [
      e('Accession line', '{{order.fullAccession}}  ·  {{patient.name}}', ''),
    ],
  } as TemplateNode,
], { description: 'Compact footer for pages 2+. Page number and accession only.' });

// ── BODY: Patient Demographics ─────────────────────────────────
// 100% auto-populated from case data. Pathologist sees this but
// never edits it. Two-column layout: identity left, order right.

const DEMO_ID = 'std_body_demographics';

const demoPart = part(DEMO_ID, 'Patient & Order Demographics', 'body', [
  sec('Patient & Accession', [
    col([
      // Left column: patient identity
      e('Accession',        '{{order.fullAccession}}',                    'S26-XXXX', 12),
      e('Patient name',     '{{patient.name}}',                           '—',         12),
      e('Date of birth',    '{{patient.dob}}',                            '—',         12),
      e('Age',              '{{patient.age}} years',                      '—',         12),
      e('Sex',              '{{patient.sex}}',                            '—',         12),
      e('MRN',              '{{patient.mrn}}',                            '—',         12),
      // Right column: order info
      e('Requesting provider', '{{order.requestingProvider}}',            '—',         12),
      e('Referring facility',  '{{order.facilityName}}',                  '—',         12),
      e('Received date',       '{{order.receivedDate}}',                  '—',         12),
      e('Priority',            '{{order.priority}}',                      'Routine',   12),
      e('Report date',         '{{diagnostic.issuedDate}}',               '—',         12),
    ], 2),
    // QR code — right-aligned
    { id: uid(), type: 'image-embed', label: 'QR Code',
      bindingKey: 'accession.qrCodeUrl', alt: 'Accession QR',
      width: 72, height: 72, alignment: 'right', colSpan: 12 } as TemplateNode,
  ]),
], { description: 'Auto-populated patient demographics, order info and QR code. No pathologist input required.' });

// ── BODY: Clinical Information ─────────────────────────────────
// Single expression value. Auto-populated.

const CLINICAL_ID = 'std_body_clinical';

const clinicalPart = part(CLINICAL_ID, 'Clinical Information', 'body', [
  sec('Clinical Information', [
    e('Clinical indication', '{{order.clinicalIndication}}', 'No clinical information provided.', 12),
    p('Additional clinical notes', 'diagnostic.clinicalNotes', false, 12),
  ]),
], { description: 'Clinical indication auto-populated from the request. Optional free-text addition.' });

// ── BODY: Specimens Submitted ──────────────────────────────────
// Repeat group over specimens — fully auto.

const SPECIMENS_ID = 'std_body_specimens';

const specimensPart = part(SPECIMENS_ID, 'Specimens Submitted', 'body', [
  sec('Specimen(s) Submitted', [
    rg('Specimen list', 'specimens', [
      col([
        e('Label',      '{{specimen.label}}',      'Specimen', 12),
        e('Type',       '{{specimen.type}}',       '—',         12),
        e('Site',       '{{specimen.site}}',       '—',         12),
        e('Laterality', '{{specimen.laterality}}', '—',         12),
        e('Fixative',   '{{specimen.fixative}}',   '—',         12),
        e('Received',   '{{specimen.receivedAt}}', '—',         12),
      ], 2),
    ]),
  ]),
], { description: 'Auto-populated list of all submitted specimens with site, type and fixative.' });

// ── BODY: Diagnosis ────────────────────────────────────────────
// PRIMARY PATHOLOGIST EDIT ZONE.
// AI generates a draft diagnosis per specimen from synoptic data.
// Pathologist reads, edits if needed, selects diagnostic category.
// Target time: 30–60 seconds per specimen.

const DIAGNOSIS_ID = 'std_body_diagnosis';

const diagnosisPart = part(DIAGNOSIS_ID, 'Diagnosis', 'body', [
  sec('Diagnosis', [
    rg('Per-specimen diagnoses', 'specimens', [
      sl('Specimen label', '{{specimen.label}}.', 'h3', true, 12),
      // Real, per direct correction ("a text field on the report
      // should be declared as the final diagnosis... we need to
      // audit those changes") — the one, real, explicitly-declared
      // Final Diagnosis field for every Final-category template that
      // uses this shared part (confirmed directly: all 5 real Final
      // templates reference std_body_diagnosis by the same partId).
      // Spread onto p()'s own real, unmodified output rather than
      // changing that shared helper's own signature, since it's used
      // widely elsewhere for fields with nothing to do with this.
      { ...p('Diagnosis text', 'specimen.diagnosis', true, 12), isFinalDiagnosisField: true },
      col([
        dd('Diagnostic category', 'specimen.diagnosticCategory', [
          { value: 'benign',               label: 'Benign' },
          { value: 'atypical',             label: 'Atypical / Indeterminate' },
          { value: 'malignant_primary',    label: 'Malignant — Primary' },
          { value: 'malignant_metastatic', label: 'Malignant — Metastatic' },
          { value: 'non_diagnostic',       label: 'Non-diagnostic' },
          { value: 'normal',               label: 'Normal tissue' },
        ], 6),
        e('Pathological stage', '{{primarySynoptic.answers.pathologicalStage}}', '—', 6),
      ], 2),
    ]),
    p('Diagnostic comment', 'diagnostic.diagnosticComment', true, 12),
  ], {
    enabled: true,
    maxTokens: 600,
    
    systemInstruction:
      'Generate a concise anatomic pathology diagnosis for each specimen. ' +
      'Use standard CAP/RCPath terminology. ' +
      'Format: "[Label]. [Anatomic site]: [Diagnosis], [grade if applicable], [size if available]." ' +
      'Include margin status and lymph node status where relevant. ' +
      'One to two sentences per specimen. Do not include a section heading. ' +
      'Do not repeat data already captured in the synoptic summary.',
  }),
], { description: 'AI-drafted diagnosis per specimen. Pathologist reviews and confirms. ~60 seconds.' });

// ── BODY: Synoptic Summary ─────────────────────────────────────
// Marker node — the orchestrator engine renders this from live
// synoptic answers at assembly time. No AI generation. Read-only
// in the draft view.

const SYNOPTIC_ID = 'std_body_synoptic';

const synopticPart = part(SYNOPTIC_ID, 'Synoptic Summary', 'body', [
  {
    id: 'synoptic-block-primary',
    type: 'synoptic-block',
    label: 'Synoptic Summary',
    colSpan: 12,
  } as unknown as TemplateNode,
], { description: 'Auto-populated synoptic data table. Two-column: primary findings and biomarkers. No pathologist input.' });

// ── BODY: Gross Description ────────────────────────────────────
// AI writes a complete gross description per specimen from the
// synoptic answers + specimen metadata. Pathologist reviews only.
// Target: 60 seconds total.

const GROSS_ID = 'std_body_gross';

const grossPart = part(GROSS_ID, 'Gross Description', 'body', [
  sec('Gross Description', [
    rg('Per-specimen gross', 'specimens', [
      sl('Specimen label', '{{specimen.label}}.', 'h3', true, 12),
      p('Gross description', 'specimen.grossDescription', true, 12),
    ]),
  ], {
    enabled: true,
    maxTokens: 512,
    
    systemInstruction:
      'Write a professional gross pathology description for each specimen. ' +
      'Cover in order: (1) container label as received, (2) specimen type and orientation, ' +
      '(3) external dimensions in mm (L × W × D), (4) external surface appearance, ' +
      '(5) cut surface — consistency, colour, and any lesion identified with dimensions and ' +
      'distance to closest margin, (6) representative sections submitted with cassette codes. ' +
      'Use past tense throughout. Be precise and objective. 4–6 sentences per specimen.',
  }),
], { description: 'AI-generated gross description per specimen. Pathologist reviews. ~60 sec.' });

// ── BODY: Microscopic Description ─────────────────────────────
// AI synthesises a microscopic description from synoptic data.
// Pathologist reviews — not writes.

const MICRO_ID = 'std_body_microscopic';

const microPart = part(MICRO_ID, 'Microscopic Description', 'body', [
  sec('Microscopic Description', [
    rg('Per-specimen microscopic', 'specimens', [
      sl('Specimen label', '{{specimen.label}}.', 'h3', true, 12),
      p('Microscopic description', 'specimen.microscopicDescription', true, 12),
    ]),
  ], {
    enabled: true,
    maxTokens: 600,
    
    systemInstruction:
      'Write a professional microscopic description based on the synoptic findings. ' +
      'Describe in order: (1) histologic architecture and tumour type, (2) cytologic features ' +
      'including nuclear grade and mitotic activity, (3) margin status with distance in mm, ' +
      '(4) lymphovascular invasion, (5) perineural invasion, (6) associated in-situ component ' +
      'if applicable, (7) uninvolved background tissue. ' +
      'Reference IHC results if available in the synoptic. ' +
      'Use past tense. Be clinically precise. 4–7 sentences per specimen.',
  }),
], { description: 'AI-generated microscopic description per specimen. Pathologist reviews. ~60 sec.' });

// ── BODY: Ancillary Studies ────────────────────────────────────
// Only rendered when IHC has been performed (conditional block).
// AI summarises IHC panel and molecular results.

const ANCILLARY_ID = 'std_body_ancillary';

const ancillaryPart = part(ANCILLARY_ID, 'Ancillary Studies', 'body', [
  sec('Ancillary Studies', [
    ifBlock('Show if IHC performed',
      'primarySynoptic.answers.ihcPerformed', 'Yes', [
        p('Ancillary studies', 'diagnostic.ancillaryStudies', true, 12),
      ]
    ),
    ifBlock('Molecular / FISH results',
      'primarySynoptic.answers.molecularPerformed', 'Yes', [
        p('Molecular results', 'diagnostic.molecularResults', true, 12),
      ]
    ),
  ], {
    enabled: true,
    maxTokens: 400,
    
    systemInstruction:
      'Summarise ancillary studies performed. For immunohistochemistry: state antibodies, ' +
      'clones where known, scoring system used, and results for each marker. ' +
      'For FISH or molecular testing: state the assay, target, and result. ' +
      'Note any quality control issues. State clinical significance of results concisely. ' +
      'Only include tests actually performed — do not infer.',
  }),
], { description: 'AI-summarised IHC and molecular results. Conditional — only appears if IHC performed.' });

// ── BODY: Comment ──────────────────────────────────────────────
// Unstructured free text. Optional. Last resort.

const COMMENT_ID = 'std_body_comment';

const commentPart = part(COMMENT_ID, 'Comment', 'body', [
  sec('Comment', [
    p('Comment', 'diagnostic.comment', false, 12),
  ]),
], { description: 'Optional free-text comment block for additional clinical context or caveats.' });

// ── BODY: Sign-off ─────────────────────────────────────────────
// Pathologist name, finalised date, electronic signature notice.
// One-click completion.

const SIGNOFF_ID = 'std_body_signoff';

const signoffPart = part(SIGNOFF_ID, 'Pathologist Sign-off', 'body', [
  sec('Pathologist', [
    col([
      e('Reporting pathologist', '{{order.assignedTo}}',     '—', 12),
      e('Finalised',             '{{diagnostic.issuedDate}}', '—', 12),
      e('Countersigned by',      '{{diagnostic.countersignedBy}}', '—', 12),
      e('Countersigned',         '{{diagnostic.countersignedAt}}', '—', 12),
    ], 2),
    sl('Sig line', '_______________________________________________', 'body', false, 12),
    sl('Auth notice',
      'Electronically signed. This report has been reviewed and authorised by the reporting pathologist.',
      'caption', false, 12),
  ]),
], { description: 'Pathologist sign-off block. Auto-populated. One-click finalisation.' });

// ══════════════════════════════════════════════════════════════
//  PRELIMINARY REPORT PART LIBRARY
//  Real, per direct spec ("build a compliant base template for an
//  Anatomic Pathology Preliminary Report across Surgical Pathology,
//  GYN Cytology, and Non-GYN/FNA") — PS-292's own three-group
//  decision. Universal sections (demographics, clinical history,
//  specimen source) reuse the existing standard parts directly —
//  parts are assembled by reference, not copied, so nothing new was
//  needed for those. Only the genuinely Preliminary-specific and
//  discipline-specific sections below are new.
// ══════════════════════════════════════════════════════════════

// ── HEADER: Preliminary status banner ──────────────────────────
// Real, per direct spec: "Prominent header explicitly stating
// 'PRELIMINARY REPORT - NOT FINAL DIAGNOSIS' to prevent clinical
// misinterpretation in the EHR." Shared across all three groups —
// the wording and prominence don't vary by discipline.

const PRELIM_BANNER_ID = 'prelim_header_banner';

const prelimBannerPart = part(PRELIM_BANNER_ID, 'Preliminary Status Banner', 'header', [
  sl('Preliminary banner', 'PRELIMINARY REPORT — NOT FINAL DIAGNOSIS', 'h1', true, 12),
], { description: 'Prominent, non-suppressible status banner marking a report as preliminary — shown on every page.', specialty: 'General' });

// ── BODY: Surgical Pathology — Preliminary Impression ──────────
// Real, per direct spec: "Preliminary Microscopic / Impression:
// initial findings or provisional classification prior to special
// stains, IHC, or recuts." Deliberately lighter than the existing,
// final-report microPart — no margin/LVI/PNI detail expected yet.

const PRELIM_SURGPATH_IMPRESSION_ID = 'prelim_body_surgpath_impression';

const prelimSurgPathImpressionPart = part(PRELIM_SURGPATH_IMPRESSION_ID, 'Preliminary Diagnosis / Impression', 'body', [
  sec('Preliminary Diagnosis', [
    // Real fix, per direct follow-up ("does a Preliminary Diagnosis
    // Text Field exist?"): this originally bound to the non-existent
    // specimen.preliminaryImpression inside a repeat-group — no such
    // per-specimen field exists anywhere in the real data model.
    // grossDescription/microscopicDescription (DiagnosticMetadata,
    // types/case/Case.ts) are themselves case-level, single-string
    // fields, not per-specimen ones, despite the existing grossPart/
    // microPart templates wrapping them in a specimen repeat-group —
    // matching that same real, case-level shape here (diagnostic.
    // preliminaryImpression, now real), not perpetuating the
    // per-specimen framing those two also use.
    p('Preliminary impression', 'diagnostic.preliminaryImpression', true, 12),
  ], {
    enabled: true,
    maxTokens: 300,
    systemInstruction:
      'Write a brief, provisional diagnostic impression based on gross findings and any '
      + 'initial microscopic review available. State clearly that special stains, IHC, or recuts may still '
      + 'be pending. Do not state a final diagnostic category. 2–4 sentences.',
  }),
], { description: 'Provisional diagnostic impression, prior to ancillary studies. Real, deliberate case-level counterpart to std_body_diagnosis, not a copy of it.' });

// ── BODY: Surgical Pathology — Ancillary Testing Status ────────
// Real, per direct spec: "Clear indication of pending studies (e.g.
// 'IHC pending,' 'Decalcification in progress,' 'Molecular studies
// ordered')." Deliberately the inverse of the existing ancillaryPart
// (which shows RESULTS once performed) — this shows STATUS while
// still pending. hideIfEmpty on each line means a study never
// ordered for this case simply never appears, rather than showing a
// literal "N/A" — real, existing engine behavior
// (ReportPreviewRenderer.tsx), not new to build.

const PRELIM_ANCILLARY_STATUS_ID = 'prelim_body_ancillary_status';

const prelimAncillaryStatusPart = part(PRELIM_ANCILLARY_STATUS_ID, 'Ancillary Testing Status', 'body', [
  sec('Ancillary Testing Status', [
    // Real fix, per direct follow-up ("I'm not sure pending for a
    // text field makes sense unless it is a required field for the
    // final report"): none of these five are required for every
    // final report — most cases never order most of them. hideIfEmpty
    // now actually set (it wasn't before, despite this part's own
    // description already claiming it was) so a study never ordered
    // for this case simply never appears, rather than showing
    // "Pending" for something that was never coming in the first
    // place, or a blank line for it.
    e('Special stains',       '{{diagnostic.specialStainsStatus}}',       '', 12, true),
    e('Immunohistochemistry', '{{diagnostic.ihcStatus}}',                 '', 12, true),
    e('Decalcification',      '{{diagnostic.decalcificationStatus}}',     '', 12, true),
    e('Molecular studies',    '{{diagnostic.molecularStatus}}',           '', 12, true),
    e('Recuts / deeper levels', '{{diagnostic.recutStatus}}',             '', 12, true),
  ]),
], { description: 'Real-time status of pending ancillary studies — special stains, IHC, decal, molecular, recuts. Each line hides automatically when not applicable to this case (hideIfEmpty).' });

// ── BODY: GYN Cytology — Preliminary Interpretation ────────────
// Real, per direct spec's own §2 (Cytology GYN — Pap Tests):
// Specimen Adequacy Statement, Preliminary Interpretation/
// Categorization (Bethesda), General Categorization Indicator.

const PRELIM_GYN_CYTOLOGY_ID = 'prelim_body_gyn_cytology';

const prelimGynCytologyPart = part(PRELIM_GYN_CYTOLOGY_ID, 'GYN Cytology — Preliminary Interpretation', 'body', [
  sec('Specimen Adequacy', [
    // "Pending evaluation" correctly kept here, unlike the ancillary
    // status fields above: adequacy, general categorization, and
    // Bethesda category are mandatory, structural components of
    // EVERY Bethesda-system Pap report, final or preliminary — never
    // case-dependent the way IHC/molecular/decal are. "Pending"
    // honestly signals "this will be filled in," not "this study may
    // never have been ordered."
    e('Adequacy statement', '{{cytology.adequacyStatement}}', 'Pending evaluation', 12),
  ]),
  sec('Preliminary Interpretation', [
    e('General categorization',  '{{cytology.generalCategorization}}', 'Pending evaluation', 12),
    e('Bethesda preliminary category', '{{cytology.bethesdaPreliminaryCategory}}', 'Pending evaluation', 12),
    p('Preliminary interpretation notes', 'cytology.preliminaryNotes', true, 12),
  ]),
], { description: 'GYN (Pap) preliminary screening result — adequacy, general categorization, and Bethesda provisional classification.', specialty: 'cytology', subspecialty: 'gyn' });

// ── BODY: Non-GYN / FNA Cytology — Preliminary Interpretation ──
// Real, per direct spec's own §3 (Non-GYN & FNA): ROSE/adequacy
// assessment, preliminary diagnostic impression, preparation
// details (smear/LBP/cell block counts and type).

const PRELIM_NONGYN_CYTOLOGY_ID = 'prelim_body_nongyn_cytology';

const prelimNonGynCytologyPart = part(PRELIM_NONGYN_CYTOLOGY_ID, 'Non-GYN/FNA Cytology — Preliminary Interpretation', 'body', [
  sec('Specimen Adequacy', [
    // Real fix, per direct follow-up ("I'm not sure pending for a
    // text field makes sense unless it is a required field for the
    // final report"): the original, single "ROSE / adequacy
    // assessment" field conflated two genuinely different things —
    // ROSE itself (on-site evaluation) is never performed at every
    // site or on every FNA, so it's optional and hides when absent;
    // a real adequacy determination, in some form, is expected for
    // every FNA/non-GYN specimen regardless of whether ROSE was
    // used, so "Pending evaluation" is honestly kept there.
    e('ROSE performed', '{{cytology.rosePerformed}}', '', 12, true),
    e('Adequacy assessment', '{{cytology.adequacyAssessment}}', 'Pending evaluation', 12),
  ]),
  sec('Preparation Details', [
    // Real fix, same reasoning as the ancillary status part: a given
    // case may only use one of these three preparation types, not
    // all — each hides independently rather than showing blank for
    // preparations that were never made for this specimen.
    e('Direct smears',            '{{cytology.directSmearCount}}',      '', 12, true),
    e('Liquid-based preparations', '{{cytology.lbpCount}}',             '', 12, true),
    e('Cell block',               '{{cytology.cellBlockStatus}}',       '', 12, true),
  ]),
  sec('Preliminary Diagnostic Impression', [
    p('Preliminary impression', 'cytology.preliminaryImpression', true, 12),
  ]),
], { description: 'Non-GYN/FNA preliminary result — ROSE/adequacy, preparation counts, and provisional narrative impression.', specialty: 'cytology', subspecialty: 'non_gyn' });

// ── BODY: Preliminary Sign-off & Critical Value Log ────────────
// Real, per direct spec's own footer requirements — deliberately
// separate from the existing, final-report signoffPart, whose own
// language ("Electronically signed... authorised by the reporting
// pathologist") is final-report attestation language, not
// appropriate for a preliminary, non-final document.

const PRELIM_SIGNOFF_ID = 'prelim_body_signoff';

const prelimSignoffPart = part(PRELIM_SIGNOFF_ID, 'Preliminary Reviewer Attestation', 'body', [
  sec('Preliminary Reviewer', [
    col([
      e('Reviewed by',       '{{order.assignedTo}}',        '—', 12),
      e('Role',              '{{diagnostic.reviewerRole}}', 'Pathologist', 12),
      e('Preliminary findings recorded', '{{diagnostic.preliminaryRecordedAt}}', '—', 12),
    ], 2),
    sl('Prelim notice',
      'This is a preliminary report reflecting findings available at the time of issue. It is subject to revision upon completion of pending studies and is not a final diagnosis.',
      'caption', false, 12),
  ]),
  sec('Critical Value / Verbal Notification Log', [
    // Real fix, same reasoning throughout this file: a critical
    // finding is the exception, not the rule — most preliminary
    // reports have nothing to log here at all. hideIfEmpty now
    // actually set to match what this part's own description already
    // claimed.
    e('Critical finding communicated', '{{diagnostic.criticalValueCommunicated}}', '', 12, true),
    e('Notified to',                   '{{diagnostic.criticalValueRecipient}}',    '', 12, true),
    e('Notified at',                   '{{diagnostic.criticalValueNotifiedAt}}',   '', 12, true),
    p('Notification notes', 'diagnostic.criticalValueNotes', false, 12),
  ]),
], { description: 'Preliminary reviewer attestation (never final-report signature language) plus the critical-value/verbal-notification audit log. Each critical-value line hides automatically when no notification was made (hideIfEmpty).' });


// ── Seed all parts ─────────────────────────────────────────────

const SEED_PARTS: ReportPart[] = [
  hdrP1, hdrP2,
  ftrP1, ftrP2,
  demoPart, clinicalPart, specimensPart,
  diagnosisPart, synopticPart,
  grossPart, microPart, ancillaryPart,
  commentPart, signoffPart,
  prelimBannerPart, prelimSurgPathImpressionPart, prelimAncillaryStatusPart,
  prelimGynCytologyPart, prelimNonGynCytologyPart, prelimSignoffPart,
];

for (const p of SEED_PARTS) store.set(p.id, p);

// ── Protect built-in parts from deletion ──────────────────────

const PROTECTED_IDS = new Set(SEED_PARTS.map(p => p.id));

// ── Re-ID for cloning ──────────────────────────────────────────

function reIdNodes(nodes: TemplateNode[]): TemplateNode[] {
  return nodes.map(n => {
    const copy = { ...n, id: uid() };
    if ('children' in copy && Array.isArray((copy as { children: TemplateNode[] }).children)) {
      (copy as { children: TemplateNode[] }).children = reIdNodes(
        (copy as { children: TemplateNode[] }).children
      );
    }
    return copy;
  });
}

// ── Mock implementation ────────────────────────────────────────

class MockReportPartService implements IReportPartService {

  async getAll(filter?: PartLibraryFilter): Promise<ServiceResult<ReportPart[]>> {
    await delay(250);
    let results = storeAll();
    if (filter?.partType)  results = results.filter(p => p.partType === filter.partType);
    if (filter?.specialty && filter.specialty !== 'General')
      results = results.filter(p => p.specialty === filter.specialty || p.specialty === 'General');
    if (filter?.status)    results = results.filter(p => p.status === filter.status);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    }
    return ok(results);
  }

  async getById(id: ID): Promise<ServiceResult<ReportPart>> {
    await delay(200);
    const p = storeGet(id);
    if (!p) return err(`Part '${id}' not found`, 'NOT_FOUND');
    return ok(p);
  }

  async getByIds(ids: ID[]): Promise<ServiceResult<ReportPart[]>> {
    await delay(200);
    const parts = ids.map(storeGet).filter(Boolean) as ReportPart[];
    return ok(parts);
  }

  async create(partial: Partial<Omit<ReportPart, 'id'|'createdAt'|'updatedAt'>> = {}): Promise<ServiceResult<ReportPart>> {
    await delay(350);
    const created: ReportPart = {
      id: uid(), name: 'New Part', partType: 'body', specialty: 'General',
      status: 'draft', nodes: [], institutionId: '', createdBy: 'current-user',
      createdAt: now(), updatedAt: now(), version: '1.0.0',
      ...partial,
    };
    store.set(created.id, created);
    lsSave(created);
    notifyChanged();
    return ok(created);
  }

  async save(part: ReportPart): Promise<ServiceResult<ReportPart>> {
    await delay(350);
    const updated = { ...part, updatedAt: now() };
    store.set(updated.id, updated);
    lsSave(updated);
    notifyChanged();
    return ok(updated);
  }

  async publish(id: ID): Promise<ServiceResult<ReportPart>> {
    await delay(300);
    const p = storeGet(id);
    if (!p) return err(`Part '${id}' not found`, 'NOT_FOUND');
    const updated = { ...p, status: 'published' as ReportPartStatus, updatedAt: now() };
    store.set(id, updated); lsSave(updated); notifyChanged();
    return ok(updated);
  }

  async archive(id: ID): Promise<ServiceResult<ReportPart>> {
    await delay(300);
    const p = storeGet(id);
    if (!p) return err(`Part '${id}' not found`, 'NOT_FOUND');
    if (PROTECTED_IDS.has(id)) return err('Built-in parts cannot be archived. Duplicate and modify instead.', 'FORBIDDEN');
    const updated = { ...p, status: 'archived' as ReportPartStatus, updatedAt: now() };
    store.set(id, updated); lsSave(updated); notifyChanged();
    return ok(updated);
  }

  async clone(id: ID, newName: string): Promise<ServiceResult<ReportPart>> {
    await delay(400);
    const source = storeGet(id);
    if (!source) return err(`Part '${id}' not found`, 'NOT_FOUND');
    const cloned: ReportPart = {
      ...JSON.parse(JSON.stringify(source)),
      id: uid(),
      name: newName,
      status: 'draft' as ReportPartStatus,
      createdBy: 'current-user',
      createdAt: now(), updatedAt: now(),
      version: '1.0.0',
      originPartId: id,
      nodes: reIdNodes(source.nodes),
    };
    store.set(cloned.id, cloned); lsSave(cloned); notifyChanged();
    return ok(cloned);
  }

  async remove(id: ID): Promise<ServiceResult<void>> {
    await delay(300);
    if (PROTECTED_IDS.has(id)) return err('Built-in parts cannot be deleted. Duplicate and modify instead.', 'FORBIDDEN');
    store.delete(id); lsDel(id); notifyChanged();
    return ok(undefined);
  }
}

export const mockReportPartService: IReportPartService = new MockReportPartService();
