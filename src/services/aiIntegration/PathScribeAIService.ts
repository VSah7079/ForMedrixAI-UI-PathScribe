// src/services/aiIntegration/PathScribeAIService.ts
// ─────────────────────────────────────────────────────────────
// Concrete AI integration that routes through the configured
// provider (Anthropic, OpenAI, Azure, Bedrock, or custom) via
// aiProviderService.
// ─────────────────────────────────────────────────────────────

import { IAIIntegrationService, AIProcessingOptions, AiFieldSuggestionResult, SynopticEvaluationInput, SynopticEvaluationResult } from './IAIIntegrationService';
import { callAi } from './aiProviderService';
import { resolveAiConfigOverrideForClient } from '../../components/Config/AI/resolveClientAiModel';
import { ServiceResult, VoiceMacro } from '../../types';
import { spellLangForJurisdiction } from '../../utils/formatDate';
import type { Jurisdiction } from '../../types/systemConfig';
import type { EditorTemplate } from '../../components/Config/Protocols/SynopticEditor';
import { buildSynopticNarrativePrompt } from '../../pages/SynopticReportPage/hooks/buildSynopticNarrativePrompt';

// ── Spelling check types ────────────────────────────────────────────────────

export interface SpellingFlag {
  /** The exact substring as it appears in the source text */
  original: string;
  /** Suggested correction */
  suggestion: string;
  /** Brief reason — e.g. "misspelling", "US spelling in en-GB report" */
  reason: string;
}

export interface SpellCheckResult {
  flags: SpellingFlag[];
  /** Text with all suggested corrections applied, for one-click "Apply all" */
  correctedText: string;
}

export class PathScribeAIService implements IAIIntegrationService {
  // apiKey kept in constructor signature for backwards compatibility,
  // but routing now goes through aiProviderService which reads from
  // aiProviderConfig (env vars → org config → user override).
  constructor(_apiKey?: string) {}

  // ── Transcript refinement ───────────────────────────────────
  // jurisdiction is optional for backwards compatibility with existing call
  // sites that haven't been updated yet — falls back to en-US conventions
  // (matching the prior hardcoded behaviour) when omitted.
  async refineTranscript(
    text: string,
    options?: AIProcessingOptions & { jurisdiction?: Jurisdiction; facilityId?: string }
  ): Promise<ServiceResult<string>> {
    try {
      const spellLang = spellLangForJurisdiction(options?.jurisdiction as Jurisdiction);
      const localeNote = spellLang.startsWith('en-GB')
        ? 'Use British English spelling conventions (e.g. "haemorrhage", "oesophagus", "anaesthesia", "colour").'
        : 'Use American English spelling conventions (e.g. "hemorrhage", "esophagus", "anesthesia", "color").';

      const { text: refined } = await callAi({
        system: `You are an expert Pathology Transcription Assistant. Correct phonetic errors, format measurements, and use proper pathology capitalisation. ${localeNote} Return ONLY the refined text.`,
        prompt: `Context: ${options?.context ?? 'Pathology Report'}\nRaw Text: "${text}"`,
        maxTokens: 500,
        configOverride: await resolveAiConfigOverrideForClient(options?.facilityId),
      });
      return { success: true, data: refined.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ── Macro suggestions ───────────────────────────────────────
  async suggestMacros(text: string, facilityId?: string): Promise<ServiceResult<Partial<VoiceMacro>[]>> {
    try {
      const { text: raw } = await callAi({
        system: 'You are a pathology macro assistant. Analyse text and suggest useful shorthand macros as JSON only — no markdown.',
        prompt: `Suggest macros for this pathology text. Return JSON array: [{"id":"m1","keyword":"XX","expansion":"Full text"}]\n\nText: "${text}"`,
        maxTokens: 300,
        configOverride: await resolveAiConfigOverrideForClient(facilityId),
      });
      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return { success: true, data: Array.isArray(parsed) ? parsed : [] };
    } catch {
      // Graceful fallback — macro suggestions are non-critical
      return { success: true, data: [] };
    }
  }

  // ── Synoptic field suggestions ──────────────────────────────
  async suggestSynopticFields(
    caseText: { gross: string; microscopic: string; ancillary: string },
    fields: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>,
    facilityId?: string
  ): Promise<ServiceResult<Record<string, AiFieldSuggestionResult>>> {
    try {
      const fieldList = fields.map(f => {
        const opts = f.options?.map(o => `${o.id} (${o.label})`).join(', ');
        return opts
          ? `- ${f.id} | ${f.label} | options: [${opts}]`
          : `- ${f.id} | ${f.label} | free text`;
      }).join('\n');

      const { text: raw } = await callAi({
        system: 'You are a pathology AI assistant. Return only valid JSON — no markdown, no preamble.',
        prompt: `Analyse the following pathology case and suggest answers for each synoptic field.

GROSS: ${caseText.gross}
MICROSCOPIC: ${caseText.microscopic}
ANCILLARY: ${caseText.ancillary}

FIELDS (id | label | allowed option ids):
${fieldList}

Return JSON: { "field_id": { "value": "option_id_or_string", "confidence": 85, "source": "short quote" } }
Rules:
- value must be an option id when options are listed
- confidence 0–100
- source ≤12 words from the case text
- Only include fields you can answer with confidence ≥30`,
        maxTokens: 1000,
        configOverride: await resolveAiConfigOverrideForClient(facilityId),
      });

      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return { success: true, data: parsed };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ── Narrative generation ────────────────────────────────────
  async generateNarrative(system: string, prompt: string, facilityId?: string): Promise<ServiceResult<string>> {
    try {
      const { text } = await callAi({ system, prompt, maxTokens: 1000, configOverride: await resolveAiConfigOverrideForClient(facilityId) });
      return { success: true, data: text };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Real, per direct guidance's own confirmed PS-275 scope (Phase 2,
   *  the reverse of PS-274's own Narrative -> Synoptic direction):
   *  builds the real, structured prompt from the case's own current
   *  synoptic answers (buildSynopticNarrativePrompt.ts \u2014 kept as its
   *  own pure, testable function, never inlined here) and reuses this
   *  class's own real generateNarrative(), never a second, duplicate
   *  callAi() call. */
  async generateNarrativeFromSynopticAnswers(
    template: EditorTemplate,
    answers: Record<string, string | string[]>,
    facilityId?: string,
  ): Promise<ServiceResult<string>> {
    const { system, prompt } = buildSynopticNarrativePrompt(template, answers);
    return this.generateNarrative(system, prompt, facilityId);
  }

  // ── Spelling check — Accept-time pass ───────────────────────
  // Called when the pathologist Accepts a section (or Accept All), not on
  // every keystroke — this is a deliberate, infrequent check, not live typing
  // feedback. Scoped tightly to spelling only (not grammar/style) so it
  // doesn't second-guess clinical phrasing choices. Locale-aware: flags
  // wrong-locale spelling (e.g. "hemorrhage" in a UK report) as well as
  // genuine misspellings and likely dictation/typo errors in medical terms.
  //
  // Returns an empty flags array (not an error) when the text is clean —
  // callers should treat "no flags" as the success/common case.
  async checkSpelling(
    text: string,
    jurisdiction?: Jurisdiction,
    facilityId?: string
  ): Promise<ServiceResult<SpellCheckResult>> {
    // Strip HTML tags before sending to the model — we only want to check
    // the visible text, and don't want the model trying to "fix" markup.
    const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!plainText) {
      return { success: true, data: { flags: [], correctedText: text } };
    }

    const spellLang  = spellLangForJurisdiction(jurisdiction as Jurisdiction);
    const localeNote = spellLang.startsWith('en-GB')
      ? 'This report should use British English spelling (e.g. "haemorrhage" not "hemorrhage", "oesophagus" not "esophagus", "anaesthesia" not "anesthesia", "colour" not "color"). Flag any American spellings as locale errors.'
      : 'This report should use American English spelling (e.g. "hemorrhage" not "haemorrhage", "esophagus" not "oesophagus", "anesthesia" not "anaesthesia", "color" not "colour"). Flag any British spellings as locale errors.';

    try {
      const { text: raw } = await callAi({
        system: `You are a meticulous medical proofreader specialising in anatomic pathology reports. Your ONLY job is to find spelling errors — genuine misspellings and wrong-locale spelling variants. ${localeNote}

Do NOT flag:
- Grammar, punctuation, or style choices
- Correctly-spelled medical/pathology terminology (e.g. "hemicolectomy", "adenocarcinoma", "lymphadenectomy" are correct — do not flag legitimate medical vocabulary as unfamiliar)
- Abbreviations, measurements, or specimen labels (A, B, C; cm; mm; pT3N1, etc.)
- Patient names or proper nouns

Return ONLY valid JSON, no markdown, no preamble, in this exact shape:
{"flags":[{"original":"exact text as it appears","suggestion":"corrected text","reason":"brief reason"}]}

If there are no spelling errors, return {"flags":[]}.`,
        prompt: `Check this pathology report text for spelling errors:\n\n"${plainText}"`,
        maxTokens: 800,
        configOverride: await resolveAiConfigOverrideForClient(facilityId),
      });

      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      const flags: SpellingFlag[] = Array.isArray(parsed?.flags) ? parsed.flags : [];

      // Build a corrected version of the ORIGINAL (HTML-bearing) text by
      // applying each flagged substring replacement — preserves markup
      // since we only replace the flagged plain-text substrings within it.
      let correctedText = text;
      for (const flag of flags) {
        if (flag.original && flag.suggestion && flag.original !== flag.suggestion) {
          correctedText = correctedText.split(flag.original).join(flag.suggestion);
        }
      }

      return { success: true, data: { flags, correctedText } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Interface requires this method, but per IAIIntegrationService's own
  // doc comment, it isn't actually the runtime path — the real
  // evaluateSynopticAssignment lives as a plain function in
  // mockCaseService.ts. Stubbed here the same way MockAIIntegrationService
  // stubs it, just to satisfy `implements IAIIntegrationService`. A real
  // Gemini-backed implementation would be new scope, not a type fix.
  async evaluateSynopticAssignment(
    _input: SynopticEvaluationInput
  ): Promise<ServiceResult<SynopticEvaluationResult>> {
    return { success: true, data: { changes: [], warnings: [] } };
  }
}
