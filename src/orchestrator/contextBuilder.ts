// src/orchestrator/contextBuilder.ts
// ─────────────────────────────────────────────────────────────
// Context Builder — Layer 2 of the Orchestrator stack.
//
// Responsibility:
//   Takes raw inputs (caseData, synopticAnswers, templateConfig)
//   and produces a validated, normalized, AI-safe StructuredContext
//   object that the Orchestrator Engine consumes.
//
// Rules:
//   • Never passes raw Case fields directly to AI prompts
//   • Normalizes missing/null fields to explicit sentinel values
//   • Resolves synoptic answer IDs → human-readable labels
//   • Strips PII that is not clinically relevant to narrative generation
//   • Output shape is stable — Orchestrator Engine depends on it
//   • Routing resolution failures degrade to gold-standard + a warning —
//     report generation must never hard-fail because routing had a hiccup
// ─────────────────────────────────────────────────────────────

import type { Case, DiagnosticMetadata } from '../types/case/Case';
import type { EditorTemplate, EditorField, EditorSection } from '../components/Config/Protocols/SynopticEditor';
import { resolveReportTemplateAsync, deriveSubspecialtyFromProtocols, type TemplateRoutingResult } from '../services/reportTemplates/TemplateRoutingService';
import type { ReportTemplate } from '../types/reportPart';
import type { SectionNode, TemplateNode } from '../types/template';
import { mockReportTemplateService } from '../services/reportTemplates/mockReportTemplateService';
import { getOrgDocumentStyleDefault, getOrgHeaderStyleDefault, getOrgFooterStyleDefault } from '../components/Config/System/documentStyleConfig';
import { mockReportPartService } from '../services/reportParts/mockReportPartService';
import { getTemplate } from '../services/templates/templateService';

// narrativeTemplateRegistry.ts is retired as of this change (see
// NEXT_SESSION_BRIEF §1a). It is no longer imported anywhere in this file —
// do not reintroduce it, even as a fallback. The gold-standard template is
// now resolved through the same real Parts/Assembly path as every other
// template, not through the old static registry.

// ─────────────────────────────────────────────────────────────
// Minimal shape for the signed-in pathologist, used for sign-off
// context. Loosely typed pending the real User type from AuthContext —
// only the fields actually needed here are declared.
// ─────────────────────────────────────────────────────────────

export interface SigningUser {
  id?: string;
  name?: string;
  credentials?: string;
}

// ─────────────────────────────────────────────────────────────
// Output shape — StructuredContext
// This is the single validated JSON object the Orchestrator
// Engine and AI prompts consume. Shape is intentionally flat
// and explicit to prevent prompt injection / missing field bugs.
// ─────────────────────────────────────────────────────────────

export interface PatientContext {
  mrn: string;
  dateOfBirth: string;
  sex: string;
  fullName: string;
}

export interface SpecimenContext {
  id: string;
  label: string;
  type: string;
  site: string;
  collectionDate: string;
  quantity: string;
}

export interface AccessionContext {
  accessionNumber: string;
  fullAccession: string;
  prefix: string;
  year: number | null;
}

export interface OrderContext {
  priority: string;
  requestingProvider: string;
  clinicalIndication: string;
  receivedDate: string;
}

export interface DiagnosticContext {
  primaryDiagnosis: string;
  secondaryDiagnoses: string[];
  grossDescription: string;
  microscopicDescription: string;
  ancillaryStudies: string;
  synoptic: {
    tumorType: string;
    grade: string;
    size: string;
    margins: string;
    lymphovascularInvasion: string;
    biomarkers: {
      er: string;
      pr: string;
      her2: string;
      ki67: string;
    };
  };
}

export interface CodingContext {
  icd10: string[];
  snomed: string[];
  loinc: string[];
  cpt: string[];
}

/** A single resolved synoptic answer — ID resolved to label */
export interface ResolvedAnswer {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  value: string | string[];
  displayValue: string; // human-readable, IDs resolved to labels
}

/**
 * Resolved answers for ONE synoptic report instance, scoped to the
 * specimen it belongs to. Synoptics are a specimen-level association —
 * a case can carry several of these, one per specimen per assigned
 * template — distinct from narrativeTemplate below, which is case-level
 * (one Report Template document shell for the whole case, resolved by
 * TemplateRoutingService from across ALL of these instances' protocol
 * IDs combined).
 */
export interface SpecimenSynopticContext {
  specimenId: string;
  instanceId: string;
  templateId: string;
  templateName: string;
  answers: ResolvedAnswer[];
}

export interface NarrativeSectionContext {
  id: string;
  title: string;
  order: number;
  enabled: boolean;
  aiInstruction: string;
  /** ReportPart this section's SectionNode came from — traceability for debugging routing/assembly issues */
  sourcePartId?: string;
}

/**
 * One resolved, enabled body-role assembly slot, with its Part's full node
 * tree attached. This is the raw material a template-aware renderer needs
 * to reproduce labelConfig / showWhen / column layouts / repeat-groups —
 * none of which a flat NarrativeSectionContext list can carry, since most
 * body Parts (demographics, specimens, synoptic summary, sign-off) are not
 * AI-narrative sections at all. See NEXT_SESSION_BRIEF follow-up note on
 * ReportPreviewRenderer.tsx for why both shapes are exposed here.
 */
export interface BodyPartAssembly {
  slotId: string;
  partId: string;
  partName: string;
  order: number;
  nodes: TemplateNode[];
}

export interface TemplateContext {
  templateId: string;
  templateName: string;
  orchestratorEnabled: boolean;
  /** AI-generation sections only — feeds OrchestratorEngine. Derived from
   *  SectionNodes with ai.enabled === true, found anywhere in the resolved
   *  body Parts' node trees. */
  sections: NarrativeSectionContext[];
  /** Every enabled body-role Part in assembly order, full node tree intact.
   *  Feeds the report renderer once it's updated to walk real node trees
   *  instead of a flat AI-section list (see brief follow-up). */
  bodyAssembly: BodyPartAssembly[];
  /** Real feature (Step 2), per direct confirmation. At most one
   *  enabled header-p1/footer-p1 slot per template — confirmed
   *  directly, every real seed template already has these configured,
   *  pointing at Parts whose content (institution name/department/
   *  address/phone; patient line + confidentiality notice) exactly
   *  matches what ReportPreviewRenderer.tsx's hardcoded institution
   *  header/footer has always shown. This was previously resolved
   *  and immediately discarded — see resolveTemplateSections' own
   *  comment for the full history. */
  headerAssembly: BodyPartAssembly[];
  footerAssembly: BodyPartAssembly[];
  /** Real feature, per direct request — see ReportTemplate.documentStyle's
   *  own doc comment in types/reportPart.ts for the full rationale.
   *  Resolved straight from the real template below; undefined when a
   *  template hasn't configured one, same "inherit the pre-existing
   *  look" fallback as everywhere else in this resolution chain. */
  documentStyle?: ReportTemplate['documentStyle'];
}

export interface SignOffContext {
  pathologistId: string;
  pathologistName: string;
  credentials: string;
}

export interface StructuredContext {
  /** ISO timestamp of when this context was built */
  builtAt: string;

  /** Case identifier — safe to include in prompts */
  caseId: string;

  /** Reporting mode */
  reportingMode: string;

  patient: PatientContext;
  accession: AccessionContext;
  order: OrderContext;
  specimens: SpecimenContext[];
  diagnostic: DiagnosticContext;
  coding: CodingContext;
  /**
   * Per-specimen synoptic answers — one entry per SynopticReportInstance
   * on the case, NOT one case-level object. Renamed from the old singular
   * `synoptic` field to make this shape change impossible to miss; the old
   * field was always effectively empty in practice anyway (every real call
   * site passed a null template, so resolution always short-circuited to
   * []), so this is a strict improvement, not a behavior change anyone was
   * relying on.
   */
  synoptics: SpecimenSynopticContext[];
  narrativeTemplate: TemplateContext;
  signOff: SignOffContext;

  /** How narrativeTemplate.templateId was resolved — see TemplateRoutingService */
  routingResolvedBy: TemplateRoutingResult['resolvedBy'];
  /** True when routing matched multiple candidate templates (multi-organ case) */
  routingAmbiguous: boolean;
  /** All qualifying template IDs in priority order, when ambiguous */
  routingCandidateTemplateIds: string[];

  /** Validation warnings — non-fatal issues found during build */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────
// Sentinel value for missing optional fields
// ─────────────────────────────────────────────────────────────

const MISSING = '(not recorded)';

const safe = (v: string | null | undefined): string =>
  v && v.trim() ? v.trim() : MISSING;

const safeArr = (v: string[] | null | undefined): string[] =>
  Array.isArray(v) && v.length > 0 ? v : [];

// ─────────────────────────────────────────────────────────────
// Synoptic answer resolver
// Resolves option IDs → human-readable labels using the
// EditorTemplate field definitions.
// ─────────────────────────────────────────────────────────────

export function resolveAnswers(
  rawAnswers: Record<string, string | string[]>,
  synopticTemplate: EditorTemplate | null
): ResolvedAnswer[] {
  if (!synopticTemplate || !rawAnswers) return [];

  const allFields: EditorField[] = synopticTemplate.sections.flatMap(
    (sec: EditorSection) => sec.fields
  );

  return Object.entries(rawAnswers)
    .map(([fieldId, value]): ResolvedAnswer | null => {
      const field = allFields.find(f => f.id === fieldId);
      if (!field) return null;

      let displayValue: string;

      if (field.options && field.options.length > 0) {
        // Choice field — resolve IDs to labels
        const ids = Array.isArray(value) ? value : [value];
        const labels = ids.map(id => {
          const opt = field.options.find(o => o.id === id);
          return opt?.label ?? id;
        });
        displayValue = labels.join(', ');
      } else {
        // Free text / numeric
        displayValue = Array.isArray(value) ? value.join(', ') : value;
      }

      return {
        fieldId,
        fieldLabel: field.label,
        fieldType: field.type,
        value,
        displayValue,
      };
    })
    .filter((r): r is ResolvedAnswer => r !== null);
}

// ─────────────────────────────────────────────────────────────
// Real Parts/Assembly resolution — replaces narrativeTemplateRegistry
//
// Fetches the resolved ReportTemplate, walks its enabled body-role
// assembly slots in assembly order, fetches each referenced ReportPart,
// and derives:
//   • sections     — every SectionNode with ai.enabled === true, in
//                     document order, for the Orchestrator Engine to
//                     generate prose for.
//   • bodyAssembly — the full node tree for every enabled body Part,
//                     for a template-aware renderer to walk directly.
//
// No fallback to the old registry, ever. A fetch failure here degrades
// to resolving 'tmpl-gold-standard' through this exact same function —
// consistent with the existing routing-failure degradation pattern
// below, and confirming gold-standard is real Parts/Assembly too, not
// a hardcoded special case.
// ─────────────────────────────────────────────────────────────

function isSectionNode(n: TemplateNode): n is SectionNode {
  return n.type === 'section';
}

function hasChildren(n: TemplateNode): n is TemplateNode & { children: TemplateNode[] } {
  return Array.isArray((n as { children?: unknown }).children);
}

/** Recursively collects every SectionNode with ai.enabled === true, in document order. */
function collectAiSections(nodes: TemplateNode[]): SectionNode[] {
  const found: SectionNode[] = [];
  for (const n of nodes) {
    if (isSectionNode(n)) {
      if (n.ai?.enabled) found.push(n);
      found.push(...collectAiSections(n.children));
    } else if (hasChildren(n)) {
      found.push(...collectAiSections(n.children));
    }
  }
  return found;
}

interface ResolvedTemplateSections {
  template: ReportTemplate | null;
  sections: NarrativeSectionContext[];
  bodyAssembly: BodyPartAssembly[];
  headerAssembly: BodyPartAssembly[];
  footerAssembly: BodyPartAssembly[];
}

async function resolveTemplateSections(templateId: string): Promise<ResolvedTemplateSections> {
  const templateRes = await mockReportTemplateService.getById(templateId);
  if (templateRes.ok === false) {
    const errMsg: string = templateRes.error;
    throw new Error(`Report template '${templateId}' not found: ${errMsg}`);
  }
  const template = templateRes.data;

  const bodySlots = (template.assembly ?? [])
    .filter(s => s.enabled && s.role === 'body')
    .slice()
    .sort((a, b) => a.order - b.order);

  // Real feature (Step 2): header-p1/footer-p1 slots have always existed
  // in every real template's assembly — confirmed directly, every
  // seed template already has them configured, pointing at real Parts
  // whose content (institution name/department/address/phone;
  // patient line + confidentiality notice) exactly matches what the
  // hardcoded institution header/footer in ReportPreviewRenderer.tsx
  // has always shown. This resolution simply never looked at them
  // before. Page-1 scope only, deliberately — pages2plus is a
  // pagination concept the continuous-scroll on-screen preview
  // doesn't have; that's the separate PDF service's concern.
  const headerSlot = (template.assembly ?? []).find(s => s.enabled && s.role === 'header-p1');
  const footerSlot = (template.assembly ?? []).find(s => s.enabled && s.role === 'footer-p1');

  if (bodySlots.length === 0 && !headerSlot && !footerSlot) {
    return { template, sections: [], bodyAssembly: [], headerAssembly: [], footerAssembly: [] };
  }

  const allSlotPartIds = [
    ...bodySlots.map(s => s.partId),
    ...(headerSlot ? [headerSlot.partId] : []),
    ...(footerSlot ? [footerSlot.partId] : []),
  ];
  const partsRes = await mockReportPartService.getByIds(allSlotPartIds);
  if (partsRes.ok === false) {
    const errMsg: string = partsRes.error;
    throw new Error(`Failed to load report parts for template '${templateId}': ${errMsg}`);
  }
  const partsById = new Map(partsRes.data.map(p => [p.id, p] as const));

  const bodyAssembly: BodyPartAssembly[] = [];
  const sections: NarrativeSectionContext[] = [];
  let sectionOrder = 0;

  for (const slot of bodySlots) {
    const part = partsById.get(slot.partId);
    if (!part) continue; // referenced part missing/archived — skip the slot, don't hard-fail the report

    bodyAssembly.push({
      slotId:   slot.slotId,
      partId:   part.id,
      partName: part.name,
      order:    slot.order,
      nodes:    part.nodes ?? [],
    });

    for (const sec of collectAiSections(part.nodes ?? [])) {
      sections.push({
        id:            sec.id,
        title:         sec.printHeading ?? sec.label,
        order:         sectionOrder++,
        enabled:       true,
        aiInstruction: sec.ai?.systemInstruction ?? '',
        sourcePartId:  part.id,
      });
    }
  }

  // Header/footer are structurally different from body — at most one
  // enabled slot per role (no repeat-group / multi-part concept the
  // way body has several sections), so a plain array rather than
  // reusing BodyPartAssembly's order-of-many shape. Missing/archived
  // part → same graceful skip as body above, not a hard failure.
  const headerAssembly: BodyPartAssembly[] = [];
  if (headerSlot) {
    const part = partsById.get(headerSlot.partId);
    if (part) headerAssembly.push({ slotId: headerSlot.slotId, partId: part.id, partName: part.name, order: 0, nodes: part.nodes ?? [] });
  }
  const footerAssembly: BodyPartAssembly[] = [];
  if (footerSlot) {
    const part = partsById.get(footerSlot.partId);
    if (part) footerAssembly.push({ slotId: footerSlot.slotId, partId: part.id, partName: part.name, order: 0, nodes: part.nodes ?? [] });
  }

  return { template, sections, bodyAssembly, headerAssembly, footerAssembly };
}

// ─────────────────────────────────────────────────────────────
// Resolves EVERY specimen-level synoptic instance on the case, not just
// one. Each instance fetches its own EditorTemplate (instances can use
// different templates from each other) and resolves its own answers
// independently. A failure resolving one instance produces a warning and
// an empty-answers entry for THAT instance only — it does not prevent
// the other instances, or the rest of context-building, from succeeding.
// Falls back to the legacy single synopticAnswers/synopticTemplateId
// fields (Case.ts: "kept for backwards compat") only when
// synopticReports[] is empty/missing, per Case.ts's own documented intent
// that new code should prefer synopticReports[].
// ─────────────────────────────────────────────────────────────

async function resolveAllSpecimenSynoptics(
  caseData: Case,
  warnings: string[],
): Promise<SpecimenSynopticContext[]> {
  const reports = caseData.synopticReports ?? [];

  if (reports.length === 0) {
    // Legacy fallback — pre-synopticReports[] cases
    const legacyTemplateId = caseData.synopticTemplateId;
    const legacyAnswers    = caseData.synopticAnswers;
    if (!legacyTemplateId || !legacyAnswers) return [];

    try {
      const detail = await getTemplate(legacyTemplateId);
      const resolved = resolveAnswers(legacyAnswers, detail.template);
      return [{
        specimenId:   caseData.specimens?.[0]?.id ?? MISSING,
        instanceId:   'legacy',
        templateId:   legacyTemplateId,
        templateName: detail.name,
        answers:      resolved,
      }];
    } catch (e) {
      warnings.push(
        `Legacy synoptic template '${legacyTemplateId}' could not be resolved ` +
        `(${(e as Error)?.message ?? 'unknown error'}) — no synoptic answers in context`
      );
      return [];
    }
  }

  const results = await Promise.all(reports.map(async (report): Promise<SpecimenSynopticContext> => {
    try {
      const detail = await getTemplate(report.templateId);
      const resolved = resolveAnswers(report.answers ?? {}, detail.template);
      return {
        specimenId:   report.specimenId,
        instanceId:   report.instanceId,
        templateId:   report.templateId,
        templateName: detail.name,
        answers:      resolved,
      };
    } catch (e) {
      warnings.push(
        `Synoptic template '${report.templateId}' for specimen '${report.specimenId}' ` +
        `could not be resolved (${(e as Error)?.message ?? 'unknown error'}) — ` +
        `that specimen's synoptic answers are missing from context`
      );
      return {
        specimenId:   report.specimenId,
        instanceId:   report.instanceId,
        templateId:   report.templateId,
        templateName: report.templateName ?? report.templateId,
        answers:      [],
      };
    }
  }));

  return results;
}

// ─────────────────────────────────────────────────────────────
// buildContext — main export
// ─────────────────────────────────────────────────────────────

export async function buildContext(
  caseData: Case,
  signingUser?: SigningUser | null,
  /**
   * Pathologist's manual template override (Change ▾ in the UI). When set
   * and different from the auto-resolved template, this ID is used instead
   * — resolved through the exact same real Parts/Assembly path, not a
   * second copy of the logic at the call site. Previously SynopticReportPage
   * re-derived narrativeTemplate itself via the now-retired registry for
   * this case; that divergent path is gone — this is the only place
   * template→sections resolution happens.
   */
  templateIdOverride?: string,
): Promise<StructuredContext> {
  const warnings: string[] = [];

  // ── Patient ──────────────────────────────────────────────
  const patient = caseData.patient;
  if (!patient) warnings.push('Patient data is missing');

  const patientContext: PatientContext = {
    mrn:         safe(patient?.mrn),
    dateOfBirth: safe(patient?.dateOfBirth),
    sex:         safe(patient?.sex),
    fullName:    patient
      ? [patient.firstName, patient.lastName].filter(Boolean).join(' ') || MISSING
      : MISSING,
  };

  // ── Accession ─────────────────────────────────────────────
  const acc = caseData.accession;
  if (!acc?.accessionNumber) warnings.push('Accession number is missing');

  const accessionContext: AccessionContext = {
    accessionNumber: safe(acc?.accessionNumber),
    fullAccession:   safe(acc?.fullAccession ?? acc?.accessionNumber),
    prefix:          safe(acc?.accessionPrefix),
    year:            acc?.accessionYear ?? null,
  };

  // ── Order ─────────────────────────────────────────────────
  const order = caseData.order;
  const orderContext: OrderContext = {
    priority:           safe(order?.priority),
    requestingProvider: safe(order?.requestingProvider),
    clinicalIndication: safe(order?.clinicalIndication),
    receivedDate:       safe(order?.receivedDate),
  };

  // ── Specimens ─────────────────────────────────────────────
  const specimens: SpecimenContext[] = (caseData.specimens ?? []).map(spec => ({
    id:             safe(spec.id),
    label:          safe((spec as any).label ?? (spec as any).description),
    type:           safe((spec as any).type ?? (spec as any).specimenType),
    site:           safe((spec as any).site ?? (spec as any).anatomicSite),
    collectionDate: safe((spec as any).collectionDate),
    quantity:       safe((spec as any).quantity),
  }));

  if (specimens.length === 0) warnings.push('No specimens found on case');

  // ── Diagnostic ────────────────────────────────────────────
  const dx: DiagnosticMetadata = caseData.diagnostic ?? {};
  const syn = dx.synoptic ?? {};

  const diagnosticContext: DiagnosticContext = {
    primaryDiagnosis:      safe(dx.primaryDiagnosis),
    secondaryDiagnoses:    safeArr(dx.secondaryDiagnoses),
    grossDescription:      safe(dx.grossDescription),
    microscopicDescription: safe(dx.microscopicDescription),
    ancillaryStudies:      safe(dx.ancillaryStudies),
    synoptic: {
      tumorType:               safe(syn.tumorType),
      grade:                   safe(syn.grade),
      size:                    safe(syn.size),
      margins:                 safe(syn.margins),
      lymphovascularInvasion:  safe(syn.lymphovascularInvasion),
      biomarkers: {
        er:   safe(syn.biomarkers?.er),
        pr:   safe(syn.biomarkers?.pr),
        her2: safe(syn.biomarkers?.her2),
        ki67: safe(syn.biomarkers?.ki67),
      },
    },
  };

  // ── Coding ────────────────────────────────────────────────
  const coding = caseData.coding ?? {};
  const codingContext: CodingContext = {
    icd10:  safeArr(coding.icd10),
    snomed: safeArr(coding.snomed),
    loinc:  safeArr(coding.loinc),
    cpt:    safeArr(coding.cpt),
  };

  // ── Synoptic answers — per specimen, not case-level ───────
  const specimenSynoptics = await resolveAllSpecimenSynoptics(caseData, warnings);

  // ── Narrative template — resolved via TemplateRoutingService ──
  // Pass 0 (Client Override) uses order.clientId — a real, stable ID.
  // Pass 0b (Physician Preference) now prefers order.orderingPhysicianId —
  // a real, stable ID matching the Physician Preferences admin screen — and
  // falls back to order.requestingProvider (a display name) only when that
  // field hasn't been populated upstream yet for this case.
  // Pass 2 (Subspecialty Fallback) now prefers Case.subspecialtyId when set,
  // and falls back to deriving a subspecialty from the case's synoptic
  // protocol ID(s) when it isn't — see PROTOCOL_TO_SUBSPECIALTY in
  // TemplateRoutingService.ts. Cases with neither subspecialtyId nor a
  // recognized protocol still fall through cleanly to Pass 3 (Gold Standard).
  const synopticTemplateIds = Array.from(new Set([
    ...((caseData.synopticReports ?? []).map(r => r.templateId).filter(Boolean)),
    ...(caseData.synopticTemplateId ? [caseData.synopticTemplateId] : []),
  ]));

  const subspecialtyId = caseData.subspecialtyId
    ?? deriveSubspecialtyFromProtocols(synopticTemplateIds);

  let routingResult: TemplateRoutingResult;
  try {
    routingResult = await resolveReportTemplateAsync({
      synopticTemplateIds,
      performingClientId:  caseData.order?.clientId,
      orderingPhysicianId: caseData.order?.orderingPhysicianId ?? caseData.order?.requestingProvider,
      subspecialtyId,
    });
  } catch (e) {
    // Routing must never hard-fail report generation — degrade to
    // gold-standard and surface the problem as a warning instead.
    warnings.push(`Template routing failed (${(e as Error)?.message ?? 'unknown error'}) — using gold-standard template`);
    routingResult = {
      templateId: 'tmpl-gold-standard',
      ambiguous:  false,
      candidates: ['tmpl-gold-standard'],
      resolvedBy: 'gold-standard',
    };
  }

  if (routingResult.ambiguous) {
    warnings.push(
      `Template routing matched multiple candidate templates (${routingResult.candidates.join(', ')}) — ` +
      `using ${routingResult.templateId}. Multi-organ case may need the pathologist to confirm via Change ▾.`
    );
  }

  const effectiveTemplateId = templateIdOverride ?? routingResult.templateId;
  if (templateIdOverride && templateIdOverride !== routingResult.templateId) {
    warnings.push(
      `Pathologist override: using template '${templateIdOverride}' instead of auto-resolved '${routingResult.templateId}'`
    );
  }

  let resolved: ResolvedTemplateSections;
  try {
    resolved = await resolveTemplateSections(effectiveTemplateId);
  } catch (e) {
    warnings.push(
      `Template/Part resolution failed for '${effectiveTemplateId}' ` +
      `(${(e as Error)?.message ?? 'unknown error'}) — falling back to gold-standard template`
    );
    try {
      resolved = await resolveTemplateSections('tmpl-gold-standard');
    } catch (e2) {
      // Both the routed template AND gold-standard failed to resolve via
      // Parts/Assembly (e.g. mock service unavailable). There is no
      // further fallback — surface an empty narrative rather than silently
      // reintroducing the retired registry.
      warnings.push(
        `Gold-standard template also failed to resolve (${(e2 as Error)?.message ?? 'unknown error'}) — narrative will be empty`
      );
      resolved = { template: null, sections: [], bodyAssembly: [], headerAssembly: [], footerAssembly: [] };
    }
  }

  const templateContext: TemplateContext = {
    templateId:           resolved.template?.id   ?? effectiveTemplateId,
    templateName:         resolved.template?.name ?? effectiveTemplateId,
    orchestratorEnabled:  resolved.template?.orchestrationEnabled ?? false,
    sections:             resolved.sections,
    bodyAssembly:         resolved.bodyAssembly,
    headerAssembly:       resolved.headerAssembly,
    footerAssembly:       resolved.footerAssembly,
    // Real feature, per direct request: template override wins when a
    // template has explicitly configured its own style for a given
    // category; otherwise fall through to that category's org-wide
    // default (documentStyleConfig.ts). All three layers end up in
    // the same resolved field here so ReportPreviewRenderer.tsx never
    // needs to know which layer a style actually came from — it just
    // applies whatever's resolved.
    documentStyle: {
      header: resolved.template?.documentStyle?.header ?? getOrgHeaderStyleDefault(),
      body:   resolved.template?.documentStyle?.body   ?? getOrgDocumentStyleDefault(),
      footer: resolved.template?.documentStyle?.footer ?? getOrgFooterStyleDefault(),
    },
  };

  // ── Sign-off ───────────────────────────────────────────────
  const signOffContext: SignOffContext = {
    pathologistId:   safe(signingUser?.id),
    pathologistName: safe(signingUser?.name),
    credentials:     safe(signingUser?.credentials),
  };

  return {
    builtAt:          new Date().toISOString(),
    caseId:           caseData.id,
    reportingMode:    caseData.reportingMode ?? 'orchestrator',
    patient:          patientContext,
    accession:        accessionContext,
    order:            orderContext,
    specimens,
    diagnostic:       diagnosticContext,
    coding:           codingContext,
    synoptics:        specimenSynoptics,
    narrativeTemplate: templateContext,
    signOff:          signOffContext,
    routingResolvedBy:           routingResult.resolvedBy,
    routingAmbiguous:             routingResult.ambiguous,
    routingCandidateTemplateIds: routingResult.candidates,
    warnings,
  };
}

// Phase D of the biomarker display work. Filters
// resolveAnswers' output down to just the fields belonging to a template's
// dedicated "biomarkers" section, if it has one -- generic and
// template-agnostic by design: works automatically for any template with
// a biomarkers section (present or future), without needing per-template
// display logic anywhere else in the app. Returns [] for templates with
// no biomarkers section (most of the 19 generic templates don't have one
// yet) or with no answered marker fields.
export interface MarkerAnswer extends ResolvedAnswer {
  markerGroup: string;
}

export function getMarkersFromAnswers(
  rawAnswers: Record<string, string | string[]>,
  synopticTemplate: EditorTemplate | null
): MarkerAnswer[] {
  if (!synopticTemplate) return [];
  const biomarkerSection = synopticTemplate.sections.find(sec => sec.id === 'biomarkers');
  if (!biomarkerSection) return [];
  // Falls back to the field's own label if markerGroup isn't set, so
  // older/untagged templates still degrade gracefully (each such field
  // just becomes its own single-field "group") rather than breaking.
  const fieldGroupMap = new Map(biomarkerSection.fields.map(f => [f.id, f.markerGroup ?? f.label]));
  return resolveAnswers(rawAnswers, synopticTemplate)
    .filter(r => fieldGroupMap.has(r.fieldId))
    .map(r => ({ ...r, markerGroup: fieldGroupMap.get(r.fieldId)! }));
}
