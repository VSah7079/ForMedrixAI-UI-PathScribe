// src/orchestrator/orchestratorEngine.ts
// ─────────────────────────────────────────────────────────────
// Orchestrator Engine — Layer 3 of the Orchestrator stack.
// Refactored to use IAIProvider for full provider agnosticism.
//
// Responsibilities:
//   1. Load generation steps from narrativeTemplateConfig
//   2. For each enabled step (in order):
//        a. Build a step-specific prompt from StructuredContext
//        b. Call the active IAIProvider with streaming
//        c. Forward tokens to StreamingWriter → PathScribeEditor
//        d. Record to AIAuditLog for CAP/CLIA compliance
//        e. Handle errors, cancellation, and step isolation
//   3. Expose regenerateSection() for individual step refresh
//   4. Expose cancel() to abort in-flight generation
//
// The engine is stateless between runs — each call to run() or
// regenerateSection() creates a fresh execution context.
// ─────────────────────────────────────────────────────────────

import type { Editor }           from '@tiptap/react';
// StructuredContext now imported directly from contextBuilder.ts rather
// than hand-duplicated here. The previous inlined copy (this file's own
// comment called it "a future extraction") had already drifted out of
// sync with the real shape — it was missing narrativeTemplate entirely
// despite this file using context.narrativeTemplate?.sections directly,
// and it pre-dates the synoptic → synoptics (per-specimen array) change.
// Importing the real type closes that drift permanently rather than
// patching this one instance of it.
import type { StructuredContext } from './contextBuilder';
import type { IAIProvider }       from '../services/ai/IAIProvider';
import { AIProviderRegistry }     from '../services/ai/AIProviderRegistry';
import { AIAuditLog }             from '../services/ai/AIAuditLog';
import { StreamingWriter }         from '../components/Editor/tiptapBridge/streamingWriter';

const SYSTEM_PROMPT =
  'You are a board-certified pathologist assistant generating structured ' +
  'pathology report sections. Never invent clinical findings. Use formal ' +
  'medical prose. Generate only the requested section — no headers, no preamble.';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OrchestratorStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface SectionResult {
  sectionId:        string;
  sectionTitle:     string;
  status:           'completed' | 'skipped' | 'error' | 'cancelled';
  error?:           string;
  /** Full generated text for this section (populated in headless mode) */
  text?:            string;
  tokensGenerated?: number;
  /** Which provider + model generated this section */
  providerId?:      string;
  modelId?:         string;
  latencyMs?:       number;
}

export interface OrchestratorResult {
  status:       OrchestratorStatus;
  sections:     SectionResult[];
  startedAt:    string;
  completedAt?: string;
  error?:       string;
  /** Provider used for this run — recorded for audit/display */
  providerId:   string;
  modelId:      string;
}

export interface OrchestratorCallbacks {
  /** Called when a section begins generating */
  onSectionStart?: (sectionId: string, title: string, sourcePartId?: string) => void;
  /** Called per streaming token — use for headless/React-state streaming */
  onToken?: (sectionId: string, token: string) => void;
  /** Called when a section finishes */
  onSectionComplete?: (sectionId: string, result: SectionResult) => void;
  /** Called when the entire run completes */
  onComplete?: (result: OrchestratorResult) => void;
  /** Called on any error */
  onError?: (sectionId: string | null, error: string) => void;
  /** Called with status updates */
  onStatusChange?: (status: OrchestratorStatus) => void;
}

// ─────────────────────────────────────────────────────────────
// Prompt builder
// Constructs a section-specific AI prompt using the
// StructuredContext and the section's AI instructions.
// ─────────────────────────────────────────────────────────────

function buildSectionPrompt(
  _sectionId: string,
  sectionTitle: string,
  sectionInstruction: string,
  context: StructuredContext
): string {
  // Resolve synoptic answers into a readable list. Synoptics are a
  // specimen-level association, not case-level — a case can have several
  // (one per specimen per assigned template) — so each is broken out and
  // labeled by specimen rather than merged into one undifferentiated list.
  // (Previously read context.synoptic.answers — a single case-level object
  // that every real call site left empty; context.synoptics is the fixed,
  // per-specimen array. See contextBuilder.ts.)
  const synopticLines = context.synoptics.length
    ? context.synoptics.map(s => {
        const lines = s.answers
          .map(a => `    • ${a.fieldLabel}: ${a.displayValue}`)
          .join('\n') || '    (no answers recorded for this specimen)';
        return `  Specimen ${s.specimenId} — ${s.templateName}:\n${lines}`;
      }).join('\n\n')
    : '  (no synoptic data recorded)';

  // Build specimen summary
  const specimenLines = context.specimens
    .map((s, i) =>
      `  Specimen ${i + 1}: ${s.label} | Type: ${s.type} | Site: ${s.site}`
    )
    .join('\n') || '  (no specimens recorded)';

  return [
    `You are generating the "${sectionTitle}" section of a pathology report.`,
    '',
    `Section instruction: ${sectionInstruction}`,
    '',
    '─── CASE CONTEXT ───',
    // Real, per direct guidance's own priority follow-up on PHI
    // minimization ("apply this to everything, not just the current
    // piece"): patient full name and date of birth were previously
    // sent here, in every real narrative-generation call, to
    // whichever external LLM provider is configured - confirmed
    // directly, not assumed. Removed entirely; this task (writing a
    // pathology report section from specimen/gross/microscopic/
    // synoptic findings) never genuinely needed to know who the
    // patient is by name or when they were born. Sex is kept - it's
    // clinically relevant to certain findings and not a direct
    // identifier.
    `Sex:             ${context.patient.sex}`,
    `Accession:       ${context.accession.fullAccession}`,
    `Priority:        ${context.order.priority}`,
    `Requesting MD:   ${context.order.requestingProvider}`,
    `Clinical Ind:    ${context.order.clinicalIndication}`,
    '',
    '─── SPECIMENS ───',
    specimenLines,
    '',
    '─── GROSS DESCRIPTION ───',
    context.diagnostic.grossDescription,
    '',
    '─── MICROSCOPIC DESCRIPTION ───',
    context.diagnostic.microscopicDescription,
    '',
    '─── ANCILLARY STUDIES ───',
    context.diagnostic.ancillaryStudies,
    '',
    '─── SYNOPTIC DATA ───',
    synopticLines,
    '',
    '─── CODING ───',
    context.coding.icd10.length  ? `ICD-10:  ${context.coding.icd10.join(', ')}`  : '',
    context.coding.snomed.length ? `SNOMED:  ${context.coding.snomed.join(', ')}` : '',
    '',
    '─── RULES ───',
    '• Write only this section. Do not include other section headings.',
    '• Do not invent measurements, findings, or diagnoses.',
    '• Do not restate the section title.',
    '• Use formal clinical prose. Be concise.',
    '• If data is marked "(not recorded)", do not fabricate a value.',
    '',
    `Generate the ${sectionTitle} section now:`,
  ]
    .filter(line => line !== undefined)
    .join('\n');
}

// ─────────────────────────────────────────────────────────────
// OrchestratorEngine class
// ─────────────────────────────────────────────────────────────

export class OrchestratorEngine {
  private editor:    Editor | null | undefined;
  private context:   StructuredContext;
  private callbacks: OrchestratorCallbacks;
  private provider:  IAIProvider;
  private abortController: AbortController | null = null;
  private status: OrchestratorStatus = 'idle';

  /**
   * @param editor     TipTap editor instance — pass null/undefined for headless
   *                   (React-state) mode; tokens are then delivered via onToken callback.
   * @param context    Validated StructuredContext from contextBuilder
   * @param callbacks  Optional progress callbacks
   * @param provider   IAIProvider to use — defaults to AIProviderRegistry.getActive()
   *                   Pass a MockProvider explicitly for unit tests.
   */
  constructor(
    editor:    Editor | null | undefined,
    context:   StructuredContext,
    callbacks: OrchestratorCallbacks = {},
    provider?: IAIProvider,
  ) {
    this.editor    = editor;
    this.context   = context;
    this.callbacks = callbacks;
    this.provider  = provider ?? AIProviderRegistry.getActive();
  }

  // ── run ────────────────────────────────────────────────────
  // Full orchestration run. Processes all enabled sections
  // in order. Returns a result summary.

  async run(): Promise<OrchestratorResult> {
    const startedAt = new Date().toISOString();
    this.setStatus('running');

    this.abortController = new AbortController();
    const writer = this.editor
      ? new StreamingWriter(this.editor, { clearExisting: true, respectUserEdits: true })
      : null;

    // Use narrative template sections from context — driven by the resolved
    // report template for this case (via TemplateRoutingService → buildContext)
    const enabledSections = (this.context.narrativeTemplate?.sections ?? [])
      .filter((s: any) => s.enabled)
      .sort((a: any, b: any) => a.order - b.order);

    const results: SectionResult[] = [];

    for (const section of enabledSections) {
      if (this.abortController.signal.aborted) {
        results.push({
          sectionId:    section.id,
          sectionTitle: section.title,
          status:       'cancelled',
        });
        continue;
      }

      this.callbacks.onSectionStart?.(section.id, section.title, section.sourcePartId);

      const started = writer ? writer.beginSection(section.id, section.title) : true;

      if (!started) {
        const result: SectionResult = {
          sectionId:    section.id,
          sectionTitle: section.title,
          status:       'skipped',
          error:        'Section has user edits — skipped',
        };
        results.push(result);
        this.callbacks.onSectionComplete?.(section.id, result);
        continue;
      }

      let sectionText = '';

      try {
        const prompt = buildSectionPrompt(
          section.id,
          section.title,
          section.aiInstruction,
          this.context
        );

        const genResult = await this.provider.generateStream(
          {
            system:      SYSTEM_PROMPT,
            prompt,
            maxTokens:   1024,
            abortSignal: this.abortController.signal,
            sectionId:   section.id,
          },
          token => {
            sectionText += token;
            writer?.appendToken(section.id, token);
            this.callbacks.onToken?.(section.id, token);
          },
        );

        writer?.completeSection(section.id);

        const result: SectionResult = {
          sectionId:       section.id,
          sectionTitle:    section.title,
          status:          'completed',
          text:            sectionText,
          tokensGenerated: genResult.tokensGenerated,
          providerId:      genResult.providerId,
          modelId:         genResult.modelId,
          latencyMs:       genResult.latencyMs,
        };
        results.push(result);
        this.callbacks.onSectionComplete?.(section.id, result);

        // ── Audit trail ────────────────────────────────────
        AIAuditLog.record({
          caseId:          this.context.caseId,
          sectionId:       section.id,
          sectionTitle:    section.title,
          providerId:      genResult.providerId,
          modelId:         genResult.modelId,
          status:          'completed',
          tokensGenerated: genResult.tokensGenerated,
          latencyMs:       genResult.latencyMs,
        });

      } catch (err: any) {
        if (err?.name === 'AbortError') {
          writer?.cancelSection(section.id);
          const result: SectionResult = {
            sectionId:    section.id,
            sectionTitle: section.title,
            status:       'cancelled',
          };
          results.push(result);
          this.callbacks.onSectionComplete?.(section.id, result);
          break;
        }

        writer?.cancelSection(section.id);
        const errorMsg = err?.message ?? 'Unknown error';
        const result: SectionResult = {
          sectionId:    section.id,
          sectionTitle: section.title,
          status:       'error',
          error:        errorMsg,
        };
        results.push(result);
        this.callbacks.onError?.(section.id, errorMsg);
        this.callbacks.onSectionComplete?.(section.id, result);

        AIAuditLog.record({
          caseId:          this.context.caseId,
          sectionId:       section.id,
          sectionTitle:    section.title,
          providerId:      this.provider.providerId,
          modelId:         this.provider.modelId,
          status:          'error',
          tokensGenerated: 0,
          latencyMs:       0,
          error:           errorMsg,
        });
        // Continue to next section — section-level isolation
      }
    }

    const finalStatus: OrchestratorStatus =
      this.abortController.signal.aborted ? 'cancelled' : 'completed';

    this.setStatus(finalStatus);

    const result: OrchestratorResult = {
      status:      finalStatus,
      sections:    results,
      startedAt,
      completedAt: new Date().toISOString(),
      providerId:  this.provider.providerId,
      modelId:     this.provider.modelId,
    };

    this.callbacks.onComplete?.(result);
    return result;
  }

  // ── regenerateSection ──────────────────────────────────────
  // Regenerates a single section regardless of user-edit status.
  // Used when the pathologist clicks "Regenerate" on a section.

  async regenerateSection(sectionId: string): Promise<SectionResult> {
    const section = (this.context.narrativeTemplate?.sections ?? []).find((s: any) => s.id === sectionId);
    if (!section) {
      // Real fix (PS-317 — "Regen All" appearing to misplace/lose the
      // Gross Description): the real, root cause here is per-specimen
      // Gross Description sections (created by useReportGeneration.ts's
      // handleStartManualEntry — "the PA prefers to dictate the Gross
      // and then AI would update the attached synoptic") carrying a
      // composite id (`${baseSectionId}_${specimenId}`) that never
      // matches a real template section id — the template only ever
      // knows the base, case-wide id. Previously this returned a bare
      // error with NO callback fired at all, so "Regen All" (which
      // calls this once per currently-open section, including these)
      // would silently do nothing for every one of them — no error, no
      // content change, nothing to see — while every other, real
      // section right below/above it in the list genuinely refreshed.
      // There is no per-specimen-scoped AI generation implemented yet
      // (buildSectionPrompt below has no specimen-scoping parameter) —
      // building that is real, separate future work, not something to
      // fake here. Until then, the honest fix is a clear, specific
      // error surfaced through the same onError path every other
      // section failure already uses, not a silent no-op that looks
      // like the section vanished or moved.
      const composite = (this.context.narrativeTemplate?.sections ?? [])
        .find((s: any) => sectionId.startsWith(`${s.id}_`));
      const message = composite
        ? `"${composite.title}" for this specimen was entered manually and can't be regenerated by AI yet — edit it directly instead.`
        : 'Section not found in template';
      this.callbacks.onError?.(sectionId, message);
      return { sectionId, sectionTitle: composite?.title ?? '(unknown)', status: 'error', error: message };
    }

    this.abortController = new AbortController();

    const writer = this.editor
      ? new StreamingWriter(this.editor, { clearExisting: true, respectUserEdits: false })
      : null;

    this.callbacks.onSectionStart?.(section.id, section.title, section.sourcePartId);
    writer?.beginSection(section.id, section.title);

    let sectionText = '';

    try {
      const prompt = buildSectionPrompt(
        section.id,
        section.title,
        section.aiInstruction,
        this.context
      );

      const genResult = await this.provider.generateStream(
        {
          system:      SYSTEM_PROMPT,
          prompt,
          maxTokens:   1024,
          abortSignal: this.abortController.signal,
          sectionId:   section.id,
        },
        token => {
          sectionText += token;
          writer?.appendToken(section.id, token);
          this.callbacks.onToken?.(section.id, token);
        },
      );

      writer?.completeSection(section.id);

      const result: SectionResult = {
        sectionId:       section.id,
        sectionTitle:    section.title,
        status:          'completed',
        text:            sectionText,
        tokensGenerated: genResult.tokensGenerated,
        providerId:      genResult.providerId,
        modelId:         genResult.modelId,
        latencyMs:       genResult.latencyMs,
      };

      AIAuditLog.record({
        caseId:          this.context.caseId,
        sectionId:       section.id,
        sectionTitle:    section.title,
        providerId:      genResult.providerId,
        modelId:         genResult.modelId,
        status:          'completed',
        tokensGenerated: genResult.tokensGenerated,
        latencyMs:       genResult.latencyMs,
      });

      this.callbacks.onSectionComplete?.(section.id, result);
      return result;

    } catch (err: any) {
      writer?.cancelSection(section.id);
      const errorMsg = err?.message ?? 'Unknown error';
      const result: SectionResult = {
        sectionId:    section.id,
        sectionTitle: section.title,
        status:       'error',
        error:        errorMsg,
      };

      AIAuditLog.record({
        caseId:          this.context.caseId,
        sectionId:       section.id,
        sectionTitle:    section.title,
        providerId:      this.provider.providerId,
        modelId:         this.provider.modelId,
        status:          'error',
        tokensGenerated: 0,
        latencyMs:       0,
        error:           errorMsg,
      });

      this.callbacks.onError?.(section.id, errorMsg);
      return result;
    }
  }

  // ── cancel ─────────────────────────────────────────────────
  // Aborts the current in-flight run or section generation.

  cancel(): void {
    this.abortController?.abort();
    this.setStatus('cancelled');
  }

  getStatus(): OrchestratorStatus { return this.status; }

  /** Returns the active provider — useful for displaying engine info in the UI */
  getProvider(): IAIProvider { return this.provider; }

  private setStatus(status: OrchestratorStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }
}
