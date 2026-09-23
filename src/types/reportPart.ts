// src/types/reportPart.ts
// ─────────────────────────────────────────────────────────────
// ReportPart — the atomic, reusable building block of PathScribe
// Orchestration reports.
//
// A Part is a named, independently-versioned collection of
// TemplateNodes that serves a single structural role in a report.
// Parts are assembled (not embedded) into ReportTemplates — the
// template holds references, not copies, so updating a part
// instantly propagates to every template that uses it.
//
// Part types:
//   header  → Rendered at the top of the page(s) it is scoped to.
//             Contains institution branding, accession, patient bar.
//   footer  → Rendered at the bottom of scoped page(s).
//             Contains page numbers, confidentiality notice.
//   body    → Occupies the report body. A template can have multiple
//             body parts stacked in sequence (e.g. a shared clinical
//             section + a specialty-specific diagnosis section).
//             Body parts are the primary authoring target.
// ─────────────────────────────────────────────────────────────

import type { TemplateNode, AiGenerationConfig, LabelConfig } from './template';

// ── Part type ──────────────────────────────────────────────────

export type ReportPartType = 'header' | 'footer' | 'body';

export type ReportPartStatus = 'draft' | 'published' | 'archived';

// ── Page scope (for headers and footers only) ──────────────────

export type PageScope =
  | 'all'       // shown on every page
  | 'page1'     // shown on the first page only
  | 'p2plus';   // shown on page 2 onwards

// ── Assembly slot role ─────────────────────────────────────────
// Declares how a part participates in a template's page layout.

export type AssemblyRole =
  | 'header-p1'      // first page header
  | 'header-p2plus'  // continuation header
  | 'footer-p1'      // first page footer
  | 'footer-p2plus'  // continuation footer
  | 'body';          // report body section (multiple allowed)

// Real i18n indirection, per the file-by-file i18n sweep of
// TemplateAssemblyPage.tsx (this map's only real consumer, confirmed
// via a repo-wide search before renaming it here) — translates only
// the displayed label, not the underlying AssemblyRole value itself,
// same textKey pattern used throughout that sweep for persisted/
// computed enum displays.
export const ASSEMBLY_ROLE_LABEL_KEY: Record<AssemblyRole, string> = {
  'header-p1':     'templateAssemblyPage.role.headerP1',
  'header-p2plus': 'templateAssemblyPage.role.headerP2Plus',
  'body':          'templateAssemblyPage.role.body',
  'footer-p2plus': 'templateAssemblyPage.role.footerP2Plus',
  'footer-p1':     'templateAssemblyPage.role.footerP1',
};

export const ASSEMBLY_ROLE_ICONS: Record<AssemblyRole, string> = {
  'header-p1':     '▲',
  'header-p2plus': '△',
  'body':          '▬',
  'footer-p2plus': '▽',
  'footer-p1':     '▼',
};

// Roles that are valid for each part type
export const VALID_ROLES_FOR_PART: Record<ReportPartType, AssemblyRole[]> = {
  header: ['header-p1', 'header-p2plus'],
  footer: ['footer-p1', 'footer-p2plus'],
  body:   ['body'],
};

// Visual ordering for the assembly page
export const ROLE_DISPLAY_ORDER: AssemblyRole[] = [
  'header-p1',
  'header-p2plus',
  'body',
  'footer-p2plus',
  'footer-p1',
];

// ── Assembly slot ──────────────────────────────────────────────
// One entry in a template's assembly list.

export interface AssemblySlot {
  /** Unique ID for this slot (not the part ID) */
  slotId: string;
  /** The part being referenced */
  partId: string;
  /** Cached part name — avoids async lookup on every render */
  partName: string;
  /** Cached part type — for display and validation */
  partType: ReportPartType;
  /** Role this part plays in the page layout */
  role: AssemblyRole;
  /** Display order within role group (for multiple body parts) */
  order: number;
  /** Whether this slot is enabled in this template */
  enabled: boolean;
}

// ── Report Part ────────────────────────────────────────────────

export interface ReportPart {
  id: string;
  name: string;
  description?: string;

  /** header | footer | body */
  partType: ReportPartType;

  /**
   * Specialty this part applies to.
   * 'General' = available to all specialties.
   */
  specialty: string;

  /** Subspecialty / disease type (optional) */
  subspecialty?: string;

  /** CAP / RCPath / custom */
  standard?: 'CAP' | 'RCPath' | 'custom';

  status: ReportPartStatus;

  /**
   * The actual content — an ordered list of TemplateNodes.
   * Edited in the Part Builder (canvas + inspector).
   */
  nodes: TemplateNode[];

  /**
   * AI generation configuration for this part.
   * Body parts can have AI-enabled sections within their nodes;
   * this top-level config controls the part-level orchestration.
   */
  ai?: AiGenerationConfig;

  /** Institution this part belongs to */
  institutionId: string;

  /**
   * Real, per direct guidance: which real performing lab this part
   * belongs to — same Global/scoped convention as everywhere else in
   * this app (ContainerType/RoutingRule/PrinterProfile). Undefined =
   * Global, available to every performing lab; set = only offered when
   * assembling a template for that lab's own cases. Deliberately a new,
   * dedicated field rather than repurposing institutionId above — that
   * field is always an empty string in every real call site today
   * (mockReportPartService.ts), confirmed directly, and its own
   * original intent is undocumented; safer to leave it alone than
   * guess at overloading it.
   */
  performingLabFacilityId?: string;

  /** Who created / last edited this part */
  createdBy: string;
  updatedBy?: string;

  createdAt: string;
  updatedAt: string;

  /** Version tag for audit */
  version: string;

  /**
   * If this part is derived from another (via duplicate/copy),
   * track the origin for lineage.
   */
  originPartId?: string;
}

// ── Updated ReportTemplate ─────────────────────────────────────
// Replaces the old nodes[] model entirely.
// The template is now purely an assembly manifest — it holds no
// node content directly.

export interface ReportTemplate {
  id: string;
  name: string;
  specialty: string;
  subspecialty?: string;
  standard?: 'CAP' | 'RCPath' | 'custom';
  status: 'draft' | 'published' | 'archived';

  /**
   * Ordered assembly of parts.
   * The rendering engine processes slots in ROLE_DISPLAY_ORDER,
   * then by slot.order within the same role.
   */
  assembly: AssemblySlot[];

  /**
   * Legacy canvas nodes — used by the node-based TemplateBuilderPage editor.
   * Optional when using assembly mode (TemplateAssemblyPage).
   * Both fields may be populated simultaneously during the transition period.
   */
  nodes?: TemplateNode[];

  /** Whether AI narrative generation is enabled */
  orchestrationEnabled: boolean;

  /**
   * Real feature, per direct request: "most everything gets rendered
   * in Arial 10pt... perhaps we define those [header/body/footer] per
   * template which then get passed down to the individual
   * components. Individual components can override them."
   *
   * Step 2 complete: header/footer now render through the real
   * pipeline (see ReportPreviewRenderer.tsx's case 'header'/'footer'
   * and resolveTemplateSections in contextBuilder.ts), so all three
   * categories are meaningful here now.
   *
   * Applied at each section's own container (see
   * ReportPreviewRenderer.tsx's rp-inst-header/rp-footer) and left to
   * cascade via ordinary CSS inheritance — every node's label and
   * value text picks it up automatically unless that specific node
   * sets its own labelConfig, which wins at that node the same way
   * any inline style overrides an inherited one. No merge logic
   * needed; this is the same mechanism the browser already uses for
   * font-family everywhere else.
   */
  documentStyle?: {
    header?: LabelConfig;
    body?: LabelConfig;
    footer?: LabelConfig;
  };

  institutionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: string;
}

// ── Part library filter ────────────────────────────────────────

export interface PartLibraryFilter {
  partType?: ReportPartType;
  specialty?: string;
  status?: ReportPartStatus;
  search?: string;
}

// ── Assembly validation ────────────────────────────────────────

export interface AssemblyValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateAssembly(template: ReportTemplate): AssemblyValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const enabled = template.assembly.filter(s => s.enabled);

  const hasBody    = enabled.some(s => s.role === 'body');
  const hasP1Hdr   = enabled.some(s => s.role === 'header-p1');
  const hasP1Ftr   = enabled.some(s => s.role === 'footer-p1');
  const hasP2Hdr   = enabled.some(s => s.role === 'header-p2plus');
  const hasP2Ftr   = enabled.some(s => s.role === 'footer-p2plus');

  if (!hasBody)  errors.push('Template has no body part — report will have no content.');
  if (!hasP1Hdr) warnings.push('No Page 1 header defined.');
  if (!hasP1Ftr) warnings.push('No Page 1 footer defined.');
  if (hasP2Hdr && !hasP2Ftr) warnings.push('Pages 2+ header set but no Pages 2+ footer.');
  if (hasP2Ftr && !hasP2Hdr) warnings.push('Pages 2+ footer set but no Pages 2+ header.');
  if (!hasP2Hdr && !hasP2Ftr && hasBody)
    warnings.push('No Pages 2+ header/footer — multi-page reports will have bare continuation pages.');

  return { valid: errors.length === 0, warnings, errors };
}
