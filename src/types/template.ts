// src/types/template.ts
// ─────────────────────────────────────────────────────────────
// Report Template type system for PathScribe Orchestration mode.
// Defines the TemplateNode union and all supporting types.
// ─────────────────────────────────────────────────────────────

// ── Label display configuration ───────────────────────────────
// Controls how a field label renders in the printed report.
// The canvas card label is always shown regardless of this setting.

export interface LabelConfig {
  /** Where the label appears relative to the value.
   *  above    → label on its own line above the value (default for paragraphs)
   *  adjacent → label to the left of the value on the same line (default for fields)
   *  none     → no label printed (value only)
   */
  position: 'above' | 'adjacent' | 'none';
  transform?: 'uppercase' | 'capitalize' | 'none';
  weight?: 'bold' | 'normal';
  decoration?: 'underline' | 'none';
  /** Font size in px — defaults to 11 (adjacent) or 12 (above) */
  fontSize?: number;
  /** Real feature, per direct request: a template's overall document
   *  style ("Arial 10pt") needs a typeface, not just size/weight —
   *  nothing in this type previously carried one at all. Same type
   *  serves double duty: as a template-wide cascading default
   *  (ReportTemplate.documentStyle) applied at the report root, and
   *  as a per-node override (BaseNode.labelConfig) that naturally
   *  wins via normal CSS inheritance since it's applied as an inline
   *  style further down the tree. `position` is meaningless in the
   *  template-default context (there's no single "label" to
   *  position) — callers building a documentStyle default should
   *  leave it at any value; it's simply never read there.
   */
  fontFamily?: string;
}

// ── Shared base ───────────────────────────────────────────────

export interface BaseNode {
  id: string;
  /** Display label shown in the canvas card and (optionally) in the printed report */
  label: string;
  editableBy?: RoleKey[];
  required?: boolean;
  hideIfEmpty?: boolean;
  fhirExport?: boolean;
  /** Real, per direct correction ("a text field on the report should
   *  be declared as the final diagnosis... we need to audit those
   *  changes") — marks this specific field as the one, real Final
   *  Diagnosis for this template. Never inferred at runtime from a
   *  field's name/label/position; a template author declares it
   *  explicitly, same real posture as fhirExport above. Real,
   *  deliberate: at most one field per Final-category template may
   *  set this (enforced at template save/publish time, per direct
   *  guidance — see validateFinalDiagnosisDesignation.ts); Preliminary
   *  templates are exempt, since "previously reported as" is only
   *  ever a Final-report concept. */
  isFinalDiagnosisField?: boolean;
  showWhen?: ConditionalExpression;
  pageBreakBefore?: boolean;
  /**
   * Column span in the 12-column grid layout (1–12).
   * Default: 12 (full width).
   */
  colSpan?: number;
  /**
   * How the label is rendered in the printed report.
   * Omit to use per-type defaults (fields → adjacent, paragraphs → above).
   */
  labelConfig?: LabelConfig;
}

export type RoleKey = 'grossing' | 'micro' | 'pathologist' | 'admin' | 'any';

// ── Conditional expression system ─────────────────────────────

export type ExpressionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'notEmpty' | 'isEmpty' | 'contains';
export type LogicalOperator = 'AND' | 'OR';

export interface ExpressionClause {
  /** Dot-notation path into structuredContext — e.g. "synoptic.grade" */
  field: string;
  operator: ExpressionOperator;
  value?: string | number | boolean;
}

export interface ConditionalExpression {
  logic: LogicalOperator;
  clauses: ExpressionClause[];
}

// ── Switch case branch ─────────────────────────────────────────

export interface SwitchCase {
  id: string;
  label: string;
  /** Condition that must be true to activate this branch */
  when: ConditionalExpression;
  children: TemplateNode[];
}

// ── Select option ──────────────────────────────────────────────

export interface SelectOption {
  label: string;
  value: string;
  /** Selecting this option triggers a show-when on other nodes */
  triggersShowWhen?: boolean;
}

// ── AI generation instruction ──────────────────────────────────
// Used by the Orchestrator Engine to generate narrative prose
// for Section nodes marked as AI-generated targets.

export interface AiGenerationConfig {
  /** Whether AI prose generation is enabled for this section */
  enabled: boolean;
  /** System-level instruction for this section's generation prompt */
  systemInstruction?: string;
  /** Additional context keys from structuredContext to inject into the prompt */
  contextKeys?: string[];
  /** Max tokens to generate for this section */
  maxTokens?: number;
  /** Temperature override (defaults to 0.3 for clinical accuracy) */
  temperature?: number;
}

// ── Page zone discriminant ─────────────────────────────────────

export type PageZoneScope = 'page1' | 'pages2plus' | 'all';

// ──────────────────────────────────────────────────────────────
// TemplateNode discriminated union — 18 node types
// ──────────────────────────────────────────────────────────────

// ── Content Blocks ────────────────────────────────────────────

export interface TextFieldNode extends BaseNode {
  type: 'text-field';
  /** Dot-notation binding into synopticAnswers or diagnosticMetadata */
  bindingKey: string;
  placeholder?: string;
  maxLength?: number;
  validationRegex?: string;
}

export interface ParagraphNode extends BaseNode {
  type: 'paragraph';
  /**
   * Dot-notation path into StructuredContext — e.g. "diagnostic.grossDescription".
   * Leave empty when using freeformContent instead.
   *
   * Think of a Paragraph as a "slot":
   *   bindingKey set  → slot is filled from case data at report generation time
   *   bindingKey empty → use freeformContent below for static authored prose
   */
  bindingKey: string;
  placeholder?: string;
  richText?: boolean;
  aiWritable?: boolean;
  /**
   * Static authored content stored directly in the template.
   * Used when bindingKey is empty — the text you type here appears in every report.
   * Example: standard disclaimers, boilerplate headings, fixed clinical statements.
   */
  freeformContent?: string;
}

/**
 * RichTextBlock — a freeform prose block authored directly in the template builder.
 * Unlike Paragraph (which binds to case data), this stores its content inside the template.
 * Use it for: standard disclaimers, section introductions, fixed clinical statements,
 * formatted headings, or any prose that is the same across every report.
 *
 * Content is formatted using a subset of Tiptap marks: bold, italic, underline,
 * superscript, lists. The content is stored as serialised HTML.
 */
export interface RichTextBlockNode extends BaseNode {
  type: 'rich-text-block';
  /** Serialised HTML content authored in the builder */
  content: string;
  /** Font size in px */
  fontSize?: number;
  /** Text alignment */
  textAlign?: 'left' | 'center' | 'right';
}

export interface DropdownNode extends BaseNode {
  type: 'dropdown';
  bindingKey: string;
  options: SelectOption[];
  /** Allow the user to type a free-text value not in the list */
  allowFreeText?: boolean;
  /** Allow selecting multiple values */
  multi?: boolean;
  placeholder?: string;
}

export interface NumberNode extends BaseNode {
  type: 'number';
  bindingKey: string;
  unit?: string;
  /** Allowed units if user can switch (e.g. mm / cm) */
  unitOptions?: string[];
  min?: number;
  max?: number;
  decimalPlaces?: number;
  placeholder?: string;
}

export interface DateNode extends BaseNode {
  type: 'date';
  bindingKey: string;
  /** 'date' | 'datetime' | 'year' */
  format?: 'date' | 'datetime' | 'year';
  defaultToToday?: boolean;
}

export interface ComputedNode extends BaseNode {
  type: 'computed';
  /** JavaScript-safe expression evaluated against structuredContext */
  expression: string;
  /** Output format: 'text' | 'number' | 'date' */
  outputType?: 'text' | 'number' | 'date';
  /** Unit appended to result */
  unit?: string;
}

export interface StaticLabelNode extends BaseNode {
  type: 'static-label';
  text: string;
  /** 'h1' | 'h2' | 'h3' | 'body' | 'caption' */
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption';
  bold?: boolean;
  italic?: boolean;
}

// ── Structure ──────────────────────────────────────────────────

export interface SectionNode extends BaseNode {
  type: 'section';
  children: TemplateNode[];
  /** Collapsible in editor */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** AI narrative generation config for this section */
  ai?: AiGenerationConfig;
  /** Printed section heading */
  printHeading?: string;
}

export interface RepeatGroupNode extends BaseNode {
  type: 'repeat-group';
  children: TemplateNode[];
  /** Which context array to iterate over — e.g. "specimens" */
  iterateOver: string;
  /** Alias for the current item in child node binding keys */
  itemAlias?: string;
  /** Min/max iterations */
  minItems?: number;
  maxItems?: number;
}

export interface TemplateRefNode extends BaseNode {
  type: 'template-ref';
  /** ID of the referenced template to embed inline */
  refTemplateId: string;
  /** Cached name for display */
  refTemplateName?: string;
  /** Pass context overrides into the embedded template */
  contextOverrides?: Record<string, string>;
}

export interface PageBreakNode extends BaseNode {
  type: 'page-break';
  /** 'always' | 'avoid' | 'auto' */
  breakBehavior?: 'always' | 'avoid' | 'auto';
}

// ── Conditional ────────────────────────────────────────────────

export interface IfBlockNode extends BaseNode {
  type: 'if-block';
  condition: ConditionalExpression;
  children: TemplateNode[];
  /** Optional else children rendered when condition is false */
  elseChildren?: TemplateNode[];
}

export interface SwitchBlockNode extends BaseNode {
  type: 'switch-block';
  /** Context field being switched on */
  switchOn: string;
  cases: SwitchCase[];
  /** Default children if no case matches */
  defaultChildren?: TemplateNode[];
}

export interface ExpressionValueNode extends BaseNode {
  type: 'expression-value';
  /** Expression referencing context fields — e.g. "{{patient.name}}, {{patient.dob}}" */
  template: string;
  /** Fallback if expression yields empty */
  fallback?: string;
}

// ── Layout ─────────────────────────────────────────────────────

export interface HeaderNode extends BaseNode {
  type: 'header';
  scope: PageZoneScope;
  children: TemplateNode[];
  height?: number; // pts
  /** Show institution logo */
  showLogo?: boolean;
  /** Show accession number */
  showAccession?: boolean;
  /** Show patient name */
  showPatientName?: boolean;
  /** Custom HTML template for the header */
  htmlTemplate?: string;
}

export interface FooterNode extends BaseNode {
  type: 'footer';
  scope: PageZoneScope;
  children: TemplateNode[];
  height?: number; // pts
  /** Show page numbers */
  showPageNumbers?: boolean;
  /** Page number format: "Page N of M" */
  pageNumberFormat?: string;
  /** Custom HTML template for the footer */
  htmlTemplate?: string;
}

export interface ImageEmbedNode extends BaseNode {
  type: 'image-embed';
  /** Static asset URL or binding key pointing to an image URL in context */
  src?: string;
  bindingKey?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** 'left' | 'center' | 'right' | 'full' */
  alignment?: 'left' | 'center' | 'right' | 'full';
  /** Caption below the image */
  caption?: string;
}

// ── Union ──────────────────────────────────────────────────────

// ── Column layout ──────────────────────────────────────────────
// Explicit multi-column container. Drop it onto the page, set
// numColumns to 2/3/4, then drop field nodes into it.
// Children flow left-to-right; each child's colSpan is relative
// to the column layout's own column count (not the page's 12).

export interface ColumnLayoutNode extends BaseNode {
  type: 'column-layout';
  /** Number of equal-width columns */
  numColumns: 2 | 3 | 4;
  children: TemplateNode[];
  /** Visual gap between columns in px */
  columnGap?: number;
}

export type TemplateNode =
  // Content
  | TextFieldNode
  | ParagraphNode
  | RichTextBlockNode
  | DropdownNode
  | NumberNode
  | DateNode
  | ComputedNode
  | StaticLabelNode
  // Structure
  | SectionNode
  | RepeatGroupNode
  | ColumnLayoutNode
  | TemplateRefNode
  | PageBreakNode
  // Conditional
  | IfBlockNode
  | SwitchBlockNode
  | ExpressionValueNode
  // Layout
  | HeaderNode
  | FooterNode
  | ImageEmbedNode;

export type TemplateNodeType = TemplateNode['type'];

// ── Container nodes (can have children dropped into them) ──────

export const CONTAINER_NODE_TYPES: TemplateNodeType[] = [
  'section',
  'repeat-group',
  'column-layout',
  'if-block',
  'switch-block',
  'header',
  'footer',
];

export function isContainerNode(node: TemplateNode): node is SectionNode | RepeatGroupNode | ColumnLayoutNode | IfBlockNode | SwitchBlockNode | HeaderNode | FooterNode {
  return CONTAINER_NODE_TYPES.includes(node.type);
}

// ── Full report template ───────────────────────────────────────

export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface ReportTemplate {
  id: string;
  name: string;
  /** e.g. 'breast', 'prostate', 'lung', 'melanoma' */
  specialty: string;
  /** Subspecialty / disease type */
  subspecialty?: string;
  /** CAP / RCPath / custom */
  standard?: 'CAP' | 'RCPath' | 'custom';
  status: TemplateStatus;
  /** Ordered root-level nodes — includes headers, footers, sections */
  nodes: TemplateNode[];
  /** Whether Orchestration (AI generation) is enabled for this template */
  orchestrationEnabled: boolean;
  /** Institution this template belongs to */
  institutionId: string;
  /** Creator user ID */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Version tag for audit */
  version: string;
}

// ── Palette metadata (for the canvas UI) ──────────────────────

export interface PaletteItem {
  type: TemplateNodeType;
  label: string;
  subtitle: string;
  icon: string;
  color: string;
  category: 'content' | 'structure' | 'conditional' | 'layout';
}

export const PALETTE_ITEMS: PaletteItem[] = [
  // Content
  { type: 'text-field',       label: 'Text field',        subtitle: 'Single-line · ½ width',       icon: 'T',  color: '#1D9E75', category: 'content' },
  { type: 'paragraph',        label: 'Data paragraph',     subtitle: 'Binds to case data · full',    icon: '¶',  color: '#534AB7', category: 'content' },
  { type: 'rich-text-block',  label: 'Rich text block',    subtitle: 'Freeform authored prose',      icon: '✍',  color: '#0891b2', category: 'content' },
  { type: 'dropdown',         label: 'Dropdown',         subtitle: 'Select one or many · ½',   icon: '▾',  color: '#185FA5', category: 'content' },
  { type: 'number',           label: 'Number + unit',    subtitle: 'e.g. 2.3 mm · ¼ width',   icon: '#',  color: '#BA7517', category: 'content' },
  { type: 'date',             label: 'Date',             subtitle: 'Date picker · ⅓ width',    icon: '📅', color: '#C0392B', category: 'content' },
  { type: 'computed',         label: 'Computed',         subtitle: 'Auto-calculated · ⅓',      icon: '∑',  color: '#7D3C98', category: 'content' },
  { type: 'static-label',     label: 'Static label',     subtitle: 'Heading or fixed text',    icon: 'A',  color: '#566573', category: 'content' },
  // Structure
  { type: 'section',          label: 'Section',          subtitle: 'Named collapsible group',  icon: '□',  color: '#1A5276', category: 'structure' },
  { type: 'column-layout',    label: 'Columns',          subtitle: '2, 3 or 4 column layout',  icon: '⫿',  color: '#0E6655', category: 'structure' },
  { type: 'repeat-group',     label: 'Repeat group',     subtitle: 'Iterates over specimens',  icon: '↺',  color: '#117A65', category: 'structure' },
  { type: 'template-ref',     label: 'Template ref',     subtitle: 'Embed another template',   icon: '⊞',  color: '#1F618D', category: 'structure' },
  { type: 'page-break',       label: 'Page break',       subtitle: 'Force new page',           icon: '—',  color: '#717D7E', category: 'structure' },
  // Conditional
  { type: 'if-block',         label: 'If / Show when',   subtitle: 'Conditional block',        icon: '?',  color: '#D4AC0D', category: 'conditional' },
  { type: 'switch-block',     label: 'Switch / Cases',   subtitle: 'Multi-branch logic',       icon: '⇄',  color: '#CA6F1E', category: 'conditional' },
  { type: 'expression-value', label: 'Expression',       subtitle: 'Dynamic text from data',   icon: '{}', color: '#922B21', category: 'conditional' },
  // Layout
  { type: 'header',           label: 'Header',           subtitle: 'Page 1 or 2–N header',     icon: '↑',  color: '#0E6655', category: 'layout' },
  { type: 'footer',           label: 'Footer',           subtitle: 'Page 1 or 2–N footer',     icon: '↓',  color: '#1A5276', category: 'layout' },
  { type: 'image-embed',      label: 'Image embed',      subtitle: 'Logo or figure',           icon: '🖼', color: '#6C3483', category: 'layout' },
];

// ── Smart default colSpans per type ───────────────────────────
// Based on the typical data length for each field type.
// Phone/date/number are short. Paragraphs are always full width.

const DEFAULT_COL_SPAN: Partial<Record<TemplateNodeType, number>> = {
  'text-field':       6,   // ½ — single-line text (name, phone, etc.)
  'paragraph':        12,
  'rich-text-block':  12,  // Full — large prose block
  'dropdown':         6,   // ½ — select menus are medium width
  'number':           3,   // ¼ — numbers are short (18 mm, 42, etc.)
  'date':             4,   // ⅓ — dates are medium-short
  'computed':         4,   // ⅓ — computed values similar to numbers
  'static-label':     12,  // Full — headings span the width
  'expression-value': 6,   // ½ — dynamic text, varies
  'section':          12,  // Full — sections always span width
  'column-layout':    12,  // Full — column containers span width
  'repeat-group':     12,  // Full — repeat groups span width
  'if-block':         12,  // Full — conditional blocks span width
  'switch-block':     12,  // Full — switch blocks span width
  'image-embed':      4,   // ⅓ — images are usually small
  'page-break':       12,  // Full — always
  'template-ref':     12,  // Full — embedded templates span width
};

// ── Node factory — creates default nodes ready for canvas ──────

export function createDefaultNode(type: TemplateNodeType): TemplateNode {
  const base: BaseNode = {
    id: crypto.randomUUID(),
    label: PALETTE_ITEMS.find(p => p.type === type)?.label ?? type,
    required: false,
    hideIfEmpty: false,
    fhirExport: false,
    colSpan: DEFAULT_COL_SPAN[type] ?? 12,
  };

  switch (type) {
    case 'text-field':
      return { ...base, type, bindingKey: '' };
    case 'paragraph':
      return { ...base, type, bindingKey: '', richText: true, aiWritable: true };
    case 'rich-text-block':
      return { ...base, type, content: '', fontSize: 13, textAlign: 'left' };
    case 'dropdown':
      return { ...base, type, bindingKey: '', options: [], multi: false };
    case 'number':
      return { ...base, type, bindingKey: '', unit: 'mm' };
    case 'date':
      return { ...base, type, bindingKey: '', format: 'date' };
    case 'computed':
      return { ...base, type, expression: '' };
    case 'static-label':
      return { ...base, type, text: 'Label', variant: 'body' };
    case 'section':
      return { ...base, type, children: [], collapsible: true, ai: { enabled: false } };
    case 'column-layout':
      return { ...base, type, numColumns: 2, children: [], columnGap: 16 };
    case 'repeat-group':
      return { ...base, type, children: [], iterateOver: 'specimens' };
    case 'template-ref':
      return { ...base, type, refTemplateId: '' };
    case 'page-break':
      return { ...base, type, breakBehavior: 'always' };
    case 'if-block':
      return { ...base, type, condition: { logic: 'AND', clauses: [] }, children: [] };
    case 'switch-block':
      return { ...base, type, switchOn: '', cases: [] };
    case 'expression-value':
      return { ...base, type, template: '' };
    case 'header':
      return { ...base, type, scope: 'all', children: [], showLogo: true, showAccession: true };
    case 'footer':
      return { ...base, type, scope: 'all', children: [], showPageNumbers: true };
    case 'image-embed':
      return { ...base, type, alt: '', alignment: 'left' };
  }
}
