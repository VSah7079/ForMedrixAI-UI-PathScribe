// src/components/TemplateBuilder/TemplatePreviewPanel.tsx
// Word-style paginated preview. Auto-paginates from content height.
// Page size is sticky across sessions via localStorage.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ReportTemplate as OldTemplate, TemplateNode } from '../../types/template';
import type { StructuredContext } from '../../orchestrator/contextBuilder';
import { evalCondition } from '../../pages/ReportPreview/ReportPreviewRenderer';

// ── Page sizes ─────────────────────────────────────────────────
const MM = 96 / 25.4;
const mm = (v: number) => Math.round(v * MM);

// Paper size names (A4, US Letter, ...) are standardised international
// nomenclature and stay literal in every locale; only the descriptive
// "where it's used" region text is translated, via this id-keyed map.
export interface PageSize { id: string; label: string; widthMm: number; heightMm: number; }
const PAGE_SIZES: PageSize[] = [
  { id: 'a4',     label: 'A4',        widthMm: 210, heightMm: 297 },
  { id: 'letter', label: 'US Letter', widthMm: 216, heightMm: 279 },
  { id: 'legal',  label: 'US Legal',  widthMm: 216, heightMm: 356 },
  { id: 'a3',     label: 'A3',        widthMm: 297, heightMm: 420 },
  { id: 'b5',     label: 'B5',        widthMm: 176, heightMm: 250 },
];
const PAGE_SIZE_REGION_KEY: Record<string, string> = {
  a4: 'templatePreviewPanel.pageSize.region.a4',
  letter: 'templatePreviewPanel.pageSize.region.letter',
  legal: 'templatePreviewPanel.pageSize.region.legal',
  a3: 'templatePreviewPanel.pageSize.region.a3',
  b5: 'templatePreviewPanel.pageSize.region.b5',
};

export interface Margins { top: number; right: number; bottom: number; left: number; }
const DEFAULT_MARGINS: Margins = { top: 25, right: 20, bottom: 25, left: 20 };
const MARGIN_SIDE_LABEL_KEY: Record<keyof Margins, string> = {
  top: 'templatePreviewPanel.margins.top',
  right: 'templatePreviewPanel.margins.right',
  bottom: 'templatePreviewPanel.margins.bottom',
  left: 'templatePreviewPanel.margins.left',
};

// ── Mock context ───────────────────────────────────────────────
// TODO: update field names when StructuredContext type stabilises.
// Typed as any to avoid cascading errors when the context shape evolves.
const MOCK_CTX: any = {
  builtAt: new Date().toISOString(), caseId: 'PREVIEW-001', reportingMode: 'pathscribe',
  patient: { id: 'PT-001', name: 'Eleanor Whitmore', firstName: 'Eleanor', lastName: 'Whitmore',
    dob: '1962-04-15', age: 63, sex: 'Female', mrn: 'MRN-8842917' },
  specimens: [
    { id: 'SP-001', index: 0, label: 'A', type: 'Excision biopsy',
      site: 'Left breast, upper outer quadrant', laterality: 'Left', fixative: 'Formalin',
      collectedAt: '2026-04-28T09:15:00Z', receivedAt: '2026-04-28T14:30:00Z',
      grossDescription: 'Received in formalin, labelled "left breast lumpectomy". A fibrofatty excision specimen measuring 42 × 38 × 28 mm with long suture superior and short suture lateral. On sectioning, a firm pale grey tumour measuring 18 × 15 × 12 mm, located 8 mm from the superior margin.',
      microscopicDescription: 'Sections show an invasive carcinoma of no special type (NST), Nottingham grade 2. ER positive (Allred 8/8), PR positive (Allred 6/8), HER2 negative (1+). Ki-67 approximately 18%. Margins clear; closest is superior at 4 mm.' },
    { id: 'SP-002', index: 1, label: 'B', type: 'Sentinel lymph node biopsy',
      site: 'Left axilla', laterality: 'Left', fixative: 'Formalin',
      collectedAt: '2026-04-28T09:15:00Z', receivedAt: '2026-04-28T14:30:00Z',
      grossDescription: 'A lymph node measuring 18 × 12 × 8 mm. Entirely submitted in 2 blocks.',
      microscopicDescription: 'No evidence of metastatic carcinoma. No isolated tumour cells identified.' },
  ],
  order: { accessionNumber: 'S26-04281', fullAccession: 'S26-04281', priority: 'Routine',
    requestingProvider: 'Mr. James Caldwell', clientName: "St. Catherine's University Hospital",
    clinicalIndication: 'Left breast mass. Screen-detected. Core biopsy: invasive carcinoma NST.',
    receivedDate: '2026-04-28', assignedTo: 'Dr. Sarah Meredith, FRCPath' },
  diagnostic: {
    primaryDiagnosis: 'Left breast: Invasive carcinoma of no special type (NST), Nottingham grade 2.',
    secondaryDiagnoses: ['Left axilla, sentinel lymph node: No evidence of metastatic carcinoma.'],
    grossDescription: 'See specimen descriptions.', microscopicDescription: 'See specimen descriptions.',
    ancillaryStudies: 'IHC: ER positive (Allred 8/8), PR positive (Allred 6/8), HER2 negative (1+), Ki-67 18%.',
    synoptic: null },
  synopticReports: [{
    instanceId: 'SR-001', specimenId: 'SP-001', templateId: 'breast_invasive',
    templateName: 'CAP Breast Invasive Carcinoma', status: 'finalized',
    answers: { tumorType: 'Invasive carcinoma NST', grade: 'Grade 2 (Nottingham)',
      size: '18 mm', margins: 'Clear (superior 4 mm)', lymphovascularInvasion: 'Not identified',
      er: 'Positive (Allred 8/8)', pr: 'Positive (Allred 6/8)', her2: 'Negative (1+)', ki67: '18%',
      ihcPerformed: 'Yes', nodeStatus: 'pN0 (0/1)', pathologicalStage: 'pT1c pN0(sn) cM0 — Stage IIA' },
    verifiedAnswers: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  primarySynoptic: null,
  institution: { hospitalId: 'HOSP-001', enterpriseId: 'ENT-001', isReferenceLab: false },
  template: { id: 'preview', name: 'Preview', specialty: 'General', orchestrationEnabled: true },
} as unknown as StructuredContext;
MOCK_CTX.primarySynoptic = (MOCK_CTX as any).synopticReports[0];

// ── Helpers ────────────────────────────────────────────────────
function resolveExpr(tpl: string, ctx: StructuredContext): string {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    let v: any = ctx; for (const p of path.trim().split('.')) v = v?.[p];
    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}
/** Real fix, found by this app's own inline-CSS/business-logic sweep:
 *  this file used to keep its own local copy of the showWhen condition
 *  evaluator, missing the '>=' and '<=' operators that the real report
 *  renderer (ReportPreviewRenderer.tsx's evalClause/evalCondition,
 *  exported for exactly this reuse) already supports — a template
 *  author testing a >=/<= condition here would see it silently
 *  evaluate as always-true, disagreeing with the real, signed-out
 *  report. Now calls the one real implementation instead of a second,
 *  drifted copy. */
const evalCond = evalCondition;
function dig(ctx: StructuredContext, key: string): any { let v: any = ctx; for (const p of key.split('.')) v = v?.[p]; return v; }

/** 'lymphovascularInvasion' → 'Lymphovascular Invasion' */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

// Renders the primary synoptic report's resolved answers as a
// two-column key/value table. This node type isn't part of the
// formal TemplateNode union (it's added to std_body_synoptic via
// an `as unknown as TemplateNode` cast) — previously there was no
// render case for it at all, so the Synoptic Summary part was
// silently blank in every preview despite being included in every
// seeded template's assembly. Pulled out to its own function (called
// before the main switch, not as a case inside it) so the switch
// keeps real discriminated-union narrowing for every formal node type.
function renderSynopticBlock(ctx: StructuredContext, t: TFunction) {
  const primary = (ctx as any).primarySynoptic ?? (ctx as any).synopticReports?.[0] ?? null;
  const answers: Record<string, string> = primary?.answers ?? {};
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return <div className="ps-tpp-no-content">{t('templatePreviewPanel.emptyState.noSynopticData')}</div>;
  }
  return (
    <div className="ps-tpp-field-table">
      {entries.map(([key, value]) => (
        <div key={key} className="ps-tpp-field-row">
          <div className="ps-tpp-field-cell">
            <span className="ps-tpp-field-label">{humanizeKey(key)}</span>
            <span className="ps-tpp-field-value">{String(value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function resolveField(node: TemplateNode, ctx: StructuredContext): string {
  switch (node.type) {
    case 'expression-value': return resolveExpr(node.template, ctx) || (node.fallback ?? '—');
    case 'text-field': { const v = dig(ctx, node.bindingKey); return typeof v === 'string' ? v : (node.placeholder ?? '—'); }
    case 'dropdown': { const v = dig(ctx, node.bindingKey); return node.options.find(o => o.value === v)?.label ?? (typeof v === 'string' ? v : '—'); }
    case 'number': { const v = dig(ctx, node.bindingKey); return v != null ? `${v} ${node.unit ?? ''}`.trim() : '—'; }
    case 'date': { const v = dig(ctx, node.bindingKey); return typeof v === 'string' ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
    default: return '—';
  }
}
const TABLE_TYPES = new Set(['expression-value','text-field','dropdown','number','date','computed']);
const isField = (n: TemplateNode) => TABLE_TYPES.has(n.type);
type Group = { kind: 'table'; nodes: TemplateNode[] } | { kind: 'prose'; node: TemplateNode };
function splitChildren(ch: TemplateNode[]): Group[] {
  const g: Group[] = []; let r: TemplateNode[] = [];
  const fl = () => { if (r.length) { g.push({ kind: 'table', nodes: [...r] }); r = []; } };
  for (const c of ch) { if (isField(c)) r.push(c); else { fl(); g.push({ kind: 'prose', node: c }); } }
  fl(); return g;
}

// ── Field table ────────────────────────────────────────────────
const FieldTable: React.FC<{ nodes: TemplateNode[]; ctx: StructuredContext }> = ({ nodes, ctx }) => {
  const vis = nodes.filter(n => {
    if (n.showWhen && !evalCond(n.showWhen, ctx)) return false;
    if (n.hideIfEmpty && resolveField(n, ctx) === '—') return false;
    return true;
  });
  if (!vis.length) return null;
  const rows: TemplateNode[][] = []; let cur: TemplateNode[] = [], used = 0;
  for (const n of vis) {
    const s = n.colSpan ?? 12;
    if (used + s > 12 && cur.length) { rows.push(cur); cur = []; used = 0; }
    cur.push(n); used += s; if (used >= 12) { rows.push(cur); cur = []; used = 0; }
  }
  if (cur.length) rows.push(cur);
  return (
    <div className="ps-tpp-field-table">
      {rows.map((row, ri) => (
        <div key={ri}
          // Batch 367 (PS-74): per-row columns from each node's colSpan, as a custom property.
          style={{ '--tpp-row-cols': row.map(n => `${n.colSpan ?? 12}fr`).join(' ') } as React.CSSProperties}
          className={`ps-tpp-field-row${ri % 2 ? ' ps-tpp-field-row--alt' : ''}`}
        >
          {row.map(n => (
            <div key={n.id} className="ps-tpp-field-cell">
              <span className="ps-tpp-field-label">
                {n.label}
              </span>
              <span className="ps-tpp-field-value">
                {resolveField(n, ctx)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── Content node ───────────────────────────────────────────────
const ContentNode: React.FC<{ node: TemplateNode; ctx: StructuredContext; pageNum?: number; totalPages?: number }> =
  ({ node, ctx, pageNum = 1, totalPages = 1 }) => {
  const { t } = useTranslation();
  if (node.showWhen && !evalCond(node.showWhen, ctx)) return null;
  if (isField(node)) return <FieldTable nodes={[node]} ctx={ctx} />;
  // 'synoptic-block' is deliberately outside the formal TemplateNode
  // union (see mockReportPartService.ts's `as unknown as TemplateNode`
  // cast) — handled here, before the switch, so the switch below keeps
  // its real discriminated-union narrowing for every formal node type.
  if ((node.type as string) === 'synoptic-block') {
    return renderSynopticBlock(ctx, t);
  }
  switch (node.type) {
    case 'static-label': {
      const variant = node.variant ?? 'body';
      return <div className={[
        'ps-tpp-static-label',
        `ps-tpp-static-label--${variant}`,
        node.bold ? 'ps-tpp-static-label--bold' : '',
        node.italic ? 'ps-tpp-static-label--italic' : '',
      ].filter(Boolean).join(' ')}>{node.text}</div>;
    }
    case 'paragraph': {
      const val = dig(ctx, node.bindingKey);
      const text = typeof val === 'string' ? val : '';
      if (!text && node.hideIfEmpty) return null;
      return (
        <div className="ps-tpp-paragraph">
          <div className="ps-tpp-paragraph-label">{node.label}</div>
          <div className="ps-tpp-paragraph-text">
            {text || <span className="ps-tpp-no-content">{t('templatePreviewPanel.emptyState.noContent')}</span>}
          </div>
        </div>
      );
    }
    case 'rich-text-block':
      return <div
        // Per-node font size and alignment, as custom properties (Batch 367).
        style={{ '--tpp-font-size': `${node.fontSize ?? 12}px`, '--tpp-align': node.textAlign ?? 'left' } as React.CSSProperties}
        className="ps-tpp-richtext"
      >
        {node.content || <span className="ps-tpp-no-content">{t('templatePreviewPanel.emptyState.noContent')}</span>}
      </div>;
    case 'section': {
      const heading = node.printHeading || node.label;
      return (
        <div className="ps-tpp-section">
          {heading && <div className="ps-tpp-section-heading">{heading}</div>}
          <GroupedChildren children={node.children} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />
        </div>
      );
    }
    case 'repeat-group': {
      const items: any[] = (ctx as any)[node.iterateOver] ?? [];
      if (!items.length) return <div className="ps-tpp-no-items">{t('templatePreviewPanel.emptyState.noItems')}</div>;
      return <div>{items.map((item, i) => {
        const ic = { ...ctx, [node.itemAlias ?? 'item']: item, specimen: item } as StructuredContext;
        return <div key={i} className="ps-tpp-repeat-item"><GroupedChildren children={node.children} ctx={ic} pageNum={pageNum} totalPages={totalPages} /></div>;
      })}</div>;
    }
    case 'if-block': {
      const branch = evalCond(node.condition, ctx) ? node.children : (node.elseChildren ?? []);
      return branch.length ? <GroupedChildren children={branch} ctx={ctx} pageNum={pageNum} totalPages={totalPages} /> : null;
    }
    case 'switch-block': {
      const matched = node.cases.find(c => evalCond(c.when, ctx));
      const branch = matched?.children ?? node.defaultChildren ?? [];
      return <GroupedChildren children={branch} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />;
    }
    case 'column-layout':
      // CSS column-count produces true newsprint flow: content fills column 1
      // to the bottom, then continues at the top of column 2 — no manual
      // assignment of children to columns required.
      // break-inside:avoid on each child wrapper prevents a node from being
      // split mid-content across a column break.
      return (
        <div
          // Per-node column count and gap, as custom properties (Batch 367).
          style={{ '--tpp-col-count': node.numColumns, '--tpp-col-gap': `${node.columnGap ?? 16}px` } as React.CSSProperties}
          className="ps-tpp-col-layout"
        >
          {node.children.map(child => (
            <div key={child.id} className="ps-tpp-col-layout-child">
              <ContentNode node={child} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />
            </div>
          ))}
        </div>
      );
    case 'image-embed':
      return (
        <div
          // Per-node alignment, as a custom property (Batch 367).
          style={{ '--tpp-align': node.alignment === 'center' ? 'center' : node.alignment === 'right' ? 'right' : 'left' } as React.CSSProperties}
          className="ps-tpp-image-wrap"
        >
          {node.src ? <img src={node.src} alt={node.alt ?? ''} width={node.width ?? 80} height={node.height ?? 80} className="ps-tpp-image" />
            : <div
                // Per-node placeholder size, as custom properties (Batch 367).
                style={{ '--tpp-img-w': `${node.width ?? 80}px`, '--tpp-img-h': `${node.height ?? 80}px` } as React.CSSProperties}
                className="ps-tpp-image-placeholder"
              >{t('templatePreviewPanel.emptyState.imagePlaceholder')}</div>}
          {node.caption && <div className="ps-tpp-image-caption">{node.caption}</div>}
        </div>
      );
    case 'header':
      // "PathScribe Laboratory" / "Department of Anatomic Pathology" mirror
      // the same default institution-name/department fallback values seeded
      // in mockReportPartService.ts (e('Institution', ..., 'PathScribe
      // Laboratory')) — mock/demo institution data for this preview, not
      // UI chrome, so left untranslated like the rest of MOCK_CTX.
      return (
        <div className="ps-tpp-print-header">
          <div>
            {node.showLogo && <div className="ps-tpp-print-header-logo">PathScribe Laboratory</div>}
            <div className="ps-tpp-print-header-sub">Department of Anatomic Pathology</div>
          </div>
          <div className="ps-tpp-print-header-right" data-phi="accession">{node.showAccession && <div className="ps-tpp-print-header-accession">{MOCK_CTX.order.fullAccession}</div>}
            {node.showPatientName && <div className="ps-tpp-print-header-patient" data-phi="name">{MOCK_CTX.patient.name}</div>}
            <div className="ps-tpp-print-header-sub">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>
      );
    case 'footer':
      // Patient name/DOB/accession are mock demo data (MOCK_CTX), left
      // untranslated like the rest of the mock context.
      return (
        <div className="ps-tpp-print-footer">
          <span>{MOCK_CTX.patient.name} · DOB {MOCK_CTX.patient.dob} · {MOCK_CTX.order.fullAccession}</span>
          {node.showPageNumbers && <span>{t('templatePreviewPanel.pageNumber', { pageNum, totalPages })}</span>}
        </div>
      );
    case 'template-ref':
      return <div className="ps-tpp-template-ref">⊞ {node.refTemplateName || node.refTemplateId}</div>;
    default: return null;
  }
};

const GroupedChildren: React.FC<{ children: TemplateNode[]; ctx: StructuredContext; pageNum?: number; totalPages?: number }> =
  ({ children, ctx, pageNum, totalPages }) => (
  <>
    {splitChildren(children).map((g, i) =>
      g.kind === 'table'
        ? <FieldTable key={i} nodes={g.nodes} ctx={ctx} />
        : <ContentNode key={g.node.id} node={g.node} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />
    )}
  </>
);

// ── Ruler ──────────────────────────────────────────────────────
const Ruler: React.FC<{ widthPx: number; mL: number; mR: number }> = ({ widthPx, mL, mR }) => {
  const ticks: React.ReactNode[] = [];
  const bodyMm = Math.round((widthPx - mL - mR) / MM);
  for (let i = 0; i <= bodyMm; i += 10) {
    ticks.push(
      // Computed tick offset, as a custom property (Batch 367).
      <div key={i} style={{ '--tpp-tick-x': `${mL + i * MM}px` } as React.CSSProperties} className="ps-tpp-ruler-tick">
        <div className={`ps-tpp-ruler-tick-bar${i % 50 === 0 ? ' ps-tpp-ruler-tick-bar--major' : ''}`} />
        {i % 50 === 0 && i > 0 && <span className="ps-tpp-ruler-tick-label">{i}</span>}
      </div>
    );
  }
  return (
    // Computed page width and margins, as custom properties (Batch 367).
    <div style={{ '--tpp-w': `${widthPx}px`, '--tpp-ml': `${mL}px`, '--tpp-mr': `${mR}px` } as React.CSSProperties} className="ps-tpp-ruler">
      {ticks}
      <div className="ps-tpp-ruler-margin ps-tpp-ruler-margin--left" />
      <div className="ps-tpp-ruler-margin ps-tpp-ruler-margin--right" />
    </div>
  );
};

// ── Auto-paginator ─────────────────────────────────────────────
// Stable layoutKey prevents infinite re-renders when bodyNodes
// is computed inline (new array reference every render).
// setTimeout(150) gives React time to paint the hidden div
// before we read getBoundingClientRect heights.

function usePagination(
  bodyNodes: TemplateNode[],
  pageH: number, headerH: number, footerH: number, mT: number, mB: number,
): { pages: TemplateNode[][][] } {
  // Initialise eagerly so content renders immediately on first open.
  // The background measurement pass (400 ms) then refines pagination.
  const [pages, setPages] = useState<TemplateNode[][][]>(() =>
    bodyNodes.length ? [bodyNodes.map(n => [n])] : [[[]]]
  );

  const layoutKey = [bodyNodes.map(n => n.id).join(','), pageH, headerH, footerH, mT, mB].join('|');
  const prevKey = React.useRef('');
  const timer = React.useRef(0);
  const nodesRef = React.useRef(bodyNodes);
  nodesRef.current = bodyNodes;

  useEffect(() => {
    if (layoutKey === prevKey.current) return;
    prevKey.current = layoutKey;
    clearTimeout(timer.current);

    // 400 ms: gives React time to paint + browser to complete layout of hidden div
    timer.current = window.setTimeout(() => {
      const root = document.getElementById('preview-measure-root');
      const nodes = nodesRef.current;

      if (!root || !nodes.length) { setPages([[[]]]); return; }

      const children = Array.from(root.children) as HTMLElement[];
      const usable = pageH - headerH - footerH - mT - mB;

      // Guard: if the hidden div hasn't laid out yet, skip this measurement pass
      const totalH = children.reduce((s, el) => s + el.getBoundingClientRect().height, 0);
      if (totalH === 0) return;

      if (usable < 60 || !children.length) {
        setPages(nodes.map(n => [[n]])); return;
      }

      const result: TemplateNode[][][] = [];
      let cur: TemplateNode[][] = [], h = 0;
      children.forEach((el, i) => {
        const elH = el.getBoundingClientRect().height + 16;
        if (h + elH > usable && cur.length) { result.push(cur); cur = []; h = 0; }
        if (nodes[i]) { cur.push([nodes[i]]); h += elH; }
      });
      if (cur.length) result.push(cur);
      if (!result.length) result.push([[]]);
      setPages(result);
    }, 400);

    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  return { pages };
}

// ── Page card ──────────────────────────────────────────────────
const PageCard: React.FC<{
  sections: TemplateNode[][]; headers: TemplateNode[]; footers: TemplateNode[];
  pageNum: number; totalPages: number;
  widthPx: number; heightPx: number; margins: Margins; ctx: StructuredContext;
}> = ({ sections, headers, footers, pageNum, totalPages, widthPx, heightPx, margins, ctx }) => {
  const { t } = useTranslation();
  const [mL, mR, mT, mB] = [mm(margins.left), mm(margins.right), mm(margins.top), mm(margins.bottom)];
  return (
    // Computed page size and margins (from mm + scale), as custom properties (Batch 367).
    <div style={{ '--tpp-w': `${widthPx}px`, '--tpp-h': `${heightPx}px`, '--tpp-ml': `${mL}px`, '--tpp-mr': `${mR}px`, '--tpp-mt': `${mT}px`, '--tpp-mb': `${mB}px` } as React.CSSProperties} className="ps-tpp-page-card">
      {totalPages > 1 && (
        <div className="ps-tpp-page-num">
          {t('templatePreviewPanel.pageNumber', { pageNum, totalPages })}
        </div>
      )}
      <div className="ps-tpp-page-header">
        {headers.filter(h => pageNum === 1
          ? (h as import('../../types/template').HeaderNode).scope !== 'pages2plus'
          : (h as import('../../types/template').HeaderNode).scope !== 'page1')
          .map(h => <ContentNode key={h.id} node={h} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />)}
      </div>
      <div className="ps-tpp-page-body">
        {sections.flat().map(n => <ContentNode key={n.id} node={n} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />)}
      </div>
      <div className="ps-tpp-page-footer">
        {footers.filter(f => pageNum === 1
          ? (f as import('../../types/template').FooterNode).scope !== 'pages2plus'
          : (f as import('../../types/template').FooterNode).scope !== 'page1')
          .map(f => <ContentNode key={f.id} node={f} ctx={ctx} pageNum={pageNum} totalPages={totalPages} />)}
      </div>
    </div>
  );
};

// ── Main panel ─────────────────────────────────────────────────
interface Props { template: OldTemplate; onClose: () => void; }

export const TemplatePreviewPanel: React.FC<Props> = ({ template, onClose }) => {
  const { t } = useTranslation();
  // ── Sticky page size across sessions ──────────────────────────
  const [pageSizeId, setPageSizeId] = useState(() =>
    localStorage.getItem('ps_preview_page_size') ?? 'a4'
  );
  const handlePageSizeChange = (id: string) => {
    setPageSizeId(id);
    localStorage.setItem('ps_preview_page_size', id);
  };

  const [margins, setMargins] = useState<Margins>(() => {
    try {
      const stored = localStorage.getItem('ps_preview_margins');
      if (stored) return JSON.parse(stored) as Margins;
    } catch { /* ignore corrupt stored value */ }
    return DEFAULT_MARGINS;
  });
  const [showCtx, setShowCtx] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ctx = MOCK_CTX;

  const ps = PAGE_SIZES.find(p => p.id === pageSizeId) ?? PAGE_SIZES[0];
  const maxWidth = 860;
  const scale = Math.min(1, maxWidth / mm(ps.widthMm));
  const pw = Math.round(mm(ps.widthMm) * scale);
  const ph = Math.round(mm(ps.heightMm) * scale);
  const mL = mm(margins.left) * scale, mR = mm(margins.right) * scale;
  const mT = mm(margins.top) * scale,  mB = mm(margins.bottom) * scale;
  const scaledM: Margins = { top: margins.top * scale, right: margins.right * scale, bottom: margins.bottom * scale, left: margins.left * scale };
  const headerH = 70 * scale, footerH = 36 * scale;

  const headers = template.nodes.filter(n => n.type === 'header');
  const footers = template.nodes.filter(n => n.type === 'footer');
  const bodyNodes = template.nodes.filter(n => n.type !== 'header' && n.type !== 'footer' && n.type !== 'page-break');

  const { pages } = usePagination(bodyNodes, ph, headerH, footerH, mT, mB);

  return (
    <div className="ps-tpp-overlay">

      {/* Toolbar */}
      <div className="ps-tpp-toolbar">
        <select value={pageSizeId} onChange={e => handlePageSizeChange(e.target.value)}
          className="ps-tpp-toolbar-select">
          {PAGE_SIZES.map(p => <option key={p.id} value={p.id}>{p.label} — {t(PAGE_SIZE_REGION_KEY[p.id])}</option>)}
        </select>
        <span className="ps-tpp-toolbar-dim">{ps.widthMm} × {ps.heightMm} mm</span>
        <div className="ps-tpp-toolbar-spacer" />
        <span className="ps-tpp-toolbar-dim">{t('templatePreviewPanel.toolbar.pageCount', { count: pages.length })}</span>
        <button onClick={() => setSettingsOpen(o => !o)} className="ps-tpp-toolbar-btn">⚙ {t('templatePreviewPanel.toolbar.margins')}</button>
        <button onClick={() => setShowCtx(s => !s)} className="ps-tpp-toolbar-btn">{showCtx ? t('templatePreviewPanel.toolbar.hide') : t('templatePreviewPanel.toolbar.contextJson')}</button>
        <button onClick={onClose} className="ps-tpp-toolbar-btn ps-tpp-toolbar-btn--close">{t('templatePreviewPanel.toolbar.close')}</button>
      </div>

      {/* Margin settings */}
      {settingsOpen && (
        <div className="ps-tpp-margins-panel">
          <span className="ps-tpp-margins-label">{t('templatePreviewPanel.margins.heading')}</span>
          {(['top','right','bottom','left'] as (keyof Margins)[]).map(side => (
            <label key={side} className="ps-tpp-margin-field">
              {t(MARGIN_SIDE_LABEL_KEY[side])}
              <input type="number" value={margins[side]} min={5} max={50}
                onChange={e => setMargins(m => {
                    const next = { ...m, [side]: parseInt(e.target.value) || 20 };
                    localStorage.setItem('ps_preview_margins', JSON.stringify(next));
                    return next;
                  })}
                className="ps-tpp-margin-input" />
            </label>
          ))}
        </div>
      )}

      {/* Context JSON */}
      {showCtx && (
        <div className="ps-tpp-ctx-panel">
          <div className="ps-tpp-ctx-title">{t('templatePreviewPanel.context.title', { descriptor: 'Eleanor Whitmore · Breast NST' })}</div>
          <pre className="ps-tpp-ctx-json">{JSON.stringify(ctx, null, 2)}</pre>
        </div>
      )}

      {/* Document area */}
      <div className="ps-tpp-doc-area">

        {/* Ruler */}
        <div style={{ '--tpp-w': `${pw}px` } as React.CSSProperties} className="ps-tpp-ruler-wrap">
          <Ruler widthPx={pw} mL={mL} mR={mR} />
        </div>

        {/* Hidden measurement div — off-screen, at page body width */}
        <div id="preview-measure-root"
          style={{ '--tpp-w': `${pw - mL - mR}px` } as React.CSSProperties}
          className="ps-tpp-measure-root">
          {bodyNodes.map(n => (
            <div key={n.id}><ContentNode node={n} ctx={ctx} /></div>
          ))}
        </div>

        {/* Pages */}
        {pages.map((pageSections, pi) => (
          <div key={pi} className="ps-tpp-page-wrap">
            <PageCard
              sections={pageSections} headers={headers} footers={footers}
              pageNum={pi + 1} totalPages={pages.length}
              widthPx={pw} heightPx={ph} margins={scaledM} ctx={ctx}
            />
          </div>
        ))}

        <div className="ps-tpp-doc-bottom-spacer" />
      </div>
    </div>
  );
};

export default TemplatePreviewPanel;
