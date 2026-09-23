// src/pages/ReportPreview/ReportPreviewRenderer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Renders orchSections as a formatted clinical report.
// Template-driven: section headings, typography, and layout come from the
// resolved ReportTemplate. When ReportLab is ready, swap this for a PDF iframe.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrchestratorSection } from '@/pages/SynopticReportPage/components/OrchestratorSectionEditor';
import type { Case } from '@/types/case/Case';
import type { BodyPartAssembly, StructuredContext } from '@/orchestrator/contextBuilder';
import type {
  TemplateNode, SectionNode, ConditionalExpression, ExpressionClause, LabelConfig,
} from '@/types/template';

// ─────────────────────────────────────────────────────────────────────────────
// Generic node-tree rendering — added alongside the existing AI-section
// rendering below, NOT a replacement for it.
//
// Split of responsibility (per the June 2026 architecture decision):
//   • AI-narrative SectionNodes (ai.enabled === true) still render purely
//     from `sections` (OrchestratorSection[]) exactly as before — one text
//     blob per section, owned by OrchestratorEngine/orchSections. Untouched.
//   • Every other node in a resolved body Part's tree (Demographics,
//     Specimens, Synoptic Summary, Sign-off, Clinical Info, and the non-AI
//     half of Comment) previously had NO rendering path anywhere in the
//     app — orchSections is populated exclusively by AI streaming
//     callbacks. This block renders those directly from the live Case and
//     respects labelConfig + showWhen, which is the actual Tier 1
//     acceptance criterion (customizations visibly appearing in output).
//
// Expression/binding paths in body Part templates ("patient.name",
// "order.fullAccession", etc.) are written against the live Case shape —
// NOT the AI-prompt-sanitised StructuredContext, which uses different
// field names (fullName not name, dateOfBirth not dob, no age, etc) by
// deliberate design. Resolution below uses caseData, mirroring the field
// mapping this component's own header/footer JSX already used. Fields a
// Part references but that aren't confirmed present on Case (e.g.
// specimen.laterality, patient.age, diagnostic.issuedDate) resolve to
// undefined and fall back to each node's own fallback string — that's a
// data-model gap to check against the real Case type, not a bug here.
//
// The synoptic-block marker node is the one exception: it needs the
// ID→label answer resolution contextBuilder.ts already does, so it reads
// from `structuredContext.synoptic.answers` instead of caseData.
// ─────────────────────────────────────────────────────────────────────────────

function getPath(obj: any, path: string): unknown {
  if (obj == null || !path) return undefined;
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), obj);
}

function interpolate(template: string, scope: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    const v = getPath(scope, path);
    return v == null || v === '' ? '' : String(v);
  });
}

// Real feature (Step 2): resolves one header/footer child node's text
// content for the focused, line-based header/footer renderer below —
// deliberately not a full renderNode recursion, since a header/footer's
// children are simple text lines (confirmed directly against every
// real seed part: expression-value and static-label only), not
// arbitrary report body content needing the full generic node-walk.
function renderTextLine(node: TemplateNode, scope: Record<string, any>): string | null {
  if (node.type === 'expression-value') {
    const text = interpolate(node.template, scope);
    return text.trim() ? text : (node.fallback ?? null);
  }
  if (node.type === 'static-label') {
    return node.text || null;
  }
  return null;
}

function evalClause(clause: ExpressionClause, scope: any): boolean {
  const actual = getPath(scope, clause.field);
  switch (clause.operator) {
    case '==':       return String(actual ?? '') === String(clause.value ?? '');
    case '!=':       return String(actual ?? '') !== String(clause.value ?? '');
    case '>':        return Number(actual) > Number(clause.value);
    case '<':        return Number(actual) < Number(clause.value);
    case '>=':       return Number(actual) >= Number(clause.value);
    case '<=':       return Number(actual) <= Number(clause.value);
    case 'notEmpty': return actual != null && String(actual).trim() !== '';
    case 'isEmpty':  return actual == null || String(actual).trim() === '';
    case 'contains':
      if (Array.isArray(actual)) return actual.map(String).includes(String(clause.value));
      return String(actual ?? '').includes(String(clause.value ?? ''));
    default: return true;
  }
}

function evalCondition(cond: ConditionalExpression | undefined, scope: any): boolean {
  if (!cond || !cond.clauses?.length) return true;
  const results = cond.clauses.map(c => evalClause(c, scope));
  return cond.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// Exported: also reused by OrchestratorSectionEditor.tsx to style the
// per-specimen Gross Description section headers in the editing view —
// same resolved style this file already applies to the read-only
// report, not a second, independently-derived one.
export function labelStyle(cfg?: LabelConfig): React.CSSProperties {
  // labelConfig is per-instance admin-configured data, not static design —
  // inline style here follows this codebase's existing convention for
  // genuinely dynamic values (mirrors mm-to-px / colSpan / fontSize
  // precedent already established elsewhere in the project).
  const style: React.CSSProperties = {};
  if (cfg?.transform && cfg.transform !== 'none') style.textTransform = cfg.transform;
  if (cfg?.weight) style.fontWeight = cfg.weight === 'bold' ? 700 : 400;
  if (cfg?.decoration && cfg.decoration !== 'none') style.textDecoration = cfg.decoration;
  if (cfg?.fontSize) style.fontSize = `${cfg.fontSize}px`;
  if (cfg?.fontFamily) style.fontFamily = cfg.fontFamily;
  return style;
}

const FieldRow: React.FC<{
  label: string;
  value: React.ReactNode;
  labelConfig?: LabelConfig;
  defaultPosition: 'above' | 'adjacent';
  nodeKey: string;
}> = ({ label, value, labelConfig, defaultPosition, nodeKey }) => {
  const position = labelConfig?.position ?? defaultPosition;
  if (position === 'none') {
    return <div key={nodeKey} className="rp-node-value-only">{value}</div>;
  }
  const lblStyle = labelStyle(labelConfig);
  return (
    <div key={nodeKey} className={`rp-node-field rp-node-field--${position}`}>
      <span className="rp-node-label" style={lblStyle}>{label}</span>
      <span className="rp-node-value">{value}</span>
    </div>
  );
};

/** Computes whole-years age as of today from an ISO date string. Returns undefined on anything unparseable rather than a wrong number. */
function computeAge(dateOfBirth: string | undefined): number | undefined {
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  // eslint-disable-next-line no-restricted-properties -- Real, honest justification: age-from-DOB compares two dates (now, dob) in the same, consistent local time - inherently viewer-relative, not a real, stored-event facility-timezone concern.
  let age = now.getFullYear() - dob.getFullYear();
  // Real, honest justification for both lines below: age-from-DOB
  // compares two dates (now, dob) in the same, consistent local time -
  // inherently viewer-relative, not a real, stored-event
  // facility-timezone concern.
  const hasNotHadBirthdayYet =
    // eslint-disable-next-line no-restricted-properties -- see real, honest justification above hasNotHadBirthdayYet
    now.getMonth() < dob.getMonth() ||
    // eslint-disable-next-line no-restricted-properties -- see real, honest justification above hasNotHadBirthdayYet
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (hasNotHadBirthdayYet) age -= 1;
  return age >= 0 ? age : undefined;
}

/** Builds the base data scope body Part templates resolve {{paths}} against — the live Case, not StructuredContext. See header comment above for why. */
export function buildRenderScope(caseData: Case | null): Record<string, any> {
  const patient  = caseData?.patient as any;
  const order    = caseData?.order as any;
  const accession = caseData?.accession as any;
  const diagnostic = (caseData as any)?.diagnostic ?? {};
  const specimens = (caseData?.specimens ?? []) as any[];

  return {
    patient: {
      name: patient ? `${patient.lastName ?? ''}, ${patient.firstName ?? ''}`.replace(/^, $/, '') : undefined,
      dob:  patient?.dateOfBirth
        ? new Date(patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : undefined,
      sex: patient?.sex,
      mrn: patient?.mrn,
      age: computeAge(patient?.dateOfBirth),
    },
    order: {
      fullAccession:      accession?.fullAccession ?? accession?.accessionNumber,
      requestingProvider: order?.requestingProvider,
      facilityName:       order?.facilityName,
      receivedDate:       order?.receivedDate
        ? new Date(order.receivedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : undefined,
      priority:           order?.priority,
      clinicalIndication: order?.clinicalIndication,
      assignedTo:         order?.assignedTo,
    },
    diagnostic: {
      issuedDate:        diagnostic?.issuedDate,
      countersignedBy:   diagnostic?.countersignedBy,
      countersignedAt:   diagnostic?.countersignedAt,
      clinicalNotes:     diagnostic?.clinicalNotes,
      comment:           diagnostic?.comment,
      diagnosticComment: diagnostic?.diagnosticComment,
    },
    specimens: specimens.map(s => ({
      label:      s.label ?? s.description,
      type:       s.type ?? s.specimenType,
      site:       s.site ?? s.anatomicSite,
      laterality: s.laterality,
      fixative:   s.fixative,
      receivedAt: s.receivedAt ?? s.collectionDate,
    })),
  };
}

interface Props {
  sections:    OrchestratorSection[];
  /** Every enabled body-role Part, full node tree, assembly order — drives
   *  the generic structural rendering below. AI sections within it still
   *  render from `sections` (see header comment). Defaults to [] so this
   *  component degrades gracefully if a call site hasn't been updated yet. */
  bodyAssembly?: BodyPartAssembly[];
  /** Real feature (Step 2), per direct confirmation — see
   *  contextBuilder.ts's resolveTemplateSections for the full
   *  rationale. At most one enabled slot each; renders in place of
   *  the hardcoded institution header/footer when present, falls
   *  back to the hardcoded version when a template hasn't configured
   *  one (or hasn't resolved yet). */
  headerAssembly?: BodyPartAssembly[];
  footerAssembly?: BodyPartAssembly[];
  /** Needed only for the synoptic-block marker node's resolved answers. */
  structuredContext?: StructuredContext | null;
  caseData:    Case | null;
  templateName?: string;
  resolvedBy?:   string;
  /** Real feature, per direct request — see ReportTemplate.documentStyle's
   *  own doc comment in reportPart.ts for the full rationale. Applied at
   *  each section's own container and left to cascade via ordinary CSS
   *  inheritance. */
  documentStyle?: { header?: LabelConfig; body?: LabelConfig; footer?: LabelConfig };
  // ── Cross-pane sync (three-column layout) ──────────────────────────────────
  // Clicking a section heading here notifies the parent, which updates the
  // shared activeSectionId — the right-hand editor then scrolls to match.
  activeSectionId?:       string | null;
  onSectionClick?:        (id: string) => void;
}

// ── Institution data (mirrors OrchestratorReportPanel logic) ─────────────────
// Exported so handleOrchPrint (SynopticReportPage.tsx) can build the same
// institution block for the PDF payload instead of re-deriving it a third
// time — this and buildRenderScope are now the single source of truth for
// Case → display-field mapping across both the on-screen preview and print.
export function getInstitution(originHospitalId?: string) {
  if (originHospitalId === 'HOSP-002') return {
    name:    'Manchester University NHS Foundation Trust',
    dept:    'Department of Anatomical Pathology',
    address: 'Oxford Road, Manchester M13 9WL, United Kingdom',
    phone:   '+44 161 276 1234',
  };
  if (originHospitalId === 'HOSP-003') return {
    name:    'PathScribe Reference Laboratory — West',
    dept:    'Department of Anatomical Pathology',
    address: '1234 Lab Drive, Suite 200, Tucson AZ 85701',
    phone:   '+1 520 555 0100',
  };
  return {
    name:    'PathScribe Reference Laboratory',
    dept:    'Department of Anatomical Pathology',
    address: '1234 Lab Drive, Suite 200, Tucson AZ 85701',
    phone:   '+1 520 555 0100',
  };
}

const ReportPreviewRenderer: React.FC<Props> = ({
  sections, bodyAssembly = [], headerAssembly = [], footerAssembly = [], structuredContext = null, caseData, templateName, resolvedBy, activeSectionId, onSectionClick, documentStyle,
}) => {
  const { t } = useTranslation();
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionsById = useMemo(() => new Map(sections.map(s => [s.id, s] as const)), [sections]);
  const baseScope = useMemo(() => buildRenderScope(caseData), [caseData]);

  // Auto-scroll to follow activeSectionId when it changes from elsewhere
  // (navigator click, or editing in the right-hand section editor)
  useEffect(() => {
    if (!activeSectionId) return;
    const el = sectionRefs.current[activeSectionId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeSectionId]);

  const accession  = caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? '';
  const patient    = caseData?.patient
    ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '';
  const mrn        = caseData?.patient?.mrn ?? '';
  const dob        = caseData?.patient?.dateOfBirth
    ? new Date(caseData.patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const sex        = caseData?.patient?.sex ?? '';
  const priority   = (caseData?.order as any)?.priority ?? '';
  const referring  = caseData?.order?.facilityName ?? '';
  const clinician  = caseData?.order?.requestingProvider ?? '';
  const inst       = getInstitution(caseData?.originHospitalId);

  // Real fix, found by testing live: baseScope (buildRenderScope) has
  // no institution key at all — the old hardcoded header/footer used
  // the inst variable above directly, so nothing ever needed one.
  // A real header-p1 part's expression-value children reference
  // {{institution.name}}/{{institution.department}}/etc. directly,
  // and were silently falling back to their generic defaults
  // ("PathScribe Laboratory") instead of this case's actual,
  // per-hospital institution data. Scoped to header/footer rendering
  // only, not merged into baseScope itself, since institution depends
  // on caseData.originHospitalId via getInstitution() — a separate
  // computation other baseScope consumers (e.g. the PDF payload's own
  // renderScope) don't currently share.
  const headerFooterScope = useMemo(() => ({
    ...baseScope,
    institution: { name: inst.name, department: inst.dept, address: inst.address, phone: inst.phone },
  }), [baseScope, inst]);

  // ── AI-narrative section — unchanged behaviour, just relocated into a
  //    function so the generic node walk below can call it inline where a
  //    SectionNode with ai.enabled === true is encountered. ──────────────
  const renderAiSection = (node: SectionNode): React.ReactNode => {
    const s = sectionsById.get(node.id);
    const label = node.printHeading ?? node.label;
    if (!s) {
      // Configured as an AI section but generation hasn't run yet for this
      // case — show the structural placeholder instead of nothing, since
      // bodyAssembly (and therefore this part) can now be visible before
      // "Generate Report" is ever clicked.
      return (
        <div key={node.id} id={`rp-section-${node.id}`} className="rp-section">
          <div className="rp-section-heading">{label}</div>
          <div className="rp-section-empty">{t('reportPreviewRenderer.notYetGenerated')}</div>
        </div>
      );
    }
    return (
      <div
        key={s.id}
        id={`rp-section-${s.id}`}
        ref={el => { sectionRefs.current[s.id] = el; }}
        className={`rp-section${activeSectionId === s.id ? ' rp-section--active' : ''}`}
        onClick={() => onSectionClick?.(s.id)}
      >
        <div className={`rp-section-heading${s.committed ? ' rp-section-heading--accepted' : s.userEdited ? ' rp-section-heading--edited' : ''}`}>
          {s.label}
          {s.committed && <span className="rp-section-badge rp-section-badge--accepted">{t('reportPreviewRenderer.badgeAccepted')}</span>}
          {!s.committed && s.userEdited && <span className="rp-section-badge rp-section-badge--edited">{t('reportPreviewRenderer.badgeEdited')}</span>}
          {!s.committed && !s.userEdited && s.aiGenerated && <span className="rp-section-badge rp-section-badge--ai">{t('reportPreviewRenderer.badgeAiDraft')}</span>}
        </div>
        {s.text ? (
          <div className="rp-section-body" dangerouslySetInnerHTML={{ __html: s.text }} />
        ) : (
          <div className="rp-section-empty">
            {s.required ? t('reportPreviewRenderer.requiredNotCompleted') : t('reportPreviewRenderer.noContent')}
          </div>
        )}
      </div>
    );
  };

  // ── Generic node-tree renderer — structural body content ──────────────
  const renderNode = (node: TemplateNode, scope: Record<string, any>, key: string): React.ReactNode => {
    if (node.showWhen && !evalCondition(node.showWhen, scope)) return null;

    // synoptic-block is a deliberate ad-hoc extension (see
    // mockReportPartService.ts) not present in the formal TemplateNode
    // union — handled before the typed switch below for that reason.
    if ((node as any).type === 'synoptic-block') {
      const answers = structuredContext?.synoptics?.flatMap(s => s.answers) ?? [];
      if (answers.length === 0) {
        return <div key={key} className="rp-node-empty">{t('reportPreviewRenderer.noSynopticData')}</div>;
      }
      return (
        <table key={key} className="rp-synoptic-table">
          <tbody>
            {answers.map(a => (
              <tr key={a.fieldId}>
                <td className="rp-synoptic-field">{a.fieldLabel}</td>
                <td className="rp-synoptic-value">{a.displayValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    switch (node.type) {
      case 'expression-value': {
        const text = interpolate(node.template, scope);
        const value = text.trim() ? text : (node.fallback ?? '');
        if (node.hideIfEmpty && !value) return null;
        return <FieldRow key={key} nodeKey={key} label={node.label} value={value} labelConfig={node.labelConfig} defaultPosition="adjacent" />;
      }

      case 'static-label': {
        const Tag: any = node.variant === 'h1' || node.variant === 'h2' || node.variant === 'h3' ? node.variant : 'div';
        const style: React.CSSProperties = {
          fontWeight: node.bold ? 700 : undefined,
          fontStyle:  node.italic ? 'italic' : undefined,
        };
        return (
          <Tag key={key} className={`rp-static-label rp-static-label--${node.variant ?? 'body'}`} style={style}>
            {node.text}
          </Tag>
        );
      }

      case 'paragraph': {
        // Only non-AI-writable paragraphs reach here in practice — AI
        // sections are intercepted at the parent 'section' case below and
        // never have their children walked individually.
        const raw  = node.bindingKey ? getPath(scope, node.bindingKey) : undefined;
        const html = (raw != null && String(raw).trim()) ? String(raw) : (node.freeformContent ?? '');
        if (node.hideIfEmpty && !html) return null;
        return (
          <FieldRow key={key} nodeKey={key} label={node.label} labelConfig={node.labelConfig} defaultPosition="above"
            value={<span dangerouslySetInnerHTML={{ __html: html || `<span class="rp-node-empty">${node.placeholder ?? '—'}</span>` }} />} />
        );
      }

      case 'dropdown': {
        const raw = getPath(scope, node.bindingKey);
        const values = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
        const labels = values.map(v => node.options.find(o => o.value === v)?.label ?? v);
        if (node.hideIfEmpty && labels.length === 0) return null;
        return <FieldRow key={key} nodeKey={key} label={node.label} value={labels.length ? labels.join(', ') : '—'} labelConfig={node.labelConfig} defaultPosition="adjacent" />;
      }

      case 'number': {
        const raw = getPath(scope, node.bindingKey);
        const display = raw != null && raw !== '' ? `${raw}${node.unit ? ` ${node.unit}` : ''}` : '—';
        return <FieldRow key={key} nodeKey={key} label={node.label} value={display} labelConfig={node.labelConfig} defaultPosition="adjacent" />;
      }

      case 'date': {
        const raw = getPath(scope, node.bindingKey);
        const display = raw ? new Date(String(raw)).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
        return <FieldRow key={key} nodeKey={key} label={node.label} value={display} labelConfig={node.labelConfig} defaultPosition="adjacent" />;
      }

      case 'computed':
        // No safe arbitrary-expression evaluator exists here — rendering
        // the raw expression string would be actively misleading on a
        // clinical report. Flagging via dash rather than guessing.
        return <FieldRow key={key} nodeKey={key} label={node.label} value="—" labelConfig={node.labelConfig} defaultPosition="adjacent" />;

      case 'image-embed': {
        const src = node.src ?? (node.bindingKey ? String(getPath(scope, node.bindingKey) ?? '') : '');
        if (!src) return null;
        return (
          <div key={key} className={`rp-image rp-image--${node.alignment ?? 'left'}`}>
            <img src={src} alt={node.alt ?? ''} width={node.width} height={node.height} />
            {node.caption && <div className="rp-image-caption">{node.caption}</div>}
          </div>
        );
      }

      case 'column-layout':
        return (
          <div key={key} className="rp-cols" style={{ display: 'grid', gridTemplateColumns: `repeat(${node.numColumns}, 1fr)`, gap: node.columnGap ?? 16 }}>
            {node.children.map((c, i) => renderNode(c, scope, `${key}-${i}`))}
          </div>
        );

      case 'section':
        if (node.ai?.enabled) return renderAiSection(node);
        return (
          <div key={key} className="rp-node-section">
            {node.printHeading && (
              // Real fix: previously hardcoded via rp-node-section-heading
              // alone, with node.labelConfig never read at all — even
              // though the admin editor now lets a template author
              // configure it (TemplateInspector.tsx) and BaseNode has
              // always carried the field. Same labelStyle() helper
              // FieldRow already uses for field labels below, applied
              // here as an inline override on top of the base CSS class
              // (not a replacement for it — the class still supplies
              // layout/spacing, labelConfig only overrides the
              // typographic properties an admin explicitly set).
              <div className="rp-node-section-heading" style={labelStyle(node.labelConfig)}>{node.printHeading}</div>
            )}
            {node.children.map((c, i) => renderNode(c, scope, `${key}-${i}`))}
          </div>
        );

      case 'repeat-group': {
        const items = getPath(scope, node.iterateOver);
        const list = Array.isArray(items) ? items : [];
        if (list.length === 0) return null;
        const alias = node.itemAlias ?? 'item';
        return (
          <React.Fragment key={key}>
            {list.map((item, idx) => (
              <div key={`${key}-${idx}`} className="rp-repeat-item">
                {node.children.map((c, i) => renderNode(c, { ...scope, [alias]: item }, `${key}-${idx}-${i}`))}
              </div>
            ))}
          </React.Fragment>
        );
      }

      case 'if-block': {
        const children = evalCondition(node.condition, scope) ? node.children : (node.elseChildren ?? []);
        if (!children.length) return null;
        return <React.Fragment key={key}>{children.map((c, i) => renderNode(c, scope, `${key}-${i}`))}</React.Fragment>;
      }

      case 'switch-block': {
        const match = node.cases.find(c => evalCondition(c.when, scope));
        const children = match ? match.children : (node.defaultChildren ?? []);
        if (!children.length) return null;
        return <React.Fragment key={key}>{children.map((c, i) => renderNode(c, scope, `${key}-${i}`))}</React.Fragment>;
      }

      // Real feature (Step 2), per direct confirmation — previously
      // guarded out entirely on the (then-correct) assumption that
      // header/footer nodes never reached this switch at all. Now
      // that resolveTemplateSections resolves header-p1/footer-p1
      // slots (see that function's own comment), these do appear —
      // rendered directly here rather than via the top-level
      // headerAssembly/footerAssembly.map special-case body uses,
      // since a header/footer's own flags (showLogo/showAccession/
      // showPatientName/showPageNumbers) need real handling a plain
      // node-walk wouldn't give them.
      case 'header': {
        const childLines = node.children
          .map(c => renderTextLine(c, scope))
          .filter((t): t is string => !!t);
        return (
          <div key={key} className="rp-inst-header">
            <div className="rp-inst-left">
              {childLines.map((line, i) => <div key={i} className={i === 0 ? 'rp-inst-name' : 'rp-inst-addr'}>{line}</div>)}
            </div>
            {(node.showLogo ?? true) && (
              <div className="rp-inst-right">
                <div className="rp-logo-text">PathScribe</div>
                <div className="rp-logo-sub">{t('reportPreviewRenderer.pathologyReportingTagline')}</div>
              </div>
            )}
          </div>
        );
      }
      case 'footer': {
        const childLines = node.children
          .map(c => renderTextLine(c, scope))
          .filter((t): t is string => !!t);
        return (
          <div key={key} className="rp-footer">
            {childLines.map((line, i) => <div key={i} className={i === 0 ? 'rp-footer-patient' : 'rp-footer-conf'}>{line}</div>)}
            {/* Real fix, found before this was ever tested live: page
                numbers are a print/pagination concept this
                continuous-scroll on-screen preview doesn't actually
                have — scope carries no real page.number/page.total,
                so interpolating node.pageNumberFormat here would
                silently render a broken-looking "Page  of " with
                empty values instead of anything useful. Shown as the
                institution name instead, same content the previous
                hardcoded footer always showed in this position. */}
            <div className="rp-footer-right">{inst.name}</div>
          </div>
        );
      }

      // Not exercised by any seed Part as of this change — rendering
      // nothing rather than guessing at an unverified format.
      case 'text-field':
      case 'page-break':
      case 'template-ref':
      default:
        return null;
    }
  };

  return (
    <div className="rp-page" style={labelStyle(documentStyle?.body)}>

      {/* ── Institution header ────────────────────────────────────────── */}
      <div style={labelStyle(documentStyle?.header)}>
        {headerAssembly.length > 0 ? (
          headerAssembly.map(part => (
            <React.Fragment key={part.slotId}>
              {part.nodes.map((node, i) => renderNode(node, headerFooterScope, `${part.slotId}-${i}`))}
            </React.Fragment>
          ))
        ) : (
          <div className="rp-inst-header">
            <div className="rp-inst-left">
              <div className="rp-inst-name">{inst.name}</div>
              <div className="rp-inst-dept">{inst.dept}</div>
              <div className="rp-inst-addr">{inst.address}</div>
              <div className="rp-inst-phone">{inst.phone}</div>
            </div>
            <div className="rp-inst-right">
              <div className="rp-logo-text">PathScribe</div>
              <div className="rp-logo-sub">{t('reportPreviewRenderer.pathologyReportingTagline')}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Patient / case header ─────────────────────────────────────── */}
      <div className="rp-case-header">
        <div className="rp-case-header-top">
          <div className="rp-accession" data-phi="accession">{accession}</div>
          {priority && (
            <span className={`rp-priority${priority === 'STAT' ? ' rp-priority--stat' : ''}`}>
              {priority}
            </span>
          )}
        </div>
        <div className="rp-patient-grid">
          {patient   && <><span className="rp-field-key">{t('reportPreviewRenderer.fieldPatient')}</span>    <span className="rp-field-val" data-phi="name">{patient}</span></>}
          {mrn       && <><span className="rp-field-key">{t('reportPreviewRenderer.fieldMrn')}</span>        <span className="rp-field-val" data-phi="mrn">{mrn}</span></>}
          {dob       && <><span className="rp-field-key">{t('reportPreviewRenderer.fieldDob')}</span><span className="rp-field-val">{dob}{sex ? ` · ${sex}` : ''}</span></>}
          {referring && <><span className="rp-field-key">{t('reportPreviewRenderer.fieldReferring')}</span>  <span className="rp-field-val">{referring}</span></>}
          {clinician && <><span className="rp-field-key">{t('reportPreviewRenderer.fieldClinician')}</span>  <span className="rp-field-val">{clinician}</span></>}
        </div>

        {/* Template indicator */}
        {templateName && (
          <div className="rp-template-bar">
            <span className="rp-template-label">{t('reportPreviewRenderer.reportTemplateLabel')}</span>
            <span className="rp-template-name">{templateName}</span>
            {resolvedBy && (
              <span className="rp-template-by">{t('reportPreviewRenderer.resolvedBy', { resolvedBy: resolvedBy.replace(/-/g, ' ') })}</span>
            )}
          </div>
        )}

        <div className="rp-case-rule" />
      </div>

      {/* ── Narrative + structural body content ─────────────────────────── */}
      <div className="rp-body">
        {bodyAssembly.length === 0 && sections.length === 0 ? (
          <div className="rp-empty">
            <div className="rp-empty-icon">✍️</div>
            <div className="rp-empty-text">{t('reportPreviewRenderer.noSectionsYet')}</div>
            <div className="rp-empty-hint">{t('reportPreviewRenderer.noSectionsHint')}</div>
          </div>
        ) : bodyAssembly.length > 0 ? (
          bodyAssembly.map(part => (
            <React.Fragment key={part.slotId}>
              {part.nodes.map((node, i) => renderNode(node, baseScope, `${part.slotId}-${i}`))}
            </React.Fragment>
          ))
        ) : (
          // bodyAssembly hasn't resolved yet (auto-resolve still in flight,
          // or it failed) but restored AI sections exist — show those
          // rather than nothing, same as this component's pre-bodyAssembly
          // behaviour.
          sections.map(s => (
            <div key={s.id} id={`rp-section-${s.id}`} className="rp-section">
              <div className="rp-section-heading">{s.label}</div>
              {s.text ? <div className="rp-section-body" dangerouslySetInnerHTML={{ __html: s.text }} /> : <div className="rp-section-empty">{t('reportPreviewRenderer.noContent')}</div>}
            </div>
          ))
        )}
      </div>

      {/* ── Report footer ─────────────────────────────────────────────── */}
      <div style={labelStyle(documentStyle?.footer)}>
        {footerAssembly.length > 0 ? (
          footerAssembly.map(part => (
            <React.Fragment key={part.slotId}>
              {part.nodes.map((node, i) => renderNode(node, headerFooterScope, `${part.slotId}-${i}`))}
            </React.Fragment>
          ))
        ) : (
          <div className="rp-footer">
            <div className="rp-footer-patient" data-phi="name">
              {patient}{mrn ? t('reportPreviewRenderer.footerMrn', { mrn }) : ''}{accession ? ` · ${accession}` : ''}
            </div>
            <div className="rp-footer-conf">{t('reportPreviewRenderer.confidentialFooter')}</div>
            <div className="rp-footer-right">{inst.name}</div>
          </div>
        )}
      </div>

    </div>
  );
};

export default ReportPreviewRenderer;
